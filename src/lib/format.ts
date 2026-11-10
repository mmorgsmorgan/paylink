import { formatUsdc } from '@/onchain-money'

export const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

/** Whole-cent display for balances and amounts: "12.50", never "12.5". */
export function money(raw: bigint | undefined): string {
  if (raw === undefined) return '0.00'
  const [whole, frac = ''] = formatUsdc(raw).split('.')
  return `${whole}.${frac.padEnd(2, '0')}`
}

export function parseOnchainError(error: unknown): string {
  const e = error as { message?: string; code?: number; shortMessage?: string } | undefined
  const message = (e?.shortMessage ?? e?.message ?? '').toLowerCase()
  if (message.includes('user rejected') || e?.code === 4001) return 'Cancelled.'
  if (message.includes('insufficient funds') || message.includes('exceeds balance'))
    return 'Not enough USDC to cover this.'
  if (message.includes('linknotactive')) return 'This link has already been used or cancelled.'
  if (message.includes('invalidsignature')) return 'This link is not valid.'
  if (message.includes('network') || message.includes('timeout'))
    return 'Network issue. Check your connection and try again.'
  if (message.includes('reverted')) return 'The transaction failed. Please try again.'
  return (e?.shortMessage ?? e?.message ?? 'Something went wrong.').slice(0, 160)
}
