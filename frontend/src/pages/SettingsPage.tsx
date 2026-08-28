import { useState } from 'react'
import { api } from '../lib/api'
import { BackendForm } from '../components/BackendForm'
import { FonteDeAnalise } from '../components/FonteDeAnalise'
import { ListaDeFontes } from '../components/ListaDeFontes'
import { Channels } from '../components/Channels'
import { Preferencias } from '../components/Preferencias'
import { Mercado } from '../components/Mercado'
import { Button } from '../components/ui/Button'
import { render } from '../lib/i18n'
import { useDadosDoPainel } from './Layout'

/** Fontes de consulta e canais de aviso, fora do caminho de quem só quer vigiar. */
export function SettingsPage() {
  const { catalog, lang, fontes, recarregar, mercadoMudou, versaoDoMercado } =
    useDadosDoPainel()
  const [cadastrando, setCadastrando] = useState(false)

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-8">
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-label text-faint">
          {render(catalog, 'backends.title', {}, lang)}
        </h2>

        <ListaDeFontes fontes={fontes} catalog={catalog} lang={lang} />

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

      <FonteDeAnalise catalog={catalog} lang={lang} />

      <div className="h-px bg-line" />

      <Preferencias catalog={catalog} lang={lang} onSalvou={mercadoMudou} />

      <Mercado key={versaoDoMercado} catalog={catalog} lang={lang} />

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
