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
import { Button } from './ui/Button'

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
 *
 * ── Rascunho e botão, e por que não salvava sozinho ────────────────────────
 * Cada campo salvava no `onChange`, e o cabeçalho não ficava sabendo: o
 * `Mercado` pergunta as preferências uma vez, ao montar. Ligar uma fonte de
 * preço parecia não ter efeito nenhum até recarregar a página inteira, e sem
 * botão não havia nem como distinguir "não salvou" de "salvou e não apareceu".
 *
 * Agora a tela tem um rascunho, o botão diz que há mudança pendente, e salvar
 * avisa quem desenha preço e taxa. O tema é a exceção deliberada: ele aplica na
 * hora, porque é a única preferência cujo efeito **é** a pré-visualização — e
 * o `localStorage` já era cache declarado, não fonte da verdade.
 */
export function Preferencias({
  catalog,
  lang,
  onSalvou,
}: {
  catalog: Catalog
  lang: Lang
  /** avisa o cabeçalho que preço e taxa mudaram */
  onSalvou?: () => void
}) {
  const [salvo, setSalvo] = useState<Prefs | null>(null)
  const [rascunho, setRascunho] = useState<Prefs | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void api
      .preferences()
      .then(p => {
        setSalvo(p)
        setRascunho(p)
        // O servidor manda quando os dois discordam: o tema segue a pessoa
        // entre navegadores, e o localStorage é só cache.
        aplicarTema(p.theme as Tema)
      })
      .catch(err => setErro(mensagemDoErro(catalog, err, lang)))
  }, [catalog, lang])

  if (!rascunho || !salvo) return null

  function mudar(mudanca: Partial<Prefs>): void {
    setConfirmado(false)
    setRascunho(atual => ({ ...atual!, ...mudanca }))
  }

  const pendente =
    rascunho.theme !== salvo.theme ||
    rascunho.currency !== salvo.currency ||
    rascunho.feeSource !== salvo.feeSource ||
    rascunho.priceSources.join() !== salvo.priceSources.join()

  async function salvar(): Promise<void> {
    setSalvando(true)
    setErro(null)
    try {
      const novo = await api.savePreferences(rascunho!)
      setSalvo(novo)
      setRascunho(novo)
      setConfirmado(true)
      // A prévia relê preço e taxa. Sem isto, ligar uma fonte só aparecia
      // depois de recarregar a página.
      onSalvou?.()
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    } finally {
      setSalvando(false)
    }
  }

  function alternarFonte(fonte: FonteDePreco): void {
    const atual = rascunho!.priceSources
    mudar({
      priceSources: atual.includes(fonte)
        ? atual.filter(f => f !== fonte)
        : [...atual, fonte],
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <label htmlFor="tema" className={rotulo}>
          {render(catalog, 'prefs.theme', {}, lang)}
        </label>
        <select
          id="tema"
          value={rascunho.theme}
          onChange={e => {
            const tema = e.target.value as Tema
            // Tema aplica na hora: o efeito dele é a própria previsão.
            aplicarTema(tema)
            mudar({ theme: tema })
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
                checked={rascunho.priceSources.includes(f)}
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
          value={rascunho.currency}
          onChange={e => mudar({ currency: e.target.value })}
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
          value={rascunho.feeSource}
          onChange={e => mudar({ feeSource: e.target.value as Prefs['feeSource'] })}
          className={campo}
        >
          <option value="off">{render(catalog, 'prefs.feeOff', {}, lang)}</option>
          <option value="node">{render(catalog, 'prefs.feeNode', {}, lang)}</option>
          <option value="mempool">{render(catalog, 'prefs.feeMempool', {}, lang)}</option>
        </select>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={!pendente || salvando}
          onClick={() => void salvar()}
        >
          {render(catalog, salvando ? 'prefs.saving' : 'prefs.save', {}, lang)}
        </Button>
        {pendente && !salvando && (
          <span className="text-sm" style={{ color: 'var(--sb-warning)' }}>
            {render(catalog, 'prefs.unsaved', {}, lang)}
          </span>
        )}
        {confirmado && !pendente && (
          <span className="text-sm" style={{ color: 'var(--sb-sovereign)' }}>
            {render(catalog, 'prefs.saved', {}, lang)}
          </span>
        )}
      </div>

      {erro && (
        <p role="alert" className="text-sm" style={{ color: 'var(--sb-critical)' }}>
          {erro}
        </p>
      )}
    </div>
  )
}
