import { BigNumber } from '../utils/bignumber';
import { PoolBase, PoolTypes, TypesForSwap, PairTypes } from '../types';
export interface WeightedPoolToken {
    address: string;
    balance: string;
    decimals: string | number;
    denormWeight?: string;
}
export interface WeightedPoolPairData {
    id: string;
    poolType: PoolTypes;
    pairType: PairTypes;
    tokenIn: string;
    tokenOut: string;
    balanceIn: BigNumber;
    balanceOut: BigNumber;
    weightIn: BigNumber;
    weightOut: BigNumber;
    swapFee: BigNumber;
    decimalsIn: number;
    decimalsOut: number;
}
export declare class WeightedPool implements PoolBase {
    poolType: PoolTypes;
    typeForSwap: TypesForSwap;
    id: string;
    swapFee: string;
    totalShares: string;
    tokens: WeightedPoolToken[];
    totalWeight: string;
    poolPairData: WeightedPoolPairData;
    constructor(
        id: string,
        swapFee: string,
        totalWeight: string,
        totalShares: string,
        tokens: WeightedPoolToken[]
    );
    setTypeForSwap(type: TypesForSwap): void;
    parsePoolPairData(tokenIn: string, tokenOut: string): void;
}
