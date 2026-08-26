import { describe, expect, it } from 'vitest'
import { mapComLimite } from '../src/sync/concorrencia'

describe('mapComLimite', () => {
  it('preserva a ordem do resultado, independente de quem termina antes', async () => {
    const r = await mapComLimite([50, 10, 30, 5], 2, async ms => {
      await new Promise(pronto => setTimeout(pronto, ms))
      return ms
    })
    expect(r).toEqual([50, 10, 30, 5])
  })

  // Sem limite, uma carteira de oitenta endereços dispararia oitenta
  // requisições ao mesmo tempo — que é exatamente a rajada que faz o
  // explorador público responder 429.
  it('nunca deixa mais que o limite correndo ao mesmo tempo', async () => {
    let correndo = 0
    let pico = 0
    await mapComLimite([...Array(20).keys()], 4, async () => {
      correndo += 1
      pico = Math.max(pico, correndo)
      await new Promise(pronto => setTimeout(pronto, 10))
      correndo -= 1
      return 0
    })
    expect(pico).toBeLessThanOrEqual(4)
    expect(pico).toBeGreaterThan(1)
  })

  it('é mais rápido que fazer um de cada vez', async () => {
    const t0 = Date.now()
    await mapComLimite([...Array(12).keys()], 4, async () => {
      await new Promise(pronto => setTimeout(pronto, 40))
      return 0
    })
    // doze tarefas de 40 ms em série seriam 480 ms; em quatro frentes, ~120 ms
    expect(Date.now() - t0).toBeLessThan(300)
  })

  it('devolve vazio para lista vazia, sem travar', async () => {
    expect(await mapComLimite([], 4, async () => 1)).toEqual([])
  })

  // Uma falha no meio não pode virar promessa não tratada: o motor precisa
  // vê-la para decidir o que fazer.
  it('propaga a falha de qualquer uma delas', async () => {
    await expect(
      mapComLimite([1, 2, 3], 2, async n => {
        if (n === 2) throw new Error('essa falhou')
        return n
      }),
    ).rejects.toThrow(/essa falhou/)
  })
})
