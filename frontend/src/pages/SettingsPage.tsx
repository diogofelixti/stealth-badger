import { useState } from 'react'
import { api } from '../lib/api'
import { BackendForm } from '../components/BackendForm'
import { Channels } from '../components/Channels'
import { Preferencias } from '../components/Preferencias'
import { Mercado } from '../components/Mercado'
import { Button } from '../components/ui/Button'
import { render } from '../lib/i18n'
import { useDadosDoPainel } from './Layout'

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Fontes de consulta e canais de aviso, fora do caminho de quem só quer vigiar. */
export function SettingsPage() {
  const { catalog, lang, fontes, recarregar } = useDadosDoPainel()
  const [cadastrando, setCadastrando] = useState(false)

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-8">
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-label text-faint">
          {render(catalog, 'backends.title', {}, lang)}
        </h2>

        <ul className="mb-3 flex flex-col gap-2">
          {fontes.map(f => (
            <li
              key={f.id}
              className="flex flex-wrap items-baseline gap-2 rounded border border-line bg-surface px-3 py-2 text-sm"
            >
              <span
                aria-hidden="true"
                className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
                style={{ background: f.isPublic ? 'var(--sb-public)' : 'var(--sb-sovereign)' }}
              />
              <span>{f.label ?? host(f.url)}</span>
              <span className="text-xs text-faint">{f.network}</span>
              <span className="text-xs text-faint">
                {render(catalog, `backends.${f.scope}`, {}, lang)}
              </span>
              {f.hasCredentials && (
                <span className="text-xs text-faint">
                  {render(catalog, 'backends.hasCredentials', {}, lang)}
                </span>
              )}
            </li>
          ))}
        </ul>

        {cadastrando ? (
          <BackendForm
            catalog={catalog}
            lang={lang}
            network={fontes[0]?.network ?? 'signet'}
            onSaved={() => {
              setCadastrando(false)
              void recarregar()
            }}
          />
        ) : (
          <Button variant="primary" onClick={() => setCadastrando(true)}>
            {render(catalog, 'backends.addSource', {}, lang)}
          </Button>
        )}
      </section>

      <div className="h-px bg-line" />

      <Preferencias catalog={catalog} lang={lang} />

      <Mercado catalog={catalog} lang={lang} />

      <div className="h-px bg-line" />

      <Channels catalog={catalog} lang={lang} />

      <div className="h-px bg-line" />

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-label text-faint">
          {render(catalog, 'settings.session', {}, lang)}
        </h2>
        <p className="font-prose text-sm leading-relaxed text-muted">
          {render(catalog, 'settings.sessionNote', { email: '' }, lang)}
        </p>
        <Button
          variant="ghost"
          className="mt-2"
          onClick={() => void api.logout().then(() => window.location.reload())}
        >
          {render(catalog, 'auth.logout', {}, lang)}
        </Button>
      </section>
    </div>
  )
}
