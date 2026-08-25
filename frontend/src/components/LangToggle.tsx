import type { Lang } from '../lib/api'

const IDIOMAS: Lang[] = ['pt', 'en']

export function LangToggle({
  lang,
  onChange,
}: {
  lang: Lang
  onChange: (l: Lang) => void
}) {
  return (
    <div className="flex items-center overflow-hidden rounded border border-line">
      {IDIOMAS.map(l => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={l === lang}
          className="px-[10px] py-[6px] text-xs font-semibold uppercase tracking-label"
          style={
            l === lang
              ? { background: 'var(--sb-surface-raised)', color: 'var(--sb-text)' }
              : { color: 'var(--sb-text-faint)' }
          }
        >
          {l}
        </button>
      ))}
    </div>
  )
}
