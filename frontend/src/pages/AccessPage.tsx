import { Acessos } from '../components/Acessos'
import { render } from '../lib/i18n'
import { useDadosDoPainel } from './Layout'

/**
 * Acessos externos — Tor, domínio e TLS.
 *
 * A página existe antes da funcionalidade **de propósito**: ela diz o que
 * ainda não está pronto em vez de esconder, que é a mesma regra do resto do
 * produto — dizer o que não se sabe é melhor que fingir que se sabe.
 */
export function AccessPage() {
  const { catalog, lang } = useDadosDoPainel()

  return (
    <div className="flex max-w-2xl flex-col gap-3 px-4 py-6 sm:px-8">
      <h2 className="text-xs font-semibold uppercase tracking-label text-faint">
        {render(catalog, 'nav.access', {}, lang)}
      </h2>
      <p className="font-prose text-base leading-relaxed text-muted">
        {render(catalog, 'access.roadmap', {}, lang)}
      </p>

      <Acessos catalog={catalog} lang={lang} />
    </div>
  )
}
