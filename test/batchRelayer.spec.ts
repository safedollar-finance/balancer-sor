require('dotenv').config();
import _ from 'lodash';
import { defaultAbiCoder } from '@ethersproject/abi';
import { expect } from 'chai';
import {
    formatBatchRelayerJoinSwaps,
    BatchRelayerJoinSwap,
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
            const tokenOut = '0xba100000625a3754423978a60c9317c58a424e3d';
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
            const tokenOut = '0xba100000625a3754423978a60c9317c58a424e3d';
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
            const tokenOut = '0xba100000625a3754423978a60c9317c58a424e3d';
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

        it('formats a valid joinSwap', async () => {
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
            // Should always only have one swap - BPT > TokenOut
            expect(swapInfo.swaps.length).eq(1);
            expect(swapInfo.swaps[0].assetInIndex).eq(0);
            expect(swapInfo.swaps[0].assetOutIndex).eq(1);
            // Amt will actually be overwritten in Relayer but check here anyway
            expect(swapInfo.swaps[0].amount.toString()).eq(
                scale(bnum(swapsV1Format[0][1].swapAmount), 18).toString()
            );

            //     joinRequest,
            expect(swapInfo.joinRequest.internalBalance).to.be.false;
            expect(swapInfo.joinRequest.poolAssets).to.deep.eq(
                swapsV1Format[0][0].poolAssets
            );
            expect(swapInfo.joinRequest.maxAmtsIn.length).eq(
                swapsV1Format[0][0].poolAssets.length
            );
            const tokenInIndex = swapInfo.joinRequest.poolAssets.indexOf(
                tokenIn
            );
            const maxAmtsCheck: string[] = [];
            swapInfo.joinRequest.maxAmtsIn.forEach((amt, i) => {
                if (i === tokenInIndex) {
                    expect(amt.toString()).eq(swapAmountScaled.toString());
                    maxAmtsCheck[i] = swapAmountScaled.toString();
                } else {
                    expect(amt.toString()).eq('0');
                    maxAmtsCheck[i] = '0';
                }
            });
            expect(maxAmtsCheck).to.deep.eq(swapInfo.joinRequest.maxAmtsIn);
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
});
