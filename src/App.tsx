import { useEffect, useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { Link2, Lock, Zap, Wallet } from 'lucide-react'
import { SendPanel } from '@/components/SendPanel'
import { SentLinks } from '@/components/SentLinks'
import { ClaimView } from '@/components/ClaimView'
import { readSecretFromHash } from '@/lib/linkKey'
import { shortAddress } from '@/lib/format'

export default function App() {
  // A link carries its secret in the URL fragment, which is never sent to a server.
  const [secret, setSecret] = useState(() => readSecretFromHash(window.location.hash))

  useEffect(() => {
    const onHash = () => setSecret(readSecretFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const exitClaim = () => {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    setSecret(null)
  }

  return (
    <div className="relative min-h-dvh overflow-hidden" style={{ background: 'linear-gradient(180deg, #f9f9fc 0%, #fffcf7 52%, #fbf7f2 100%)' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div style={{ position: 'absolute', top: '8%', left: '5%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div style={{ position: 'absolute', bottom: '8%', right: '8%', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)', filter: 'blur(58px)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-24 pt-6">
        <header className="mb-6 flex items-center justify-between">
          <span className="display flex items-center gap-2 text-lg font-bold">
            <span className="flex size-7 items-center justify-center rounded-lg" style={{ background: 'var(--accent)', color: '#fff' }}>
              <Link2 className="size-4" />
            </span>
            PayLink
          </span>
          <ConnectKitButton.Custom>
            {({ isConnected, show, address }) => (
              <button
                onClick={show}
                className="glass-inner flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold"
                style={{ color: 'var(--ink)' }}
              >
                <Wallet className="size-3.5" />
                {isConnected && address ? shortAddress(address) : 'Connect'}
              </button>
            )}
          </ConnectKitButton.Custom>
        </header>

        {secret ? (
          <ClaimView secret={secret} onExit={exitClaim} />
        ) : (
          <main>
            <div className="mb-5">
              <h1 className="display text-4xl font-bold text-balance">Send USDC with a link.</h1>
              <p className="mt-2 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
                Your friend doesn't need a wallet or any crypto to receive it. They open the link and claim.
              </p>
            </div>
            <SendPanel />
            <SentLinks />
            <ul className="mt-8 space-y-3 px-1 text-xs" style={{ color: 'var(--muted)' }}>
              <li className="flex items-start gap-2"><Lock className="mt-0.5 size-3.5 shrink-0" /> Funds sit in an escrow contract until the link is claimed. Cancel any time before.</li>
              <li className="flex items-start gap-2"><Zap className="mt-0.5 size-3.5 shrink-0" /> Claim fees can be prepaid, so recipients start with zero balance.</li>
            </ul>
          </main>
        )}
      </div>
    </div>
  )
}
