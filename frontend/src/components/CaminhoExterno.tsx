import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  api,
  mensagemDoErro,
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

const rotulo = 'text-xs uppercase tracking-label text-faint'
const bloco = 'rounded border border-line bg-bg p-2 text-xs overflow-x-auto'

/**
 * Um caminho externo por inteiro: estado medido, endereço, passo a passo, o que
 * ele enxerga, o que fazer quando não funciona, e o controle quando existe.
 *
 * A página é a mesma para os três caminhos; o que muda entre elas é a descrição
 * em `lib/caminhos.ts`. Um quarto caminho é uma entrada lá e um punhado de
 * frases no catálogo, e não uma quarta tela para manter em dia.
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
  const [estado, setEstado] = useState<Acessos | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoDoControle | null>(null)
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

  const endereco = estado ? enderecoDoCaminho(estado, caminho) : null
  const url = endereco ? urlDoCaminho(desc, endereco) : null

  useEffect(() => {
    if (!url) return setQr(null)
    // O QR existe para não digitar 56 caracteres no celular.
    void QRCode.toDataURL(url, { margin: 1, width: 220 })
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg">{t('access.' + caminho)}</h2>
        <EstadoDoCaminho
          status={info.status}
          statusSource={info.statusSource}
          catalog={catalog}
          lang={lang}
        />
      </header>

      <section>
        <h3 className={rotulo}>{t('access.address')}</h3>
        {info.enabled && endereco && url ? (
          <>
            <p className="mt-1 break-all font-mono text-sm">{endereco}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Copiar texto={url} catalog={catalog} lang={lang} />
              <Button as="a" href={url} target="_blank" rel="noreferrer">
                {t('access.open')}
              </Button>
            </div>
            {qr && <img src={qr} alt={endereco} className="mt-2 rounded" />}
          </>
        ) : (
          <p className="mt-1 text-sm text-faint">{t('access.off')}</p>
        )}
      </section>

      <section>
        <h3 className={rotulo}>{t('access.steps')}</h3>
        <ol className="mt-1 flex flex-col gap-3">
          {desc.passos.map((passo, i) => (
            <li key={passo.chave} data-testid="passo">
              <p className="font-prose text-sm leading-relaxed">
                {i + 1}. {t(passo.chave)}
              </p>
              {passo.comando && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <pre className={bloco}>{passo.comando}</pre>
                  <Copiar texto={passo.comando} catalog={catalog} lang={lang} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className={rotulo}>{t('access.sees')}</h3>
        {/* A linha da Cloudflare não depende de configuração e não é nota de
            rodapé: quem termina o TLS enxerga o tráfego em claro, e oferecer o
            caminho sem dizer isso seria fazer com o usuário o que este produto
            denuncia nos exploradores públicos. */}
        <p
          data-testid="o-que-ve"
          className="mt-1 font-prose text-sm leading-relaxed"
          style={{
            color: caminho === 'cloudflare' ? 'var(--sb-warning)' : 'var(--sb-text-muted)',
          }}
        >
          {t(`access.${caminho}.sees`)}
        </p>
      </section>

      <section>
        <h3 className={rotulo}>{t('access.trouble')}</h3>
        <ul className="mt-1 flex flex-col gap-2">
          {Array.from({ length: desc.problemas }, (_, i) => (
            <li
              key={i}
              data-testid="problema"
              className="font-prose text-sm leading-relaxed text-muted"
            >
              {t(`access.${caminho}.trouble${i + 1}`)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className={rotulo}>{t('access.controlTitle')}</h3>
        {!control.available ? (
          <p className="mt-1 font-prose text-sm leading-relaxed text-muted">
            {t('access.socketOff')}
          </p>
        ) : !control.isAdmin ? (
          <p className="mt-1 font-prose text-sm leading-relaxed text-muted">
            {t('access.adminOnlyNote')}
          </p>
        ) : (
          <>
            {/* O que o socket custa fica na tela, na mesma régua do aviso da
                Cloudflare: a decisão de 28/08 abriu esta superfície de
                propósito, e quem opera precisa saber disso o tempo todo. */}
            <p
              className="mt-1 font-prose text-sm leading-relaxed"
              style={{ color: 'var(--sb-warning)' }}
            >
              {t('access.socketNote')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
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
              {ocupado && <span className="text-sm text-faint">{t('access.working')}</span>}
            </div>
          </>
        )}

        {resultado && !resultado.ok && (
          <div className="mt-2">
            <p
              className="font-prose text-sm leading-relaxed"
              style={{ color: 'var(--sb-warning)' }}
            >
              {resultado.reason === 'notCreated' ? t('access.runOnce') : resultado.hint}
            </p>
            {resultado.command && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <pre className={bloco}>{resultado.command}</pre>
                <Copiar texto={resultado.command} catalog={catalog} lang={lang} />
              </div>
            )}
          </div>
        )}

        {erro && (
          <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--sb-critical)' }}>
            {erro}
          </p>
        )}
      </section>

      {/* O arquivo mora no repositório, e não numa URL: ligar para um domínio
          de terceiro faria a página de acessos entregar a um terceiro que
          alguém está lendo sobre acessos, o que é exatamente o que ela ensina
          a evitar. Quem se hospeda tem o repositório. */}
      <section>
        <h3 className={rotulo}>{t('access.docs')}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <pre className={bloco}>{desc.doc}</pre>
          <Copiar texto={desc.doc} catalog={catalog} lang={lang} />
        </div>
      </section>
    </div>
  )
}
