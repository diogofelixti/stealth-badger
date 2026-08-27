import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { Catalog } from '../src/lib/api'

const access = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return { ...real, api: { ...real.api, access: () => access() } }
})

const { Acessos } = await import('../src/components/Acessos')

const CATALOGO: Catalog = {
  'access.tor': 'Tor',
  'access.torNote': 'Ninguém no meio vê o tráfego nem o destino.',
  'access.tailscale': 'Tailscale',
  'access.tailscaleNote': 'Rede privada. A Tailscale vê metadado de conexão, não o conteúdo.',
  'access.cloudflare': 'Cloudflare Tunnel',
  'access.cloudflareWarning':
    'A Cloudflare termina o TLS e enxerga o seu tráfego em claro.',
  'access.off': 'não configurado',
  'access.howTo': 'Ligar é {comando}, na máquina que hospeda.',
}

beforeEach(() => {
  access.mockReset()
})

describe('Acessos', () => {
  it('sem túnel nenhum, diz que cada caminho não está configurado', async () => {
    access.mockResolvedValue({
      tor: { enabled: false },
      tailscale: { enabled: false },
      cloudflare: { enabled: false, warning: true },
    })

    render(<Acessos catalog={CATALOGO} lang="pt" />)

    await waitFor(() => expect(screen.getAllByText(/não configurado/)).toHaveLength(3))
  })

  // A linha da Cloudflare fica na tela, e não numa nota de rodapé: oferecer o
  // túnel sem dizer isso seria fazer com o usuário o que o produto denuncia.
  it('o aviso da Cloudflare aparece sempre que o caminho está ligado', async () => {
    access.mockResolvedValue({
      tor: { enabled: false },
      tailscale: { enabled: false },
      cloudflare: { enabled: true, hostname: 'painel.exemplo.com', warning: true },
    })

    render(<Acessos catalog={CATALOGO} lang="pt" />)

    await waitFor(() =>
      expect(screen.getByText(/termina o TLS e enxerga o seu tráfego em claro/)).toBeDefined(),
    )
  })

  it('mostra o endereço onion quando o Tor está ligado', async () => {
    const onion = 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion'
    access.mockResolvedValue({
      tor: { enabled: true, onion },
      tailscale: { enabled: false },
      cloudflare: { enabled: false, warning: true },
    })

    render(<Acessos catalog={CATALOGO} lang="pt" />)

    await waitFor(() => expect(screen.getByText(onion)).toBeDefined())
  })
})
