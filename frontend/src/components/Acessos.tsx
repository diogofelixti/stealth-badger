import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api, type Acessos as Estado, type Catalog, type Lang } from '../lib/api'
import { render } from '../lib/i18n'

const rotulo = 'text-xs uppercase tracking-label text-faint'

/**
 * Por onde o painel está acessível de fora — e o que cada caminho enxerga.
 *
 * A página lê, e não controla: ligar é `docker compose --profile tor up -d`,
 * na máquina que hospeda. Um painel que liga túnel sozinho é um painel que se
 * publica sem ninguém mandar.
 */
export function Acessos({ catalog, lang }: { catalog: Catalog; lang: Lang }) {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    void api
      .access()
      .then(setEstado)
      .catch(() => setEstado(null))
  }, [])

  useEffect(() => {
    const onion = estado?.tor.onion
    if (!onion) return
    // O QR existe para não digitar 56 caracteres no celular.
    void QRCode.toDataURL('http://' + onion, { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => setQr(null))
  }, [estado])

  if (!estado) return null

  const comando = (perfil: string) => `docker compose --profile ${perfil} up -d`

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className={rotulo}>{render(catalog, 'access.tor', {}, lang)}</h3>
        <p className="font-prose text-sm leading-relaxed text-muted">
          {render(catalog, 'access.torNote', {}, lang)}
        </p>
        {estado.tor.enabled && estado.tor.onion ? (
          <>
            <p className="mt-1 break-all font-mono text-sm">{estado.tor.onion}</p>
            {qr && <img src={qr} alt={estado.tor.onion} className="mt-2 rounded" />}
          </>
        ) : (
          <p className="mt-1 text-sm text-faint">
            {render(catalog, 'access.off', {}, lang)} ·{' '}
            {render(catalog, 'access.howTo', { comando: comando('tor') }, lang)}
          </p>
        )}
      </section>

      <section>
        <h3 className={rotulo}>{render(catalog, 'access.tailscale', {}, lang)}</h3>
        <p className="font-prose text-sm leading-relaxed text-muted">
          {render(catalog, 'access.tailscaleNote', {}, lang)}
        </p>
        {estado.tailscale.enabled && estado.tailscale.hostname ? (
          <p className="mt-1 break-all font-mono text-sm">{estado.tailscale.hostname}</p>
        ) : (
          <p className="mt-1 text-sm text-faint">
            {render(catalog, 'access.off', {}, lang)} ·{' '}
            {render(catalog, 'access.howTo', { comando: comando('tailscale') }, lang)}
          </p>
        )}
      </section>

      <section>
        <h3 className={rotulo}>{render(catalog, 'access.cloudflare', {}, lang)}</h3>
        {/* Esta frase não depende de configuração: quem termina o TLS enxerga
            o tráfego em claro, e dizer isso é a diferença entre oferecer uma
            escolha e empurrar uma. */}
        <p
          className="font-prose text-sm leading-relaxed"
          style={{ color: 'var(--sb-warning)' }}
        >
          {render(catalog, 'access.cloudflareWarning', {}, lang)}
        </p>
        {estado.cloudflare.enabled && estado.cloudflare.hostname ? (
          <p className="mt-1 break-all font-mono text-sm">{estado.cloudflare.hostname}</p>
        ) : (
          <p className="mt-1 text-sm text-faint">
            {render(catalog, 'access.off', {}, lang)} ·{' '}
            {render(catalog, 'access.howTo', { comando: comando('cloudflared') }, lang)}
          </p>
        )}
      </section>
    </div>
  )
}
