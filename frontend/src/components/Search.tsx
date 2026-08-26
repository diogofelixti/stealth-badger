import { useEffect, useState } from 'react'
import { api, type Achado, type Catalog, type Lang } from '../lib/api'
import { formatSats, shorten } from '../lib/format'
import { render } from '../lib/i18n'

/**
 * Espera antes de consultar.
 *
 * Buscar a cada tecla dispararia uma consulta por caractere: um endereço de 42
 * caracteres colado viraria 42 consultas ao banco para responder uma pergunta.
 */
const ESPERA_MS = 350

export function Search({ catalog, lang }: { catalog: Catalog; lang: Lang }) {
  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState<Achado[] | null>(null)

  useEffect(() => {
    if (!termo.trim()) {
      setAchados(null)
      return
    }
    const timer = setTimeout(() => {
      void api
        .search(termo.trim())
        .then(setAchados)
        .catch(() => setAchados([]))
    }, ESPERA_MS)
    return () => clearTimeout(timer)
  }, [termo])

  return (
    <section>
      <input
        value={termo}
        onChange={e => setTermo(e.target.value)}
        placeholder={render(catalog, 'search.placeholder', {}, lang)}
        className="w-full rounded border border-line bg-bg px-3 py-2 text-sm placeholder:text-faint"
      />

      {/* `null` é "ninguém buscou ainda", e é diferente de "não achou": dizer
          "nada encontrado" com o campo vazio seria responder pergunta que não
          foi feita. */}
      {achados !== null && achados.length === 0 && (
        <p className="mt-2 text-xs text-muted">
          {render(catalog, 'search.empty', {}, lang)}
        </p>
      )}

      {achados !== null && achados.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {achados.map(a => (
            <li key={a.walletId + ':' + a.address} className="border-l-2 border-line pl-[10px]">
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className="font-medium">{shorten(a.address, 10, 8)}</span>
                <span className="text-faint">
                  {a.walletLabel}
                  {a.derivationPath ? ' · ' + a.derivationPath : ''}
                </span>
              </p>
              <p className="flex flex-wrap items-baseline gap-2 text-xs text-muted">
                <span
                  className="uppercase tracking-label"
                  style={{ color: a.used ? 'var(--sb-warning)' : 'var(--sb-faint)' }}
                >
                  {render(catalog, a.used ? 'search.used' : 'search.unused', {}, lang)}
                </span>
                {a.balanceSats > 0 && <span>{formatSats(a.balanceSats, lang)}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
