import { BigNumber } from '../utils/bignumber';
import { PoolBase, PoolTypes, TypesForSwap, PairTypes } from '../types';
export interface StablePoolToken {
    address: string;
    balance: string;
    decimals: string | number;
}
export interface StablePoolPairData {
    id: string;
    poolType: PoolTypes;
    pairType: PairTypes;
    tokenIn: string;
    tokenOut: string;
    balanceIn: BigNumber;
    balanceOut: BigNumber;
    swapFee: BigNumber;
    decimalsIn: number;
    decimalsOut: number;
    allBalances: BigNumber[];
    invariant: BigNumber;
    amp: BigNumber;
    tokenIndexIn: number;
    tokenIndexOut: number;
}
export declare class StablePool implements PoolBase {
    poolType: PoolTypes;
    typeForSwap: TypesForSwap;
    id: string;
    amp: string;
    swapFee: string;
    totalShares: string;
    tokens: StablePoolToken[];
    poolPairData: StablePoolPairData;
    constructor(
        id: string,
        amp: string,
        swapFee: string,
        totalShares: string,
        tokens: StablePoolToken[]
    );
    setTypeForSwap(type: TypesForSwap): void;
    parsePoolPairData(tokenIn: string, tokenOut: string): void;
}
