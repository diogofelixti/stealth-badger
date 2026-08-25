export type ConfirmationState = 'mempool' | 'conf1' | 'conf6'

export function confirmationState(height: number | null, tip: number): ConfirmationState {
  if (height === null) return 'mempool'
  const confirmations = tip - height + 1
  return confirmations >= 6 ? 'conf6' : 'conf1'
}

export function dedupeKey(walletId: number, txid: string, state: string): string {
  return 'wallet:' + walletId + ':tx:' + txid + ':state:' + state
}
