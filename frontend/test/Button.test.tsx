import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Button } from '../src/components/ui/Button'

describe('Button', () => {
  // Dentro do <form> do AddWallet, um botão sem `type` submete o formulário
  // ao ser clicado. O padrão do HTML é `submit`, e é o padrão errado para
  // toda ação que não é "enviar".
  it('não submete o formulário em que está', () => {
    const enviou = vi.fn(e => e.preventDefault())
    render(
      <form onSubmit={enviou}>
        <Button>Adicionar backend</Button>
      </form>,
    )

    fireEvent.click(screen.getByText('Adicionar backend'))

    expect(enviou).not.toHaveBeenCalled()
  })

  it('submete quando é o botão de enviar', () => {
    const enviou = vi.fn(e => e.preventDefault())
    render(
      <form onSubmit={enviou}>
        <Button type="submit">Começar a vigiar</Button>
      </form>,
    )

    fireEvent.click(screen.getByText('Começar a vigiar'))

    expect(enviou).toHaveBeenCalled()
  })

  it('desabilitado não dispara a ação', () => {
    const clicou = vi.fn()
    render(
      <Button disabled onClick={clicou}>
        Analisar
      </Button>,
    )

    fireEvent.click(screen.getByText('Analisar'))

    expect(clicou).not.toHaveBeenCalled()
  })

  it('anuncia a variante para quem confere a tela', () => {
    render(<Button variant="danger">Apagar</Button>)

    expect(screen.getByText('Apagar').getAttribute('data-variant')).toBe('danger')
  })
})
