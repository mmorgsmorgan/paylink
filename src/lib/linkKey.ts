import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { paylinkAbi } from '@/contracts/paylinkAbi'
import { PAYLINK_ADDRESS, publicClient } from './chain'

const SECRET = /^(?:0x)?[0-9a-fA-F]{64}$/

export function newLinkKey(): { privateKey: Hex; address: Address } {
  const privateKey = generatePrivateKey()
  return { privateKey, address: privateKeyToAccount(privateKey).address }
}

/** The link secret lives only in the URL fragment, so it never reaches a server. */
export function readSecretFromHash(hash: string): Hex | null {
  const raw = hash.replace(/^#/, '')
  if (!SECRET.test(raw)) return null
  return (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex
}

export function secretToFragment(privateKey: Hex): string {
  return privateKey.slice(2)
}

export async function signCreate(
  privateKey: Hex,
  sender: Address,
  amount: bigint,
  relayFee: bigint,
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey)
  const digest = await publicClient.readContract({
    address: PAYLINK_ADDRESS,
    abi: paylinkAbi,
    functionName: 'createDigest',
    args: [account.address, sender, amount, relayFee],
  })
  return account.signMessage({ message: { raw: digest } })
}

export async function signClaim(privateKey: Hex, to: Address, relayer: Address): Promise<Hex> {
  const account = privateKeyToAccount(privateKey)
  const digest = await publicClient.readContract({
    address: PAYLINK_ADDRESS,
    abi: paylinkAbi,
    functionName: 'claimDigest',
    args: [account.address, to, relayer],
  })
  return account.signMessage({ message: { raw: digest } })
}
