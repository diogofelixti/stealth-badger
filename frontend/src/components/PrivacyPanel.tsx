import { useState } from 'react'
import { api, mensagemDoErro, type Catalog, type Lang, type PrivacyReport } from '../lib/api'
import { render } from '../lib/i18n'

/**
 * O scanner separa o achado que elogia do que acusa. Apagar essa diferença
 * pintaria tudo de alarme, e uma tela que só grita deixa de ser lida.
 */
function corDaSeveridade(severity: string): string {
  if (severity === 'good') return 'var(--sb-sovereign)'
  if (severity === 'high' || severity === 'critical') return 'var(--sb-critical)'
  return 'var(--sb-warning)'
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

  async function abrir(): Promise<void> {
    setAberto(v => !v)
    // Busca só na primeira abertura: o relatório completo é caro de serializar
    // e ninguém pediu para vê-lo antes de clicar.
    if (relatorio || carregando) return
    setCarregando(true)
    try {
      setRelatorio(await api.privacy(walletId))
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

  return (
    <div className="mt-[10px]">
      <button
        type="button"
        onClick={() => void abrir()}
        aria-expanded={aberto}
        className="text-xs uppercase tracking-label text-faint hover:text-ink"
      >
        {render(catalog, 'privacy.findings', {}, lang)}
      </button>

      {aberto && relatorio?.error && (
        <p role="alert" className="mt-2 text-xs" style={{ color: 'var(--sb-critical)' }}>
          {relatorio.error}
        </p>
      )}

      {aberto && relatorio?.latest && (
        <ul className="mt-2 flex flex-col gap-2">
          {relatorio.latest.findings.map(f => (
            <li
              key={f.id}
              data-severity={f.severity}
              className="border-l-2 pl-[10px]"
              style={{ borderColor: corDaSeveridade(f.severity) }}
            >
              <p className="text-xs font-medium">{f.title}</p>
              <p className="font-prose text-xs leading-relaxed text-muted">{f.description}</p>
              <p className="font-prose text-xs leading-relaxed text-faint">
                {f.recommendation}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
