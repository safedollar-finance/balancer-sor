require('dotenv').config();
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

// npx mocha -r ts-node/register test/lbp.spec.ts
describe(`Tests for LBP Pools.`, () => {
    /*
    LBP pools have same maths, etc as WeightedPools and should be covered by those tests for main functions.
    These tests cover the main difference which is disabled swaps. 
    Changing weights should be handle by SG/Multicall so no difference as SOR sees.
    */
    context('lbp pool', () => {
        it(`Full Swap - swapExactIn, Swaps not paused so should have route`, async () => {
            const poolsFromFile: SubGraphPoolsBase = require('./testData/lbpPools/singlePool.json');
            const tokenIn = DAI;
            const tokenOut = USDC;
            const swapType = SwapTypes.SwapExactIn;
            const swapAmt: BigNumber = bnum('1');

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

            expect(poolsFromFile.pools[0].swapEnabled).to.be.true;
            expect(swapInfo.returnAmount.toString()).eq('998181');
            expect(swapInfo.swaps.length).eq(1);
        });

        it(`Full Swap - swapExactIn, Swaps paused so should have no route`, async () => {
            const poolsFromFile: SubGraphPoolsBase = require('./testData/lbpPools/singlePool.json');
            // Set paused to true
            poolsFromFile.pools[0].swapEnabled = false;
            const tokenIn = DAI;
            const tokenOut = USDC;
            const swapType = SwapTypes.SwapExactIn;
            const swapAmt: BigNumber = bnum('1');

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

            expect(poolsFromFile.pools[0].swapEnabled).to.be.false;
            expect(swapInfo.returnAmount.toString()).eq('0');
            expect(swapInfo.swaps.length).eq(0);
        });
    });
});
