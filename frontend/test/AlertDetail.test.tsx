import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Catalog } from '../src/lib/api'

const alertDetail = vi.fn()
const transaction = vi.fn()
const scanTxPrivacy = vi.fn()
const txPrivacy = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      alertDetail: (...a: unknown[]) => alertDetail(...a),
      transaction: (...a: unknown[]) => transaction(...a),
      scanTxPrivacy: (...a: unknown[]) => scanTxPrivacy(...a),
      txPrivacy: (...a: unknown[]) => txPrivacy(...a),
    },
  }
})

const { AlertDetail } = await import('../src/components/AlertDetail')

const TXID = 'ab'.repeat(32)

const CATALOGO: Catalog = {
  'alert.txid': 'Transação',
  'alert.confirmations': '{n} confirmações',
  'alert.inMempool': 'na mempool, ainda sem confirmação',
  'alert.height': 'Altura',
  'alert.blockHash': 'Hash do bloco',
  'alert.wallet': 'Carteira',
  'alert.siblings': 'Outros alertas desta transação',
  'alert.noEvent': 'Este alerta não veio de uma transação.',
  'alert.fetchOnChain': 'Buscar na cadeia',
  'alert.fetchNote': 'A consulta vai para {fonte}, que passa a saber que você procurou esta transação.',
  'alert.inputs': 'Entradas',
  'alert.outputs': 'Saídas',
  'alert.fee': 'fee de {value} sats',
  'alert.txPrivacy': 'Privacidade da transação',
  'alert.txPrivacyRunning': 'análise da transação em andamento...',
  'alert.txType': 'tipo',
  'alert.boltzmann': 'Matriz de Boltzmann',
  'alert.close': 'Fechar',
  'alert.copy': 'Copiar',
  'feed.funds_received.title': 'Fundos recebidos',
  'feed.funds_received.body': '{value} sats',
}

const DETALHE = {
  alert: {
    id: 7, walletId: 1, type: 'funds_received', severity: 'info' as const,
    params: { value: 51000 }, createdAt: '2026-08-27T10:00:00Z', readAt: null,
  },
  event: {
    id: 3, type: 'utxo_created', height: 195, blockHash: '000000abc',
    txid: TXID, vout: 3, payload: { value: 51000 },
  },
  wallet: { id: 1, label: 'Cofre', network: 'signet' },
  confirmations: 6,
  siblings: [],
}

beforeEach(() => {
  alertDetail.mockReset()
  transaction.mockReset()
  scanTxPrivacy.mockReset()
  txPrivacy.mockReset()
  alertDetail.mockResolvedValue(DETALHE)
  transaction.mockResolvedValue({ txid: TXID, height: 195, blockHash: '000000abc', vin: [], vout: [] })
  scanTxPrivacy.mockResolvedValue({ status: 'running' })
  txPrivacy.mockResolvedValue({
    latest: {
      txid: TXID,
      score: 0,
      grade: 'F',
      txType: 'simple-payment',
      txInfo: { changeRevealed: true },
      chainAnalysis: { reusedCounterparties: 12 },
      boltzmann: { matrix: [[1, 1], [1, 1]], entropy: 0 },
      findings: [
        {
          id: 'tx-change-revealed',
          severity: 'critical',
          confidence: 'deterministic',
          title: 'Troco revelado',
          description: 'Mesmo endereço na entrada e na saída.',
          recommendation: {
            urgency: 'alta',
            headline: 'Separe este troco',
            text: 'Não junte esta saída com fundos limpos.',
            tools: [{ name: 'Whirlpool', url: 'https://sparrowwallet.com/docs/mixing-whirlpool.html' }],
          },
          scoreImpact: -90,
          params: {},
        },
      ],
      scannerVersion: '0.34.2',
      scannedAt: '2026-08-27T10:01:00Z',
      error: null,
    },
    running: false,
    error: null,
  })
})

function montar() {
  render(
    <AlertDetail
      alertId={7}
      fonte="mempool.space"
      catalog={CATALOGO}
      lang="pt"
      onClose={() => {}}
    />,
  )
}

describe('AlertDetail', () => {
  it('mostra o txid inteiro, sem truncar', async () => {
    montar()

    await waitFor(() => expect(screen.getByText(TXID)).toBeDefined())
  })

  it('conta as confirmações', async () => {
    montar()

    await waitFor(() => expect(screen.getByText(/6 confirmações/)).toBeDefined())
  })

  // A regressão que ninguém veria: abrir o detalhe passando a consultar a
  // cadeia sozinho multiplica a exposição que o produto existe para denunciar.
  it('não consulta a cadeia enquanto ninguém pedir', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(TXID)).toBeDefined())

    expect(transaction).not.toHaveBeenCalled()
    expect(scanTxPrivacy).not.toHaveBeenCalled()
  })

  it('diz para onde a consulta vai, antes de ir', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(TXID)).toBeDefined())

    expect(screen.getByText(/mempool\.space, que passa a saber/)).toBeDefined()
  })

  it('busca na cadeia só quando o usuário clica', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(TXID)).toBeDefined())

    fireEvent.click(screen.getByText('Buscar na cadeia'))

    await waitFor(() => expect(transaction).toHaveBeenCalledWith(TXID, 1))
  })

  it('no mesmo clique dispara a análise profunda da transação', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(TXID)).toBeDefined())

    fireEvent.click(screen.getByText('Buscar na cadeia'))

    await waitFor(() => expect(scanTxPrivacy).toHaveBeenCalledWith(1, TXID))
    expect(txPrivacy).toHaveBeenCalledWith(1, TXID)
    expect(await screen.findByText('Privacidade da transação')).toBeDefined()
    expect(screen.getByText('0/100 · F')).toBeDefined()
    expect(screen.getByText(/simple-payment/)).toBeDefined()
    expect(screen.getByText('Matriz de Boltzmann')).toBeDefined()
    expect(screen.getAllByText('100')).toHaveLength(4)
    expect(screen.getByText('Troco revelado')).toBeDefined()
    expect(screen.getByText('Whirlpool')).toBeDefined()
  })

  it('alerta sem transação diz isso, em vez de mostrar campo vazio', async () => {
    alertDetail.mockResolvedValue({
      ...DETALHE,
      event: null,
      confirmations: null,
    })
    montar()

    await waitFor(() =>
      expect(screen.getByText(/não veio de uma transação/)).toBeDefined(),
    )
    expect(screen.queryByText('Buscar na cadeia')).toBeNull()
  })
})
