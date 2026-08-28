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
const caixaDoGrafico = 'rounded-lg border border-line bg-surface p-4'
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

/**
 * O que o watchtower mediu sozinho, sem scanner e sem sair para a rede.
 *
 * ── Por que isto é um componente separado ─────────────────────────────────
 * Estes dois gráficos saem de dados que a aplicação já tem: o histograma vem
 * dos UTXOs que ela sincronizou pela fonte de cadeia da carteira, e o reuso vem
 * do log de eventos dela mesma. Nenhum dos dois precisa do `am-i-exposed`.
 *
 * Estavam, porém, dentro do bloco que só aparece **depois** de uma varredura.
 * O efeito, medido em 28/08 numa carteira vigiada por Fulcrum: 32 UTXOs e dois
 * alertas de address reuse no banco, e a tela dizendo "privacidade ainda não
 * analisada" e mais nada. Quem vigia pelo próprio servidor via a tela afirmar
 * que não sabia o que ela já tinha medido, e a única saída oferecida era
 * entregar os endereços a um explorador público.
 *
 * O scanner continua sendo o que acrescenta o que só ele tem: base de
 * entidades, heurísticas de transação e Boltzmann. O que a casa mediu aparece
 * antes disso, e sem pedir nada a ninguém.
 */
function GraficosMedidosAqui({
  utxos,
  medido,
  reserva,
  catalog,
  lang,
}: {
  utxos: Utxo[]
  medido: PrivacyReport['measured']
  /**
   * O que o scanner informou, usado só quando `measured` não veio.
   *
   * Instância antiga que ainda não manda `measured` não fica sem barra. Sem
   * varredura nenhuma não há reserva, e aí o número é o do próprio watchtower
   * ou não há número.
   */
  reserva?: { ativos: number; reusados: number }
  catalog: Catalog
  lang: Lang
}) {
  const bins = histogramaUtxos(utxos)
  const maiorBin = Math.max(1, ...bins.map(b => b.count))
  /*
   * Primeira mão ganha de segunda.
   *
   * O reuso vinha de `walletInfo`, que é o que o **scanner** viu. Em 28/08 o
   * scanner devolveu tudo zero, nem chegava a consultar a cadeia, e a barra
   * mostrou "0 de 0" numa carteira que tinha reuso e dois alertas de address
   * reuse gerados pelo próprio watchtower.
   *
   * `measured` é o que a aplicação contou na cadeia que ela mesma sincronizou.
   */
  const ativos = medido?.activeAddresses ?? reserva?.ativos ?? 0
  const reusados = medido?.reusedAddresses ?? reserva?.reusados ?? 0
  const percentualReuso = ativos > 0 ? (reusados / ativos) * 100 : 0

  return (
    <div className="grid gap-4 md:grid-cols-2">
        <section className={caixaDoGrafico}>
          <span className={rotulo}>{render(catalog, 'privacy.chartUtxos', {}, lang)}</span>
          <div className="mt-2 grid h-24 grid-cols-5 items-end gap-1">
            {bins.map(bin => (
              <div key={bin.label} className="flex min-w-0 flex-col items-center gap-1">
                <div className="flex h-16 w-full items-end bg-raised">
                  <div
                    className="w-full"
                    style={{
                      height: largura((bin.count / maiorBin) * 100),
                      background: bin.dust ? 'var(--sb-critical)' : 'var(--sb-warning)',
                    }}
                  />
                </div>
                <span className="whitespace-nowrap text-[10px] leading-none text-faint">{bin.label}</span>
                <span className="text-xs">{bin.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={caixaDoGrafico}>
          <span className={rotulo}>{render(catalog, 'privacy.chartReuse', {}, lang)}</span>
          <div className="mt-2 h-3 overflow-hidden rounded-sm bg-raised">
            <div className="h-full bg-critical" style={{ width: largura(percentualReuso) }} />
          </div>
          <p className="mt-1 text-sm">
            {render(catalog, 'privacy.reusedAddresses', { reused: reusados, total: ativos }, lang)}
          </p>
        </section>

    </div>
  )
}

function PrivacyCharts({
  relatorio,
  history,
  utxos,
  medido,
  catalog,
  lang,
}: {
  relatorio: PrivacyLatest
  history: PrivacyReport['history']
  utxos: Utxo[]
  /** o que o watchtower contou na cadeia que ele mesmo sincronizou */
  medido: PrivacyReport['measured']
  catalog: Catalog
  lang: Lang
}) {
  const severidades = contagemPorSeveridade(relatorio.findings)
  const maiorSeveridade = Math.max(1, ...Object.values(severidades))
  const recorrentes = contrapartes(relatorio.findings)
  const maiorRecorrencia = Math.max(1, ...recorrentes.map(c => c.count))

  return (
    <div className="mt-3 border-t border-line pt-3">
      <GraficosMedidosAqui
        utxos={utxos}
        medido={medido}
        reserva={{
          ativos: numero(relatorio.walletInfo.activeAddresses) ?? 0,
          reusados: numero(relatorio.walletInfo.reusedAddresses) ?? 0,
        }}
        catalog={catalog}
        lang={lang}
      />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className={caixaDoGrafico}>
          <span className={rotulo}>{render(catalog, 'privacy.chartScore', {}, lang)}</span>
          <div
            className="mt-2 h-3 overflow-hidden rounded-sm bg-raised"
            aria-label={render(catalog, 'privacy.chartScore', {}, lang)}
          >
            <div className="h-full bg-warning" style={{ width: largura(relatorio.score) }} />
          </div>
          <p className="mt-1 text-sm">{relatorio.score}/100 · {relatorio.grade}</p>
        </section>

        <section className={caixaDoGrafico}>
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

        <section className={`${caixaDoGrafico} md:col-span-2`}>
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
          <section className={`${caixaDoGrafico} md:col-span-2`}>
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

      {/* A recusa com código é traduzida; a sem código cai no texto do
          servidor, que é pior que traduzido e muito melhor que a chave crua.
          `blindScan` é o caso que motivou isto: dizer "não consegui olhar" em
          vez de mostrar um score que não mediu nada. */}
      {aberto && relatorio?.error && (
        <p
          role="alert"
          data-error-code={relatorio.errorCode ?? undefined}
          className="mt-2 font-prose text-sm leading-relaxed"
          style={{ color: 'var(--sb-warning)' }}
        >
          {relatorio.errorCode && catalog['error.' + relatorio.errorCode]
            ? render(catalog, 'error.' + relatorio.errorCode, {}, lang)
            : relatorio.error}
        </p>
      )}

      {/* Sem varredura, a tela mostrava só "privacidade ainda não analisada".
          Mas o watchtower já mediu o tamanho dos UTXOs e o reuso de endereço
          pela fonte de cadeia da própria carteira, e esconder isso até que um
          scanner de terceiro rode empurra quem vigia pelo próprio servidor para
          o explorador público. O que a casa mediu aparece primeiro. */}
      {aberto && !relatorio?.latest && utxos.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className={rotulo}>{render(catalog, 'privacy.measuredHere', {}, lang)}</p>
          <p className="mb-3 mt-1 font-prose text-sm leading-relaxed text-muted">
            {render(catalog, 'privacy.measuredHereNote', {}, lang)}
          </p>
          <GraficosMedidosAqui
            utxos={utxos}
            medido={relatorio?.measured}
            catalog={catalog}
            lang={lang}
          />
        </div>
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
            medido={relatorio.measured}
            catalog={catalog}
            lang={lang}
          />
        </>
      )}
    </div>
  )
}
