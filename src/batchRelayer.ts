import { BigNumber } from './utils/bignumber';
import { defaultAbiCoder } from '@ethersproject/abi';
import { SwapTypes, PairTypes, SwapV2, Swap } from './types';
import { bnum, scale, ZERO } from './bmath';

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
    poolAssets: string[];
    maxAmtsIn: string[];
    userData: string;
    internalBalance: boolean;
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
        poolAssets: [],
        maxAmtsIn: [],
        userData: '',
        internalBalance: false,
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
        swapsOriginal.length !== 1 ||
        swapsOriginal[0].length !== 2 ||
        swapsOriginal[0][0].pairType !== PairTypes.TokenToBpt
    )
        return swapInfo;

    // TO DO - Handle SWAPEXACTOUT properly
    if (swapType === SwapTypes.SwapExactOut) return swapInfo;

    const swaps: Swap[][] = JSON.parse(JSON.stringify(swapsOriginal));
    let tokenInDecimals: number;
    let tokenOutDecimals: number;
    // Find token decimals for scaling
    swaps.forEach(sequence => {
        sequence.forEach(swap => {
            if (swap.tokenIn === tokenIn)
                tokenInDecimals = swap.tokenInDecimals;

            if (swap.tokenOut === tokenOut)
                tokenOutDecimals = swap.tokenOutDecimals;
        });
    });

    // Id of pool to join, first pool in sequence
    swapInfo.poolId = swapsOriginal[0][0].pool;

    // The swap will be the BPT > Token section which is second sequence
    swapInfo.swapAssets = [swaps[0][1].tokenIn, swaps[0][1].tokenOut];

    // TO DO - Handle SwapExactOut
    if (swapType === SwapTypes.SwapExactIn) {
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

        // This is the swap of BPT > Token after join
        const swapV2: SwapV2 = {
            poolId: swaps[0][1].pool,
            assetInIndex: 0,
            assetOutIndex: 1,
            amount: scale(bnum(swaps[0][1].swapAmount), 18).toString(), // Will always be 18 as BPT > tokenOut. This will be overwritten in relayer to match BPT amt from join
            userData: '0x',
        };

        swapInfo.swaps = [swapV2];
    }

    // Create request data
    // Max amount of tokens for joinPool. Should be swapAmount of tokenIn
    const poolMaxAmtsIn: string[] = [];
    swapsOriginal[0][0].poolAssets.forEach((asset, i) => {
        if (asset === tokenIn)
            poolMaxAmtsIn[i] = swapInfo.swapAmount.toString();
        else poolMaxAmtsIn[i] = '0';
    });

    swapInfo.joinRequest.maxAmtsIn = poolMaxAmtsIn;
    // Assets of pool to join
    swapInfo.joinRequest.poolAssets = swapsOriginal[0][0].poolAssets;
    // Encodes for ExactTokensInForBPTOut join which is only one supported
    const JOIN_EXACT_TOKENS_IN_FOR_BPT_OUT_TAG = 1;
    swapInfo.joinRequest.userData = defaultAbiCoder.encode(
        ['uint256', 'uint256[]', 'uint256'],
        [JOIN_EXACT_TOKENS_IN_FOR_BPT_OUT_TAG, poolMaxAmtsIn, 0]
    );

    swapInfo.tokenIn = tokenIn;
    swapInfo.tokenOut = tokenOut;

    return swapInfo;
}
