'use strict';
var __awaiter =
    (this && this.__awaiter) ||
    function(thisArg, _arguments, P, generator) {
        function adopt(value) {
            return value instanceof P
                ? value
                : new P(function(resolve) {
                      resolve(value);
                  });
        }
        return new (P || (P = Promise))(function(resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value));
                } catch (e) {
                    reject(e);
                }
            }
            function rejected(value) {
                try {
                    step(generator['throw'](value));
                } catch (e) {
                    reject(e);
                }
            }
            function step(result) {
                result.done
                    ? resolve(result.value)
                    : adopt(result.value).then(fulfilled, rejected);
            }
            step(
                (generator = generator.apply(thisArg, _arguments || [])).next()
            );
        });
    };
var __importStar =
    (this && this.__importStar) ||
    function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null)
            for (var k in mod)
                if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
        result['default'] = mod;
        return result;
    };
Object.defineProperty(exports, '__esModule', { value: true });
const bignumber_1 = require('./utils/bignumber');
const sor = __importStar(require('./index'));
const index_1 = require('./index');
const bmath_1 = require('./bmath');
class SOR {
    constructor(
        provider,
        gasPrice,
        maxPools,
        chainId,
        poolsSource,
        disabledOptions = {
            isOverRide: false,
            disabledTokens: [],
        }
    ) {
        this.MULTIADDR = {
            1: '0xeefba1e63905ef1d7acba5a8513c70307c1ce441',
            42: '0x2cc8688C5f75E365aaEEb4ea8D6a480405A48D2A',
        };
        this.VAULTADDR = {
            1: '0x99EceD8Ba43D090CA4283539A31431108FD34438',
            42: '0x99EceD8Ba43D090CA4283539A31431108FD34438',
        };
        // avg Balancer swap cost. Can be updated manually if required.
        this.swapCost = new bignumber_1.BigNumber('100000');
        this.tokenCost = {};
        this.onChainBalanceCache = { pools: [] };
        this.poolsForPairsCache = {};
        this.processedDataCache = {};
        this.finishedFetchingOnChain = false;
        console.log('SORV2');
        this.provider = provider;
        this.gasPrice = gasPrice;
        this.maxPools = maxPools;
        this.chainId = chainId;
        // The pools source can be a URL (e.g. pools from Subgraph) or a data set of pools
        if (typeof poolsSource === 'string') {
            this.isUsingPoolsUrl = true;
            this.poolsUrl = poolsSource;
        } else {
            this.isUsingPoolsUrl = false;
            this.subgraphPools = poolsSource;
        }
        this.disabledOptions = disabledOptions;
        this.pools = new index_1.POOLS();
    }
    /*
    Find and cache cost of token.
    If cost is passed then it manually sets the value.
    */
    setCostOutputToken(tokenOut, cost = null) {
        return __awaiter(this, void 0, void 0, function*() {
            tokenOut = tokenOut.toLowerCase();
            if (cost === null) {
                // This calculates the cost to make a swap which is used as an input to SOR to allow it to make gas efficient recommendations
                const costOutputToken = yield sor.getCostOutputToken(
                    tokenOut,
                    this.gasPrice,
                    this.swapCost,
                    this.provider,
                    this.chainId
                );
                this.tokenCost[tokenOut] = costOutputToken;
                return costOutputToken;
            } else {
                this.tokenCost[tokenOut] = cost;
                return cost;
            }
        });
    }
    // Fetch all pools, in Subgraph format (strings/not scaled) from URL then retrieve OnChain balances
    fetchPools(isOnChain = true) {
        return __awaiter(this, void 0, void 0, function*() {
            try {
                let subgraphPools;
                // Retrieve from URL if set otherwise use data passed
                if (this.isUsingPoolsUrl)
                    subgraphPools = yield this.pools.getAllPublicSwapPools(
                        this.poolsUrl
                    );
                else subgraphPools = this.subgraphPools;
                let previousStringify = JSON.stringify(
                    this.onChainBalanceCache
                ); // Used for compare
                // Get latest on-chain balances (returns data in string/normalized format)
                this.onChainBalanceCache = yield this.fetchOnChainBalances(
                    subgraphPools,
                    isOnChain
                );
                // If new pools are different from previous then any previous processed data is out of date so clear
                if (
                    previousStringify !==
                    JSON.stringify(this.onChainBalanceCache)
                ) {
                    this.processedDataCache = {};
                }
                this.finishedFetchingOnChain = true;
                return true;
            } catch (err) {
                // On error clear all caches and return false so user knows to try again.
                this.finishedFetchingOnChain = false;
                this.onChainBalanceCache = { pools: [] };
                this.processedDataCache = {};
                console.error(`Error: fetchPools(): ${err.message}`);
                return false;
            }
        });
    }
    /*
    Uses multicall contract to fetch all onchain balances for pools.
    */
    fetchOnChainBalances(subgraphPools, isOnChain = true) {
        return __awaiter(this, void 0, void 0, function*() {
            if (subgraphPools.pools.length === 0) {
                console.error('ERROR: No Pools To Fetch.');
                return { pools: [] };
            }
            // Allows for testing
            if (!isOnChain) {
                console.log(
                    `!!!!!!! WARNING - Not Using Real OnChain Balances !!!!!!`
                );
                return subgraphPools;
            }
            // This will return in normalized/string format
            const onChainPools = yield sor.getOnChainBalances(
                subgraphPools,
                this.MULTIADDR[this.chainId],
                this.VAULTADDR[this.chainId],
                this.provider
            );
            // Error with multicall
            if (!onChainPools) return { pools: [] };
            return onChainPools;
        });
    }
    getSwaps(tokenIn, tokenOut, swapType, swapAmt) {
        return __awaiter(this, void 0, void 0, function*() {
            // The Subgraph returns tokens in lower case format so we must match this
            tokenIn = tokenIn.toLowerCase();
            tokenOut = tokenOut.toLowerCase();
            let swapInfo = {
                tokenAddresses: [],
                swaps: [],
                swapAmount: bmath_1.bnum(0),
                tokenIn: '',
                tokenOut: '',
                returnAmount: bmath_1.bnum(0),
                marketSp: bmath_1.bnum(0),
            };
            if (this.finishedFetchingOnChain) {
                // All Pools with OnChain Balances is already fetched so use that
                swapInfo = yield this.processSwaps(
                    tokenIn,
                    tokenOut,
                    swapType,
                    swapAmt,
                    this.onChainBalanceCache
                );
            } else {
                // Haven't retrieved all pools/balances so we use the pools for pairs if previously fetched
                if (!this.poolsForPairsCache[this.createKey(tokenIn, tokenOut)])
                    return swapInfo;
                swapInfo = yield this.processSwaps(
                    tokenIn,
                    tokenOut,
                    swapType,
                    swapAmt,
                    this.poolsForPairsCache[this.createKey(tokenIn, tokenOut)],
                    false
                );
            }
            return swapInfo;
        });
    }
    // Will process swap/pools data and return best swaps
    // useProcessCache can be false to force fresh processing of paths/prices
    processSwaps(
        tokenIn,
        tokenOut,
        swapType,
        swapAmt,
        onChainPools,
        useProcessCache = true
    ) {
        return __awaiter(this, void 0, void 0, function*() {
            let swapInfo = {
                tokenAddresses: [],
                swaps: [],
                swapAmount: bmath_1.bnum(0),
                tokenIn: '',
                tokenOut: '',
                returnAmount: bmath_1.bnum(0),
                marketSp: bmath_1.bnum(0),
            };
            if (onChainPools.pools.length === 0) return swapInfo;
            let pools, paths, marketSp;
            // If token pair has been processed before that info can be reused to speed up execution
            let cache = this.processedDataCache[
                `${tokenIn}${tokenOut}${swapType}`
            ];
            // useProcessCache can be false to force fresh processing of paths/prices
            if (!useProcessCache || !cache) {
                // If not previously cached we must process all paths/prices.
                // Always use onChain info
                // Some functions alter pools list directly but we want to keep original so make a copy to work from
                let poolsList = JSON.parse(JSON.stringify(onChainPools));
                let pathData;
                [pools, pathData] = this.processPairPools(
                    tokenIn,
                    tokenOut,
                    poolsList
                );
                paths = this.processPathsAndPrices(pathData, pools, swapType);
                // Update cache if used
                if (useProcessCache)
                    this.processedDataCache[
                        `${tokenIn}${tokenOut}${swapType}`
                    ] = {
                        pools: pools,
                        paths: paths,
                        marketSp: marketSp,
                    };
            } else {
                // Using pre-processed data from cache
                pools = cache.pools;
                paths = cache.paths;
                marketSp = cache.marketSp;
            }
            let costOutputToken = this.tokenCost[tokenOut];
            if (swapType === 'swapExactOut')
                costOutputToken = this.tokenCost[tokenIn];
            // Use previously stored value if exists else default to 0
            if (costOutputToken === undefined) {
                costOutputToken = new bignumber_1.BigNumber(0);
            }
            // Returns list of swaps
            // swapExactIn - total = total amount swap will return of tokenOut
            // swapExactOut - total = total amount of tokenIn required for swap
            let swaps, total;
            [swaps, total, marketSp] = sor.smartOrderRouter(
                JSON.parse(JSON.stringify(pools)), // Need to keep original pools for cache
                paths,
                swapType,
                swapAmt,
                this.maxPools,
                costOutputToken
            );
            if (useProcessCache)
                this.processedDataCache[
                    `${tokenIn}${tokenOut}${swapType}`
                ].marketSp = marketSp;
            swapInfo = sor.formatSwaps(
                swaps,
                swapType,
                swapAmt,
                tokenIn,
                tokenOut,
                total,
                marketSp
            );
            return swapInfo;
        });
    }
    /*
    This is used as a quicker alternative to fetching all pools information.
    A subset of pools for token pair is found by checking swaps for range of input amounts.
    The onchain balances for the subset of pools is retrieved and cached for future swap calculations (i.e. when amts change).
    */
    fetchFilteredPairPools(tokenIn, tokenOut, isOnChain = true) {
        return __awaiter(this, void 0, void 0, function*() {
            tokenIn = tokenIn.toLowerCase();
            tokenOut = tokenOut.toLowerCase();
            try {
                let allPoolsNonBig;
                // Retrieve from URL if set otherwise use data passed
                if (this.isUsingPoolsUrl)
                    allPoolsNonBig = yield this.pools.getAllPublicSwapPools(
                        this.poolsUrl
                    );
                else
                    allPoolsNonBig = JSON.parse(
                        JSON.stringify(this.subgraphPools)
                    );
                // Convert to BigNumber format
                /*
                let allPools = await this.pools.formatPoolsBigNumber(
                    allPoolsNonBig
                );
                */
                let allPools = allPoolsNonBig;
                // These can be shared for both swap Types
                let pools, pathData;
                [pools, pathData] = this.processPairPools(
                    tokenIn,
                    tokenOut,
                    allPools
                );
                // Find paths and prices for swap types
                let pathsExactIn;
                pathsExactIn = this.processPathsAndPrices(
                    JSON.parse(JSON.stringify(pathData)),
                    pools,
                    'swapExactIn'
                );
                let pathsExactOut;
                pathsExactOut = this.processPathsAndPrices(
                    pathData,
                    pools,
                    'swapExactOut'
                );
                // Use previously stored value if exists else default to 0
                let costOutputToken = this.tokenCost[tokenOut];
                if (costOutputToken === undefined) {
                    costOutputToken = new bignumber_1.BigNumber(0);
                }
                let allSwaps = [];
                let range = [
                    bmath_1.bnum('0.01'),
                    bmath_1.bnum('0.1'),
                    bmath_1.bnum('1'),
                    bmath_1.bnum('10'),
                    bmath_1.bnum('100'),
                    bmath_1.bnum('1000'),
                ];
                // Calculate swaps for swapExactIn/Out over range and save swaps (with pools) returned
                range.forEach(amt => {
                    let amtIn = amt;
                    let amtOut = amtIn;
                    let swaps, total;
                    [swaps, total] = sor.smartOrderRouter(
                        JSON.parse(JSON.stringify(pools)), // Need to keep original pools
                        pathsExactIn,
                        'swapExactIn',
                        amtIn,
                        this.maxPools,
                        costOutputToken
                    );
                    allSwaps.push(swaps);
                    [swaps, total] = sor.smartOrderRouter(
                        JSON.parse(JSON.stringify(pools)), // Need to keep original pools
                        pathsExactOut,
                        'swapExactOut',
                        amtOut,
                        this.maxPools,
                        costOutputToken
                    );
                    allSwaps.push(swaps);
                });
                // List of unique pool addresses
                let filteredPools = [];
                // get unique swap pools
                allSwaps.forEach(swap => {
                    swap.forEach(seq => {
                        seq.forEach(p => {
                            if (!filteredPools.includes(p.pool))
                                filteredPools.push(p.pool);
                        });
                    });
                });
                // Get list of pool infos for pools of interest
                let poolsOfInterest = [];
                for (let i = 0; i < allPoolsNonBig.pools.length; i++) {
                    let index = filteredPools.indexOf(
                        allPoolsNonBig.pools[i].id
                    );
                    if (index > -1) {
                        filteredPools.splice(index, 1);
                        poolsOfInterest.push(allPoolsNonBig.pools[i]);
                        if (filteredPools.length === 0) break;
                    }
                }
                let onChainPools = { pools: [] };
                if (poolsOfInterest.length !== 0) {
                    // Get latest onchain balances for pools of interest(returns data in string / normalized format)
                    onChainPools = yield this.fetchOnChainBalances(
                        {
                            pools: poolsOfInterest,
                        },
                        isOnChain
                    );
                }
                // Add to cache for future use
                this.poolsForPairsCache[
                    this.createKey(tokenIn, tokenOut)
                ] = onChainPools;
                return true;
            } catch (err) {
                console.error(
                    `Error: fetchFilteredPairPools(): ${err.message}`
                );
                // Add to cache for future use
                this.poolsForPairsCache[this.createKey(tokenIn, tokenOut)] = {
                    pools: [],
                };
                return false;
            }
        });
    }
    // Finds pools and paths for token pairs. Independent of swap type.
    processPairPools(tokenIn, tokenOut, poolsList) {
        // Retrieves intermediate pools along with tokens that are contained in these.
        let directPools, hopTokens, poolsTokenIn, poolsTokenOut;
        [directPools, hopTokens, poolsTokenIn, poolsTokenOut] = sor.filterPools(
            poolsList.pools,
            tokenIn,
            tokenOut,
            this.maxPools,
            this.disabledOptions
        );
        // Sort intermediate pools by order of liquidity
        let mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop;
        [
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
        ] = sor.sortPoolsMostLiquid(
            tokenIn,
            tokenOut,
            hopTokens,
            poolsTokenIn,
            poolsTokenOut
        );
        // Finds the possible paths to make the swap
        let pathData;
        let pools;
        [pools, pathData] = sor.parsePoolData(
            directPools,
            tokenIn,
            tokenOut,
            mostLiquidPoolsFirstHop,
            mostLiquidPoolsSecondHop,
            hopTokens
        );
        return [pools, pathData];
    }
    // SwapType dependent - calculates paths prices/amounts
    processPathsAndPrices(PathArray, PoolsDict, SwapType) {
        let paths;
        [paths] = sor.processPaths(PathArray, PoolsDict, SwapType);
        return paths;
    }
    // Used for cache ids
    createKey(Token1, Token2) {
        return Token1 < Token2 ? `${Token1}${Token2}` : `${Token2}${Token1}`;
    }
    // Check if pair data already fetched (using fetchFilteredPairPools)
    hasDataForPair(tokenIn, tokenOut) {
        tokenIn = tokenIn.toLowerCase();
        tokenOut = tokenOut.toLowerCase();
        if (
            this.finishedFetchingOnChain ||
            this.poolsForPairsCache[this.createKey(tokenIn, tokenOut)]
        )
            return true;
        else return false;
    }
}
exports.SOR = SOR;
