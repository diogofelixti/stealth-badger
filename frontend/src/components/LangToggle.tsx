import type { Lang } from '../lib/api'
import { Button } from './ui/Button'

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
        <Button
          key={l}
          variant={l === lang ? 'secondary' : 'ghost'}
          onClick={() => onChange(l)}
          aria-pressed={l === lang}
        >
          {l}
        </Button>
      ))}
    </div>
  )
}
