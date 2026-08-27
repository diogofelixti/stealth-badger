import { useState } from 'react'
import type { Catalog, Lang } from '../lib/api'
import { render } from '../lib/i18n'
import { Button } from './ui/Button'

/**
 * A porta estreita de apagar.
 *
 * Apagar leva junto o log da carteira, que é a única exceção ao append-only
 * do projeto. Digitar o rótulo é o que separa "quis apagar" de "cliquei sem
 * ler" — e é a mesma exigência que o backend faz, para que a tela não possa
 * afrouxar o que a API garante.
 */
export function ConfirmDialog({
  label,
  catalog,
  lang,
  onConfirm,
  onCancel,
}: {
  label: string
  catalog: Catalog
  lang: Lang
  onConfirm: (confirmado: string) => void
  onCancel: () => void
}) {
  const [digitado, setDigitado] = useState('')
  const confere = digitado === label

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgb(0 0 0 / 0.6)' }}
    >
      <div className="w-full max-w-md rounded border border-line bg-surface px-5 py-5">
        <h3 className="mb-2 text-lg" style={{ color: 'var(--sb-critical)' }}>
          {render(catalog, 'wallets.deleteTitle', { label }, lang)}
        </h3>
        <p className="mb-4 font-prose text-sm leading-relaxed text-muted">
          {render(catalog, 'wallets.deleteNote', {}, lang)}
        </p>

        <label
          htmlFor="confirmar-rotulo"
          className="mb-1 block text-xs uppercase tracking-label text-faint"
        >
          {render(catalog, 'wallets.deleteConfirmLabel', {}, lang)}
        </label>
        <input
          id="confirmar-rotulo"
          value={digitado}
          onChange={e => setDigitado(e.target.value)}
          placeholder={label}
          className="mb-4 w-full rounded border border-line bg-bg px-3 py-2 text-sm placeholder:text-faint"
        />

        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>{render(catalog, 'wallets.cancel', {}, lang)}</Button>
          <Button variant="danger" disabled={!confere} onClick={() => onConfirm(digitado)}>
            {render(catalog, 'wallets.delete', {}, lang)}
          </Button>
        </div>
      </div>
    </div>
  )
}
