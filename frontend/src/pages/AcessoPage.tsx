import { Link, Navigate, useParams } from 'react-router-dom'
import { CaminhoExterno } from '../components/CaminhoExterno'
import { ehCaminho } from '../lib/caminhos'
import { render } from '../lib/i18n'
import { useDadosDoPainel } from './Layout'

/**
 * A página de um caminho externo: `/acessos/tor`, `/acessos/tailscale`,
 * `/acessos/cloudflare`.
 *
 * Caminho desconhecido volta para a lista em vez de mostrar uma página vazia,
 * pela mesma razão que a rota desconhecida cai no painel: melhor a tela cheia
 * que um branco sem explicação.
 */
export function AcessoPage() {
  const { catalog, lang } = useDadosDoPainel()
  const { caminho } = useParams()

  if (!ehCaminho(caminho)) return <Navigate to="/acessos" replace />

  return (
    <div className="flex max-w-2xl flex-col gap-4 px-4 py-6 sm:px-8">
      <Link to="/acessos" className="text-sm text-muted underline">
        {render(catalog, 'access.all', {}, lang)}
      </Link>

      <CaminhoExterno caminho={caminho} catalog={catalog} lang={lang} />
    </div>
  )
}
