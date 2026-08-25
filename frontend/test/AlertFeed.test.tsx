import { describe, expect, it } from 'vitest'
import { render as renderDom, screen } from '@testing-library/react'
import { AlertFeed } from '../src/components/AlertFeed'
import type { Alert } from '../src/lib/api'

const catalogo = {
  'alert.dust_received.title': 'Possível dust attack',
  'alert.dust_received.body': 'Chegaram {value} sats de origem desconhecida em {address}.',
  'alert.funds_received.title': 'Fundos recebidos',
  'alert.funds_received.body': '{value} sats, {state}.',
  'state.conf1': 'confirmado',
  'severity.info': 'informativo',
  'severity.critical': 'crítico',
  'feed.empty': 'Nenhum alerta ainda.',
}

const alertas: Alert[] = [
  {
    id: 2, walletId: 1, type: 'funds_received', severity: 'info',
    params: { value: 50000, state: '@state.conf1' },
    createdAt: '2026-08-25T09:00:00Z',
  },
  {
    id: 1, walletId: 1, type: 'dust_received', severity: 'critical',
    params: { value: 600, address: 'tb1q...306fyu' },
    createdAt: '2026-08-25T10:00:00Z',
  },
]

describe('AlertFeed', () => {
  it('lista o alerta mais recente primeiro, venha na ordem que vier', () => {
    renderDom(<AlertFeed alerts={alertas} catalog={catalogo} lang="pt" />)
    const titulos = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
    expect(titulos[0]).toContain('dust attack')
  })

  // Daltonismo é comum e o crítico é justamente o que não pode passar batido:
  // a palavra carrega a severidade, a cor só reforça.
  it('marca severidade com palavra, não apenas com cor', () => {
    renderDom(<AlertFeed alerts={alertas} catalog={catalogo} lang="pt" />)
    const critico = screen.getByText('Possível dust attack').closest('article')!
    expect(critico.textContent).toContain('crítico')
  })

  it('expõe a severidade em atributo acessível', () => {
    renderDom(<AlertFeed alerts={alertas} catalog={catalogo} lang="pt" />)
    const critico = screen.getByText('Possível dust attack').closest('article')!
    expect(critico.getAttribute('data-severity')).toBe('critical')
  })

  it('renderiza o corpo com os parâmetros do alerta', () => {
    renderDom(<AlertFeed alerts={alertas} catalog={catalogo} lang="pt" />)
    const critico = screen.getByText('Possível dust attack').closest('article')!
    expect(critico.textContent).toContain('600')
    expect(critico.textContent).toContain('tb1q...306fyu')
  })

  it('mostra estado vazio quando não há alerta', () => {
    renderDom(<AlertFeed alerts={[]} catalog={catalogo} lang="pt" />)
    expect(screen.getByText(/nenhum alerta/i)).toBeDefined()
  })
})
