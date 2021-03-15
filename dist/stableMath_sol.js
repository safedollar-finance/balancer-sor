'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const bmath_1 = require('./bmath');
// All functions are adapted from the solidity ones to be found on:
// https://github.com/balancer-labs/balancer-core-v2/blob/master/contracts/pools/stable/StableMath.sol
// TODO: implement all up and down rounding variations
/**********************************************************************************************
    // invariant                                                                                 //
    // D = invariant to compute                                                                  //
    // A = amplifier                n * D^2 + A * n^n * S * (n^n * P / D^(n−1))                  //
    // S = sum of balances         ____________________________________________                  //
    // P = product of balances    (n+1) * D + ( A * n^n − 1)* (n^n * P / D^(n−1))                //
    // n = number of tokens                                                                      //
    **********************************************************************************************/
function _invariant(
    amp, // amp
    balances // balances
) {
    let sum = bmath_1.bnum(0);
    let totalCoins = balances.length;
    for (let i = 0; i < totalCoins; i++) {
        sum = sum.plus(balances[i]);
    }
    if (sum.isZero()) {
        return bmath_1.bnum(0);
    }
    let prevInv = bmath_1.bnum(0);
    let inv = sum;
    let ampTimesNpowN = amp.times(Math.pow(totalCoins, totalCoins)); // A*n^n
    for (let i = 0; i < 255; i++) {
        let P_D = bmath_1.bnum(totalCoins).times(balances[0]);
        for (let j = 1; j < totalCoins; j++) {
            //P_D is rounded up
            P_D = P_D.times(balances[j])
                .times(totalCoins)
                .div(inv);
        }
        prevInv = inv;
        //inv is rounded up
        inv = bmath_1
            .bnum(totalCoins)
            .times(inv)
            .times(inv)
            .plus(ampTimesNpowN.times(sum).times(P_D))
            .div(
                bmath_1
                    .bnum(totalCoins + 1)
                    .times(inv)
                    .plus(ampTimesNpowN.minus(1).times(P_D))
            );
        // Equality with the precision of 1
        if (inv.gt(prevInv)) {
            if (inv.minus(prevInv).lt(bmath_1.bnum(Math.pow(10, -18)))) {
                break;
            }
        } else if (prevInv.minus(inv).lt(bmath_1.bnum(Math.pow(10, -18)))) {
            break;
        }
    }
    //Result is rounded up
    return inv;
}
exports._invariant = _invariant;
// This function has to be zero if the invariant D was calculated correctly
function _invariantValueFunction(
    amp, // amp
    balances, // balances
    D
) {
    let invariantValueFunction;
    let prod = bmath_1.bnum(1);
    let sum = bmath_1.bnum(0);
    for (let i = 0; i < balances.length; i++) {
        prod = prod.times(balances[i]);
        sum = sum.plus(balances[i]);
    }
    let n = bmath_1.bnum(balances.length);
    // NOT! working based on Daniel's equation: https://www.notion.so/Analytical-for-2-tokens-1cd46debef6648dd81f2d75bae941fea
    // invariantValueFunction = amp.times(sum)
    //     .plus((bnum(1).div(n.pow(n)).minus(amp)).times(D))
    //     .minus((bnum(1).div(n.pow(n.times(2)).times(prod))).times(D.pow(n.plus(bnum(1)))));
    invariantValueFunction = D.pow(n.plus(bmath_1.bnum(1)))
        .div(n.pow(n).times(prod))
        .plus(D.times(amp.times(n.pow(n)).minus(bmath_1.bnum(1))))
        .minus(amp.times(n.pow(n)).times(sum));
    return invariantValueFunction;
}
exports._invariantValueFunction = _invariantValueFunction;
/**********************************************************************************************
    // inGivenOut token x for y - polynomial equation to solve                                   //
    // ax = amount in to calculate                                                               //
    // bx = balance token in                                                                     //
    // x = bx + ax                                                                               //
    // D = invariant                               D                     D^(n+1)                 //
    // A = amplifier               x^2 + ( S - ----------  - 1) * x -  ------------- = 0         //
    // n = number of tokens                    (A * n^n)               A * n^2n * P              //
    // S = sum of final balances but x                                                           //
    // P = product of final balances but x                                                       //
    **********************************************************************************************/
function _inGivenOut(
    amp,
    balances,
    tokenIndexIn,
    tokenIndexOut,
    tokenAmountOut
) {
    //Invariant is rounded up
    let inv = _invariant(amp, balances);
    let p = inv;
    let sum = bmath_1.bnum(0);
    let totalCoins = bmath_1.bnum(balances.length);
    let n_pow_n = bmath_1.bnum(1);
    let x = bmath_1.bnum(0);
    for (let i = 0; i < balances.length; i++) {
        n_pow_n = n_pow_n.times(totalCoins);
        if (i == tokenIndexOut) {
            x = balances[i].minus(tokenAmountOut);
        } else if (i != tokenIndexIn) {
            x = balances[i];
        } else {
            continue;
        }
        sum = sum.plus(x);
        //Round up p
        p = p.times(inv).div(x);
    }
    //Calculate in balance
    let y = _solveAnalyticalBalance(sum, inv, amp, n_pow_n, p);
    //Result is rounded up
    return y.minus(balances[tokenIndexIn]);
}
exports._inGivenOut = _inGivenOut;
/**********************************************************************************************
    // outGivenIn token x for y - polynomial equation to solve                                   //
    // ay = amount out to calculate                                                              //
    // by = balance token out                                                                    //
    // y = by - ay                                                                               //
    // D = invariant                               D                     D^(n+1)                 //
    // A = amplifier               y^2 + ( S - ----------  - 1) * y -  ------------- = 0         //
    // n = number of tokens                    (A * n^n)               A * n^2n * P              //
    // S = sum of final balances but y                                                           //
    // P = product of final balances but y                                                       //
    **********************************************************************************************/
function _outGivenIn(
    amp,
    balances,
    tokenIndexIn,
    tokenIndexOut,
    tokenAmountIn
) {
    //Invariant is rounded up
    let inv = _invariant(amp, balances);
    let p = inv;
    let sum = bmath_1.bnum(0);
    let totalCoins = bmath_1.bnum(balances.length);
    let n_pow_n = bmath_1.bnum(1);
    let x = bmath_1.bnum(0);
    for (let i = 0; i < balances.length; i++) {
        n_pow_n = n_pow_n.times(totalCoins);
        if (i == tokenIndexIn) {
            x = balances[i].plus(tokenAmountIn);
        } else if (i != tokenIndexOut) {
            x = balances[i];
        } else {
            continue;
        }
        sum = sum.plus(x);
        //Round up p
        p = p.times(inv).div(x);
    }
    //Calculate out balance
    let y = _solveAnalyticalBalance(sum, inv, amp, n_pow_n, p);
    //Result is rounded down
    // return balances[tokenIndexOut] > y ? balances[tokenIndexOut].minus(y) : 0;
    return balances[tokenIndexOut].minus(y);
}
exports._outGivenIn = _outGivenIn;
//This function calcuates the analytical solution to find the balance required
function _solveAnalyticalBalance(sum, inv, amp, n_pow_n, p) {
    //Round up p
    p = p.times(inv).div(amp.times(n_pow_n).times(n_pow_n));
    //Round down b
    let b = sum.plus(inv.div(amp.times(n_pow_n)));
    //Round up c
    // let c = inv >= b
    //     ? inv.minus(b).plus(Math.sqrtUp(inv.minus(b).times(inv.minus(b)).plus(p.times(4))))
    //     : Math.sqrtUp(b.minus(inv).times(b.minus(inv)).plus(p.times(4))).minus(b.minus(inv));
    let c;
    if (inv.gte(b)) {
        c = inv.minus(b).plus(
            inv
                .minus(b)
                .times(inv.minus(b))
                .plus(p.times(4))
                .sqrt()
        );
    } else {
        c = b
            .minus(inv)
            .times(b.minus(inv))
            .plus(p.times(4))
            .sqrt()
            .minus(b.minus(inv));
    }
    //Round up y
    return c.div(2);
}
exports._solveAnalyticalBalance = _solveAnalyticalBalance;
//////////////////////
////  These functions have been added exclusively for the SORv2
////
//////////////////////
function _spotPriceAfterSwapInGivenOut(
    amp,
    balances,
    tokenIndexIn,
    tokenIndexOut,
    tokenAmountOut
) {
    let delta = tokenAmountOut.times(0.0001);
    let prevDerivative = bmath_1.bnum(0);
    let derivative = bmath_1.bnum(0);
    let amountIn = _inGivenOut(
        amp,
        balances,
        tokenIndexIn,
        tokenIndexOut,
        tokenAmountOut
    );
    for (let i = 0; i < 255; i++) {
        let amountInDelta = _inGivenOut(
            amp,
            balances,
            tokenIndexIn,
            tokenIndexOut,
            tokenAmountOut.plus(delta)
        );
        derivative = amountInDelta.minus(amountIn).div(delta);
        // Break if precision reached
        if (derivative.gt(prevDerivative)) {
            if (
                derivative
                    .minus(prevDerivative)
                    .div(derivative)
                    .lt(bmath_1.bnum(Math.pow(10, -10)))
            ) {
                break;
            }
        } else if (
            prevDerivative
                .minus(derivative)
                .div(derivative)
                .lt(bmath_1.bnum(Math.pow(10, -10)))
        ) {
            break;
        }
        prevDerivative = derivative;
        delta = delta.div(bmath_1.bnum(2));
    }
    return derivative;
}
exports._spotPriceAfterSwapInGivenOut = _spotPriceAfterSwapInGivenOut;
function _spotPriceAfterSwapOutGivenIn(
    amp,
    balances,
    tokenIndexIn,
    tokenIndexOut,
    tokenAmountIn
) {
    let delta = tokenAmountIn.times(0.0001);
    let prevDerivative = bmath_1.bnum(0);
    let derivative = bmath_1.bnum(0);
    let amountIn = _outGivenIn(
        amp,
        balances,
        tokenIndexIn,
        tokenIndexOut,
        tokenAmountIn
    );
    for (let i = 0; i < 255; i++) {
        let amountInDelta = _outGivenIn(
            amp,
            balances,
            tokenIndexIn,
            tokenIndexOut,
            tokenAmountIn.plus(delta)
        );
        derivative = amountInDelta.minus(amountIn).div(delta);
        // Break if precision reached
        if (derivative.gt(prevDerivative)) {
            if (
                derivative
                    .minus(prevDerivative)
                    .div(derivative)
                    .lt(bmath_1.bnum(Math.pow(10, -10)))
            ) {
                break;
            }
        } else if (
            prevDerivative
                .minus(derivative)
                .div(derivative)
                .lt(bmath_1.bnum(Math.pow(10, -10)))
        ) {
            break;
        }
        prevDerivative = derivative;
        delta = delta.div(bmath_1.bnum(2));
    }
    return bmath_1.bnum(1).div(derivative);
}
exports._spotPriceAfterSwapOutGivenIn = _spotPriceAfterSwapOutGivenIn;
function _derivativeSpotPriceAfterSwapInGivenOut(
    amp,
    balances,
    tokenIndexIn,
    tokenIndexOut,
    tokenAmountOut
) {
    let delta = tokenAmountOut.times(0.0001);
    let prevDerivative = bmath_1.bnum(0);
    let derivative = bmath_1.bnum(0);
    let SPaS = _spotPriceAfterSwapInGivenOut(
        amp,
        balances,
        tokenIndexIn,
        tokenIndexOut,
        tokenAmountOut
    );
    for (let i = 0; i < 255; i++) {
        let SPaSDelta = _spotPriceAfterSwapInGivenOut(
            amp,
            balances,
            tokenIndexIn,
            tokenIndexOut,
            tokenAmountOut.plus(delta)
        );
        derivative = SPaSDelta.minus(SPaS).div(delta);
        // Break if precision reached
        if (derivative.gt(prevDerivative)) {
            if (
                derivative
                    .minus(prevDerivative)
                    .div(derivative)
                    .lt(bmath_1.bnum(Math.pow(10, -10)))
            ) {
                break;
            }
        } else if (
            prevDerivative
                .minus(derivative)
                .div(derivative)
                .lt(bmath_1.bnum(Math.pow(10, -10)))
        ) {
            break;
        }
        prevDerivative = derivative;
        delta = delta.div(bmath_1.bnum(2));
    }
    return derivative;
}
exports._derivativeSpotPriceAfterSwapInGivenOut = _derivativeSpotPriceAfterSwapInGivenOut;
function _derivativeSpotPriceAfterSwapOutGivenIn(
    amp,
    balances,
    tokenIndexIn,
    tokenIndexOut,
    tokenAmountIn
) {
    let delta = tokenAmountIn.times(0.0001);
    let prevDerivative = bmath_1.bnum(0);
    let derivative = bmath_1.bnum(0);
    let SPaS = _spotPriceAfterSwapOutGivenIn(
        amp,
        balances,
        tokenIndexIn,
        tokenIndexOut,
        tokenAmountIn
    );
    for (let i = 0; i < 255; i++) {
        let SPaSDelta = _spotPriceAfterSwapOutGivenIn(
            amp,
            balances,
            tokenIndexIn,
            tokenIndexOut,
            tokenAmountIn.plus(delta)
        );
        derivative = SPaSDelta.minus(SPaS).div(delta);
        // Break if precision reached
        if (derivative.gt(prevDerivative)) {
            if (
                derivative
                    .minus(prevDerivative)
                    .div(derivative)
                    .lt(bmath_1.bnum(Math.pow(10, -10)))
            ) {
                break;
            }
        } else if (
            prevDerivative
                .minus(derivative)
                .div(derivative)
                .lt(bmath_1.bnum(Math.pow(10, -10)))
        ) {
            break;
        }
        prevDerivative = derivative;
        delta = delta.div(bmath_1.bnum(2));
    }
    return derivative;
}
exports._derivativeSpotPriceAfterSwapOutGivenIn = _derivativeSpotPriceAfterSwapOutGivenIn;
