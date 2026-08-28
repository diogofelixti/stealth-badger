import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { api, type Backend, type Catalog, type Lang, type Me, type Wallet } from '../lib/api'
import { Shell } from '../components/Shell'
import { LangToggle } from '../components/LangToggle'
import { Button } from '../components/ui/Button'
import { render } from '../lib/i18n'

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * A postura de privacidade da sessão inteira.
 *
 * **Basta uma** carteira passando por explorador público para que a resposta
 * honesta seja pública. Quando mais de um explorador expõe, a linha conta
 * quantos em vez de eleger um — nomear só o primeiro esconderia os outros.
 */
export function postura(
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

export interface ContextoDoPainel {
  me: Me
  catalog: Catalog
  lang: Lang
  wallets: Wallet[]
  fontes: Backend[]
  carregado: boolean
  /** rebusca carteiras e fontes: a postura do topo depende delas */
  recarregar: () => Promise<void>
  /**
   * Manda a prévia de preço e taxa reler as preferências.
   *
   * O `Mercado` pergunta as preferências uma vez, ao montar. Sem este aviso,
   * ligar uma fonte de preço em Configurações não aparecia na prévia até
   * recarregar a página inteira, e a pessoa ficava sem saber se salvou.
   */
  mercadoMudou: () => void
  /** o contador por trás do aviso: quem desenha um `Mercado` o usa como `key` */
  versaoDoMercado: number
}

export function useDadosDoPainel(): ContextoDoPainel {
  return useOutletContext<ContextoDoPainel>()
}

const ROTAS = [
  { para: '/', chave: 'nav.panel' },
  { para: '/carteiras', chave: 'nav.wallets' },
  { para: '/enderecos', chave: 'nav.addresses' },
  { para: '/alertas', chave: 'nav.alerts' },
  { para: '/privacidade', chave: 'nav.privacy' },
  { para: '/configuracoes', chave: 'nav.settings' },
  { para: '/acessos', chave: 'nav.access' },
] as const

/**
 * A casca de todas as rotas.
 *
 * Toda rota nasce aqui dentro, e não é preferência de organização: a listra e
 * o selo de privacidade moram na `Shell`, e uma tela desenhada fora dela
 * apagaria o aviso persistente que é o princípio 2 do projeto. Há teste de
 * postura para cada rota justamente porque isso quebraria em silêncio.
 */
export function Layout({
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
  const [fontes, setFontes] = useState<Backend[]>([])
  const [carregado, setCarregado] = useState(false)
  // Remontar o `Mercado` é o jeito mais curto de fazê-lo reler tudo: ele já
  // sabe buscar sozinho ao montar, e duplicar essa busca aqui seria manter duas
  // cópias da mesma regra de "só consulta se o usuário ligou".
  const [versaoDoMercado, setVersaoDoMercado] = useState(0)
  const { pathname } = useLocation()

  const recarregar = useCallback(async () => {
    const [w, f] = await Promise.all([
      api.wallets(),
      api.backends().catch(() => [] as Backend[]),
    ])
    setWallets(w)
    setFontes(f)
    setCarregado(true)
  }, [])

  // Rebusca ao trocar de rota: arquivar uma carteira numa página muda a
  // postura que o topo anuncia em todas as outras.
  useEffect(() => {
    void recarregar()
  }, [recarregar, pathname])

  const contexto: ContextoDoPainel = {
    me,
    catalog,
    lang,
    wallets,
    fontes,
    carregado,
    recarregar,
    mercadoMudou: () => setVersaoDoMercado(v => v + 1),
    versaoDoMercado,
  }

  return (
    <Shell
      backend={postura(wallets, catalog, lang)}
      actions={
        <>
          <LangToggle lang={lang} onChange={onLang} />
          <span className="text-xs text-faint">{me.email}</span>
          <Button variant="ghost" onClick={() => void api.logout().then(onSaiu)}>
            {render(catalog, 'auth.logout', {}, lang)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col lg:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-4 py-2 sm:px-8 lg:w-[184px] lg:flex-col lg:border-b-0 lg:border-r lg:px-3 lg:py-6">
          {ROTAS.map(r => (
            <NavLink
              key={r.para}
              to={r.para}
              end={r.para === '/'}
              className="rounded px-3 py-2 text-xs uppercase tracking-label"
              style={({ isActive }) => ({
                color: isActive ? 'var(--sb-accent)' : 'var(--sb-text-muted)',
                background: isActive ? 'var(--sb-surface-raised)' : 'transparent',
              })}
            >
              {render(catalog, r.chave, {}, lang)}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0 flex-grow">
          <Outlet context={contexto} />
        </div>
      </div>
    </Shell>
  )
}
