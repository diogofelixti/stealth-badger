import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Catalog, Channel } from '../src/lib/api'

const channels = vi.fn<() => Promise<Channel[]>>()
const addChannel = vi.fn()
const testChannel = vi.fn()
const removeChannel = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      channels: () => channels(),
      addChannel: (...a: unknown[]) => addChannel(...a),
      testChannel: (...a: unknown[]) => testChannel(...a),
      removeChannel: (...a: unknown[]) => removeChannel(...a),
    },
  }
})

const { Channels } = await import('../src/components/Channels')

const CATALOGO: Catalog = {
  'channels.title': 'Avisar no celular',
  'channels.empty': 'Nenhum canal. Alertas só aparecem aqui na tela.',
  'channels.topicPlaceholder': 'tópico secreto',
  'channels.add': 'Cadastrar',
  'channels.test': 'Testar',
  'channels.remove': 'remover',
  'channels.testOk': 'Chegou. O canal funciona.',
  'channels.testFail': 'Não chegou: {error}',
  'channels.topicHint': 'Quem souber o tópico recebe seus alertas.',
  'channels.howTitle': 'Como isto funciona',
  'channels.how1': 'O ntfy entrega push por tópico, e não por conta.',
  'channels.how2': 'Instale o app ntfy, assine um tópico só seu, e cole aqui.',
  'channels.how3': 'Este servidor publica cada alerta nesse tópico.',
  'channels.how4':
    'O que vai na mensagem: o rótulo da carteira, o título e o texto do alerta — e, em dust e address reuse, o endereço envolvido.',
}

function montar() {
  return render(<Channels catalog={CATALOGO} lang="pt" />)
}

beforeEach(() => {
  channels.mockResolvedValue([])
  addChannel.mockResolvedValue({ id: 1, kind: 'ntfy', enabled: true })
  testChannel.mockResolvedValue({ ok: true })
  removeChannel.mockResolvedValue(undefined)
})

describe('Channels', () => {
  it('diz que sem canal o alerta só aparece na tela', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/só aparecem aqui na tela/i)).toBeDefined())
  })

  // O tópico do ntfy é a única barreira entre as notificações e quem quiser
  // lê-las. Quem cadastra precisa saber disso na hora de escolher.
  it('avisa que quem souber o tópico recebe os alertas', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/quem souber o tópico/i)).toBeDefined())
  })

  it('cadastra o canal com o tópico digitado', async () => {
    montar()
    await waitFor(() => expect(screen.getByPlaceholderText(/tópico/i)).toBeDefined())
    fireEvent.change(screen.getByPlaceholderText(/tópico/i), {
      target: { value: 'stealth-badger-9f2a' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cadastrar/i }))

    await waitFor(() =>
      expect(addChannel).toHaveBeenCalledWith({ kind: 'ntfy', topic: 'stealth-badger-9f2a' }),
    )
  })

  // Descobrir no palco que o push não chega é tarde demais.
  it('dispara o teste e diz que chegou', async () => {
    channels.mockResolvedValue([{ id: 7, kind: 'ntfy', enabled: true }])
    montar()
    await waitFor(() => expect(screen.getByRole('button', { name: /testar/i })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /testar/i }))

    await waitFor(() => expect(testChannel).toHaveBeenCalledWith(7))
    await waitFor(() => expect(screen.getByText(/o canal funciona/i)).toBeDefined())
  })

  it('mostra o motivo quando o teste falha, em vez de silenciar', async () => {
    channels.mockResolvedValue([{ id: 7, kind: 'ntfy', enabled: true }])
    testChannel.mockResolvedValue({ ok: false, error: 'ntfy respondeu 403' })
    montar()
    await waitFor(() => expect(screen.getByRole('button', { name: /testar/i })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /testar/i }))

    await waitFor(() => expect(screen.getByText(/403/)).toBeDefined())
  })

  it('remove o canal', async () => {
    channels.mockResolvedValue([{ id: 7, kind: 'ntfy', enabled: true }])
    montar()
    await waitFor(() => expect(screen.getByRole('button', { name: /remover/i })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /remover/i }))
    await waitFor(() => expect(removeChannel).toHaveBeenCalledWith(7))
  })
})

describe('o cartão de como funciona', () => {
  it('explica o tópico antes de pedir um', async () => {
    // O campo pedia "tópico" sem nada dizendo o que é um tópico nem onde se
    // assina. Quem nunca usou ntfy não tinha como responder.
    montar()
    await waitFor(() => expect(screen.getByText('Como isto funciona')).toBeTruthy())
    expect(screen.getByText(/push por tópico/)).toBeTruthy()
    expect(screen.getByText(/Instale o app ntfy/)).toBeTruthy()
  })

  it('avisa que o endereço vai na mensagem', async () => {
    // `dust_received` e `address_reused` levam `address` em `params`, e o push
    // renderiza isso. Dizer que o aviso não vaza endereço seria falso.
    montar()
    await waitFor(() => expect(screen.getByText(/o endereço envolvido/)).toBeTruthy())
  })
})
