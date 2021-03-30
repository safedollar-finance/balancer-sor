import { bnum } from './bmath';
export const allowAddRemoveLiquidity = false;
// priceErrorTolerance is how close we expect prices after swap to be in SOR
// suggested paths
export const priceErrorTolerance = bnum(0.00001);
// infinitesimal is an amount that's used to initialize swap amounts so they are
// not zero or the path's limit.
// It's also used in the calculation of derivatives in pool maths
export const infinitesimal = bnum(10 ** -6);
