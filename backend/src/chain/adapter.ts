import type { BackendKind } from '../config'
import type { Network } from '../wallet/descriptor'
import { createElectrumAdapter } from './electrum'
import { createEsploraAdapter } from './esplora'
import type { ChainAdapter } from './types'

/** porta padrão do protocolo Electrum em texto puro */
const PORTA_ELECTRUM = 50001

export interface BackendRow {
  kind: string
  url: string
  isPublic: boolean
  network: Network
}

/**
 * Monta o adapter que a linha de `backends` descreve.
 *
 * Existe para que o tipo do backend seja um dado do banco, e não uma escolha
 * costurada em cada ponto de uso: o motor de sincronização e o cadastro de
 * carteira pedem o adapter pelo mesmo caminho.
 */
export function createAdapter(b: BackendRow): ChainAdapter {
  const kind = b.kind as BackendKind

  if (kind === 'esplora') {
    return createEsploraAdapter(b.url, { isPublic: b.isPublic })
  }

  if (kind === 'electrum') {
    const { hostname, port } = new URL(b.url)
    return createElectrumAdapter({
      host: hostname,
      port: port ? Number(port) : PORTA_ELECTRUM,
      network: b.network,
      isPublic: b.isPublic,
    })
  }

  throw new Error(
    `tipo de backend de cadeia sem adapter: ${b.kind}. ` +
      'Há adapter para esplora e electrum.',
  )
}
