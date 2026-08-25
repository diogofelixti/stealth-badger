import { describe, expect, it } from 'vitest'
import type { ChainAdapter } from '../src/chain/types'
import { detectScriptType } from '../src/wallet/detect'
import { deriveAddress, } from '../src/wallet/derive'
import { parseExtendedKey } from '../src/wallet/descriptor'

// tpub de uma carteira native segwit de verdade — o caso que quebrava:
// pela SLIP-132 um tpub significa p2pkh, mas Bitcoin Core e Sparrow exportam
// tpub puro para qualquer tipo de script.
const TPUB =
  'tpubDCxX2sYFS5bDkSe5GKKYHjBW7tgyN1R3UchpLJvdbf54ohxeGRtd8MbDUe1cguVHe4vnK68DsuD5MXjxi9EXx16rb9EnNsaF5KT99CinaJz'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

function adapterComHistorico(usados: Set<string>): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
      hasTxIndex: true,
      isPublic: false,
      host: 'falso',
    }),
    tipHeight: async () => 100,
    blockHashAt: async () => 'hash',
    getHistoryForAddress: async (addr: string) =>
      usados.has(addr) ? [{ txid: 'aa', height: 10, blockHash: 'bb' }] : [],
  }
}

/** Endereços que a carteira teria, se fosse do tipo `tipo`. */
function enderecosDe(tipo: 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'p2tr', quantos = 3): string[] {
  const { canonicalXpub } = parseExtendedKey(TPUB)
  return Array.from({ length: quantos }, (_, i) =>
    deriveAddress(canonicalXpub, tipo, 'signet', 0, i).address,
  )
}

describe('parseExtendedKey — ambiguidade do tipo de script', () => {
  it('marca xpub e tpub puros como ambíguos', () => {
    expect(parseExtendedKey(TPUB).scriptTypeAmbiguous).toBe(true)
  })

  it('não marca zpub como ambíguo: a SLIP-132 já diz o tipo', () => {
    expect(parseExtendedKey(ZPUB).scriptTypeAmbiguous).toBe(false)
  })
})

describe('detectScriptType', () => {
  // O caso real: a chave é de uma carteira native segwit, e derivar p2pkh
  // dela devolve endereços que nunca foram usados. Sem detectar, a carteira
  // sincroniza, diz `synced` e mostra saldo zero — falha silenciosa.
  it('reconhece native segwit quando só os endereços p2wpkh têm histórico', async () => {
    const { canonicalXpub } = parseExtendedKey(TPUB)
    const adapter = adapterComHistorico(new Set(enderecosDe('p2wpkh')))

    expect(await detectScriptType(canonicalXpub, 'signet', adapter)).toBe('p2wpkh')
  })

  it('reconhece legado quando o histórico está nos endereços p2pkh', async () => {
    const { canonicalXpub } = parseExtendedKey(TPUB)
    const adapter = adapterComHistorico(new Set(enderecosDe('p2pkh')))

    expect(await detectScriptType(canonicalXpub, 'signet', adapter)).toBe('p2pkh')
  })

  it('reconhece segwit aninhado', async () => {
    const { canonicalXpub } = parseExtendedKey(TPUB)
    const adapter = adapterComHistorico(new Set(enderecosDe('p2sh-p2wpkh')))

    expect(await detectScriptType(canonicalXpub, 'signet', adapter)).toBe('p2sh-p2wpkh')
  })

  it('reconhece taproot', async () => {
    const { canonicalXpub } = parseExtendedKey(TPUB)
    const adapter = adapterComHistorico(new Set(enderecosDe('p2tr')))

    expect(await detectScriptType(canonicalXpub, 'signet', adapter)).toBe('p2tr')
  })

  // Carteira nova, ainda sem nenhuma transação: não há o que detectar, e
  // inventar um tipo seria pior que admitir que não dá para saber.
  it('devolve null quando nenhum tipo tem histórico', async () => {
    const { canonicalXpub } = parseExtendedKey(TPUB)
    const adapter = adapterComHistorico(new Set())

    expect(await detectScriptType(canonicalXpub, 'signet', adapter)).toBeNull()
  })

  it('olha além do primeiro endereço: a carteira pode ter pulado índices', async () => {
    const { canonicalXpub } = parseExtendedKey(TPUB)
    const terceiro = deriveAddress(canonicalXpub, 'p2wpkh', 'signet', 0, 2).address
    const adapter = adapterComHistorico(new Set([terceiro]))

    expect(await detectScriptType(canonicalXpub, 'signet', adapter)).toBe('p2wpkh')
  })

  // Um backend sem acesso aleatório não consegue responder por endereço.
  it('devolve null sem quebrar quando o adapter não sabe consultar endereço', async () => {
    const { canonicalXpub } = parseExtendedKey(TPUB)
    const semConsulta: ChainAdapter = {
      capabilities: () => ({
        randomAccess: false,
        needsRegistration: true,
        supportsSubscribe: false,
        hasTxIndex: false,
        isPublic: false,
        host: 'falso',
      }),
      tipHeight: async () => 100,
      blockHashAt: async () => 'hash',
    }

    expect(await detectScriptType(canonicalXpub, 'signet', semConsulta)).toBeNull()
  })
})
