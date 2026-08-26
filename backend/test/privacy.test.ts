import { describe, expect, it } from 'vitest'
import {
  descriptorFor,
  mensagemDeFalha,
  scanTransaction,
  scanWallet,
  type ScanRunner,
} from '../src/privacy/scan'

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
    await expect(scanWallet({ ...base, runner: quebrado })).rejects.toThrow(/PATH/)
  })

  // A dica de instalação contradiz a causa quando o binário rodou e o
  // explorador é que não achou a transação. Conselho errado gruda mais que
  // conselho ausente: manda procurar no lugar errado.
  it('não manda conferir a instalação quando o scanner rodou e reclamou', async () => {
    const naoAchou: ScanRunner = async () => {
      throw new Error('Command failed · saída: {"error":true,"message":"Not found"}')
    }
    await expect(scanWallet({ ...base, runner: naoAchou })).rejects.toThrow(/Not found/)
    await expect(scanWallet({ ...base, runner: naoAchou })).rejects.not.toThrow(/PATH/)
  })

  it('falha em vez de inventar quando a saída não é o JSON esperado', async () => {
    const lixo: ScanRunner = async () => 'nem json é'
    await expect(scanWallet({ ...base, runner: lixo })).rejects.toThrow(/scanner/i)
  })
})

const SAIDA_TX = JSON.stringify({
  version: '0.34.2',
  network: 'signet',
  score: 8,
  grade: 'F',
  findings: [
    {
      id: 'entity-behavior-exchange',
      severity: 'low',
      confidence: 'medium',
      title: 'Exchange batch withdrawal pattern detected',
      description: 'd',
      recommendation: 'r',
      scoreImpact: 0,
      params: { type: 'exchange-batch' },
    },
  ],
  links: { analysis: 'https://am-i.exposed/#tx=abc' },
})

describe('scanTransaction', () => {
  const TXID = 'ab'.repeat(32)
  const base = {
    txid: TXID,
    network: 'signet' as const,
    backendUrl: 'http://meu-esplora:3002',
  }

  it('lê os achados da transação', async () => {
    const scan = await scanTransaction({ ...base, runner: async () => SAIDA_TX })
    expect(scan.findings).toHaveLength(1)
    expect(scan.findings[0]!.id).toBe('entity-behavior-exchange')
    expect(scan.scannerVersion).toBe('0.34.2')
  })

  it('pede a análise da transação, e não da carteira', async () => {
    let recebidos: string[] = []
    await scanTransaction({
      ...base,
      runner: async args => {
        recebidos = args
        return SAIDA_TX
      },
    })
    expect(recebidos).toContain('scan')
    expect(recebidos).toContain('tx')
    expect(recebidos).toContain(TXID)
  })

  // Mesma razão da varredura de carteira: sem dizer por onde consultar, o
  // scanner vai ao explorador público dele e expõe a transação a mais um
  // observador.
  it('consulta pelo mesmo backend que vigia a carteira', async () => {
    let recebidos: string[] = []
    await scanTransaction({
      ...base,
      runner: async args => {
        recebidos = args
        return SAIDA_TX
      },
    })
    expect(recebidos[recebidos.indexOf('--api') + 1]).toBe('http://meu-esplora:3002')
    expect(recebidos[recebidos.indexOf('--network') + 1]).toBe('signet')
  })

  it('descarta o link que carrega a transação para fora', async () => {
    const scan = await scanTransaction({ ...base, runner: async () => SAIDA_TX })
    expect(JSON.stringify(scan)).not.toContain('am-i.exposed')
  })

  it('falha em vez de inventar quando a saída não é o JSON esperado', async () => {
    await expect(
      scanTransaction({ ...base, runner: async () => 'nem json é' }),
    ).rejects.toThrow(/scanner/i)
  })
})

describe('mensagemDeFalha', () => {
  // `Command failed: am-i-exposed ...` foi o que o log registrou quando três
  // análises falharam contra a signet, e não dizia nada: a causa real, "Not
  // found", estava na saída do processo, que o Error do execFile guarda em
  // campo separado. Sem trazê-la, diagnosticar exigiu rodar o comando à mão.
  it('traz a saída do processo, e não só o comando que falhou', () => {
    const erro = Object.assign(new Error('Command failed: am-i-exposed scan tx abc'), {
      stdout: '{"error":true,"message":"Not found"}',
      stderr: '',
    })
    expect(mensagemDeFalha(erro)).toContain('Not found')
  })

  it('traz o stderr quando é ali que o processo reclamou', () => {
    const erro = Object.assign(new Error('Command failed'), {
      stdout: '',
      stderr: 'permissão negada',
    })
    expect(mensagemDeFalha(erro)).toContain('permissão negada')
  })

  it('se vira com erro que não veio de processo nenhum', () => {
    expect(mensagemDeFalha(new Error('sem rede'))).toContain('sem rede')
  })

  it('não deixa a mensagem crescer sem limite com a saída inteira', () => {
    const erro = Object.assign(new Error('Command failed'), {
      stdout: 'x'.repeat(5000),
      stderr: '',
    })
    expect(mensagemDeFalha(erro).length).toBeLessThan(700)
  })
})
