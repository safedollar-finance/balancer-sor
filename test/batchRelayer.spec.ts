require('dotenv').config();
import _ from 'lodash';
import { defaultAbiCoder } from '@ethersproject/abi';
import { expect } from 'chai';
import {
    formatBatchRelayerJoinSwaps,
    formatBatchRelayerExitSwaps,
    BatchRelayerJoinSwap,
    BatchRelayerExitSwap,
    SwapTypes,
    PairTypes,
    bnum,
    scale,
} from '../src';
import { BigNumber } from '../src/utils/bignumber';

import testSwaps from './testData/swapsForFormattingBatchRelayer.json';

const marketSp: BigNumber = new BigNumber(7);

// npx mocha -r ts-node/register test/batchRelayer.spec.ts
describe(`Tests for BatchRelayer support.`, () => {
    context('format swaps for relayer - joinSwap', () => {
        it('should return no swaps for non relayer', async () => {
            const swapsV1Format: any = _.cloneDeep(testSwaps.joinSwap);
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x6b175474e89094c44da98b954eedeac495271d0f';
            const tokenOut = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = false;

            const swapInfo: BatchRelayerJoinSwap = formatBatchRelayerJoinSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap
            );

            expect(swapInfo.swaps.length).eq(0);
            expect(swapInfo.returnAmount.toString()).eq('0');
        });

        it('should return no swaps for ETH swap', async () => {
            // Relayer doesn't support ETH
            const swapsV1Format: any = _.cloneDeep(testSwaps.joinSwap);
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x6b175474e89094c44da98b954eedeac495271d0f';
            const tokenOut = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = true;

            const swapInfo: BatchRelayerJoinSwap = formatBatchRelayerJoinSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap,
                {
                    isEthSwap: true,
                    wethAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
                }
            );

            expect(swapInfo.swaps.length).eq(0);
            expect(swapInfo.returnAmount.toString()).eq('0');
        });

        it('should return no swaps if first swap isnt a join', async () => {
            // Relayer doesn't support ETH
            const swapsV1Format: any = _.cloneDeep(testSwaps.joinSwap);
            swapsV1Format[0][0].pairType = PairTypes.TokenToToken;
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x6b175474e89094c44da98b954eedeac495271d0f';
            const tokenOut = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = true;

            const swapInfo: BatchRelayerJoinSwap = formatBatchRelayerJoinSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap
            );

            expect(swapInfo.swaps.length).eq(0);
            expect(swapInfo.returnAmount.toString()).eq('0');
        });

        it('formats a valid joinSwap with single swap - TokenIn>BPT>TokenOut', async () => {
            /*
            Swap will look like:
            TokenIn > BPT Token - This should be the join
            BPT Token > Token Out - This will be a swap
            */
            const swapsV1Format: any = _.cloneDeep(testSwaps.joinSwap);
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x6b175474e89094c44da98b954eedeac495271d0f';
            const tokenOut = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = true;

            // This should be BPT and TokenOut
            const expectedSwapAssets: string[] = [
                swapsV1Format[0][1].tokenIn,
                swapsV1Format[0][1].tokenOut,
            ];

            const swapAmountScaled = scale(
                swapAmount,
                swapsV1Format[0][0].tokenInDecimals
            );
            const returnAmountScaled = scale(
                returnAmount,
                swapsV1Format[0][1].tokenOutDecimals
            );
            const returnAmountConsideringFeesScaled = scale(
                returnAmountConsideringFees,
                swapsV1Format[0][1].tokenOutDecimals
            );

            const swapInfo: BatchRelayerJoinSwap = formatBatchRelayerJoinSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap
            );

            expect(swapInfo.isRelayerSwap).eq(true);
            expect(swapInfo.poolId).eq(swapsV1Format[0][0].pool);
            expect(swapAmountScaled.toString()).eq(
                swapInfo.swapAmount.toString()
            );
            expect(returnAmountScaled.toString()).eq(
                swapInfo.returnAmount.toString()
            );
            expect(returnAmountConsideringFeesScaled.toString()).eq(
                swapInfo.returnAmountConsideringFees.toString()
            );
            expect(tokenIn).eq(swapInfo.tokenIn);
            expect(tokenOut).eq(swapInfo.tokenOut);
            expect(expectedSwapAssets).to.deep.eq(swapInfo.swapAssets);
            // Should only have one swap - BPT > TokenOut
            expect(swapInfo.swaps.length).eq(1);
            expect(swapInfo.swaps[0].assetInIndex).eq(0);
            expect(swapInfo.swaps[0].assetOutIndex).eq(1);
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetInIndex]).eq(
                swapsV1Format[0][1].tokenIn
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetOutIndex]).eq(
                tokenOut
            );
            // Amt will actually be overwritten in Relayer but check here anyway
            expect(swapInfo.swaps[0].amount.toString()).eq(
                scale(bnum(swapsV1Format[0][1].swapAmount), 18).toString()
            );

            //     joinRequest - the join info is related to the joinSwap
            expect(swapInfo.joinRequest.fromInternalBalance).to.be.false;
            // Assets of join pool only.
            expect(swapInfo.joinRequest.assets).to.deep.eq(
                swapsV1Format[0][0].poolAssets
            );
            expect(swapInfo.joinRequest.maxAmountsIn.length).eq(
                swapsV1Format[0][0].poolAssets.length
            );
            const tokenInIndex = swapInfo.joinRequest.assets.indexOf(tokenIn);
            const maxAmtsCheck: string[] = [];
            swapInfo.joinRequest.maxAmountsIn.forEach((amt, i) => {
                if (i === tokenInIndex) {
                    expect(amt.toString()).eq(swapAmountScaled.toString());
                    maxAmtsCheck[i] = swapAmountScaled.toString();
                } else {
                    expect(amt.toString()).eq('0');
                    maxAmtsCheck[i] = '0';
                }
            });
            expect(maxAmtsCheck).to.deep.eq(swapInfo.joinRequest.maxAmountsIn);
            // const userDataCheck = encodeJoinStablePool({ kind: 'ExactTokensInForBPTOut', amountsIn: maxAmtsCheck, minimumBPT: 0 });
            const JOIN_STABLE_POOL_EXACT_TOKENS_IN_FOR_BPT_OUT_TAG = 1;
            const userDataCheck = defaultAbiCoder.encode(
                ['uint256', 'uint256[]', 'uint256'],
                [
                    JOIN_STABLE_POOL_EXACT_TOKENS_IN_FOR_BPT_OUT_TAG,
                    maxAmtsCheck,
                    0,
                ]
            );

            expect(userDataCheck).eq(swapInfo.joinRequest.userData);
        });

        it('formats a valid joinSwap with multi swap - TokenIn>BPT>HopToken>TokenOut', async () => {
            /*
            Swap will look like:
            TokenIn > BPT Token - This should be the join
            BPT > HopToken - This will be a swap
            HopToken > Token Out - This will be a swap
            */
            const swapsV1Format: any = _.cloneDeep(testSwaps.joinSwapWithMulti);
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x6b175474e89094c44da98b954eedeac495271d0f';
            const tokenOut = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = true;

            // BPT, HopToken, TokenOut
            const expectedSwapAssets: string[] = [
                swapsV1Format[0][1].tokenIn,
                swapsV1Format[0][1].tokenOut,
                tokenOut,
            ];

            const swapAmountScaled = scale(
                swapAmount,
                swapsV1Format[0][0].tokenInDecimals
            );
            const returnAmountScaled = scale(
                returnAmount,
                swapsV1Format[0][2].tokenOutDecimals
            );
            const returnAmountConsideringFeesScaled = scale(
                returnAmountConsideringFees,
                swapsV1Format[0][2].tokenOutDecimals
            );

            const swapInfo: BatchRelayerJoinSwap = formatBatchRelayerJoinSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap
            );

            expect(swapInfo.isRelayerSwap).eq(true);
            expect(swapInfo.poolId).eq(swapsV1Format[0][0].pool);
            expect(swapAmountScaled.toString()).eq(
                swapInfo.swapAmount.toString()
            );
            expect(returnAmountScaled.toString()).eq(
                swapInfo.returnAmount.toString()
            );
            expect(returnAmountConsideringFeesScaled.toString()).eq(
                swapInfo.returnAmountConsideringFees.toString()
            );
            expect(tokenIn).eq(swapInfo.tokenIn);
            expect(tokenOut).eq(swapInfo.tokenOut);
            expect(expectedSwapAssets).to.deep.eq(swapInfo.swapAssets);
            // Should have two swaps - BPT > HopToken > TokenOut
            expect(swapInfo.swaps.length).eq(2);
            expect(swapInfo.swaps[0].assetInIndex).eq(0);
            expect(swapInfo.swaps[0].assetOutIndex).eq(1);
            expect(swapInfo.swaps[1].assetInIndex).eq(1);
            expect(swapInfo.swaps[1].assetOutIndex).eq(2);
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetInIndex]).eq(
                swapsV1Format[0][1].tokenIn
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetOutIndex]).eq(
                swapsV1Format[0][1].tokenOut
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[1].assetInIndex]).eq(
                swapsV1Format[0][2].tokenIn
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[1].assetOutIndex]).eq(
                tokenOut
            );
            // Amt will actually be overwritten in Relayer but check here anyway
            expect(swapInfo.swaps[0].amount.toString()).eq(
                scale(bnum(swapsV1Format[0][1].swapAmount), 18).toString()
            );
            expect(swapInfo.swaps[1].amount.toString()).eq(
                '0',
                'Amt should be 0 for multihop'
            );

            // joinRequest - the join info is related to the joinSwap
            expect(swapInfo.joinRequest.fromInternalBalance).to.be.false;
            // Assets of join pool only.
            expect(swapInfo.joinRequest.assets).to.deep.eq(
                swapsV1Format[0][0].poolAssets
            );
            expect(swapInfo.joinRequest.maxAmountsIn.length).eq(
                swapsV1Format[0][0].poolAssets.length
            );
            const tokenInIndex = swapInfo.joinRequest.assets.indexOf(tokenIn);
            const maxAmtsCheck: string[] = [];
            swapInfo.joinRequest.maxAmountsIn.forEach((amt, i) => {
                if (i === tokenInIndex) {
                    expect(amt.toString()).eq(swapAmountScaled.toString());
                    maxAmtsCheck[i] = swapAmountScaled.toString();
                } else {
                    expect(amt.toString()).eq('0');
                    maxAmtsCheck[i] = '0';
                }
            });
            expect(maxAmtsCheck).to.deep.eq(swapInfo.joinRequest.maxAmountsIn);
            // const userDataCheck = encodeJoinStablePool({ kind: 'ExactTokensInForBPTOut', amountsIn: maxAmtsCheck, minimumBPT: 0 });
            const JOIN_STABLE_POOL_EXACT_TOKENS_IN_FOR_BPT_OUT_TAG = 1;
            const userDataCheck = defaultAbiCoder.encode(
                ['uint256', 'uint256[]', 'uint256'],
                [
                    JOIN_STABLE_POOL_EXACT_TOKENS_IN_FOR_BPT_OUT_TAG,
                    maxAmtsCheck,
                    0,
                ]
            );

            expect(userDataCheck).eq(swapInfo.joinRequest.userData);
        });
    });

    context('format swaps for relayer - exitSwap', () => {
        it('should return no swaps for non relayer', async () => {
            const swapsV1Format: any = _.cloneDeep(testSwaps.exitSwap);
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const tokenOut = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = false;

            const swapInfo: BatchRelayerExitSwap = formatBatchRelayerExitSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap
            );

            expect(swapInfo.swaps.length).eq(0);
            expect(swapInfo.returnAmount.toString()).eq('0');
        });

        it('should return no swaps for ETH swap', async () => {
            // Relayer doesn't support ETH
            const swapsV1Format: any = _.cloneDeep(testSwaps.exitSwap);
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const tokenOut = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = true;

            const swapInfo: BatchRelayerExitSwap = formatBatchRelayerExitSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap,
                {
                    isEthSwap: true,
                    wethAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
                }
            );

            expect(swapInfo.swaps.length).eq(0);
            expect(swapInfo.returnAmount.toString()).eq('0');
        });

        it('should return no swaps if second swap isnt an exit', async () => {
            // Relayer doesn't support ETH
            const swapsV1Format: any = _.cloneDeep(testSwaps.exitSwap);
            swapsV1Format[0][1].pairType = PairTypes.TokenToToken;
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const tokenOut = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = true;

            const swapInfo: BatchRelayerExitSwap = formatBatchRelayerExitSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap
            );

            expect(swapInfo.swaps.length).eq(0);
            expect(swapInfo.returnAmount.toString()).eq('0');
        });

        it('formats a valid exitSwap - exitSwapOnly', async () => {
            /*
            Swap will look like:
            TokenIn > BPT Token - This should be the swap
            (Can also do other swaps)
            BPT Token > exitPool - Token Out - This will be the exit
            */
            const swapsV1Format: any = _.cloneDeep(testSwaps.exitSwap);
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const tokenOut = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = true;

            const expectedSwapAssets: string[] = [
                swapsV1Format[0][0].tokenIn,
                swapsV1Format[0][0].tokenOut,
            ];

            const swapAmountScaled = scale(
                swapAmount,
                swapsV1Format[0][0].tokenInDecimals
            );
            const returnAmountScaled = scale(
                returnAmount,
                swapsV1Format[0][1].tokenOutDecimals
            );
            const returnAmountConsideringFeesScaled = scale(
                returnAmountConsideringFees,
                swapsV1Format[0][1].tokenOutDecimals
            );

            const swapInfo: BatchRelayerExitSwap = formatBatchRelayerExitSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap
            );

            expect(swapInfo.isRelayerSwap).eq(true);
            expect(swapInfo.poolId).eq(swapsV1Format[0][1].pool);
            expect(swapAmountScaled.toString()).eq(
                swapInfo.swapAmount.toString()
            );
            expect(returnAmountScaled.toString()).eq(
                swapInfo.returnAmount.toString()
            );
            expect(returnAmountConsideringFeesScaled.toString()).eq(
                swapInfo.returnAmountConsideringFees.toString()
            );
            expect(tokenIn).eq(swapInfo.tokenIn);
            expect(tokenOut).eq(swapInfo.tokenOut);
            expect(expectedSwapAssets).to.deep.eq(swapInfo.swapAssets);
            // Swap should be tokenIn > BPT
            expect(swapInfo.swaps.length).eq(1);
            expect(swapInfo.swaps[0].assetInIndex).eq(0);
            expect(swapInfo.swaps[0].assetOutIndex).eq(1);
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetInIndex]).eq(
                tokenIn
            );
            // Should be BPT address
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetOutIndex]).eq(
                swapsV1Format[0][1].tokenIn
            );
            expect(swapInfo.swaps[0].amount.toString()).eq(
                scale(bnum(swapsV1Format[0][0].swapAmount), 18).toString()
            );

            //     exitRequest,
            expect(swapInfo.exitRequest.toInternalBalance).to.be.false;
            expect(swapInfo.exitRequest.assets).to.deep.eq(
                swapsV1Format[0][1].poolAssets
            );
            expect(swapInfo.exitRequest.minAmountsOut.length).eq(
                swapsV1Format[0][1].poolAssets.length
            );
            const tokenOutIndex = swapInfo.exitRequest.assets.indexOf(tokenOut);
            const minAmtsCheck: string[] = [];
            swapInfo.exitRequest.minAmountsOut.forEach((amt, i) => {
                if (i === tokenOutIndex) {
                    expect(amt.toString()).eq(returnAmountScaled.toString());
                    minAmtsCheck[i] = returnAmountScaled.toString();
                } else {
                    expect(amt.toString()).eq('0');
                    minAmtsCheck[i] = '0';
                }
            });
            expect(minAmtsCheck).to.deep.eq(swapInfo.exitRequest.minAmountsOut);
            // const userDataCheck = encodeJoinStablePool({ kind: 'ExactTokensInForBPTOut', amountsIn: maxAmtsCheck, minimumBPT: 0 });
            const EXIT_POOL_EXACT_BPT_IN_FOR_ONE_TOKEN_OUT_TAG = 0;
            const userDataCheck = defaultAbiCoder.encode(
                ['uint256', 'uint256', 'uint256'],
                [
                    EXIT_POOL_EXACT_BPT_IN_FOR_ONE_TOKEN_OUT_TAG,
                    0, // bptAmountIn is overwritten by the relayer
                    tokenOutIndex, // exitTokenIndex
                ]
            );

            expect(userDataCheck).eq(swapInfo.exitRequest.userData);
        });

        it('formats a valid exitSwap - direct + exitSwap', async () => {
            /*
            Swap will look like:
            Direct: TokenIn > TokenOut
            Exit:
                TokenIn > BPT Token - This should be the swap
                BPT Token > exitPool - Token Out - This will be the exit
            */
            const swapsV1Format: any = _.cloneDeep(
                testSwaps.exitSwapWithDirect
            );
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const tokenOut = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
            const bptAddress = '0xebfed10e11dc08fcda1af1fda146945e8710f22e';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = true;

            const expectedSwapAssets: string[] = [
                tokenIn,
                tokenOut,
                bptAddress,
            ];

            const swapAmountScaled = scale(
                swapAmount,
                swapsV1Format[0][0].tokenInDecimals
            );
            const returnAmountScaled = scale(
                returnAmount,
                swapsV1Format[0][0].tokenOutDecimals
            );
            const returnAmountConsideringFeesScaled = scale(
                returnAmountConsideringFees,
                swapsV1Format[0][0].tokenOutDecimals
            );

            const swapInfo: BatchRelayerExitSwap = formatBatchRelayerExitSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap
            );

            expect(swapInfo.isRelayerSwap).eq(true);
            expect(swapInfo.poolId).eq(swapsV1Format[1][1].pool);
            expect(swapAmountScaled.toString()).eq(
                swapInfo.swapAmount.toString()
            );
            expect(returnAmountScaled.toString()).eq(
                swapInfo.returnAmount.toString()
            );
            expect(returnAmountConsideringFeesScaled.toString()).eq(
                swapInfo.returnAmountConsideringFees.toString()
            );
            expect(tokenIn).eq(swapInfo.tokenIn);
            expect(tokenOut).eq(swapInfo.tokenOut);
            expect(expectedSwapAssets).to.deep.eq(swapInfo.swapAssets);
            // Should have two swaps
            // TokenIn > TokenOut
            // TokenIn > BPT
            expect(swapInfo.swaps.length).eq(2);
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetInIndex]).eq(
                tokenIn
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetOutIndex]).eq(
                tokenOut
            );
            // Should be BPT address
            expect(swapInfo.swapAssets[swapInfo.swaps[1].assetInIndex]).eq(
                tokenIn
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[1].assetOutIndex]).eq(
                bptAddress
            );
            expect(swapInfo.swaps[0].amount.toString()).eq(
                scale(
                    bnum(swapsV1Format[0][0].swapAmount),
                    swapsV1Format[0][0].tokenInDecimals
                ).toString()
            );

            //     exitRequest,
            expect(swapInfo.exitRequest.toInternalBalance).to.be.false;
            expect(swapInfo.exitRequest.assets).to.deep.eq(
                swapsV1Format[1][1].poolAssets
            );
            expect(swapInfo.exitRequest.minAmountsOut.length).eq(
                swapsV1Format[1][1].poolAssets.length
            );
            const tokenOutIndex = swapInfo.exitRequest.assets.indexOf(tokenOut);
            const minAmtsCheck: string[] = [];
            swapInfo.exitRequest.minAmountsOut.forEach((amt, i) => {
                if (i === tokenOutIndex) {
                    expect(amt.toString()).eq(returnAmountScaled.toString());
                    minAmtsCheck[i] = returnAmountScaled.toString();
                } else {
                    expect(amt.toString()).eq('0');
                    minAmtsCheck[i] = '0';
                }
            });
            expect(minAmtsCheck).to.deep.eq(swapInfo.exitRequest.minAmountsOut);
            // const userDataCheck = encodeJoinStablePool({ kind: 'ExactTokensInForBPTOut', amountsIn: maxAmtsCheck, minimumBPT: 0 });
            const EXIT_POOL_EXACT_BPT_IN_FOR_ONE_TOKEN_OUT_TAG = 0;
            const userDataCheck = defaultAbiCoder.encode(
                ['uint256', 'uint256', 'uint256'],
                [
                    EXIT_POOL_EXACT_BPT_IN_FOR_ONE_TOKEN_OUT_TAG,
                    0, // bptAmountIn is overwritten by the relayer
                    tokenOutIndex, // exitTokenIndex
                ]
            );

            expect(userDataCheck).eq(swapInfo.exitRequest.userData);
        });

        it('formats a valid exitSwap - exitSwap + direct', async () => {
            /*
            Swap will look like:
            Exit:
                TokenIn > BPT Token - This should be the swap
                BPT Token > exitPool - Token Out - This will be the exit
            Direct: TokenIn > TokenOut
            */
            const swapsV1FormatCopy: any = _.cloneDeep(
                testSwaps.exitSwapWithDirect
            );
            const swapsV1Format = [swapsV1FormatCopy[1], swapsV1FormatCopy[0]];
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const tokenOut = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
            const bptAddress = '0xebfed10e11dc08fcda1af1fda146945e8710f22e';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = true;

            const expectedSwapAssets: string[] = [
                tokenIn,
                bptAddress,
                tokenOut,
            ];

            const swapAmountScaled = scale(
                swapAmount,
                swapsV1Format[1][0].tokenInDecimals
            );
            const returnAmountScaled = scale(
                returnAmount,
                swapsV1Format[1][0].tokenOutDecimals
            );
            const returnAmountConsideringFeesScaled = scale(
                returnAmountConsideringFees,
                swapsV1Format[1][0].tokenOutDecimals
            );

            const swapInfo: BatchRelayerExitSwap = formatBatchRelayerExitSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap
            );

            expect(swapInfo.isRelayerSwap).eq(true);
            expect(swapInfo.poolId).eq(swapsV1Format[0][1].pool);
            expect(swapAmountScaled.toString()).eq(
                swapInfo.swapAmount.toString()
            );
            expect(returnAmountScaled.toString()).eq(
                swapInfo.returnAmount.toString()
            );
            expect(returnAmountConsideringFeesScaled.toString()).eq(
                swapInfo.returnAmountConsideringFees.toString()
            );
            expect(tokenIn).eq(swapInfo.tokenIn);
            expect(tokenOut).eq(swapInfo.tokenOut);
            expect(expectedSwapAssets).to.deep.eq(swapInfo.swapAssets);
            // Should have two swaps
            // TokenIn > TokenOut
            // TokenIn > BPT
            expect(swapInfo.swaps.length).eq(2);
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetInIndex]).eq(
                tokenIn
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetOutIndex]).eq(
                bptAddress
            );
            // Should be BPT address
            expect(swapInfo.swapAssets[swapInfo.swaps[1].assetInIndex]).eq(
                tokenIn
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[1].assetOutIndex]).eq(
                tokenOut
            );
            expect(swapInfo.swaps[0].amount.toString()).eq(
                scale(
                    bnum(swapsV1Format[0][0].swapAmount),
                    swapsV1Format[0][0].tokenInDecimals
                ).toString()
            );

            //     exitRequest,
            expect(swapInfo.exitRequest.toInternalBalance).to.be.false;
            expect(swapInfo.exitRequest.assets).to.deep.eq(
                swapsV1Format[0][1].poolAssets
            );
            expect(swapInfo.exitRequest.minAmountsOut.length).eq(
                swapsV1Format[0][1].poolAssets.length
            );
            const tokenOutIndex = swapInfo.exitRequest.assets.indexOf(tokenOut);
            const minAmtsCheck: string[] = [];
            swapInfo.exitRequest.minAmountsOut.forEach((amt, i) => {
                if (i === tokenOutIndex) {
                    expect(amt.toString()).eq(returnAmountScaled.toString());
                    minAmtsCheck[i] = returnAmountScaled.toString();
                } else {
                    expect(amt.toString()).eq('0');
                    minAmtsCheck[i] = '0';
                }
            });
            expect(minAmtsCheck).to.deep.eq(swapInfo.exitRequest.minAmountsOut);
            // const userDataCheck = encodeJoinStablePool({ kind: 'ExactTokensInForBPTOut', amountsIn: maxAmtsCheck, minimumBPT: 0 });
            const EXIT_POOL_EXACT_BPT_IN_FOR_ONE_TOKEN_OUT_TAG = 0;
            const userDataCheck = defaultAbiCoder.encode(
                ['uint256', 'uint256', 'uint256'],
                [
                    EXIT_POOL_EXACT_BPT_IN_FOR_ONE_TOKEN_OUT_TAG,
                    0, // bptAmountIn is overwritten by the relayer
                    tokenOutIndex, // exitTokenIndex
                ]
            );

            expect(userDataCheck).eq(swapInfo.exitRequest.userData);
        });

        it('formats a valid exitSwap - multihop + exitSwap', async () => {
            /*
            Swap will look like:
            Multi: TokenIn > Hop > TokenOut
            Exit:
                TokenIn > BPT Token - This should be the swap
                BPT Token > exitPool - Token Out - This will be the exit
            */
            const swapsV1Format: any = _.cloneDeep(testSwaps.exitSwapWithMulti);
            const swapAmount = new BigNumber(1);
            const returnAmount = new BigNumber(2);
            const returnAmountConsideringFees = new BigNumber(1.9);
            const tokenIn = '0x1456688345527be1f37e9e627da0837d6f08c925';
            const tokenInDecimals = 18;
            const tokenOut = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
            const tokenOutDecimals = 6;
            const hopToken = '0xba100000625a3754423978a60c9317c58a424e3d';
            const bptAddress = '0xebfed10e11dc08fcda1af1fda146945e8710f22e';
            const exitPool =
                '0xebfed10e11dc08fcda1af1fda146945e8710f22e00000000000000000000007f';
            const swapType = SwapTypes.SwapExactIn;
            const isRelayerSwap = true;

            const expectedSwapAssets: string[] = [
                tokenIn,
                hopToken,
                tokenOut,
                bptAddress,
            ];

            const swapAmountScaled = scale(swapAmount, tokenInDecimals);
            const returnAmountScaled = scale(returnAmount, tokenOutDecimals);
            const returnAmountConsideringFeesScaled = scale(
                returnAmountConsideringFees,
                tokenOutDecimals
            );

            const swapInfo: BatchRelayerExitSwap = formatBatchRelayerExitSwaps(
                swapsV1Format,
                swapType,
                swapAmount,
                tokenIn,
                tokenOut,
                returnAmount,
                returnAmountConsideringFees,
                marketSp,
                isRelayerSwap
            );

            expect(swapInfo.isRelayerSwap).eq(true);
            expect(swapInfo.poolId).eq(exitPool);
            expect(swapAmountScaled.toString()).eq(
                swapInfo.swapAmount.toString()
            );
            expect(returnAmountScaled.toString()).eq(
                swapInfo.returnAmount.toString()
            );
            expect(returnAmountConsideringFeesScaled.toString()).eq(
                swapInfo.returnAmountConsideringFees.toString()
            );
            expect(tokenIn).eq(swapInfo.tokenIn);
            expect(tokenOut).eq(swapInfo.tokenOut);
            expect(expectedSwapAssets).to.deep.eq(swapInfo.swapAssets);
            // Should have three swaps
            // TokenIn > HopToken
            // HopToken > TokenOut
            // TokenIn > BPT
            expect(swapInfo.swaps.length).eq(3);
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetInIndex]).eq(
                tokenIn
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[0].assetOutIndex]).eq(
                hopToken
            );
            expect(swapInfo.swaps[0].amount.toString()).eq(
                scale(
                    bnum(swapsV1Format[0][0].swapAmount),
                    swapsV1Format[0][0].tokenInDecimals
                ).toString()
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[1].assetInIndex]).eq(
                hopToken
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[1].assetOutIndex]).eq(
                tokenOut
            );
            // Second swap should be 0 because multihop
            expect(swapInfo.swaps[1].amount.toString()).eq('0');
            expect(swapInfo.swapAssets[swapInfo.swaps[2].assetInIndex]).eq(
                tokenIn
            );
            expect(swapInfo.swapAssets[swapInfo.swaps[2].assetOutIndex]).eq(
                bptAddress
            );
            expect(swapInfo.swaps[2].amount.toString()).eq(
                scale(
                    bnum(swapsV1Format[1][0].swapAmount),
                    swapsV1Format[1][0].tokenInDecimals
                ).toString()
            );

            //     exitRequest,
            expect(swapInfo.exitRequest.toInternalBalance).to.be.false;
            expect(swapInfo.exitRequest.assets).to.deep.eq(
                swapsV1Format[1][1].poolAssets
            );
            expect(swapInfo.exitRequest.minAmountsOut.length).eq(
                swapsV1Format[1][1].poolAssets.length
            );
            const tokenOutIndex = swapInfo.exitRequest.assets.indexOf(tokenOut);
            const minAmtsCheck: string[] = [];
            swapInfo.exitRequest.minAmountsOut.forEach((amt, i) => {
                if (i === tokenOutIndex) {
                    expect(amt.toString()).eq(returnAmountScaled.toString());
                    minAmtsCheck[i] = returnAmountScaled.toString();
                } else {
                    expect(amt.toString()).eq('0');
                    minAmtsCheck[i] = '0';
                }
            });
            expect(minAmtsCheck).to.deep.eq(swapInfo.exitRequest.minAmountsOut);
            // const userDataCheck = encodeJoinStablePool({ kind: 'ExactTokensInForBPTOut', amountsIn: maxAmtsCheck, minimumBPT: 0 });
            const EXIT_POOL_EXACT_BPT_IN_FOR_ONE_TOKEN_OUT_TAG = 0;
            const userDataCheck = defaultAbiCoder.encode(
                ['uint256', 'uint256', 'uint256'],
                [
                    EXIT_POOL_EXACT_BPT_IN_FOR_ONE_TOKEN_OUT_TAG,
                    0, // bptAmountIn is overwritten by the relayer
                    tokenOutIndex, // exitTokenIndex
                ]
            );

            expect(userDataCheck).eq(swapInfo.exitRequest.userData);
        });
    });
});
