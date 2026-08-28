import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { engineNoSocket } from '../src/access/docker'

/**
 * Que o cliente fala HTTP por socket de domínio Unix, provado contra um
 * servidor de verdade.
 *
 * O resto da suíte de controle usa um engine falso em memória, que prova a
 * lógica e não prova o transporte. Este arquivo cobre a outra metade: um
 * `http.Server` escutando num `.sock` de diretório temporário, que é
 * exatamente a forma do `/var/run/docker.sock`.
 */
let servidor: Server | null = null
let dir: string | null = null

function engineDeMentira(responder: (req: { method: string; url: string }) => {
  status: number
  body: string
}) {
  dir = mkdtempSync(join(tmpdir(), 'sb-docker-'))
  const caminho = join(dir, 'engine.sock')
  servidor = createServer((req, res) => {
    const r = responder({ method: req.method ?? '', url: req.url ?? '' })
    res.writeHead(r.status, { 'content-type': 'application/json' })
    res.end(r.body)
  })
  return new Promise<string>(resolve => servidor!.listen(caminho, () => resolve(caminho)))
}

afterEach(() => {
  servidor?.close()
  servidor = null
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

describe('engineNoSocket', () => {
  it('leva método e caminho ao socket, e devolve status e corpo', async () => {
    const vistos: { method: string; url: string }[] = []
    const caminho = await engineDeMentira(req => {
      vistos.push(req)
      return { status: 200, body: '[{"Id":"abc"}]' }
    })

    const r = await engineNoSocket(caminho)('GET', '/containers/json?all=true')

    expect(r).toEqual({ status: 200, body: '[{"Id":"abc"}]' })
    expect(vistos).toEqual([{ method: 'GET', url: '/containers/json?all=true' }])
  })

  it('204 sem corpo é resposta válida, e não fica pendurado', async () => {
    const caminho = await engineDeMentira(() => ({ status: 204, body: '' }))

    expect(await engineNoSocket(caminho)('POST', '/containers/abc/start')).toEqual({
      status: 204,
      body: '',
    })
  })

  // Socket que não existe é o caso de quem não montou nada: precisa chegar
  // como erro comum, para `controlarPerfil` transformar em `unreachable`.
  it('socket ausente rejeita, em vez de travar', async () => {
    const chamar = engineNoSocket('/tmp/nao-existe-este-socket.sock')

    await expect(chamar('GET', '/containers/json')).rejects.toThrow()
  })
})
