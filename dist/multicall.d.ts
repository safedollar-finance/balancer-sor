import { BaseProvider } from '@ethersproject/providers';
import { SubGraphPoolsBase } from './types';
export declare const abis: (
    | {
          inputs: {
              internalType: string;
              name: string;
              type: string;
          }[];
          stateMutability: string;
          type: string;
          anonymous?: undefined;
          name?: undefined;
          outputs?: undefined;
      }
    | {
          anonymous: boolean;
          inputs: {
              indexed: boolean;
              internalType: string;
              name: string;
              type: string;
          }[];
          name: string;
          type: string;
          stateMutability?: undefined;
          outputs?: undefined;
      }
    | {
          inputs: (
              | {
                    components: {
                        internalType: string;
                        name: string;
                        type: string;
                    }[];
                    internalType: string;
                    name: string;
                    type: string;
                }
              | {
                    internalType: string;
                    name: string;
                    type: string;
                    components?: undefined;
                }
          )[];
          name: string;
          outputs: {
              internalType: string;
              name: string;
              type: string;
          }[];
          stateMutability: string;
          type: string;
          anonymous?: undefined;
      }
    | {
          stateMutability: string;
          type: string;
          inputs?: undefined;
          anonymous?: undefined;
          name?: undefined;
          outputs?: undefined;
      }
)[];
export declare function getOnChainBalances(
    subgraphPools: SubGraphPoolsBase,
    multiAddress: string,
    vaultAddress: string,
    provider: BaseProvider
): Promise<SubGraphPoolsBase>;
