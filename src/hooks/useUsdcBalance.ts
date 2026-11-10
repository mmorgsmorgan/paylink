import type { Address } from 'viem'
import { erc20Abi } from 'viem'
import { useReadContract } from 'wagmi'
import { CHAIN_ID, USDC_ADDRESS } from '@/lib/chain'

/** The single USDC balance (ERC-20 view). On Arc this is the same pool that pays gas. */
export function useUsdcBalance(address: Address | undefined) {
  return useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 8000 },
  })
}
