import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Acessos as Estado, type Catalog, type Lang } from '../lib/api'
import { render } from '../lib/i18n'
import { CAMINHOS, enderecoDoCaminho, type Caminho } from '../lib/caminhos'
import { EstadoDoCaminho } from './EstadoDoCaminho'

const rotulo = 'text-xs uppercase tracking-label text-faint'

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
  const comando = (perfil: string) => `docker compose --profile ${perfil} up -d`

  return (
    <div className="flex flex-col gap-6">
      {ORDEM.map(caminho => {
        const info = estado[caminho]
        const endereco = enderecoDoCaminho(estado, caminho)

        return (
          <section key={caminho}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className={rotulo}>{t('access.' + caminho)}</h3>
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
                color:
                  caminho === 'cloudflare'
                    ? 'var(--sb-warning)'
                    : 'var(--sb-text-muted)',
              }}
            >
              {t(NOTA[caminho])}
            </p>

            {info.enabled && endereco ? (
              <p className="mt-1 break-all font-mono text-sm">{endereco}</p>
            ) : (
              <p className="mt-1 text-sm text-faint">
                {t('access.off')} ·{' '}
                {render(
                  catalog,
                  'access.howTo',
                  { comando: comando(CAMINHOS[caminho].perfil) },
                  lang,
                )}
              </p>
            )}

            <Link
              to={`/acessos/${caminho}`}
              className="mt-1 inline-block text-sm text-muted underline"
            >
              {t('access.details')}
            </Link>
          </section>
        )
      })}
    </div>
  )
}
