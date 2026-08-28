import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Backend, Catalog } from '../src/lib/api'

const backends = vi.fn<() => Promise<Backend[]>>()
const addWallet = vi.fn()
const addBackend = vi.fn()

vi.mock('../src/lib/api', async importOriginal => {
  const real = await importOriginal<typeof import('../src/lib/api')>()
  return {
    ...real,
    api: {
      ...real.api,
      backends: () => backends(),
      addWallet: (...a: unknown[]) => addWallet(...a),
      addBackend: (...a: unknown[]) => addBackend(...a),
    },
  }
})

const { AddWallet } = await import('../src/components/AddWallet')

const CATALOGO: Catalog = {
  'wallets.formTitle': 'Vigiar uma carteira',
  'wallets.labelPlaceholder': 'Rótulo',
  'wallets.keyPlaceholder': 'xpub, ypub, zpub',
  'wallets.modeKey': 'Carteira inteira',
  'wallets.modeAddress': 'Um endereço',
  'wallets.addressPlaceholder': 'bc1..., 3..., 1...',
  'wallets.addressNote': 'Vigia só este endereço.',
  'wallets.watchOnly': 'Somente chaves públicas.',
  'wallets.scriptType': 'Tipo de script',
  'wallets.scriptTypeAuto': 'descobrir pela cadeia',
  'wallets.scriptTypeNote':
    'Esta chave não diz o tipo de script. Se a fonte escolhida não puder ser perguntada, declare o tipo aqui.',
  'wallets.submit': 'Começar a vigiar',
  'wallets.submitting': 'cadastrando...',
  'backends.title': 'Vigiar por',
  'backends.global': 'configurado no servidor',
  'backends.own': 'seu',
  'backends.addToggle': '+ outro backend',
  'backends.newSource': 'Nova fonte',
  'backends.addSource': 'Adicionar fonte',
  'backends.urlPlaceholder': 'https://... ou electrum://host:50001',
  'backends.preset': 'Fonte',
  'backends.host': 'Host',
  'backends.port': 'Porta',
  'backends.labelField': 'Apelido (opcional)',
  'backends.auth': 'Autenticação',
  'backends.authCookie': 'arquivo .cookie',
  'backends.authUserPass': 'usuário e senha',
  'backends.cookiePath': 'Caminho do .cookie',
  'backends.user': 'Usuário do RPC',
  'backends.password': 'Senha do RPC',
  'backends.credentialNote': 'A credencial é cifrada e nunca volta.',
  'backends.datadir': 'Diretório de dados do nó',
  'backends.datadirHint': 'onde o bitcoind guarda os dados',
  'backends.detect': 'Procurar o nó',
  'backends.detectFound': 'achei um nó de {network} na altura {blocks}',
  'backends.dockerHint': 'Use host.docker.internal.',
  'backends.isPublic': 'É um serviço público de terceiro',
  'backends.publicNote': 'Um backend público enxerga quais endereços você consulta.',
  'backends.save': 'Adicionar backend',
  'backend.networkRequired': 'Rede',
  'network.mainnet': 'mainnet',
  'network.signet': 'signet',
  'network.testnet': 'testnet',
}

const GLOBAL: Backend = {
  id: 1,
  kind: 'esplora',
  url: 'https://mempool.space/signet/api',
  isPublic: true,
  network: 'signet',
  scope: 'global',
}

const MEU: Backend = {
  id: 2,
  kind: 'electrum',
  url: 'electrum://127.0.0.1:50001',
  isPublic: false,
  network: 'signet',
  scope: 'own',
}

function montar() {
  return render(<AddWallet catalog={CATALOGO} lang="pt" onAdded={() => {}} />)
}

beforeEach(() => {
  backends.mockResolvedValue([GLOBAL])
  // limpo a cada caso: sem isto, "não foi chamado" enxerga as chamadas dos
  // testes anteriores e passa a ser impossível de escrever
  addWallet.mockReset()
  addWallet.mockResolvedValue({})
  addBackend.mockReset()
})

describe('AddWallet — escolha de backend', () => {
  it('oferece o backend do servidor sem o usuário precisar cadastrar nada', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/mempool\.space/)).toBeDefined())
  })

  it('vigia pelo backend escolhido, e não sempre pelo primeiro', async () => {
    backends.mockResolvedValue([GLOBAL, MEU])
    montar()

    await waitFor(() => expect(screen.getByLabelText(/vigiar por/i)).toBeDefined())
    fireEvent.change(screen.getByLabelText(/vigiar por/i), { target: { value: String(MEU.id) } })
    fireEvent.change(screen.getByPlaceholderText(/rótulo/i), { target: { value: 'No meu nó' } })
    fireEvent.change(screen.getByPlaceholderText(/xpub/i), { target: { value: 'zpub123' } })
    fireEvent.click(screen.getByRole('button', { name: /começar a vigiar/i }))

    await waitFor(() =>
      expect(addWallet).toHaveBeenCalledWith('No meu nó', { key: 'zpub123' }, MEU.id),
    )
  })

  // O usuário está escolhendo por onde os endereços dele serão consultados.
  // Se a opção é pública, ele precisa ler isso na hora de escolher, não só
  // depois, no selo do topo.
  it('avisa o que um backend público enxerga, no momento da escolha', async () => {
    montar()
    await waitFor(() =>
      expect(screen.getByText(/enxerga quais endereços/i)).toBeDefined(),
    )
  })

  it('oferece nova fonte ao lado do seletor, antes de abrir o cadastro', async () => {
    montar()

    await waitFor(() => expect(screen.getByLabelText(/vigiar por/i)).toBeDefined())

    const novaFonte = screen.getByRole('button', { name: /nova fonte/i })
    expect(novaFonte).toBeDefined()
    expect(screen.queryByLabelText(/^host$/i)).toBeNull()
  })

  it('não repete o aviso quando o backend escolhido é soberano', async () => {
    backends.mockResolvedValue([MEU])
    montar()
    await waitFor(() => expect(screen.getByText(/127\.0\.0\.1/)).toBeDefined())
    expect(screen.queryByText(/enxerga quais endereços/i)).toBeNull()
  })

  // O formulário de fonte mora no `BackendForm`, que tem os testes dos campos
  // de cada preset. Aqui interessa só a costura: o que ele cadastra entra na
  // lista e já fica escolhido, porque quem acabou de cadastrar quer vigiar
  // por ali.
  it('cadastra backend novo e passa a oferecê-lo já selecionado', async () => {
    addBackend.mockResolvedValue(MEU)
    backends.mockResolvedValueOnce([GLOBAL]).mockResolvedValueOnce([GLOBAL, MEU])
    montar()

    await waitFor(() => expect(screen.getByText(/mempool\.space/)).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /nova fonte/i }))
    fireEvent.change(screen.getByLabelText(/fonte/i), { target: { value: 'fulcrum' } })
    fireEvent.change(screen.getByLabelText(/host/i), { target: { value: '127.0.0.1' } })
    fireEvent.click(screen.getByRole('button', { name: /adicionar backend/i }))

    await waitFor(() => expect(screen.getByText(/127\.0\.0\.1/)).toBeDefined())
    expect((screen.getByLabelText(/vigiar por/i) as HTMLSelectElement).value).toBe(
      String(MEU.id),
    )
  })

  // O terceiro modelo de backend: um nó que o próprio usuário roda, falado
  // por RPC. Sem a opção no seletor, cadastrá-lo dependeria de mexer no `.env`
  // do servidor — e a postura soberana ficaria fora do alcance de quem usa a
  // instância sem administrá-la.
  it('oferece o nó do próprio usuário como fonte', async () => {
    addBackend.mockResolvedValue({ ...MEU, kind: 'core', url: 'http://127.0.0.1:38332' })
    montar()

    await waitFor(() => expect(screen.getByText(/mempool\.space/)).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /nova fonte/i }))
    fireEvent.change(screen.getByLabelText(/fonte/i), { target: { value: 'core' } })
    fireEvent.change(screen.getByLabelText(/host/i), { target: { value: '127.0.0.1' } })
    fireEvent.change(screen.getByLabelText(/caminho do \.cookie/i), {
      target: { value: '/bitcoin/.cookie' },
    })
    fireEvent.click(screen.getByRole('button', { name: /adicionar backend/i }))

    await waitFor(() =>
      expect(addBackend).toHaveBeenCalledWith(
        expect.objectContaining({
          preset: 'core',
          host: '127.0.0.1',
          auth: { mode: 'cookie', cookiePath: '/bitcoin/.cookie' },
        }),
      ),
    )
  })

  // A descrição do produto promete "endereços e carteiras". Quem publica um
  // endereço de doação quer saber quando alguém paga, sem entregar a carteira
  // inteira ao watchtower.
  it('deixa escolher entre vigiar a carteira inteira ou só um endereço', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/vigiar por/i)).toBeDefined())
    expect(screen.getByRole('button', { name: /um endereço/i })).toBeDefined()
  })

  it('manda o endereço, e não a chave, quando o modo é de endereço', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/vigiar por/i)).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: /um endereço/i }))
    fireEvent.change(screen.getByPlaceholderText(/rótulo/i), { target: { value: 'Doações' } })
    fireEvent.change(screen.getByPlaceholderText(/bc1/i), {
      target: { value: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' },
    })
    fireEvent.click(screen.getByRole('button', { name: /começar a vigiar/i }))

    await waitFor(() =>
      expect(addWallet).toHaveBeenCalledWith(
        'Doações',
        { address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4' },
        GLOBAL.id,
      ),
    )
  })

  it('avisa que o modo de endereço vigia só aquele endereço', async () => {
    montar()
    await waitFor(() => expect(screen.getByLabelText(/vigiar por/i)).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /um endereço/i }))
    expect(screen.getByText(/vigia só este endereço/i)).toBeDefined()
  })
})

// Medido em 27/08 contra o Bitcoin Core desta máquina: uma carteira native
// segwit cadastrada por `tpub` cru entrou como p2pkh e mostrou 0 sats onde
// havia 7.552.468. `xpub` e `tpub` não dizem o tipo de script, e um backend
// que exige registro de descriptor não tem como ser perguntado — então quem
// cadastra precisa poder declarar.
const TPUB =
  'tpubDCxX2sYFS5bDkSe5GKKYHjBW7tgyN1R3UchpLJvdbf54ohxeGRtd8MbDUe1cguVHe4vnK68DsuD5MXjxi9EXx16rb9EnNsaF5KT99CinaJz'
const VPUB =
  'vpub5YvMuJNjRSYon44z9QmCfdf8SqJRVNvz6m55Qy5iVjZQxDfUgtiQjnc7CC1fAbED2tAGCZRERUfvtn2DstZGU6HMns6dXXH2wujSc2wfi2x'

function digitar(valor: string): void {
  fireEvent.change(screen.getByPlaceholderText('xpub, ypub, zpub'), {
    target: { value: valor },
  })
}

describe('AddWallet — tipo de script', () => {
  it('pergunta o tipo quando a chave não diz qual é', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/mempool\.space/)).toBeDefined())

    digitar(TPUB)

    expect(screen.getByLabelText(/tipo de script/i)).toBeDefined()
  })

  it('não pergunta o tipo quando as version bytes já dizem', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/mempool\.space/)).toBeDefined())

    digitar(VPUB)

    expect(screen.queryByLabelText(/tipo de script/i)).toBeNull()
  })

  it('envia o tipo escolhido junto do cadastro', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/mempool\.space/)).toBeDefined())

    fireEvent.change(screen.getByPlaceholderText('Rótulo'), {
      target: { value: 'Cofre' },
    })
    digitar(TPUB)
    fireEvent.change(screen.getByLabelText(/tipo de script/i), {
      target: { value: 'p2sh-p2wpkh' },
    })
    fireEvent.click(screen.getByText('Começar a vigiar'))

    await waitFor(() =>
      expect(addWallet).toHaveBeenCalledWith(
        'Cofre',
        { key: TPUB, scriptType: 'p2sh-p2wpkh' },
        1,
      ),
    )
  })

  it('não declara tipo nenhum enquanto o usuário deixa a cadeia descobrir', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/mempool\.space/)).toBeDefined())

    fireEvent.change(screen.getByPlaceholderText('Rótulo'), {
      target: { value: 'Cofre' },
    })
    digitar(TPUB)
    fireEvent.click(screen.getByText('Começar a vigiar'))

    await waitFor(() =>
      expect(addWallet).toHaveBeenCalledWith('Cofre', { key: TPUB }, 1),
    )
  })
})

describe('AddWallet — ações que não são enviar', () => {
  // O padrão do HTML para <button> é `submit`: abrir o cadastro de backend
  // dentro do <form> enviava a carteira pela metade.
  it('abrir o cadastro de backend não submete o formulário', async () => {
    montar()
    await waitFor(() => expect(screen.getByText(/mempool\.space/)).toBeDefined())

    fireEvent.change(screen.getByPlaceholderText('Rótulo'), {
      target: { value: 'Cofre' },
    })
    fireEvent.click(screen.getByText('Nova fonte'))

    expect(addWallet).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/fonte/i)).toBeDefined()
  })
})
