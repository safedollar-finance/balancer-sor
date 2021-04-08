import { BigNumber } from './utils/bignumber';
import { Path, Swap, SubGraphPoolDictionary } from './types';
export declare const MAX_UINT: import('@ethersproject/bignumber').BigNumber;
export declare function processPaths(
    paths: Path[],
    pools: SubGraphPoolDictionary,
    swapType: string
): [Path[], BigNumber];
export declare function filterPaths(
    pools: SubGraphPoolDictionary,
    paths: Path[], // Paths must come already sorted by descending limitAmount
    swapType: string,
    maxPools: Number,
    maxLiquidityAvailable: BigNumber,
    costOutputToken: BigNumber
): Path[];
export declare const smartOrderRouter: (
    pools: SubGraphPoolDictionary,
    paths: Path[],
    swapType: string,
    totalSwapAmount: BigNumber,
    maxPools: number,
    costReturnToken: BigNumber
) => [Swap[][], BigNumber, BigNumber];
export declare const calcTotalReturn: (
    pools: SubGraphPoolDictionary,
    paths: Path[],
    swapType: string,
    swapAmounts: BigNumber[]
) => BigNumber;
