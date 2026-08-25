import { useCallback, useEffect, useState } from 'react'
import { api, type Alert, type Catalog, type Lang, type Me, type Wallet } from '../lib/api'
import { Shell } from '../components/Shell'
import { AlertFeed } from '../components/AlertFeed'
import { AddWallet } from '../components/AddWallet'
import { LangToggle } from '../components/LangToggle'
import { WalletCard } from '../components/WalletCard'
import { render } from '../lib/i18n'

/** Carteira ainda importando não entra no total: o dado dela está incompleto. */
function contabilizadas(wallets: Wallet[]): Wallet[] {
  return wallets.filter(w => w.syncState !== 'pending' && w.syncState !== 'importing')
}

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
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
  const primeira = wallets[0]

  // Só depois de carregar: enquanto o fetch corre, `wallets` também está
  // vazio, e piscar o formulário seria pior que não tê-lo.
  const semCarteira = carregado && wallets.length === 0

  const separador = <span style={{ color: 'var(--sb-border)' }}>|</span>

  return (
    <Shell
      backend={
        primeira
          ? {
              isPublic: primeira.backendIsPublic,
              host: host(primeira.backendUrl),
              label: render(
                catalog,
                primeira.backendIsPublic ? 'privacy.public' : 'privacy.sovereign',
                {},
                lang,
              ),
            }
          : null
      }
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
