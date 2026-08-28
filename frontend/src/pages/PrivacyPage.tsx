import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  mensagemDoErro,
  type AddressPrivacyReport,
  type Alert,
  type PrivacyReport,
  type Utxo,
  type Wallet,
  type WalletAddress,
} from '../lib/api'
import { formatDateTime, formatSats } from '../lib/format'
import { render } from '../lib/i18n'
import { Identificador } from '../components/ui/Identificador'
import { Button } from '../components/ui/Button'
import { useDadosDoPainel } from './Layout'

const caixa = 'rounded-lg border border-line bg-surface p-5'
const campo = 'rounded border border-line bg-bg px-3 py-2 text-sm'
const rotulo = 'text-xs font-semibold uppercase tracking-label text-faint'

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function porSeveridade(alerts: Alert[]) {
  return alerts.reduce<Record<string, number>>((acc, a) => {
    acc[a.severity] = (acc[a.severity] ?? 0) + 1
    return acc
  }, {})
}

function scoreMedio(relatorios: Record<number, PrivacyReport | null>): number | null {
  const scores = Object.values(relatorios)
    .map(r => r?.latest?.score)
    .filter((v): v is number => typeof v === 'number')
  if (scores.length === 0) return null
  return Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
}

function reusoMedido(relatorios: Record<number, PrivacyReport | null>) {
  return Object.values(relatorios).reduce(
    (acc, r) => ({
      active: acc.active + (r?.measured?.activeAddresses ?? 0),
      reused: acc.reused + (r?.measured?.reusedAddresses ?? 0),
    }),
    { active: 0, reused: 0 },
  )
}

function dustDos(utxos: Record<number, Utxo[]>) {
  return Object.values(utxos).flat().filter(u => u.valueSats < 1_000).length
}

function enderecosDaCarteira(
  addresses: Record<number, WalletAddress[]>,
  walletId: number,
): WalletAddress[] {
  return addresses[walletId] ?? []
}

function AddressPrivacyDetail({
  report,
  catalog,
  lang,
}: {
  report: AddressPrivacyReport
  catalog: Record<string, string>
  lang: 'pt' | 'en'
}) {
  if (report.error) {
    return <p className="font-prose text-sm text-muted">{report.error}</p>
  }
  if (!report.latest) {
    return (
      <p className="font-prose text-sm text-muted">
        {render(catalog, 'privacy.addressUnknown', {}, lang)}
      </p>
    )
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm">
        {render(
          catalog,
          'privacy.addressScore',
          { score: report.latest.score, grade: report.latest.grade },
          lang,
        )}
      </p>
      <ul className="grid gap-2">
        {report.latest.findings.map(f => (
          <li key={f.id} className="border-l-2 border-line pl-3">
            <p className="text-sm font-medium">{f.title}</p>
            <p className="font-prose text-sm text-muted">{f.description}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PrivacyPage() {
  const { catalog, lang, wallets, carregado } = useDadosDoPainel()
  const [walletId, setWalletId] = useState<number | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [relatorios, setRelatorios] = useState<Record<number, PrivacyReport | null>>({})
  const [utxos, setUtxos] = useState<Record<number, Utxo[]>>({})
  const [addresses, setAddresses] = useState<Record<number, WalletAddress[]>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [addressAberto, setAddressAberto] = useState<WalletAddress | null>(null)
  const [detalhe, setDetalhe] = useState<AddressPrivacyReport | null>(null)

  useEffect(() => {
    if (walletId !== null || wallets.length === 0) return
    setWalletId(wallets[0]!.id)
  }, [walletId, wallets])

  const carregar = useCallback(async () => {
    if (wallets.length === 0) return
    setErro(null)
    try {
      const [pagina, relatoriosPares, utxosPares, enderecosPares] = await Promise.all([
        api.alerts({ limit: 100 }),
        Promise.all(wallets.map(async w => [w.id, await api.privacy(w.id).catch(() => null)] as const)),
        Promise.all(wallets.map(async w => [w.id, await api.utxos(w.id).catch(() => [])] as const)),
        Promise.all(wallets.map(async w => [w.id, await api.addresses(w.id).catch(() => [])] as const)),
      ])
      setAlerts(pagina.items)
      setRelatorios(Object.fromEntries(relatoriosPares))
      setUtxos(Object.fromEntries(utxosPares))
      setAddresses(Object.fromEntries(enderecosPares))
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    }
  }, [catalog, lang, wallets])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const carteira = useMemo<Wallet | null>(
    () => wallets.find(w => w.id === walletId) ?? wallets[0] ?? null,
    [walletId, wallets],
  )
  const severidades = porSeveridade(alerts)
  const score = scoreMedio(relatorios)
  const reuso = reusoMedido(relatorios)
  const todosUtxos = Object.values(utxos).flat()
  const listaEnderecos = carteira ? enderecosDaCarteira(addresses, carteira.id) : []

  async function abrirEndereco(address: WalletAddress): Promise<void> {
    if (!carteira) return
    setAddressAberto(address)
    setDetalhe(null)
    setDetalhe(await api.addressPrivacy(carteira.id, address.id).catch(err => ({
      latest: null,
      running: false,
      error: mensagemDoErro(catalog, err, lang),
    })))
  }

  return (
    <div className="grid gap-5 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={rotulo}>{render(catalog, 'privacy.pageTitle', {}, lang)}</h2>
          <p className="mt-1 font-prose text-sm text-muted">
            {render(catalog, 'privacy.pageNote', {}, lang)}
          </p>
        </div>
        {carteira && (
          <select
            aria-label={render(catalog, 'privacy.walletSelect', {}, lang)}
            className={campo}
            value={carteira.id}
            onChange={e => setWalletId(Number(e.target.value))}
          >
            {wallets.map(w => (
              <option key={w.id} value={w.id}>{w.label}</option>
            ))}
          </select>
        )}
      </div>

      {erro && <p role="alert" className="font-prose text-sm text-muted">{erro}</p>}
      {carregado && wallets.length === 0 && (
        <p className="font-prose text-sm text-muted">
          {render(catalog, 'wallets.empty', {}, lang)}
        </p>
      )}

      {wallets.length > 0 && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className={caixa}>
              <p className={rotulo}>{render(catalog, 'privacy.generalScore', {}, lang)}</p>
              <p className="mt-2 text-2xl font-medium">{score ?? '---'}</p>
            </div>
            <div className={caixa}>
              <p className={rotulo}>{render(catalog, 'privacy.generalAlerts', {}, lang)}</p>
              <p className="mt-2 text-sm">
                {['critical', 'warning', 'info'].map(s => `${render(catalog, 'severity.' + s, {}, lang)} ${severidades[s] ?? 0}`).join(' · ')}
              </p>
            </div>
            <div className={caixa}>
              <p className={rotulo}>{render(catalog, 'privacy.chartReuse', {}, lang)}</p>
              <p className="mt-2 text-sm">
                {render(catalog, 'privacy.reusedAddresses', { reused: reuso.reused, total: reuso.active }, lang)}
              </p>
            </div>
            <div className={caixa}>
              <p className={rotulo}>{render(catalog, 'privacy.chartUtxos', {}, lang)}</p>
              <p className="mt-2 text-2xl font-medium">{todosUtxos.length}</p>
            </div>
            <div className={caixa}>
              <p className={rotulo}>dust</p>
              <p className="mt-2 text-2xl font-medium">{dustDos(utxos)}</p>
            </div>
          </section>

          {carteira && (
            <section className={caixa}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{carteira.label}</h3>
                  <p className="text-xs text-faint">
                    {host(carteira.backendUrl)} · {carteira.network}
                  </p>
                </div>
                <p className="text-sm text-muted">
                  {formatSats(Number(carteira.balanceSats), lang)} · {carteira.utxoCount} UTXOs
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-label text-faint">
                      <th className="py-2 pr-4">{render(catalog, 'privacy.address', {}, lang)}</th>
                      <th className="py-2 pr-4">{render(catalog, 'privacy.path', {}, lang)}</th>
                      <th className="py-2 pr-4">{render(catalog, 'privacy.balance', {}, lang)}</th>
                      <th className="py-2 pr-4">{render(catalog, 'privacy.addressScoreShort', {}, lang)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaEnderecos.map(a => (
                      <tr key={a.id} className="border-b border-line">
                        <td className="py-3 pr-4">
                          <Button variant="ghost" onClick={() => void abrirEndereco(a)}>
                            {a.address}
                          </Button>
                        </td>
                        <td className="py-3 pr-4 text-faint">{a.derivationPath}</td>
                        <td className="py-3 pr-4">{formatSats(Number(a.balanceSats), lang)}</td>
                        <td className="py-3 pr-4">
                          {a.privacyScore === null ? '---' : `${a.privacyScore}/100 · ${a.privacyGrade}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {listaEnderecos.length === 0 && (
                <p className="font-prose text-sm text-muted">
                  {render(catalog, 'privacy.noAddresses', {}, lang)}
                </p>
              )}
            </section>
          )}

          {addressAberto && (
            <section className={caixa}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">
                    {render(catalog, 'privacy.addressDetail', {}, lang)}
                  </h3>
                  <Identificador valor={addressAberto.address} catalog={catalog} lang={lang} />
                </div>
                {addressAberto.privacyScannedAt && (
                  <time className="text-xs text-faint" dateTime={addressAberto.privacyScannedAt}>
                    {formatDateTime(addressAberto.privacyScannedAt, lang)}
                  </time>
                )}
              </div>
              {detalhe ? (
                <AddressPrivacyDetail report={detalhe} catalog={catalog} lang={lang} />
              ) : (
                <p className="text-sm text-faint">{render(catalog, 'wallets.loading', {}, lang)}</p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
