import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WalletCard } from '../src/components/WalletCard'
import type { Wallet } from '../src/lib/api'

const catalogo = {
  'wallet.importing': 'Importando {progress}%',
  'wallet.importingNote': 'Varrendo a cadeia de change. O saldo total acima ainda não inclui esta carteira.',
  'wallet.syncError': 'Falha na sincronização',
  'balance.utxos': '{n} UTXOs',
}

const base: Wallet = {
  id: 1, label: 'Cold wallet', scriptType: 'p2wpkh', network: 'signet',
  fingerprint: 'c81b04af', syncState: 'synced', syncProgress: 100,
  syncHeight: 319233, balanceSats: '412850', utxoCount: 4, frozenCount: 0,
  backendIsPublic: true, backendUrl: 'https://mempool.space/signet/api',
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
})
