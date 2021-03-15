'use strict';
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
var __importDefault =
    (this && this.__importDefault) ||
    function(mod) {
        return mod && mod.__esModule ? mod : { default: mod };
    };
Object.defineProperty(exports, '__esModule', { value: true });
const address_1 = require('@ethersproject/address');
const bmath_1 = require('./bmath');
const stableMath = __importStar(require('./poolMath/stableMath'));
const weightedMath = __importStar(require('./poolMath/weightedMath'));
const disabled_tokens_json_1 = __importDefault(
    require('./disabled-tokens.json')
);
function getLimitAmountSwap(poolPairData, swapType) {
    // We multiply ratios by 10**-18 because we are in normalized space
    // so 0.5 should be 0.5 and not 500000000000000000
    // TODO: update bmath to use everything normalized
    if (swapType === 'swapExactIn') {
        return poolPairData.balanceIn.times(
            bmath_1.MAX_IN_RATIO.times(Math.pow(10, -18))
        );
    } else {
        return poolPairData.balanceOut.times(
            bmath_1.MAX_OUT_RATIO.times(Math.pow(10, -18))
        );
    }
}
exports.getLimitAmountSwap = getLimitAmountSwap;
function getLimitAmountSwapForPath(pools, path, swapType) {
    let poolPairData = path.poolPairData;
    if (poolPairData.length == 1) {
        return getLimitAmountSwap(poolPairData[0], swapType);
    } else if (poolPairData.length == 2) {
        if (swapType === 'swapExactIn') {
            let limitAmountSwap1 = getLimitAmountSwap(
                poolPairData[0],
                swapType
            );
            let limitAmountSwap2 = getLimitAmountSwap(
                poolPairData[1],
                swapType
            );
            let limitOutputAmountSwap1 = getOutputAmountSwap(
                poolPairData[0],
                swapType,
                limitAmountSwap1
            );
            if (limitOutputAmountSwap1.gt(limitAmountSwap2))
                if (limitAmountSwap2.isZero())
                    // This means second hop is limiting the path
                    return bmath_1.bnum(0);
                // this is necessary to avoid return NaN
                else
                    return getOutputAmountSwap(
                        poolPairData[0],
                        'swapExactOut',
                        limitAmountSwap2
                    );
            // This means first hop is limiting the path
            else return limitAmountSwap1;
        } else {
            let limitAmountSwap1 = getLimitAmountSwap(
                poolPairData[0],
                swapType
            );
            let limitAmountSwap2 = getLimitAmountSwap(
                poolPairData[1],
                swapType
            );
            let limitOutputAmountSwap2 = getOutputAmountSwap(
                poolPairData[1],
                swapType,
                limitAmountSwap2
            );
            if (limitOutputAmountSwap2.gt(limitAmountSwap1))
                // This means first hop is limiting the path
                return getOutputAmountSwap(
                    poolPairData[1],
                    'swapExactIn',
                    limitAmountSwap1
                );
            // This means second hop is limiting the path
            else return limitAmountSwap2;
        }
    } else {
        throw new Error('Path with more than 2 swaps not supported');
    }
}
exports.getLimitAmountSwapForPath = getLimitAmountSwapForPath;
// TODO: Add cases for pairType = [BTP->token, token->BTP] and poolType = [weighted, stable]
function getOutputAmountSwap(poolPairData, swapType, amount) {
    let poolType = poolPairData.poolType;
    let pairType = poolPairData.pairType;
    // TODO: check if necessary to check if amount > limitAmount
    if (swapType === 'swapExactIn') {
        if (poolPairData.balanceIn.isZero()) {
            return bmath_1.bnum(0);
        }
    } else {
        if (poolPairData.balanceOut.isZero()) {
            return bmath_1.bnum(0);
        }
        if (amount.gte(poolPairData.balanceOut))
            return bmath_1.bnum('Infinity');
    }
    if (swapType === 'swapExactIn') {
        if (poolType == 'Weighted') {
            if (pairType == 'token->token') {
                return weightedMath._exactTokenInForTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return weightedMath._exactTokenInForBPTOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'BPT->token') {
                return weightedMath._exactBPTInForTokenOut(
                    amount,
                    poolPairData
                );
            }
        } else if (poolType == 'Stable') {
            if (pairType == 'token->token') {
                return stableMath._exactTokenInForTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return stableMath._exactTokenInForBPTOut(amount, poolPairData);
            } else if (pairType == 'BPT->token') {
                return stableMath._exactBPTInForTokenOut(amount, poolPairData);
            }
        }
    } else {
        if (poolType == 'Weighted') {
            if (pairType == 'token->token') {
                return weightedMath._tokenInForExactTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return weightedMath._tokenInForExactBPTOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'BPT->token') {
                return weightedMath._BPTInForExactTokenOut(
                    amount,
                    poolPairData
                );
            }
        } else if (poolType == 'Stable') {
            if (pairType == 'token->token') {
                return stableMath._tokenInForExactTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return stableMath._tokenInForExactBPTOut(amount, poolPairData);
            } else if (pairType == 'BPT->token') {
                return stableMath._BPTInForExactTokenOut(amount, poolPairData);
            }
        }
    }
}
exports.getOutputAmountSwap = getOutputAmountSwap;
function getOutputAmountSwapForPath(pools, path, swapType, amount) {
    // First of all check if the amount is above limit, if so, return 0 for
    // 'swapExactIn' or Inf for swapExactOut
    if (amount.gt(path.limitAmount)) {
        if (swapType === 'swapExactIn') {
            return bmath_1.bnum(0);
        } else {
            return bmath_1.bnum(Infinity);
        }
    }
    let poolPairData = path.poolPairData;
    if (poolPairData.length == 1) {
        return getOutputAmountSwap(poolPairData[0], swapType, amount);
    } else if (poolPairData.length == 2) {
        if (swapType === 'swapExactIn') {
            // The outputAmount is number of tokenOut we receive from the second poolPairData
            let outputAmountSwap1 = getOutputAmountSwap(
                poolPairData[0],
                swapType,
                amount
            );
            return getOutputAmountSwap(
                poolPairData[1],
                swapType,
                outputAmountSwap1
            );
        } else {
            // The outputAmount is number of tokenIn we send to the first poolPairData
            let outputAmountSwap2 = getOutputAmountSwap(
                poolPairData[1],
                swapType,
                amount
            );
            return getOutputAmountSwap(
                poolPairData[0],
                swapType,
                outputAmountSwap2
            );
        }
    } else {
        throw new Error('Path with more than 2 swaps not supported');
    }
}
exports.getOutputAmountSwapForPath = getOutputAmountSwapForPath;
function getEffectivePriceSwapForPath(pools, path, swapType, amount) {
    if (amount.lt(bmath_1.bnum(Math.pow(10, -10)))) {
        // Return spot price as code below would be 0/0 = undefined
        // or small_amount/0 or 0/small_amount which would cause bugs
        return getSpotPriceAfterSwapForPath(pools, path, swapType, amount);
    }
    let outputAmountSwap = getOutputAmountSwapForPath(
        pools,
        path,
        swapType,
        amount
    );
    if (swapType === 'swapExactIn') {
        return amount.div(outputAmountSwap); // amountIn/AmountOut
    } else {
        return outputAmountSwap.div(amount); // amountIn/AmountOut
    }
}
exports.getEffectivePriceSwapForPath = getEffectivePriceSwapForPath;
// TODO: Add cases for pairType = [BTP->token, token->BTP] and poolType = [weighted, stable]
function getSpotPriceAfterSwap(poolPairData, swapType, amount) {
    let poolType = poolPairData.poolType;
    let pairType = poolPairData.pairType;
    // TODO: check if necessary to check if amount > limitAmount
    if (swapType === 'swapExactIn') {
        if (poolPairData.balanceIn.isZero()) {
            return bmath_1.bnum(0);
        }
    } else {
        if (poolPairData.balanceOut.isZero()) {
            return bmath_1.bnum(0);
        }
        if (amount.gte(poolPairData.balanceOut))
            return bmath_1.bnum('Infinity');
    }
    if (swapType === 'swapExactIn') {
        if (poolType == 'Weighted') {
            if (pairType == 'token->token') {
                return weightedMath._spotPriceAfterSwapExactTokenInForTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return weightedMath._spotPriceAfterSwapExactTokenInForBPTOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'BPT->token') {
                return weightedMath._spotPriceAfterSwapExactBPTInForTokenOut(
                    amount,
                    poolPairData
                );
            }
        } else if (poolType == 'Stable') {
            if (pairType == 'token->token') {
                return stableMath._spotPriceAfterSwapExactTokenInForTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return stableMath._spotPriceAfterSwapExactTokenInForBPTOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'BPT->token') {
                return stableMath._spotPriceAfterSwapExactBPTInForTokenOut(
                    amount,
                    poolPairData
                );
            }
        }
    } else {
        if (poolType == 'Weighted') {
            if (pairType == 'token->token') {
                return weightedMath._spotPriceAfterSwapTokenInForExactTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return weightedMath._spotPriceAfterSwapTokenInForExactBPTOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'BPT->token') {
                return weightedMath._spotPriceAfterSwapBPTInForExactTokenOut(
                    amount,
                    poolPairData
                );
            }
        } else if (poolType == 'Stable') {
            if (pairType == 'token->token') {
                return stableMath._spotPriceAfterSwapTokenInForExactTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return stableMath._spotPriceAfterSwapTokenInForExactBPTOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'BPT->token') {
                return stableMath._spotPriceAfterSwapBPTInForExactTokenOut(
                    amount,
                    poolPairData
                );
            }
        }
    }
}
exports.getSpotPriceAfterSwap = getSpotPriceAfterSwap;
function getSpotPriceAfterSwapForPath(pools, path, swapType, amount) {
    let poolPairData = path.poolPairData;
    if (poolPairData.length == 1) {
        return getSpotPriceAfterSwap(poolPairData[0], swapType, amount);
    } else if (poolPairData.length == 2) {
        if (swapType === 'swapExactIn') {
            let outputAmountSwap1 = getOutputAmountSwap(
                poolPairData[0],
                swapType,
                amount
            );
            let spotPriceAfterSwap1 = getSpotPriceAfterSwap(
                poolPairData[0],
                swapType,
                amount
            );
            let spotPriceAfterSwap2 = getSpotPriceAfterSwap(
                poolPairData[1],
                swapType,
                outputAmountSwap1
            );
            return spotPriceAfterSwap1.times(spotPriceAfterSwap2);
        } else {
            let outputAmountSwap2 = getOutputAmountSwap(
                poolPairData[1],
                swapType,
                amount
            );
            let spotPriceAfterSwap1 = getSpotPriceAfterSwap(
                poolPairData[0],
                swapType,
                outputAmountSwap2
            );
            let spotPriceAfterSwap2 = getSpotPriceAfterSwap(
                poolPairData[1],
                swapType,
                amount
            );
            return spotPriceAfterSwap1.times(spotPriceAfterSwap2);
        }
    } else {
        throw new Error('Path with more than 2 swaps not supported');
    }
}
exports.getSpotPriceAfterSwapForPath = getSpotPriceAfterSwapForPath;
// TODO: Add cases for pairType = [BTP->token, token->BTP] and poolType = [weighted, stable]
function getDerivativeSpotPriceAfterSwap(poolPairData, swapType, amount) {
    let poolType = poolPairData.poolType;
    let pairType = poolPairData.pairType;
    // TODO: check if necessary to check if amount > limitAmount
    if (swapType === 'swapExactIn') {
        if (poolPairData.balanceIn.isZero()) {
            return bmath_1.bnum(0);
        }
    } else {
        if (poolPairData.balanceOut.isZero()) {
            return bmath_1.bnum(0);
        }
        if (amount.gte(poolPairData.balanceOut))
            return bmath_1.bnum('Infinity');
    }
    if (swapType === 'swapExactIn') {
        if (poolType == 'Weighted') {
            if (pairType == 'token->token') {
                return weightedMath._derivativeSpotPriceAfterSwapExactTokenInForTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return weightedMath._derivativeSpotPriceAfterSwapExactTokenInForBPTOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'BPT->token') {
                return weightedMath._derivativeSpotPriceAfterSwapExactBPTInForTokenOut(
                    amount,
                    poolPairData
                );
            }
        } else if (poolType == 'Stable') {
            if (pairType == 'token->token') {
                return stableMath._derivativeSpotPriceAfterSwapExactTokenInForTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return stableMath._derivativeSpotPriceAfterSwapExactTokenInForBPTOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'BPT->token') {
                return stableMath._derivativeSpotPriceAfterSwapExactBPTInForTokenOut(
                    amount,
                    poolPairData
                );
            }
        }
    } else {
        if (poolType == 'Weighted') {
            if (pairType == 'token->token') {
                return weightedMath._derivativeSpotPriceAfterSwapTokenInForExactTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return weightedMath._derivativeSpotPriceAfterSwapTokenInForExactBPTOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'BPT->token') {
                return weightedMath._derivativeSpotPriceAfterSwapBPTInForExactTokenOut(
                    amount,
                    poolPairData
                );
            }
        } else if (poolType == 'Stable') {
            if (pairType == 'token->token') {
                return stableMath._derivativeSpotPriceAfterSwapTokenInForExactTokenOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'token->BPT') {
                return stableMath._derivativeSpotPriceAfterSwapTokenInForExactBPTOut(
                    amount,
                    poolPairData
                );
            } else if (pairType == 'BPT->token') {
                return stableMath._derivativeSpotPriceAfterSwapBPTInForExactTokenOut(
                    amount,
                    poolPairData
                );
            }
        }
    }
}
exports.getDerivativeSpotPriceAfterSwap = getDerivativeSpotPriceAfterSwap;
function getDerivativeSpotPriceAfterSwapForPath(pools, path, swapType, amount) {
    let poolPairData = path.poolPairData;
    if (poolPairData.length == 1) {
        return getDerivativeSpotPriceAfterSwap(
            poolPairData[0],
            swapType,
            amount
        );
    } else if (poolPairData.length == 2) {
        if (swapType === 'swapExactIn') {
            let outputAmountSwap1 = getOutputAmountSwap(
                poolPairData[0],
                swapType,
                amount
            );
            let SPaS1 = getSpotPriceAfterSwap(
                poolPairData[0],
                swapType,
                amount
            );
            let SPaS2 = getSpotPriceAfterSwap(
                poolPairData[1],
                swapType,
                outputAmountSwap1
            );
            let dSPaS1 = getDerivativeSpotPriceAfterSwap(
                poolPairData[0],
                swapType,
                amount
            );
            let dSPaS2 = getDerivativeSpotPriceAfterSwap(
                poolPairData[1],
                swapType,
                outputAmountSwap1
            );
            // Using the rule of the derivative of the multiplication: d[f(x)*g(x)] = d[f(x)]*g(x) + f(x)*d[g(x)]
            // where SPaS1 is SpotPriceAfterSwap of pool 1 and OA1 is OutputAmount of pool 1. We then have:
            // d[SPaS1(x) * SPaS2(OA1(x))] = d[SPaS1(x)] * SPaS2(OA1(x)) + SPaS1(x) * d[SPaS2(OA1(x))]
            // Let's expand the term d[SPaS2(OA1(x))] which is trickier:
            // d[SPaS2(OA1(x))] at x0 = d[SPaS2(x)] at OA1(x0) * d[OA1(x)] at x0,
            // Since d[OA1(x)] = 1/SPaS1(x) we then have:
            // d[SPaS2(OA1(x))] = d[SPaS2(x)] * 1/SPaS1(x). Which leads us to:
            // d[SPaS1(x) * SPaS2(OA1(x))] = d[SPaS1(x)] * SPaS2(OA1(x)) + d[SPaS2(OA1(x))]
            // return dSPaS1 * SPaS2 + dSPaS2
            return dSPaS1.times(SPaS2).plus(dSPaS2);
        } else {
            let outputAmountSwap2 = getOutputAmountSwap(
                poolPairData[1],
                swapType,
                amount
            );
            let SPaS1 = getSpotPriceAfterSwap(
                poolPairData[0],
                swapType,
                outputAmountSwap2
            );
            let SPaS2 = getSpotPriceAfterSwap(
                poolPairData[1],
                swapType,
                amount
            );
            let dSPaS1 = getDerivativeSpotPriceAfterSwap(
                poolPairData[0],
                swapType,
                outputAmountSwap2
            );
            let dSPaS2 = getDerivativeSpotPriceAfterSwap(
                poolPairData[1],
                swapType,
                amount
            );
            // For swapExactOut we the outputToken is the amount of tokenIn necessary to buy a given amount of tokenOut
            // Using the rule of the derivative of the multiplication: d[f(x)*g(x)] = d[f(x)]*g(x) + f(x)*d[g(x)]
            // where SPaS1 is SpotPriceAfterSwap of pool 1 and OA2 is OutputAmount of pool 2. We then have:
            // d[SPaS1(OA2(x)) * SPaS2(x)] = d[SPaS1(OA2(x))] * SPaS2(x) + SPaS1(OA2(x)) * d[SPaS2(x)]
            // Let's expand the term d[SPaS1(OA2(x))] which is trickier:
            // d[SPaS1(OA2(x))] at x0 = d[SPaS1(x)] at OA2(x0) * d[OA2(x)] at x0,
            // Since d[OA2(x)] = SPaS2(x) we then have:
            // d[SPaS1(OA2(x))] = d[SPaS1(x)] * SPaS2(x). Which leads us to:
            // d[SPaS1(OA2(x)) * SPaS2(x)] = d[SPaS1(x)] * SPaS2(x) * SPaS2(x) + SPaS1(OA2(x)) * d[SPaS2(x)]
            // return dSPaS2 * SPaS1 + dSPaS1 * SPaS2 * SPaS2
            return dSPaS2.times(SPaS1).plus(SPaS2.times(SPaS2).times(dSPaS1));
        }
    } else {
        throw new Error('Path with more than 2 swaps not supported');
    }
}
exports.getDerivativeSpotPriceAfterSwapForPath = getDerivativeSpotPriceAfterSwapForPath;
function getHighestLimitAmountsForPaths(paths, maxPools) {
    if (paths.length === 0) return [];
    let limitAmounts = [];
    for (let i = 0; i < maxPools; i++) {
        if (i < paths.length) {
            let limitAmount = paths[i].limitAmount;
            limitAmounts.push(limitAmount);
        }
    }
    return limitAmounts;
}
exports.getHighestLimitAmountsForPaths = getHighestLimitAmountsForPaths;
exports.parsePoolPairData = (p, tokenIn, tokenOut) => {
    let poolPairData,
        poolType,
        pairType,
        tI,
        tO,
        tokenIndexIn,
        tokenIndexOut,
        balanceIn,
        balanceOut,
        decimalsOut,
        decimalsIn,
        weightIn,
        weightOut;
    // Check if tokenIn is the pool token itself (BPT)
    if (tokenIn == p.id) {
        pairType = 'BPT->token';
        balanceIn = p.balanceBpt;
        decimalsIn = bmath_1.bnum(18); // Not used but has to be defined
        weightIn = bmath_1.bnum(1); // Not used but has to be defined
    } else if (tokenOut == p.id) {
        pairType = 'token->BPT';
        balanceOut = p.balanceBpt;
        decimalsOut = bmath_1.bnum(18); // Not used but has to be defined
        weightOut = bmath_1.bnum(1); // Not used but has to be defined
    } else {
        pairType = 'token->token';
    }
    if (pairType != 'BPT->token') {
        tokenIndexIn = p.tokens.findIndex(
            t =>
                address_1.getAddress(t.address) ===
                address_1.getAddress(tokenIn)
        );
        if (tokenIndexIn < 0) throw 'Pool does not contain tokenIn';
        tI = p.tokens[tokenIndexIn];
        balanceIn = tI.balance;
        decimalsIn = tI.decimals;
        weightIn = bmath_1
            .bnum(tI.denormWeight)
            .div(bmath_1.bnum(p.totalWeight));
    }
    if (pairType != 'token->BPT') {
        tokenIndexOut = p.tokens.findIndex(
            t =>
                address_1.getAddress(t.address) ===
                address_1.getAddress(tokenOut)
        );
        if (tokenIndexOut < 0) throw 'Pool does not contain tokenOut';
        tO = p.tokens[tokenIndexOut];
        balanceOut = tO.balance;
        decimalsOut = tO.decimals;
        weightOut = bmath_1
            .bnum(tO.denormWeight)
            .div(bmath_1.bnum(p.totalWeight));
    }
    // Todo: the pool type should be already on subgraph
    if (typeof p.amp === 'undefined' || p.amp === '0') poolType = 'Weighted';
    else poolType = 'Stable';
    if (poolType == 'Weighted') {
        poolPairData = {
            id: p.id,
            poolType: poolType,
            pairType: pairType,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            decimalsIn: decimalsIn,
            decimalsOut: decimalsOut,
            balanceIn: bmath_1.bnum(balanceIn),
            balanceOut: bmath_1.bnum(balanceOut),
            weightIn: weightIn,
            weightOut: weightOut,
            swapFee: bmath_1.bnum(p.swapFee),
        };
    } else if (poolType == 'Stable') {
        // Get all token balances
        let allBalances = [];
        for (let i = 0; i < p.tokens.length; i++) {
            allBalances.push(bmath_1.bnum(p.tokens[i].balance));
        }
        let inv = stableMath._invariant(bmath_1.bnum(p.amp), allBalances);
        // Just to debug we confirm that the invariant value function is extremely close to zero as it should:
        // let invVF = stableMath._invariantValueFunction(
        //     bnum(p.amp),
        //     allBalances,
        //     inv
        // );
        poolPairData = {
            id: p.id,
            poolType: poolType,
            pairType: pairType,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            decimalsIn: decimalsIn,
            decimalsOut: decimalsOut,
            balanceIn: bmath_1.bnum(balanceIn),
            balanceOut: bmath_1.bnum(balanceOut),
            invariant: stableMath._invariant(bmath_1.bnum(p.amp), allBalances),
            swapFee: bmath_1.bnum(p.swapFee),
            allBalances: allBalances,
            amp: bmath_1.bnum(p.amp),
            tokenIndexIn: tokenIndexIn,
            tokenIndexOut: tokenIndexOut,
        };
    } else {
        throw 'Pool type unknown';
    }
    return poolPairData;
};
// Transfors path information into poolPairData list
function parsePoolPairDataForPath(pools, path, swapType) {
    let swaps = path.swaps;
    if (swaps.length == 1) {
        let swap1 = swaps[0];
        let poolSwap1 = pools[swap1.pool];
        let poolPairDataSwap1 = exports.parsePoolPairData(
            poolSwap1,
            swap1.tokenIn,
            swap1.tokenOut
        );
        return [poolPairDataSwap1];
    } else if (swaps.length == 2) {
        let swap1 = swaps[0];
        let poolSwap1 = pools[swap1.pool];
        let poolPairDataSwap1 = exports.parsePoolPairData(
            poolSwap1,
            swap1.tokenIn,
            swap1.tokenOut
        );
        let swap2 = swaps[1];
        let poolSwap2 = pools[swap2.pool];
        let poolPairDataSwap2 = exports.parsePoolPairData(
            poolSwap2,
            swap2.tokenIn,
            swap2.tokenOut
        );
        return [poolPairDataSwap1, poolPairDataSwap2];
    }
}
exports.parsePoolPairDataForPath = parsePoolPairDataForPath;
// TODO calculate exact EVM result using solidity maths (for V1 it's bmath)
function EVMgetOutputAmountSwapForPath(pools, path, swapType, amount) {
    // First of all check if the amount is above limit, if so, return 0 for
    // 'swapExactIn' or Inf for swapExactOut
    if (amount.gt(path.limitAmount)) {
        if (swapType === 'swapExactIn') {
            return bmath_1.bnum(0);
        } else {
            return bmath_1.bnum(Infinity);
        }
    }
    let poolPairData = path.poolPairData;
    if (poolPairData.length == 1) {
        return EVMgetOutputAmountSwap(pools, poolPairData[0], swapType, amount);
    } else if (poolPairData.length == 2) {
        if (swapType === 'swapExactIn') {
            // The outputAmount is number of tokenOut we receive from the second poolPairData
            let outputAmountSwap1 = EVMgetOutputAmountSwap(
                pools,
                poolPairData[0],
                swapType,
                amount
            );
            return EVMgetOutputAmountSwap(
                pools,
                poolPairData[1],
                swapType,
                outputAmountSwap1
            );
        } else {
            // The outputAmount is number of tokenIn we send to the first poolPairData
            let outputAmountSwap2 = EVMgetOutputAmountSwap(
                pools,
                poolPairData[1],
                swapType,
                amount
            );
            return EVMgetOutputAmountSwap(
                pools,
                poolPairData[0],
                swapType,
                outputAmountSwap2
            );
        }
    } else {
        throw new Error('Path with more than 2 swaps not supported');
    }
}
exports.EVMgetOutputAmountSwapForPath = EVMgetOutputAmountSwapForPath;
// We need do pass 'pools' here because this function has to update the pools state
// in case a pool is used twice in two different paths
function EVMgetOutputAmountSwap(pools, poolPairData, swapType, amount) {
    let { balanceIn, balanceOut, tokenIn, tokenOut } = poolPairData;
    let returnAmount;
    if (swapType === 'swapExactIn') {
        if (balanceIn.isEqualTo(bmath_1.bnum(0))) {
            return bmath_1.bnum(0);
        } else {
            // TODO: Add EVM calculation implemented in V2 so numbers match perfectly
            returnAmount = getOutputAmountSwap(poolPairData, swapType, amount);
            // Update balances of tokenIn and tokenOut
            pools[poolPairData.id] = updateTokenBalanceForPool(
                pools[poolPairData.id],
                tokenIn,
                balanceIn.plus(amount)
            );
            pools[poolPairData.id] = updateTokenBalanceForPool(
                pools[poolPairData.id],
                tokenOut,
                balanceOut.minus(returnAmount)
            );
            return returnAmount;
        }
    } else {
        if (balanceOut.isEqualTo(bmath_1.bnum(0))) {
            return bmath_1.bnum(0);
        } else if (amount.times(3).gte(balanceOut)) {
            // The maximum amoutOut you can have is 1/3 of the balanceOut to ensure binomial approximation diverges
            return bmath_1.bnum(0);
        } else {
            // TODO: Add EVM calculation implemented in V2 so numbers match perfectly
            returnAmount = getOutputAmountSwap(poolPairData, swapType, amount);
            // Update balances of tokenIn and tokenOut
            pools[poolPairData.id] = updateTokenBalanceForPool(
                pools[poolPairData.id],
                tokenIn,
                balanceIn.plus(returnAmount)
            );
            pools[poolPairData.id] = updateTokenBalanceForPool(
                pools[poolPairData.id],
                tokenOut,
                balanceOut.minus(amount)
            );
            return returnAmount;
        }
    }
}
exports.EVMgetOutputAmountSwap = EVMgetOutputAmountSwap;
// Updates the balance of a given token for a given pool passed as parameter
function updateTokenBalanceForPool(pool, token, balance) {
    // token is BPT
    if (pool.id == token) {
        pool.balanceBpt = balance;
        return pool;
    } else {
        // token is underlying in the pool
        let T = pool.tokens.find(t => t.address === token);
        T.balance = balance;
        return pool;
    }
}
exports.updateTokenBalanceForPool = updateTokenBalanceForPool;
// This is just used to compare how liquid the different pools are. We are
// using as unit of reference the liquidity in tokenOut. We also account
// for the different poolTypes and poolPairs
function getNormalizedLiquidity(poolPairData) {
    let {
        poolType,
        pairType,
        weightIn,
        weightOut,
        balanceIn,
        balanceOut,
        amp,
    } = poolPairData;
    if (poolType == 'Weighted') {
        if (pairType == 'token->token') {
            return balanceOut.times(weightIn).div(weightIn.plus(weightOut));
        } else if (pairType == 'token->BPT') {
            return balanceOut; // Liquidity in tokenOut is balanceBpt
        } else if (pairType == 'BPT->token') {
            return balanceOut.div(bmath_1.bnum(1).plus(weightOut)); // Liquidity in tokenOut is Bo/wo
        }
    } else if (poolType == 'Stable') {
        return balanceOut.times(amp); // This is an approximation as the actual
        // normalized liquidity is a lot more complicated to calculate
    } else throw 'Pool type unknown';
}
exports.getNormalizedLiquidity = getNormalizedLiquidity;
// LEGACY FUNCTION - Keep Input/Output Format
exports.parsePoolData = (
    directPools,
    tokenIn,
    tokenOut,
    mostLiquidPoolsFirstHop = [],
    mostLiquidPoolsSecondHop = [],
    hopTokens = []
) => {
    let pathDataList = [];
    let pools = {};
    // First add direct pair paths
    for (let idKey in directPools) {
        let p = directPools[idKey];
        // Add pool to the set with all pools (only adds if it's still not present in dict)
        pools[idKey] = p;
        let swap = {
            pool: p.id,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            tokenInDecimals: 18,
            tokenOutDecimals: 18,
        };
        let path = {
            id: p.id,
            swaps: [swap],
        };
        pathDataList.push(path);
    }
    // Now add multi-hop paths.
    // mostLiquidPoolsFirstHop and mostLiquidPoolsSecondHop always has the same
    // lengh of hopTokens
    for (let i = 0; i < hopTokens.length; i++) {
        // Add pools to the set with all pools (only adds if it's still not present in dict)
        pools[mostLiquidPoolsFirstHop[i].id] = mostLiquidPoolsFirstHop[i];
        pools[mostLiquidPoolsSecondHop[i].id] = mostLiquidPoolsSecondHop[i];
        let swap1 = {
            pool: mostLiquidPoolsFirstHop[i].id,
            tokenIn: tokenIn,
            tokenOut: hopTokens[i],
            tokenInDecimals: 18,
            tokenOutDecimals: 18,
        };
        let swap2 = {
            pool: mostLiquidPoolsSecondHop[i].id,
            tokenIn: hopTokens[i],
            tokenOut: tokenOut,
            tokenInDecimals: 18,
            tokenOutDecimals: 18,
        };
        let path = {
            id: mostLiquidPoolsFirstHop[i].id + mostLiquidPoolsSecondHop[i].id,
            swaps: [swap1, swap2],
        };
        pathDataList.push(path);
    }
    return [pools, pathDataList];
};
// function filterPoolsWithoutToken(pools, token) {
//     let found;
//     let OutputPools = {};
//     for (let i in pools) {
//         found = false;
//         for (let k = 0; k < pools[i].tokensList.length; k++) {
//             if (pools[i].tokensList[k].toLowerCase() == token.toLowerCase()) {
//                 found = true;
//                 break;
//             }
//         }
//         //Add pool if token not found
//         if (!found) OutputPools[i] = pools[i];
//     }
//     return OutputPools;
// }
function filterPools(
    allPools, // The complete information of the pools
    tokenIn,
    tokenOut,
    maxPools,
    disabledOptions = { isOverRide: false, disabledTokens: [] }
) {
    // If pool contains token add all its tokens to direct list
    // Multi-hop trades: we find the best pools that connect tokenIn and tokenOut through a multi-hop (intermediate) token
    // First: we get all tokens that can be used to be traded with tokenIn excluding
    // tokens that are in pools that already contain tokenOut (in which case multi-hop is not necessary)
    let poolsDirect = {};
    let poolsTokenOne = {};
    let poolsTokenTwo = {};
    let tokenInPairedTokens = new Set();
    let tokenOutPairedTokens = new Set();
    let disabledTokens = disabled_tokens_json_1.default.tokens;
    if (disabledOptions.isOverRide)
        disabledTokens = disabledOptions.disabledTokens;
    allPools.forEach(pool => {
        let tokenListSet = new Set(pool.tokensList);
        // we add the BPT as well as we can join/exit as part of the multihop
        tokenListSet.add(pool.id);
        disabledTokens.forEach(token => tokenListSet.delete(token.address));
        if (
            (tokenListSet.has(tokenIn) && tokenListSet.has(tokenOut)) ||
            (tokenListSet.has(tokenIn.toLowerCase()) &&
                tokenListSet.has(tokenOut.toLowerCase()))
        ) {
            poolsDirect[pool.id] = pool;
            return;
        }
        if (maxPools > 1) {
            let containsTokenIn = tokenListSet.has(tokenIn);
            let containsTokenOut = tokenListSet.has(tokenOut);
            if (containsTokenIn && !containsTokenOut) {
                tokenInPairedTokens = new Set([
                    ...tokenInPairedTokens,
                    ...tokenListSet,
                ]);
                poolsTokenOne[pool.id] = pool;
            } else if (!containsTokenIn && containsTokenOut) {
                tokenOutPairedTokens = new Set([
                    ...tokenOutPairedTokens,
                    ...tokenListSet,
                ]);
                poolsTokenTwo[pool.id] = pool;
            }
        }
    });
    // We find the intersection of the two previous sets so we can trade tokenIn for tokenOut with 1 multi-hop
    const hopTokensSet = [...tokenInPairedTokens].filter(x =>
        tokenOutPairedTokens.has(x)
    );
    // Transform set into Array
    const hopTokens = [...hopTokensSet];
    return [poolsDirect, hopTokens, poolsTokenOne, poolsTokenTwo];
}
exports.filterPools = filterPools;
function sortPoolsMostLiquid(
    tokenIn,
    tokenOut,
    hopTokens,
    poolsTokenInNoTokenOut,
    poolsTokenOutNoTokenIn
) {
    // Find the most liquid pool for each pair (tokenIn -> hopToken). We store an object in the form:
    // mostLiquidPoolsFirstHop = {hopToken1: mostLiquidPool, hopToken2: mostLiquidPool, ... , hopTokenN: mostLiquidPool}
    // Here we could query subgraph for all pools with pair (tokenIn -> hopToken), but to
    // minimize subgraph calls we loop through poolsTokenInNoTokenOut, and check the liquidity
    // only for those that have hopToken
    let mostLiquidPoolsFirstHop = [];
    let mostLiquidPoolsSecondHop = [];
    let poolPair = {}; // Store pair liquidity in case it is reused
    for (let i = 0; i < hopTokens.length; i++) {
        let highestNormalizedLiquidityFirst = bmath_1.bnum(0); // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
        let highestNormalizedLiquidityFirstPoolId; // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
        for (let k in poolsTokenInNoTokenOut) {
            // If this pool has hopTokens[i] calculate its normalized liquidity
            if (
                new Set(poolsTokenInNoTokenOut[k].tokensList)
                    .add(poolsTokenInNoTokenOut[k].id)
                    .has(hopTokens[i])
            ) {
                let normalizedLiquidity = getNormalizedLiquidity(
                    exports.parsePoolPairData(
                        poolsTokenInNoTokenOut[k],
                        tokenIn,
                        hopTokens[i].toString()
                    )
                );
                if (
                    normalizedLiquidity.isGreaterThanOrEqualTo(
                        // Cannot be strictly greater otherwise
                        // highestNormalizedLiquidityPoolId = 0 if hopTokens[i] balance is 0 in this pool.
                        highestNormalizedLiquidityFirst
                    )
                ) {
                    highestNormalizedLiquidityFirst = normalizedLiquidity;
                    highestNormalizedLiquidityFirstPoolId = k;
                }
            }
        }
        mostLiquidPoolsFirstHop[i] =
            poolsTokenInNoTokenOut[highestNormalizedLiquidityFirstPoolId];
        let highestNormalizedLiquidity = bmath_1.bnum(0); // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
        let highestNormalizedLiquidityPoolId; // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
        for (let k in poolsTokenOutNoTokenIn) {
            // If this pool has hopTokens[i] calculate its normalized liquidity
            if (
                new Set(poolsTokenOutNoTokenIn[k].tokensList)
                    .add(poolsTokenOutNoTokenIn[k].id)
                    .has(hopTokens[i])
            ) {
                let normalizedLiquidity = getNormalizedLiquidity(
                    exports.parsePoolPairData(
                        poolsTokenOutNoTokenIn[k],
                        hopTokens[i].toString(),
                        tokenOut
                    )
                );
                if (
                    normalizedLiquidity.isGreaterThanOrEqualTo(
                        // Cannot be strictly greater otherwise
                        // highestNormalizedLiquidityPoolId = 0 if hopTokens[i] balance is 0 in this pool.
                        highestNormalizedLiquidity
                    )
                ) {
                    highestNormalizedLiquidity = normalizedLiquidity;
                    highestNormalizedLiquidityPoolId = k;
                }
            }
        }
        mostLiquidPoolsSecondHop[i] =
            poolsTokenOutNoTokenIn[highestNormalizedLiquidityPoolId];
    }
    return [mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop];
}
exports.sortPoolsMostLiquid = sortPoolsMostLiquid;
function normalizePools(pools) {
    let normalizedPools = { pools: [] };
    for (let i = 0; i < pools.pools.length; i++) {
        let normalizedPool = pools.pools[i];
        normalizedPool.tokens.forEach(token => {
            token.balance = bmath_1.scale(token.balance, -token.decimals);
        });
        normalizedPools.pools.push(normalizedPool);
    }
    return normalizedPools;
}
exports.normalizePools = normalizePools;
function formatSwaps(
    swaps,
    swapType,
    swapAmount,
    tokenIn,
    tokenOut,
    returnAmount
) {
    const tokenAddressesSet = new Set();
    let tokenInDecimals;
    let tokenOutDecimals;
    let swapInfo = {
        tokenAddresses: [],
        swaps: [],
        swapAmount: bmath_1.bnum(0),
        returnAmount: bmath_1.bnum(0),
        tokenIn: '',
        tokenOut: '',
    };
    if (swaps.length === 0) {
        return swapInfo;
    }
    swaps.forEach(sequence => {
        sequence.forEach(swap => {
            tokenAddressesSet.add(swap.tokenIn);
            tokenAddressesSet.add(swap.tokenOut);
            if (swap.tokenIn === tokenIn)
                tokenInDecimals = swap.tokenInDecimals;
            if (swap.tokenOut === tokenOut)
                tokenOutDecimals = swap.tokenOutDecimals;
        });
    });
    const tokenArray = [...tokenAddressesSet];
    if (swapType === 'swapExactIn') {
        const swapsV2 = [];
        swaps.forEach(sequence => {
            sequence.forEach(swap => {
                const inIndex = tokenArray.indexOf(swap.tokenIn);
                const outIndex = tokenArray.indexOf(swap.tokenOut);
                const swapV2 = {
                    poolId: swap.pool,
                    tokenInIndex: inIndex,
                    tokenOutIndex: outIndex,
                    amountIn: bmath_1
                        .scale(
                            bmath_1.bnum(swap.swapAmount),
                            swap.tokenInDecimals
                        )
                        .toString(),
                    userData: '0x',
                };
                swapsV2.push(swapV2);
            });
        });
        swapInfo.swapAmount = bmath_1.scale(swapAmount, tokenInDecimals);
        swapInfo.returnAmount = bmath_1.scale(returnAmount, tokenOutDecimals);
        swapInfo.swaps = swapsV2;
    } else {
        const swapsV2 = [];
        swaps.forEach(sequence => {
            sequence.forEach(swap => {
                const inIndex = tokenArray.indexOf(swap.tokenIn);
                const outIndex = tokenArray.indexOf(swap.tokenOut);
                const swapV2 = {
                    poolId: swap.pool,
                    tokenInIndex: inIndex,
                    tokenOutIndex: outIndex,
                    amountOut: bmath_1
                        .scale(
                            bmath_1.bnum(swap.swapAmount),
                            swap.tokenOutDecimals
                        )
                        .toString(),
                    userData: '0x',
                };
                swapsV2.push(swapV2);
            });
        });
        swapInfo.swapAmount = bmath_1.scale(swapAmount, tokenOutDecimals);
        swapInfo.returnAmount = bmath_1.scale(returnAmount, tokenInDecimals);
        swapInfo.swaps = swapsV2;
    }
    swapInfo.tokenAddresses = tokenArray;
    swapInfo.tokenIn = tokenIn;
    swapInfo.tokenOut = tokenOut;
    return swapInfo;
}
exports.formatSwaps = formatSwaps;
