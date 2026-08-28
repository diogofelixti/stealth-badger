import { useState } from 'react'
import {
  api,
  mensagemDoErro,
  type Catalog,
  type Lang,
  type PrivacyRecommendation,
  type PrivacyReport,
  type Utxo,
} from '../lib/api'
import { formatSats } from '../lib/format'
import { render } from '../lib/i18n'
import { Button } from './ui/Button'

const rotulo = 'text-xs uppercase tracking-label text-faint'
type PrivacyLatest = NonNullable<PrivacyReport['latest']>

/**
 * O scanner separa o achado que elogia do que acusa. Apagar essa diferença
 * pintaria tudo de alarme, e uma tela que só grita deixa de ser lida.
 */
function corDaSeveridade(severity: string): string {
  if (severity === 'good') return 'var(--sb-sovereign)'
  if (severity === 'high' || severity === 'critical') return 'var(--sb-critical)'
  return 'var(--sb-warning)'
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function ferramentas(recommendation: PrivacyRecommendation): { name: string; url: string }[] {
  if (typeof recommendation === 'string') return []
  return (recommendation.tools ?? [])
    .map(t => ({
      name: texto(t.name) ?? texto(t.title) ?? texto(t.url) ?? '',
      url: texto(t.url) ?? '',
    }))
    .filter(t => t.name && /^https?:\/\//i.test(t.url))
}

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function largura(percentual: number): string {
  return Math.max(0, Math.min(100, percentual)).toFixed(0) + '%'
}

function contagemPorSeveridade(findings: PrivacyLatest['findings']): Record<string, number> {
  return findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1
    return acc
  }, {})
}

function histogramaUtxos(utxos: Utxo[]): { label: string; count: number; dust: boolean }[] {
  return [
    { label: '<1k', count: utxos.filter(u => u.valueSats < 1_000).length, dust: true },
    { label: '1k-10k', count: utxos.filter(u => u.valueSats >= 1_000 && u.valueSats < 10_000).length, dust: false },
    { label: '10k-100k', count: utxos.filter(u => u.valueSats >= 10_000 && u.valueSats < 100_000).length, dust: false },
    { label: '100k-1M', count: utxos.filter(u => u.valueSats >= 100_000 && u.valueSats < 1_000_000).length, dust: false },
    { label: '>=1M', count: utxos.filter(u => u.valueSats >= 1_000_000).length, dust: false },
  ]
}

function contrapartes(findings: PrivacyLatest['findings']): { label: string; count: number }[] {
  return findings
    .map(f => ({
      label: f.title,
      count:
        numero(f.params?.recurringCount) ??
        numero(f.params?.counterparties) ??
        numero(f.params?.repeatedCounterparties) ??
        0,
    }))
    .filter(f => f.count > 0)
    .slice(0, 5)
}

export function RecommendationView({ recommendation }: { recommendation: PrivacyRecommendation }) {
  if (typeof recommendation === 'string') {
    return (
      <p className="font-prose text-sm leading-relaxed text-faint">
        {recommendation}
      </p>
    )
  }

  const urgencia = texto(recommendation.urgency)
  const titulo = texto(recommendation.headline) ?? texto(recommendation.title)
  const corpo =
    texto(recommendation.text) ??
    texto(recommendation.detail) ??
    texto(recommendation.action)
  const links = ferramentas(recommendation)

  return (
    <div className="mt-1 font-prose text-sm leading-relaxed text-faint">
      {urgencia && (
        <p className="text-xs font-semibold uppercase tracking-label">
          {urgencia}
        </p>
      )}
      {titulo && <p className="font-medium text-muted">{titulo}</p>}
      {corpo && <p>{corpo}</p>}
      {links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {links.map(link => (
            <Button
              key={link.url}
              as="a"
              href={link.url}
              target="_blank"
              rel="noreferrer"
              variant="ghost"
            >
              {link.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function PrivacyCharts({
  relatorio,
  history,
  utxos,
  catalog,
  lang,
}: {
  relatorio: PrivacyLatest
  history: PrivacyReport['history']
  utxos: Utxo[]
  catalog: Catalog
  lang: Lang
}) {
  const severidades = contagemPorSeveridade(relatorio.findings)
  const maiorSeveridade = Math.max(1, ...Object.values(severidades))
  const bins = histogramaUtxos(utxos)
  const maiorBin = Math.max(1, ...bins.map(b => b.count))
  const ativos = numero(relatorio.walletInfo.activeAddresses) ?? 0
  const reusados = numero(relatorio.walletInfo.reusedAddresses) ?? 0
  const percentualReuso = ativos > 0 ? (reusados / ativos) * 100 : 0
  const recorrentes = contrapartes(relatorio.findings)
  const maiorRecorrencia = Math.max(1, ...recorrentes.map(c => c.count))

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <span className={rotulo}>{render(catalog, 'privacy.chartScore', {}, lang)}</span>
          <div
            className="mt-2 h-3 overflow-hidden rounded-sm bg-raised"
            aria-label={render(catalog, 'privacy.chartScore', {}, lang)}
          >
            <div className="h-full bg-warning" style={{ width: largura(relatorio.score) }} />
          </div>
          <p className="mt-1 text-sm">{relatorio.score}/100 · {relatorio.grade}</p>
        </section>

        <section>
          <span className={rotulo}>{render(catalog, 'privacy.chartSeverity', {}, lang)}</span>
          <div className="mt-2 flex flex-col gap-1">
            {Object.entries(severidades).map(([severity, count]) => (
              <div key={severity} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-xs">
                <span>{severity}</span>
                <div className="h-2 bg-raised">
                  <div
                    className="h-full"
                    style={{
                      width: largura((count / maiorSeveridade) * 100),
                      background: corDaSeveridade(severity),
                    }}
                  />
                </div>
                <span className="text-right">{count}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <span className={rotulo}>{render(catalog, 'privacy.chartUtxos', {}, lang)}</span>
          <div className="mt-2 flex h-24 items-end gap-2">
            {bins.map(bin => (
              <div key={bin.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex h-16 w-full items-end bg-raised">
                  <div
                    className="w-full"
                    style={{
                      height: largura((bin.count / maiorBin) * 100),
                      background: bin.dust ? 'var(--sb-critical)' : 'var(--sb-warning)',
                    }}
                  />
                </div>
                <span className="text-xs text-faint">{bin.label}</span>
                <span className="text-xs">{bin.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <span className={rotulo}>{render(catalog, 'privacy.chartReuse', {}, lang)}</span>
          <div className="mt-2 h-3 overflow-hidden rounded-sm bg-raised">
            <div className="h-full bg-critical" style={{ width: largura(percentualReuso) }} />
          </div>
          <p className="mt-1 text-sm">
            {render(catalog, 'privacy.reusedAddresses', { reused: reusados, total: ativos }, lang)}
          </p>
        </section>

        <section className="md:col-span-2">
          <span className={rotulo}>{render(catalog, 'privacy.chartHistory', {}, lang)}</span>
          <div className="mt-2 flex h-24 items-end gap-1">
            {history.map((ponto, i) => (
              <div
                key={ponto.scannedAt + i}
                title={ponto.grade}
                className="w-4 bg-warning"
                style={{ height: Math.max(8, ponto.score).toString() + 'px' }}
              />
            ))}
          </div>
        </section>

        {recorrentes.length > 0 && (
          <section className="md:col-span-2">
            <span className={rotulo}>{render(catalog, 'privacy.chartCounterparties', {}, lang)}</span>
            <div className="mt-2 flex flex-col gap-1">
              {recorrentes.map(c => (
                <div key={c.label} className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate text-faint">{c.label}</p>
                    <div className="mt-1 h-2 bg-raised">
                      <div
                        className="h-full bg-warning"
                        style={{ width: largura((c.count / maiorRecorrencia) * 100) }}
                      />
                    </div>
                  </div>
                  <span className="text-right">{c.count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {utxos.length > 0 && (
          <p className="text-xs text-faint md:col-span-2">
            {render(
              catalog,
              'privacy.utxoTotal',
              { value: formatSats(utxos.reduce((s, u) => s + u.valueSats, 0), lang) },
              lang,
            )}
          </p>
        )}
      </div>
    </div>
  )
}

export function PrivacyPanel({
  walletId,
  catalog,
  lang,
}: {
  walletId: number
  catalog: Catalog
  lang: Lang
}) {
  const [aberto, setAberto] = useState(false)
  const [relatorio, setRelatorio] = useState<PrivacyReport | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [enderecos, setEnderecos] = useState<number | null>(null)
  const [analisandoEnderecos, setAnalisandoEnderecos] = useState(false)
  const [utxos, setUtxos] = useState<Utxo[]>([])

  async function abrir(): Promise<void> {
    setAberto(v => !v)
    // Busca só na primeira abertura: o relatório completo é caro de serializar
    // e ninguém pediu para vê-lo antes de clicar.
    if (relatorio || carregando) return
    setCarregando(true)
    try {
      const [proximoRelatorio, proximosUtxos] = await Promise.all([
        api.privacy(walletId),
        api.utxos(walletId).catch(() => []),
      ])
      setRelatorio(proximoRelatorio)
      setUtxos(proximosUtxos)
    } catch (err) {
      setRelatorio({
        latest: null,
        history: [],
        running: false,
        error: mensagemDoErro(catalog, err, lang),
      })
    } finally {
      setCarregando(false)
    }
  }

  async function analisarEnderecos(): Promise<void> {
    setAnalisandoEnderecos(true)
    try {
      const res = await api.scanUsedAddressPrivacy(walletId)
      setEnderecos(res.addresses)
    } finally {
      setAnalisandoEnderecos(false)
    }
  }

  return (
    <div className="mt-[10px]">
      <Button variant="ghost" onClick={() => void abrir()} aria-expanded={aberto}>
        {render(catalog, 'privacy.findings', {}, lang)}
      </Button>

      {aberto && relatorio?.error && (
        <p role="alert" className="mt-2 text-xs" style={{ color: 'var(--sb-critical)' }}>
          {relatorio.error}
        </p>
      )}

      {aberto && relatorio?.latest && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={analisandoEnderecos}
              onClick={() => void analisarEnderecos()}
            >
              {render(catalog, 'privacy.scanUsedAddresses', {}, lang)}
            </Button>
            {enderecos !== null && (
              <span className="text-xs text-faint">
                {render(catalog, 'privacy.addressScanQueued', { n: enderecos }, lang)}
              </span>
            )}
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {relatorio.latest.findings.map(f => (
              <li
                key={f.id}
                data-severity={f.severity}
                className="border-l-2 pl-[10px]"
                style={{ borderColor: corDaSeveridade(f.severity) }}
              >
                <p className="text-xs font-medium">{f.title}</p>
                <p className="font-prose text-sm leading-relaxed text-muted">{f.description}</p>
                <RecommendationView recommendation={f.recommendation} />
              </li>
            ))}
          </ul>
          <PrivacyCharts
            relatorio={relatorio.latest}
            history={relatorio.history}
            utxos={utxos}
            catalog={catalog}
            lang={lang}
          />
        </>
      )}
    </div>
  )
}
