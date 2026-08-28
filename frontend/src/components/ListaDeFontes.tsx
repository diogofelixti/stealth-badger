import { useState } from 'react'
import {
  api,
  mensagemDoErro,
  type Backend,
  type Catalog,
  type Lang,
} from '../lib/api'
import { render } from '../lib/i18n'
import { Button } from './ui/Button'

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

type Resultado = { ok: boolean; height?: number; reason?: string }

/**
 * As fontes cadastradas, e se elas respondem.
 *
 * ── Por que o botão de testar existe ──────────────────────────────────────
 * A lista mentia por omissão. As duas `mempool.space` que a instância semeia
 * estavam **inalcançáveis** da rede da máquina de desenvolvimento — medido em
 * 28/08: o host não completa a conexão, enquanto `blockstream.info` responde em
 * 0,65 s — e apareciam exatamente iguais às que funcionam.
 *
 * Quem cadastrava uma carteira numa delas descobria pelo `fetch failed` num
 * canto da tela, minutos depois, sem nada ligando o erro à fonte escolhida.
 *
 * Testar não roda sozinho: é uma consulta a um terceiro, e ela sai quando a
 * pessoa pede. O que a tela dá de graça é o botão à vista, e não a suposição de
 * que está tudo bem.
 */
export function ListaDeFontes({
  fontes,
  catalog,
  lang,
}: {
  fontes: Backend[]
  catalog: Catalog
  lang: Lang
}) {
  const [resultados, setResultados] = useState<Record<number, Resultado>>({})
  const [testando, setTestando] = useState<number | null>(null)

  async function testar(id: number): Promise<void> {
    setTestando(id)
    try {
      const r = await api.testBackend(id)
      setResultados(atual => ({ ...atual, [id]: r }))
    } catch (err) {
      setResultados(atual => ({
        ...atual,
        [id]: { ok: false, reason: mensagemDoErro(catalog, err, lang) },
      }))
    } finally {
      setTestando(null)
    }
  }

  const t = (chave: string, params: Record<string, unknown> = {}) =>
    render(catalog, chave, params, lang)

  return (
    <ul className="mb-3 flex flex-col gap-2">
      {fontes.map(f => {
        const r = resultados[f.id]
        return (
          <li
            key={f.id}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {/* A postura vem da fonte, e é a mesma régua do selo do topo. */}
              <span
                aria-hidden="true"
                className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
                style={{
                  background: f.isPublic ? 'var(--sb-public)' : 'var(--sb-sovereign)',
                }}
              />
              <span className="min-w-0 break-all">{f.label ?? host(f.url)}</span>
              <span className="text-xs text-faint">{f.network}</span>
              <span className="text-xs text-faint">
                {t(`backends.${f.scope}`)}
              </span>
              {f.hasCredentials && (
                <span className="text-xs text-faint">{t('backends.hasCredentials')}</span>
              )}

              <span className="ml-auto flex items-center gap-2">
                {testando === f.id && (
                  <span className="text-xs text-faint">{t('backends.testing')}</span>
                )}
                {/* Sem teste manual nesta sessão, mostra o que a varredura
                    periódica mediu — inclusive `ainda não medida`, que é
                    diferente de "não responde" e não pode virar vermelho. */}
                {!r && testando !== f.id && f.status && (
                  <span
                    className="text-xs"
                    data-estado={f.status}
                    style={{
                      color:
                        f.status === 'up'
                          ? 'var(--sb-sovereign)'
                          : f.status === 'down'
                            ? 'var(--sb-warning)'
                            : 'var(--sb-text-faint)',
                    }}
                  >
                    {f.status === 'up'
                      ? t('backends.testOk', { height: f.height ?? 0 })
                      : f.status === 'down'
                        ? t('backends.testFail', { reason: f.statusError ?? '' })
                        : t('backends.unknownState')}
                  </span>
                )}
                {r && testando !== f.id && (
                  <span
                    className="text-xs"
                    data-test-result={r.ok ? 'ok' : 'falhou'}
                    style={{
                      color: r.ok ? 'var(--sb-sovereign)' : 'var(--sb-warning)',
                    }}
                  >
                    {r.ok
                      ? t('backends.testOk', { height: r.height ?? 0 })
                      : t('backends.testFail', { reason: r.reason ?? '' })}
                  </span>
                )}
                <Button disabled={testando !== null} onClick={() => void testar(f.id)}>
                  {t('backends.test')}
                </Button>
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
