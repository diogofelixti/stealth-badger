import { useState } from 'react'
import { api, mensagemDoErro, type Catalog, type Lang, type Network } from '../lib/api'
import { render } from '../lib/i18n'
import { PRESETS, pareceLocalhost, presetPor, type PresetId } from '../lib/presets'
import { Button } from './ui/Button'

const campo =
  'w-full rounded border border-line bg-bg px-3 py-2 text-sm placeholder:text-faint'
const rotulo = 'mb-1 block text-xs uppercase tracking-label text-faint'

/**
 * Cadastro de fonte de consulta, pelo catálogo.
 *
 * O formulário pergunta o que aquela fonte precisa, e nada mais: o Fulcrum
 * quer host e porta, o mempool.space não quer nada, e o Bitcoin Core quer
 * autenticação. Antes disto eram três palavras técnicas num `select` e um
 * campo de URL livre — quem tem um Fulcrum não sabe que ele é `electrum`.
 */
export function BackendForm({
  catalog,
  lang,
  network,
  onSaved,
}: {
  catalog: Catalog
  lang: Lang
  network: Network
  onSaved: (backendId: number) => void
}) {
  const [presetId, setPresetId] = useState<PresetId>('core')
  const [host, setHost] = useState('')
  const [porta, setPorta] = useState<string>('')
  const [url, setUrl] = useState('')
  const [apelido, setApelido] = useState('')
  const [modoAuth, setModoAuth] = useState<'cookie' | 'userpass'>('cookie')
  const [cookiePath, setCookiePath] = useState('')
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [publico, setPublico] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const preset = presetPor(presetId)
  const portaEfetiva = porta || String(preset.portaPadrao?.[network] ?? '')

  function trocarPreset(id: PresetId): void {
    setPresetId(id)
    setPorta('')
    setErro(null)
    setPublico(presetPor(id).isPublic)
  }

  async function salvar(): Promise<void> {
    setErro(null)
    setSalvando(true)
    try {
      const criado = await api.addBackend({
        preset: presetId,
        network,
        isPublic: publico,
        ...(preset.pede === 'host-porta'
          ? { host: host.trim(), port: Number(portaEfetiva) }
          : {}),
        ...(preset.pede === 'url' ? { url: url.trim() } : {}),
        ...(apelido.trim() ? { label: apelido.trim() } : {}),
        ...(preset.precisaAutenticar
          ? {
              auth:
                modoAuth === 'cookie'
                  ? { mode: 'cookie' as const, cookiePath: cookiePath.trim() }
                  : { mode: 'userpass' as const, user: usuario.trim(), password: senha },
            }
          : {}),
      })
      onSaved(criado.id)
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="rounded border border-line px-3 py-3">
      <label htmlFor="fonte-preset" className={rotulo}>
        {render(catalog, 'backends.preset', {}, lang)}
      </label>
      <select
        id="fonte-preset"
        value={presetId}
        onChange={e => trocarPreset(e.target.value as PresetId)}
        className={`mb-2 ${campo}`}
      >
        {PRESETS.map(p => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>

      {preset.pede === 'host-porta' && (
        <>
          <label htmlFor="fonte-host" className={rotulo}>
            {render(catalog, 'backends.host', {}, lang)}
          </label>
          <input
            id="fonte-host"
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder="host.docker.internal"
            className={`mb-2 ${campo}`}
          />
          {pareceLocalhost(host) && (
            <p className="mb-2 font-prose text-sm leading-relaxed" style={{ color: 'var(--sb-warning)' }}>
              {render(catalog, 'backends.dockerHint', {}, lang)}
            </p>
          )}

          <label htmlFor="fonte-porta" className={rotulo}>
            {render(catalog, 'backends.port', {}, lang)}
          </label>
          <input
            id="fonte-porta"
            inputMode="numeric"
            value={portaEfetiva}
            onChange={e => setPorta(e.target.value)}
            className={`mb-2 ${campo}`}
          />
        </>
      )}

      {preset.pede === 'url' && (
        <>
          <label htmlFor="fonte-url" className={rotulo}>
            {render(catalog, 'backends.urlPlaceholder', {}, lang)}
          </label>
          <input
            id="fonte-url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            className={`mb-2 ${campo}`}
          />
        </>
      )}

      {preset.precisaAutenticar && (
        <>
          <span className={rotulo}>{render(catalog, 'backends.auth', {}, lang)}</span>
          <div className="mb-2 flex gap-1">
            {(['cookie', 'userpass'] as const).map(m => (
              <Button
                key={m}
                variant={modoAuth === m ? 'secondary' : 'ghost'}
                aria-pressed={modoAuth === m}
                onClick={() => setModoAuth(m)}
                className="flex-1"
              >
                {render(
                  catalog,
                  m === 'cookie' ? 'backends.authCookie' : 'backends.authUserPass',
                  {},
                  lang,
                )}
              </Button>
            ))}
          </div>

          {modoAuth === 'cookie' ? (
            <>
              <label htmlFor="fonte-cookie" className={rotulo}>
                {render(catalog, 'backends.cookiePath', {}, lang)}
              </label>
              <input
                id="fonte-cookie"
                value={cookiePath}
                onChange={e => setCookiePath(e.target.value)}
                placeholder="/bitcoin/.cookie"
                className={`mb-2 ${campo}`}
              />
            </>
          ) : (
            <>
              <label htmlFor="fonte-usuario" className={rotulo}>
                {render(catalog, 'backends.user', {}, lang)}
              </label>
              <input
                id="fonte-usuario"
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                className={`mb-2 ${campo}`}
              />
              <label htmlFor="fonte-senha" className={rotulo}>
                {render(catalog, 'backends.password', {}, lang)}
              </label>
              <input
                id="fonte-senha"
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                className={`mb-2 ${campo}`}
              />
            </>
          )}

          <p className="mb-2 font-prose text-sm leading-relaxed text-faint">
            {render(catalog, 'backends.credentialNote', {}, lang)}
          </p>
        </>
      )}

      <label htmlFor="fonte-apelido" className={rotulo}>
        {render(catalog, 'backends.labelField', {}, lang)}
      </label>
      <input
        id="fonte-apelido"
        value={apelido}
        onChange={e => setApelido(e.target.value)}
        className={`mb-2 ${campo}`}
      />

      <label className="mb-2 flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={publico} onChange={e => setPublico(e.target.checked)} />
        {render(catalog, 'backends.isPublic', {}, lang)}
      </label>

      {erro && (
        <p role="alert" className="mb-2 text-xs" style={{ color: 'var(--sb-critical)' }}>
          {erro}
        </p>
      )}

      <Button variant="primary" disabled={salvando} onClick={() => void salvar()}>
        {render(catalog, 'backends.save', {}, lang)}
      </Button>
    </div>
  )
}
