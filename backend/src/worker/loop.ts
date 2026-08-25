/**
 * Roda `run` em laço, esperando cada ciclo terminar antes de agendar o
 * próximo.
 *
 * `setInterval` dispara pelo relógio, não pelo término: um ciclo mais lento
 * que o intervalo faz o seguinte começar por cima dele. Com o worker isso
 * significa duas sincronizações concorrentes da mesma carteira, escrevendo no
 * mesmo log append-only — e, quanto mais lento fica o explorador, mais
 * ciclos se empilham, o que deixa tudo ainda mais lento.
 *
 * Devolve a função que interrompe o agendamento. Um ciclo já em andamento
 * termina; o próximo não é agendado.
 */
export function startWorkerLoop(
  run: () => Promise<unknown>,
  intervalMs: number,
  onError: (err: unknown) => void = () => {},
): () => void {
  let parado = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function ciclo(): Promise<void> {
    try {
      await run()
    } catch (err) {
      // Um ciclo que falha não pode matar o watchtower: é justamente quando
      // o backend de cadeia está instável que vigiar importa.
      onError(err)
    }
    if (parado) return
    timer = setTimeout(() => void ciclo(), intervalMs)
  }

  void ciclo()

  return () => {
    parado = true
    if (timer !== undefined) clearTimeout(timer)
  }
}
