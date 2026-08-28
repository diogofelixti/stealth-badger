import { useEffect, useState } from 'react'
import { api, type Catalog, type Lang, type Precos, type Taxas } from '../lib/api'
import { render } from '../lib/i18n'

const ALVOS = [1, 3, 6] as const

/**
 * Preço e taxa, **só se o usuário ligou**.
 *
 * Enquanto as duas coisas estão desligadas — que é o padrão — este componente
 * não desenha nada e não consulta ninguém. É a diferença entre oferecer uma
 * conveniência e assinar o usuário num serviço sem perguntar.
 *
 * Saiu do cabeçalho porque competia com o selo de postura, que é a tese do
 * produto. No Painel ele vira contexto: discreto, legível e perto do saldo,
 * com as três estimativas sempre nomeadas.
 */
export function Mercado({
  catalog,
  lang,
}: {
  catalog: Catalog
  lang: Lang
}) {
  const [precos, setPrecos] = useState<Precos | null>(null)
  const [taxas, setTaxas] = useState<Taxas | null>(null)

  useEffect(() => {
    // Preferência que não carrega não derruba a tela: sem ela, o padrão é
    // não mostrar nada — que é o mesmo que estar desligado.
    void api
      .preferences()
      .then(prefs => {
        if (prefs.priceSources.length > 0) {
          void api.price().then(setPrecos).catch(() => setPrecos(null))
        }
        if (prefs.feeSource !== 'off') {
          void api.fees().then(setTaxas).catch(() => setTaxas(null))
        }
      })
      .catch(() => undefined)
  }, [])

  const temPreco = precos?.median !== null && precos !== null
  const temTaxa = taxas?.blocks != null
  if (!temPreco && !temTaxa) return null

  const moeda = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', {
    maximumFractionDigits: 0,
  })
  const rotulo = 'text-xs uppercase tracking-label text-faint'

  return (
    <section
      data-market="panel"
      className="flex flex-wrap items-start gap-6 rounded-lg border border-line bg-surface p-5"
    >
      {temPreco && (
        <div>
          <span className={`block ${rotulo}`}>
            {render(catalog, 'prefs.price', {}, lang)}
          </span>
          <span className="text-lg tabular-nums">
            {moeda.format(precos!.median!)}{' '}
            <span className="text-sm text-faint">{precos!.currency}</span>
          </span>
          <span className="block text-xs text-faint">
            {precos!.sources.filter(s => s.price !== null).map(s => s.id).join(' · ')}
          </span>
        </div>
      )}

      {temTaxa && (
        <div>
          <span className={`block ${rotulo}`}>
            {render(catalog, 'prefs.fees', {}, lang)}
          </span>
          <span className="flex gap-3 text-lg tabular-nums">
            {ALVOS.map(alvo => (
              <span key={alvo}>
                {taxas!.blocks![alvo] ?? '—'}
                <span className="text-sm text-faint"> sat/vB</span>
                <span className="block text-xs text-faint">
                  {legendaDoAlvo(catalog, lang, alvo)}
                </span>
              </span>
            ))}
          </span>
        </div>
      )}
    </section>
  )
}

function legendaDoAlvo(catalog: Catalog, lang: Lang, alvo: number): string {
  return alvo === 1
    ? render(catalog, 'fees.next', {}, lang)
    : render(catalog, 'fees.blocks', { n: alvo }, lang)
}
