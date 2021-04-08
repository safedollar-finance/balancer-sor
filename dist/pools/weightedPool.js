'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const types_1 = require('../types');
const address_1 = require('@ethersproject/address');
const bmath_1 = require('../bmath');
class WeightedPool {
    constructor(id, swapFee, totalWeight, totalShares, tokens) {
        this.poolType = types_1.PoolTypes.Weighted;
        this.id = id;
        this.swapFee = swapFee;
        this.totalShares = totalShares;
        this.tokens = tokens;
        this.totalWeight = totalWeight;
    }
    setTypeForSwap(type) {
        this.typeForSwap = type;
    }
    parsePoolPairData(tokenIn, tokenOut) {
        let pairType;
        let tI;
        let tO;
        let balanceIn;
        let balanceOut;
        let decimalsOut;
        let decimalsIn;
        let weightIn;
        let weightOut;
        // Check if tokenIn is the pool token itself (BPT)
        if (tokenIn == this.id) {
            pairType = types_1.PairTypes.BptToToken;
            balanceIn = this.totalShares;
            decimalsIn = '18'; // Not used but has to be defined
            weightIn = bmath_1.bnum(1); // Not used but has to be defined
        } else if (tokenOut == this.id) {
            pairType = types_1.PairTypes.TokenToBpt;
            balanceOut = this.totalShares;
            decimalsOut = '18'; // Not used but has to be defined
            weightOut = bmath_1.bnum(1); // Not used but has to be defined
        } else {
            pairType = types_1.PairTypes.TokenToToken;
        }
        if (pairType != types_1.PairTypes.BptToToken) {
            let tokenIndexIn = this.tokens.findIndex(
                t =>
                    address_1.getAddress(t.address) ===
                    address_1.getAddress(tokenIn)
            );
            if (tokenIndexIn < 0) throw 'Pool does not contain tokenIn';
            tI = this.tokens[tokenIndexIn];
            balanceIn = tI.balance;
            decimalsIn = tI.decimals;
            weightIn = bmath_1
                .bnum(tI.denormWeight)
                .div(bmath_1.bnum(this.totalWeight));
        }
        if (pairType != types_1.PairTypes.TokenToBpt) {
            let tokenIndexOut = this.tokens.findIndex(
                t =>
                    address_1.getAddress(t.address) ===
                    address_1.getAddress(tokenOut)
            );
            if (tokenIndexOut < 0) throw 'Pool does not contain tokenOut';
            tO = this.tokens[tokenIndexOut];
            balanceOut = tO.balance;
            decimalsOut = tO.decimals;
            weightOut = bmath_1
                .bnum(tO.denormWeight)
                .div(bmath_1.bnum(this.totalWeight));
        }
        const poolPairData = {
            id: this.id,
            poolType: this.poolType,
            pairType: pairType,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            decimalsIn: Number(decimalsIn),
            decimalsOut: Number(decimalsOut),
            balanceIn: bmath_1.bnum(balanceIn),
            balanceOut: bmath_1.bnum(balanceOut),
            weightIn: weightIn,
            weightOut: weightOut,
            swapFee: bmath_1.bnum(this.swapFee),
        };
        this.poolPairData = poolPairData;
    }
}
exports.WeightedPool = WeightedPool;
