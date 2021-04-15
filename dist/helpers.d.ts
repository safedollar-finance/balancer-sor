import { BigNumber } from './utils/bignumber';
import {
    PoolPairData,
    Path,
    Swap,
    DisabledOptions,
    SubGraphPool,
    SubGraphPoolDictionary,
    SwapInfo,
} from './types';
export declare function getLimitAmountSwap(
    poolPairData: PoolPairData,
    swapType: string
): BigNumber;
export declare function getLimitAmountSwapForPath(
    pools: SubGraphPoolDictionary,
    path: Path,
    swapType: string
): BigNumber;
export declare function getOutputAmountSwap(
    poolPairData: PoolPairData,
    swapType: string,
    amount: BigNumber
): BigNumber;
export declare function getOutputAmountSwapForPath(
    pools: SubGraphPoolDictionary,
    path: Path,
    swapType: string,
    amount: BigNumber
): BigNumber;
export declare function getEffectivePriceSwapForPath(
    pools: SubGraphPoolDictionary,
    path: Path,
    swapType: string,
    amount: BigNumber
): BigNumber;
export declare function getSpotPriceAfterSwap(
    poolPairData: PoolPairData,
    swapType: string,
    amount: BigNumber
): BigNumber;
export declare function getSpotPriceAfterSwapForPath(
    pools: SubGraphPoolDictionary,
    path: Path,
    swapType: string,
    amount: BigNumber
): BigNumber;
export declare function getDerivativeSpotPriceAfterSwap(
    poolPairData: PoolPairData,
    swapType: string,
    amount: BigNumber
): BigNumber;
export declare function getDerivativeSpotPriceAfterSwapForPath(
    pools: SubGraphPoolDictionary,
    path: Path,
    swapType: string,
    amount: BigNumber
): BigNumber;
export declare function getHighestLimitAmountsForPaths(
    paths: Path[],
    maxPools: number
): BigNumber[];
export declare const parsePoolPairData: (
    p: SubGraphPool,
    tokenIn: string,
    tokenOut: string
) => PoolPairData;
export declare function parsePoolPairDataForPath(
    pools: SubGraphPoolDictionary,
    path: Path,
    swapType: string
): PoolPairData[];
export declare function EVMgetOutputAmountSwapForPath(
    pools: SubGraphPoolDictionary,
    path: Path,
    swapType: string,
    amount: BigNumber
): BigNumber;
export declare function EVMgetOutputAmountSwap(
    pools: SubGraphPoolDictionary,
    poolPairData: PoolPairData,
    swapType: string,
    amount: BigNumber
): BigNumber;
export declare function updateTokenBalanceForPool(
    pool: any,
    token: string,
    balance: BigNumber
): any;
export declare function getNormalizedLiquidity(
    poolPairData: PoolPairData
): BigNumber;
export declare const parsePoolData: (
    directPools: SubGraphPoolDictionary,
    tokenIn: string,
    tokenOut: string,
    mostLiquidPoolsFirstHop?: SubGraphPool[],
    mostLiquidPoolsSecondHop?: SubGraphPool[],
    hopTokens?: string[]
) => [SubGraphPoolDictionary, Path[]];
export declare function filterPools(
    allPools: SubGraphPool[], // The complete information of the pools
    tokenIn: string,
    tokenOut: string,
    maxPools: number,
    disabledOptions?: DisabledOptions
): [
    SubGraphPoolDictionary,
    string[],
    SubGraphPoolDictionary,
    SubGraphPoolDictionary
];
export declare function sortPoolsMostLiquid(
    tokenIn: string,
    tokenOut: string,
    hopTokens: string[],
    poolsTokenInNoTokenOut: SubGraphPoolDictionary,
    poolsTokenOutNoTokenIn: SubGraphPoolDictionary
): [SubGraphPool[], SubGraphPool[]];
export declare function normalizePools(
    pools: any
): {
    pools: any[];
};
export declare function formatSwaps(
    swaps: Swap[][],
    swapType: string,
    swapAmount: BigNumber,
    tokenIn: string,
    tokenOut: string,
    returnAmount: BigNumber,
    marketSp: BigNumber
): SwapInfo;
