import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WalletCard } from '../src/components/WalletCard'
import type { Wallet } from '../src/lib/api'

const catalogo = {
  'wallet.importing': 'Importando {progress}%',
  'wallet.importingNote': 'Varrendo a cadeia de change. O saldo total acima ainda não inclui esta carteira.',
  'wallet.syncError': 'Falha na sincronização',
  'balance.utxos': '{n} UTXOs',
  'wallet.watchedAddress': 'endereço avulso',
  'wallet.syncDegraded': 'Vigiando em parte',
  'privacy.score': 'Privacidade {score}/100 · {grade}',
  'privacy.scan': 'Analisar privacidade',
  'privacy.scanning': 'analisando...',
  'privacy.never': 'privacidade ainda não analisada',
}

const base: Wallet = {
  id: 1, label: 'Cold wallet', scriptType: 'p2wpkh', network: 'signet',
  fingerprint: 'c81b04af', syncState: 'synced', syncProgress: 100,
  syncHeight: 319233, balanceSats: '412850', utxoCount: 4, frozenCount: 0,
  backendIsPublic: true, backendUrl: 'https://mempool.space/signet/api',
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
      backendIsPublic: false,
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
    render(<WalletCard wallet={rodando} catalog={catalogo} lang="pt" onScan={() => {}} />)
    expect(screen.getByText(/analisando/i)).toBeDefined()
  })

  it('oferece disparar a análise quando há como', () => {
    const cliques: number[] = []
    render(
      <WalletCard wallet={base} catalog={catalogo} lang="pt" onScan={() => cliques.push(1)} />,
    )
    screen.getByRole('button', { name: /analisar privacidade/i }).click()
    expect(cliques).toHaveLength(1)
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
})
