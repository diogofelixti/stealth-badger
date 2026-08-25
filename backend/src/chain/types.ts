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
  getUtxosForAddress?(address: string): Promise<Utxo[]>
  registerDescriptor?(descriptor: string): Promise<void>
  rescanFrom?(height: number): Promise<void>
  subscribe?(scripthash: string, onChange: () => void): () => void
}
