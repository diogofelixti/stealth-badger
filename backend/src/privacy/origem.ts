import type { PrivacyFinding } from './scan'

/**
 * Que espécie de origem o scanner apontou.
 *
 * `known` é entidade reconhecida sem categoria mais específica; `ofac`, a
 * correspondência com lista de sanções que o scanner carrega.
 */
export type EspecieDeOrigem = 'exchange' | 'darknet' | 'gambling' | 'ofac' | 'known'

/**
 * Em que o scanner se baseou.
 *
 * `database` é correspondência: ele reconheceu quem mandou. `behavior` é
 * heurística sobre a forma da transação — muitas saídas, tipos de script
 * misturados. A distinção não é detalhe: ela é o que separa o alerta que
 * afirma do alerta que levanta suspeita, e apagá-la faria o watchtower
 * afirmar o que ninguém verificou.
 */
export type BaseDaOrigem = 'database' | 'behavior'

export interface AchadoDeOrigem {
  kind: EspecieDeOrigem
  basis: BaseDaOrigem
  /** confiança declarada pelo próprio scanner, repassada sem retoque */
  confidence: string
  /** o achado que a produziu, para rastrear de volta ao relatório */
  findingId: string
}

const POR_ACHADO: Record<string, { kind: EspecieDeOrigem; basis: BaseDaOrigem }> = {
  'entity-known-input': { kind: 'known', basis: 'database' },
  'entity-known-output': { kind: 'known', basis: 'database' },
  'address-entity-identified': { kind: 'known', basis: 'database' },
  'entity-ofac-match': { kind: 'ofac', basis: 'database' },
  'entity-behavior-exchange': { kind: 'exchange', basis: 'behavior' },
  'entity-behavior-darknet': { kind: 'darknet', basis: 'behavior' },
  'entity-behavior-gambling': { kind: 'gambling', basis: 'behavior' },
  'exchange-withdrawal-pattern': { kind: 'exchange', basis: 'behavior' },
}

/** Categoria declarada nos parâmetros do achado de base, quando existe. */
const CATEGORIAS: EspecieDeOrigem[] = ['exchange', 'darknet', 'gambling']

function especieDe(achado: PrivacyFinding, padrao: EspecieDeOrigem): EspecieDeOrigem {
  const categoria = (achado.params as { category?: unknown }).category
  if (typeof categoria === 'string' && (CATEGORIAS as string[]).includes(categoria)) {
    return categoria as EspecieDeOrigem
  }
  return padrao
}

/**
 * Extrai do relatório de uma transação o que ele diz sobre a origem dos
 * fundos, sem acrescentar julgamento nenhum.
 */
export function origensEm(findings: PrivacyFinding[]): AchadoDeOrigem[] {
  const porEspecie = new Map<EspecieDeOrigem, AchadoDeOrigem>()

  for (const achado of findings) {
    const mapeado = POR_ACHADO[achado.id]
    if (!mapeado) continue

    const kind = especieDe(achado, mapeado.kind)
    const candidato: AchadoDeOrigem = {
      kind,
      basis: mapeado.basis,
      confidence: achado.confidence,
      findingId: achado.id,
    }

    // Correspondência em base vence heurística: se o scanner reconheceu a
    // entidade, dizer "possível padrão de corretora" subestimaria o que ele
    // sabe.
    const atual = porEspecie.get(kind)
    if (!atual || (atual.basis === 'behavior' && candidato.basis === 'database')) {
      porEspecie.set(kind, candidato)
    }
  }

  return [...porEspecie.values()]
}
