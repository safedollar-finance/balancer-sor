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
Object.defineProperty(exports, '__esModule', { value: true });
const types_1 = require('../types');
const address_1 = require('@ethersproject/address');
const bmath_1 = require('../bmath');
const stableMath = __importStar(require('../poolMath/stableMath'));
class StablePool {
    constructor(id, amp, swapFee, totalShares, tokens) {
        this.poolType = types_1.PoolTypes.Stable;
        this.id = id;
        this.amp = amp;
        this.swapFee = swapFee;
        this.totalShares = totalShares;
        this.tokens = tokens;
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
        let tokenIndexIn;
        let tokenIndexOut;
        // Check if tokenIn is the pool token itself (BPT)
        if (tokenIn == this.id) {
            pairType = types_1.PairTypes.BptToToken;
            balanceIn = this.totalShares;
            decimalsIn = '18'; // Not used but has to be defined
        } else if (tokenOut == this.id) {
            pairType = types_1.PairTypes.TokenToBpt;
            balanceOut = this.totalShares;
            decimalsOut = '18'; // Not used but has to be defined
        } else {
            pairType = types_1.PairTypes.TokenToToken;
        }
        if (pairType != types_1.PairTypes.BptToToken) {
            tokenIndexIn = this.tokens.findIndex(
                t =>
                    address_1.getAddress(t.address) ===
                    address_1.getAddress(tokenIn)
            );
            if (tokenIndexIn < 0) throw 'Pool does not contain tokenIn';
            tI = this.tokens[tokenIndexIn];
            balanceIn = tI.balance;
            decimalsIn = tI.decimals;
        }
        if (pairType != types_1.PairTypes.TokenToBpt) {
            tokenIndexOut = this.tokens.findIndex(
                t =>
                    address_1.getAddress(t.address) ===
                    address_1.getAddress(tokenOut)
            );
            if (tokenIndexOut < 0) throw 'Pool does not contain tokenOut';
            tO = this.tokens[tokenIndexOut];
            balanceOut = tO.balance;
            decimalsOut = tO.decimals;
        }
        // Get all token balances
        let allBalances = [];
        for (let i = 0; i < this.tokens.length; i++) {
            allBalances.push(bmath_1.bnum(this.tokens[i].balance));
        }
        let inv = stableMath._invariant(bmath_1.bnum(this.amp), allBalances);
        const poolPairData = {
            id: this.id,
            poolType: this.poolType,
            pairType: pairType,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            balanceIn: bmath_1.bnum(balanceIn),
            balanceOut: bmath_1.bnum(balanceOut),
            invariant: inv,
            swapFee: bmath_1.bnum(this.swapFee),
            allBalances: allBalances,
            amp: bmath_1.bnum(this.amp),
            tokenIndexIn: tokenIndexIn,
            tokenIndexOut: tokenIndexOut,
            decimalsIn: Number(decimalsIn),
            decimalsOut: Number(decimalsOut),
        };
        this.poolPairData = poolPairData;
    }
}
exports.StablePool = StablePool;
