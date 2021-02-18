import {
    getLimitAmountSwapForPath,
    getOutputAmountSwap,
    getOutputAmountSwapForPath,
    getSpotPriceAfterSwap,
    getSpotPriceAfterSwapForPath,
    getDerivativeSpotPriceAfterSwap,
    getDerivativeSpotPriceAfterSwapForPath,
    parsePoolPairData,
    getHighestLimitAmountsForPaths,
    getEffectivePriceSwapForPath,
    parsePoolPairDataForPath,
    EVMgetOutputAmountSwapForPath,
    EVMgetOutputAmountSwap,
} from './helpers';
import { bmul, bdiv, bnum, BONE } from './bmath';
import { BigNumber } from './utils/bignumber';
import {
    PoolPairData,
    Path,
    Swap,
    Price,
    EffectivePrice,
    PoolDictionary,
    Pool,
} from './types';
import { MaxUint256 } from '@ethersproject/constants';

// TODO give the option to choose a % of slippage beyond current price?
export const MAX_UINT = MaxUint256;

const minAmountOut = 0;
const maxAmountIn = MAX_UINT;
const maxPrice = MAX_UINT;

export function processPaths(
    paths: Path[],
    pools: PoolDictionary,
    swapType: string,
    maxPools: Number
): [Path[], BigNumber] {
    let maxLiquidityAvailable = bnum(0);
    paths.forEach(path => {
        path.poolPairData = parsePoolPairDataForPath(pools, path, swapType);
        path.limitAmount = getLimitAmountSwapForPath(pools, path, swapType);
        // console.log(path.limitAmount.toNumber())
        maxLiquidityAvailable = maxLiquidityAvailable.plus(path.limitAmount);
    });
    let sortedPaths = paths.sort((a, b) => {
        return b.limitAmount.minus(a.limitAmount).toNumber();
    });
    return [sortedPaths, maxLiquidityAvailable];
}

export function filterPaths(
    pools: PoolDictionary,
    paths: Path[],
    swapType: string,
    maxPools: Number,
    maxLiquidityAvailable: BigNumber,
    costOutputToken: BigNumber
): Path[] {
    // TODO: move this constant to config file
    const maxFilterSwapAmounts = 10;
    const filterSwapAmountsRatio = 10;
    let filteredPaths = [];
    let filteredPathIds = [];
    let filterSwapAmount = maxLiquidityAvailable.div(
        bnum(filterSwapAmountsRatio)
    );
    for (let i = 0; i < maxFilterSwapAmounts; ++i) {
        for (let j = 0; j < paths.length; ++j) {
            paths[j].filterEffectivePrice = getOutputAmountSwapForPath(
                pools,
                paths[j],
                swapType,
                filterSwapAmount
            );
        }
        // Sort paths based on lowest effectivePrice
        let sortedPaths = [...paths].sort((a, b) => {
            return b.filterEffectivePrice
                .minus(a.filterEffectivePrice)
                .toNumber();
        });
        // Add best maxPools paths to filteredPaths if path not already present
        for (let j = 0; j < maxPools; ++j) {
            if (!filteredPathIds.includes(sortedPaths[j].id)) {
                filteredPathIds.push(sortedPaths[j].id);
                filteredPaths.push(sortedPaths[j]);
            }
        }
        filterSwapAmount = filterSwapAmount
            .div(filterSwapAmountsRatio)
            .integerValue();
    }
    return filteredPaths;
}

/* TODO: review
< INPUTS >
pools: pools information
paths: paths information
swapType: 'swapExactIn' or 'swapExactOut'. 
totalSwapAmount: the amount of tokenIn to sell if swapType == 'swapExactIn' OR
                 the amount of tokenOut to buy if swapType == 'swapExactOut' 
maxPools: the maximum number of pools accepted for the SOR final swaps suggestion
costReturnToken: how much in outputToken the gas for trading with one pool costs
                 Notice that outputToken is tokenOut if swapType == 'swapExactIn'
                 and tokenIn if swapType == 'swapExactOut'

< OUTPUTS >
swaps: information of the optimal swaps
bestTotalReturn: amount of tokenOut the swaps will return if swapType == 'swapExactIn'
                amount of tokenIn the swaps will pull if swapType == 'swapExactOut'
*/
export const smartOrderRouter = (
    pools: PoolDictionary,
    paths: Path[],
    swapType: string,
    totalSwapAmount: BigNumber,
    maxPools: number,
    costReturnToken: BigNumber
): [Swap[][], BigNumber] => {
    let bestTotalReturn: BigNumber = new BigNumber(0);
    let bestTotalReturnConsideringFees: BigNumber = new BigNumber(0);
    let totalReturn, totalReturnConsideringFees;
    let bestSwapAmounts = [],
        bestPathIds,
        bestPaths,
        swapAmounts;

    // No paths available, return empty solution
    if (paths.length == 0) {
        return [[], bnum(0)];
    }
    // Before we start the main loop, we first check if there is enough liquidity for this totalSwapAmount at all
    let highestLimitAmounts = getHighestLimitAmountsForPaths(paths, maxPools);

    //  We use the highest limits to define the initial number of pools considered and the initial guess for swapAmounts. If the
    //  highest_limit is lower than totalSwapAmount, then we should obviously not waste time trying to calculate the SOR suggestion for 1 pool,
    //  Same for 2, 3 pools etc.
    let initialNumPools = -1; // Initializing
    for (let i = 1; i < maxPools; i++) {
        let sumHighestLimitAmounts = highestLimitAmounts
            .slice(0, i)
            .reduce((a, b) => a.plus(b));
        if (totalSwapAmount.gt(sumHighestLimitAmounts)) continue; // the i initial pools are not enough to get to totalSwapAmount, continue
        //  If above is false, it means we have enough liquidity with first i pools
        initialNumPools = i;
        swapAmounts = highestLimitAmounts.slice(0, initialNumPools);
        //  Since the sum of the first i highest limits will be less than totalSwapAmount, we remove the difference to the last swapAmount
        //  so we are sure that the sum of swapAmounts will be equal to totalSwapAmount
        let difference = sumHighestLimitAmounts.minus(totalSwapAmount);
        swapAmounts[swapAmounts.length - 1] = swapAmounts[
            swapAmounts.length - 1
        ].minus(difference);
        break; // No need to keep looping as this number of pools (i) has enough liquidity
    }
    if (initialNumPools == -1) {
        return [[], bnum(0)]; // Not enough liquidity, return empty
    }

    // First get the optimal totalReturn to trade 'totalSwapAmount' with
    // one path only (b=1). Then increase the number of pools as long as
    // improvementCondition is true (see more information below)
    for (let b = initialNumPools; b <= paths.length; b++) {
        totalReturn = 0;
        if (b != initialNumPools) {
            // We already had a previous iteration and are adding another pool this new iteration
            // swapAmounts.push(bnum(1)); // Initialize new swapAmount with 1 wei to
            // // make sure that it won't be considered as a non viable amount (which would
            // // be the case if it started at 0)

            // Start new path at 1/b of totalSwapAmount. We need then to multiply all current
            // swapAmounts by 1-1/b.
            swapAmounts.forEach((swapAmount, i) => {
                swapAmounts[i] = swapAmounts[i].times(bnum(1 - 1 / b));
            });
            swapAmounts.push(totalSwapAmount.times(bnum(1 / b)));
        }

        //  iterate until we converge to the best pools for a given totalSwapAmount
        //  first initialize variables
        let historyOfSortedPathIds = [];
        let selectedPaths;
        let [
            newSelectedPaths,
            exceedingAmounts,
            selectedPathLimitAmounts,
            pathIds,
        ] = getBestPathIds(pools, paths, swapType, swapAmounts);
        // Check if ids are in history of ids, but first sort and stringify to make comparison possible
        // Copy array https://stackoverflow.com/a/42442909
        let sortedPathIdsJSON = JSON.stringify([...pathIds].sort()); // Just to check if this set of paths has already been chosen
        while (!historyOfSortedPathIds.includes(sortedPathIdsJSON)) {
            historyOfSortedPathIds.push(sortedPathIdsJSON); // We store all previous paths ids to avoid infinite loops because of local minima
            selectedPaths = newSelectedPaths;
            [swapAmounts, exceedingAmounts] = iterateSwapAmounts(
                pools,
                selectedPaths,
                swapType,
                totalSwapAmount,
                swapAmounts,
                exceedingAmounts,
                selectedPathLimitAmounts
            );
            [
                newSelectedPaths,
                exceedingAmounts,
                selectedPathLimitAmounts,
                pathIds,
            ] = getBestPathIds(pools, paths, swapType, swapAmounts);
            sortedPathIdsJSON = JSON.stringify([...pathIds].sort());
        }

        totalReturn = calcTotalReturn(
            pools,
            selectedPaths,
            swapType,
            swapAmounts
        );

        // Calculates the number of pools in all the paths to include the gas costs
        let totalNumberOfPools = 0;
        selectedPaths.forEach((path, i) => {
            totalNumberOfPools += path.swaps.length;
        });

        // improvementCondition is true if we are improving the totalReturn
        // Notice that totalReturn has to be maximized for 'swapExactIn'
        // and MINIMIZED for 'swapExactOut'
        // This is because for the case of 'swapExactOut', totalReturn means the
        // amount of tokenIn needed to buy totalSwapAmount of tokenOut
        let improvementCondition: boolean = false;
        if (swapType === 'swapExactIn') {
            totalReturnConsideringFees = totalReturn.minus(
                bmul(
                    new BigNumber(totalNumberOfPools).times(BONE),
                    costReturnToken
                )
            );
            improvementCondition =
                totalReturnConsideringFees.isGreaterThan(
                    bestTotalReturnConsideringFees
                ) || b === 1; // b === 1 means its the first iteration so bestTotalReturnConsideringFees isn't currently a value
        } else {
            totalReturnConsideringFees = totalReturn.plus(
                bmul(
                    new BigNumber(totalNumberOfPools).times(BONE),
                    costReturnToken
                )
            );
            improvementCondition =
                totalReturnConsideringFees.isLessThan(
                    bestTotalReturnConsideringFees
                ) || b === 1; // b === 1 means its the first iteration so bestTotalReturnConsideringFees isn't currently a value
        }
        if (improvementCondition === true) {
            bestSwapAmounts = swapAmounts;
            bestPathIds = pathIds;
            bestPaths = selectedPaths;
            bestTotalReturn = totalReturn;
            bestTotalReturnConsideringFees = totalReturnConsideringFees;
        } else {
            break;
        }

        // Stop if max number of pools has been reached
        if (totalNumberOfPools >= maxPools) break;
    }

    //// Prepare swap data from paths
    let swaps: Swap[][] = [];
    let totalSwapAmountWithRoundingErrors: BigNumber = new BigNumber(0);
    let dust: BigNumber = new BigNumber(0);
    let lenghtFirstPath;
    bestTotalReturn = bnum(0); // Reset totalReturn as this time it will be
    // calculated with the EVM maths so the return is exactly what the user will get
    // after executing the transaction (given there are no front-runners)
    bestPaths.forEach((path, i) => {
        swapAmounts[i] = swapAmounts[i].integerValue(); // Make sure we truncate the swapAmount
        let swapAmount = swapAmounts[i];
        totalSwapAmountWithRoundingErrors = totalSwapAmountWithRoundingErrors.plus(
            swapAmount
        );

        // // TODO: remove. To debug only!
        console.log(
            'Prices should be all very close (unless one of the paths is on the limit!'
        );
        console.log(
            getSpotPriceAfterSwapForPath(
                pools,
                path,
                swapType,
                swapAmount
            ).toNumber()
        );
        let poolPairData = path.poolPairData;

        if (i == 0)
            // Store lenght of first path to add dust to correct rounding error at the end
            lenghtFirstPath = path.swaps.length;

        let returnAmount;
        if (poolPairData.length == 1) {
            // Direct trade: add swap from only pool
            let swap: Swap = {
                pool: path.swaps[0].pool,
                tokenIn: path.swaps[0].tokenIn,
                tokenOut: path.swaps[0].tokenOut,
                swapAmount: swapAmount.toString(),
                limitReturnAmount:
                    swapType === 'swapExactIn'
                        ? minAmountOut.toString()
                        : maxAmountIn.toString(),
                maxPrice: maxPrice.toString(),
            };
            swaps.push([swap]);
            // Call EVMgetOutputAmountSwap to guarantee pool state is updated
            returnAmount = EVMgetOutputAmountSwap(
                pools,
                poolPairData[0],
                swapType,
                swapAmount
            );
        } else {
            // Multi-hop:

            let swap1 = path.swaps[0];
            let poolSwap1 = pools[swap1.pool];

            let swap2 = path.swaps[1];
            let poolSwap2 = pools[swap2.pool];

            let amountSwap1, amountSwap2;
            if (swapType === 'swapExactIn') {
                amountSwap1 = swapAmount;
                amountSwap2 = EVMgetOutputAmountSwap(
                    pools,
                    poolPairData[0],
                    swapType,
                    swapAmount
                );
                // Call EVMgetOutputAmountSwap to update the pool state
                // for the second hop as well (the first was updated above)
                returnAmount = EVMgetOutputAmountSwap(
                    pools,
                    poolPairData[1],
                    swapType,
                    amountSwap2
                );
            } else {
                amountSwap1 = EVMgetOutputAmountSwap(
                    pools,
                    poolPairData[1],
                    swapType,
                    swapAmount
                );
                amountSwap2 = swapAmount;
                // Call EVMgetOutputAmountSwap to update the pool state
                // for the second hop as well (the first was updated above)
                returnAmount = EVMgetOutputAmountSwap(
                    pools,
                    poolPairData[0],
                    swapType,
                    amountSwap1
                );
            }

            // Add swap from first pool
            let swap1hop: Swap = {
                pool: path.swaps[0].pool,
                tokenIn: path.swaps[0].tokenIn,
                tokenOut: path.swaps[0].tokenOut,
                swapAmount: amountSwap1.toString(),
                limitReturnAmount:
                    swapType === 'swapExactIn'
                        ? minAmountOut.toString()
                        : maxAmountIn.toString(),
                maxPrice: maxPrice.toString(),
            };

            // Add swap from second pool
            let swap2hop: Swap = {
                pool: path.swaps[1].pool,
                tokenIn: path.swaps[1].tokenIn,
                tokenOut: path.swaps[1].tokenOut,
                swapAmount: amountSwap2.toString(),
                limitReturnAmount:
                    swapType === 'swapExactIn'
                        ? minAmountOut.toString()
                        : maxAmountIn.toString(),
                maxPrice: maxPrice.toString(),
            };
            swaps.push([swap1hop, swap2hop]);
        }
        // Update bestTotalReturn with EVM return
        bestTotalReturn = bestTotalReturn.plus(returnAmount);
    });

    // Since the individual swapAmounts for each path are integers, the sum of all swapAmounts
    // might not be exactly equal to the totalSwapAmount the user requested. We need to correct that rounding error
    // and we do that by adding the rounding error to the first path.
    if (swaps.length > 0) {
        dust = totalSwapAmount.minus(totalSwapAmountWithRoundingErrors);
        if (swapType === 'swapExactIn') {
            swaps[0][0].swapAmount = new BigNumber(swaps[0][0].swapAmount)
                .plus(dust)
                .toString(); // Add dust to first swapExactIn
        } else {
            if (lenghtFirstPath == 1)
                // First path is a direct path (only one pool)
                swaps[0][0].swapAmount = new BigNumber(swaps[0][0].swapAmount)
                    .plus(dust)
                    .toString();
            // Add dust to first swapExactOut
            // First path is a multihop path (two pools)
            else
                swaps[0][1].swapAmount = new BigNumber(swaps[0][1].swapAmount)
                    .plus(dust)
                    .toString(); // Add dust to second swapExactOut
        }
    }
    return [swaps, bestTotalReturn];
};

// TODO: calculate EVM return (use bmath) and update pool balances like current SOR
export const calcTotalReturn = (
    pools: PoolDictionary,
    paths: Path[],
    swapType: string,
    swapAmounts: BigNumber[]
): BigNumber => {
    let totalReturn = new BigNumber(0);
    let poolsClone = JSON.parse(JSON.stringify(pools)); // we create a clone to avoid
    // changing the contents of pools (parameter passed as reference)
    paths.forEach((path, i) => {
        totalReturn = totalReturn.plus(
            getOutputAmountSwapForPath(
                poolsClone,
                path,
                swapType,
                swapAmounts[i]
            )
        );
    });
    return totalReturn;
};

//  For a given list of swapAmounts, gets list of pools with best effective price for these amounts
//  Always choose best pool for highest swapAmount first, then 2nd swapAmount and so on. This is
//  because it's best to use the best effective price for the highest amount to be traded
function getBestPathIds(
    pools: PoolDictionary,
    originalPaths: Path[],
    swapType: string,
    swapAmounts: BigNumber[]
): [Path[], BigNumber[], BigNumber[], string[]] {
    let sortedSwapAmounts;
    let bestPathIds = [];
    let selectedPaths = [];
    let selectedPathLimitAmounts = [];
    let selectedPathExceedingAmounts = [];
    // TODO find out which deep copy way is better: JSON.parse breaks bignumbers!!
    // let paths = JSON.parse(JSON.stringify(originalPaths)); // Deep copy to avoid changing the original path data
    let paths = [...originalPaths]; // Deep copy to avoid changing the original path data

    // Sort swapAmounts in descending order without changing original: https://stackoverflow.com/a/42442909
    sortedSwapAmounts = [...swapAmounts].sort((a, b) => {
        return b.minus(a).toNumber();
    });
    sortedSwapAmounts.forEach((swapAmount, i) => {
        // Find path that has best effective price
        let bestPathIndex = -1;
        let bestEffectivePrice = bnum('Infinity'); // Start with worst price possible
        paths.forEach((path, j) => {
            // Do not consider this path if its limit is equal or below swapAmount
            if (path.limitAmount.gt(swapAmount)) {
                // Calculate effective price of this path for this swapAmount
                // TODO for optimization: pass already calculated limitAmount as input
                // to getEffectivePriceSwapForPath()
                let effectivePrice = getEffectivePriceSwapForPath(
                    pools,
                    path,
                    swapType,
                    swapAmount
                );
                if (effectivePrice < bestEffectivePrice) {
                    bestEffectivePrice = effectivePrice;
                    bestPathIndex = j;
                }
            }
        });
        bestPathIds.push(paths[bestPathIndex].id);
        selectedPaths.push(paths[bestPathIndex]);
        selectedPathLimitAmounts.push(paths[bestPathIndex].limitAmount);
        selectedPathExceedingAmounts.push(
            swapAmounts[i].minus(paths[bestPathIndex].limitAmount)
        );
        paths.splice(bestPathIndex, 1); // Remove path from list
    });
    return [
        selectedPaths,
        selectedPathExceedingAmounts,
        selectedPathLimitAmounts,
        bestPathIds,
    ];
}

// This functions finds the swapAmounts such that all the paths that have viable swapAmounts (i.e.
// that are not negative or equal to limitAmount) bring their respective prices after swap to the
// same price (which means that this is the optimal solution for the paths analyzed)
function iterateSwapAmounts(
    pools: PoolDictionary,
    selectedPaths: Path[],
    swapType: string,
    totalSwapAmount: BigNumber,
    swapAmounts: BigNumber[],
    exceedingAmounts: BigNumber[],
    pathLimitAmounts: BigNumber[]
): [BigNumber[], BigNumber[]] {
    // TODO define priceErrorTolerance in config file or in main file
    let priceErrorTolerance = bnum(0.00001); // 0.001% of tolerance -> this does not change much execution time as convergence is fast
    let priceError = bnum(1); // Initialize priceError just so that while starts
    let prices = [];
    // Since this is the beginning of an iteration with a new set of paths, we
    // set any swapAmounts that were set to 0 previously to 1 wei just so that they
    // are considered as viable for iterateSwapAmountsApproximation(). If they were
    // left at 0 iterateSwapAmountsApproximation() would consider them already outside
    // the viable range and would not iterate on them. This is useful when
    // iterateSwapAmountsApproximation() is being repeatedly called within the while loop
    // below, but not when a new execution of iterateSwapAmounts() happens with new
    // paths.
    for (let i = 0; i < swapAmounts.length; ++i) {
        if (swapAmounts[i].isZero()) {
            swapAmounts[i] = bnum(0.0000000000001); // Small value different from 0
        }
    }
    while (priceError.isGreaterThan(priceErrorTolerance)) {
        [
            prices,
            swapAmounts,
            exceedingAmounts,
        ] = iterateSwapAmountsApproximation(
            pools,
            selectedPaths,
            swapType,
            totalSwapAmount,
            swapAmounts,
            exceedingAmounts,
            pathLimitAmounts
        );
        let maxPrice = BigNumber.max.apply(null, prices);
        let minPrice = BigNumber.min.apply(null, prices);
        priceError = maxPrice.minus(minPrice).div(minPrice);
    }
    return [swapAmounts, exceedingAmounts];
}

function iterateSwapAmountsApproximation(
    pools: PoolDictionary,
    selectedPaths: Path[],
    swapType: string,
    totalSwapAmount: BigNumber,
    swapAmounts: BigNumber[],
    exceedingAmounts: BigNumber[], // This is the amount by which swapAmount exceeds the pool limit_amount
    pathLimitAmounts: BigNumber[]
): [BigNumber[], BigNumber[], BigNumber[]] {
    let sumInverseDerivativeSPaSs = bnum(0);
    let sumSPaSDividedByDerivativeSPaSs = bnum(0);
    let SPaSs = [];
    let derivativeSPaSs = [];

    // We only iterate on the swapAmounts that are viable (i.e. no negative or > than path limit)
    swapAmounts.forEach((swapAmount, i) => {
        if (swapAmount.gt(bnum(0)) && exceedingAmounts[i].lt(bnum(0))) {
            let path = selectedPaths[i];
            let SPaS = getSpotPriceAfterSwapForPath(
                pools,
                path,
                swapType,
                swapAmount
            );
            SPaSs.push(SPaS);
            let derivative_SPaS = getDerivativeSpotPriceAfterSwapForPath(
                pools,
                path,
                swapType,
                swapAmount
            );
            derivativeSPaSs.push(derivative_SPaS);
            sumInverseDerivativeSPaSs = sumInverseDerivativeSPaSs.plus(
                bnum(1).div(derivative_SPaS)
            );
            sumSPaSDividedByDerivativeSPaSs = sumSPaSDividedByDerivativeSPaSs.plus(
                SPaS.div(derivative_SPaS)
            );
        } else {
            // This swapAmount is not viable but we push to keep list length consistent
            derivativeSPaSs.push(bnum('NaN'));
            SPaSs.push(bnum('NaN'));
        }
    });
    // // This division using BigNumber below lost precision. Its result was for example
    // 1.042818e-12 while using normal js math operations it was
    // 1.0428184989387553e-12. This loss of precision caused an important bug

    // let weighted_average_SPaS = sumSPaSDividedByDerivativeSPaSs.div(
    //     sumInverseDerivativeSPaSs
    // );
    let weighted_average_SPaS = bnum(
        sumSPaSDividedByDerivativeSPaSs.toNumber() /
            sumInverseDerivativeSPaSs.toNumber()
    );

    swapAmounts.forEach((swapAmount, i) => {
        if (swapAmount.gt(bnum(0)) && exceedingAmounts[i].lt(bnum(0))) {
            let deltaSwapAmount = weighted_average_SPaS
                .minus(SPaSs[i])
                .div(derivativeSPaSs[i]);
            swapAmounts[i] = swapAmounts[i].plus(deltaSwapAmount);
            exceedingAmounts[i] = exceedingAmounts[i].plus(deltaSwapAmount);
        }
    });

    // Make sure no input amount is negative or above the pool limit
    while (
        BigNumber.min.apply(null, swapAmounts).lt(bnum(0)) ||
        BigNumber.max.apply(null, exceedingAmounts).gt(bnum(0))
    )
        [swapAmounts, exceedingAmounts] = redistributeInputAmounts(
            totalSwapAmount,
            swapAmounts,
            exceedingAmounts,
            derivativeSPaSs
        );

    let pricesForViableAmounts = []; // Get prices for all non-negative AND below-limit input amounts
    let swapAmountsSumWithRoundingErrors = bnum(0);
    swapAmounts.forEach((swapAmount, i) => {
        swapAmountsSumWithRoundingErrors = swapAmountsSumWithRoundingErrors.plus(
            swapAmount
        );
        if (swapAmount.gt(bnum(0)) && exceedingAmounts[i].lt(bnum(0)))
            pricesForViableAmounts.push(
                getSpotPriceAfterSwapForPath(
                    pools,
                    selectedPaths[i],
                    swapType,
                    swapAmount
                )
            );
    });

    let roundingError = totalSwapAmount.minus(swapAmountsSumWithRoundingErrors);
    // console.log("Rounding error")
    // console.log(roundingError.div(totalSwapAmount).toNumber())
    // // let errorLimit = totalSwapAmount.times(bnum(0.001))
    // // if(roundingError>errorLimit)
    // //     throw "Rounding error in iterateSwapAmountsApproximation() too large";

    // Add rounding error to make sum be exactly equal to totalSwapAmount to avoid error compounding
    // Add to the first swapAmount that is already not zero or at the limit
    // AND only if swapAmoung would not leave the viable range (i.e. swapAmoung
    // would still be >0 and <limit) after adding the error
    // I.d. we need: (swapAmount+error)>0 AND (exceedingAmount+error)<0
    for (let i = 0; i < swapAmounts.length; ++i) {
        if (swapAmounts[i].gt(bnum(0)) && exceedingAmounts[i].lt(bnum(0))) {
            if (
                swapAmounts[i].plus(roundingError).gt(bnum(0)) &&
                exceedingAmounts[i].plus(roundingError).lt(bnum(0))
            ) {
                swapAmounts[i] = swapAmounts[i].plus(roundingError);
                break;
            }
        }
    }

    return [pricesForViableAmounts, swapAmounts, exceedingAmounts];
}

function redistributeInputAmounts(
    totalSwapAmount: BigNumber,
    swapAmounts: BigNumber[],
    exceedingAmounts: BigNumber[],
    derivativeSPaSs: BigNumber[]
): [BigNumber[], BigNumber[]] {
    let sumInverseDerivativeSPaSsForViableAmounts = bnum(0);
    let sumInverseDerivativeSPaSsForNegativeAmounts = bnum(0);
    let sumInverseDerivativeSPaSsForExceedingAmounts = bnum(0);
    let sumNegativeOrExceedingSwapAmounts = bnum(0);
    swapAmounts.forEach((swapAmount, i) => {
        // Amount is negative
        if (swapAmount.lte(bnum(0))) {
            sumNegativeOrExceedingSwapAmounts = sumNegativeOrExceedingSwapAmounts.plus(
                swapAmount
            );
            sumInverseDerivativeSPaSsForNegativeAmounts = sumInverseDerivativeSPaSsForNegativeAmounts.plus(
                bnum(1).div(derivativeSPaSs[i])
            );
        }
        // Amount is above limit (exceeding > 0)
        else if (exceedingAmounts[i].gte(bnum(0))) {
            sumNegativeOrExceedingSwapAmounts = sumNegativeOrExceedingSwapAmounts.plus(
                exceedingAmounts[i]
            );
            sumInverseDerivativeSPaSsForExceedingAmounts = sumInverseDerivativeSPaSsForExceedingAmounts.plus(
                bnum(1).div(derivativeSPaSs[i])
            );
        }
        // Sum the inverse of the derivative if the swapAmount is viable,
        // i.e. if swapAmount > 0 or swapAmount < limit
        else
            sumInverseDerivativeSPaSsForViableAmounts = sumInverseDerivativeSPaSsForViableAmounts.plus(
                bnum(1).div(derivativeSPaSs[i])
            );
    });

    // Now redestribute sumNegativeOrExceedingSwapAmounts
    // to non-exceeding pools if sumNegativeOrExceedingSwapAmounts > 0
    // or to non zero swapAmount pools if sumNegativeOrExceedingSwapAmounts < 0
    swapAmounts.forEach((swapAmount, i) => {
        if (swapAmount.lte(bnum(0))) {
            swapAmounts[i] = bnum(0);
        } else if (exceedingAmounts[i].gte(bnum(0))) {
            swapAmounts[i] = swapAmounts[i].minus(exceedingAmounts[i]); // This is the same as swapAmounts[i] = pathLimitAmounts[i]
            exceedingAmounts[i] = bnum(0);
        } else {
            let deltaSwapAmount = sumNegativeOrExceedingSwapAmounts
                .times(bnum(1).div(derivativeSPaSs[i]))
                .div(sumInverseDerivativeSPaSsForViableAmounts);
            swapAmounts[i] = swapAmounts[i].plus(deltaSwapAmount);
            exceedingAmounts[i] = exceedingAmounts[i].plus(deltaSwapAmount);
        }
    });

    // If there were no viable amounts (i.e all amounts were either negative or above limit)
    // We run this extra loop to redistribute the excess
    if (sumInverseDerivativeSPaSsForViableAmounts.isZero()) {
        if (sumNegativeOrExceedingSwapAmounts.lt(bnum(0))) {
            // This means we need to redistribute to the exceeding amounts that
            // were now set to the limit
            swapAmounts.forEach((swapAmount, i) => {
                if (exceedingAmounts[i].isZero()) {
                    let deltaSwapAmount = sumNegativeOrExceedingSwapAmounts
                        .times(bnum(1).div(derivativeSPaSs[i]))
                        .div(sumInverseDerivativeSPaSsForExceedingAmounts);
                    swapAmounts[i] = swapAmounts[i].plus(deltaSwapAmount);
                    exceedingAmounts[i] = exceedingAmounts[i].plus(
                        deltaSwapAmount
                    );
                }
            });
        } else {
            // This means we need to redistribute to the negative amounts that
            // were now set to zero
            swapAmounts.forEach((swapAmount, i) => {
                if (swapAmounts[i].isZero()) {
                    let deltaSwapAmount = sumNegativeOrExceedingSwapAmounts
                        .times(bnum(1).div(derivativeSPaSs[i]))
                        .div(sumInverseDerivativeSPaSsForNegativeAmounts);
                    swapAmounts[i] = swapAmounts[i].plus(deltaSwapAmount);
                    exceedingAmounts[i] = exceedingAmounts[i].plus(
                        deltaSwapAmount
                    );
                }
            });
        }
    }
    return [swapAmounts, exceedingAmounts];
}
