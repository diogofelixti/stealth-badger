import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Acessos, Catalog } from '../src/lib/api'

const access = vi.fn()
const accessControl = vi.fn()
const accessConfig = vi.fn()
const saveAccessConfig = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      access: () => access(),
      accessControl: (...a: unknown[]) => accessControl(...a),
      accessConfig: (...a: unknown[]) => accessConfig(...a),
      saveAccessConfig: (...a: unknown[]) => saveAccessConfig(...a),
    },
  }
})

const { CaminhoExterno } = await import('../src/components/CaminhoExterno')

const CATALOGO: Catalog = {
  'access.tor': 'Tor',
  'access.cloudflare': 'Cloudflare Tunnel',
  'access.steps': 'Passo a passo',
  'access.sees': 'O que este caminho enxerga',
  'access.trouble': 'Quando não funciona',
  'access.address': 'Endereço',
  'access.state': 'Estado',
  'access.up': 'de pé',
  'access.down': 'desligado',
  'access.unknown': 'não medido',
  'access.by.docker': 'medido pelo estado do container',
  'access.by.none': 'esta instância não tem como olhar daqui',
  'access.copy': 'copiar',
  'access.copied': 'copiado',
  'access.open': 'abrir',
  'access.all': 'todos os acessos',
  'access.docs': 'documentação completa deste caminho',
  'access.activate': 'Ativar',
  'access.deactivate': 'Desativar',
  'access.configure': 'Configurar',
  'access.configTitle': 'Configurar acesso',
  'access.hostname': 'Hostname',
  'access.authKey': 'TS_AUTHKEY',
  'access.tunnelToken': 'TUNNEL_TOKEN',
  'access.saveConfig': 'Salvar configuração',
  'access.configSaved': 'configuração salva cifrada',
  'access.configured': 'configurado',
  'access.notConfigured': 'não configurado',
  'access.controlTitle': 'Ligar e desligar por aqui',
  'access.socketNote': 'uma sessão do painel vale execução de código na máquina que hospeda',
  'access.socketOff': 'Esta instância lê os acessos e não os controla',
  'access.adminOnlyNote': 'Ligar e desligar acesso externo é do admin da instância',
  'access.runOnce': 'Este perfil nunca subiu nesta máquina',
  'access.script': 'Ou o caminho curto, que não exige decorar as flags do compose.',
  'access.off': 'não configurado',
  'access.tor.sees': 'Ninguém no meio vê o tráfego nem o destino.',
  'access.tor.step1': 'Suba o perfil na máquina que hospeda.',
  'access.tor.step2': 'O endereço aparece aqui em alguns segundos.',
  'access.tor.step3': 'Abra o endereço no Tor Browser.',
  'access.tor.trouble1': 'Endereço vazio depois de subir.',
  'access.tor.trouble2': 'Endereço aparece e não abre.',
  'access.tor.trouble3': 'Sem o socket do Docker, esta página não tem como ver.',
  'access.cloudflare.sees': 'A Cloudflare termina o TLS e enxerga o seu tráfego em claro.',
  'access.cloudflare.step1': 'Crie o túnel no painel da Cloudflare.',
  'access.cloudflare.step2': 'Suba o perfil na máquina que hospeda.',
  'access.cloudflare.step3': 'Aponte o hostname público para o nginx.',
  'access.cloudflare.trouble1': 'Túnel sem conexão nenhuma.',
  'access.cloudflare.trouble2': 'O domínio abre e o painel não responde.',
  'access.cloudflare.trouble3': 'Sem a porta de métricas não há a quem perguntar.',
}

const ONION = 'abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion'

const ESTADO = (mudanca: Partial<Acessos> = {}): Acessos => ({
  tor: { enabled: true, onion: ONION, status: 'up', statusSource: 'docker' },
  tailscale: { enabled: false, status: 'down', statusSource: 'none' },
  cloudflare: { enabled: false, status: 'down', statusSource: 'none', warning: true },
  control: { available: false, isAdmin: false },
  ...mudanca,
})

beforeEach(() => {
  access.mockReset()
  accessControl.mockReset()
  accessConfig.mockReset()
  saveAccessConfig.mockReset()
  access.mockResolvedValue(ESTADO())
  accessConfig.mockResolvedValue({
    profile: 'tailscale',
    configured: false,
    hostname: null,
    hasSecret: false,
  })
  saveAccessConfig.mockResolvedValue({
    profile: 'tailscale',
    configured: true,
    hostname: 'badger.tail.ts.net',
    hasSecret: true,
  })
})

function montar(caminho: 'tor' | 'tailscale' | 'cloudflare' = 'tor') {
  render(<CaminhoExterno caminho={caminho} catalog={CATALOGO} lang="pt" />)
}

describe('CaminhoExterno', () => {
  it('mostra o endereço, com copiar e com QR', async () => {
    montar()

    await waitFor(() => expect(screen.getByText(ONION)).toBeDefined())
    // O QR vem de um efeito próprio, um tick depois do endereço.
    await waitFor(() => expect(screen.getByRole('img', { name: ONION })).toBeDefined())
    expect(screen.getAllByText('copiar').length).toBeGreaterThan(0)
  })

  it('numera os passos e oferece o comando de cada um', async () => {
    montar()

    await waitFor(() => expect(screen.getByText(/Suba o perfil/)).toBeDefined())
    expect(screen.getByText('docker compose --profile tor up -d')).toBeDefined()
    // Três passos, três números, na ordem.
    expect(screen.getAllByTestId('passo').map(n => n.textContent?.slice(0, 1))).toEqual([
      '1',
      '2',
      '3',
    ])
  })

  it('diz o que o caminho enxerga, e o que fazer quando não funciona', async () => {
    montar()

    await waitFor(() => expect(screen.getByText(/Ninguém no meio vê/)).toBeDefined())
    expect(screen.getAllByTestId('problema')).toHaveLength(3)
  })

  /*
   * O terceiro estado, que é o motivo de ele existir.
   *
   * Um caminho que a instância não consegue sondar não pode aparecer igual a um
   * caminho desligado: o primeiro é "não sei", o segundo é "não". Pintar os
   * dois de vermelho manda a pessoa consertar um túnel que talvez esteja
   * perfeitamente de pé.
   */
  it('"não medido" não é "desligado"', async () => {
    access.mockResolvedValue(
      ESTADO({ tor: { enabled: true, onion: ONION, status: 'unknown', statusSource: 'none' } }),
    )
    montar()

    await waitFor(() => expect(screen.getByText('não medido')).toBeDefined())
    expect(screen.queryByText('desligado')).toBeNull()
    expect(screen.getByText(/não tem como olhar daqui/)).toBeDefined()
  })

  it('caminho de pé diz por onde isso foi medido', async () => {
    montar()

    await waitFor(() => expect(screen.getByText('de pé')).toBeDefined())
    expect(screen.getByText(/medido pelo estado do container/)).toBeDefined()
  })

  // O padrão do projeto: sem o socket montado por quem hospeda, a tela não
  // oferece botão nenhum, e diz que esta instância só lê.
  it('sem o socket, não há botão de ligar, e a tela explica', async () => {
    montar()

    await waitFor(() => expect(screen.getByText(/só lê|não os controla/)).toBeDefined())
    expect(screen.queryByRole('button', { name: 'Ativar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Desativar' })).toBeNull()
  })

  // `users.is_admin` existia no schema e nunca tinha sido usado. Num painel
  // multi-usuário publicado num túnel, o socket na mão de qualquer sessão é
  // execução de código para qualquer sessão.
  it('com o socket e sem ser admin, também não há botão', async () => {
    access.mockResolvedValue(ESTADO({ control: { available: true, isAdmin: false } }))
    montar()

    await waitFor(() => expect(screen.getByText(/é do admin da instância/)).toBeDefined())
    expect(screen.queryByRole('button', { name: 'Ativar' })).toBeNull()
  })

  it('com o socket e sendo admin, os dois botões aparecem, e o aviso junto', async () => {
    access.mockResolvedValue(ESTADO({ control: { available: true, isAdmin: true } }))
    montar()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ativar' })).toBeDefined())
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeDefined()
    // O que o socket custa fica na tela, e não numa nota de rodapé.
    expect(screen.getByText(/vale execução de código na máquina que hospeda/)).toBeDefined()
  })

  it('admin configura Tailscale pelo wizard, sem a credencial voltar para a tela', async () => {
    access.mockResolvedValue(ESTADO({ control: { available: true, isAdmin: true } }))
    montar('tailscale')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Configurar' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Configurar' }))
    fireEvent.change(screen.getByLabelText('Hostname'), {
      target: { value: 'badger.tail.ts.net' },
    })
    fireEvent.change(screen.getByLabelText('TS_AUTHKEY'), {
      target: { value: 'tskey-auth-secreta' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar configuração' }))

    await waitFor(() =>
      expect(saveAccessConfig).toHaveBeenCalledWith('tailscale', {
        authKey: 'tskey-auth-secreta',
        hostname: 'badger.tail.ts.net',
      }),
    )
    expect(screen.queryByDisplayValue('tskey-auth-secreta')).toBeNull()
  })

  it('ligar manda o perfil do compose, e não o nome do caminho', async () => {
    access.mockResolvedValue(
      ESTADO({
        cloudflare: {
          enabled: true,
          hostname: 'painel.exemplo.com',
          status: 'down',
          statusSource: 'http',
          warning: true,
        },
        control: { available: true, isAdmin: true },
      }),
    )
    accessControl.mockResolvedValue({ ok: true, profile: 'cloudflared', action: 'up' })
    montar('cloudflare')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ativar' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }))

    // O serviço chama `cloudflared`; o caminho, na tela, chama Cloudflare.
    await waitFor(() => expect(accessControl).toHaveBeenCalledWith('cloudflared', 'up'))
  })

  it('depois de ligar, relê o estado em vez de supor que deu certo', async () => {
    access.mockResolvedValue(ESTADO({ control: { available: true, isAdmin: true } }))
    accessControl.mockResolvedValue({ ok: true, profile: 'tor', action: 'up' })
    montar()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ativar' })).toBeDefined())
    const antes = access.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }))

    await waitFor(() => expect(access.mock.calls.length).toBeGreaterThan(antes))
  })

  // A falha honesta do item: o engine liga o que existe, e não sabe o que o
  // compose diz. Em vez de erro seco, a tela devolve o comando de uma linha.
  it('perfil que nunca subiu mostra o comando de criar, com copiar', async () => {
    access.mockResolvedValue(ESTADO({ control: { available: true, isAdmin: true } }))
    accessControl.mockResolvedValue({
      ok: false,
      profile: 'tor',
      action: 'up',
      reason: 'notCreated',
      hint: 'este perfil nunca subiu nesta máquina',
      command: 'docker compose --profile tor create',
    })
    montar()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ativar' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }))

    await waitFor(() =>
      expect(screen.getByText('docker compose --profile tor create')).toBeDefined(),
    )
    // O caminho automatizado vem primeiro: um comando resolve os três perfis.
    expect(screen.getByText('./scripts/acessos.sh preparar')).toBeDefined()
  })

  // A linha da Cloudflare não é nota de rodapé, e não depende de configuração:
  // quem termina o TLS enxerga o tráfego em claro.
  it('a página da Cloudflare diz o que ela enxerga, em cor de atenção', async () => {
    access.mockResolvedValue(
      ESTADO({
        cloudflare: {
          enabled: true,
          hostname: 'painel.exemplo.com',
          status: 'up',
          statusSource: 'http',
          warning: true,
        },
      }),
    )
    montar('cloudflare')

    await waitFor(() =>
      expect(screen.getByText(/termina o TLS e enxerga o seu tráfego em claro/)).toBeDefined(),
    )
    const aviso = screen.getByTestId('o-que-ve')
    expect(aviso.getAttribute('style')).toContain('var(--sb-warning)')
  })

  /*
   * A queixa de 28/08: "automatiza o processo de subir, está muito manual".
   *
   * O `docker compose --profile X up -d` continua na tela porque é o que está
   * acontecendo por baixo, mas quem não quer decorar flag tem uma linha só. E
   * quando o engine responde `notCreated`, a tela oferece primeiro o
   * `preparar`, que resolve os três perfis de uma vez.
   */
  it('oferece o script ao lado do comando cru do compose', async () => {
    montar()

    await waitFor(() =>
      expect(screen.getByText('./scripts/acessos.sh tor up')).toBeDefined(),
    )
    expect(screen.getByText('docker compose --profile tor up -d')).toBeDefined()
  })

  it('sem o socket, a tela mostra como ligar o controle num comando só', async () => {
    montar()

    await waitFor(() =>
      expect(screen.getByText('./scripts/acessos.sh controle')).toBeDefined(),
    )
  })

  it('caminho não configurado ainda mostra o passo a passo', async () => {
    montar('tailscale')

    await waitFor(() => expect(screen.getByText('não configurado')).toBeDefined())
    expect(screen.getByText('docker compose --profile tailscale up -d')).toBeDefined()
  })
})
