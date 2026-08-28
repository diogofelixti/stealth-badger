import { useEffect, useState } from 'react'
import { api, type Catalog, type Lang, type Precos, type Taxas } from '../lib/api'
import { render } from '../lib/i18n'

/**
 * Preço e taxa, **só se o usuário ligou**.
 *
 * Enquanto as duas coisas estão desligadas — que é o padrão — este componente
 * não desenha nada e não consulta ninguém. É a diferença entre oferecer uma
 * conveniência e assinar o usuário num serviço sem perguntar.
 */
export function Mercado({
  catalog,
  lang,
  compact = false,
}: {
  catalog: Catalog
  lang: Lang
  compact?: boolean
}) {
  const [precos, setPrecos] = useState<Precos | null>(null)
  const [taxas, setTaxas] = useState<Taxas | null>(null)

  useEffect(() => {
    // Preferência que não carrega não derruba a tela: sem ela, o padrão é
    // não mostrar nada — que é o mesmo que estar desligado.
    void api.preferences().then(prefs => {
      if (prefs.priceSources.length > 0) {
        void api.price().then(setPrecos).catch(() => setPrecos(null))
      }
      if (prefs.feeSource !== 'off') {
        void api.fees().then(setTaxas).catch(() => setTaxas(null))
      }
    }).catch(() => undefined)
  }, [])

  const temPreco = precos?.median !== null && precos !== null
  const temTaxa = taxas?.blocks != null
  if (!temPreco && !temTaxa) return null

  const moeda = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', {
    maximumFractionDigits: 0,
  })

  return (
    <div
      data-market={compact ? 'header' : 'full'}
      className={
        compact
          ? 'flex flex-wrap items-center gap-3 text-xs'
          : 'flex flex-wrap gap-6'
      }
    >
      {temPreco && (
        <div>
          <span className="block text-xs uppercase tracking-label text-faint">
            {render(catalog, 'prefs.price', {}, lang)}
          </span>
          <span className={compact ? 'text-sm' : 'text-lg'}>
            {moeda.format(precos!.median!)}{' '}
            <span className="text-sm text-faint">{precos!.currency}</span>
          </span>
          <span className={compact ? 'hidden text-xs text-faint xl:block' : 'block text-xs text-faint'}>
            {precos!.sources.filter(s => s.price !== null).map(s => s.id).join(' · ')}
          </span>
        </div>
      )}

      {temTaxa && (
        <div className={compact ? 'hidden lg:block' : ''}>
          <span className="block text-xs uppercase tracking-label text-faint">
            {render(catalog, 'prefs.fees', {}, lang)}
          </span>
          <span className={compact ? 'flex gap-2 text-sm' : 'flex gap-3 text-lg'}>
            {[1, 3, 6].map(alvo => (
              <span key={alvo}>
                {taxas!.blocks![alvo] ?? '—'}
                <span className="text-sm text-faint"> sat/vB</span>
                <span className="block text-xs text-faint">
                  {alvo === 1
                    ? render(catalog, 'fees.next', {}, lang)
                    : render(catalog, 'fees.blocks', { n: alvo }, lang)}
                </span>
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  )
}
