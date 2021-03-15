import { BaseProvider } from '@ethersproject/providers';
import { SubGraphPools } from './types';
export declare function getOnChainBalances(
    pools: SubGraphPools,
    multiAddress: string,
    vaultAddress: string,
    provider: BaseProvider
): Promise<SubGraphPools>;
