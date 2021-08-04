import { BaseProvider } from '@ethersproject/providers';
import { SubGraphPoolsBase } from './types';
import { scale, bnum } from './bmath';
import { Multicaller } from './utils/multicaller';
import _ from 'lodash';

// Load pools data with multicalls
export async function getOnChainBalances(
    subgraphPools: SubGraphPoolsBase,
    multiAddress: string,
    vaultAddress: string,
    provider: BaseProvider
): Promise<SubGraphPoolsBase> {
    if (subgraphPools.pools.length === 0) return subgraphPools;

    const vaultAbi = require('./abi/Vault.json');
    const weightedPoolAbi = require('./pools/weightedPool/weightedPoolAbi.json');
    const stablePoolAbi = require('./pools/stablePool/stablePoolAbi.json');
    const elementPoolAbi = require('./pools/elementPool/ConvergentCurvePool.json');
    const abis = Object.values(
        Object.fromEntries(
            [
                ...vaultAbi,
                ...weightedPoolAbi,
                ...stablePoolAbi,
                ...elementPoolAbi,
            ].map(row => [row.name, row])
        )
    );

    const multiPool = new Multicaller(multiAddress, provider, abis);

    let pools = {};

    subgraphPools.pools.forEach(pool => {
        _.set(pools, `${pool.id}.id`, pool.id);
        multiPool.call(`${pool.id}.poolTokens`, vaultAddress, 'getPoolTokens', [
            pool.id,
        ]);

        multiPool.call(`${pool.id}.totalSupply`, pool.address, 'totalSupply');
        // TO DO - Make this part of class to make more flexible?
        if (pool.poolType === 'Weighted') {
            multiPool.call(
                `${pool.id}.weights`,
                pool.address,
                'getNormalizedWeights',
                []
            );
            multiPool.call(
                `${pool.id}.swapFee`,
                pool.address,
                'getSwapFeePercentage'
            );
        } else if (pool.poolType === 'Stable') {
            multiPool.call(
                `${pool.id}.amp`,
                pool.address,
                'getAmplificationParameter'
            );
            multiPool.call(
                `${pool.id}.swapFee`,
                pool.address,
                'getSwapFeePercentage'
            );
        } else if (pool.poolType === 'Element') {
            multiPool.call(`${pool.id}.swapFee`, pool.address, 'percentFee');
        }
    });

    pools = await multiPool.execute(pools);

    subgraphPools.pools.forEach(subgraphPool => {
        const onChainResult = pools[subgraphPool.id];
        try {
            subgraphPool.swapFee = scale(
                bnum(onChainResult.swapFee),
                -18
            ).toString();
            onChainResult.poolTokens.tokens.forEach((token, i) => {
                const tokenAddress = onChainResult.poolTokens.tokens[i]
                    .toString()
                    .toLowerCase();
                const T = subgraphPool.tokens.find(
                    t => t.address === tokenAddress
                );
                const balance = scale(
                    bnum(onChainResult.poolTokens.balances[i]),
                    -Number(T.decimals)
                ).toString();
                T.balance = balance;
                if (subgraphPool.poolType === 'Weighted')
                    T.weight = scale(
                        bnum(onChainResult.weights[i]),
                        -18
                    ).toString();
            });
        } catch (err) {
            // Likely an unsupported pool type
            // console.log(`Issue with pool onchain call`)
            // console.log(subgraphPool.id);
            // console.log(onChainResult);
        }
    });
    return subgraphPools;
}
