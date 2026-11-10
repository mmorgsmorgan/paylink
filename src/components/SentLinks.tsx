import { useState, useSyncExternalStore } from 'react'
import { useAccount, useReadContracts, useWriteContract } from 'wagmi'
import { Check, Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { paylinkAbi } from '@/contracts/paylinkAbi'
import { CHAIN_ID, PAYLINK_ADDRESS, publicClient } from '@/lib/chain'
import { getSentLinks, removeSentLink, subscribeStore, type SentLink } from '@/lib/store'
import { secretToFragment } from '@/lib/linkKey'
import { money, parseOnchainError } from '@/lib/format'
import { useShareRoot } from '@/hooks/useShareRoot'

// Status enum order in the contract: None, Active, Claimed, Cancelled.
const STATUS = ['Not funded', 'Waiting to be claimed', 'Claimed', 'Cancelled'] as const

let cachedSnapshot = ''
let cachedLinks: SentLink[] = []
function snapshotLinks(): SentLink[] {
  const raw = JSON.stringify(getSentLinks())
  if (raw !== cachedSnapshot) {
    cachedSnapshot = raw
    cachedLinks = getSentLinks()
  }
  return cachedLinks
}

export function SentLinks() {
  const { address } = useAccount()
  const shareRoot = useShareRoot()
  const stored = useSyncExternalStore(subscribeStore, snapshotLinks)
  const links = stored.filter((l) => !address || l.sender.toLowerCase() === address.toLowerCase())
  const { writeContractAsync } = useWriteContract()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const reads = useReadContracts({
    contracts: links.map((l) => ({
      address: PAYLINK_ADDRESS,
      abi: paylinkAbi,
      functionName: 'getLink' as const,
      args: [l.address] as const,
      chainId: CHAIN_ID,
    })),
    query: { enabled: links.length > 0, refetchInterval: 8000 },
  })

  if (links.length === 0) return null

  const cancel = async (l: SentLink) => {
    setBusyKey(l.address)
    try {
      const hash = await writeContractAsync({
        address: PAYLINK_ADDRESS,
        abi: paylinkAbi,
        functionName: 'cancel',
        args: [l.address],
        chainId: CHAIN_ID,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      toast.success('Link cancelled and USDC refunded.')
      void reads.refetch()
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Cancelled.') toast.error(msg)
    } finally {
      setBusyKey(null)
    }
  }

  const copy = async (l: SentLink) => {
    if (!shareRoot) return
    try {
      await navigator.clipboard.writeText(`${shareRoot}#${secretToFragment(l.privateKey)}`)
      setCopiedKey(l.address)
      setTimeout(() => setCopiedKey(null), 1600)
    } catch {
      toast.error('Could not copy the link.')
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>
        Your links
      </h2>
      <ul className="space-y-2">
        {links.map((l, i) => {
          const result = reads.data?.[i]?.result
          const status = result ? Number(result[3]) : null
          const amount = result ? result[1] : undefined
          return (
            <li key={l.address} className="glass-card flex items-center gap-3 rounded-2xl p-3">
              <div className="min-w-0 flex-1">
                <p className="display text-lg font-bold tabular-nums">
                  {status === null || status === 0 ? '--' : money(amount)} <span className="text-xs font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
                </p>
                <p className="text-xs" style={{ color: status === 2 ? 'var(--success)' : 'var(--muted)' }}>
                  {status === null ? 'Checking...' : STATUS[status]}
                </p>
              </div>
              {status === 1 && (
                <>
                  <button onClick={() => void copy(l)} aria-label="Copy link" className="glass-inner flex size-11 items-center justify-center rounded-xl">
                    {copiedKey === l.address ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                  <button
                    onClick={() => void cancel(l)}
                    disabled={busyKey === l.address}
                    className="glass-inner flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-semibold disabled:opacity-40"
                    style={{ color: 'var(--danger)' }}
                  >
                    {busyKey === l.address && <Loader2 className="size-3 animate-spin" />} Cancel
                  </button>
                </>
              )}
              {(status === 0 || status === 3 || status === 2) && (
                <button onClick={() => removeSentLink(l.address)} className="min-h-11 px-2 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Hide
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
