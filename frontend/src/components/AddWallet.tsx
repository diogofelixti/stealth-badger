import { useEffect, useState, type FormEvent } from 'react'
import { api, type Backend, type BackendKind, type Catalog, type Lang } from '../lib/api'
import { render } from '../lib/i18n'

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

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

  const [backends, setBackends] = useState<Backend[]>([])
  const [escolhido, setEscolhido] = useState<number | null>(null)
  const [abrindoBackend, setAbrindoBackend] = useState(false)
  const [novoKind, setNovoKind] = useState<BackendKind>('electrum')
  const [novaUrl, setNovaUrl] = useState('')
  const [novoPublico, setNovoPublico] = useState(false)

  useEffect(() => {
    void api
      .backends()
      .then(lista => {
        setBackends(lista)
        setEscolhido(atual => atual ?? lista[0]?.id ?? null)
      })
      .catch(() => setBackends([]))
  }, [])

  const atual = backends.find(b => b.id === escolhido) ?? null

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await api.addWallet(label.trim(), key.trim(), escolhido ?? undefined)
      setLabel('')
      setKey('')
      onAdded()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  async function salvarBackend(): Promise<void> {
    setErro(null)
    try {
      const criado = await api.addBackend(novoKind, novaUrl.trim(), novoPublico)
      // já selecionado: quem acabou de cadastrar um backend quer vigiar por ele
      setBackends(lista => [...lista.filter(b => b.id !== criado.id), criado])
      setEscolhido(criado.id)
      setAbrindoBackend(false)
      setNovaUrl('')
    } catch (err) {
      setErro((err as Error).message)
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

      {/* Escolher o backend é escolher quem vê os endereços consultados. Fica
          no mesmo formulário, e não numa tela de configuração distante, porque
          é uma decisão sobre esta carteira. */}
      <label
        htmlFor="backend-da-carteira"
        className="mb-1 block text-xs uppercase tracking-label text-faint"
      >
        {render(catalog, 'backends.title', {}, lang)}
      </label>
      <select
        id="backend-da-carteira"
        value={escolhido ?? ''}
        onChange={e => setEscolhido(Number(e.target.value))}
        className={`mb-2 ${campo}`}
      >
        {backends.map(b => (
          <option key={b.id} value={b.id}>
            {host(b.url)} · {render(catalog, `backends.${b.scope}`, {}, lang)}
          </option>
        ))}
      </select>

      {atual?.isPublic && (
        <p className="mb-2 font-prose text-xs leading-relaxed" style={{ color: 'var(--sb-public)' }}>
          {render(catalog, 'backends.publicNote', {}, lang)}
        </p>
      )}

      {!abrindoBackend && (
        <button
          type="button"
          onClick={() => setAbrindoBackend(true)}
          className="mb-3 text-xs uppercase tracking-label"
          style={{ color: 'var(--sb-accent)' }}
        >
          {render(catalog, 'backends.addToggle', {}, lang)}
        </button>
      )}

      {abrindoBackend && (
        <div className="mb-3 rounded border border-line px-3 py-3">
          <select
            aria-label={render(catalog, 'backends.title', {}, lang) + ' — tipo'}
            value={novoKind}
            onChange={e => setNovoKind(e.target.value as BackendKind)}
            className={`mb-2 ${campo}`}
          >
            <option value="electrum">Electrum</option>
            <option value="esplora">Esplora</option>
          </select>
          <input
            value={novaUrl}
            onChange={e => setNovaUrl(e.target.value)}
            placeholder={render(catalog, 'backends.urlPlaceholder', {}, lang)}
            className={`mb-2 ${campo}`}
          />
          <label className="mb-2 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={novoPublico}
              onChange={e => setNovoPublico(e.target.checked)}
            />
            {render(catalog, 'backends.isPublic', {}, lang)}
          </label>
          <button
            type="button"
            disabled={!novaUrl.trim()}
            onClick={() => void salvarBackend()}
            className="rounded border border-line px-3 py-2 text-xs uppercase tracking-label disabled:opacity-40"
          >
            {render(catalog, 'backends.save', {}, lang)}
          </button>
        </div>
      )}

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
