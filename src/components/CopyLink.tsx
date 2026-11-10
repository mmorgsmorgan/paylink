import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  link: string | null
  amountLabel: string
}

/** Copy-only: the link points at the app's own share URL, so it is never an <a> inside the frame. */
export function CopyLink({ link, amountLabel }: Props) {
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.')
    }
  }

  const share = async () => {
    if (!link) return
    try {
      await navigator.share({ title: 'USDC for you', text: `${amountLabel} USDC is waiting for you.`, url: link })
    } catch {
      /* dismissed or unsupported: copying stays available */
    }
  }

  return (
    <div className="space-y-2">
      <div className="glass-inner rounded-2xl p-3">
        <p className="mono break-all text-[11px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {link ?? 'Preparing link...'}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => void copy()}
          disabled={!link}
          className="btn-primary flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-all disabled:opacity-40"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {canShare && (
          <button
            onClick={() => void share()}
            disabled={!link}
            className="glass-inner flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold disabled:opacity-40"
            style={{ color: 'var(--ink)' }}
          >
            <Share2 className="size-4" /> Share
          </button>
        )}
      </div>
      <p className="text-xs text-pretty" style={{ color: 'var(--muted)' }}>
        Anyone with this link can claim the money, so send it privately.
      </p>
    </div>
  )
}
