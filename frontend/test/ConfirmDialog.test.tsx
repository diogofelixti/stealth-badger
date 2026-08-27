import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDialog } from '../src/components/ConfirmDialog'

const CATALOGO = {
  'wallets.deleteTitle': 'Apagar {label}?',
  'wallets.deleteNote':
    'Apaga o xpub, o log de eventos e os alertas desta carteira. Não dá para voltar atrás.',
  'wallets.deleteConfirmLabel': 'Digite o rótulo exato para confirmar',
  'wallets.delete': 'Apagar de vez',
  'wallets.cancel': 'Cancelar',
}

function montar(onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(
    <ConfirmDialog
      label="Cofre frio"
      catalog={CATALOGO}
      lang="pt"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  // A porta estreita do item 4: apagar leva o log junto, e o rótulo digitado
  // é o que separa "quis apagar" de "cliquei sem ler".
  it('só libera apagar quando o rótulo digitado é exatamente o da carteira', () => {
    montar()
    const botao = screen.getByText('Apagar de vez') as HTMLButtonElement
    expect(botao.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/digite o rótulo exato/i), {
      target: { value: 'cofre frio' },
    })
    expect(botao.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/digite o rótulo exato/i), {
      target: { value: 'Cofre frio' },
    })
    expect(botao.disabled).toBe(false)
  })

  it('confirma com o rótulo que o usuário digitou', () => {
    const { onConfirm } = montar()
    fireEvent.change(screen.getByLabelText(/digite o rótulo exato/i), {
      target: { value: 'Cofre frio' },
    })

    fireEvent.click(screen.getByText('Apagar de vez'))

    expect(onConfirm).toHaveBeenCalledWith('Cofre frio')
  })

  it('cancelar não apaga nada', () => {
    const { onConfirm, onCancel } = montar()

    fireEvent.click(screen.getByText('Cancelar'))

    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
