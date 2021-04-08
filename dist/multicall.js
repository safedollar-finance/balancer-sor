'use strict';
var __awaiter =
    (this && this.__awaiter) ||
    function(thisArg, _arguments, P, generator) {
        function adopt(value) {
            return value instanceof P
                ? value
                : new P(function(resolve) {
                      resolve(value);
                  });
        }
        return new (P || (P = Promise))(function(resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value));
                } catch (e) {
                    reject(e);
                }
            }
            function rejected(value) {
                try {
                    step(generator['throw'](value));
                } catch (e) {
                    reject(e);
                }
            }
            function step(result) {
                result.done
                    ? resolve(result.value)
                    : adopt(result.value).then(fulfilled, rejected);
            }
            step(
                (generator = generator.apply(thisArg, _arguments || [])).next()
            );
        });
    };
var __importDefault =
    (this && this.__importDefault) ||
    function(mod) {
        return mod && mod.__esModule ? mod : { default: mod };
    };
Object.defineProperty(exports, '__esModule', { value: true });
const bmath_1 = require('./bmath');
const multicaller_1 = require('./utils/multicaller');
const lodash_1 = __importDefault(require('lodash'));
const Vault_json_1 = __importDefault(require('./abi/Vault.json'));
const weightedPoolAbi_json_1 = __importDefault(
    require('./pools/weightedPool/weightedPoolAbi.json')
);
const stablePoolAbi_json_1 = __importDefault(
    require('./pools/stablePool/stablePoolAbi.json')
);
// Combine all the ABIs and remove duplicates
exports.abis = Object.values(
    Object.fromEntries(
        [
            ...Vault_json_1.default,
            ...weightedPoolAbi_json_1.default,
            ...stablePoolAbi_json_1.default,
        ].map(row => [row.name, row])
    )
);
// Load pools data with multicalls
function getOnChainBalances(
    subgraphPools,
    multiAddress,
    vaultAddress,
    provider
) {
    return __awaiter(this, void 0, void 0, function*() {
        // ): Promise<Pool[]> {
        console.time('getPools');
        if (subgraphPools.pools.length === 0) return subgraphPools;
        const multiPool = new multicaller_1.Multicaller(
            multiAddress,
            provider,
            exports.abis
        );
        let pools = {};
        subgraphPools.pools.forEach(pool => {
            lodash_1.default.set(pools, `${pool.id}.id`, pool.id);
            multiPool.call(
                `${pool.id}.poolTokens`,
                vaultAddress,
                'getPoolTokens',
                [pool.id]
            );
            multiPool.call(`${pool.id}.swapFee`, pool.address, 'getSwapFee');
            multiPool.call(
                `${pool.id}.totalSupply`,
                pool.address,
                'totalSupply'
            );
            // TO DO - Make this part of class to make more flexible?
            if (pool.poolType === 'Weighted') {
                multiPool.call(
                    `${pool.id}.weights`,
                    pool.address,
                    'getNormalizedWeights',
                    []
                );
            } else if (pool.poolType === 'Stable') {
                multiPool.call(
                    `${pool.id}.amp`,
                    pool.address,
                    'getAmplificationParameter'
                );
            }
        });
        pools = yield multiPool.execute(pools);
        subgraphPools.pools.forEach(subgraphPool => {
            const onChainResult = pools[subgraphPool.id];
            subgraphPool.swapFee = bmath_1
                .scale(bmath_1.bnum(onChainResult.swapFee), -18)
                .toString();
            onChainResult.poolTokens.tokens.forEach((token, i) => {
                const tokenAddress = onChainResult.poolTokens.tokens[i]
                    .toString()
                    .toLowerCase();
                const T = subgraphPool.tokens.find(
                    t => t.address === tokenAddress
                );
                const balance = bmath_1
                    .scale(
                        bmath_1.bnum(onChainResult.poolTokens.balances[i]),
                        -Number(T.decimals)
                    )
                    .toString();
                T.balance = balance;
                if (subgraphPool.poolType === 'Weighted')
                    T.weight = bmath_1
                        .scale(bmath_1.bnum(onChainResult.weights[i]), -18)
                        .toString();
            });
            if (subgraphPool.poolType === 'Stable') {
                subgraphPool.amp = bmath_1
                    .scale(bmath_1.bnum(onChainResult.amp), -18)
                    .toString();
            }
        });
        console.timeEnd('getPools');
        return subgraphPools;
    });
}
exports.getOnChainBalances = getOnChainBalances;