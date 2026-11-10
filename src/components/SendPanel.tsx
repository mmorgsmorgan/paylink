import { useMemo, useState } from 'react'
import { erc20Abi } from 'viem'
import { useAccount, useSwitchChain, useWriteContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import { Loader2, Zap } from 'lucide-react'
import { paylinkAbi } from '@/contracts/paylinkAbi'
import { CHAIN, CHAIN_ID, PAYLINK_ADDRESS, publicClient, RELAY_FEE, USDC_ADDRESS } from '@/lib/chain'
import { newLinkKey, secretToFragment, signCreate } from '@/lib/linkKey'
import { saveSentLink } from '@/lib/store'
import { money, parseOnchainError } from '@/lib/format'
import { parseUsdc } from '@/onchain-money'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { useShareRoot } from '@/hooks/useShareRoot'
import { CopyLink } from './CopyLink'

type Step = 'idle' | 'approving' | 'creating'

function tryParse(value: string): bigint | null {
  if (!value) return null
  try {
    const raw = parseUsdc(value)
    return raw > 0n ? raw : null
  } catch {
    return null
  }
}

export function SendPanel() {
  const { address, isConnected, chainId } = useAccount()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const balance = useUsdcBalance(address)
  const shareRoot = useShareRoot()

  const [amount, setAmount] = useState('')
  const [coverGas, setCoverGas] = useState(true)
  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ secret: string; amount: bigint } | null>(null)

  const principal = tryParse(amount)
  const fee = coverGas ? RELAY_FEE : 0n
  const total = principal === null ? null : principal + fee
  const insufficient = total !== null && balance.data !== undefined && total > balance.data
  const wrongChain = isConnected && chainId !== CHAIN_ID
  const busy = step !== 'idle'

  const link = useMemo(
    () => (created && shareRoot ? `${shareRoot}#${created.secret}` : null),
    [created, shareRoot],
  )

  const send = async () => {
    if (!address || principal === null || total === null) return
    setError(null)
    try {
      setStep('approving')
      const allowance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, PAYLINK_ADDRESS],
      })
      if (allowance < total) {
        const approveHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [PAYLINK_ADDRESS, total],
          chainId: CHAIN_ID,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }

      setStep('creating')
      const key = newLinkKey()
      const keySignature = await signCreate(key.privateKey, address, principal, fee)
      // Saved before broadcasting so the link survives a closed tab.
      saveSentLink({ privateKey: key.privateKey, address: key.address, sender: address })
      const hash = await writeContractAsync({
        address: PAYLINK_ADDRESS,
        abi: paylinkAbi,
        functionName: 'createLink',
        args: [key.address, principal, fee, keySignature],
        chainId: CHAIN_ID,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('The transaction reverted.')
      setCreated({ secret: secretToFragment(key.privateKey), amount: principal })
      setAmount('')
    } catch (e) {
      const msg = parseOnchainError(e)
      if (msg !== 'Cancelled.') setError(msg)
    } finally {
      setStep('idle')
      void balance.refetch()
    }
  }

  if (created) {
    return (
      <section className="glass-card overflow-hidden rounded-3xl">
        <div className="spectral h-1" />
        <div className="space-y-4 p-5">
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>Link ready</p>
            <p className="display mt-1 text-3xl font-bold tabular-nums">
              {money(created.amount)} <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
            </p>
            <p className="mt-1 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
              The funds are held in escrow until your friend opens the link. You can cancel it any time before then.
            </p>
          </div>
          <CopyLink link={link} amountLabel={money(created.amount)} />
          <button onClick={() => setCreated(null)} className="min-h-11 w-full text-sm font-semibold" style={{ color: 'var(--accent-hover)' }}>
            Send another
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="glass-card rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Send USDC to a friend</span>
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--subtle)' }}>
          <TokenUSDC variant="branded" size={14} /> {CHAIN.name}
        </span>
      </div>

      <div className="glass-inner rounded-2xl p-4">
        <input
          inputMode="decimal"
          value={amount}
          disabled={busy}
          aria-label="Amount in USDC"
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, '')
            if (/^\d*\.?\d{0,6}$/.test(v)) setAmount(v)
          }}
          placeholder="0.00"
          className="display w-full bg-transparent text-5xl font-bold tabular-nums outline-none placeholder:text-slate-300"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</span>
          <button
            disabled={!balance.data}
            onClick={() => balance.data && setAmount(money(balance.data > fee ? balance.data - fee : 0n))}
            className="text-xs font-semibold tabular-nums disabled:opacity-40"
            style={{ color: 'var(--accent-hover)' }}
          >
            {balance.data !== undefined ? `Balance: ${money(balance.data)} · Max` : 'Connect to see balance'}
          </button>
        </div>
      </div>

      <label className="glass-inner mt-3 flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl p-3">
        <input
          type="checkbox"
          checked={coverGas}
          disabled={busy}
          onChange={(e) => setCoverGas(e.target.checked)}
          className="mt-0.5 size-4 accent-[#122d45]"
        />
        <span className="text-sm">
          <span className="flex items-center gap-1 font-semibold"><Zap className="size-3.5" /> Cover their claim fee ({money(RELAY_FEE)} USDC)</span>
          <span className="block text-xs text-pretty" style={{ color: 'var(--muted)' }}>
            Lets a friend with no wallet or gas claim instantly. If they claim from their own wallet, the fee goes to them too.
          </span>
        </span>
      </label>

      {total !== null && (
        <dl className="mt-3 space-y-1.5 px-1 text-sm tabular-nums">
          <div className="flex justify-between"><dt style={{ color: 'var(--muted)' }}>Friend receives</dt><dd>{money(principal ?? 0n)} USDC</dd></div>
          <div className="flex justify-between"><dt style={{ color: 'var(--muted)' }}>Claim fee</dt><dd>{money(fee)} USDC</dd></div>
          <div className="flex justify-between font-semibold"><dt>You pay</dt><dd>{money(total)} USDC</dd></div>
        </dl>
      )}

      <div className="mt-4">
        {!isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button onClick={show} className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold transition-all">Connect wallet</button>
            )}
          </ConnectKitButton.Custom>
        ) : wrongChain ? (
          <button
            onClick={() => switchChain({ chainId: CHAIN_ID })}
            disabled={switching}
            className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold disabled:opacity-40"
          >
            Switch to {CHAIN.name}
          </button>
        ) : (
          <button
            onClick={() => void send()}
            disabled={busy || total === null || insufficient}
            className="btn-primary min-h-12 w-full rounded-2xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {step === 'approving' ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Approving USDC...</span>
            ) : step === 'creating' ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" /> Creating link...</span>
            ) : insufficient ? (
              'Not enough USDC'
            ) : (
              'Create link'
            )}
          </button>
        )}
        {error && <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        {insufficient && (
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            Need test USDC? Use "Get test USDC" in the Arc Studio sidebar.
          </p>
        )}
      </div>
    </section>
  )
}
