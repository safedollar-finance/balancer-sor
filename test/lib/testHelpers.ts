import { JsonRpcProvider } from '@ethersproject/providers';
import { BigNumber } from 'bignumber.js';
import * as sorv1 from '@balancer-labs/sor';
import { BigNumber as v1BigNumber } from 'v1bignumber.js';
import * as sorv2 from '../../src';
import {
    SubGraphPoolsBase,
    SubgraphPoolBase,
    Swap,
    DisabledToken,
    DisabledOptions,
    SubGraphToken,
    PoolDictionary,
    SwapPairType,
    NewPath,
    SwapTypes,
    SwapInfo,
    PoolFilter,
} from '../../src/types';
import customMultiAbi from '../abi/customMulticall.json';
import { SubGraphPools as SubGraphPoolsV1 } from '@balancer-labs/sor/dist/types';
import { BaseProvider } from '@ethersproject/providers';
import { bnum, scale } from '../../src/bmath';
import { hashMessage } from '@ethersproject/hash';
import * as fs from 'fs';
import { readdir } from 'fs/promises';
import { performance } from 'perf_hooks';
import { assert, expect } from 'chai';
import { getAddress } from '@ethersproject/address';
import { Contract } from '@ethersproject/contracts';
// Mainnet reference tokens with addresses & decimals
import WeightedTokens from '../testData/eligibleTokens.json';
import StableTokens from '../testData/stableTokens.json';
import { filterPoolsOfInterest, filterHopPools } from '../../src/pools';
import { calculatePathLimits, smartOrderRouter } from '../../src/sorClass';
import { formatSwaps } from '../../src/helpersClass';

// Just for testing weighted helpers:
import { BPTForTokensZeroPriceImpact } from '../../src/frontendHelpers/weightedHelpers';

// These types are used for V1 compare
interface Profiling {
    onChainBalances: boolean;
}

interface SubgraphPoolsV1 {
    pools: SubGraphPoolV1[];
}

export interface SubGraphPoolV1 {
    id: string;
    swapFee: string;
    totalWeight: string;
    totalShares: string;
    tokens: SubGraphTokenV1[];
    tokensList: string[];
}

export interface SubGraphTokenV1 {
    address: string;
    balance: string;
    decimals: string;
    denormWeight: string;
}

/*
Helper to format V2 pools to V1 pool format.
Only weighted pools with balance.
Scales from normalised field values.
Changes weight field to denormWeight.
*/
function formatToV1schema(poolsV2: SubGraphPoolsBase): SubgraphPoolsV1 {
    let weightedPools: SubGraphPoolsBase = { pools: [] };

    for (let pool of poolsV2.pools) {
        // Only check first balance since AFAIK either all balances are zero or none are:
        if (pool.tokens.length != 0)
            if (pool.tokens[0].balance != '0')
                if (pool.poolType !== 'Stable' && pool.poolType !== 'Element')
                    weightedPools.pools.push(pool); // Do not include element pools
    }
    const poolsv1: SubGraphPoolV1[] = [];

    for (let i = 0; i < weightedPools.pools.length; i++) {
        const v1Pool: SubGraphPoolV1 = formatToV1Pool(weightedPools.pools[i]);
        poolsv1.push(v1Pool);
    }

    return { pools: poolsv1 };
}

function formatToV1Pool(pool: SubgraphPoolBase): SubGraphPoolV1 {
    const v1tokens: SubGraphTokenV1[] = [];
    pool.tokens.forEach(token => {
        v1tokens.push({
            address: token.address,
            balance: scale(
                bnum(token.balance),
                Number(token.decimals)
            ).toString(),
            decimals: token.decimals.toString(),
            denormWeight: scale(bnum(token.weight), 18).toString(),
        });
    });

    const v1Pool: SubGraphPoolV1 = {
        id: pool.id,
        swapFee: scale(bnum(pool.swapFee), 18).toString(),
        totalWeight: scale(bnum(pool.totalWeight), 18).toString(),
        totalShares: pool.totalShares,
        tokensList: pool.tokensList,
        tokens: v1tokens,
    };

    return v1Pool;
}

// Filters for only pools with balance and returns token list too.
export function filterPoolsAndTokens(
    allPools: SubGraphPoolsBase,
    disabledTokens: DisabledToken[] = []
): [Set<unknown>, SubGraphPoolsBase] {
    let allTokens = [];
    let allTokensSet = new Set();
    let allPoolsNonZeroBalances: SubGraphPoolsBase = { pools: [] };

    for (let pool of allPools.pools) {
        // Build list of non-zero balance pools
        // Only check first balance since AFAIK either all balances are zero or none are:
        if (pool.tokens.length != 0) {
            if (pool.tokens[0].balance != '0') {
                let tokens = [];
                pool.tokensList.forEach(token => {
                    if (
                        !disabledTokens.find(
                            t => getAddress(t.address) === getAddress(token)
                        )
                    ) {
                        tokens.push(token);
                    }
                });

                if (tokens.length > 1) {
                    allTokens.push(tokens.sort()); // Will add without duplicate
                }

                allPoolsNonZeroBalances.pools.push(pool);
            }
        }
    }

    allTokensSet = new Set(
        Array.from(new Set(allTokens.map(a => JSON.stringify(a))), json =>
            JSON.parse(json)
        )
    );

    return [allTokensSet, allPoolsNonZeroBalances];
}

export async function getV1Swap(
    Provider: BaseProvider,
    costOutputToken: BigNumber,
    MaxNoPools: number,
    ChainId: number,
    AllSubgraphPools: SubGraphPoolsV1,
    SwapType: string,
    TokenIn: string,
    TokenOut: string,
    SwapAmount: BigNumber,
    Profiling: Profiling = {
        onChainBalances: true,
    },
    disabledOptions: DisabledOptions = { isOverRide: false, disabledTokens: [] }
) {
    TokenIn = TokenIn.toLowerCase();
    TokenOut = TokenOut.toLowerCase();

    // V1 will always ONLY use Weighted Pools
    const weightedPools = filterToWeightedPoolsOnly(AllSubgraphPools);
    if (weightedPools.pools.length === 0)
        return { title: 'v1', swaps: [], returnAmount: bnum(0), timeData: {} };

    const MULTIADDR: { [ChainId: number]: string } = {
        1: '0x514053acec7177e277b947b1ebb5c08ab4c4580e',
        42: '0x71c7f1086aFca7Aa1B0D4d73cfa77979d10D3210',
    };

    const swapCost = new BigNumber('100000'); // A pool swap costs approx 100000 gas

    const fullSwapStart = performance.now();
    // costOutputToken should be the same as V2 as that's what we compare to.
    const getCostOutputTokenStart = performance.now();
    // // This calculates the cost in output token (output token is TokenOut for swapExactIn and
    // // TokenIn for a swapExactOut) for each additional pool added to the final SOR swap result.
    // // This is used as an input to SOR to allow it to make gas efficient recommendations, i.e.
    // // if it costs 5 DAI to add another pool to the SOR solution and that only generates 1 more DAI,
    // // then SOR should not add that pool (if gas costs were zero that pool would be added)
    // // Notice that outputToken is TokenOut if SwapType == 'swapExactIn' and TokenIn if SwapType == 'swapExactOut'
    // let costOutputToken: BigNumber;
    // if (SwapType === 'swapExactIn')
    //     costOutputToken = await sorv1.getCostOutputToken(
    //         TokenOut,
    //         GasPrice,
    //         swapCost,
    //         Provider
    //     );
    // else
    //     costOutputToken = await sorv1.getCostOutputToken(
    //         TokenIn,
    //         GasPrice,
    //         swapCost,
    //         Provider
    //     );

    const getCostOutputTokenEnd = performance.now();

    let poolsWithOnChainBalances;

    if (Profiling.onChainBalances) {
        const getAllPoolDataOnChainStart = performance.now();

        poolsWithOnChainBalances = await sorv1.getAllPoolDataOnChain(
            weightedPools,
            MULTIADDR[ChainId],
            Provider
        );

        const getAllPoolDataOnChainEnd = performance.now();
    } else {
        const getAllPoolDataOnChainStart = performance.now();
        // console.log(`Using saved balances`)
        // Helper - Filters for only pools with balance and converts to wei/bnum format.
        poolsWithOnChainBalances = formatToV1schema(
            JSON.parse(JSON.stringify(weightedPools))
        );
        const getAllPoolDataOnChainEnd = performance.now();
    }

    const filterPoolsStart = performance.now();

    let poolsTokenIn, poolsTokenOut, directPools, hopTokens;
    [directPools, hopTokens, poolsTokenIn, poolsTokenOut] = sorv1.filterPools(
        poolsWithOnChainBalances.pools, // AllSubgraphPoolsCorrect.pools,
        TokenIn,
        TokenOut,
        MaxNoPools,
        disabledOptions
    );
    const filterPoolsEnd = performance.now();
    const sortPoolsMostLiquidStart = performance.now();

    // For each hopToken, find the most liquid pool for the first and the second hops
    let mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop;
    [
        mostLiquidPoolsFirstHop,
        mostLiquidPoolsSecondHop,
    ] = sorv1.sortPoolsMostLiquid(
        TokenIn,
        TokenOut,
        hopTokens,
        poolsTokenIn,
        poolsTokenOut
    );

    const sortPoolsMostLiquidEnd = performance.now();
    const parsePoolDataStart = performance.now();

    // Finds the possible paths to make the swap, each path can be a direct swap
    // or a multihop composed of 2 swaps
    let pools, pathData;
    [pools, pathData] = sorv1.parsePoolData(
        directPools,
        TokenIn,
        TokenOut,
        mostLiquidPoolsFirstHop,
        mostLiquidPoolsSecondHop,
        hopTokens
    );

    console.log(`****** V1 Paths: ${pathData.length}`);

    ///////////// Start - Just for testing BPTForTokensZeroPriceImpact /////
    /*
    let pool = pools[Object.keys(pools)[0]]; // Get first pool
    let balances = [];
    let decimals = [];
    let normalizedWeights = [];
    let amounts = [];

    // bptTotalSupply is not scaled above (as it's not used in SOR V1)
    let bptTotalSupply = new FixedPointNumber(pool.totalShares);
    bptTotalSupply = new FixedPointNumber(
        bptTotalSupply.times(new FixedPointNumber(10 ** 18))
    );
    let swapFee = new FixedPointNumber(pool.swapFee);
    for (let i = 0; i < pool.tokens.length; i++) {
        let decimal = pool.tokens[i].decimals;
        decimals.push(decimal);
        let balance = new FixedPointNumber(pool.tokens[i].balance);
        balances.push(balance);
        let amount = new FixedPointNumber(
            balance.div(new FixedPointNumber(100))
        ); // We are considering a proportional add/remove of 1% of the balances
        amounts.push(amount);
        normalizedWeights.push(
            new FixedPointNumber(
                pool.tokens[i].weight
                    .div(pool.totalWeight)
                    .times(new FixedPointNumber(10 ** 18))
            )
        );
    }

    let BPTForTokensZPI = BPTForTokensZeroPriceImpact(
        balances,
        decimals,
        normalizedWeights,
        [...amounts], // passing copy as somehow BPTForTokensZeroPriceImpact is changing amounts type from FixedPoint to BigNumber
        bptTotalSupply
    );

    let BPTForTokensJoin = _exactTokensInForBPTOut(
        balances,
        normalizedWeights,
        amounts,
        bptTotalSupply,
        swapFee
    );

    let BPTForTokensExit = _bptInForExactTokensOut(
        balances,
        normalizedWeights,
        amounts,
        bptTotalSupply,
        swapFee
    );

    // This has to be true for a proportional join/exit, except
    // for rounding errors (which should always be in favor of the pool)
    // BPTForTokensExit = BPTForTokensZPI = BPTForTokensJoin
    console.log(
        'All three numbers below should be the same (except for rounding errors): '
    );
    console.log(BPTForTokensJoin.toNumber());
    console.log(BPTForTokensZPI.toNumber());
    console.log(BPTForTokensExit.toNumber());

    // To simulate a non-proportional join/exit we just zero one of the amounts:
    amounts[0] = new FixedPointNumber(0);
    let BPTForTokensZPI_NP = BPTForTokensZeroPriceImpact(
        balances,
        decimals,
        normalizedWeights,
        [...amounts], // passing copy as somehow BPTForTokensZeroPriceImpact is changing amounts type from FixedPoint to BigNumber
        bptTotalSupply
    );

    let BPTForTokensJoin_NP = _exactTokensInForBPTOut(
        balances,
        normalizedWeights,
        amounts,
        bptTotalSupply,
        swapFee
    );

    let BPTForTokensExit_NP = _bptInForExactTokensOut(
        balances,
        normalizedWeights,
        amounts,
        bptTotalSupply,
        swapFee
    );
    // This has to be true for a non-proportional join/exit:
    // BPTForTokensExit_NP > BPTForTokensZPI_NP > BPTForTokensJoin_NP

    console.log('Three numbers below should be in ascending order: ');
    console.log(BPTForTokensJoin_NP.toNumber());
    console.log(BPTForTokensZPI_NP.toNumber());
    console.log(BPTForTokensExit_NP.toNumber());
    */
    ///////////// End - Just for testing BPTForTokensZeroPriceImpact /////

    const parsePoolDataEnd = performance.now();
    const processPathsStart = performance.now();

    // For each path, find its spot price, slippage and limit amount
    // The spot price of a multihop is simply the multiplication of the spot prices of each
    // of the swaps. The slippage of a multihop is a bit more complicated (out of scope for here)
    // The limit amount is due to the fact that Balancer protocol limits a trade to 50% of the pool
    // balance of TokenIn (for swapExactIn) and 33.33% of the pool balance of TokenOut (for
    // swapExactOut)
    // 'paths' are ordered by ascending spot price
    let paths = sorv1.processPaths(pathData, pools, SwapType);

    const processPathsEnd = performance.now();
    const processEpsOfInterestMultiHopStart = performance.now();

    // epsOfInterest stores a list of all relevant prices: these are either
    // 1) Spot prices of a path
    // 2) Prices where paths cross, meaning they would move to the same spot price after trade
    //    for the same amount traded.
    // For each price of interest we have:
    //   - 'bestPathsIds' a list of the id of the best paths to get to this price and
    //   - 'amounts' a list of how much each path would need to trade to get to that price of
    //     interest
    let epsOfInterest = sorv1.processEpsOfInterestMultiHop(
        paths,
        SwapType,
        MaxNoPools
    );

    const processEpsOfInterestMultiHopEnd = performance.now();
    const smartOrderRouterMultiHopEpsOfInterestStart = performance.now();

    // Returns 'swaps' which is the optimal list of swaps to make and
    // 'swapAmount' which is the total amount of TokenOut (eg. DAI) will be returned
    let swaps, returnAmount;
    [swaps, returnAmount] = sorv1.smartOrderRouterMultiHopEpsOfInterest(
        pools,
        paths,
        SwapType,
        new v1BigNumber(SwapAmount),
        MaxNoPools,
        new v1BigNumber(costOutputToken),
        epsOfInterest
    );

    const smartOrderRouterMultiHopEpsOfInterestEnd = performance.now();
    const fullSwapEnd = performance.now();

    const timeData = {
        fullSwap: fullSwapEnd - fullSwapStart,
        costOutputToken: getCostOutputTokenEnd - getCostOutputTokenStart,
        // 'getAllPoolDataOnChain': getAllPoolDataOnChainEnd - getAllPoolDataOnChainStart,
        filterPools: filterPoolsEnd - filterPoolsStart,
        sortPools: sortPoolsMostLiquidEnd - sortPoolsMostLiquidStart,
        parsePool: parsePoolDataEnd - parsePoolDataStart,
        processPaths: processPathsEnd - processPathsStart,
        processEps:
            processEpsOfInterestMultiHopEnd - processEpsOfInterestMultiHopStart,
        filter: 'N/A',
        sor:
            smartOrderRouterMultiHopEpsOfInterestEnd -
            smartOrderRouterMultiHopEpsOfInterestStart,
    };

    return { title: 'v1', swaps, returnAmount, timeData };
}

function getAmountsScaled(decimals) {
    const min = 10 ** -decimals;
    const mid = 1;
    const max = 10 ** 6;
    const smallAmt = Math.random() * (mid - min) + min;
    const highAmt = Math.random() * (max - mid) + mid;
    const interAmt1 = Math.random() * (highAmt - smallAmt) + smallAmt;
    const interAmt2 = Math.random() * (highAmt - smallAmt) + smallAmt;
    let smallSwapAmt = scale(bnum(smallAmt), decimals);
    let largeSwapAmt = scale(bnum(highAmt), decimals);
    let inter1SwapAmt = scale(bnum(interAmt1), decimals);
    let inter2SwapAmt = scale(bnum(interAmt2), decimals);

    // Gets rid of decimal places that causes issue between V1/V2 compare
    smallSwapAmt = new BigNumber(smallSwapAmt.toString().split('.')[0]);
    largeSwapAmt = new BigNumber(largeSwapAmt.toString().split('.')[0]);
    inter1SwapAmt = new BigNumber(inter1SwapAmt.toString().split('.')[0]);
    inter2SwapAmt = new BigNumber(inter2SwapAmt.toString().split('.')[0]);

    return [smallSwapAmt, largeSwapAmt, inter1SwapAmt, inter2SwapAmt];
}

export function getRandomTradeData(isStableOnly: boolean) {
    let tokens: any = WeightedTokens;
    if (isStableOnly) tokens = StableTokens;

    // Find a random token from list
    const symbols = Object.keys(tokens);
    const randomIn = Math.floor(Math.random() * symbols.length);
    let randomOut = Math.floor(Math.random() * symbols.length);
    while (randomOut === randomIn)
        randomOut = Math.floor(Math.random() * symbols.length);

    const symbolIn = symbols[randomIn];
    const tokenIn = tokens[symbolIn];
    const symbolOut = symbols[randomOut];
    const tokenOut = tokens[symbolOut];

    const decimalsIn = tokenIn.decimals;
    const decimalsOut = tokenOut.decimals;

    // These are in scaled BigNumber format.
    const [
        smallSwapAmtIn,
        largeSwapAmtIn,
        inter1SwapAmtIn,
        inter2SwapAmtIn,
    ] = getAmountsScaled(decimalsIn);
    const [
        smallSwapAmtOut,
        largeSwapAmtOut,
        inter1SwapAmtOut,
        inter2SwapAmtOut,
    ] = getAmountsScaled(decimalsOut);
    const maxPools = Math.floor(Math.random() * (7 - 1 + 1) + 1);
    /*
    console.log(`In: ${symbolIn} ${tokenIn.address.toLowerCase()}`);
    console.log(`Out: ${symbolOut} ${tokenOut.address.toLowerCase()}`);
    console.log(`Small Swap Amt In: ${smallSwapAmtIn.toString()}`);
    console.log(`Large Swap Amt In: ${largeSwapAmtIn.toString()}`);
    console.log(`Inter1 Swap Amt In: ${inter1SwapAmtIn.toString()}`);
    console.log(`Inter2 Swap Amt In: ${inter2SwapAmtIn.toString()}`);
    console.log(`Small Swap Amt Out: ${smallSwapAmtOut.toString()}`);
    console.log(`Large Swap Amt Out: ${largeSwapAmtOut.toString()}`);
    console.log(`Inter1 Swap Amt Out: ${inter1SwapAmtOut.toString()}`);
    console.log(`Inter2 Swap Amt Out: ${inter2SwapAmtOut.toString()}`);
    console.log(`MaxPools: ${maxPools}`);
    */

    const dustRandom = bnum(Math.floor(Math.random() * (5000 - 1 + 1) + 1));

    return {
        tokenIn: tokenIn.address.toLowerCase(),
        tokenOut: tokenOut.address.toLowerCase(),
        tokenInDecimals: decimalsIn,
        tokenOutDecimals: decimalsOut,
        smallSwapAmtIn,
        largeSwapAmtIn,
        inter1SwapAmtIn,
        inter2SwapAmtIn,
        smallSwapAmtOut,
        largeSwapAmtOut,
        inter1SwapAmtOut,
        inter2SwapAmtOut,
        maxPools,
        dustRandom,
    };
}

export function saveTestFile(
    Pools: SubGraphPoolsBase,
    SwapType: string,
    TokenIn: string,
    TokenOut: string,
    TokenInDecimals: string,
    TokenOutDecimals: string,
    NoPools: string,
    SwapAmount: string,
    GasPrice: string,
    FilePath: string
) {
    let SwapAmountDecimals = TokenInDecimals.toString();
    let ReturnAmountDecimals = TokenOutDecimals.toString();

    if (SwapType === 'swapExactOut') {
        SwapAmountDecimals = TokenOutDecimals.toString();
        ReturnAmountDecimals = TokenInDecimals.toString();
    }

    const tradeInfo = {
        tradeInfo: {
            SwapType,
            TokenIn,
            TokenOut,
            NoPools,
            SwapAmount,
            GasPrice,
            SwapAmountDecimals,
            ReturnAmountDecimals,
        },
        pools: Pools.pools,
    };

    const id = hashMessage(JSON.stringify(tradeInfo));

    fs.writeFile(`${FilePath}/${id}.json`, JSON.stringify(tradeInfo), function(
        err
    ) {
        if (err) {
            console.log(err);
        }
    });

    console.log(`Test saved at: ${FilePath}/${id}.json`);
    return id;
}

export function deleteTestFile(
    Pools: SubGraphPoolsBase,
    SwapType: string,
    TokenIn: string,
    TokenOut: string,
    TokenInDecimals: string,
    TokenOutDecimals: string,
    NoPools: string,
    SwapAmount: string,
    GasPrice: string,
    FilePath: string
) {
    let SwapAmountDecimals = TokenInDecimals.toString();
    let ReturnAmountDecimals = TokenOutDecimals.toString();

    if (SwapType === 'swapExactOut') {
        SwapAmountDecimals = TokenOutDecimals.toString();
        ReturnAmountDecimals = TokenInDecimals.toString();
    }

    const tradeInfo = {
        tradeInfo: {
            SwapType,
            TokenIn,
            TokenOut,
            NoPools,
            SwapAmount,
            GasPrice,
            SwapAmountDecimals,
            ReturnAmountDecimals,
        },
        pools: Pools.pools,
    };

    const id = hashMessage(JSON.stringify(tradeInfo));

    fs.unlink(`${FilePath}/${id}.json`, function(err) {
        if (err) {
            console.log(err);
        }
    });
}

export async function listTestFiles(TestFilesPath: string) {
    const files = await readdir(TestFilesPath);
    // This is useful output to update test list
    files.forEach(file => {
        console.log(`'${file.split('.json')[0]}',`);
    });

    return files;
}

export function loadTestFile(File: string) {
    const fileString = fs.readFileSync(File, 'utf8');
    const fileJson = JSON.parse(fileString);
    if (!fileJson.tradeInfo) return fileJson;

    fileJson.tradeInfo.GasPrice = new BigNumber(fileJson.tradeInfo.GasPrice);
    fileJson.tradeInfo.SwapAmount = new BigNumber(
        fileJson.tradeInfo.SwapAmount.split('.')[0] // This is getting rid of decimals that shouldn't be there.
    );
    return fileJson;
}

export function displayResults(
    TestTitle: string,
    TradeInfo: any,
    Results: any[],
    Verbose: boolean,
    MaxPools: number
) {
    let symbolIn, symbolOut;
    let allTokens = WeightedTokens;
    Object.assign(allTokens, StableTokens);
    const symbols = Object.keys(allTokens);
    symbols.forEach(symbol => {
        if (
            allTokens[symbol].address.toLowerCase() ===
            TradeInfo.TokenIn.toLowerCase()
        )
            symbolIn = symbol;

        if (
            allTokens[symbol].address.toLowerCase() ===
            TradeInfo.TokenOut.toLowerCase()
        )
            symbolOut = symbol;
    });
    const tokenIn = allTokens[symbolIn];

    console.log(`Pools From File: ${TestTitle}`);
    console.log(`In: ${symbolIn} ${TradeInfo.TokenIn.toLowerCase()}`);
    console.log(`Out: ${symbolOut} ${TradeInfo.TokenOut.toLowerCase()}`);
    console.log(`Swap Amt: ${TradeInfo.SwapAmount.toString()}`);
    console.log(`Max Pools: ${MaxPools}`);
    console.log(TradeInfo.SwapType);

    let tableData = [];
    Results.forEach(result => {
        tableData.push({
            SOR: result.title,
            'Full SOR Time': result.timeData.fullSwap,
            'Return Amt': result.returnAmount.toString(),
        });
    });

    console.table(tableData);

    if (Verbose) {
        Results.forEach(result => {
            console.log(`${result.title} Swaps: `);
            console.log(result.swaps);
        });
    }
}

export function assertResults(
    file,
    testData,
    v1SwapData,
    v2SwapData,
    wrapperSwapData: SwapInfo,
    v2WithFilterSwapData = undefined
) {
    const relDiffBn = calcRelativeDiffBn(
        v2SwapData.returnAmount,
        v1SwapData.returnAmount
    );
    const errorDelta = 10 ** -6;

    // Compare V1 vs V2 results
    if (testData.tradeInfo.SwapType === `swapExactIn`) {
        if (v2SwapData.returnAmount.gte(v1SwapData.returnAmount)) {
            assert(
                v2SwapData.returnAmount.gte(v1SwapData.returnAmount),
                `File: ${file}\nV2<V1\nIn: ${
                    testData.tradeInfo.TokenIn
                } \nOut: ${
                    testData.tradeInfo.TokenOut
                } \nSwap Amt: ${testData.tradeInfo.SwapAmount.toString()} \n${v1SwapData.returnAmount.toString()} \n${v2SwapData.returnAmount.toString()}`
            );
        } else {
            assert.isAtMost(relDiffBn.toNumber(), errorDelta);
            console.log(
                `!!!!!! V2 < V1 but error delta ok. (${relDiffBn.toString()})`
            );
        }
    } else {
        if (v2SwapData.returnAmount.eq(0))
            assert(
                v1SwapData.returnAmount.eq(0),
                `File: ${file}, V2 Should Not Have 0 Swap If V1 > 0.`
            );

        if (v1SwapData.returnAmount.eq(0) && v2SwapData.returnAmount.gt(0)) {
            console.log(`!!!!!! V1 has no swap but V2 has.`);
            return;
        }

        if (v2SwapData.returnAmount.lte(v1SwapData.returnAmount)) {
            assert(
                v2SwapData.returnAmount.lte(v1SwapData.returnAmount),
                `File: ${file}\nV2<V1\nIn: ${
                    testData.tradeInfo.TokenIn
                } \nOut: ${
                    testData.tradeInfo.TokenOut
                } \nSwap Amt: ${testData.tradeInfo.SwapAmount.toString()} \n${v1SwapData.returnAmount.toString()} \n${v2SwapData.returnAmount.toString()}`
            );
        } else {
            assert.isAtMost(relDiffBn.toNumber(), errorDelta);
            console.log(
                `!!!!!! V2 > V1 but error delta ok. (${relDiffBn.toString()})`
            );
        }
    }

    // Compare V2 filter (currently unused)
    if (v2WithFilterSwapData !== undefined) {
        assert(
            v2SwapData.returnAmount.eq(v2WithFilterSwapData.returnAmount),
            `File: ${file}\nV2 !== V2 Filter\nIn: ${
                testData.tradeInfo.TokenIn
            } \nOut: ${
                testData.tradeInfo.TokenOut
            } \nSwap Amt: ${testData.tradeInfo.SwapAmount.toString()} \n${v2SwapData.returnAmount.toString()} \n${v2WithFilterSwapData.returnAmount.toString()}`
        );
    }

    // Compare V2 vs V2 wrapper
    assert.equal(
        wrapperSwapData.returnAmount.toString(),
        v2SwapData.returnAmount
            .times(bnum(10 ** testData.tradeInfo.ReturnAmountDecimals))
            .toString()
            .split('.')[0],
        `Wrapper should have same amount as helper.`
    );

    let swapTypeCorrect = SwapTypes.SwapExactIn;
    if (testData.tradeInfo.SwapType !== 'swapExactIn') {
        swapTypeCorrect = SwapTypes.SwapExactOut;
    }

    const amountNormalised = testData.tradeInfo.SwapAmount.div(
        bnum(10 ** testData.tradeInfo.SwapAmountDecimals)
    );

    const v2formatted = formatSwaps(
        v2SwapData.swaps,
        swapTypeCorrect,
        amountNormalised,
        testData.tradeInfo.TokenIn,
        testData.tradeInfo.TokenOut,
        v2SwapData.returnAmount,
        v2SwapData.returnAmountConsideringFees, // Not needed so just a value,
        wrapperSwapData.marketSp,
        v2SwapData.isRelayerSwap
    );

    // Wrapper and direct SOR code should have the same swaps
    expect(wrapperSwapData).to.deep.equal(v2formatted);

    let totalFromSwaps: BigNumber;
    if (v2SwapData.returnAmount.gt(0)) {
        totalFromSwaps = totalSwapAmounts(
            swapTypeCorrect,
            testData.tradeInfo.TokenIn,
            testData.tradeInfo.TokenOut,
            v2SwapData.swaps
        );

        assert.equal(
            testData.tradeInfo.SwapAmount.toString(),
            totalFromSwaps.toString(),
            'Total From Swaps Should Be Equal.'
        );
    }

    // console.log(`------- Wrapper Swaps (formatted): `)
    // console.log(wrapperSwapData.swaps);

    // Test that swap amounts equal swaps amounts
    if (wrapperSwapData.returnAmount.gt(0)) {
        const totalSwapInfo = totalSwapInfoAmounts(
            swapTypeCorrect,
            wrapperSwapData
        );

        assert.equal(
            testData.tradeInfo.SwapAmount.toString(),
            wrapperSwapData.swapAmount.toString(),
            'Swap Amounts Should Be Equal.'
        );
        assert.equal(
            testData.tradeInfo.SwapAmount.toString(),
            totalSwapInfo.toString(),
            'Total From SwapInfo Should Equal Swap Amount.'
        );
        assert.equal(
            totalFromSwaps.toString(),
            totalSwapInfo.toString(),
            'Wrapper should have same total as direct swaps'
        );
    } else
        assert.equal(
            '0',
            wrapperSwapData.swapAmount.toString(),
            'Swap Amount Should Be 0 For No Swaps'
        );

    checkSwapAmountsForDecimals(swapTypeCorrect, wrapperSwapData);
}

function checkSwapAmountsForDecimals(
    swapType: SwapTypes,
    swapInfo: SwapInfo
): void {
    swapInfo.swaps.forEach(swap => {
        if (swapType === SwapTypes.SwapExactIn) {
            let check = swap.amount.split('.');
            assert.isTrue(
                check.length === 1,
                `Swap Amounts Should Not Have Decimal: ${swap.amount.toString()}`
            );
        } else {
            let check = swap.amount.split('.');
            assert.isTrue(
                check.length === 1,
                `Swap Amounts Should Not Have Decimal: ${swap.amount.toString()}`
            );
        }
    });
}

// Helper to sum all amounts traded by swaps
function totalSwapInfoAmounts(
    swapType: SwapTypes,
    swapInfo: SwapInfo
): BigNumber {
    let total = bnum(0);
    const inIndex = swapInfo.tokenAddresses.indexOf(swapInfo.tokenIn);
    const outIndex = swapInfo.tokenAddresses.indexOf(swapInfo.tokenOut);

    swapInfo.swaps.forEach(swap => {
        if (swapType === SwapTypes.SwapExactIn) {
            if (swap.assetInIndex === inIndex) total = total.plus(swap.amount);
        } else {
            if (swap.assetOutIndex === outIndex)
                total = total.plus(swap.amount);
        }
    });
    return total;
}

// Helper to sum all amounts traded by swaps
function totalSwapAmounts(
    swapType: SwapTypes,
    tokenIn: string,
    tokenOut: string,
    swaps: Swap[][]
): BigNumber {
    let total = bnum(0);

    swaps.forEach(swapSeq => {
        swapSeq.forEach(swap => {
            if (swapType === SwapTypes.SwapExactIn) {
                if (swap.tokenIn === tokenIn) {
                    total = total.plus(
                        scale(bnum(swap.swapAmount), swap.tokenInDecimals)
                    );
                }
            } else {
                if (swap.tokenOut === tokenOut)
                    total = total.plus(
                        scale(bnum(swap.swapAmount), swap.tokenOutDecimals)
                    );
            }
        });
    });
    return total;
}

// Helper to filter pools to contain only Weighted pools
export function filterToWeightedPoolsOnly(pools: any) {
    let weightedPools = { pools: [] };

    for (let pool of pools.pools) {
        if (pool.poolType === 'Weighted') weightedPools.pools.push(pool);
        // if (pool.amp === undefined) weightedPools.pools.push(pool);
    }
    return weightedPools;
}

export function calcRelativeDiffBn(expected: BigNumber, actual: BigNumber) {
    return expected
        .minus(actual)
        .div(expected)
        .abs();
}

async function getAllPoolDataOnChain(
    pools: SubGraphPoolsBase,
    multiAddress: string,
    provider: BaseProvider
): Promise<SubGraphPoolsBase> {
    if (pools.pools.length === 0) throw Error('There are no pools.');

    const contract = new Contract(multiAddress, customMultiAbi, provider);

    let addresses = [];
    let total = 0;

    for (let i = 0; i < pools.pools.length; i++) {
        let pool = pools.pools[i];

        addresses.push([pool.id]);
        total++;
        pool.tokens.forEach(token => {
            addresses[i].push(token.address);
            total++;
        });
    }

    let results = await contract.getPoolInfo(addresses, total);

    let j = 0;
    let onChainPools: SubGraphPoolsBase = { pools: [] };

    for (let i = 0; i < pools.pools.length; i++) {
        let tokens: SubGraphToken[] = [];

        let p: SubgraphPoolBase = {
            address: 'n/a',
            poolType: 'n/a',
            id: pools.pools[i].id,
            swapFee: pools.pools[i].swapFee,
            totalWeight: pools.pools[i].totalWeight,
            tokens: tokens,
            tokensList: pools.pools[i].tokensList,
            amp: '0',
            totalShares: pools.pools[i].totalShares,
        };

        pools.pools[i].tokens.forEach(token => {
            // let bal = bnum(results[j]);
            let bal = scale(
                bnum(results[j]),
                -Number(token.decimals)
            ).toString();
            j++;
            p.tokens.push({
                address: token.address,
                balance: bal,
                decimals: token.decimals,
                weight: token.weight,
            });
        });
        onChainPools.pools.push(p);
    }
    return onChainPools;
}

export function countPoolSwapPairTypes(
    poolsOfInterestDictionary: PoolDictionary
) {
    let noDirect = 0,
        noHopIn = 0,
        noHopOut = 0;
    for (let k in poolsOfInterestDictionary) {
        if (poolsOfInterestDictionary[k].swapPairType === SwapPairType.Direct)
            noDirect++;
        else if (
            poolsOfInterestDictionary[k].swapPairType === SwapPairType.HopIn
        )
            noHopIn++;
        else if (
            poolsOfInterestDictionary[k].swapPairType === SwapPairType.HopOut
        )
            noHopOut++;
    }

    return [noDirect, noHopIn, noHopOut];
}

export async function getV2Swap(
    provider: BaseProvider,
    pools: any,
    tokenIn: string,
    tokenOut: string,
    maxPools: number,
    swapType: string | SwapTypes,
    swapAmount: BigNumber,
    gasPrice: BigNumber,
    returnAmountDecimals: number,
    swapCost: BigNumber,
    disabledOptions: DisabledOptions = {
        isOverRide: false,
        disabledTokens: [],
    },
    costOutputTokenOveride = {
        isOverRide: false,
        overRideCost: new BigNumber(0),
    }
) {
    let swapTypeCorrect = SwapTypes.SwapExactIn;

    if (swapType === 'swapExactOut' || swapType === SwapTypes.SwapExactOut)
        swapTypeCorrect = SwapTypes.SwapExactOut;

    const fullSwapStart = performance.now();

    let costOutputToken: BigNumber = costOutputTokenOveride.overRideCost;

    if (!costOutputTokenOveride.isOverRide) {
        // This calculates the cost in output token (output token is TokenOut for swapExactIn and
        // TokenIn for a swapExactOut) for each additional pool added to the final SOR swap result.
        // This is used as an input to SOR to allow it to make gas efficient recommendations, i.e.
        // if it costs 5 DAI to add another pool to the SOR solution and that only generates 1 more DAI,
        // then SOR should not add that pool (if gas costs were zero that pool would be added)
        // Notice that outputToken is TokenOut if SwapType == 'swapExactIn' and TokenIn if SwapType == 'swapExactOut'
        if (swapType === 'swapExactIn') {
            costOutputToken = await sorv2.getCostOutputToken(
                tokenOut,
                gasPrice,
                swapCost,
                provider
            );
        } else {
            costOutputToken = await sorv2.getCostOutputToken(
                tokenIn,
                gasPrice,
                swapCost,
                provider
            );
        }
    }
    // Normalize to ReturnAmountDecimals
    costOutputToken = costOutputToken.div(bnum(10 ** returnAmountDecimals));
    const getCostOutputTokenEnd = performance.now();

    let hopTokens: string[];
    let poolsOfInterestDictionary: PoolDictionary;
    let pathData: NewPath[];

    [poolsOfInterestDictionary, hopTokens] = filterPoolsOfInterest(
        JSON.parse(JSON.stringify(pools.pools)),
        tokenIn,
        tokenOut,
        maxPools,
        disabledOptions
    );

    [poolsOfInterestDictionary, pathData] = filterHopPools(
        tokenIn,
        tokenOut,
        hopTokens,
        poolsOfInterestDictionary
    );

    console.log(`****** V2 Paths: ${pathData.length}`);

    let paths: NewPath[];
    let maxAmt: BigNumber;

    [paths, maxAmt] = calculatePathLimits(pathData, swapTypeCorrect);

    let swaps: any,
        total: BigNumber,
        marketSp: BigNumber,
        totalConsideringFees: BigNumber,
        isRelayerSwap: boolean;
    [
        swaps,
        total,
        marketSp,
        totalConsideringFees,
        isRelayerSwap,
    ] = smartOrderRouter(
        JSON.parse(JSON.stringify(poolsOfInterestDictionary)), // Need to keep original pools for cache
        paths,
        swapTypeCorrect,
        swapAmount,
        maxPools,
        costOutputToken
    );

    const fullSwapEnd = performance.now();
    const timeData = {
        fullSwap: fullSwapEnd - fullSwapStart,
    };

    return {
        title: 'v2',
        swaps,
        returnAmount: total,
        returnAmountConsideringFees: totalConsideringFees,
        timeData,
        costOutputToken,
        isRelayerSwap,
    };
}

export async function getWrapperSwap(
    pools: any,
    tokenIn: string,
    tokenOut: string,
    tokenInDecimals: number,
    tokenOutDecimals: number,
    maxPools: number,
    swapType: string | SwapTypes,
    swapAmountNormalised: BigNumber,
    costOutputToken: BigNumber,
    gasPrice: BigNumber,
    provider: JsonRpcProvider,
    swapCost: BigNumber = new BigNumber('100000'),
    disabledOptions: DisabledOptions = { isOverRide: false, disabledTokens: [] }
): Promise<SwapInfo> {
    const sor = new sorv2.SOR(
        provider,
        gasPrice,
        maxPools,
        1,
        JSON.parse(JSON.stringify(pools)),
        swapCost,
        disabledOptions
    );

    let swapTypeCorrect = SwapTypes.SwapExactIn;

    if (swapType === 'swapExactIn')
        await sor.setCostOutputToken(
            tokenOut,
            tokenOutDecimals,
            costOutputToken
        );
    else {
        swapTypeCorrect = SwapTypes.SwapExactOut;
        await sor.setCostOutputToken(tokenIn, tokenInDecimals, costOutputToken);
    }

    const isFetched = await sor.fetchPools(false);
    assert(isFetched, 'Pools should be fetched in wrapper');

    const swapInfo: SwapInfo = await sor.getSwaps(
        tokenIn,
        tokenOut,
        swapTypeCorrect,
        swapAmountNormalised,
        { timestamp: 0, poolTypeFilter: PoolFilter.All }
    );

    return swapInfo;
}

// Generates file output for v1-v2-compare-testPools.spec.ts
// ts-node ./test/lib/testHelpers.ts
// const files = listTestFiles(`/Users/jg/Documents/balancer-sor-v2/test/testData/testPools/`);
