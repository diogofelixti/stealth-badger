import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Catalog } from '../src/lib/api'
import { Copiar } from '../src/components/ui/Copiar'

const CATALOGO: Catalog = {
  'access.copy': 'copiar',
  'access.copied': 'copiado',
  'access.copyFailed': 'o navegador não deixou copiar; selecione e copie na mão',
}

const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')

function comAreaDeTransferencia(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

function semAreaDeTransferencia() {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: undefined,
    configurable: true,
  })
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  if (original) Object.defineProperty(globalThis.navigator, 'clipboard', original)
})

describe('Copiar', () => {
  it('copia o texto e confirma na própria etiqueta', async () => {
    const escrito: string[] = []
    comAreaDeTransferencia(async t => void escrito.push(t))
    render(<Copiar texto="abc.onion" catalog={CATALOGO} lang="pt" />)

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(screen.getByText('copiado')).toBeDefined())
    expect(escrito).toEqual(['abc.onion'])
  })

  /*
   * O caso que quebra fora do laboratório, e a razão de ele existir aqui.
   *
   * `navigator.clipboard` só existe em contexto seguro. O painel alcançado pelo
   * IP da Tailscale é `http://100.x`, que **não** é contexto seguro — então
   * justamente no caminho em que a pessoa está copiando um endereço para o
   * celular, a API não está lá. O caminho de reserva é o `execCommand`, que é
   * legado e continua sendo o único que funciona ali.
   */
  it('sem contexto seguro, cai no caminho de reserva e ainda copia', async () => {
    semAreaDeTransferencia()
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    render(<Copiar texto="badger.tail1234.ts.net" catalog={CATALOGO} lang="pt" />)

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(screen.getByText('copiado')).toBeDefined())
    expect(exec).toHaveBeenCalledWith('copy')
  })

  // Falhar em silêncio faria a pessoa colar o endereço antigo achando que
  // copiou o novo. Um endereço errado colado é uma sessão aberta em lugar
  // nenhum, e ela vai procurar defeito no túnel.
  it('quando os dois caminhos falham, a tela diz que não copiou', async () => {
    comAreaDeTransferencia(async () => {
      throw new Error('NotAllowedError')
    })
    Object.defineProperty(document, 'execCommand', {
      value: () => false,
      configurable: true,
    })
    render(<Copiar texto="abc.onion" catalog={CATALOGO} lang="pt" />)

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() =>
      expect(screen.getByText(/não deixou copiar/)).toBeDefined(),
    )
  })

  it('tem forma de botão, e não de texto que age', async () => {
    comAreaDeTransferencia(async () => {})
    render(<Copiar texto="abc" catalog={CATALOGO} lang="pt" />)

    expect(screen.getByRole('button').className).toContain('sb-btn')
  })
})
