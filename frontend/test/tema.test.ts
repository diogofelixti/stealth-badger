import { beforeEach, describe, expect, it } from 'vitest'
import { TEMAS, aplicarTema, temaSalvo } from '../src/lib/tema'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('tema', () => {
  it('oferece os quatro templates', () => {
    expect(TEMAS).toEqual(['sett', 'bone', 'carvao', 'contraste'])
  })

  it('aplica o tema no documento e guarda a escolha', () => {
    aplicarTema('carvao')

    expect(document.documentElement.getAttribute('data-theme')).toBe('carvao')
    expect(temaSalvo()).toBe('carvao')
  })

  // `sett` é o padrão e mora no `:root` sem atributo: escrever `data-theme`
  // para ele funcionaria, mas deixaria a marca no HTML sem necessidade.
  it('o padrão não carimba atributo nenhum', () => {
    aplicarTema('carvao')
    aplicarTema('sett')

    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  it('tema desconhecido não é aplicado: o padrão vale', () => {
    aplicarTema('néon' as never)

    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  // O localStorage é cache para o carregamento não piscar; quem manda é o
  // servidor, porque o tema segue a pessoa entre navegadores.
  it('sem nada guardado, o tema salvo é o padrão', () => {
    expect(temaSalvo()).toBe('sett')
  })
})
