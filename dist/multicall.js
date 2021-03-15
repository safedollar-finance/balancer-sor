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
var __importStar =
    (this && this.__importStar) ||
    function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null)
            for (var k in mod)
                if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
        result['default'] = mod;
        return result;
    };
Object.defineProperty(exports, '__esModule', { value: true });
const contracts_1 = require('@ethersproject/contracts');
const abi_1 = require('@ethersproject/abi');
const bmath = __importStar(require('./bmath'));
function getOnChainBalances(pools, multiAddress, vaultAddress, provider) {
    return __awaiter(this, void 0, void 0, function*() {
        let poolsWithOnChainBalance = { pools: [] };
        if (pools.pools.length === 0) return poolsWithOnChainBalance;
        const multiAbi = require('./abi/multicall.json');
        const vaultAbi = require('./abi/vault.json');
        const multicallContract = new contracts_1.Contract(
            multiAddress,
            multiAbi,
            provider
        );
        const vaultInterface = new abi_1.Interface(vaultAbi);
        const calls = [];
        pools.pools.forEach(pool => {
            calls.push([
                vaultAddress,
                vaultInterface.encodeFunctionData('getPoolTokens', [pool.id]),
            ]);
        });
        try {
            const [, response] = yield multicallContract.aggregate(calls);
            for (let i = 0; i < response.length; i++) {
                const result = vaultInterface.decodeFunctionResult(
                    'getPoolTokens',
                    response[i]
                );
                const resultTokens = result.tokens.map(token =>
                    token.toLowerCase()
                );
                const poolTokens = [];
                const poolWithBalances = {
                    id: pools.pools[i].id,
                    // !!!!!!! TO DO address?: pools.pools[i].address,
                    swapFee: pools.pools[i].swapFee,
                    totalWeight: pools.pools[i].totalWeight,
                    tokens: poolTokens,
                    tokensList: pools.pools[i].tokensList.map(token =>
                        token.toLowerCase()
                    ),
                    amp: pools.pools[i].amp,
                    balanceBpt: pools.pools[i].balanceBpt,
                };
                pools.pools[i].tokens.forEach(token => {
                    let resultIndex = resultTokens.indexOf(token.address);
                    const balance = bmath
                        .scale(
                            bmath.bnum(result.balances[resultIndex]),
                            -Number(token.decimals)
                        )
                        .toString();
                    poolWithBalances.tokens.push({
                        address: token.address.toLowerCase(),
                        balance: balance,
                        decimals: token.decimals,
                        denormWeight: token.denormWeight,
                    });
                });
                poolsWithOnChainBalance.pools.push(poolWithBalances);
            }
        } catch (e) {
            console.error('Failure querying onchain balances', { error: e });
            return;
        }
        return poolsWithOnChainBalance;
    });
}
exports.getOnChainBalances = getOnChainBalances;
