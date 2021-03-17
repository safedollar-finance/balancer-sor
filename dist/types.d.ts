import { BigNumber } from './utils/bignumber';
export interface PoolPairData {
    id: string;
    poolType?: string;
    pairType?: string;
    tokenIn: string;
    tokenOut: string;
    balanceIn?: BigNumber;
    balanceOut?: BigNumber;
    weightIn?: BigNumber;
    weightOut?: BigNumber;
    swapFee: BigNumber;
    allBalances: BigNumber[];
    invariant?: BigNumber;
    amp?: BigNumber;
    tokenIndexIn?: number;
    tokenIndexOut?: number;
    decimalsIn: number;
    decimalsOut: number;
}
export interface Path {
    id: string;
    swaps: Swap[];
    poolPairData?: PoolPairData[];
    limitAmount?: BigNumber;
    filterEffectivePrice?: BigNumber;
}
export declare type Swap = {
    pool: string;
    tokenIn: string;
    tokenOut: string;
    swapAmount?: string;
    limitReturnAmount?: string;
    maxPrice?: string;
    tokenInDecimals: number;
    tokenOutDecimals: number;
};
export interface SubGraphPools {
    pools: SubGraphPool[];
}
export interface SubGraphPool {
    id: string;
    swapFee: string;
    amp: string;
    totalWeight: string;
    balanceBpt: string;
    tokens: SubGraphToken[];
    tokensList: string[];
}
export interface SubGraphToken {
    address: string;
    balance: string;
    decimals: string;
    denormWeight?: string;
}
export interface SubGraphPoolDictionary {
    [poolId: string]: SubGraphPool;
}
export interface DisabledOptions {
    isOverRide: boolean;
    disabledTokens: DisabledToken[];
}
export interface DisabledToken {
    address: string;
    symbol: string;
}
export interface SwapV2 {
    poolId: string;
    tokenInIndex: number;
    tokenOutIndex: number;
    amountIn?: string;
    amountOut?: string;
    userData: string;
}
export interface SwapInfo {
    tokenAddresses: string[];
    swaps: SwapV2[];
    swapAmount: BigNumber;
    returnAmount: BigNumber;
    tokenIn: string;
    tokenOut: string;
    marketSp: BigNumber;
}
