import { useEffect, useState, type FormEvent } from 'react'
import {
  api,
  mensagemDoErro,
  type Backend,
  type Catalog,
  type Lang,
} from '../lib/api'
import { render } from '../lib/i18n'
import { Button } from './ui/Button'
import { BackendForm } from './BackendForm'

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const ORDEM_DAS_REDES = ['mainnet', 'signet', 'testnet'] as const

export function AddWallet({
  catalog,
  lang,
  onAdded,
}: {
  catalog: Catalog
  lang: Lang
  onAdded: () => void
}) {
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [endereco, setEndereco] = useState('')
  // Vigiar a carteira inteira é o caso comum; um endereço só é o de quem
  // publica endereço de doação e não quer entregar a carteira ao watchtower.
  const [modo, setModo] = useState<'key' | 'address'>('key')
  // `xpub` e `tpub` usam as mesmas version bytes para legado, segwit
  // aninhado e native segwit. Quando a fonte escolhida exige registro de
  // descriptor não há a quem perguntar, e o palpite errado mostra saldo zero
  // sem erro nenhum — por isso o campo aparece só para essas chaves.
  const [tipoDeScript, setTipoDeScript] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [backends, setBackends] = useState<Backend[]>([])
  const [escolhido, setEscolhido] = useState<number | null>(null)
  const [abrindoBackend, setAbrindoBackend] = useState(false)

  const [escondidas, setEscondidas] = useState(0)

  useEffect(() => {
    void api
      .backends()
      .then(lista => {
        // Fonte que já respondeu que **não** sai do seletor. Oferecer uma
        // fonte morta ao lado das que funcionam foi o que fez a carteira de
        // mainnet ficar em `fetch failed` sem ninguém entender por quê — e a
        // pessoa não tem como saber, olhando a lista, qual delas está de pé.
        // `unknown` fica: é fonte não medida, e não fonte ruim.
        const vivas = lista.filter(b => b.status !== 'down')
        setEscondidas(lista.length - vivas.length)
        setBackends(vivas)
        setEscolhido(atual => atual ?? vivas[0]?.id ?? null)
      })
      .catch(() => setBackends([]))
  }, [])

  const atual = backends.find(b => b.id === escolhido) ?? null

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await api.addWallet(
        label.trim(),
        modo === 'address'
          ? { address: endereco.trim() }
          : { key: key.trim(), ...(tipoDeScript ? { scriptType: tipoDeScript } : {}) },
        escolhido ?? undefined,
      )
      setLabel('')
      setKey('')
      setEndereco('')
      setTipoDeScript('')
      onAdded()
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    } finally {
      setEnviando(false)
    }
  }

  const chaveAmbigua = /^[xt]pub[1-9A-HJ-NP-Za-km-z]+$/.test(key.trim())

  const campo =
    'w-full rounded border border-line bg-bg px-3 py-2 text-sm placeholder:text-faint'

  return (
    <form onSubmit={enviar} className="rounded border border-line bg-surface px-[18px] py-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-label text-faint">
        {render(catalog, 'wallets.formTitle', {}, lang)}
      </h3>

      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder={render(catalog, 'wallets.labelPlaceholder', {}, lang)}
        className={`mb-2 ${campo}`}
      />
      <div className="mb-2 flex gap-1" role="group">
        {(['key', 'address'] as const).map(m => (
          <Button
            key={m}
            variant={modo === m ? 'secondary' : 'ghost'}
            onClick={() => setModo(m)}
            aria-pressed={modo === m}
            className="flex-1"
          >
            {render(catalog, m === 'key' ? 'wallets.modeKey' : 'wallets.modeAddress', {}, lang)}
          </Button>
        ))}
      </div>

      {modo === 'key' ? (
        <textarea
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder={render(catalog, 'wallets.keyPlaceholder', {}, lang)}
          rows={3}
          className={`mb-2 resize-none ${campo}`}
        />
      ) : (
        <>
          <input
            value={endereco}
            onChange={e => setEndereco(e.target.value)}
            placeholder={render(catalog, 'wallets.addressPlaceholder', {}, lang)}
            className={`mb-2 ${campo}`}
          />
          <p className="mb-2 font-prose text-sm leading-relaxed text-faint">
            {render(catalog, 'wallets.addressNote', {}, lang)}
          </p>
        </>
      )}

      {modo === 'key' && chaveAmbigua && (
        <>
          <label
            htmlFor="tipo-de-script"
            className="mb-1 block text-xs uppercase tracking-label text-faint"
          >
            {render(catalog, 'wallets.scriptType', {}, lang)}
          </label>
          <select
            id="tipo-de-script"
            value={tipoDeScript}
            onChange={e => setTipoDeScript(e.target.value)}
            className={`mb-2 ${campo}`}
          >
            <option value="">{render(catalog, 'wallets.scriptTypeAuto', {}, lang)}</option>
            <option value="p2wpkh">p2wpkh · native segwit</option>
            <option value="p2sh-p2wpkh">p2sh-p2wpkh · nested segwit</option>
            <option value="p2pkh">p2pkh · legacy</option>
          </select>
          <p className="mb-2 font-prose text-sm leading-relaxed text-faint">
            {render(catalog, 'wallets.scriptTypeNote', {}, lang)}
          </p>
        </>
      )}

      {/* Escolher o backend é escolher quem vê os endereços consultados. Fica
          no mesmo formulário, e não numa tela de configuração distante, porque
          é uma decisão sobre esta carteira. */}
      <label htmlFor="backend-da-carteira" className="mb-1 block text-xs uppercase tracking-label text-faint">
        {render(catalog, 'backends.title', {}, lang)}
      </label>
      <div className="mb-2 flex gap-2">
        <select
          id="backend-da-carteira"
          value={escolhido ?? ''}
          onChange={e => setEscolhido(Number(e.target.value))}
          className={campo}
        >
          {ORDEM_DAS_REDES.flatMap(rede => {
            const daRede = backends.filter(b => b.network === rede)
            if (daRede.length === 0) return []
            return [
              <optgroup key={rede} label={render(catalog, `network.${rede}`, {}, lang)}>
                {daRede.map(b => (
                  <option key={b.id} value={b.id}>
                    {render(catalog, `network.${b.network}`, {}, lang)} · {host(b.url)} · {render(catalog, `backends.${b.scope}`, {}, lang)}
                  </option>
                ))}
              </optgroup>,
            ]
          })}
        </select>
        {!abrindoBackend && (
          <Button variant="secondary" onClick={() => setAbrindoBackend(true)} className="shrink-0">
            {render(catalog, 'backends.newSource', {}, lang)}
          </Button>
        )}
      </div>

      {escondidas > 0 && (
        <p className="mb-2 font-prose text-sm leading-relaxed text-faint">
          {render(catalog, 'backends.hiddenDown', { n: escondidas }, lang)}
        </p>
      )}

      {atual?.isPublic && (
        <p className="mb-2 font-prose text-sm leading-relaxed" style={{ color: 'var(--sb-public)' }}>
          {render(catalog, 'backends.publicNote', {}, lang)}
        </p>
      )}

      {abrindoBackend && (
        <div className="mb-3">
          <BackendForm
            catalog={catalog}
            lang={lang}
            network={atual?.network ?? 'signet'}
            onSaved={id => {
              setAbrindoBackend(false)
              void api.backends().then(lista => {
                setBackends(lista)
                setEscolhido(id)
              })
            }}
          />
        </div>
      )}

      <p className="mb-3 font-prose text-sm leading-relaxed text-faint">
        {render(catalog, 'wallets.watchOnly', {}, lang)}
      </p>

      {erro && (
        <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--sb-critical)' }}>
          {erro}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={
          enviando ||
          !label.trim() ||
          (modo === 'key' ? !key.trim() : !endereco.trim())
        }
      >
        {render(catalog, enviando ? 'wallets.submitting' : 'wallets.submit', {}, lang)}
      </Button>
    </form>
  )
}
