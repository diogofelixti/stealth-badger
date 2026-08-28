/**
 * Quais carteiras estão sendo analisadas agora.
 *
 * A análise leva mais de um minuto contra a cadeia real, então a rota responde
 * na hora e o trabalho continua aqui. Este registro é o que permite dizer à
 * tela que a análise está correndo, recusar disparar uma segunda por cima da
 * primeira, e — nos testes — esperar o fim sem precisar dormir por tempo fixo.
 *
 * O estado vive no processo e some no reinício, o que é honesto: uma análise
 * interrompida pela queda do processo não terminou mesmo.
 */
const emAndamento = new Map<number, Promise<void>>()
const ultimoErro = new Map<number, string>()
const enderecosEmAndamento = new Map<number, Promise<void>>()
const ultimoErroDeEndereco = new Map<number, string>()
const transacoesEmAndamento = new Map<string, Promise<void>>()
const ultimoErroDeTransacao = new Map<string, string>()

export function scanEmAndamento(walletId: number): boolean {
  return emAndamento.has(walletId)
}

export function erroDoUltimoScan(walletId: number): string | null {
  return ultimoErro.get(walletId) ?? null
}

/** Registra e dispara. Se já houver uma análise correndo, não faz nada. */
export function registrarScan(walletId: number, tarefa: () => Promise<void>): boolean {
  if (emAndamento.has(walletId)) return false

  const promessa = (async () => {
    try {
      await tarefa()
      ultimoErro.delete(walletId)
    } catch (err) {
      // Uma análise que falha não pode derrubar o processo: o watchtower
      // continua vigiando mesmo sem saber o score.
      ultimoErro.set(walletId, (err as Error).message)
      console.error(
        'falha ao analisar privacidade da carteira ' + walletId + ': ' + (err as Error).message,
      )
    } finally {
      emAndamento.delete(walletId)
    }
  })()

  emAndamento.set(walletId, promessa)
  return true
}

export async function aguardarScan(walletId: number): Promise<void> {
  await emAndamento.get(walletId)
}

export function addressScanEmAndamento(addressId: number): boolean {
  return enderecosEmAndamento.has(addressId)
}

export function erroDoUltimoAddressScan(addressId: number): string | null {
  return ultimoErroDeEndereco.get(addressId) ?? null
}

export function registrarAddressScan(addressId: number, tarefa: () => Promise<void>): boolean {
  if (enderecosEmAndamento.has(addressId)) return false

  const promessa = (async () => {
    try {
      await tarefa()
      ultimoErroDeEndereco.delete(addressId)
    } catch (err) {
      ultimoErroDeEndereco.set(addressId, (err as Error).message)
      console.error(
        'falha ao analisar privacidade do endereço ' + addressId + ': ' + (err as Error).message,
      )
    } finally {
      enderecosEmAndamento.delete(addressId)
    }
  })()

  enderecosEmAndamento.set(addressId, promessa)
  return true
}

export async function aguardarAddressScan(addressId: number): Promise<void> {
  await enderecosEmAndamento.get(addressId)
}

function chaveTx(walletId: number, txid: string): string {
  return walletId + ':' + txid
}

export function txScanEmAndamento(walletId: number, txid: string): boolean {
  return transacoesEmAndamento.has(chaveTx(walletId, txid))
}

export function erroDoUltimoTxScan(walletId: number, txid: string): string | null {
  return ultimoErroDeTransacao.get(chaveTx(walletId, txid)) ?? null
}

export function registrarTxScan(
  walletId: number,
  txid: string,
  tarefa: () => Promise<void>,
): boolean {
  const chave = chaveTx(walletId, txid)
  if (transacoesEmAndamento.has(chave)) return false

  const promessa = (async () => {
    try {
      await tarefa()
      ultimoErroDeTransacao.delete(chave)
    } catch (err) {
      ultimoErroDeTransacao.set(chave, (err as Error).message)
      console.error(
        'falha ao analisar privacidade da transação ' + txid + ': ' + (err as Error).message,
      )
    } finally {
      transacoesEmAndamento.delete(chave)
    }
  })()

  transacoesEmAndamento.set(chave, promessa)
  return true
}

export async function aguardarTxScan(walletId: number, txid: string): Promise<void> {
  await transacoesEmAndamento.get(chaveTx(walletId, txid))
}
