import type { Address, Hex } from 'viem'

export interface RelayerInfo {
  address: Address
  ready: boolean
}

/** The gas relayer is optional: when it is down, a recipient with a funded wallet claims directly. */
export async function fetchRelayer(): Promise<RelayerInfo | null> {
  try {
    const res = await fetch('/api/relayer')
    if (!res.ok) return null
    return (await res.json()) as RelayerInfo
  } catch {
    return null
  }
}

export async function submitRelayedClaim(body: {
  key: Address
  to: Address
  signature: Hex
}): Promise<Hex> {
  const res = await fetch('/api/relay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { hash?: Hex; error?: string }
  if (!res.ok || !data.hash) throw new Error(data.error ?? 'The claim could not be relayed.')
  return data.hash
}
