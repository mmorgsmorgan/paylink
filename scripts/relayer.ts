/**
 * Gas relayer for PayLink claims.
 *
 * A recipient with no wallet has no USDC for gas, so they sign a claim that names this
 * relayer. The relayer submits it and is paid the sender-funded relay fee by the contract.
 * It only broadcasts claims that pass a simulation and whose fee covers the gas cost.
 *
 * Run with: bun run relayer
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createPublicClient, createWalletClient, http, isAddress, isHex, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { paylinkAbi } from '../src/contracts/paylinkAbi'
import { getChain } from '../src/onchain-facts'
import { Amount, usdcDecimalsFor, usdcToGasToken } from '../src/onchain-money'

const PORT = Number(process.env.RELAYER_PORT ?? 3001)
const CHAIN_ID = arcTestnet.id
const PAYLINK = process.env.VITE_PAYLINK_ADDRESS as Address | undefined
const PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY as Hex | undefined

if (!PAYLINK || !PRIVATE_KEY) {
  console.error('Missing VITE_PAYLINK_ADDRESS or RELAYER_PRIVATE_KEY in .env')
  process.exit(1)
}

// Sandbox RPC proxy first, then a per-chain override, then the public RPC from the facts registry.
const proxyChains = (process.env.RPC_PROXY_CHAINS ?? '').split(',')
const rpcUrl =
  process.env.RPC_URL_Arc_Testnet ??
  (process.env.RPC_PROXY_BASE_URL && proxyChains.includes('Arc_Testnet')
    ? `${process.env.RPC_PROXY_BASE_URL}/api/rpc/Arc_Testnet?_rpc_token=${process.env.RPC_PROXY_TOKEN}`
    : (getChain(CHAIN_ID)?.rpcUrls[0] ?? ''))

const account = privateKeyToAccount(PRIVATE_KEY)
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) })
const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpcUrl) })

const usdcToNative = (units: string) =>
  usdcToGasToken(CHAIN_ID, Amount.parse(units, usdcDecimalsFor(CHAIN_ID))).raw

/** Below this native balance the relayer can't safely front gas. */
const MIN_READY_BALANCE = usdcToNative('0.05')
/** Required headroom: the fee must cover the estimated gas cost times this factor. */
const FEE_SAFETY_NUM = 12n
const FEE_SAFETY_DEN = 10n

let queue: Promise<unknown> = Promise.resolve()
/** Claims are sent one at a time so nonces never collide. */
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 4096) throw new HttpError(413, 'Request too large.')
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  } catch {
    throw new HttpError(400, 'Invalid JSON.')
  }
}

async function relay(body: Record<string, unknown>): Promise<Hex> {
  const { key, to, signature } = body
  if (typeof key !== 'string' || !isAddress(key)) throw new HttpError(400, 'Invalid link key.')
  if (typeof to !== 'string' || !isAddress(to)) throw new HttpError(400, 'Invalid destination.')
  if (typeof signature !== 'string' || !isHex(signature) || signature.length !== 132) {
    throw new HttpError(400, 'Invalid signature.')
  }

  const [, , relayFee, status] = await publicClient.readContract({
    address: PAYLINK as Address,
    abi: paylinkAbi,
    functionName: 'getLink',
    args: [key],
  })
  if (status !== 1) throw new HttpError(409, 'This link is not active.')
  if (relayFee === 0n) throw new HttpError(422, 'This link does not prepay a claim fee.')

  const claimArgs = [key, to, account.address, signature] as const
  let request
  try {
    ;({ request } = await publicClient.simulateContract({
      account,
      address: PAYLINK as Address,
      abi: paylinkAbi,
      functionName: 'claim',
      args: claimArgs,
    }))
  } catch {
    throw new HttpError(422, 'This claim is not valid.')
  }

  const [gas, gasPrice] = await Promise.all([
    publicClient.estimateContractGas({
      account,
      address: PAYLINK as Address,
      abi: paylinkAbi,
      functionName: 'claim',
      args: claimArgs,
    }),
    publicClient.getGasPrice(),
  ])
  const feeNative = usdcToGasToken(CHAIN_ID, Amount.fromRaw(relayFee, usdcDecimalsFor(CHAIN_ID))).raw
  if ((gas * gasPrice * FEE_SAFETY_NUM) / FEE_SAFETY_DEN > feeNative) {
    throw new HttpError(422, 'The prepaid fee is too small to cover network costs right now.')
  }

  const hash = await walletClient.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new HttpError(502, 'The claim transaction failed.')
  return hash
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      if (req.method === 'GET' && req.url === '/relayer') {
        const balance = await publicClient.getBalance({ address: account.address })
        return send(res, 200, { address: account.address, ready: balance >= MIN_READY_BALANCE })
      }
      if (req.method === 'POST' && req.url === '/relay') {
        const body = await readJson(req)
        const hash = await serialize(() => relay(body))
        return send(res, 200, { hash })
      }
      return send(res, 404, { error: 'Not found.' })
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message })
      console.error('relayer error', e instanceof Error ? e.message.slice(0, 200) : 'unknown')
      return send(res, 500, { error: 'The relayer hit an error. Try again.' })
    }
  })()
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PayLink relayer ${account.address} listening on :${PORT}`)
})
