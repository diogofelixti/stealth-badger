import { useState, type FormEvent } from 'react'
import { api, type Catalog, type Lang } from '../lib/api'
import { render } from '../lib/i18n'

export function AddWallet({
  catalog,
  lang,
  onAdded,
}: {
  catalog: Catalog
  lang: Lang
  onAdded: () => void
}) {
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await api.addWallet(label.trim(), key.trim())
      setLabel('')
      setKey('')
      onAdded()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  const campo =
    'w-full rounded border border-line bg-bg px-3 py-2 text-sm placeholder:text-faint'

  return (
    <form onSubmit={enviar} className="rounded border border-line bg-surface px-[18px] py-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-label text-faint">
        {render(catalog, 'wallets.formTitle', {}, lang)}
      </h3>

      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder={render(catalog, 'wallets.labelPlaceholder', {}, lang)}
        className={`mb-2 ${campo}`}
      />
      <textarea
        value={key}
        onChange={e => setKey(e.target.value)}
        placeholder={render(catalog, 'wallets.keyPlaceholder', {}, lang)}
        rows={3}
        className={`mb-2 resize-none ${campo}`}
      />

      <p className="mb-3 font-prose text-xs leading-relaxed text-faint">
        {render(catalog, 'wallets.watchOnly', {}, lang)}
      </p>

      {erro && (
        <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--sb-critical)' }}>
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando || !label.trim() || !key.trim()}
        className="rounded px-3 py-2 text-sm font-semibold uppercase tracking-label disabled:opacity-40"
        style={{ background: 'var(--sb-accent)', color: 'var(--sb-bg)' }}
      >
        {render(catalog, enviando ? 'wallets.submitting' : 'wallets.submit', {}, lang)}
      </button>
    </form>
  )
}
