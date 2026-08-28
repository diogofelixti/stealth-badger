import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Network, ScriptType } from '../wallet/descriptor'

const exec = promisify(execFile)

/** Como o scanner é invocado. Injetável para que o teste não precise dele. */
export type ScanRunner = (args: string[]) => Promise<string>

export interface RecommendationTool {
  name?: string
  title?: string
  url?: string
  [campo: string]: unknown
}

export type PrivacyRecommendation =
  | string
  | {
      urgency?: string
      headline?: string
      title?: string
      text?: string
      detail?: string
      action?: string
      tools?: RecommendationTool[]
      [campo: string]: unknown
    }

export interface PrivacyFinding {
  id: string
  severity: string
  confidence: string
  title: string
  description: string
  recommendation: PrivacyRecommendation
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
  [campo: string]: unknown
}

export interface PrivacyScan {
  score: number
  grade: string
  /**
   * O retrato que o scanner devolveu: `walletInfo` para carteira,
   * `addressInfo` para endereço avulso. Guardado como veio — as duas formas
   * não coincidem, e traduzir campo a campo obrigaria a inventar os que não
   * existem de um lado.
   */
  walletInfo: Record<string, unknown>
  findings: PrivacyFinding[]
  scannerVersion: string
}

export interface ScanOptions {
  canonicalXpub: string
  scriptType: ScriptType
  network: Network
  /** a fonte de análise: Esplora, e não necessariamente a fonte de cadeia */
  backendUrl: string
  gapLimit?: number
  runner?: ScanRunner
  timeoutMs?: number
  /**
   * O que o watchtower já mediu sozinho, de primeira mão.
   *
   * Serve para desmentir um scanner cego: ele sincronizou esta carteira,
   * contou os UTXOs e guardou os eventos. Quando o scanner diz que ela está
   * vazia e a projeção local diz que não está, quem está errado é o scanner.
   */
  jaMedido?: { utxos: number }
}

/**
 * O código da recusa que separa "nada encontrado" de "não consegui olhar".
 *
 * Em 28/08 a varredura de uma carteira com 32 UTXOs e 7.552.468 sats devolveu
 * **score 70 · C** com todo o `walletInfo` zerado, porque o scanner estava
 * apontado para um RPC que ele não sabe consultar. Os dois campos obrigatórios
 * vieram, então o resultado foi guardado — e um número que não mediu nada
 * passou a parecer um diagnóstico.
 *
 * É o produto cometendo o que existe para denunciar. Daí a recusa ter código
 * próprio: a tela precisa dizer *por que* não sabe, e não mostrar um erro
 * genérico nem, muito pior, um score.
 */
export const CODIGO_VARREDURA_CEGA = 'privacy.blindScan'

export class VarreduraCega extends Error {
  readonly code = CODIGO_VARREDURA_CEGA
  constructor(
    /** o que a projeção local já contava */
    readonly utxosConhecidos: number,
  ) {
    super(
      `o scanner respondeu que esta carteira não tem endereço, transação nem ` +
        `UTXO, mas o watchtower já sincronizou ${utxosConhecidos} UTXO(s) nela. ` +
        `Isso não é uma carteira vazia: é uma varredura que não conseguiu ` +
        `consultar a cadeia. O resultado foi descartado em vez de guardado.`,
    )
    this.name = 'VarreduraCega'
  }
}

/**
 * O scanner enxergou alguma coisa?
 *
 * A cegueira é o conjunto **inteiro** zerado. Um campo qualquer em zero é
 * informação legítima — carteira que gastou tudo tem `totalUtxos: 0` e
 * `totalTxs` alto —, e recusar por um campo faria a regra virar zelo cego.
 */
function naoViuNada(info: WalletInfo): boolean {
  return (
    Number(info.activeAddresses ?? 0) === 0 &&
    Number(info.totalTxs ?? 0) === 0 &&
    Number(info.totalUtxos ?? 0) === 0 &&
    Number(info.totalBalance ?? 0) === 0
  )
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
    const motivo = (err as Error).message
    // A dica de instalação só entra quando é ela que resolve. Se o binário
    // rodou e reclamou, mandar conferir o PATH manda procurar no lugar errado
    // — e conselho errado gruda mais que conselho ausente.
    const naoEncontrado = /ENOENT|not found: am-i-exposed|command not found/i.test(motivo)
    throw new Error(
      'falha ao rodar o am-i-exposed: ' +
        motivo +
        (naoEncontrado ? '. Confira se ele está instalado e no PATH do processo.' : ''),
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
  score?: number | null
  grade?: string | null
  txType?: string | null
  txInfo?: Record<string, unknown>
  chainAnalysis?: Record<string, unknown>
  findings: PrivacyFinding[]
  scannerVersion: string
  boltzmann?: Record<string, unknown> | null
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
  ) as {
    version?: string
    score?: number
    grade?: string
    txType?: string
    txInfo?: Record<string, unknown>
    chainAnalysis?: Record<string, unknown>
    findings?: PrivacyFinding[]
  }

  // `links` traz a transação numa URL de site de terceiro; fica de fora do que
  // é guardado, pela mesma razão do xpub na varredura de carteira.
  return {
    score: typeof bruto.score === 'number' ? bruto.score : null,
    grade: bruto.grade ?? null,
    txType: bruto.txType ?? null,
    txInfo: bruto.txInfo ?? {},
    chainAnalysis: bruto.chainAnalysis ?? {},
    findings: bruto.findings ?? [],
    scannerVersion: bruto.version ?? 'desconhecida',
  }
}

export async function scanBoltzmann(opts: TxScanOptions): Promise<Record<string, unknown>> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const runner = opts.runner ?? cliRunner(timeoutMs)
  return rodar(
    [...argumentosBase(opts.network, opts.backendUrl), 'boltzmann', opts.txid],
    runner,
  )
}

export interface AddressScanOptions {
  address: string
  network: Network
  backendUrl: string
  runner?: ScanRunner
  timeoutMs?: number
}

/**
 * Analisa um endereço avulso.
 *
 * Um endereço não vira descriptor, e mandar `scan xpub` com ele faria o
 * scanner recusar — a análise de privacidade ficaria indisponível justamente
 * para o caso mais simples que o produto vigia.
 */
export async function scanAddress(opts: AddressScanOptions): Promise<PrivacyScan> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const runner = opts.runner ?? cliRunner(timeoutMs)

  const bruto = (await rodar(
    [...argumentosBase(opts.network, opts.backendUrl), 'scan', 'address', opts.address],
    runner,
  )) as {
    version?: string
    score?: number
    grade?: string
    addressInfo?: Record<string, unknown>
    findings?: PrivacyFinding[]
  }

  if (typeof bruto.score !== 'number') {
    throw new Error('o scanner devolveu JSON sem score')
  }

  return {
    score: bruto.score,
    grade: bruto.grade ?? '?',
    walletInfo: bruto.addressInfo ?? {},
    findings: bruto.findings ?? [],
    scannerVersion: bruto.version ?? 'desconhecida',
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

  // Sem saber o que o watchtower mediu não há como desmentir ninguém, e
  // inventar a recusa seria o mesmo defeito ao contrário.
  const conhecidos = opts.jaMedido?.utxos ?? 0
  if (conhecidos > 0 && naoViuNada(bruto.walletInfo)) {
    throw new VarreduraCega(conhecidos)
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
