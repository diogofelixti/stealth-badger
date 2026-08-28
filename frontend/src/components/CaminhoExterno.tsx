import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  api,
  mensagemDoErro,
  type AccessConfigSummary,
  type Acessos,
  type Catalog,
  type Lang,
  type ResultadoDoControle,
} from '../lib/api'
import { render } from '../lib/i18n'
import {
  CAMINHOS,
  enderecoDoCaminho,
  urlDoCaminho,
  type Caminho,
} from '../lib/caminhos'
import { Button } from './ui/Button'
import { Copiar } from './ui/Copiar'
import { EstadoDoCaminho } from './EstadoDoCaminho'

const cartao = 'rounded-lg border border-line bg-surface p-5'
const titulo = 'mb-3 text-xs uppercase tracking-label text-faint'
const codigo =
  'min-w-0 flex-grow overflow-x-auto rounded border border-line bg-bg px-3 py-2 font-mono text-xs'

/** O comando com o botão ao lado, que é a forma que se repete na página. */
function Comando({
  texto,
  catalog,
  lang,
}: {
  texto: string
  catalog: Catalog
  lang: Lang
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <pre className={codigo}>{texto}</pre>
      <Copiar texto={texto} catalog={catalog} lang={lang} />
    </div>
  )
}

/**
 * Um caminho externo por inteiro: estado medido, endereço, passo a passo, o que
 * ele enxerga, o que fazer quando não funciona, e o controle quando existe.
 *
 * A página é a mesma para os três caminhos; o que muda entre elas é a descrição
 * em `lib/caminhos.ts`. Um quarto caminho é uma entrada lá e um punhado de
 * frases no catálogo, e não uma quarta tela para manter em dia.
 *
 * A forma é de cartões, e não de uma coluna contínua de seções: a primeira
 * versão empilhava sete blocos com o mesmo peso e sem moldura, e não dava para
 * ver onde um assunto terminava e o outro começava. Cada cartão responde uma
 * pergunta, e o primeiro deles — identidade, estado e endereço — é o que a
 * pessoa veio ver.
 */
export function CaminhoExterno({
  caminho,
  catalog,
  lang,
}: {
  caminho: Caminho
  catalog: Catalog
  lang: Lang
}) {
  const desc = CAMINHOS[caminho]
  const hostnameId = `access-${desc.perfil}-hostname`
  const segredoId = `access-${desc.perfil}-secret`
  const [estado, setEstado] = useState<Acessos | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoDoControle | null>(null)
  const [config, setConfig] = useState<AccessConfigSummary | null>(null)
  const [wizardAberto, setWizardAberto] = useState(false)
  const [hostname, setHostname] = useState('')
  const [segredo, setSegredo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(
    () =>
      api
        .access()
        .then(setEstado)
        .catch(() => setEstado(null)),
    [],
  )

  useEffect(() => {
    void carregar()
  }, [carregar])

  /**
   * Enquanto o container está sendo criado, a página relê sozinha.
   *
   * Criar puxa imagem, e a rota volta na hora de propósito: uma requisição
   * pendurada por dois minutos aparece para quem clicou como painel travado.
   * Quem conta o fim é esta releitura, e não o botão que foi clicado.
   */
  useEffect(() => {
    if (!estado?.[caminho]?.creating) return
    const relogio = setInterval(() => void carregar(), 4000)
    return () => clearInterval(relogio)
  }, [estado, caminho, carregar])

  useEffect(() => {
    if (!estado?.control.available || !estado.control.isAdmin) return
    void api
      .accessConfig(desc.perfil)
      .then(proximo => {
        setConfig(proximo)
        setHostname(proximo.hostname ?? '')
      })
      .catch(() => setConfig(null))
  }, [desc.perfil, estado?.control.available, estado?.control.isAdmin])

  const endereco = estado ? enderecoDoCaminho(estado, caminho) : null
  const url = endereco ? urlDoCaminho(desc, endereco) : null

  useEffect(() => {
    if (!url) return setQr(null)
    // O QR existe para não digitar 56 caracteres no celular.
    void QRCode.toDataURL(url, { margin: 1, width: 200 })
      .then(setQr)
      .catch(() => setQr(null))
  }, [url])

  if (!estado) return null

  const info = estado[caminho]
  const { control } = estado
  const t = (chave: string) => render(catalog, chave, {}, lang)

  async function controlar(action: 'up' | 'down'): Promise<void> {
    setOcupado(true)
    setErro(null)
    setResultado(null)
    try {
      setResultado(await api.accessControl(desc.perfil, action))
      // Relê em vez de supor: o engine aceitou o pedido, e quem diz se o
      // caminho subiu é a próxima medição, não o botão que foi clicado.
      await carregar()
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    } finally {
      setOcupado(false)
    }
  }

  async function salvarConfig(): Promise<void> {
    setOcupado(true)
    setErro(null)
    try {
      const salvo = await api.saveAccessConfig(desc.perfil, {
        ...(desc.perfil === 'tailscale' ? { authKey: segredo } : {}),
        ...(desc.perfil === 'cloudflared' ? { token: segredo } : {}),
        ...(hostname ? { hostname } : {}),
      })
      setConfig(salvo)
      setWizardAberto(false)
      setSegredo('')
      await carregar()
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Identidade, estado e endereço ─────────────────────────────── */}
      <section className={cartao}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg">{t('access.' + caminho)}</h2>
          <EstadoDoCaminho
            status={info.status}
            statusSource={info.statusSource}
            catalog={catalog}
            lang={lang}
          />
        </div>

        <h3 className={titulo}>{t('access.address')}</h3>
        {info.enabled && endereco && url ? (
          <div className="flex flex-wrap items-start gap-5">
            <div className="min-w-0 flex-grow">
              <p className="break-all font-mono text-sm">{endereco}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Copiar texto={url} catalog={catalog} lang={lang} />
                <Button as="a" href={url} target="_blank" rel="noreferrer">
                  {t('access.open')}
                </Button>
              </div>
            </div>
            {qr && (
              <img
                src={qr}
                alt={endereco}
                className="shrink-0 rounded border border-line bg-bg p-1"
                width={140}
                height={140}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-faint">{t('access.off')}</p>
        )}
      </section>

      {/* ── Passo a passo ─────────────────────────────────────────────── */}
      <section className={cartao}>
        <h3 className={titulo}>{t('access.steps')}</h3>
        <ol className="flex flex-col gap-4">
          {desc.passos.map((passo, i) => (
            <li key={passo.chave} data-testid="passo" className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-xs"
                style={{ color: 'var(--sb-accent)' }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-grow">
                {/* O número também vai no texto: leitor de tela não lê a
                    bolinha, e a ordem é parte da instrução. */}
                <p className="font-prose text-sm leading-relaxed">
                  <span className="sr-only">{i + 1}. </span>
                  {t(passo.chave)}
                </p>
                {passo.comando && (
                  <Comando texto={passo.comando} catalog={catalog} lang={lang} />
                )}
              </div>
            </li>
          ))}
        </ol>

        {/* O caminho curto: um comando por ação, em vez de decorar as flags. */}
        <div className="mt-5 border-t border-line pt-4">
          <p className="font-prose text-sm leading-relaxed text-muted">
            {t('access.script')}
          </p>
          <Comando
            texto={`./scripts/acessos.sh ${desc.perfil} up`}
            catalog={catalog}
            lang={lang}
          />
        </div>
      </section>

      {/* ── O que ele enxerga ─────────────────────────────────────────── */}
      <section
        className={cartao}
        style={
          caminho === 'cloudflare' ? { borderColor: 'var(--sb-warning)' } : undefined
        }
      >
        <h3 className={titulo}>{t('access.sees')}</h3>
        {/* A linha da Cloudflare não depende de configuração e não é nota de
            rodapé: quem termina o TLS enxerga o tráfego em claro, e oferecer o
            caminho sem dizer isso seria fazer com o usuário o que este produto
            denuncia nos exploradores públicos. */}
        <p
          data-testid="o-que-ve"
          className="font-prose text-sm leading-relaxed"
          style={{
            color:
              caminho === 'cloudflare' ? 'var(--sb-warning)' : 'var(--sb-text-muted)',
          }}
        >
          {t(`access.${caminho}.sees`)}
        </p>
      </section>

      {/* ── Quando não funciona ───────────────────────────────────────── */}
      <section className={cartao}>
        <h3 className={titulo}>{t('access.trouble')}</h3>
        <ul className="flex flex-col gap-3">
          {Array.from({ length: desc.problemas }, (_, i) => (
            <li
              key={i}
              data-testid="problema"
              className="border-l-2 border-line pl-3 font-prose text-sm leading-relaxed text-muted"
            >
              {t(`access.${caminho}.trouble${i + 1}`)}
            </li>
          ))}
        </ul>
      </section>

      {/* ── Ligar e desligar ──────────────────────────────────────────── */}
      <section className={cartao}>
        <h3 className={titulo}>{t('access.controlTitle')}</h3>
        {!control.available ? (
          <>
            <p className="font-prose text-sm leading-relaxed text-muted">
              {t('access.socketOff')}
            </p>
            <Comando
              texto="./scripts/acessos.sh controle"
              catalog={catalog}
              lang={lang}
            />
          </>
        ) : !control.isAdmin ? (
          <p className="font-prose text-sm leading-relaxed text-muted">
            {t('access.adminOnlyNote')}
          </p>
        ) : (
          <>
            {/* O que o socket custa fica na tela, na mesma régua do aviso da
                Cloudflare: a decisão de 28/08 abriu esta superfície de
                propósito, e quem opera precisa saber disso o tempo todo. */}
            <p
              className="border-l-2 py-1 pl-3 font-prose text-sm leading-relaxed"
              style={{ color: 'var(--sb-warning)', borderColor: 'var(--sb-warning)' }}
            >
              {t('access.socketNote')}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {desc.perfil !== 'tor' && (
                <Button
                  variant="secondary"
                  disabled={ocupado}
                  onClick={() => setWizardAberto(v => !v)}
                  aria-expanded={wizardAberto}
                >
                  {t('access.configure')}
                </Button>
              )}
              <Button
                variant="primary"
                disabled={ocupado}
                onClick={() => void controlar('up')}
              >
                {t('access.activate')}
              </Button>
              <Button disabled={ocupado} onClick={() => void controlar('down')}>
                {t('access.deactivate')}
              </Button>
              {ocupado && (
                <span className="text-sm text-faint">{t('access.working')}</span>
              )}
              {desc.perfil !== 'tor' && config && (
                <span className="text-sm text-faint">
                  {t(config.configured ? 'access.configured' : 'access.notConfigured')}
                </span>
              )}
            </div>

            {wizardAberto && desc.perfil !== 'tor' && (
              <div className="mt-4 grid gap-3 rounded border border-line bg-bg p-3">
                <h4 className={titulo}>{t('access.configTitle')}</h4>
                <label htmlFor={hostnameId} className="grid gap-1 text-sm">
                  <span className="text-xs uppercase tracking-label text-faint">
                    {t('access.hostname')}
                  </span>
                  <input
                    id={hostnameId}
                    className="rounded border border-line bg-surface px-3 py-2"
                    value={hostname}
                    onChange={e => setHostname(e.target.value)}
                  />
                </label>
                <label htmlFor={segredoId} className="grid gap-1 text-sm">
                  <span className="text-xs uppercase tracking-label text-faint">
                    {t(desc.perfil === 'tailscale' ? 'access.authKey' : 'access.tunnelToken')}
                  </span>
                  <input
                    id={segredoId}
                    className="rounded border border-line bg-surface px-3 py-2"
                    type="password"
                    value={segredo}
                    onChange={e => setSegredo(e.target.value)}
                  />
                </label>
                <Button
                  variant="primary"
                  disabled={ocupado}
                  onClick={() => void salvarConfig()}
                  className="justify-self-start"
                >
                  {t('access.saveConfig')}
                </Button>
              </div>
            )}
          </>
        )}

        {(info.creating || resultado?.state === 'creating') && (
          <p className="mt-4 font-prose text-sm leading-relaxed" style={{ color: 'var(--sb-warning)' }}>
            {t('access.creating')}
          </p>
        )}

        {!info.creating && info.error && (
          <p className="mt-4 font-prose text-sm leading-relaxed" style={{ color: 'var(--sb-critical)' }}>
            {render(catalog, 'access.createFailed', { reason: info.error }, lang)}
          </p>
        )}

        {resultado && !resultado.ok && (
          <div className="mt-4">
            <p
              className="font-prose text-sm leading-relaxed"
              style={{ color: 'var(--sb-warning)' }}
            >
              {resultado.reason === 'notCreated' ? t('access.runOnce') : resultado.hint}
            </p>
            {/* O caminho automatizado primeiro; o comando cru do compose fica
                embaixo, para quem quiser ver o que o script faz por baixo. */}
            {resultado.reason === 'notCreated' && (
              <Comando
                texto="./scripts/acessos.sh preparar"
                catalog={catalog}
                lang={lang}
              />
            )}
            {resultado.command && (
              <Comando texto={resultado.command} catalog={catalog} lang={lang} />
            )}
          </div>
        )}

        {erro && (
          <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--sb-critical)' }}>
            {erro}
          </p>
        )}
      </section>

      {/* O arquivo mora no repositório, e não numa URL: ligar para um domínio
          de terceiro faria a página de acessos entregar a um terceiro que
          alguém está lendo sobre acessos, o que é exatamente o que ela ensina
          a evitar. Quem se hospeda tem o repositório. */}
      <section className={cartao}>
        <h3 className={titulo}>{t('access.docs')}</h3>
        <Comando texto={desc.doc} catalog={catalog} lang={lang} />
      </section>
    </div>
  )
}
