import { useCallback, useEffect, useState } from 'react'
import { api, type Alert, type Backend, type Catalog, type Lang, type Wallet } from '../lib/api'
import { AlertFeed } from '../components/AlertFeed'
import { AddWallet } from '../components/AddWallet'
import { WalletCard } from '../components/WalletCard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { AlertDetail } from '../components/AlertDetail'
import { Channels } from '../components/Channels'
import { Search } from '../components/Search'
import { Mercado } from '../components/Mercado'
import { render } from '../lib/i18n'
import { Button } from '../components/ui/Button'

/**
 * Só entra no total a carteira cujo saldo já é conhecido.
 *
 * Zerar o total durante uma reconferência faria o painel anunciar saldo zero
 * para quem tem fundos — o estado é "reconferindo", não "não sei".
 *
 * `syncHeight` é o que separa os dois casos: só existe depois da primeira
 * sincronização completa. Sem ele, o dado realmente não existe ainda, e aí
 * somar zero é honesto.
 */
function contabilizadas(wallets: Wallet[]): Wallet[] {
  return wallets.filter(w => w.syncHeight !== null)
}

function hostDaFonte(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * O painel: saldo, carteiras e feed.
 *
 * Não desenha a casca. Listra, selo, cabeçalho e navegação moram no `Layout`,
 * onde toda rota os herda — uma tela que montasse a própria casca poderia
 * esquecer o aviso de privacidade, que é o princípio 2 do projeto.
 */
export function Dashboard({
  catalog,
  lang,
}: {
  catalog: Catalog
  lang: Lang
}) {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [abrindoForm, setAbrindoForm] = useState(false)
  // As arquivadas moram numa lista à parte e só são buscadas quando alguém
  // pede: fora da tela, fora do total, e fora do worker.
  const [arquivadas, setArquivadas] = useState<Wallet[]>([])
  const [vendoArquivadas, setVendoArquivadas] = useState(false)
  const [paraApagar, setParaApagar] = useState<Wallet | null>(null)
  // As fontes cadastradas, para o cartão poder oferecer a troca sem cada um
  // consultar por conta própria.
  const [fontes, setFontes] = useState<Backend[]>([])
  const [alertaAberto, setAlertaAberto] = useState<Alert | null>(null)
  // A ponta real da cadeia, perguntada à mesma fonte que a carteira usa. O
  // rodapé mostrava a maior `sync_height` entre as carteiras como se fosse a
  // ponta: com o worker atrasado, anunciava altura velha como atual.
  const [ponta, setPonta] = useState<number | null>(null)
  const [carregado, setCarregado] = useState(false)

  const recarregar = useCallback(async () => {
    const [w, a] = await Promise.all([api.wallets(), api.alerts()])
    setWallets(w)
    // A primeira página chega inteira; o que já estava carregado abaixo dela
    // continua na tela. Sem esta costura, um alerta novo pelo SSE apagaria as
    // páginas que o usuário pediu para ver.
    setAlerts(anteriores => {
      const vistos = new Set(a.items.map(x => x.id))
      return [...a.items, ...anteriores.filter(x => !vistos.has(x.id))]
    })
    setCursor(anterior => anterior ?? a.nextCursor)
    setCarregado(true)
  }, [])

  const carregarMais = useCallback(async () => {
    if (!cursor) return
    const pagina = await api.alerts({ cursor })
    setAlerts(anteriores => {
      const vistos = new Set(anteriores.map(x => x.id))
      return [...anteriores, ...pagina.items.filter(x => !vistos.has(x.id))]
    })
    setCursor(pagina.nextCursor)
  }, [cursor])

  useEffect(() => {
    void api
      .backends()
      .then(setFontes)
      .catch(() => setFontes([]))
  }, [])

  useEffect(() => {
    void api
      .chainTip()
      .then(t => setPonta(t.height))
      .catch(() => setPonta(null))
  }, [])

  const recarregarArquivadas = useCallback(async () => {
    setArquivadas(await api.wallets(true))
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  // A análise de privacidade demora mais de um minuto e termina no servidor,
  // sem avisar ninguém. Enquanto alguma estiver correndo, a tela reconsulta —
  // e para assim que a última termina, em vez de ficar batendo para sempre.
  const analisando = wallets.some(w => w.privacyScanning)
  useEffect(() => {
    if (!analisando) return
    const timer = setInterval(() => void recarregar(), 4000)
    return () => clearInterval(timer)
  }, [analisando, recarregar])

  // O alerta aparece sozinho: o feed é empurrado pelo servidor, sem polling.
  useEffect(() => {
    const source = new EventSource('/api/stream', { withCredentials: true })
    source.addEventListener('alert', () => void recarregar())
    return () => source.close()
  }, [recarregar])

  const somadas = contabilizadas(wallets)
  const totaisPorRede = somadas.reduce<Record<string, { sats: number; utxos: number; congelados: number }>>(
    (porRede, w) => {
      const atual = porRede[w.network] ?? { sats: 0, utxos: 0, congelados: 0 }
      porRede[w.network] = {
        sats: atual.sats + Number(w.balanceSats),
        utxos: atual.utxos + w.utxoCount,
        congelados: atual.congelados + w.frozenCount,
      }
      return porRede
    },
    {},
  )
  const redesOrdenadas = ['mainnet', 'signet', 'testnet'].filter(r => totaisPorRede[r])
  const utxos = somadas.reduce((soma, w) => soma + w.utxoCount, 0)
  const congelados = somadas.reduce((soma, w) => soma + w.frozenCount, 0)
  const altura = wallets.reduce<number | null>(
    (maior, w) => (w.syncHeight !== null && (maior === null || w.syncHeight > maior) ? w.syncHeight : maior),
    null,
  )

  // Só depois de carregar: enquanto o fetch corre, `wallets` também está
  // vazio, e piscar o formulário seria pior que não tê-lo.
  const semCarteira = carregado && wallets.length === 0

  const separador = <span style={{ color: 'var(--sb-border)' }}>|</span>

  return (
    <>
      {/* O peso das duas colunas é o inverso do que era: à esquerda saldo,
          carteiras, busca, canais e cartões; à direita uma lista. A esquerda
          cresce com a janela, o feed fica em 360px. */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* o que você vigia */}
        <aside className="flex flex-col gap-5 border-b border-line px-4 py-6 sm:px-7 lg:border-b-0 lg:border-r">
          {semCarteira && (
            <section>
              <h2 className="mb-[10px] text-xs font-semibold uppercase tracking-label text-faint">
                {render(catalog, 'wallets.title', {}, lang)}
              </h2>
              <p className="mb-2 text-sm">{render(catalog, 'wallets.empty', {}, lang)}</p>
              <p className="font-prose text-sm leading-relaxed text-muted">
                {render(catalog, 'wallets.emptyHint', {}, lang)}
              </p>
              <ol className="mt-4 grid gap-2 text-sm">
                <li className="rounded border border-line bg-surface px-3 py-2">
                  <span className="mr-2 text-xs font-semibold text-faint">1.</span>
                  {render(catalog, 'onboarding.stepSource', {}, lang)}
                </li>
                <li className="rounded border border-line bg-surface px-3 py-2">
                  <span className="mr-2 text-xs font-semibold text-faint">2.</span>
                  {render(catalog, 'onboarding.stepWallet', {}, lang)}
                </li>
              </ol>
            </section>
          )}

          {!semCarteira && (
          <section>
            <h2 className="mb-[10px] text-xs font-semibold uppercase tracking-label text-faint">
              {render(catalog, 'balance.total', {}, lang)}
            </h2>
            {redesOrdenadas.map(rede => {
              const totalDaRede = totaisPorRede[rede]!
              const nomeDaRede = render(catalog, 'network.' + rede, {}, lang)
              return (
                <div key={rede} className="mb-3">
                  <h2 className="mb-[10px] text-xs font-semibold uppercase tracking-label text-faint">
                    {render(catalog, 'balance.totalByNetwork', { network: nomeDaRede }, lang)}
                  </h2>
                  <p className="flex items-baseline gap-[9px]">
                    <span className="text-2xl font-medium tracking-tight">
                      {totalDaRede.sats.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US')}
                    </span>
                    <span className="text-sm text-muted">sats</span>
                  </p>
                </div>
              )
            })}
            <p className="flex flex-wrap items-center gap-[10px] text-xs text-muted">
              <span>{render(catalog, 'balance.wallets', { n: wallets.length }, lang)}</span>
              {separador}
              <span>{render(catalog, 'balance.utxos', { n: utxos }, lang)}</span>
              {congelados > 0 && (
                <>
                  {separador}
                  <span style={{ color: 'var(--sb-critical)' }}>
                    {render(catalog, 'balance.frozen', { n: congelados }, lang)}
                  </span>
                </>
              )}
            </p>
          </section>
          )}

          {!semCarteira && (
            <Mercado catalog={catalog} lang={lang} />
          )}

          {!semCarteira && (
            <>
              <div className="h-px bg-line" />

              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-label text-faint">
                  {render(catalog, 'wallets.title', {}, lang)}
                </h2>
                <Button onClick={() => setAbrindoForm(v => !v)} aria-expanded={abrindoForm}>
                  {render(catalog, 'wallets.add', {}, lang)}
                </Button>
              </div>
            </>
          )}

          {(abrindoForm || semCarteira) && (
            <AddWallet
              catalog={catalog}
              lang={lang}
              onAdded={() => {
                setAbrindoForm(false)
                void recarregar()
              }}
            />
          )}

          {!semCarteira && (
            <>
              <div className="h-px bg-line" />
              <Search catalog={catalog} lang={lang} />
              <div className="h-px bg-line" />
              <Channels catalog={catalog} lang={lang} />
            </>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            {wallets.map(w => (
              <WalletCard
                key={w.id}
                wallet={w}
                catalog={catalog}
                lang={lang}
                onScan={() => api.scanPrivacy(w.id).then(recarregar)}
                onArchive={() =>
                  void api
                    .archiveWallet(w.id)
                    .then(() => Promise.all([recarregar(), recarregarArquivadas()]))
                }
                backends={fontes.filter(f => f.network === w.network)}
                onChangeBackend={id =>
                  void api.changeWalletBackend(w.id, id).then(recarregar)
                }
              />
            ))}
          </div>

          {!semCarteira && (
            <div>
              <Button
                variant="ghost"
                aria-expanded={vendoArquivadas}
                onClick={() => {
                  setVendoArquivadas(v => !v)
                  void recarregarArquivadas()
                }}
              >
                {render(catalog, 'wallets.archivedToggle', {}, lang)}
              </Button>

              {vendoArquivadas && (
                <div className="mt-3 grid gap-5 xl:grid-cols-2">
                  {arquivadas.length === 0 ? (
                    <p className="font-prose text-sm text-faint">
                      {render(catalog, 'wallets.archivedEmpty', {}, lang)}
                    </p>
                  ) : (
                    arquivadas.map(w => (
                      <WalletCard
                        key={w.id}
                        wallet={w}
                        catalog={catalog}
                        lang={lang}
                        onUnarchive={() =>
                          void api
                            .unarchiveWallet(w.id)
                            .then(() => Promise.all([recarregar(), recarregarArquivadas()]))
                        }
                        onDelete={() => setParaApagar(w)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {paraApagar && (
            <ConfirmDialog
              label={paraApagar.label}
              catalog={catalog}
              lang={lang}
              onCancel={() => setParaApagar(null)}
              onConfirm={confirmado =>
                void api
                  .removeWallet(paraApagar.id, confirmado)
                  .then(() => {
                    setParaApagar(null)
                    return Promise.all([recarregar(), recarregarArquivadas()])
                  })
                  .catch(() => setParaApagar(null))
              }
            />
          )}
        </aside>

        {/* o que ele viu */}
        <section className="flex flex-col gap-[14px] px-4 py-6 sm:px-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-label text-faint">
              {render(catalog, 'feed.title', {}, lang)}
            </h2>
            <span className="text-xs uppercase tracking-label text-faint">
              {render(catalog, 'feed.live', {}, lang)}
            </span>
          </div>

          <AlertFeed
            alerts={alerts}
            catalog={catalog}
            lang={lang}
            walletLabels={Object.fromEntries(wallets.map(w => [w.id, w.label]))}
            temMais={cursor !== null}
            onLoadMore={() => void carregarMais()}
            onSelect={setAlertaAberto}
          />

          {alertaAberto && (
            <AlertDetail
              alertId={alertaAberto.id}
              // o aviso do detalhe nomeia quem vai saber da consulta: a fonte
              // da carteira daquele alerta, e não a da primeira da lista
              fonte={hostDaFonte(
                wallets.find(w => w.id === alertaAberto.walletId)?.backendUrl ?? '',
              )}
              catalog={catalog}
              lang={lang}
              onClose={() => setAlertaAberto(null)}
            />
          )}

          {/* Quando a carteira está atrás da ponta, a tela mostra as duas: um
              número só esconderia que o worker ainda não chegou lá. */}
          {(ponta !== null || altura !== null) && (
            <p className="pt-1 text-xs text-faint">
              {ponta !== null && altura !== null && altura < ponta
                ? render(catalog, 'feed.tipBehind', { height: ponta, wallet: altura }, lang)
                : render(catalog, 'feed.tip', { height: ponta ?? altura }, lang)}
            </p>
          )}
        </section>
      </div>
    </>
  )
}
