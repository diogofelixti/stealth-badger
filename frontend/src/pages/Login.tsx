import { useState } from 'react'
import { api, mensagemDoErro, type Catalog, type Lang } from '../lib/api'
import { LangToggle } from '../components/LangToggle'
import { render } from '../lib/i18n'

export function Login({
  catalog,
  lang,
  onLang,
  onEntrou,
}: {
  catalog: Catalog
  lang: Lang
  onLang: (l: Lang) => void
  onEntrou: () => void
}) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function entrar(criarConta: boolean) {
    setErro(null)
    setEnviando(true)
    try {
      if (criarConta) await api.register(email, senha, lang)
      await api.login(email, senha)
      onEntrou()
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    } finally {
      setEnviando(false)
    }
  }

  const campo =
    'mb-2 w-full rounded border border-line bg-bg px-3 py-2 text-sm placeholder:text-faint'

  return (
    <div className="flex min-h-screen flex-col bg-bg font-ui text-ink">
      <div aria-hidden="true" className="h-[5px] shrink-0 bg-stripe-warning" />

      <div className="flex flex-grow items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="" width={32} height={32} className="block" />
              <span className="text-base font-semibold uppercase tracking-label">
                Stealth Badger
              </span>
            </div>
            <LangToggle lang={lang} onChange={onLang} />
          </div>

          <p className="mb-6 font-prose text-sm text-muted">
            {render(catalog, 'auth.tagline', {}, lang)}
          </p>

          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder={render(catalog, 'auth.email', {}, lang)}
            className={campo}
          />
          <input
            value={senha}
            onChange={e => setSenha(e.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder={render(catalog, 'auth.password', {}, lang)}
            className={`${campo} mb-3`}
          />

          {erro && (
            <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--sb-critical)' }}>
              {erro}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={enviando || !email || !senha}
              onClick={() => entrar(false)}
              className="flex-1 rounded px-3 py-2 text-sm font-semibold uppercase tracking-label disabled:opacity-40"
              style={{ background: 'var(--sb-accent)', color: 'var(--sb-bg)' }}
            >
              {render(catalog, 'auth.login', {}, lang)}
            </button>
            <button
              type="button"
              disabled={enviando || !email || !senha}
              onClick={() => entrar(true)}
              className="flex-1 rounded border border-line px-3 py-2 text-sm uppercase tracking-label disabled:opacity-40"
            >
              {render(catalog, 'auth.register', {}, lang)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
