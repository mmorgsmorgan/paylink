import type { Address, Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

/** Links a sender created on this device. The secret is kept so the link can be re-copied. */
export interface SentLink {
  privateKey: Hex
  address: Address
  sender: Address
}

const SENT_KEY = 'paylink.sent.v1'
const WALLET_KEY = 'paylink.wallet.v1'
const CHANGE_EVENT = 'paylink:store'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeStore(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

export function getSentLinks(): SentLink[] {
  return read<SentLink[]>(SENT_KEY, [])
}

export function saveSentLink(link: SentLink) {
  const rest = getSentLinks().filter((l) => l.address !== link.address)
  write(SENT_KEY, [link, ...rest])
}

export function removeSentLink(address: Address) {
  write(
    SENT_KEY,
    getSentLinks().filter((l) => l.address !== address),
  )
}

/** The wallet created for a recipient who had none. It lives only in this browser. */
export function getBrowserWalletKey(): Hex | null {
  return read<Hex | null>(WALLET_KEY, null)
}

export function getOrCreateBrowserWallet(): { privateKey: Hex; address: Address } {
  const existing = getBrowserWalletKey()
  const privateKey = existing ?? generatePrivateKey()
  if (!existing) write(WALLET_KEY, privateKey)
  return { privateKey, address: privateKeyToAccount(privateKey).address }
}
