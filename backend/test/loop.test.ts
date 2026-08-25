import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startWorkerLoop } from '../src/worker/loop'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** Promessa que só resolve quando mandarem. */
function adiada() {
  let resolver!: () => void
  const promessa = new Promise<void>(r => {
    resolver = r
  })
  return { promessa, resolver }
}

describe('startWorkerLoop', () => {
  // `setInterval` dispara no relógio, não no término. Um ciclo mais lento que
  // o intervalo faz o seguinte começar por cima dele: duas sincronizações
  // concorrentes da mesma carteira, escrevendo no mesmo log append-only.
  it('não começa um ciclo enquanto o anterior não terminou', async () => {
    const emCurso = adiada()
    const run = vi.fn(() => emCurso.promessa)
    const parar = startWorkerLoop(run, 1000)

    expect(run).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)
    expect(run).toHaveBeenCalledTimes(1)

    emCurso.resolver()
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(2)

    parar()
  })

  it('espera o intervalo entre o fim de um ciclo e o começo do próximo', async () => {
    const run = vi.fn(async () => {})
    const parar = startWorkerLoop(run, 1000)

    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(999)
    expect(run).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(2)

    parar()
  })

  // Um ciclo que falha não pode matar o watchtower: é justamente quando o
  // backend de cadeia está instável que vigiar importa.
  it('continua depois de um ciclo que falhou', async () => {
    const run = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('explorador fora do ar'))
      .mockResolvedValue(undefined)
    const parar = startWorkerLoop(run, 1000)

    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(2)

    parar()
  })

  it('para de agendar depois de parar', async () => {
    const run = vi.fn(async () => {})
    const parar = startWorkerLoop(run, 1000)

    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(1)

    parar()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  // Parar no meio de um ciclo não interrompe o que já está rodando, mas o
  // próximo não pode ser agendado.
  it('não agenda o próximo se pararem durante um ciclo', async () => {
    const emCurso = adiada()
    const run = vi.fn(() => emCurso.promessa)
    const parar = startWorkerLoop(run, 1000)

    expect(run).toHaveBeenCalledTimes(1)
    parar()
    emCurso.resolver()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
