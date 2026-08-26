export interface ChainCapabilities {
  randomAccess: boolean
  needsRegistration: boolean
  supportsSubscribe: boolean
  hasTxIndex: boolean
  isPublic: boolean
  host: string
}

export interface TxRef {
  txid: string
  height: number | null
  blockHash: string | null
}

/**
 * Retrato barato do que existe num endereço.
 *
 * `status` é opaco: só se compara por igualdade contra o status guardado da
 * volta anterior. Se for igual, nada aconteceu naquele endereço e não há por
 * que pedir a lista de UTXO de novo. `null` significa que o backend não sabe
 * dizer, e a reconferência acontece como antes.
 */
export interface AddressStatus {
  used: boolean
  status: string | null
}

export interface Utxo {
  txid: string
  vout: number
  value: number
  height: number | null
}

export interface ChainAdapter {
  capabilities(): ChainCapabilities
  tipHeight(): Promise<number>
  blockHashAt(height: number): Promise<string>
  getHistoryForAddress?(address: string): Promise<TxRef[]>
  getAddressStatus?(address: string): Promise<AddressStatus>
  getUtxosForAddress?(address: string): Promise<Utxo[]>
  registerDescriptor?(descriptor: string): Promise<void>
  rescanFrom?(height: number): Promise<void>
  subscribe?(scripthash: string, onChange: () => void): () => void
}
