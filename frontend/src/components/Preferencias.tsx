import { useEffect, useState } from 'react'
import {
  api,
  FONTES_DE_PRECO,
  mensagemDoErro,
  type Catalog,
  type FonteDePreco,
  type Lang,
  type Preferencias as Prefs,
} from '../lib/api'
import { render } from '../lib/i18n'
import { TEMAS, aplicarTema, type Tema } from '../lib/tema'

const MOEDAS = ['BRL', 'USD', 'EUR']
const campo = 'rounded border border-line bg-bg px-3 py-2 text-sm'
const rotulo = 'mb-1 block text-xs uppercase tracking-label text-faint'

/**
 * O que a instância consulta por você — e nada está ligado de fábrica.
 *
 * A prosa diz o que cada fonte enxerga: que existe um servidor perguntando o
 * preço, e o IP dele. Preço não vaza endereço, e por isso **não acende a
 * listra**: inflar o aviso com o que não expõe endereço o transformaria em
 * ruído, e aviso que vira ruído deixa de ser lido.
 */
export function Preferencias({ catalog, lang }: { catalog: Catalog; lang: Lang }) {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void api
      .preferences()
      .then(p => {
        setPrefs(p)
        // O servidor manda quando os dois discordam: o tema segue a pessoa
        // entre navegadores, e o localStorage é só cache.
        aplicarTema(p.theme as Tema)
      })
      .catch(err => setErro(mensagemDoErro(catalog, err, lang)))
  }, [catalog, lang])

  async function salvar(mudanca: Partial<Prefs>): Promise<void> {
    setErro(null)
    try {
      setPrefs(await api.savePreferences(mudanca))
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    }
  }

  if (!prefs) return null

  function alternarFonte(fonte: FonteDePreco): void {
    const atual = prefs!.priceSources
    const nova = atual.includes(fonte)
      ? atual.filter(f => f !== fonte)
      : [...atual, fonte]
    void salvar({ priceSources: nova })
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <label htmlFor="tema" className={rotulo}>
          {render(catalog, 'prefs.theme', {}, lang)}
        </label>
        <select
          id="tema"
          value={prefs.theme}
          onChange={e => {
            const tema = e.target.value as Tema
            aplicarTema(tema)
            void salvar({ theme: tema })
          }}
          className={campo}
        >
          {TEMAS.map(t => (
            <option key={t} value={t}>
              {render(catalog, `theme.${t}`, {}, lang)}
            </option>
          ))}
        </select>
      </section>

      <section>
        <h2 className={rotulo}>{render(catalog, 'prefs.price', {}, lang)}</h2>
        <p className="mb-2 font-prose text-sm leading-relaxed text-muted">
          {render(catalog, 'prefs.priceNote', {}, lang)}
        </p>
        <div className="mb-2 flex flex-wrap gap-3">
          {FONTES_DE_PRECO.map(f => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={f}
                checked={prefs.priceSources.includes(f)}
                onChange={() => alternarFonte(f)}
              />
              {f}
            </label>
          ))}
        </div>

        <label htmlFor="moeda" className={rotulo}>
          {render(catalog, 'prefs.currency', {}, lang)}
        </label>
        <select
          id="moeda"
          value={prefs.currency}
          onChange={e => void salvar({ currency: e.target.value })}
          className={campo}
        >
          {MOEDAS.map(m => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </section>

      <section>
        <label htmlFor="fonte-de-taxa" className={rotulo}>
          {render(catalog, 'prefs.fees', {}, lang)}
        </label>
        <select
          id="fonte-de-taxa"
          value={prefs.feeSource}
          onChange={e => void salvar({ feeSource: e.target.value as Prefs['feeSource'] })}
          className={campo}
        >
          <option value="off">{render(catalog, 'prefs.feeOff', {}, lang)}</option>
          <option value="node">{render(catalog, 'prefs.feeNode', {}, lang)}</option>
          <option value="mempool">{render(catalog, 'prefs.feeMempool', {}, lang)}</option>
        </select>
      </section>

      {erro && (
        <p role="alert" className="text-sm" style={{ color: 'var(--sb-critical)' }}>
          {erro}
        </p>
      )}
    </div>
  )
}
