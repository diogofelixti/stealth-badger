import { describe, expect, it } from 'vitest'
import { formatSats, shorten } from '../src/lib/format'

describe('formatSats', () => {
  it('agrupa milhares no padrão brasileiro', () => {
    expect(formatSats(1234567)).toBe('1.234.567 sats')
  })

  it('agrupa milhares no padrão inglês', () => {
    expect(formatSats(1234567, 'en')).toBe('1,234,567 sats')
  })

  it('trata zero', () => {
    expect(formatSats(0)).toBe('0 sats')
  })

  it('usa singular para um satoshi', () => {
    expect(formatSats(1)).toBe('1 sat')
  })
})

describe('shorten', () => {
  it('encurta o meio de um identificador longo', () => {
    const curto = shorten('a'.repeat(64))
    expect(curto.startsWith('aaaaaaaa')).toBe(true)
    expect(curto).toContain('…')
    expect(curto.length).toBeLessThan(20)
  })

  it('devolve inteiro o que já é curto', () => {
    expect(shorten('tb1qabc')).toBe('tb1qabc')
  })
})
