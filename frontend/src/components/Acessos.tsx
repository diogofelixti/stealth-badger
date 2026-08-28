import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Acessos as Estado, type Catalog, type Lang } from '../lib/api'
import { render } from '../lib/i18n'
import { enderecoDoCaminho, type Caminho } from '../lib/caminhos'
import { EstadoDoCaminho } from './EstadoDoCaminho'

/** A frase que apresenta cada caminho, na lista. */
const NOTA: Record<Caminho, string> = {
  tor: 'access.torNote',
  tailscale: 'access.tailscaleNote',
  cloudflare: 'access.cloudflareWarning',
}

const ORDEM: Caminho[] = ['tor', 'tailscale', 'cloudflare']

/**
 * Por onde o painel está acessível de fora, em uma tela só.
 *
 * A lista diz **o quê**; cada caminho tem a sua página, que diz **como**: o
 * passo a passo, os comandos com botão de copiar, o QR do endereço, o que
 * aquele caminho enxerga, e o que fazer quando ele não funciona.
 *
 * O que a lista mostra de cada um é o estado medido, e não a configuração:
 * `enabled` diz que alguém configurou, e é `status` que diz se respondeu. A
 * fonte da medição fica na página do caminho, porque aqui ela seria ruído.
 */
export function Acessos({ catalog, lang }: { catalog: Catalog; lang: Lang }) {
  const [estado, setEstado] = useState<Estado | null>(null)

  useEffect(() => {
    void api
      .access()
      .then(setEstado)
      .catch(() => setEstado(null))
  }, [])

  if (!estado) return null

  const t = (chave: string) => render(catalog, chave, {}, lang)

  return (
    <div className="flex flex-col gap-3">
      {ORDEM.map(caminho => {
        const info = estado[caminho]
        const endereco = enderecoDoCaminho(estado, caminho)
        const exposto = caminho === 'cloudflare'

        return (
          <Link
            key={caminho}
            to={`/acessos/${caminho}`}
            className="block rounded-lg border border-line bg-surface p-5 transition-colors hover:bg-raised"
            style={exposto ? { borderColor: 'var(--sb-warning)' } : undefined}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base">{t('access.' + caminho)}</h3>
              <EstadoDoCaminho
                status={info.status}
                statusSource={info.statusSource}
                catalog={catalog}
                lang={lang}
                comFonte={false}
              />
            </div>

            {/* A linha da Cloudflare não depende de configuração: quem termina
                o TLS enxerga o tráfego em claro, e dizer isso é a diferença
                entre oferecer uma escolha e empurrar uma. */}
            <p
              className="font-prose text-sm leading-relaxed"
              style={{
                color: exposto ? 'var(--sb-warning)' : 'var(--sb-text-muted)',
              }}
            >
              {t(NOTA[caminho])}
            </p>

            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
              {info.enabled && endereco ? (
                <span className="min-w-0 break-all font-mono text-sm">{endereco}</span>
              ) : (
                <span className="text-sm text-faint">{t('access.off')}</span>
              )}
              <span className="text-sm text-muted underline">{t('access.details')}</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
