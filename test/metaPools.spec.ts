require('dotenv').config();
import { ALLOW_ADD_REMOVE } from '../src/config';
import { expect } from 'chai';
import { JsonRpcProvider } from '@ethersproject/providers';
import { SOR } from '../src';
import {
    SubGraphPoolsBase,
    SwapInfo,
    SwapTypes,
    PoolTypes,
    PairTypes,
} from '../src/types';
import { bnum, scale } from '../src/bmath';
import { BigNumber } from '../src/utils/bignumber';
import {
    StablePool,
    StablePoolPairData,
} from '../src/pools/stablePool/stablePool';
import { BPTForTokensZeroPriceImpact } from '../src/frontendHelpers/stableHelpers';

const gasPrice = bnum('30000000000');
const maxPools = 4;
const chainId = 1;
const provider = new JsonRpcProvider(
    `https://mainnet.infura.io/v3/${process.env.INFURA}`
);

const BAL = '0xba100000625a3754423978a60c9317c58a424e3d';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const DAI = '0x6b175474e89094c44da98b954eedeac495271d0f';
const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const BPT = '0xebfed10e11dc08fcda1af1fda146945e8710f22e';
const RANDOM = '0x1456688345527be1f37e9e627da0837d6f08c925';

// npx mocha -r ts-node/register test/metaPools.spec.ts
describe(`Tests for Simplified MetaPool.`, () => {
    if (ALLOW_ADD_REMOVE) {
        // TODO - Add correct formatting for relayer
        context('only has single path option available', () => {
            it('should return joinSwap with relayer flag and format', async () => {
                const poolsFromFile: SubGraphPoolsBase = require('./testData/stablePools/metaPool2.json');
                const tokenIn = DAI;
                const tokenOut = RANDOM;
                const swapType = SwapTypes.SwapExactIn;
                const swapAmt: BigNumber = bnum('0.01');

                const sor = new SOR(
                    provider,
                    gasPrice,
                    maxPools,
                    chainId,
                    poolsFromFile
                );

                const fetchSuccess = await sor.fetchPools(false);

                let swapInfo: SwapInfo = await sor.getSwaps(
                    tokenIn,
                    tokenOut,
                    swapType,
                    swapAmt
                );

                console.log(swapInfo.swaps);
                console.log(swapInfo.returnAmount.toString());

                // TO DO - Need to return in correct format for Relayer
                // Should return TokenIn > Join > BPT > TokenOut
                expect(swapInfo.isRelayerSwap).to.be.true;
                expect(swapInfo.swaps.length).eq(2);
                expect(swapInfo.swaps[0].amount.toString()).eq(
                    swapAmt.times(1e18).toString()
                );
                expect(swapInfo.swaps[0].poolId).eq(poolsFromFile.pools[0].id);
                expect(
                    swapInfo.tokenAddresses[swapInfo.swaps[0].assetInIndex]
                ).eq(tokenIn);
                expect(
                    swapInfo.tokenAddresses[swapInfo.swaps[0].assetOutIndex]
                ).eq(poolsFromFile.pools[0].address);

                expect(swapInfo.swaps[1].amount.toString()).eq('0');
                expect(swapInfo.swaps[1].poolId).eq(poolsFromFile.pools[1].id);
                expect(
                    swapInfo.tokenAddresses[swapInfo.swaps[1].assetInIndex]
                ).eq(poolsFromFile.pools[0].address);
                expect(
                    swapInfo.tokenAddresses[swapInfo.swaps[1].assetOutIndex]
                ).eq(tokenOut);
                // TO DO - Confirm amount via maths
                expect(swapInfo.returnAmount.toString()).eq('4996659931687402');
            });

            // TODO - Add correct formatting for relayer
            it('should return direct with vault format', async () => {
                const poolsFromFile = require('./testData/stablePools/metaPool2.json');
                const pools = { pools: poolsFromFile.poolsDirect };
                const tokenIn = DAI;
                const tokenOut = RANDOM;
                const swapType = SwapTypes.SwapExactIn;
                const swapAmt: BigNumber = bnum('0.01');

                const sor = new SOR(
                    provider,
                    gasPrice,
                    maxPools,
                    chainId,
                    pools
                );

                const fetchSuccess = await sor.fetchPools(false);

                let swapInfo: SwapInfo = await sor.getSwaps(
                    tokenIn,
                    tokenOut,
                    swapType,
                    swapAmt
                );

                console.log(swapInfo.swaps);
                console.log(swapInfo.returnAmount.toString());

                expect(swapInfo.isRelayerSwap).to.be.false;
                expect(swapInfo.swaps.length).eq(1);
                expect(swapInfo.swaps[0].amount.toString()).eq(
                    swapAmt.times(1e18).toString()
                );
                expect(swapInfo.swaps[0].poolId).eq(
                    poolsFromFile.poolsDirect[0].id
                );
                expect(
                    swapInfo.tokenAddresses[swapInfo.swaps[0].assetInIndex]
                ).eq(tokenIn);
                expect(
                    swapInfo.tokenAddresses[swapInfo.swaps[0].assetOutIndex]
                ).eq(tokenOut);
                // TO DO - Confirm amount via maths
                expect(swapInfo.returnAmount.toString()).eq('9995091718006195');
            });
        });

        // TO DO - This is valid test but needs finished
        context('has 2 joinSwap paths', () => {
            it('should return single joinSwap with relayer flag and format', async () => {
                const poolsFromFile = require('./testData/stablePools/metaPool2.json');
                const pools = {
                    pools: poolsFromFile.pools.concat(poolsFromFile.metaPool2),
                };
                const tokenIn = DAI;
                const tokenOut = RANDOM;
                const swapType = SwapTypes.SwapExactIn;
                const swapAmt: BigNumber = bnum('0.01');

                const sor = new SOR(
                    provider,
                    gasPrice,
                    maxPools,
                    chainId,
                    pools
                );

                const fetchSuccess = await sor.fetchPools(false);

                let swapInfo: SwapInfo = await sor.getSwaps(
                    tokenIn,
                    tokenOut,
                    swapType,
                    swapAmt
                );

                console.log(swapInfo.swaps);
                console.log(swapInfo.returnAmount.toString());

                // TO DO - Need to return in correct format for Relayer
                // Should return TokenIn > Join > BPT > TokenOut
                expect(swapInfo.isRelayerSwap).to.be.true;
                expect(swapInfo.swaps.length).eq(2);
                expect(swapInfo.swaps[0].amount.toString()).eq(
                    swapAmt.times(1e18).toString()
                );
                expect(swapInfo.swaps[0].poolId).eq(
                    poolsFromFile.metaPool2[0].id
                );
                expect(
                    swapInfo.tokenAddresses[swapInfo.swaps[0].assetInIndex]
                ).eq(tokenIn);
                expect(
                    swapInfo.tokenAddresses[swapInfo.swaps[0].assetOutIndex]
                ).eq(poolsFromFile.metaPool2[0].address);

                expect(swapInfo.swaps[1].amount.toString()).eq('0');
                expect(swapInfo.swaps[1].poolId).eq(
                    poolsFromFile.metaPool2[1].id
                );
                expect(
                    swapInfo.tokenAddresses[swapInfo.swaps[1].assetInIndex]
                ).eq(poolsFromFile.metaPool2[0].address);
                expect(
                    swapInfo.tokenAddresses[swapInfo.swaps[1].assetOutIndex]
                ).eq(tokenOut);
                // TO DO - Confirm amount via maths
                expect(swapInfo.returnAmount.toString()).eq('4996659931687402');
            });
        });

        // TO DO - Test case where it would return join and other swaps and another with swaps and join
        // context('has a joinSwap path and direct path available', () => {
        //     it('should return joinSwap with relayer flag and format', async () => {
        //         const poolsFromFile = require('./testData/stablePools/metaPool2.json');
        //         const pools = { pools: poolsFromFile.pools.concat(poolsFromFile.poolsDirectWorse) };
        //         // const pools = { pools: poolsFromFile.poolsDirect };
        //         console.log(pools.pools);
        //         const tokenIn = DAI;
        //         const tokenOut = RANDOM;
        //         const swapType = SwapTypes.SwapExactIn;
        //         const swapAmt: BigNumber = bnum('0.01');

        //         const sor = new SOR(
        //             provider,
        //             gasPrice,
        //             maxPools,
        //             chainId,
        //             pools
        //         );

        //         const fetchSuccess = await sor.fetchPools(false);

        //         let swapInfo: SwapInfo = await sor.getSwaps(
        //             tokenIn,
        //             tokenOut,
        //             swapType,
        //             swapAmt
        //         );

        //         console.log(swapInfo.returnAmount.toString())
        //         console.log(swapInfo.swaps);

        //         // TO DO - Need to return in correct format for Relayer
        //         // Should return TokenIn > Join > BPT > TokenOut
        //         expect(swapInfo.isRelayerSwap).to.be.true;
        //         expect(swapInfo.swaps.length).eq(2);
        //         expect(swapInfo.swaps[0].amount.toString()).eq(
        //             swapAmt.times(1e18).toString()
        //         );
        //         expect(swapInfo.swaps[0].poolId).eq(poolsFromFile.pools[0].id);
        //         expect(
        //             swapInfo.tokenAddresses[swapInfo.swaps[0].assetInIndex]
        //         ).eq(tokenIn);
        //         expect(
        //             swapInfo.tokenAddresses[swapInfo.swaps[0].assetOutIndex]
        //         ).eq(poolsFromFile.pools[0].address);

        //         expect(swapInfo.swaps[1].amount.toString()).eq('0');
        //         expect(swapInfo.swaps[1].poolId).eq(poolsFromFile.pools[1].id);
        //         expect(
        //             swapInfo.tokenAddresses[swapInfo.swaps[1].assetInIndex]
        //         ).eq(poolsFromFile.pools[0].address);
        //         expect(
        //             swapInfo.tokenAddresses[swapInfo.swaps[1].assetOutIndex]
        //         ).eq(tokenOut);
        //         // TO DO - Confirm amount via maths
        //         expect(swapInfo.returnAmount.toString()).eq(
        //             '30550073212967513'
        //         );
        //     });
        // })

        // TODO - Exit Swaps
    }
});
