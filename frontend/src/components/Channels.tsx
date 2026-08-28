import { useEffect, useState } from 'react'
import { api, mensagemDoErro, type Catalog, type Channel, type Lang } from '../lib/api'
import { render } from '../lib/i18n'
import { Button } from './ui/Button'

type Resultado = { id: number; ok: boolean; error?: string }

export function Channels({ catalog, lang }: { catalog: Catalog; lang: Lang }) {
  const [canais, setCanais] = useState<Channel[] | null>(null)
  const [topico, setTopico] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function recarregar(): Promise<void> {
    try {
      setCanais(await api.channels())
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    }
  }

  useEffect(() => {
    void recarregar()
  }, [])

  async function cadastrar(): Promise<void> {
    setErro(null)
    setOcupado(true)
    try {
      await api.addChannel({ kind: 'ntfy', topic: topico.trim() })
      setTopico('')
      await recarregar()
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    } finally {
      setOcupado(false)
    }
  }

  async function testar(id: number): Promise<void> {
    setResultado(null)
    setOcupado(true)
    try {
      const r = await api.testChannel(id)
      setResultado({ id, ...r })
    } catch (err) {
      setResultado({ id, ok: false, error: mensagemDoErro(catalog, err, lang) })
    } finally {
      setOcupado(false)
    }
  }

  if (canais === null) return null

  const campo =
    'w-full rounded border border-line bg-bg px-3 py-2 text-sm placeholder:text-faint'

  return (
    <section>
      <h2 className="mb-[10px] text-xs font-semibold uppercase tracking-label text-faint">
        {render(catalog, 'channels.title', {}, lang)}
      </h2>

      {/* O cartão de como funciona.
          Quem nunca usou ntfy chegava a um campo de texto pedindo "tópico" sem
          nada dizendo o que é um tópico, onde se assina, nem o que a mensagem
          carrega. O último parágrafo é o que mais importa: o alerta de dust e o
          de address reuse levam o endereço, e quem souber o tópico lê. */}
      <div className="mb-3 rounded border border-line bg-surface px-4 py-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-label text-faint">
          {render(catalog, 'channels.howTitle', {}, lang)}
        </h3>
        <ol className="flex list-decimal flex-col gap-[6px] pl-4 font-prose text-sm leading-relaxed text-muted">
          <li>{render(catalog, 'channels.how1', {}, lang)}</li>
          <li>{render(catalog, 'channels.how2', {}, lang)}</li>
          <li>{render(catalog, 'channels.how3', {}, lang)}</li>
        </ol>
        <p
          className="mt-2 font-prose text-sm leading-relaxed"
          style={{ color: 'var(--sb-warning)' }}
        >
          {render(catalog, 'channels.how4', {}, lang)}
        </p>
      </div>

      {canais.length === 0 && (
        <p className="mb-2 font-prose text-sm leading-relaxed text-muted">
          {render(catalog, 'channels.empty', {}, lang)}
        </p>
      )}

      <ul className="mb-2 flex flex-col gap-2">
        {canais.map(c => (
          <li key={c.id} className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-label">{c.kind}</span>
            <span className="flex items-center gap-3">
              <Button disabled={ocupado} onClick={() => void testar(c.id)}>
                {render(catalog, 'channels.test', {}, lang)}
              </Button>
              <Button
                variant="danger"
                onClick={() => void api.removeChannel(c.id).then(recarregar)}
              >
                {render(catalog, 'channels.remove', {}, lang)}
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {resultado && (
        <p
          role="status"
          className="mb-2 font-prose text-sm leading-relaxed"
          style={{ color: resultado.ok ? 'var(--sb-sovereign)' : 'var(--sb-critical)' }}
        >
          {resultado.ok
            ? render(catalog, 'channels.testOk', {}, lang)
            : render(catalog, 'channels.testFail', { error: resultado.error ?? '' }, lang)}
        </p>
      )}

      <input
        value={topico}
        onChange={e => setTopico(e.target.value)}
        placeholder={render(catalog, 'channels.topicPlaceholder', {}, lang)}
        className={`mb-1 ${campo}`}
      />
      {/* O tópico é a única barreira entre as notificações e quem quiser
          lê-las: quem cadastra precisa saber disso na hora de escolher. */}
      <p className="mb-2 font-prose text-sm leading-relaxed text-faint">
        {render(catalog, 'channels.topicHint', {}, lang)}
      </p>

      {erro && (
        <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--sb-critical)' }}>
          {erro}
        </p>
      )}

      <Button
        variant="primary"
        disabled={ocupado || !topico.trim()}
        onClick={() => void cadastrar()}
      >
        {render(catalog, 'channels.add', {}, lang)}
      </Button>
    </section>
  )
}
