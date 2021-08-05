import { BigNumber } from './utils/bignumber';
import { defaultAbiCoder } from '@ethersproject/abi';
import { SwapTypes, PairTypes, SwapV2, Swap } from './types';
import { bnum, scale, ZERO } from './bmath';
import { formatSwaps } from './helpersClass';

export interface BatchRelayerJoinSwap {
    poolId: string;
    joinRequest: JoinRequest;
    swapAssets: string[];
    swaps: SwapV2[];
    swapAmount: BigNumber;
    returnAmount: BigNumber;
    returnAmountConsideringFees: BigNumber;
    tokenIn: string;
    tokenOut: string;
    marketSp: BigNumber;
    isRelayerSwap: boolean;
}

export interface JoinRequest {
    assets: string[];
    maxAmountsIn: string[];
    userData: string;
    fromInternalBalance: boolean;
}

export interface BatchRelayerExitSwap {
    poolId: string;
    exitRequest: ExitRequest;
    swapAssets: string[];
    swaps: SwapV2[];
    swapAmount: BigNumber;
    returnAmount: BigNumber;
    returnAmountConsideringFees: BigNumber;
    tokenIn: string;
    tokenOut: string;
    marketSp: BigNumber;
    isRelayerSwap: boolean;
}

export interface ExitRequest {
    assets: string[];
    minAmountsOut: string[];
    userData: string;
    toInternalBalance: boolean;
}

export function formatBatchRelayerJoinSwaps(
    swapsOriginal: Swap[][],
    swapType: SwapTypes,
    swapAmount: BigNumber,
    tokenIn: string,
    tokenOut: string,
    returnAmount: BigNumber,
    returnAmountConsideringFees: BigNumber,
    marketSp: BigNumber,
    isRelayerSwap: boolean,
    wrapOptions = {
        isEthSwap: false,
        wethAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    }
): BatchRelayerJoinSwap {
    let joinRequest: JoinRequest = {
        assets: [],
        maxAmountsIn: [],
        userData: '',
        fromInternalBalance: false,
    };

    let swapInfo: BatchRelayerJoinSwap = {
        poolId: '',
        joinRequest,
        swapAssets: [],
        swaps: [],
        swapAmount: ZERO,
        returnAmount: ZERO,
        returnAmountConsideringFees: ZERO,
        tokenIn: '',
        tokenOut: '',
        marketSp: marketSp,
        isRelayerSwap,
    };

    // Check for unsupported swaps
    if (
        !isRelayerSwap ||
        wrapOptions.isEthSwap ||
        swapsOriginal.length !== 1 || // Can only support one path - join then swaps
        swapsOriginal[0].length < 2 || // Has to at least be one swap after join
        swapsOriginal[0][0].pairType !== PairTypes.TokenToBpt // First must be join
    ) {
        return swapInfo;
    }

    // All following join must be swaps
    for (let i = 1; i < swapsOriginal[0].length; i++) {
        if (swapsOriginal[0][i].pairType !== PairTypes.TokenToToken) {
            return swapInfo;
        }
    }

    // TO DO - Handle SWAPEXACTOUT properly
    if (swapType === SwapTypes.SwapExactOut) return swapInfo;

    // Split join from other swaps
    const joinSwapOriginal = swapsOriginal[0][0];
    const batchSwapsOriginal = swapsOriginal[0].slice(1);

    // TO DO - SwapExactOut case will be opposite
    const swapAmountScaled = scale(
        swapAmount,
        joinSwapOriginal.tokenInDecimals
    );
    const returnAmountScaled = scale(
        returnAmount,
        batchSwapsOriginal[batchSwapsOriginal.length - 1].tokenOutDecimals
    );
    const returnAmountConsideringFeesScaled = scale(
        returnAmountConsideringFees,
        batchSwapsOriginal[batchSwapsOriginal.length - 1].tokenOutDecimals
    );

    const formattedSwaps = formatSwaps(
        [batchSwapsOriginal],
        swapType,
        bnum(batchSwapsOriginal[0].swapAmount), // Not important
        batchSwapsOriginal[0].tokenIn, // Not important
        tokenOut, // Not important
        returnAmount, // Not important
        returnAmountConsideringFees, // Not important
        marketSp,
        false
    );

    swapInfo.swapAssets = formattedSwaps.tokenAddresses;
    swapInfo.swaps = formattedSwaps.swaps;
    swapInfo.swapAmount = swapAmountScaled;
    swapInfo.returnAmount = returnAmountScaled;
    swapInfo.returnAmountConsideringFees = returnAmountConsideringFeesScaled;
    swapInfo.tokenIn = tokenIn;
    swapInfo.tokenOut = tokenOut;
    swapInfo.marketSp = formattedSwaps.marketSp;

    // Id of pool to join, first pool in sequence
    swapInfo.poolId = joinSwapOriginal.pool;
    // Create request data
    // Max amount of tokens for joinPool. Should be swapAmount of tokenIn
    const poolMaxAmtsIn: string[] = [];
    joinSwapOriginal.poolAssets.forEach((asset, i) => {
        if (asset === tokenIn)
            poolMaxAmtsIn[i] = swapInfo.swapAmount.toString();
        else poolMaxAmtsIn[i] = '0';
    });
    swapInfo.joinRequest.maxAmountsIn = poolMaxAmtsIn;
    // Assets of pool to join
    swapInfo.joinRequest.assets = joinSwapOriginal.poolAssets;
    // Encodes for ExactTokensInForBPTOut join which is only one supported
    const JOIN_EXACT_TOKENS_IN_FOR_BPT_OUT_TAG = 1;
    swapInfo.joinRequest.userData = defaultAbiCoder.encode(
        ['uint256', 'uint256[]', 'uint256'],
        [JOIN_EXACT_TOKENS_IN_FOR_BPT_OUT_TAG, poolMaxAmtsIn, 0]
    );

    return swapInfo;
}

export function formatBatchRelayerExitSwaps(
    swapsOriginal: Swap[][],
    swapType: SwapTypes,
    swapAmount: BigNumber,
    tokenIn: string,
    tokenOut: string,
    returnAmount: BigNumber,
    returnAmountConsideringFees: BigNumber,
    marketSp: BigNumber,
    isRelayerSwap: boolean,
    wrapOptions = {
        isEthSwap: false,
        wethAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    }
): BatchRelayerExitSwap {
    let exitRequest: ExitRequest = {
        assets: [],
        minAmountsOut: [],
        userData: '',
        toInternalBalance: false,
    };

    let swapInfo: BatchRelayerExitSwap = {
        poolId: '',
        exitRequest,
        swapAssets: [],
        swaps: [],
        swapAmount: ZERO,
        returnAmount: ZERO,
        returnAmountConsideringFees: ZERO,
        tokenIn: '',
        tokenOut: '',
        marketSp: marketSp,
        isRelayerSwap,
    };

    // TO DO - Handle SWAPEXACTOUT properly
    if (swapType === SwapTypes.SwapExactOut) return swapInfo;

    let tokenInDecimals: number;
    let tokenOutDecimals: number;
    const tokenAddressesSet: Set<string> = new Set();
    let exitSwapIndex;
    // Find token decimals for scaling
    swapsOriginal.forEach((sequence, i) => {
        if (sequence[1]?.pairType === PairTypes.BptToToken) {
            exitSwapIndex = i;
        }

        sequence.forEach(swap => {
            if (swap.tokenIn === tokenIn)
                tokenInDecimals = swap.tokenInDecimals;

            if (swap.tokenOut === tokenOut)
                tokenOutDecimals = swap.tokenOutDecimals;

            if (swap.pairType === PairTypes.TokenToToken) {
                tokenAddressesSet.add(swap.tokenIn);
                tokenAddressesSet.add(swap.tokenOut);
            }
        });
    });

    // Check for unsupported swaps
    if (
        exitSwapIndex === undefined ||
        !isRelayerSwap ||
        wrapOptions.isEthSwap ||
        swapsOriginal.length < 1 ||
        swapsOriginal[exitSwapIndex].length !== 2 ||
        swapsOriginal[exitSwapIndex][0].pairType !== PairTypes.TokenToToken ||
        swapsOriginal[exitSwapIndex][1].pairType !== PairTypes.BptToToken
    )
        return swapInfo;

    // Id of pool to exit, second pool in sequence
    swapInfo.poolId = swapsOriginal[exitSwapIndex][1].pool;

    // The swap will be the Token > BPT section which is first sequence
    swapInfo.swapAssets = [...tokenAddressesSet];

    // TO DO - Handle SwapExactOut
    if (swapType === SwapTypes.SwapExactIn) {
        const swapsV2: SwapV2[] = [];

        let totalSwapAmount = ZERO;
        /*
         * Multihop swaps can be executed by passing an`amountIn` value of zero for a swap.This will cause the amount out
         * of the previous swap to be used as the amount in of the current one.In such a scenario, `tokenIn` must equal the
         * previous swap's `tokenOut`.
         * */
        swapsOriginal.forEach(sequence => {
            if (sequence[1]?.pairType === PairTypes.BptToToken) {
                // This is the swap of Token > BPT before exit
                const inIndex = swapInfo.swapAssets.indexOf(
                    sequence[0].tokenIn
                );
                const outIndex = swapInfo.swapAssets.indexOf(
                    sequence[0].tokenOut
                );
                const swapV2: SwapV2 = {
                    poolId: sequence[0].pool,
                    assetInIndex: inIndex,
                    assetOutIndex: outIndex,
                    amount: scale(
                        bnum(sequence[0].swapAmount),
                        sequence[0].tokenInDecimals
                    ).toString(),
                    userData: '0x',
                };
                swapsV2.push(swapV2);
            } else {
                sequence.forEach((swap, i) => {
                    let amountScaled = '0'; // amount will be 0 for second swap in multihop swap
                    if (i == 0) {
                        // First swap so should have a value for both single and multihop
                        amountScaled = scale(
                            bnum(swap.swapAmount),
                            swap.tokenInDecimals
                        )
                            .decimalPlaces(0, 1)
                            .toString();
                        totalSwapAmount = totalSwapAmount.plus(amountScaled);
                    }

                    const inIndex = swapInfo.swapAssets.indexOf(swap.tokenIn);
                    const outIndex = swapInfo.swapAssets.indexOf(swap.tokenOut);
                    const swapV2: SwapV2 = {
                        poolId: swap.pool,
                        assetInIndex: inIndex,
                        assetOutIndex: outIndex,
                        amount: amountScaled,
                        userData: '0x',
                    };
                    swapsV2.push(swapV2);
                });
            }
        });

        let swapAmountScaled = scale(swapAmount, tokenInDecimals);
        swapInfo.swapAmount = swapAmountScaled;

        // Using this split to remove any decimals
        swapInfo.returnAmount = bnum(
            scale(returnAmount, tokenOutDecimals)
                .toString()
                .split('.')[0]
        );
        swapInfo.returnAmountConsideringFees = bnum(
            scale(returnAmountConsideringFees, tokenOutDecimals)
                .toString()
                .split('.')[0]
        );

        swapInfo.swaps = swapsV2;
    }

    // Create request data
    // Min amount of tokens for exitPool. Should be swapAmount of tokenIn
    const poolMinAmtsOut: string[] = [];
    let exitTokenIndex = 0;
    swapsOriginal[exitSwapIndex][1].poolAssets.forEach((asset, i) => {
        if (asset === tokenOut) {
            exitTokenIndex = i;
            poolMinAmtsOut[i] = swapInfo.returnAmount.toString();
        } else poolMinAmtsOut[i] = '0';
    });

    swapInfo.exitRequest.minAmountsOut = poolMinAmtsOut;
    // Assets of pool to exit
    swapInfo.exitRequest.assets = swapsOriginal[exitSwapIndex][1].poolAssets;
    // Encodes for ExactBPTInForOneTokenOut exit which is only one supported
    const EXIT_POOL_EXACT_BPT_IN_FOR_ONE_TOKEN_OUT_TAG = 0;
    // bptAmountIn is overwritten by the relayer
    swapInfo.exitRequest.userData = defaultAbiCoder.encode(
        ['uint256', 'uint256', 'uint256'],
        [
            EXIT_POOL_EXACT_BPT_IN_FOR_ONE_TOKEN_OUT_TAG,
            0, // bptAmountIn is overwritten by the relayer
            exitTokenIndex, // exitTokenIndex
        ]
    );

    swapInfo.tokenIn = tokenIn;
    swapInfo.tokenOut = tokenOut;

    return swapInfo;
}
