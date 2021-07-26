require('dotenv').config();
import { ALLOW_ADD_REMOVE } from '../src/config';
import { expect } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SOR } from '../src';
import { getBestPathIds, calculatePathLimits } from '../src/sorClass';
import {
    SubGraphPoolsBase,
    SwapInfo,
    SwapTypes,
    PoolTypes,
    PairTypes,
    PoolDictionary,
    NewPath,
    PoolBase,
    PathSwapTypes,
} from '../src/types';
import { bnum, scale } from '../src/bmath';
import { BigNumber } from '../src/utils/bignumber';
import {
    StablePool,
    StablePoolPairData,
} from '../src/pools/stablePool/stablePool';
import { WeightedPool } from '../src/pools/weightedPool/weightedPool';
import { BPTForTokensZeroPriceImpact } from '../src/frontendHelpers/stableHelpers';

const gasPrice = bnum('30000000000');
const maxPools = 4;
const chainId = 1;
const provider = new JsonRpcProvider(
    `https://mainnet.infura.io/v3/${process.env.INFURA}`
);

const BAL = '0xba100000625a3754423978a60c9317c58a424e3d';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const BPT = '0xebfed10e11dc08fcda1af1fda146945e8710f22e';
const RANDOM = '0x1456688345527be1f37e9e627da0837d6f08c925';

function newStablePool(pool: any) {
    return new StablePool(
        pool.id,
        pool.address,
        pool.amp,
        pool.swapFee,
        pool.totalShares,
        pool.tokens,
        pool.tokensList
    );
}

function newWeightedPool(pool: any) {
    return new WeightedPool(
        pool.id,
        pool.address,
        pool.swapFee,
        pool.totalWeight,
        pool.totalShares,
        pool.tokens,
        pool.tokensList
    );
}

// npx mocha -r ts-node/register test/metaPools.spec.ts
describe(`Tests for Simplified MetaPool.`, () => {
    if (ALLOW_ADD_REMOVE) {
        context('joinSwaps', () => {
            context('test getBestPathIds directly', () => {
                it('paths for direct and joinSwap + one swap amounts, should return best path - joinSwap', async () => {
                    const tokenIn = DAI;
                    const tokenOut = RANDOM;
                    const bptToken =
                        '0xebfed20e11dc08fcda1af1fda146945e8710f22e';
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmount: BigNumber = bnum('0.01');
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');

                    const poolDirect: any = newWeightedPool(
                        poolsFromFile.poolsDirectWorseJoin[0]
                    ); // TokenIn > TokenOut - worse price
                    const poolToJoin: any = newStablePool(
                        poolsFromFile.metaPool2[0]
                    ); // TokenIn > joinPool - BPT
                    const poolBptSwap: any = newStablePool(
                        poolsFromFile.metaPool2[1]
                    ); // BPT > TokenOut

                    const poolsDict = {};
                    poolsDict[poolDirect.id] = poolDirect;
                    poolsDict[poolToJoin.id] = poolToJoin;
                    poolsDict[poolBptSwap.id] = poolBptSwap;

                    const poolPairDataDirect = poolDirect.parsePoolPairData(
                        tokenIn,
                        tokenOut
                    );
                    const poolPairDataToJoin = poolToJoin.parsePoolPairData(
                        tokenIn,
                        bptToken
                    );
                    const poolPairDataBpt = poolBptSwap.parsePoolPairData(
                        bptToken,
                        tokenOut
                    );

                    const swapAmounts = [swapAmount];

                    const swapDirect = {
                        pool: poolDirect.id,
                        tokenIn,
                        tokenOut,
                        swapAmount: swapAmounts[0].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const pathDirect: NewPath = {
                        id: poolDirect.id,
                        swaps: [swapDirect],
                        poolPairData: [poolPairDataDirect],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolDirect],
                        pathSwapType: PathSwapTypes.TokenSwap,
                    };

                    const swapJoin = {
                        pool: poolToJoin.id,
                        tokenIn,
                        tokenOut: bptToken,
                        swapAmount: swapAmounts[0].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const swapBpt = {
                        pool: poolBptSwap.id,
                        tokenIn: bptToken,
                        tokenOut,
                        swapAmount: '0',
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const pathJoinSwap: NewPath = {
                        id: `${poolToJoin.id}-${poolBptSwap.id}`,
                        swaps: [swapJoin, swapBpt],
                        poolPairData: [poolPairDataToJoin, poolPairDataBpt],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolToJoin, poolBptSwap],
                        pathSwapType: PathSwapTypes.JoinSwap,
                    };

                    // Calculates correct limits to make sure valid
                    let paths;
                    [paths] = calculatePathLimits(
                        [pathDirect, pathJoinSwap],
                        swapType
                    );

                    const [
                        selectedPaths,
                        selectedPathExceedingAmounts,
                        selectedPathLimitAmounts,
                        bestPathIds,
                    ] = getBestPathIds(poolsDict, paths, swapType, swapAmounts);

                    expect(selectedPaths.length).eq(1);
                    expect(bestPathIds.length).eq(1);
                    expect(selectedPaths[0]).deep.eq(pathJoinSwap);
                });

                it('paths for direct and joinSwap + one swap amounts, should return best path - direct', async () => {
                    const tokenIn = DAI;
                    const tokenOut = RANDOM;
                    const bptToken =
                        '0xebfed20e11dc08fcda1af1fda146945e8710f22e';
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmount: BigNumber = bnum('0.01');
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');

                    const poolDirect: any = newStablePool(
                        poolsFromFile.poolsDirectJoin[0]
                    ); // TokenIn > TokenOut
                    const poolToJoin: any = newStablePool(
                        poolsFromFile.metaPool2[0]
                    ); // TokenIn > joinPool - BPT
                    const poolBptSwap: any = newStablePool(
                        poolsFromFile.metaPool2[1]
                    ); // BPT > TokenOut

                    const poolsDict = {};
                    poolsDict[poolDirect.id] = poolDirect;
                    poolsDict[poolToJoin.id] = poolToJoin;
                    poolsDict[poolBptSwap.id] = poolBptSwap;

                    const poolPairDataDirect = poolDirect.parsePoolPairData(
                        tokenIn,
                        tokenOut
                    );
                    const poolPairDataToJoin = poolToJoin.parsePoolPairData(
                        tokenIn,
                        bptToken
                    );
                    const poolPairDataBpt = poolBptSwap.parsePoolPairData(
                        bptToken,
                        tokenOut
                    );

                    const swapAmounts = [swapAmount];

                    const swapDirect = {
                        pool: poolDirect.id,
                        tokenIn,
                        tokenOut,
                        swapAmount: swapAmounts[0].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const pathDirect: NewPath = {
                        id: poolDirect.id,
                        swaps: [swapDirect],
                        poolPairData: [poolPairDataDirect],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolDirect],
                        pathSwapType: PathSwapTypes.TokenSwap,
                    };

                    const swapJoin = {
                        pool: poolToJoin.id,
                        tokenIn,
                        tokenOut: bptToken,
                        swapAmount: swapAmounts[0].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const swapBpt = {
                        pool: poolBptSwap.id,
                        tokenIn: bptToken,
                        tokenOut,
                        swapAmount: '0',
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const pathJoinSwap: NewPath = {
                        id: `${poolToJoin.id}-${poolBptSwap.id}`,
                        swaps: [swapJoin, swapBpt],
                        poolPairData: [poolPairDataToJoin, poolPairDataBpt],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolToJoin, poolBptSwap],
                        pathSwapType: PathSwapTypes.JoinSwap,
                    };

                    // Calculates correct limits to make sure valid
                    let paths;
                    [paths] = calculatePathLimits(
                        [pathDirect, pathJoinSwap],
                        swapType
                    );

                    const [
                        selectedPaths,
                        selectedPathExceedingAmounts,
                        selectedPathLimitAmounts,
                        bestPathIds,
                    ] = getBestPathIds(poolsDict, paths, swapType, swapAmounts);
                    expect(selectedPaths.length).eq(1);
                    expect(bestPathIds.length).eq(1);
                    expect(selectedPaths[0]).deep.eq(pathDirect);
                });

                it('paths for direct and joinSwap + two swap amounts, should return no path', async () => {
                    // With the BatchRelayer simplifications we can only use a joinSwap for a single path
                    // So in simplified terms if there is more than one swap amount being considered we don’t use a joinSwap.
                    const tokenIn = DAI;
                    const tokenOut = RANDOM;
                    const bptToken =
                        '0xebfed20e11dc08fcda1af1fda146945e8710f22e';
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmount: BigNumber = bnum('0.01');
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');

                    const poolDirect: any = newStablePool(
                        poolsFromFile.poolsDirectJoin[0]
                    ); // TokenIn > TokenOut
                    const poolToJoin: any = newStablePool(
                        poolsFromFile.metaPool2[0]
                    ); // TokenIn > joinPool - BPT
                    const poolBptSwap: any = newStablePool(
                        poolsFromFile.metaPool2[1]
                    ); // BPT > TokenOut

                    const poolsDict = {};
                    poolsDict[poolDirect.id] = poolDirect;
                    poolsDict[poolToJoin.id] = poolToJoin;
                    poolsDict[poolBptSwap.id] = poolBptSwap;

                    const poolPairDataDirect = poolDirect.parsePoolPairData(
                        tokenIn,
                        tokenOut
                    );
                    const poolPairDataToJoin = poolToJoin.parsePoolPairData(
                        tokenIn,
                        bptToken
                    );
                    const poolPairDataBpt = poolBptSwap.parsePoolPairData(
                        bptToken,
                        tokenOut
                    );

                    // Split swap amount equally between direct path and joinSwap path
                    const swapAmounts = [swapAmount.div(2), swapAmount.div(2)];

                    const swapDirect = {
                        pool: poolDirect.id,
                        tokenIn,
                        tokenOut,
                        swapAmount: swapAmounts[0].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const pathDirect: NewPath = {
                        id: poolDirect.id,
                        swaps: [swapDirect],
                        poolPairData: [poolPairDataDirect],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolDirect],
                        pathSwapType: PathSwapTypes.TokenSwap,
                    };

                    const swapJoin = {
                        pool: poolToJoin.id,
                        tokenIn,
                        tokenOut: bptToken,
                        swapAmount: swapAmounts[1].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const swapBpt = {
                        pool: poolBptSwap.id,
                        tokenIn: bptToken,
                        tokenOut,
                        swapAmount: '0',
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const pathJoinSwap: NewPath = {
                        id: `${poolToJoin.id}-${poolBptSwap.id}`,
                        swaps: [swapJoin, swapBpt],
                        poolPairData: [poolPairDataToJoin, poolPairDataBpt],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolToJoin, poolBptSwap],
                        pathSwapType: PathSwapTypes.JoinSwap,
                    };

                    // Calculates correct limits to make sure valid
                    let paths;
                    [paths] = calculatePathLimits(
                        [pathDirect, pathJoinSwap],
                        swapType
                    );

                    const [
                        selectedPaths,
                        selectedPathExceedingAmounts,
                        selectedPathLimitAmounts,
                        bestPathIds,
                    ] = getBestPathIds(poolsDict, paths, swapType, swapAmounts);
                    expect(selectedPaths.length).eq(0);
                    expect(bestPathIds.length).eq(0);
                });

                it('paths for two joinSwaps + two swap amounts, should return no paths', async () => {
                    // With the BatchRelayer simplifications we can only use a exitSwap for a single path
                    // So in simplified terms if there is more than one swap amount being considered we don’t use a joinSwap.
                    const tokenIn = DAI;
                    const tokenOut = RANDOM;
                    const bptToken =
                        '0xebfed20e11dc08fcda1af1fda146945e8710f22e';
                    const bptToken2 =
                        '0xebfed10e11dc08fcda1af1fda146945e8710f22e';
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmount: BigNumber = bnum('0.01');
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');

                    const poolToJoin: any = newStablePool(
                        poolsFromFile.metaPool2[0]
                    ); // TokenIn > joinPool - BPT
                    const poolBptSwap: any = newStablePool(
                        poolsFromFile.metaPool2[1]
                    ); // BPT > TokenOut
                    const poolToJoin2: any = newStablePool(
                        poolsFromFile.pools[0]
                    ); // TokenIn > joinPool - BPT
                    const poolBptSwap2: any = newStablePool(
                        poolsFromFile.pools[1]
                    ); // BPT > TokenOut

                    const poolsDict = {};
                    poolsDict[poolToJoin.id] = poolToJoin;
                    poolsDict[poolBptSwap.id] = poolBptSwap;
                    poolsDict[poolToJoin2.id] = poolToJoin2;
                    poolsDict[poolBptSwap2.id] = poolBptSwap2;

                    const poolPairDataToJoin = poolToJoin.parsePoolPairData(
                        tokenIn,
                        bptToken
                    );
                    const poolPairDataBpt = poolBptSwap.parsePoolPairData(
                        bptToken,
                        tokenOut
                    );
                    const poolPairDataToJoin2 = poolToJoin2.parsePoolPairData(
                        tokenIn,
                        bptToken2
                    );
                    const poolPairDataBpt2 = poolBptSwap2.parsePoolPairData(
                        bptToken2,
                        tokenOut
                    );

                    // Split swap amount equally between direct path and joinSwap path
                    const swapAmounts = [swapAmount.div(2), swapAmount.div(2)];

                    const swapJoin = {
                        pool: poolToJoin.id,
                        tokenIn,
                        tokenOut: bptToken,
                        swapAmount: '0',
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const swapBpt = {
                        pool: poolBptSwap.id,
                        tokenIn: bptToken,
                        tokenOut,
                        swapAmount: swapAmounts[1].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const pathJoinSwap: NewPath = {
                        id: `${poolToJoin.id}-${poolBptSwap.id}`,
                        swaps: [swapJoin, swapBpt],
                        poolPairData: [poolPairDataToJoin, poolPairDataBpt],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolToJoin, poolBptSwap],
                        pathSwapType: PathSwapTypes.ExitSwap,
                    };

                    const swapJoin2 = {
                        pool: poolToJoin2.id,
                        tokenIn,
                        tokenOut: bptToken2,
                        swapAmount: '0',
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const swapBpt2 = {
                        pool: poolBptSwap2.id,
                        tokenIn: bptToken2,
                        tokenOut,
                        swapAmount: swapAmounts[1].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const pathJoinSwap2: NewPath = {
                        id: `${poolToJoin2.id}-${poolBptSwap2.id}`,
                        swaps: [swapJoin2, swapBpt2],
                        poolPairData: [poolPairDataToJoin2, poolPairDataBpt2],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolToJoin2, poolBptSwap2],
                        pathSwapType: PathSwapTypes.ExitSwap,
                    };

                    // Calculates correct limits to make sure valid
                    let paths;
                    [paths] = calculatePathLimits(
                        [pathJoinSwap, pathJoinSwap2],
                        swapType
                    );
                    /*
                    [selectedPaths,
                    selectedPathExceedingAmounts,
                    selectedPathLimitAmounts,
                    bestPathIds]
                    */
                    const [
                        selectedPaths,
                        selectedPathExceedingAmounts,
                        selectedPathLimitAmounts,
                        bestPathIds,
                    ] = getBestPathIds(poolsDict, paths, swapType, swapAmounts);

                    expect(selectedPaths.length).eq(0);
                    expect(bestPathIds.length).eq(0);
                });
            });

            // // TODO - Add correct formatting for relayer
            context('fullSwaps', () => {
                // TODO - Add check for correct format
                it('direct pool only, should return direct swap with vault format', async () => {
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');
                    const pools = { pools: poolsFromFile.poolsDirectJoin };
                    const tokenIn = DAI;
                    const tokenOut = RANDOM;
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmt: BigNumber = bnum('0.01');

                    const sor = new SOR(
                        provider,
                        gasPrice,
                        maxPools,
                        chainId,
                        pools
                    );

                    const fetchSuccess = await sor.fetchPools(false);

                    let swapInfo: SwapInfo = await sor.getSwaps(
                        tokenIn,
                        tokenOut,
                        swapType,
                        swapAmt
                    );

                    expect(swapInfo.isRelayerSwap).to.be.false;
                    expect(swapInfo.swaps.length).eq(1);
                    expect(swapInfo.swaps[0].amount.toString()).eq(
                        swapAmt.times(1e18).toString()
                    );
                    expect(swapInfo.swaps[0].poolId).eq(
                        poolsFromFile.poolsDirectJoin[0].id
                    );
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetInIndex]
                    ).eq(tokenIn);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetOutIndex]
                    ).eq(tokenOut);
                    // TO DO - Confirm amount via maths
                    expect(swapInfo.returnAmount.toString()).eq(
                        '9995091718006195'
                    );
                });

                it('metapool, should return joinSwap with relayer flag and format', async () => {
                    const poolsFromFile: SubGraphPoolsBase = require('./testData/stablePools/metaPool2.json');
                    const tokenIn = DAI;
                    const tokenOut = RANDOM;
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmt: BigNumber = bnum('0.01');

                    const sor = new SOR(
                        provider,
                        gasPrice,
                        maxPools,
                        chainId,
                        poolsFromFile
                    );

                    const fetchSuccess = await sor.fetchPools(false);

                    let swapInfo: SwapInfo = await sor.getSwaps(
                        tokenIn,
                        tokenOut,
                        swapType,
                        swapAmt
                    );

                    // TO DO - Need to return in correct format for Relayer
                    // Should return TokenIn > Join > BPT > TokenOut
                    expect(swapInfo.isRelayerSwap).to.be.true;
                    expect(swapInfo.swaps.length).eq(2);
                    expect(swapInfo.swaps[0].amount.toString()).eq(
                        swapAmt.times(1e18).toString()
                    );
                    expect(swapInfo.swaps[0].poolId).eq(
                        poolsFromFile.pools[0].id
                    );
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetInIndex]
                    ).eq(tokenIn);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetOutIndex]
                    ).eq(poolsFromFile.pools[0].address);

                    expect(swapInfo.swaps[1].amount.toString()).eq('0');
                    expect(swapInfo.swaps[1].poolId).eq(
                        poolsFromFile.pools[1].id
                    );
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetInIndex]
                    ).eq(poolsFromFile.pools[0].address);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetOutIndex]
                    ).eq(tokenOut);
                    // TO DO - Confirm amount via maths
                    expect(swapInfo.returnAmount.toString()).eq(
                        '4996659931687402'
                    );
                });

                it('2 metapool paths (SwapExactIn), should return single joinSwap with relayer flag and format', async () => {
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');
                    const pools = {
                        pools: poolsFromFile.pools.concat(
                            poolsFromFile.metaPool2
                        ),
                    };
                    const tokenIn = DAI;
                    const tokenOut = RANDOM;
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmt: BigNumber = bnum('0.01');

                    const sor = new SOR(
                        provider,
                        gasPrice,
                        maxPools,
                        chainId,
                        pools
                    );

                    const fetchSuccess = await sor.fetchPools(false);

                    let swapInfo: SwapInfo = await sor.getSwaps(
                        tokenIn,
                        tokenOut,
                        swapType,
                        swapAmt
                    );

                    // TO DO - Need to return in correct format for Relayer
                    // Should return TokenIn > Join > BPT > TokenOut
                    expect(swapInfo.isRelayerSwap).to.be.true;
                    expect(swapInfo.swaps.length).eq(2);
                    expect(swapInfo.swaps[0].amount.toString()).eq(
                        swapAmt.times(1e18).toString()
                    );
                    expect(swapInfo.swaps[0].poolId).eq(
                        poolsFromFile.metaPool2[0].id
                    );
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetInIndex]
                    ).eq(tokenIn);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetOutIndex]
                    ).eq(poolsFromFile.metaPool2[0].address);

                    expect(swapInfo.swaps[1].amount.toString()).eq('0');
                    expect(swapInfo.swaps[1].poolId).eq(
                        poolsFromFile.metaPool2[1].id
                    );
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetInIndex]
                    ).eq(poolsFromFile.metaPool2[0].address);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetOutIndex]
                    ).eq(tokenOut);
                    // TO DO - Confirm amount via maths
                    expect(swapInfo.returnAmount.toString()).eq(
                        '4996659931687402'
                    );
                });

                it('2 metapool paths (SwapExactOut), should return single joinSwap with relayer flag and format', async () => {
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');
                    const pools = {
                        pools: poolsFromFile.pools.concat(
                            poolsFromFile.metaPool2
                        ),
                    };
                    const tokenIn = DAI;
                    const tokenOut = RANDOM;
                    const swapType = SwapTypes.SwapExactOut;
                    const swapAmt: BigNumber = bnum('0.004996659931687402');

                    const sor = new SOR(
                        provider,
                        gasPrice,
                        maxPools,
                        chainId,
                        pools
                    );

                    const fetchSuccess = await sor.fetchPools(false);

                    let swapInfo: SwapInfo = await sor.getSwaps(
                        tokenIn,
                        tokenOut,
                        swapType,
                        swapAmt
                    );

                    // TO DO - Need to return in correct format for Relayer
                    // Should return TokenIn > Join > BPT > TokenOut
                    expect(swapInfo.isRelayerSwap).to.be.true;
                    expect(swapInfo.swaps.length).eq(2);
                    expect(swapInfo.swaps[0].amount.toString()).eq(
                        swapAmt.times(1e18).toString()
                    );
                    expect(swapInfo.swaps[0].poolId).eq(
                        poolsFromFile.metaPool2[1].id
                    );
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetInIndex]
                    ).eq(poolsFromFile.metaPool2[0].address);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetOutIndex]
                    ).eq(tokenOut);

                    expect(swapInfo.swaps[1].amount.toString()).eq('0');
                    expect(swapInfo.swaps[1].poolId).eq(
                        poolsFromFile.metaPool2[0].id
                    );
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetInIndex]
                    ).eq(tokenIn);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetOutIndex]
                    ).eq(poolsFromFile.metaPool2[0].address);
                    // TO DO - Confirm amount via maths
                    expect(swapInfo.returnAmount.toString()).eq(
                        '10000000400161171'
                    );
                });
            });
        });

        context('exitSwaps', () => {
            context('test getBestPathIds directly', () => {
                it('paths for direct and exitSwap + one swap amounts, should return best path - exitSwap', async () => {
                    const tokenIn = RANDOM;
                    const tokenOut = USDC;
                    const bptToken =
                        '0xebfed20e11dc08fcda1af1fda146945e8710f22e';
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmount: BigNumber = bnum('0.01');
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');

                    const poolDirect: any = newWeightedPool(
                        poolsFromFile.poolsDirectWorseExit[0]
                    ); // TokenIn > TokenOut - worse price
                    const poolBptSwap: any = newStablePool(
                        poolsFromFile.metaPool2[1]
                    ); // TokenIn > BPT
                    const poolToExit: any = newStablePool(
                        poolsFromFile.metaPool2[0]
                    ); // BPT > exitPool - TokenOut

                    const poolsDict = {};
                    poolsDict[poolDirect.id] = poolDirect;
                    poolsDict[poolToExit.id] = poolToExit;
                    poolsDict[poolBptSwap.id] = poolBptSwap;

                    const poolPairDataDirect = poolDirect.parsePoolPairData(
                        tokenIn,
                        tokenOut
                    );
                    const poolPairDataToExit = poolToExit.parsePoolPairData(
                        bptToken,
                        tokenOut
                    );
                    const poolPairDataBpt = poolBptSwap.parsePoolPairData(
                        tokenIn,
                        bptToken
                    );

                    const swapAmounts = [swapAmount];

                    const swapDirect = {
                        pool: poolDirect.id,
                        tokenIn,
                        tokenOut,
                        swapAmount: swapAmounts[0].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 6,
                    };

                    const pathDirect: NewPath = {
                        id: poolDirect.id,
                        swaps: [swapDirect],
                        poolPairData: [poolPairDataDirect],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolDirect],
                        pathSwapType: PathSwapTypes.TokenSwap,
                    };

                    const swapBpt = {
                        pool: poolBptSwap.id,
                        tokenIn,
                        tokenOut: bptToken,
                        swapAmount: swapAmounts[0].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const swapExit = {
                        pool: poolToExit.id,
                        tokenIn: bptToken,
                        tokenOut,
                        swapAmount: '0',
                        tokenInDecimals: 18,
                        tokenOutDecimals: 6,
                    };

                    const pathExitSwap: NewPath = {
                        id: `${poolBptSwap.id}-${poolToExit.id}`,
                        swaps: [swapBpt, swapExit],
                        poolPairData: [poolPairDataBpt, poolPairDataToExit],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolBptSwap, poolToExit],
                        pathSwapType: PathSwapTypes.ExitSwap,
                    };

                    // Calculates correct limits to make sure valid
                    let paths;
                    [paths] = calculatePathLimits(
                        [pathDirect, pathExitSwap],
                        swapType
                    );

                    const [
                        selectedPaths,
                        selectedPathExceedingAmounts,
                        selectedPathLimitAmounts,
                        bestPathIds,
                    ] = getBestPathIds(poolsDict, paths, swapType, swapAmounts);

                    expect(selectedPaths.length).eq(1);
                    expect(bestPathIds.length).eq(1);
                    expect(selectedPaths[0]).deep.eq(pathExitSwap);
                });

                // TO DO - SHOULD THIS HAVE BETTER PRICE?
                // it('paths for direct and exitSwap + one swap amounts, should return best path - direct', async () => {
                //     const tokenIn = RANDOM;
                //     const tokenOut = USDC;
                //     const bptToken = '0xebfed20e11dc08fcda1af1fda146945e8710f22e';
                //     const swapType = SwapTypes.SwapExactIn;
                //     const swapAmount: BigNumber = bnum('0.01');
                //     const poolsFromFile = require('./testData/stablePools/metaPool2.json');

                //     const poolDirect: any = newStablePool(poolsFromFile.poolsDirectExit[0]); // TokenIn > TokenOut - worse price
                //     const poolBptSwap: any = newStablePool(poolsFromFile.metaPool2[1]); // TokenIn > BPT
                //     const poolToExit: any = newStablePool(poolsFromFile.metaPool2[0]); // BPT > exitPool - TokenOut

                //     const poolsDict = {};
                //     poolsDict[poolDirect.id] = poolDirect;
                //     poolsDict[poolToExit.id] = poolToExit;
                //     poolsDict[poolBptSwap.id] = poolBptSwap;

                //     const poolPairDataDirect = poolDirect.parsePoolPairData(tokenIn, tokenOut);
                //     const poolPairDataToExit = poolToExit.parsePoolPairData(bptToken, tokenOut);
                //     const poolPairDataBpt = poolBptSwap.parsePoolPairData(tokenIn, bptToken);

                //     const swapAmounts = [swapAmount];

                //     const swapDirect = {
                //         pool: poolDirect.id,
                //         tokenIn,
                //         tokenOut,
                //         swapAmount: swapAmounts[0].toString(),
                //         tokenInDecimals: 18,
                //         tokenOutDecimals: 6
                //     }

                //     const pathDirect: NewPath = {
                //         id: poolDirect.id,
                //         swaps: [swapDirect],
                //         poolPairData: [poolPairDataDirect],
                //         limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                //         pools: [poolDirect],
                //         pathSwapType: PathSwapTypes.TokenSwap
                //     }

                //     const swapBpt = {
                //         pool: poolBptSwap.id,
                //         tokenIn,
                //         tokenOut: bptToken,
                //         swapAmount: swapAmounts[0].toString(),
                //         tokenInDecimals: 18,
                //         tokenOutDecimals: 18
                //     }

                //     const swapExit = {
                //         pool: poolToExit.id,
                //         tokenIn: bptToken,
                //         tokenOut,
                //         swapAmount: '0',
                //         tokenInDecimals: 18,
                //         tokenOutDecimals: 6
                //     }

                //     const pathExitSwap: NewPath = {
                //         id: `${poolBptSwap.id}-${poolToExit.id}`,
                //         swaps: [swapBpt, swapExit],
                //         poolPairData: [poolPairDataBpt, poolPairDataToExit],
                //         limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                //         pools: [poolBptSwap, poolToExit],
                //         pathSwapType: PathSwapTypes.ExitSwap
                //     }

                //     // Calculates correct limits to make sure valid
                //     let paths;
                //     [paths] = calculatePathLimits([pathDirect, pathExitSwap], swapType);

                //     const [selectedPaths,
                //         selectedPathExceedingAmounts,
                //         selectedPathLimitAmounts,
                //         bestPathIds] = getBestPathIds(
                //             poolsDict,
                //             paths,
                //             swapType,
                //             swapAmounts
                //         )

                //     expect(selectedPaths.length).eq(1);
                //     expect(bestPathIds.length).eq(1);
                //     expect(selectedPaths[0]).deep.eq(pathDirect);
                // });

                it('paths for direct and exitSwap + two swap amounts, should return two paths', async () => {
                    // BatchRelayer can handle exit and batchSwaps
                    const tokenIn = RANDOM;
                    const tokenOut = USDC;
                    const bptToken =
                        '0xebfed20e11dc08fcda1af1fda146945e8710f22e';
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmount: BigNumber = bnum('0.01');
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');

                    const poolDirect: any = newStablePool(
                        poolsFromFile.poolsDirectExit[0]
                    ); // TokenIn > TokenOut - worse price
                    const poolBptSwap: any = newStablePool(
                        poolsFromFile.metaPool2[1]
                    ); // TokenIn > BPT
                    const poolToExit: any = newStablePool(
                        poolsFromFile.metaPool2[0]
                    ); // BPT > exitPool - TokenOut

                    const poolsDict = {};
                    poolsDict[poolDirect.id] = poolDirect;
                    poolsDict[poolToExit.id] = poolToExit;
                    poolsDict[poolBptSwap.id] = poolBptSwap;

                    const poolPairDataDirect = poolDirect.parsePoolPairData(
                        tokenIn,
                        tokenOut
                    );
                    const poolPairDataToExit = poolToExit.parsePoolPairData(
                        bptToken,
                        tokenOut
                    );
                    const poolPairDataBpt = poolBptSwap.parsePoolPairData(
                        tokenIn,
                        bptToken
                    );

                    // Split swap amount equally between direct path and joinSwap path
                    const swapAmounts = [swapAmount.div(2), swapAmount.div(2)];

                    const swapDirect = {
                        pool: poolDirect.id,
                        tokenIn,
                        tokenOut,
                        swapAmount: swapAmounts[0].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 6,
                    };

                    const pathDirect: NewPath = {
                        id: poolDirect.id,
                        swaps: [swapDirect],
                        poolPairData: [poolPairDataDirect],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolDirect],
                        pathSwapType: PathSwapTypes.TokenSwap,
                    };

                    const swapBpt = {
                        pool: poolBptSwap.id,
                        tokenIn,
                        tokenOut: bptToken,
                        swapAmount: swapAmounts[1].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const swapExit = {
                        pool: poolToExit.id,
                        tokenIn: bptToken,
                        tokenOut,
                        swapAmount: '0',
                        tokenInDecimals: 18,
                        tokenOutDecimals: 6,
                    };

                    const pathExitSwap: NewPath = {
                        id: `${poolBptSwap.id}-${poolToExit.id}`,
                        swaps: [swapBpt, swapExit],
                        poolPairData: [poolPairDataBpt, poolPairDataToExit],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolBptSwap, poolToExit],
                        pathSwapType: PathSwapTypes.ExitSwap,
                    };

                    // Calculates correct limits to make sure valid
                    let paths;
                    [paths] = calculatePathLimits(
                        [pathDirect, pathExitSwap],
                        swapType
                    );

                    const [
                        selectedPaths,
                        selectedPathExceedingAmounts,
                        selectedPathLimitAmounts,
                        bestPathIds,
                    ] = getBestPathIds(poolsDict, paths, swapType, swapAmounts);

                    expect(selectedPaths.length).eq(2);
                    expect(bestPathIds.length).eq(2);
                    expect(selectedPaths[0]).deep.eq(pathExitSwap);
                    expect(selectedPaths[1]).deep.eq(pathDirect);
                });

                it('paths for two exitSwaps + two swap amounts, should return no paths', async () => {
                    // With the BatchRelayer simplifications we can only use a exitSwap for a single path
                    // So if there are two swap amounts and two exitSwaps we have to return 0
                    const tokenIn = RANDOM;
                    const tokenOut = USDC;
                    const bptToken =
                        '0xebfed20e11dc08fcda1af1fda146945e8710f22e';
                    const bptToken2 =
                        '0xebfed10e11dc08fcda1af1fda146945e8710f22e';
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmount: BigNumber = bnum('0.01');
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');

                    const poolBptSwap: any = newStablePool(
                        poolsFromFile.metaPool2[1]
                    ); // TokenIn > BPT
                    const poolToExit: any = newStablePool(
                        poolsFromFile.metaPool2[0]
                    ); // BPT > exitPool - TokenOut
                    const poolBptSwap2: any = newStablePool(
                        poolsFromFile.pools[1]
                    ); // TokenIn > BPT
                    const poolToExit2: any = newStablePool(
                        poolsFromFile.pools[0]
                    ); // BPT > exitPool - TokenOut

                    const poolsDict = {};
                    poolsDict[poolToExit.id] = poolToExit;
                    poolsDict[poolBptSwap.id] = poolBptSwap;
                    poolsDict[poolToExit2.id] = poolToExit2;
                    poolsDict[poolBptSwap2.id] = poolBptSwap2;

                    const poolPairDataToExit = poolToExit.parsePoolPairData(
                        bptToken,
                        tokenOut
                    );
                    const poolPairDataBpt = poolBptSwap.parsePoolPairData(
                        tokenIn,
                        bptToken
                    );
                    const poolPairDataToExit2 = poolToExit2.parsePoolPairData(
                        bptToken2,
                        tokenOut
                    );
                    const poolPairDataBpt2 = poolBptSwap2.parsePoolPairData(
                        tokenIn,
                        bptToken2
                    );

                    // Split swap amount equally between direct path and joinSwap path
                    const swapAmounts = [swapAmount.div(2), swapAmount.div(2)];

                    const swapBpt = {
                        pool: poolBptSwap.id,
                        tokenIn,
                        tokenOut: bptToken,
                        swapAmount: swapAmounts[1].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const swapExit = {
                        pool: poolToExit.id,
                        tokenIn: bptToken,
                        tokenOut,
                        swapAmount: '0',
                        tokenInDecimals: 18,
                        tokenOutDecimals: 6,
                    };

                    const pathExitSwap: NewPath = {
                        id: `${poolBptSwap.id}-${poolToExit.id}`,
                        swaps: [swapBpt, swapExit],
                        poolPairData: [poolPairDataBpt, poolPairDataToExit],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolBptSwap, poolToExit],
                        pathSwapType: PathSwapTypes.ExitSwap,
                    };

                    const swapBpt2 = {
                        pool: poolBptSwap2.id,
                        tokenIn,
                        tokenOut: bptToken2,
                        swapAmount: swapAmounts[1].toString(),
                        tokenInDecimals: 18,
                        tokenOutDecimals: 18,
                    };

                    const swapExit2 = {
                        pool: poolToExit2.id,
                        tokenIn: bptToken2,
                        tokenOut,
                        swapAmount: '0',
                        tokenInDecimals: 18,
                        tokenOutDecimals: 6,
                    };

                    const pathExitSwap2: NewPath = {
                        id: `${poolBptSwap2.id}-${poolToExit2.id}`,
                        swaps: [swapBpt2, swapExit2],
                        poolPairData: [poolPairDataBpt2, poolPairDataToExit2],
                        limitAmount: bnum(`0`), // Should be added properly by getBestPathIds
                        pools: [poolBptSwap2, poolToExit2],
                        pathSwapType: PathSwapTypes.ExitSwap,
                    };

                    // Calculates correct limits to make sure valid
                    let paths;
                    [paths] = calculatePathLimits(
                        [pathExitSwap, pathExitSwap2],
                        swapType
                    );

                    const [
                        selectedPaths,
                        selectedPathExceedingAmounts,
                        selectedPathLimitAmounts,
                        bestPathIds,
                    ] = getBestPathIds(poolsDict, paths, swapType, swapAmounts);

                    expect(selectedPaths.length).eq(0);
                    expect(bestPathIds.length).eq(0);
                });
            });
            //     // TODO - Add correct formatting for relayer
            context('fullSwaps', () => {
                it('metapool, should return exitSwap with relayer flag and format', async () => {
                    const poolsFromFile: SubGraphPoolsBase = require('./testData/stablePools/metaPool2.json');
                    const tokenIn = RANDOM;
                    const tokenOut = USDC;
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmt: BigNumber = bnum('0.01');

                    const sor = new SOR(
                        provider,
                        gasPrice,
                        maxPools,
                        chainId,
                        poolsFromFile
                    );

                    const fetchSuccess = await sor.fetchPools(false);

                    let swapInfo: SwapInfo = await sor.getSwaps(
                        tokenIn,
                        tokenOut,
                        swapType,
                        swapAmt
                    );

                    // TO DO - Need to return in correct format for Relayer
                    // Should return TokenIn > BPT > exit - TokenOut
                    expect(swapInfo.isRelayerSwap).to.be.true;
                    expect(swapInfo.swaps.length).eq(2);
                    expect(swapInfo.swaps[0].amount.toString()).eq(
                        swapAmt.times(1e18).toString()
                    );
                    expect(swapInfo.swaps[0].poolId).eq(
                        poolsFromFile.pools[1].id
                    );
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetInIndex]
                    ).eq(tokenIn);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetOutIndex]
                    ).eq(poolsFromFile.pools[0].address);

                    expect(swapInfo.swaps[1].amount.toString()).eq('0');
                    expect(swapInfo.swaps[1].poolId).eq(
                        poolsFromFile.pools[0].id
                    );
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetInIndex]
                    ).eq(poolsFromFile.pools[0].address);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetOutIndex]
                    ).eq(tokenOut);
                    // TO DO - Confirm amount via maths
                    expect(swapInfo.returnAmount.toString()).eq('19985');
                });

                it('2 metapool paths (SwapExactIn), should return single exitSwap with relayer flag and format', async () => {
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');
                    const pools = {
                        pools: poolsFromFile.pools.concat(
                            poolsFromFile.metaPool2
                        ),
                    };
                    const tokenIn = RANDOM;
                    const tokenOut = USDC;
                    const swapType = SwapTypes.SwapExactIn;
                    const swapAmt: BigNumber = bnum('0.01');

                    const sor = new SOR(
                        provider,
                        gasPrice,
                        maxPools,
                        chainId,
                        pools
                    );

                    const fetchSuccess = await sor.fetchPools(false);

                    let swapInfo: SwapInfo = await sor.getSwaps(
                        tokenIn,
                        tokenOut,
                        swapType,
                        swapAmt
                    );

                    // TO DO - Need to return in correct format for Relayer
                    // Should return TokenIn > BPT > exit - TokenOut
                    expect(swapInfo.isRelayerSwap).to.be.true;
                    expect(swapInfo.swaps.length).eq(2);
                    expect(swapInfo.swaps[0].amount.toString()).eq(
                        swapAmt.times(1e18).toString()
                    );
                    expect(swapInfo.swaps[0].poolId).eq(pools.pools[3].id);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetInIndex]
                    ).eq(tokenIn);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetOutIndex]
                    ).eq(pools.pools[2].address);

                    expect(swapInfo.swaps[1].amount.toString()).eq('0');
                    expect(swapInfo.swaps[1].poolId).eq(pools.pools[2].id);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetInIndex]
                    ).eq(pools.pools[2].address);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetOutIndex]
                    ).eq(tokenOut);
                    // TO DO - Confirm amount via maths
                    expect(swapInfo.returnAmount.toString()).eq('19985');
                });

                it('2 metapool paths (SwapExactOut), should return single exitSwap with relayer flag and format', async () => {
                    const poolsFromFile = require('./testData/stablePools/metaPool2.json');
                    const pools = {
                        pools: poolsFromFile.pools.concat(
                            poolsFromFile.metaPool2
                        ),
                    };
                    const tokenIn = RANDOM;
                    const tokenOut = USDC;
                    const swapType = SwapTypes.SwapExactOut;
                    const swapAmt: BigNumber = bnum('0.019985');

                    const sor = new SOR(
                        provider,
                        gasPrice,
                        maxPools,
                        chainId,
                        pools
                    );

                    const fetchSuccess = await sor.fetchPools(false);

                    let swapInfo: SwapInfo = await sor.getSwaps(
                        tokenIn,
                        tokenOut,
                        swapType,
                        swapAmt
                    );

                    // TO DO - Need to return in correct format for Relayer
                    // Should return TokenIn > BPT > exit - TokenOut
                    expect(swapInfo.isRelayerSwap).to.be.true;
                    expect(swapInfo.swaps.length).eq(2);
                    expect(swapInfo.swaps[0].amount.toString()).eq(
                        swapAmt.times(1e6).toString()
                    );
                    expect(swapInfo.swaps[0].poolId).eq(pools.pools[2].id);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetInIndex]
                    ).eq(pools.pools[2].address);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[0].assetOutIndex]
                    ).eq(tokenOut);

                    expect(swapInfo.swaps[1].amount.toString()).eq('0');
                    expect(swapInfo.swaps[1].poolId).eq(pools.pools[3].id);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetInIndex]
                    ).eq(tokenIn);
                    expect(
                        swapInfo.tokenAddresses[swapInfo.swaps[1].assetOutIndex]
                    ).eq(pools.pools[2].address);
                    // TO DO - Confirm amount via maths
                    expect(swapInfo.returnAmount.toString()).eq(
                        '9999862001621273'
                    );
                });
            });
        });
    }
});
