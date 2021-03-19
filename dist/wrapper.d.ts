import { BaseProvider } from '@ethersproject/providers';
import { BigNumber } from './utils/bignumber';
import { POOLS } from './index';
import {
    SwapInfo,
    SubGraphPools,
    Path,
    SubGraphPoolDictionary,
    DisabledOptions,
} from './types';
export declare class SOR {
    MULTIADDR: {
        [chainId: number]: string;
    };
    VAULTADDR: {
        [chainId: number]: string;
    };
    provider: BaseProvider;
    gasPrice: BigNumber;
    maxPools: number;
    chainId: number;
    swapCost: BigNumber;
    isUsingPoolsUrl: Boolean;
    poolsUrl: string;
    subgraphPools: SubGraphPools;
    tokenCost: {};
    pools: POOLS;
    onChainBalanceCache: SubGraphPools;
    poolsForPairsCache: {};
    processedDataCache: {};
    finishedFetchingOnChain: boolean;
    disabledOptions: DisabledOptions;
    constructor(
        provider: BaseProvider,
        gasPrice: BigNumber,
        maxPools: number,
        chainId: number,
        poolsSource: string | SubGraphPools,
        disabledOptions?: DisabledOptions
    );
    setCostOutputToken(tokenOut: string, cost?: BigNumber): Promise<BigNumber>;
    fetchPools(isOnChain?: boolean): Promise<boolean>;
    private fetchOnChainBalances;
    getSwaps(
        tokenIn: string,
        tokenOut: string,
        swapType: string,
        swapAmt: BigNumber
    ): Promise<SwapInfo>;
    processSwaps(
        tokenIn: string,
        tokenOut: string,
        swapType: string,
        swapAmt: BigNumber,
        onChainPools: SubGraphPools,
        useProcessCache?: boolean
    ): Promise<SwapInfo>;
    fetchFilteredPairPools(
        tokenIn: string,
        tokenOut: string,
        isOnChain?: boolean
    ): Promise<boolean>;
    private processPairPools;
    processPathsAndPrices(
        PathArray: Path[],
        PoolsDict: SubGraphPoolDictionary,
        SwapType: string
    ): Path[];
    createKey(Token1: string, Token2: string): string;
    hasDataForPair(tokenIn: string, tokenOut: string): boolean;
}
