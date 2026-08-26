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

  // O aviso só é persistente se sobreviver à rolagem. O painel com histórico
  // passa de cinco mil pixels de altura: sem prender ao topo, o usuário rola o
  // feed e a advertência de explorador público simplesmente sai da tela — que
  // é o toast que some, só que disfarçado de rolagem.
  //
  // jsdom não faz layout e não sabe o que é `position: sticky`. O que dá para
  // travar aqui é a estrutura que torna o comportamento possível; quem prova o
  // comportamento é a conferência em navegador de verdade.
  it('prende listra e selo ao topo, para que rolar não os leve embora', () => {
    const { container } = render(
      <Shell backend={{ isPublic: true, host: 'mempool.space', label: 'Explorador público' }}>
        <p>corpo</p>
      </Shell>,
    )
    const selo = container.querySelector('[role="status"][data-posture]')
    const ancora = selo?.closest('.sticky')
    expect(ancora).not.toBeNull()
    expect(ancora!.className).toMatch(/top-0/)
    // a listra tem de estar na mesma âncora: presa só metade, some a outra
    expect(ancora!.querySelector('[aria-hidden="true"][data-posture]')).not.toBeNull()
  })
})
