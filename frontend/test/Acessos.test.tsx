import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
  'access.up': 'de pé',
  'access.down': 'desligado',
  'access.unknown': 'não medido',
  'access.details': 'passo a passo, estado e QR deste caminho',
}

/** A lista mora sob o Layout, e agora leva para a página de cada caminho. */
function montar() {
  render(
    <MemoryRouter>
      <Acessos catalog={CATALOGO} lang="pt" />
    </MemoryRouter>,
  )
}

const DESLIGADO = { status: 'down', statusSource: 'none' } as const
const SEM_CONTROLE = { control: { available: false, isAdmin: false } }

beforeEach(() => {
  access.mockReset()
})

describe('Acessos', () => {
  it('sem túnel nenhum, diz que cada caminho não está configurado', async () => {
    access.mockResolvedValue({
      tor: { enabled: false, ...DESLIGADO },
      tailscale: { enabled: false, ...DESLIGADO },
      cloudflare: { enabled: false, ...DESLIGADO, warning: true },
      ...SEM_CONTROLE,
    })

    montar()

    await waitFor(() => expect(screen.getAllByText(/não configurado/)).toHaveLength(3))
  })

  // A linha da Cloudflare fica na tela, e não numa nota de rodapé: oferecer o
  // túnel sem dizer isso seria fazer com o usuário o que o produto denuncia.
  it('o aviso da Cloudflare aparece sempre que o caminho está ligado', async () => {
    access.mockResolvedValue({
      tor: { enabled: false, ...DESLIGADO },
      tailscale: { enabled: false, ...DESLIGADO },
      cloudflare: {
        enabled: true,
        hostname: 'painel.exemplo.com',
        status: 'up',
        statusSource: 'http',
        warning: true,
      },
      ...SEM_CONTROLE,
    })

    montar()

    await waitFor(() =>
      expect(screen.getByText(/termina o TLS e enxerga o seu tráfego em claro/)).toBeDefined(),
    )
  })

  it('mostra o endereço onion quando o Tor está ligado', async () => {
    const onion = 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion'
    access.mockResolvedValue({
      tor: { enabled: true, onion, status: 'up', statusSource: 'docker' },
      tailscale: { enabled: false, ...DESLIGADO },
      cloudflare: { enabled: false, ...DESLIGADO, warning: true },
      ...SEM_CONTROLE,
    })

    montar()

    await waitFor(() => expect(screen.getByText(onion)).toBeDefined())
  })

  // A lista diz o quê; a página de cada caminho diz como. Sem o caminho para
  // ela, o passo a passo do item F ficaria escrito e inalcançável.
  it('cada caminho leva para a própria página', async () => {
    access.mockResolvedValue({
      tor: { enabled: false, ...DESLIGADO },
      tailscale: { enabled: false, ...DESLIGADO },
      cloudflare: { enabled: false, ...DESLIGADO, warning: true },
      ...SEM_CONTROLE,
    })

    montar()

    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(3))
    expect(
      screen.getAllByRole('link').map(a => a.getAttribute('href')),
    ).toEqual(['/acessos/tor', '/acessos/tailscale', '/acessos/cloudflare'])
  })

  // `enabled` diz que alguém configurou; `status` diz se respondeu. A lista
  // mostra o segundo, que é o que muda entre "achei que estava publicado" e
  // "está publicado".
  it('mostra o estado medido de cada caminho, e não a configuração', async () => {
    access.mockResolvedValue({
      tor: { enabled: true, onion: 'abc.onion', status: 'unknown', statusSource: 'none' },
      tailscale: {
        enabled: true,
        hostname: 'badger.tail1234.ts.net',
        status: 'up',
        statusSource: 'dns',
      },
      cloudflare: { enabled: false, ...DESLIGADO, warning: true },
      ...SEM_CONTROLE,
    })

    montar()

    await waitFor(() => expect(screen.getByText('não medido')).toBeDefined())
    expect(screen.getByText('de pé')).toBeDefined()
  })
})
