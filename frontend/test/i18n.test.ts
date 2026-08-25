import { describe, expect, it } from 'vitest'
import { render, renderAlert } from '../src/lib/i18n'

const catalogo = {
  'alert.funds_received.title': 'Fundos recebidos',
  'alert.funds_received.body': '{value} sats, {state}.',
  'state.conf1': 'confirmado',
}

describe('render', () => {
  it('substitui parâmetro nomeado', () => {
    expect(render(catalogo, 'alert.funds_received.body', { value: 50, state: 'x' }, 'pt'))
      .toContain('50 sats')
  })

  it('formata número conforme o idioma', () => {
    const params = { value: 1234567, state: 'x' }
    expect(render(catalogo, 'alert.funds_received.body', params, 'pt')).toContain('1.234.567')
    expect(render(catalogo, 'alert.funds_received.body', params, 'en')).toContain('1,234,567')
  })

  it('resolve parâmetro que aponta para outra chave do catálogo', () => {
    const texto = render(
      catalogo, 'alert.funds_received.body', { value: 1, state: '@state.conf1' }, 'pt',
    )
    expect(texto).toContain('confirmado')
  })

  // O catálogo chega por HTTP: enquanto não chega, a tela mostra a chave em vez
  // de espaço em branco, e quem vê sabe que falta o texto e não o dado.
  it('devolve a própria chave quando o catálogo ainda não chegou', () => {
    expect(render({}, 'feed.empty', {}, 'pt')).toBe('feed.empty')
  })

  it('deixa o marcador visível quando falta o parâmetro', () => {
    expect(render(catalogo, 'alert.funds_received.body', {}, 'pt')).toContain('{value}')
  })
})

describe('renderAlert', () => {
  it('monta título e corpo do mesmo tipo de alerta', () => {
    const { title, body } = renderAlert(
      catalogo, 'funds_received', { value: 50, state: '@state.conf1' }, 'pt',
    )
    expect(title).toBe('Fundos recebidos')
    expect(body).toBe('50 sats, confirmado.')
  })
})
