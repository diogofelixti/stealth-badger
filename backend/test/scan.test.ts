import { describe, expect, it } from 'vitest'
import { cliRunner } from '../src/privacy/scan'

describe('o scanner e a rede do container', () => {
  it('manda o processo filho resolver IPv4 antes de IPv6', async () => {
    // Medido em 28/08: o container do backend tem só `::1` como endereço IPv6,
    // e o DNS devolve AAAA para os dois exploradores públicos. Resolver IPv6
    // primeiro faz toda consulta morrer como `fetch failed` — sem host, sem
    // código e sem causa. O scanner é outro processo Node e herdaria o mesmo
    // tropeço, então a ordem vai junto no ambiente dele.
    const runner = cliRunner(10_000, process.execPath)
    const saida = await runner([
      '-e',
      'process.stdout.write(JSON.stringify({ opts: process.env.NODE_OPTIONS }))',
    ])
    expect(JSON.parse(saida).opts).toContain('--dns-result-order=ipv4first')
  })

  it('não apaga o NODE_OPTIONS que já existia', async () => {
    const antes = process.env.NODE_OPTIONS
    process.env.NODE_OPTIONS = '--max-old-space-size=512'
    try {
      const runner = cliRunner(10_000, process.execPath)
      const saida = await runner([
        '-e',
        'process.stdout.write(JSON.stringify({ opts: process.env.NODE_OPTIONS }))',
      ])
      const opts = JSON.parse(saida).opts as string
      expect(opts).toContain('--max-old-space-size=512')
      expect(opts).toContain('--dns-result-order=ipv4first')
    } finally {
      if (antes === undefined) delete process.env.NODE_OPTIONS
      else process.env.NODE_OPTIONS = antes
    }
  })
})
