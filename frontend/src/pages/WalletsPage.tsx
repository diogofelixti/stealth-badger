import { Link } from 'react-router-dom'
import { formatSats } from '../lib/format'
import { render } from '../lib/i18n'
import { useDadosDoPainel } from './Layout'

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** A lista de carteiras, cada uma com a porta para a sua página. */
export function WalletsPage() {
  const { catalog, lang, wallets } = useDadosDoPainel()

  return (
    <div className="flex flex-col gap-3 px-4 py-6 sm:px-8">
      <h2 className="text-xs font-semibold uppercase tracking-label text-faint">
        {render(catalog, 'wallets.title', {}, lang)}
      </h2>
      {wallets.map(w => (
        <Link
          key={w.id}
          to={`/carteiras/${w.id}`}
          className="rounded border border-line bg-surface px-[18px] py-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-base">{w.label}</span>
            <span className="text-xl">{formatSats(Number(w.balanceSats), lang)}</span>
          </div>
          <p className="mt-1 flex items-center gap-[6px] text-xs text-faint">
            <span
              aria-hidden="true"
              className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
              style={{
                background: w.backendIsPublic ? 'var(--sb-public)' : 'var(--sb-sovereign)',
              }}
            />
            {host(w.backendUrl)} · {w.scriptType} · {w.network}
          </p>
        </Link>
      ))}
    </div>
  )
}
