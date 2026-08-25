import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { CATALOG, LANGS } from '../src/i18n/catalog'
import { render, renderAlert } from '../src/i18n/render'

describe('catálogo', () => {
  it('tem exatamente as mesmas chaves em todos os idiomas', () => {
    const pt = Object.keys(CATALOG.pt).sort()
    const en = Object.keys(CATALOG.en).sort()
    expect(en).toEqual(pt)
  })

  it('não deixa nenhuma frase vazia', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(CATALOG[lang])) {
        expect(value.trim(), lang + ':' + key).not.toBe('')
      }
    }
  })

  it('mantém o jargão de Bitcoin em inglês também no catálogo português', () => {
    expect(CATALOG.pt['alert.dust_received.title']).toContain('dust attack')
    expect(CATALOG.pt['alert.address_reused.title']).toContain('Address reuse')
    expect(CATALOG.pt['alert.dust_received.body']).toContain('UTXO')
  })

  // Traduzir jargão custa reconhecimento: quem opera Bitcoin procura "dust" e
  // "change", não a versão vertida para o português.
  it('não traduz termo consagrado de Bitcoin no catálogo português', () => {
    const traduzidos = /\b(poeira|troco|reutilização de endereço|carteira quente)\b/i
    for (const [key, value] of Object.entries(CATALOG.pt)) {
      expect(value, 'pt:' + key).not.toMatch(traduzidos)
    }
  })

  it('não usa travessão em frase nenhuma', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(CATALOG[lang])) {
        expect(value, lang + ':' + key).not.toMatch(/[—–]| - /)
      }
    }
  })

  it('cobre as chaves de interface que a tela consome', () => {
    const daTela = [
      'feed.title', 'feed.live', 'feed.empty', 'feed.tip',
      'balance.total', 'balance.wallets', 'balance.utxos', 'balance.frozen',
      'wallets.title', 'wallets.add', 'wallets.formTitle',
      'wallets.labelPlaceholder', 'wallets.keyPlaceholder', 'wallets.watchOnly',
      'wallets.submit', 'wallets.submitting',
      'wallet.coins', 'wallet.frozen', 'wallet.importing',
      'wallet.importingNote', 'wallet.syncError',
      'auth.tagline', 'auth.email', 'auth.password',
      'auth.login', 'auth.register', 'auth.logout',
      'privacy.public', 'privacy.sovereign',
      'severity.info', 'severity.warning', 'severity.critical',
    ]
    for (const lang of LANGS) {
      for (const k of daTela) {
        expect(CATALOG[lang][k], lang + ':' + k).toBeTruthy()
      }
    }
  })

  it('cobre todo tipo de alerta com título e corpo nos dois idiomas', () => {
    const tipos = ['funds_received', 'funds_spent', 'dust_received', 'address_reused', 'reorg_detected']
    for (const lang of LANGS) {
      for (const t of tipos) {
        expect(CATALOG[lang]['alert.' + t + '.title'], lang + ':' + t).toBeTruthy()
        expect(CATALOG[lang]['alert.' + t + '.body'], lang + ':' + t).toBeTruthy()
      }
    }
  })
})

describe('render', () => {
  it('substitui parâmetros nomeados', () => {
    expect(render('alert.reorg_detected.body', { height: 319233 }, 'pt')).toContain('319.233')
  })

  it('formata número conforme o idioma', () => {
    expect(render('alert.reorg_detected.body', { height: 319233 }, 'en')).toContain('319,233')
  })

  it('resolve parâmetro que aponta para outra chave do catálogo', () => {
    const pt = render('alert.funds_received.body', { value: 50000, state: '@state.mempool' }, 'pt')
    const en = render('alert.funds_received.body', { value: 50000, state: '@state.mempool' }, 'en')
    expect(pt).toContain(CATALOG.pt['state.mempool'])
    expect(en).toContain(CATALOG.en['state.mempool'])
  })

  it('devolve a própria chave quando ela não existe, em vez de string vazia', () => {
    expect(render('nao.existe', {}, 'pt')).toBe('nao.existe')
  })

  it('deixa o marcador visível quando falta o parâmetro, em vez de apagar', () => {
    expect(render('alert.reorg_detected.body', {}, 'pt')).toContain('{height}')
  })
})

describe('renderAlert', () => {
  it('monta título e corpo de um dust attack nos dois idiomas', () => {
    const params = { value: 600, threshold: 1000, address: 'tb1q...306fyu' }
    const pt = renderAlert('dust_received', params, 'pt')
    const en = renderAlert('dust_received', params, 'en')

    expect(pt.title).toContain('dust attack')
    expect(pt.body).toContain('600')
    expect(en.title).toContain('dust attack')
    expect(en.body).toContain('600')
    expect(pt.body).not.toBe(en.body)
  })
})

describe('GET /api/i18n/:lang', () => {
  it('serve o catálogo pedido', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/i18n/en' })
    expect(res.statusCode).toBe(200)
    expect(res.json()['alert.dust_received.title']).toBe(CATALOG.en['alert.dust_received.title'])
  })

  it('recusa idioma desconhecido', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/i18n/tlh' })
    expect(res.statusCode).toBe(404)
  })
})
