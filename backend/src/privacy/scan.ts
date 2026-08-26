import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Network, ScriptType } from '../wallet/descriptor'

const exec = promisify(execFile)

/** Como o scanner é invocado. Injetável para que o teste não precise dele. */
export type ScanRunner = (args: string[]) => Promise<string>

export interface PrivacyFinding {
  id: string
  severity: string
  confidence: string
  title: string
  description: string
  recommendation: string
  scoreImpact: number
  params: Record<string, unknown>
}

export interface WalletInfo {
  activeAddresses: number
  totalTxs: number
  totalUtxos: number
  totalBalance: number
  reusedAddresses: number
  dustUtxos: number
}

export interface PrivacyScan {
  score: number
  grade: string
  walletInfo: WalletInfo
  findings: PrivacyFinding[]
  scannerVersion: string
}

export interface ScanOptions {
  canonicalXpub: string
  scriptType: ScriptType
  network: Network
  /** o mesmo backend que vigia a carteira */
  backendUrl: string
  gapLimit?: number
  runner?: ScanRunner
  timeoutMs?: number
}

/**
 * Envolve a chave estendida na função de script que descreve como ela é usada.
 *
 * Sem isso o scanner recebe um `tpub` puro, que não declara tipo de script,
 * assume legado e deriva endereços que nunca existiram. O relatório sai
 * completo, bem formatado e dizendo que a carteira está vazia — que é a pior
 * forma de errar, porque não parece erro. Medido contra a signet: 32 UTXOs
 * reais, relatório anunciando zero.
 */
export function descriptorFor(canonicalXpub: string, scriptType: ScriptType): string {
  switch (scriptType) {
    case 'p2pkh':
      return `pkh(${canonicalXpub})`
    case 'p2sh-p2wpkh':
      return `sh(wpkh(${canonicalXpub}))`
    case 'p2wpkh':
      return `wpkh(${canonicalXpub})`
    case 'p2tr':
      return `tr(${canonicalXpub})`
  }
}

/** Quanto da saída do processo cabe na mensagem de erro. */
const TRECHO_DE_SAIDA = 240

/**
 * Descreve por que o scanner falhou, com a saída que ele produziu.
 *
 * O `Error` do `execFile` diz só `Command failed: <comando>`, e guarda a causa
 * em `stdout` e `stderr`. Sem trazê-las, o log registra o comando inteiro e
 * nenhuma informação — foi o que aconteceu quando três análises falharam
 * contra a signet e a causa real, "Not found", só apareceu rodando o comando à
 * mão.
 */
export function mensagemDeFalha(err: unknown): string {
  const e = err as { message?: string; stdout?: string; stderr?: string }
  const saida = [e.stderr, e.stdout]
    .map(t => (t ?? '').trim())
    .filter(Boolean)
    .join(' | ')
    .slice(0, TRECHO_DE_SAIDA)

  const base = e.message ?? String(err)
  return saida ? base + ' · saída: ' + saida : base
}

/** Chama a CLI de verdade. */
export function cliRunner(timeoutMs: number, comando = 'am-i-exposed'): ScanRunner {
  return async (args: string[]) => {
    try {
      const { stdout } = await exec(comando, args, {
        timeout: timeoutMs,
        // o relatório de uma carteira grande passa folgado do padrão de 1 MB
        maxBuffer: 64 * 1024 * 1024,
      })
      return stdout
    } catch (err) {
      throw new Error(mensagemDeFalha(err))
    }
  }
}

/**
 * Roda o scanner e devolve o JSON já interpretado.
 *
 * Compartilhado pelas duas varreduras porque as duas falham do mesmo jeito:
 * binário ausente, saída que não é JSON, e a URL de terceiro no campo `links`
 * que não pode ser guardada nem exibida.
 */
async function rodar(
  args: string[],
  runner: ScanRunner,
): Promise<Record<string, unknown>> {
  let saida: string
  try {
    saida = await runner(args)
  } catch (err) {
    throw new Error(
      'falha ao rodar o am-i-exposed: ' +
        (err as Error).message +
        '. Confira se ele está instalado e no PATH do processo.',
    )
  }

  try {
    return JSON.parse(saida) as Record<string, unknown>
  } catch {
    throw new Error(
      'o scanner devolveu algo que não é JSON; saída começa com: ' + saida.slice(0, 120),
    )
  }
}

/** Argumentos comuns às duas varreduras. */
function argumentosBase(network: Network, backendUrl: string): string[] {
  return [
    '--json',
    '--network',
    network,
    // Sem --api o scanner consulta o explorador público dele. Os endereços
    // ficariam expostos a um segundo observador que o usuário nunca escolheu —
    // dentro da própria ferramenta que existe para avisar sobre isso.
    '--api',
    backendUrl,
  ]
}

export interface TxScanOptions {
  txid: string
  network: Network
  backendUrl: string
  runner?: ScanRunner
  timeoutMs?: number
}

export interface TxScan {
  findings: PrivacyFinding[]
  scannerVersion: string
}

/**
 * Analisa uma transação isolada.
 *
 * É onde vivem os achados de entidade — quem mandou os fundos. A varredura de
 * carteira não os produz: ela só emite achados `wallet-*`, sobre a forma da
 * carteira, e nada sobre a procedência do que entrou nela.
 */
export async function scanTransaction(opts: TxScanOptions): Promise<TxScan> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const runner = opts.runner ?? cliRunner(timeoutMs)

  const bruto = await rodar(
    [...argumentosBase(opts.network, opts.backendUrl), 'scan', 'tx', opts.txid],
    runner,
  )

  // `links` traz a transação numa URL de site de terceiro; fica de fora do que
  // é guardado, pela mesma razão do xpub na varredura de carteira.
  return {
    findings: (bruto.findings as PrivacyFinding[]) ?? [],
    scannerVersion: (bruto.version as string) ?? 'desconhecida',
  }
}

export async function scanWallet(opts: ScanOptions): Promise<PrivacyScan> {
  const timeoutMs = opts.timeoutMs ?? 240_000
  const runner = opts.runner ?? cliRunner(timeoutMs)
  const descriptor = descriptorFor(opts.canonicalXpub, opts.scriptType)

  const args = [
    ...argumentosBase(opts.network, opts.backendUrl),
    'scan',
    'xpub',
    descriptor,
  ]
  if (opts.gapLimit !== undefined) args.push('--gap-limit', String(opts.gapLimit))

  const bruto = (await rodar(args, runner)) as {
    version?: string
    score?: number
    grade?: string
    walletInfo?: WalletInfo
    findings?: PrivacyFinding[]
  }

  if (typeof bruto.score !== 'number' || !bruto.walletInfo) {
    throw new Error('o scanner devolveu JSON sem score ou sem walletInfo')
  }

  // `links.analysis` traz o xpub embutido numa URL de terceiro. Não entra no
  // que é guardado nem no que é exibido: seria convidar o usuário a colar a
  // chave dele fora daqui.
  return {
    score: bruto.score,
    grade: bruto.grade ?? '?',
    walletInfo: bruto.walletInfo,
    findings: bruto.findings ?? [],
    scannerVersion: bruto.version ?? 'desconhecida',
  }
}
