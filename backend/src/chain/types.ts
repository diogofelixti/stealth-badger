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

/** Quem consumiu uma saída, e onde isso ficou registrado. */
export interface Outspend {
  spentByTxid: string
  height: number | null
  blockHash: string | null
}

/**
 * Uma saída não gasta de uma carteira **registrada** no backend.
 *
 * O design previu `registerDescriptor` e `rescanFrom`, mas não previu como ler
 * de volta o que o backend passou a seguir. Sem isto o registro seria um
 * caminho sem saída: o descriptor entra e nada volta.
 *
 * Traz o endereço e o caminho de derivação porque, no modelo de registro, é o
 * backend quem sabe qual endereço é qual — o motor não derivou nada.
 */
export interface RegisteredUtxo {
  txid: string
  vout: number
  value: number
  height: number | null
  address: string
  derivationPath: string
}

export interface ChainAdapter {
  capabilities(): ChainCapabilities
  tipHeight(): Promise<number>
  blockHashAt(height: number): Promise<string>
  getHistoryForAddress?(address: string): Promise<TxRef[]>
  getAddressStatus?(address: string): Promise<AddressStatus>
  getUtxosForAddress?(address: string): Promise<Utxo[]>
  /**
   * Quem gastou `txid:vout`, ou `null` se ninguém gastou.
   *
   * Sem isto o evento de gasto só pode registrar que o UTXO sumiu da lista,
   * sem dizer quando nem por quem — e gravar a altura da ponta no lugar seria
   * escrever um número errado num log que não se corrige.
   */
  getOutspend?(txid: string, vout: number): Promise<Outspend | null>
  registerDescriptor?(descriptor: string): Promise<void>
  rescanFrom?(height: number): Promise<void>
  /** As saídas não gastas do que foi registrado. Par de `registerDescriptor`. */
  getRegisteredUtxos?(): Promise<RegisteredUtxo[]>
  subscribe?(scripthash: string, onChange: () => void): () => void
  /**
   * Encerra a conexão que o adapter mantém aberta, quando ele mantém alguma.
   * O Esplora fala HTTP e não tem o que fechar; o Electrum segura um socket, e
   * sem isto o worker vazaria um por carteira a cada ciclo.
   */
  close?(): void
}
