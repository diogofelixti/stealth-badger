import { useEffect, useState } from 'react'
import { api, mensagemDoErro, type Catalog, type Channel, type Lang } from '../lib/api'
import { render } from '../lib/i18n'

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

      {canais.length === 0 && (
        <p className="mb-2 font-prose text-xs leading-relaxed text-muted">
          {render(catalog, 'channels.empty', {}, lang)}
        </p>
      )}

      <ul className="mb-2 flex flex-col gap-2">
        {canais.map(c => (
          <li key={c.id} className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-label">{c.kind}</span>
            <span className="flex items-center gap-3">
              <button
                type="button"
                disabled={ocupado}
                onClick={() => void testar(c.id)}
                className="text-xs uppercase tracking-label disabled:opacity-40"
                style={{ color: 'var(--sb-accent)' }}
              >
                {render(catalog, 'channels.test', {}, lang)}
              </button>
              <button
                type="button"
                onClick={() => void api.removeChannel(c.id).then(recarregar)}
                className="text-xs uppercase tracking-label text-faint hover:text-ink"
              >
                {render(catalog, 'channels.remove', {}, lang)}
              </button>
            </span>
          </li>
        ))}
      </ul>

      {resultado && (
        <p
          role="status"
          className="mb-2 font-prose text-xs leading-relaxed"
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
      <p className="mb-2 font-prose text-xs leading-relaxed text-faint">
        {render(catalog, 'channels.topicHint', {}, lang)}
      </p>

      {erro && (
        <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--sb-critical)' }}>
          {erro}
        </p>
      )}

      <button
        type="button"
        disabled={ocupado || !topico.trim()}
        onClick={() => void cadastrar()}
        className="rounded border border-line px-3 py-2 text-xs uppercase tracking-label disabled:opacity-40"
      >
        {render(catalog, 'channels.add', {}, lang)}
      </button>
    </section>
  )
}
