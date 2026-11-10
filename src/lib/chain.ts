import { createPublicClient, http, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc, requireChain } from '@/onchain-facts'
import { parseUsdc } from '@/onchain-money'

export const CHAIN_ID = arcTestnet.id
export const CHAIN = requireChain(CHAIN_ID)

const usdc = getUsdc(CHAIN_ID)
if (!usdc) throw new Error('USDC is not registered for Arc Testnet')
export const USDC_ADDRESS = usdc.address as Address

export const PAYLINK_ADDRESS = import.meta.env.VITE_PAYLINK_ADDRESS as Address

/** Gas fee the sender pre-pays so the recipient can claim with a zero balance. */
export const RELAY_FEE = parseUsdc('0.05')

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(CHAIN.rpcUrls[0]),
})
