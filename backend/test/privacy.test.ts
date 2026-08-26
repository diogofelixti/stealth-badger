import { describe, expect, it } from 'vitest'
import { descriptorFor, scanWallet, type ScanRunner } from '../src/privacy/scan'

const XPUB =
  'tpubDCxX2sYFS5bDkSe5GKKYHjBW7tgyN1R3UchpLJvdbf54ohxeGRtd8MbDUe1cguVHe4vnK68DsuD5MXjxi9EXx16rb9EnNsaF5KT99CinaJz'

const SAIDA = JSON.stringify({
  version: '0.34.2',
  input: { type: 'xpub', value: `wpkh(${XPUB})` },
  network: 'signet',
  score: 66,
  grade: 'C',
  walletInfo: {
    activeAddresses: 31,
    totalTxs: 30,
    totalUtxos: 32,
    totalBalance: 7552468,
    reusedAddresses: 2,
    dustUtxos: 1,
  },
  findings: [
    {
      id: 'wallet-address-reuse',
      severity: 'medium',
      confidence: 'deterministic',
      title: '2 of 31 addresses reused',
      description: 'Address reuse directly links transactions.',
      recommendation: 'Never reuse Bitcoin addresses.',
      scoreImpact: -5,
      params: { reusedCount: 2 },
    },
  ],
  links: { analysis: `https://am-i.exposed/#xpub=${XPUB}` },
})

interface RunnerEspiao {
  (args: string[]): Promise<string>
  args: string[]
}

function runnerQueGrava(saida = SAIDA): RunnerEspiao {
  const r = (async (args: string[]) => {
    r.args = args
    return saida
  }) as RunnerEspiao
  r.args = []
  return r
}

const base = {
  canonicalXpub: XPUB,
  scriptType: 'p2wpkh' as const,
  network: 'signet' as const,
  backendUrl: 'http://meu-esplora:3002',
}

describe('descriptorFor', () => {
  // Passar o xpub cru faz o scanner derivar endereços legados e relatar uma
  // carteira vazia — sem erro nenhum. Foi o que aconteceu na primeira
  // tentativa contra a signet: 32 UTXOs reais, e o relatório dizia zero.
  // O tipo de script precisa viajar junto, e só o descriptor o carrega.
  it('envolve a chave em wpkh para native segwit', () => {
    expect(descriptorFor(XPUB, 'p2wpkh')).toBe(`wpkh(${XPUB})`)
  })

  it('envolve em pkh para legado', () => {
    expect(descriptorFor(XPUB, 'p2pkh')).toBe(`pkh(${XPUB})`)
  })

  it('aninha sh e wpkh, com os dois parênteses, para segwit encapsulado', () => {
    expect(descriptorFor(XPUB, 'p2sh-p2wpkh')).toBe(`sh(wpkh(${XPUB}))`)
  })

  it('envolve em tr para taproot', () => {
    expect(descriptorFor(XPUB, 'p2tr')).toBe(`tr(${XPUB})`)
  })
})

describe('scanWallet', () => {
  it('lê score, nota e achados da saída do scanner', async () => {
    const scan = await scanWallet({ ...base, runner: runnerQueGrava() })
    expect(scan.score).toBe(66)
    expect(scan.grade).toBe('C')
    expect(scan.findings).toHaveLength(1)
    expect(scan.walletInfo.totalUtxos).toBe(32)
    expect(scan.scannerVersion).toBe('0.34.2')
  })

  // O scanner consulta a cadeia por conta própria. Sem dizer por onde, ele vai
  // ao explorador público padrão dele — e os endereços da carteira ficam
  // expostos a um segundo observador que o usuário nunca escolheu.
  it('consulta pelo mesmo backend que vigia a carteira', async () => {
    const runner = runnerQueGrava()
    await scanWallet({ ...base, runner })
    expect(runner.args).toContain('--api')
    expect(runner.args[runner.args.indexOf('--api') + 1]).toBe('http://meu-esplora:3002')
  })

  it('diz ao scanner qual rede vigiar', async () => {
    const runner = runnerQueGrava()
    await scanWallet({ ...base, runner })
    expect(runner.args[runner.args.indexOf('--network') + 1]).toBe('signet')
  })

  it('manda o descriptor, e não a chave crua', async () => {
    const runner = runnerQueGrava()
    await scanWallet({ ...base, runner })
    expect(runner.args).toContain(`wpkh(${XPUB})`)
    expect(runner.args).not.toContain(XPUB)
  })

  // A saída traz uma URL de site de terceiro com o xpub embutido. Guardar ou
  // exibir isso seria convidar o usuário a colar a chave dele lá.
  it('descarta o link que carrega o xpub para fora', async () => {
    const scan = await scanWallet({ ...base, runner: runnerQueGrava() })
    expect(JSON.stringify(scan)).not.toContain('am-i.exposed')
  })

  it('falha com mensagem acionável quando o scanner não está instalado', async () => {
    const quebrado: ScanRunner = async () => {
      throw new Error('spawn am-i-exposed ENOENT')
    }
    await expect(scanWallet({ ...base, runner: quebrado })).rejects.toThrow(/am-i-exposed/)
  })

  it('falha em vez de inventar quando a saída não é o JSON esperado', async () => {
    const lixo: ScanRunner = async () => 'nem json é'
    await expect(scanWallet({ ...base, runner: lixo })).rejects.toThrow(/scanner/i)
  })
})
