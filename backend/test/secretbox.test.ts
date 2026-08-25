import { describe, expect, it } from 'vitest'
import { open, seal } from '../src/crypto/secretbox'

const KEY = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

describe('secretbox', () => {
  it('abre o que ele mesmo selou', () => {
    const sealed = seal('zpub6rFR7y4Q2AijB', KEY)
    expect(open(sealed, KEY)).toBe('zpub6rFR7y4Q2AijB')
  })

  it('não deixa o texto em claro visível no resultado', () => {
    const sealed = seal('zpub6rFR7y4Q2AijB', KEY)
    expect(sealed.toString('utf8')).not.toContain('zpub')
  })

  it('produz saída diferente a cada chamada — nonce aleatório', () => {
    expect(seal('mesmo', KEY).equals(seal('mesmo', KEY))).toBe(false)
  })

  it('recusa chave errada em vez de devolver lixo', () => {
    expect(() => open(seal('segredo', KEY), OTHER)).toThrow()
  })

  it('recusa conteúdo adulterado', () => {
    const sealed = seal('segredo', KEY)
    sealed[sealed.length - 1] = sealed[sealed.length - 1]! ^ 0xff
    expect(() => open(sealed, KEY)).toThrow()
  })
})
