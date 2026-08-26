import { useCallback, useEffect, useState } from 'react'
import { api, type Alert, type Catalog, type Lang, type Me, type Wallet } from '../lib/api'
import { Shell } from '../components/Shell'
import { AlertFeed } from '../components/AlertFeed'
import { AddWallet } from '../components/AddWallet'
import { LangToggle } from '../components/LangToggle'
import { WalletCard } from '../components/WalletCard'
import { render } from '../lib/i18n'

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

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * A postura anunciada no topo vale para a sessão inteira.
 *
 * Com backend por carteira, ela deixa de ser "a postura da primeira carteira"
 * — que seria mentira assim que duas carteiras discordassem. O que o usuário
 * precisa saber é se existe exposição: **basta uma** carteira passando por
 * explorador público para que a resposta honesta seja pública.
 *
 * Quando mais de um explorador expõe, a linha conta quantos em vez de eleger
 * um deles, porque nomear só o primeiro esconderia os outros.
 */
function postura(
  wallets: Wallet[],
  catalog: Catalog,
  lang: Lang,
): { isPublic: boolean; host: string; label: string } | null {
  if (wallets.length === 0) return null

  const expostas = wallets.filter(w => w.backendIsPublic)
  const isPublic = expostas.length > 0
  const relevantes = isPublic ? expostas : wallets
  const hosts = [...new Set(relevantes.map(w => host(w.backendUrl)))]

  return {
    isPublic,
    host:
      hosts.length === 1
        ? hosts[0]!
        : render(catalog, 'privacy.severalHosts', { n: hosts.length }, lang),
    label: render(catalog, isPublic ? 'privacy.public' : 'privacy.sovereign', {}, lang),
  }
}

export function Dashboard({
  me,
  catalog,
  lang,
  onLang,
  onSaiu,
}: {
  me: Me
  catalog: Catalog
  lang: Lang
  onLang: (l: Lang) => void
  onSaiu: () => void
}) {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [abrindoForm, setAbrindoForm] = useState(false)
  const [carregado, setCarregado] = useState(false)

  const recarregar = useCallback(async () => {
    const [w, a] = await Promise.all([api.wallets(), api.alerts()])
    setWallets(w)
    setAlerts(a)
    setCarregado(true)
  }, [])

  useEffect(() => {
    void recarregar()
  }, [recarregar])

  // O alerta aparece sozinho: o feed é empurrado pelo servidor, sem polling.
  useEffect(() => {
    const source = new EventSource('/api/stream', { withCredentials: true })
    source.addEventListener('alert', () => void recarregar())
    return () => source.close()
  }, [recarregar])

  const somadas = contabilizadas(wallets)
  const total = somadas.reduce((soma, w) => soma + Number(w.balanceSats), 0)
  const utxos = somadas.reduce((soma, w) => soma + w.utxoCount, 0)
  const congelados = somadas.reduce((soma, w) => soma + w.frozenCount, 0)
  const altura = wallets.reduce<number | null>(
    (maior, w) => (w.syncHeight !== null && (maior === null || w.syncHeight > maior) ? w.syncHeight : maior),
    null,
  )
  const posturaAtual = postura(wallets, catalog, lang)

  // Só depois de carregar: enquanto o fetch corre, `wallets` também está
  // vazio, e piscar o formulário seria pior que não tê-lo.
  const semCarteira = carregado && wallets.length === 0

  const separador = <span style={{ color: 'var(--sb-border)' }}>|</span>

  return (
    <Shell
      backend={posturaAtual}
      actions={
        <>
          <LangToggle lang={lang} onChange={onLang} />
          <span className="text-xs text-faint">{me.email}</span>
          <button
            type="button"
            onClick={() => void api.logout().then(onSaiu)}
            className="text-xs uppercase tracking-label text-faint hover:text-ink"
          >
            {render(catalog, 'auth.logout', {}, lang)}
          </button>
        </>
      }
    >
      <div className="grid lg:grid-cols-[460px_minmax(0,1fr)]">
        {/* o que você vigia */}
        <aside className="flex flex-col gap-5 border-b border-line px-4 py-6 sm:px-7 lg:border-b-0 lg:border-r">
          {semCarteira && (
            <section>
              <h2 className="mb-[10px] text-xs font-semibold uppercase tracking-label text-faint">
                {render(catalog, 'wallets.title', {}, lang)}
              </h2>
              <p className="mb-2 text-sm">{render(catalog, 'wallets.empty', {}, lang)}</p>
              <p className="font-prose text-xs leading-relaxed text-muted">
                {render(catalog, 'wallets.emptyHint', {}, lang)}
              </p>
            </section>
          )}

          {!semCarteira && (
          <section>
            <h2 className="mb-[10px] text-xs font-semibold uppercase tracking-label text-faint">
              {render(catalog, 'balance.total', {}, lang)}
            </h2>
            <p className="mb-3 flex items-baseline gap-[9px]">
              <span className="text-2xl font-medium tracking-tight">
                {total.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US')}
              </span>
              <span className="text-sm text-muted">sats</span>
            </p>
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
            <>
              <div className="h-px bg-line" />

              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-label text-faint">
                  {render(catalog, 'wallets.title', {}, lang)}
                </h2>
                <button
                  type="button"
                  onClick={() => setAbrindoForm(v => !v)}
                  aria-expanded={abrindoForm}
                  className="text-xs uppercase tracking-label"
                  style={{ color: 'var(--sb-accent)' }}
                >
                  {render(catalog, 'wallets.add', {}, lang)}
                </button>
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

          {wallets.map(w => (
            <WalletCard key={w.id} wallet={w} catalog={catalog} lang={lang} />
          ))}
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

          <AlertFeed alerts={alerts} catalog={catalog} lang={lang} />

          {altura !== null && (
            <p className="pt-1 text-xs text-faint">
              {render(catalog, 'feed.tip', { height: altura }, lang)}
            </p>
          )}
        </section>
      </div>
    </Shell>
  )
}
