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
