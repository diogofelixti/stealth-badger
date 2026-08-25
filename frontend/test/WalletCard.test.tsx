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

  // Mostrar saldo parcial como se fosse o final é mentir com número: enquanto
  // importa, a carteira diz que ainda não terminou.
  it('não apresenta saldo parcial como definitivo enquanto importa', () => {
    const importando: Wallet = { ...base, syncState: 'importing', syncProgress: 43 }
    const { container } = render(
      <WalletCard wallet={importando} catalog={catalogo} lang="pt" />,
    )
    expect(container.textContent).toContain('Importando 43%')
    expect(container.textContent).toContain('ainda não inclui esta carteira')
    expect(container.textContent).not.toContain('412.850')
  })

  it('mostra a falha de sincronização em vez de fingir carteira parada', () => {
    const comErro: Wallet = { ...base, syncState: 'error' }
    render(<WalletCard wallet={comErro} catalog={catalogo} lang="pt" />)
    expect(screen.getByText(/falha na sincronização/i)).toBeDefined()
  })
})
