import { useEffect, useState } from 'react'
import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { useAccount, useReadContract, useSwitchChain, useWriteContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import { CheckCircle2, Loader2, Wallet, Sparkles } from 'lucide-react'
import { paylinkAbi } from '@/contracts/paylinkAbi'
import { CHAIN, CHAIN_ID, PAYLINK_ADDRESS, publicClient } from '@/lib/chain'
import { signClaim } from '@/lib/linkKey'
import { fetchRelayer, submitRelayedClaim, type RelayerInfo } from '@/lib/relayer'
import { getBrowserWalletKey, getOrCreateBrowserWallet } from '@/lib/store'
import { money, parseOnchainError, shortAddress } from '@/lib/format'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { BrowserWallet } from './BrowserWallet'

type Dest = 'new' | 'mine'

export function ClaimView({ secret, onExit }: { secret: Hex; onExit: () => void }) {
  const key = privateKeyToAccount(secret).address
  const { address, isConnected, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()

  const link = useReadContract({
    address: PAYLINK_ADDRESS,
    abi: paylinkAbi,
    functionName: 'getLink',
    args: [key],
    chainId: CHAIN_ID,
    query: { refetchInterval: 6000 },
  })

  const [relayer, setRelayer] = useState<RelayerInfo | null>(null)
  const [dest, setDest] = useState<Dest>('new')
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [claimTx, setClaimTx] = useState<string | null>(null)
  const [walletKey, setWalletKey] = useState<Hex | null>(getBrowserWalletKey())

  useEffect(() => {
    void fetchRelayer().then(setRelayer)
  }, [])

  const [sender, amount, relayFee, status] = link.data ?? [undefined, undefined, undefined, undefined]
  const active = status === 1
  const gasless = !!relayer?.ready && (relayFee ?? 0n) > 0n
  const wrongChain = dest === 'mine' && isConnected && chainId !== CHAIN_ID
  const canClaim = active && !claiming && (dest === 'new' ? gasless : isConnected && !!address)

  const claim = async () => {
    setError(null)
    setClaiming(true)
    try {
      let to: Address
      if (dest === 'new') {
        const w = getOrCreateBrowserWallet()
        to = w.address
        setWalletKey(w.privateKey)
      } else {
        if (!address) throw new Error('Connect your wallet first.')
        to = address
      }

      if (gasless && relayer) {
        const signature = await signClaim(secret, to, relayer.address)
        const hash = await submitRelayedClaim({ key, to, signature })
        setClaimTx(hash)
      } else {
        // No relayer: the recipient submits the claim and pays gas from their own balance.
        const signature = await signClaim(secret, to, to)
        const hash = await writeContractAsync({
          address: PAYLINK_ADDRESS,
          abi: paylinkAbi,
          functionName: 'claim',
          args: [key, to, to, signature],
          chainId: CHAIN_ID,
        })
        await publicClient.waitForTransactionReceipt({ hash })
        setClaimTx(hash)
      }
      await link.refetch()
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Cancelled.') setError(msg)
    } finally {
      setClaiming(false)
    }
  }

  if (link.isLoading) {
    return (
      <div className="glass-card flex items-center justify-center gap-2 rounded-3xl p-10 text-sm" style={{ color: 'var(--muted)' }}>
        <Loader2 className="size-4 animate-spin" /> Checking your link...
      </div>
    )
  }

  if (link.data && status === 0) {
    return <Notice title="This link isn't funded yet" body="The sender's transaction may still be confirming. Try again in a moment." onExit={onExit} />
  }

  if (status === 3) {
    return <Notice title="This link was cancelled" body="The sender took the money back before it was claimed." onExit={onExit} />
  }

  if (status === 2) {
    return (
      <div className="space-y-3">
        <div className="glass-card overflow-hidden rounded-3xl">
          <div className="spectral h-1" />
          <div className="space-y-2 p-5">
            <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--success)' }}>
              <CheckCircle2 className="size-4" /> Claimed
            </p>
            <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>This link has been used and can't be claimed again.</p>
            {claimTx && (
              <a href={buildTxExplorerUrl(CHAIN_ID, claimTx)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
                View transaction
              </a>
            )}
          </div>
        </div>
        {walletKey && <BrowserWallet privateKey={walletKey} />}
        <button onClick={onExit} className="min-h-11 w-full text-sm font-semibold" style={{ color: 'var(--accent-hover)' }}>Send USDC yourself</button>
      </div>
    )
  }

  return (
    <section className="glass-card overflow-hidden rounded-3xl">
      <div className="spectral h-1" />
      <div className="space-y-4 p-5">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            <Sparkles className="size-3.5" /> {sender ? `From ${shortAddress(sender)}` : 'You received money'}
          </p>
          <p className="display mt-2 flex items-baseline gap-2 text-5xl font-bold tabular-nums">
            {money(amount)} <span className="flex items-center gap-1 text-lg font-medium" style={{ color: 'var(--subtle)' }}><TokenUSDC variant="branded" size={18} /> USDC</span>
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>on {CHAIN.name}</p>
        </div>

        <div className="space-y-2" role="radiogroup" aria-label="Where should the money go?">
          <DestOption
            selected={dest === 'new'}
            onSelect={() => setDest('new')}
            title={walletKey ? 'My wallet on this device' : 'Create a wallet for me'}
            body={walletKey ? 'Use the wallet already created in this browser.' : 'No setup needed. We create one in this browser.'}
            icon={<Sparkles className="size-4" />}
          />
          <DestOption
            selected={dest === 'mine'}
            onSelect={() => setDest('mine')}
            title="Use my own wallet"
            body={isConnected && address ? `Send to ${shortAddress(address)}` : 'Connect MetaMask or another wallet.'}
            icon={<Wallet className="size-4" />}
          />
        </div>

        {dest === 'new' && !gasless && (
          <p className="glass-inner rounded-xl p-3 text-xs text-pretty" style={{ color: 'var(--ink-2)' }}>
            Free claiming isn't available for this link right now. Use your own wallet that holds a little USDC for the network fee.
          </p>
        )}

        {dest === 'mine' && !isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button onClick={show} className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold">Connect wallet</button>
            )}
          </ConnectKitButton.Custom>
        ) : wrongChain ? (
          <button onClick={() => switchChain({ chainId: CHAIN_ID })} className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold">
            Switch to {CHAIN.name}
          </button>
        ) : (
          <button
            onClick={() => void claim()}
            disabled={!canClaim}
            className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {claiming ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Claiming...</span>
            ) : (
              `Claim ${money(amount)} USDC`
            )}
          </button>
        )}
        {error && <p role="alert" className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        {gasless && dest === 'new' && (
          <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>The sender covered the network fee, so you pay nothing.</p>
        )}
      </div>
    </section>
  )
}

function DestOption(props: { selected: boolean; onSelect: () => void; title: string; body: string; icon: React.ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={props.selected}
      onClick={props.onSelect}
      className="glass-inner flex min-h-14 w-full items-center gap-3 rounded-2xl p-3 text-left transition-all"
      style={props.selected ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1.5px var(--accent)' } : undefined}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(18,45,69,0.08)' }}>{props.icon}</span>
      <span>
        <span className="block text-sm font-semibold">{props.title}</span>
        <span className="block text-xs" style={{ color: 'var(--muted)' }}>{props.body}</span>
      </span>
    </button>
  )
}

function Notice({ title, body, onExit }: { title: string; body: string; onExit: () => void }) {
  return (
    <div className="glass-card space-y-2 rounded-3xl p-6">
      <p className="display text-xl font-bold text-balance">{title}</p>
      <p className="text-sm text-pretty" style={{ color: 'var(--muted)' }}>{body}</p>
      <button onClick={onExit} className="min-h-11 text-sm font-semibold" style={{ color: 'var(--accent-hover)' }}>Send USDC yourself</button>
    </div>
  )
}
