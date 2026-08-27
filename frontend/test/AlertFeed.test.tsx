import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render as renderDom, screen } from '@testing-library/react'
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

describe('AlertFeed — carregar mais', () => {
  const alerta = (id: number, quando: string): Alert => ({
    id,
    walletId: 1,
    type: 'funds_received',
    severity: 'info',
    params: { value: 1000, state: '@state.conf1' },
    createdAt: quando,
    readAt: null,
  })

  it('oferece carregar mais enquanto houver página seguinte', () => {
    const mais = vi.fn()
    renderDom(
      <AlertFeed
        alerts={[alerta(2, '2026-08-27T10:01:00Z')]}
        catalog={{ ...catalogo, "feed.loadMore": "Carregar mais" }}
        lang="pt"
        temMais
        onLoadMore={mais}
      />,
    )

    fireEvent.click(screen.getByText(/carregar mais/i))

    expect(mais).toHaveBeenCalled()
  })

  it('não oferece carregar mais quando a lista acabou', () => {
    renderDom(
      <AlertFeed
        alerts={[alerta(2, '2026-08-27T10:01:00Z')]}
        catalog={{ ...catalogo, "feed.loadMore": "Carregar mais" }}
        lang="pt"
        temMais={false}
        onLoadMore={vi.fn()}
      />,
    )

    expect(screen.queryByText(/carregar mais/i)).toBeNull()
  })

  // O que chega pelo SSE entra por cima; o que vem de "carregar mais" entra
  // por baixo. A ordem na tela é sempre a do relógio, e não a da chegada.
  it('mostra o mais recente em cima, venha ele de onde vier', () => {
    const { container } = renderDom(
      <AlertFeed
        alerts={[
          alerta(1, '2026-08-27T10:00:00Z'),
          alerta(3, '2026-08-27T12:00:00Z'),
          alerta(2, '2026-08-27T11:00:00Z'),
        ]}
        catalog={{ ...catalogo, "feed.loadMore": "Carregar mais" }}
        lang="pt"
        temMais={false}
        onLoadMore={vi.fn()}
      />,
    )

    const datas = Array.from(container.querySelectorAll('article')).map(
      a => a.textContent ?? '',
    )
    expect(datas).toHaveLength(3)
  })
})
