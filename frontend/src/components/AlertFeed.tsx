import type { Alert, Catalog, Lang, Severity } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { render, renderAlert } from '../lib/i18n'
import { Button } from './ui/Button'

/**
 * A cor reforça a severidade; quem carrega a informação é a palavra ao lado.
 * Daltonismo é comum, e o crítico é justamente o que não pode passar batido.
 */
const COR: Record<Severity, string> = {
  info: 'var(--sb-info)',
  warning: 'var(--sb-warning)',
  critical: 'var(--sb-critical)',
}

/** Crítico recebe a listra completa do texugo; os demais, régua sólida. */
function regua(severity: Severity): string {
  return severity === 'critical' ? 'var(--sb-stripe-critical)' : COR[severity]
}

export function AlertFeed({
  alerts,
  catalog,
  lang,
  temMais = false,
  onLoadMore,
}: {
  alerts: Alert[]
  catalog: Catalog
  lang: Lang
  /** há página seguinte no cursor do servidor */
  temMais?: boolean
  onLoadMore?: () => void
}) {
  if (alerts.length === 0) {
    return <p className="text-sm text-faint">{render(catalog, 'feed.empty', {}, lang)}</p>
  }

  const recentes = [...alerts].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )

  return (
    <div className="flex flex-col gap-3">
      {recentes.map(a => {
        const { title, body } = renderAlert(catalog, a.type, a.params, lang)
        return (
          <article
            key={a.id}
            data-severity={a.severity}
            className="flex rounded border border-line bg-surface"
            style={{ borderLeft: 'none' }}
          >
            <div className="w-1 shrink-0" style={{ background: regua(a.severity) }} />
            <div className="flex-grow px-[18px] py-4">
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <h3 className="text-base font-semibold">{title}</h3>
                <span
                  className="whitespace-nowrap text-xs font-semibold uppercase tracking-label"
                  style={{ color: COR[a.severity] }}
                >
                  {render(catalog, `severity.${a.severity}`, {}, lang)}
                </span>
              </div>
              <p className="mb-3 font-prose text-sm leading-relaxed text-muted">{body}</p>
              <time className="block text-xs text-faint" dateTime={a.createdAt}>
                {formatDateTime(a.createdAt, lang)}
              </time>
            </div>
          </article>
        )
      })}

      {/* O que chega pelo SSE entra por cima e não mexe no cursor, que aponta
          para baixo. Por isso "carregar mais" continua válido depois de um
          alerta novo chegar. */}
      {temMais && onLoadMore && (
        <Button variant="ghost" onClick={onLoadMore} className="self-start">
          {render(catalog, 'feed.loadMore', {}, lang)}
        </Button>
      )}
    </div>
  )
}
