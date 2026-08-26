import { describe, expect, it } from 'vitest'
import { origensEm } from '../src/privacy/origem'
import type { PrivacyFinding } from '../src/privacy/scan'

const achado = (id: string, over: Partial<PrivacyFinding> = {}): PrivacyFinding => ({
  id,
  severity: 'low',
  confidence: 'medium',
  title: 't',
  description: 'd',
  recommendation: 'r',
  scoreImpact: 0,
  params: {},
  ...over,
})

describe('origensEm', () => {
  it('ignora achado que não fala de entidade nenhuma', () => {
    expect(origensEm([achado('h6-rbf-signaled'), achado('anon-set-strong')])).toEqual([])
  })

  // Achado de base de entidades é uma correspondência: o scanner reconheceu
  // quem mandou. Achado de comportamento é heurística sobre a forma da
  // transação. Tratar os dois como a mesma coisa faria o alerta afirmar o que
  // ninguém verificou.
  it('separa correspondência em base de dados de heurística de comportamento', () => {
    const [base] = origensEm([achado('entity-known-input')])
    const [comportamento] = origensEm([achado('entity-behavior-exchange')])
    expect(base!.basis).toBe('database')
    expect(comportamento!.basis).toBe('behavior')
  })

  it('reconhece corretora, darknet e jogo pelo achado de comportamento', () => {
    const tipos = origensEm([
      achado('entity-behavior-exchange'),
      achado('entity-behavior-darknet'),
      achado('entity-behavior-gambling'),
    ]).map(o => o.kind)
    expect(tipos).toEqual(['exchange', 'darknet', 'gambling'])
  })

  it('reconhece o padrão de saque em lote de corretora', () => {
    expect(origensEm([achado('exchange-withdrawal-pattern')])[0]).toMatchObject({
      kind: 'exchange',
      basis: 'behavior',
    })
  })

  it('reconhece correspondência com lista de sanções', () => {
    expect(origensEm([achado('entity-ofac-match')])[0]).toMatchObject({
      kind: 'ofac',
      basis: 'database',
    })
  })

  // A confiança é do scanner, não nossa. Carregá-la para o alerta é o que
  // permite a frase dizer "possível" em vez de afirmar.
  it('carrega a confiança que o scanner declarou', () => {
    const [o] = origensEm([achado('entity-behavior-exchange', { confidence: 'high' })])
    expect(o!.confidence).toBe('high')
  })

  it('não repete a mesma origem quando dois achados apontam para ela', () => {
    const origens = origensEm([
      achado('exchange-withdrawal-pattern'),
      achado('entity-behavior-exchange'),
    ])
    expect(origens).toHaveLength(1)
    expect(origens[0]!.kind).toBe('exchange')
  })

  // Correspondência em base vence heurística: se o scanner reconheceu a
  // entidade, dizer "possível padrão de corretora" seria subestimar o que ele
  // sabe.
  it('prefere a correspondência em base quando as duas apontam para corretora', () => {
    const [o] = origensEm([
      achado('entity-behavior-exchange'),
      achado('entity-known-input', { params: { category: 'exchange' } }),
    ])
    expect(o!.basis).toBe('database')
  })
})
