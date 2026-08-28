import { describe, expect, it } from 'vitest'
import { sondarCloudflare, sondarTailscale } from '../src/access/sondas'

/**
 * O que estas sondas medem, e o que elas deliberadamente **não** medem.
 *
 * A regra que vale para as três: só existem dois jeitos honestos de responder
 * "não" — `down`, que é a sonda tendo respondido que o caminho não está lá, e
 * `unknown`, que é a sonda não ter conseguido perguntar. Colapsar os dois num
 * indicador vermelho faz a tela dizer "desligado" quando a verdade é "não sei
 * olhar daqui", e é exatamente o tipo de afirmação que este produto denuncia.
 */
describe('sonda do Tailscale', () => {
  it('nome que resolve na MagicDNS está de pé', async () => {
    const sonda = await sondarTailscale('badger.tail1234.ts.net', async () => ['100.64.0.7'])

    expect(sonda).toEqual({ status: 'up', statusSource: 'dns' })
  })

  // Nome que não existe é resposta, e não falha: a Tailscale publica o registro
  // assim que a máquina entra na tailnet, então não achar o nome é a prova de
  // que ela não entrou.
  it('nome que não existe está desligado, e isso é uma resposta', async () => {
    const ausente = Object.assign(new Error('queryA ENOTFOUND'), { code: 'ENOTFOUND' })
    const sonda = await sondarTailscale('badger.tail1234.ts.net', async () => {
      throw ausente
    })

    expect(sonda).toEqual({ status: 'down', statusSource: 'dns' })
  })

  it('resolvedor sem resposta nenhuma também está desligado', async () => {
    const sonda = await sondarTailscale('badger.tail1234.ts.net', async () => [])

    expect(sonda).toEqual({ status: 'down', statusSource: 'dns' })
  })

  // DNS que falhou por outro motivo não é o mesmo que nome inexistente. Dizer
  // "desligado" aqui seria inventar uma medição que não aconteceu.
  it('DNS fora do ar não vira "desligado": vira "não sei"', async () => {
    const quebrado = Object.assign(new Error('queryA ESERVFAIL'), { code: 'ESERVFAIL' })
    const sonda = await sondarTailscale('badger.tail1234.ts.net', async () => {
      throw quebrado
    })

    expect(sonda).toEqual({ status: 'unknown', statusSource: 'none' })
  })
})

describe('sonda da Cloudflare', () => {
  const resposta = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { 'content-type': 'application/json' },
    })

  it('túnel com conexões prontas está de pé', async () => {
    const sonda = await sondarCloudflare('http://cloudflared:2000/ready', async () =>
      resposta(200, { status: 200, readyConnections: 4 }),
    )

    expect(sonda).toEqual({ status: 'up', statusSource: 'http' })
  })

  // O `cloudflared` responde 200 ao subir, antes de ter conexão nenhuma com a
  // borda. Verde aqui seria dizer que o painel está publicado quando ele ainda
  // não está alcançável de lugar nenhum.
  it('container de pé sem conexão nenhuma ainda não é túnel de pé', async () => {
    const sonda = await sondarCloudflare('http://cloudflared:2000/ready', async () =>
      resposta(200, { status: 200, readyConnections: 0 }),
    )

    expect(sonda).toEqual({ status: 'down', statusSource: 'http' })
  })

  it('503 do endpoint de prontidão é desligado', async () => {
    const sonda = await sondarCloudflare('http://cloudflared:2000/ready', async () =>
      resposta(503, { status: 503, readyConnections: 0 }),
    )

    expect(sonda).toEqual({ status: 'down', statusSource: 'http' })
  })

  // Sem `--metrics` no compose não há a quem perguntar. O túnel pode estar
  // perfeitamente de pé, e a tela precisa dizer que não olhou.
  it('endpoint de métricas inalcançável vira "não sei", nunca "desligado"', async () => {
    const sonda = await sondarCloudflare('http://cloudflared:2000/ready', async () => {
      throw new Error('ECONNREFUSED')
    })

    expect(sonda).toEqual({ status: 'unknown', statusSource: 'none' })
  })

  it('corpo que não é JSON não derruba a sonda', async () => {
    const sonda = await sondarCloudflare(
      'http://cloudflared:2000/ready',
      async () => new Response('ok', { status: 200 }),
    )

    expect(sonda).toEqual({ status: 'up', statusSource: 'http' })
  })
})
