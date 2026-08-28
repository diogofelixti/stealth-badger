import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WalletCard } from '../src/components/WalletCard'
import type { Wallet } from '../src/lib/api'

const catalogo = {
  'wallet.importing': 'Importando {progress}%',
  'wallet.importingNote': 'Varrendo a cadeia de change. O saldo total acima ainda não inclui esta carteira.',
  'wallet.importingNode': 'Rescan no seu nó',
  'wallet.importingCoreNote':
    'O seu nó está varrendo a cadeia desde o gênesis para achar o histórico desta carteira. Leva minutos, e não há barra porque o Bitcoin Core não reporta andamento enquanto rescaneia.',
  'wallet.syncError': 'Falha na sincronização',
  'wallet.syncSourceFailed': 'Fonte {host} falhou',
  'wallet.syncSourceFailedNote':
    'A fonte {host} não respondeu: {reason}. Troque a fonte desta carteira.',
  'balance.utxos': '{n} UTXOs',
  'wallet.watchedAddress': 'endereço avulso',
  'wallet.syncDegraded': 'Vigiando em parte',
  'wallet.historyOnly': 'Sem UTXO ativo, com histórico',
  'wallet.historyOnlyNote': '{addresses} endereço(s) com histórico e {spent} UTXO gasto(s).',
  'privacy.score': 'Privacidade {score}/100 · {grade}',
  'privacy.scan': 'Analisar privacidade',
  'privacy.scanning': 'analisando...',
  'privacy.never': 'privacidade ainda não analisada',
  'privacy.analysisSource': 'Fonte de análise',
  'privacy.analysisChoose': 'Escolher e analisar',
  'privacy.analysisNote': 'Este host passa a ver os endereços desta carteira.',
  'privacy.analysisPublic': 'pública',
  'privacy.analysisOwn': 'sua',
  'error.privacy.needsAnalysisSource': 'A análise precisa de um Esplora; sua fonte é um {chainKind}.',
}

const base: Wallet = {
  id: 1, label: 'Cold wallet', scriptType: 'p2wpkh', network: 'signet',
  fingerprint: 'c81b04af', syncState: 'synced', syncProgress: 100,
  syncHeight: 319233, balanceSats: '412850', utxoCount: 4, frozenCount: 0,
  spentUtxoCount: 0, usedAddressCount: 0,
  backendKind: 'esplora', backendIsPublic: true, backendUrl: 'https://mempool.space/signet/api',
  kind: 'xpub', address: null, syncError: null,
  privacyScore: null, privacyGrade: null, privacyScannedAt: null,
}

describe('WalletCard', () => {
  it('mostra o saldo formatado quando a carteira está sincronizada', () => {
    render(<WalletCard wallet={base} catalog={catalogo} lang="pt" />)
    expect(screen.getByText(/412\.850/)).toBeDefined()
  })

  // Mostrar saldo parcial como se fosse o final é mentir com número: na
  // primeira importação a carteira diz que ainda não terminou. `syncHeight`
  // nulo é o que marca esse caso — nunca houve sincronização completa.
  it('não apresenta saldo parcial como definitivo na primeira importação', () => {
    const importando: Wallet = {
      ...base, syncState: 'importing', syncProgress: 43, syncHeight: null,
    }
    const { container } = render(
      <WalletCard wallet={importando} catalog={catalogo} lang="pt" />,
    )
    expect(container.textContent).toContain('Importando 43%')
    expect(container.textContent).toContain('ainda não inclui esta carteira')
    expect(container.textContent).not.toContain('412.850')
  })

  /*
   * Duas esperas diferentes, e a nota errada faz a certa parecer defeito.
   *
   * Medido em 28/08 na signet desta máquina: uma carteira cadastrada pelo
   * Bitcoin Core ficou **sete minutos** com a barra parada em 0%, enquanto o nó
   * rescaneava desde o gênesis. A tela dizia "Importando 0%" e "varrendo a
   * cadeia de change" — que é a espera do Esplora, não a que estava
   * acontecendo. Quem cadastrou leu aquilo como carteira que não carregou.
   */
  it('carteira pelo nó diz que o rescan é do nó, e não mostra barra parada', () => {
    const pelaCore: Wallet = {
      ...base,
      backendKind: 'core',
      backendUrl: 'http://host.docker.internal:38332',
      syncState: 'importing',
      syncProgress: 0,
      syncHeight: null,
    }
    const { container } = render(
      <WalletCard wallet={pelaCore} catalog={catalogo} lang="pt" />,
    )

    expect(container.textContent).toContain('Rescan no seu nó')
    expect(container.textContent).toContain('não reporta andamento enquanto rescaneia')
    // Um "0%" que não se move por sete minutos é a própria queixa.
    expect(container.textContent).not.toContain('Importando 0%')
    expect(container.querySelector('[data-progress]')).toBeNull()
  })

  // O Esplora continua com barra, porque ali o andamento é real.
  it('carteira por explorador mantém a barra de andamento', () => {
    const pelaEsplora: Wallet = {
      ...base, syncState: 'importing', syncProgress: 43, syncHeight: null,
    }
    const { container } = render(
      <WalletCard wallet={pelaEsplora} catalog={catalogo} lang="pt" />,
    )

    expect(container.querySelector('[data-progress]')).not.toBeNull()
    expect(container.textContent).toContain('Importando 43%')
  })

  // Depois da primeira sincronização o worker remarca a carteira como
  // `importing` a cada ciclo, e numa carteira com histórico grande isso é a
  // maior parte do tempo. Esconder o saldo aí não é prudência: o número é
  // conhecido, e trocá-lo por travessões faz o painel parecer vazio.
  it('mantém o saldo à vista quando só está reconferindo', () => {
    const reconferindo: Wallet = { ...base, syncState: 'importing', syncProgress: 43 }
    const { container } = render(
      <WalletCard wallet={reconferindo} catalog={catalogo} lang="pt" />,
    )
    expect(container.textContent).toContain('412.850')
  })

  it('mostra a falha de sincronização em vez de fingir carteira parada', () => {
    const comErro: Wallet = { ...base, syncState: 'error' }
    render(<WalletCard wallet={comErro} catalog={catalogo} lang="pt" />)
    expect(screen.getByText(/falha na sincronização/i)).toBeDefined()
  })

  it('em erro inicial nomeia a fonte que falhou e não mostra zero como saldo', () => {
    const comErro: Wallet = {
      ...base,
      syncState: 'error',
      syncHeight: null,
      syncProgress: 0,
      syncError: 'fetch failed',
      balanceSats: '0',
      utxoCount: 0,
    }
    render(<WalletCard wallet={comErro} catalog={catalogo} lang="pt" />)

    expect(screen.getByText(/fonte mempool\.space falhou/i)).toBeDefined()
    expect(screen.getByText(/mempool\.space não respondeu: fetch failed/i)).toBeDefined()
    expect(screen.queryByText(/^0 sats$/)).toBeNull()
    expect(screen.getByText('———')).toBeDefined()
  })

  // Com backend por carteira, o selo do topo passa a falar da sessão inteira.
  // Quem quer saber por onde *esta* carteira é vigiada precisa ler no cartão —
  // e é isso que torna visível o contraste entre uma carteira exposta e uma
  // soberana lado a lado.
  it('nomeia o backend que vigia esta carteira', () => {
    render(<WalletCard wallet={base} catalog={catalogo} lang="pt" />)
    expect(screen.getByText(/mempool\.space/)).toBeDefined()
  })

  it('distingue no cartão a carteira soberana da exposta', () => {
    const soberana: Wallet = {
      ...base,
      backendKind: 'esplora', backendIsPublic: false,
      backendUrl: 'electrum://127.0.0.1:50001',
    }
    const { container } = render(<WalletCard wallet={soberana} catalog={catalogo} lang="pt" />)
    expect(container.querySelector('[data-wallet-posture="sovereign"]')).not.toBeNull()

    const exposta = render(<WalletCard wallet={base} catalog={catalogo} lang="pt" />)
    expect(exposta.container.querySelector('[data-wallet-posture="public"]')).not.toBeNull()
  })

  it('não inventa score para carteira que nunca foi analisada', () => {
    render(<WalletCard wallet={base} catalog={catalogo} lang="pt" />)
    expect(screen.getByText(/ainda não analisada/i)).toBeDefined()
    expect(screen.queryByText(/\/100/)).toBeNull()
  })

  it('mostra score e nota depois da análise', () => {
    const analisada: Wallet = {
      ...base,
      privacyScore: 66,
      privacyGrade: 'C',
      privacyScannedAt: '2026-08-26T12:00:00Z',
    }
    render(<WalletCard wallet={analisada} catalog={catalogo} lang="pt" />)
    expect(screen.getByText(/66\/100/)).toBeDefined()
    expect(screen.getByText(/\bC\b/)).toBeDefined()
  })

  // A análise leva mais de um minuto. Sem dizer que está correndo, o usuário
  // clica de novo achando que o botão não funcionou.
  it('diz que está analisando, em vez de parecer que o clique não pegou', () => {
    const rodando: Wallet = { ...base, privacyScanning: true } as Wallet
    render(<WalletCard wallet={rodando} catalog={catalogo} lang="pt" onScan={async () => {}} />)
    expect(screen.getByText(/analisando/i)).toBeDefined()
  })

  it('oferece disparar a análise quando há como', () => {
    const cliques: number[] = []
    render(
      <WalletCard
        wallet={base}
        catalog={catalogo}
        lang="pt"
        onScan={async () => void cliques.push(1)}
      />,
    )
    screen.getByRole('button', { name: /analisar privacidade/i }).click()
    expect(cliques).toHaveLength(1)
  })

  /*
   * A única recusa que não é erro.
   *
   * `privacy.needsAnalysisSource` quer dizer que a fonte de cadeia da carteira
   * é um Core ou um Electrum, que o `am-i-exposed` não sabe consultar, e que
   * ninguém escolheu um Esplora para esta rede ainda. Em 28/08 essa análise
   * rodava mesmo assim, contra o RPC do nó, e devolvia score 70 numa carteira
   * que o scanner nunca conseguiu ler.
   *
   * Agora o cartão pergunta, com as candidatas que vieram na própria recusa.
   */
  it('pergunta qual Esplora usar quando a fonte de cadeia não serve para analisar', async () => {
    const recusa = Object.assign(new Error('escolha uma fonte'), {
      code: 'privacy.needsAnalysisSource',
      params: {
        chainKind: 'core',
        network: 'signet',
        candidates: [
          { id: 3, url: 'https://blockstream.info/signet/api', isPublic: true, preset: 'blockstream', label: null, escolhida: false },
        ],
      },
    })
    render(
      <WalletCard
        wallet={base}
        catalog={catalogo}
        lang="pt"
        onScan={async () => {
          throw recusa
        }}
      />,
    )

    screen.getByRole('button', { name: /analisar privacidade/i }).click()

    await waitFor(() =>
      expect(screen.getByTestId('escolher-fonte-de-analise')).toBeDefined(),
    )
    expect(screen.getByText(/blockstream/i)).toBeDefined()
  })

  // Uma carteira mostra a fingerprint da chave; um endereço avulso não tem
  // chave nenhuma, e mostrar o campo vazio faria parecer defeito.
  it('mostra o endereço no lugar da fingerprint quando é endereço avulso', () => {
    const avulso: Wallet = {
      ...base,
      kind: 'address',
      address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      fingerprint: null as unknown as string,
    }
    render(<WalletCard wallet={avulso} catalog={catalogo} lang="pt" />)
    expect(screen.getByText(/bc1qw508/)).toBeDefined()
    expect(screen.getByText(/endereço avulso/i)).toBeDefined()
  })

  // Gap limit e cadeia de troco não existem para um endereço solto: anunciar
  // "32 UTXOs · p2wpkh · signet" no mesmo formato de carteira sugeriria que o
  // watchtower está vigiando mais do que vigia.
  it('não anuncia endereço avulso como se fosse carteira inteira', () => {
    const avulso: Wallet = {
      ...base,
      kind: 'address',
      address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    }
    const { container } = render(<WalletCard wallet={avulso} catalog={catalogo} lang="pt" />)
    expect(container.querySelector('[data-wallet-kind="address"]')).not.toBeNull()
  })

  // `degraded` é a carteira que o watchtower vigia em parte: um endereço que o
  // backend recusa servir não a torna quebrada. Mostrar como erro assustaria
  // sem motivo; não mostrar nada esconderia que há um ponto cego.
  it('avisa que vigia em parte, dizendo o motivo, quando degradada', () => {
    const degradada: Wallet = {
      ...base,
      syncState: 'degraded',
      syncError: '1 endereço(s) o backend recusou servir. Too many unspent',
    }
    render(<WalletCard wallet={degradada} catalog={catalogo} lang="pt" />)
    expect(screen.getByText(/vigiando em parte/i)).toBeDefined()
    expect(screen.getByText(/Too many unspent/)).toBeDefined()
  })

  it('continua mostrando o saldo do que conseguiu ler', () => {
    const degradada: Wallet = { ...base, syncState: 'degraded', syncError: 'x' }
    render(<WalletCard wallet={degradada} catalog={catalogo} lang="pt" />)
    expect(screen.getByText(/412\.850/)).toBeDefined()
  })

  // Zero que não foi lido não é zero: é "não sei". O cartão já recusa mostrar
  // saldo parcial como definitivo na primeira importação, e a mesma regra vale
  // aqui — mostrar 0 sats ao lado de "vigiando em parte" convida a ler o
  // número como fato.
  it('não anuncia zero quando não conseguiu ler nenhum endereço', () => {
    const cega: Wallet = {
      ...base,
      syncState: 'degraded',
      syncError: 'recusou servir',
      balanceSats: '0',
      utxoCount: 0,
    }
    render(<WalletCard wallet={cega} catalog={catalogo} lang="pt" />)
    expect(screen.queryByText(/^0 sats$/)).toBeNull()
    expect(screen.getByText('———')).toBeDefined()
  })

  // Não saber o saldo não é estar importando. Dizer "importando 100%" numa
  // carteira degradada promete que o número vai chegar, e ele não vai — a
  // recusa do backend é permanente.
  it('não finge que está importando quando na verdade não conseguiu ler', () => {
    const cega: Wallet = {
      ...base,
      syncState: 'degraded',
      syncError: 'recusou servir',
      balanceSats: '0',
      utxoCount: 0,
    }
    const { container } = render(<WalletCard wallet={cega} catalog={catalogo} lang="pt" />)
    expect(screen.queryByText(/importando/i)).toBeNull()
    expect(container.querySelector('[data-progress]')).toBeNull()
  })

  // Saldo parcial é verdade: é o que existe nos endereços que deu para ler, e
  // o aviso ao lado já diz que não é tudo. Esconder perderia informação real.
  it('mostra o saldo parcial quando conseguiu ler alguma coisa', () => {
    const parcial: Wallet = {
      ...base,
      syncState: 'degraded',
      syncError: 'recusou servir',
      balanceSats: '412850',
      utxoCount: 4,
    }
    render(<WalletCard wallet={parcial} catalog={catalogo} lang="pt" />)
    expect(screen.getByText(/412\.850/)).toBeDefined()
  })

  it('não parece vazia quando não tem saldo ativo, mas tem histórico', () => {
    const historica: Wallet = {
      ...base,
      balanceSats: '0',
      utxoCount: 0,
      spentUtxoCount: 3,
      usedAddressCount: 4,
    }
    render(<WalletCard wallet={historica} catalog={catalogo} lang="pt" />)

    expect(screen.getByText(/sem utxo ativo, com histórico/i)).toBeDefined()
    expect(screen.getByText(/4 endereço\(s\).*3 UTXO gasto\(s\)/i)).toBeDefined()
  })
})

describe('WalletCard — arquivar e apagar', () => {
  const comAcoes = {
    ...catalogo,
    'wallets.archive': 'Arquivar',
    'wallets.unarchive': 'Desarquivar',
    'wallets.delete': 'Apagar de vez',
    'wallets.archived': 'arquivada',
  }

  it('oferece arquivar uma carteira vigiada', () => {
    const arquivar = vi.fn()
    render(
      <WalletCard wallet={base} catalog={comAcoes} lang="pt" onArchive={arquivar} />,
    )

    fireEvent.click(screen.getByText('Arquivar'))

    expect(arquivar).toHaveBeenCalled()
  })

  it('a arquivada troca arquivar por desarquivar e apagar', () => {
    const desarquivar = vi.fn()
    render(
      <WalletCard
        wallet={{ ...base, archivedAt: '2026-08-27T18:00:00Z' }}
        catalog={comAcoes}
        lang="pt"
        onArchive={vi.fn()}
        onUnarchive={desarquivar}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.queryByText('Arquivar')).toBeNull()
    expect(screen.getByText('Apagar de vez')).toBeDefined()
    fireEvent.click(screen.getByText('Desarquivar'))

    expect(desarquivar).toHaveBeenCalled()
  })
})

describe('WalletCard — trocar a fonte de consulta', () => {
  const comFontes = {
    ...catalogo,
    'wallets.changeSource': 'Trocar fonte',
    'wallets.changeSourceNote': 'O histórico não se perde na troca.',
  }

  const FONTES = [
    {
      id: 1, kind: 'esplora' as const, url: 'https://mempool.space/signet/api',
      isPublic: true, network: 'signet' as const, scope: 'global' as const,
    },
    {
      id: 2, kind: 'electrum' as const, url: 'electrum://host.docker.internal:50001',
      isPublic: false, network: 'signet' as const, scope: 'own' as const,
    },
  ]

  it('oferece as fontes da mesma rede e avisa que o histórico fica', () => {
    render(
      <WalletCard
        wallet={base}
        catalog={comFontes}
        lang="pt"
        backends={FONTES}
        onChangeBackend={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Trocar fonte'))

    expect(screen.getByText(/histórico não se perde/i)).toBeDefined()
    expect(screen.getByRole('option', { name: /host\.docker\.internal/ })).toBeDefined()
  })

  it('troca para a fonte escolhida', () => {
    const trocar = vi.fn()
    render(
      <WalletCard
        wallet={base}
        catalog={comFontes}
        lang="pt"
        backends={FONTES}
        onChangeBackend={trocar}
      />,
    )
    fireEvent.click(screen.getByText('Trocar fonte'))

    fireEvent.change(screen.getByLabelText('Trocar fonte'), { target: { value: '2' } })

    expect(trocar).toHaveBeenCalledWith(2)
  })
})
