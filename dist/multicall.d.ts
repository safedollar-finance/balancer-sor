import { BaseProvider } from '@ethersproject/providers';
import { SubGraphPoolsBase } from './types';
export declare const abis: any[];
export declare function getOnChainBalances(
    subgraphPools: SubGraphPoolsBase,
    multiAddress: string,
    vaultAddress: string,
    provider: BaseProvider
): Promise<SubGraphPoolsBase>;
