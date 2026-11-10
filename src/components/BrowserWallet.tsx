import { useState } from 'react'
import { createWalletClient, erc20Abi, http, isAddress, type Hex } from 'viem'
import { arcTestnet } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { Check, Copy, Eye, EyeOff, Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { CHAIN, USDC_ADDRESS, publicClient } from '@/lib/chain'
import { money, parseOnchainError, shortAddress } from '@/lib/format'
import { Amount, gasTokenToUsdc, parseUsdc } from '@/onchain-money'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'

/** The wallet created in this browser for a recipient who had none. */
export function BrowserWallet({ privateKey }: { privateKey: Hex }) {
  const account = privateKeyToAccount(privateKey)
  const balance = useUsdcBalance(account.address)
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState<'address' | 'key' | null>(null)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const copy = async (what: 'address' | 'key') => {
    await navigator.clipboard.writeText(what === 'address' ? account.address : privateKey).catch(() => undefined)
    setCopied(what)
    setTimeout(() => setCopied(null), 1600)
  }

  // Gas on Arc is paid from the same USDC balance, so Max leaves room for the fee.
  const setMax = async () => {
    if (!balance.data) return
    try {
      const [gas, gasPrice] = await Promise.all([
        publicClient.estimateContractGas({
          account: account.address,
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [account.address, 1n],
        }),
        publicClient.getGasPrice(),
      ])
      const fee = gasTokenToUsdc(CHAIN.chainId, Amount.fromRaw(gas * gasPrice * 2n, CHAIN.nativeCurrency.decimals)).raw + 1n
      setAmount(money(balance.data > fee ? balance.data - fee : 0n))
    } catch {
      toast.error('Could not estimate the network fee.')
    }
  }

  const withdraw = async () => {
    if (!isAddress(to)) return
    setSending(true)
    try {
      const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(CHAIN.rpcUrls[0]) })
      const hash = await wallet.writeContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, parseUsdc(amount)],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setTxHash(hash)
      setAmount('')
      void balance.refetch()
    } catch (e) {
      toast.error(parseOnchainError(e))
    } finally {
      setSending(false)
    }
  }

  const canSend = isAddress(to) && /^\d*\.?\d+$/.test(amount) && !sending

  return (
    <section className="glass-card rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Your new wallet</span>
        <button onClick={() => void copy('address')} className="mono flex min-h-8 items-center gap-1 text-xs" style={{ color: 'var(--ink-2)' }}>
          {shortAddress(account.address)} {copied === 'address' ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      </div>
      <p className="display mt-2 text-4xl font-bold tabular-nums">
        {balance.data === undefined ? '...' : money(balance.data)} <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
      </p>

      <div className="glass-inner mt-4 rounded-2xl p-3">
        <p className="flex items-start gap-2 text-xs text-pretty" style={{ color: 'var(--ink-2)' }}>
          <ShieldAlert className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--danger)' }} />
          This wallet is stored only in this browser. Clearing site data loses it. Move your money to a wallet you control, or back up the key.
        </p>
        <button onClick={() => setReveal((v) => !v)} className="mt-2 flex min-h-9 items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-hover)' }}>
          {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} {reveal ? 'Hide' : 'Show'} private key
        </button>
        {reveal && (
          <div className="mt-1 flex items-start gap-2">
            <code className="mono flex-1 break-all text-[11px]">{privateKey}</code>
            <button onClick={() => void copy('key')} aria-label="Copy private key" className="flex size-9 items-center justify-center">
              {copied === 'key' ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Move USDC out</p>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value.trim())}
          placeholder="Destination address (0x...)"
          aria-label="Destination address"
          className="glass-inner mono min-h-11 w-full rounded-xl px-3 text-xs outline-none"
        />
        <div className="flex gap-2">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && setAmount(e.target.value)}
            placeholder="0.00"
            aria-label="Amount"
            className="glass-inner min-h-11 min-w-0 flex-1 rounded-xl px-3 text-sm tabular-nums outline-none"
          />
          <button onClick={() => void setMax()} className="glass-inner min-h-11 rounded-xl px-3 text-xs font-semibold">Max</button>
          <button onClick={() => void withdraw()} disabled={!canSend} className="btn-primary flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-40">
            {sending && <Loader2 className="size-4 animate-spin" />} Send
          </button>
        </div>
        {txHash && (
          <a href={buildTxExplorerUrl(CHAIN.chainId, txHash)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
            Sent. View transaction
          </a>
        )}
      </div>
    </section>
  )
}
