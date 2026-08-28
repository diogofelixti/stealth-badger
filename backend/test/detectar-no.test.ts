import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectarNo } from '../src/chain/detectar-no'

function datadirCom(rede: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'sb-datadir-'))
  if (rede === null) {
    writeFileSync(join(dir, '.cookie'), '__cookie__:abc123')
  } else if (rede) {
    mkdirSync(join(dir, rede))
    writeFileSync(join(dir, rede, '.cookie'), '__cookie__:abc123')
  }
  return dir
}

const sondaQueResponde = async () => ({ blocks: 319631, chain: 'signet' })

describe('detectar o nó pelo diretório de dados', () => {
  // Quem tem um nó sabe onde ele guarda os dados. Porta, subpasta da rede e
  // caminho do cookie são detalhe que o programa sabe deduzir.
  it('acha a signet pela subpasta, e deduz a porta', async () => {
    const dir = datadirCom('signet')

    const r = await detectarNo(dir, sondaQueResponde)

    expect(r).toMatchObject({
      found: true,
      network: 'signet',
      rpcPort: 38332,
      cookiePath: join(dir, 'signet', '.cookie'),
      cookieReadable: true,
      reachable: true,
      blocks: 319631,
      chain: 'signet',
    })
  })

  it('cookie na raiz é mainnet, na porta 8332', async () => {
    const dir = datadirCom(null)

    const r = await detectarNo(dir, async () => ({ blocks: 900000, chain: 'main' }))

    expect(r).toMatchObject({ found: true, network: 'mainnet', rpcPort: 8332 })
  })

  it('testnet também é reconhecida', async () => {
    const dir = datadirCom('testnet4')

    const r = await detectarNo(dir, async () => ({ blocks: 100, chain: 'testnet4' }))

    expect(r).toMatchObject({ found: true, network: 'testnet', rpcPort: 18332 })
  })

  // O backend roda em container: um diretório que existe na máquina de quem
  // hospeda não existe dentro dele. Dizer "não achei" sem dizer isso manda a
  // pessoa procurar defeito onde não há.
  it('diretório que o container não enxerga responde com o trecho do compose', async () => {
    const r = await detectarNo('/caminho/que/nao/existe', sondaQueResponde)

    expect(r.found).toBe(false)
    expect(r.reason).toBe('notMounted')
    expect(r.compose).toContain('/caminho/que/nao/existe')
    expect(r.compose).toContain(':ro')
  })

  it('diretório sem cookie diz que o nó pode estar parado', async () => {
    const dir = datadirCom('')

    const r = await detectarNo(dir, sondaQueResponde)

    expect(r.found).toBe(false)
    expect(r.reason).toBe('noCookie')
  })

  // Achar o arquivo não é falar com o nó: o RPC pode estar desligado, ou em
  // outra porta. A resposta diz as duas coisas separadamente.
  it('acha o cookie e diz que não alcançou o RPC', async () => {
    const dir = datadirCom('signet')

    const r = await detectarNo(dir, async () => {
      throw new Error('connect ECONNREFUSED')
    })

    expect(r).toMatchObject({ found: true, cookieReadable: true, reachable: false })
    expect(r.reason).toBe('unreachable')
    expect(r.hint).toMatch(/ECONNREFUSED|rpcbind|porta/i)
  })
})
