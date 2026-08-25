import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Shell } from '../src/components/Shell'

describe('Shell', () => {
  it('avisa em palavras quando a consulta passa por explorador público', () => {
    render(
      <Shell backend={{ isPublic: true, host: 'mempool.space', label: 'Explorador público' }}>
        <p>corpo</p>
      </Shell>,
    )
    expect(screen.getByText(/explorador público/i)).toBeDefined()
    expect(screen.getByText(/mempool\.space/)).toBeDefined()
  })

  it('veste a listra de advertência enquanto a postura for pública', () => {
    const { container } = render(
      <Shell backend={{ isPublic: true, host: 'mempool.space', label: 'Explorador público' }}>
        <p>corpo</p>
      </Shell>,
    )
    expect(container.querySelector('[data-posture="public"]')).not.toBeNull()
  })

  it('não explica o que o explorador vê: o rótulo basta no topo', () => {
    const { container } = render(
      <Shell backend={{ isPublic: true, host: 'mempool.space', label: 'Explorador público' }}>
        <p>corpo</p>
      </Shell>,
    )
    expect(container.textContent).not.toMatch(/enxerga|consulta/i)
  })

  it('em modo soberano troca a listra e o rótulo', () => {
    const { container } = render(
      <Shell backend={{ isPublic: false, host: 'node.local', label: 'Soberano' }}>
        <p>corpo</p>
      </Shell>,
    )
    expect(container.querySelector('[data-posture="sovereign"]')).not.toBeNull()
    expect(screen.getByText(/soberano/i)).toBeDefined()
  })
})
