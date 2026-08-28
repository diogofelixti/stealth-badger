import { describe, expect, it } from 'vitest'
import {
  hostDaAnalise,
  resolverFonteDeAnalise,
} from '../src/privacy/fonte-de-analise'

/**
 * Por que a fonte de análise deixou de ser a fonte de cadeia.
 *
 * Até 28/08 as duas eram a mesma coisa: `--api` recebia a URL do backend da
 * carteira. Quem vigia pelo próprio Bitcoin Core recebia isto:
 *
 *   am-i-exposed --api http://host.docker.internal:38332 scan tx <txid>
 *     → {"error":true,"message":"Not found"}
 *
 * Dez de dez análises falharam assim na instância de teste. O scanner só fala
 * REST no formato Esplora — não fala RPC do Core, não fala Electrum —, e
 * apontá-lo para um RPC é pedir `/address/…/txs` a quem não tem essa rota.
 */
describe('resolverFonteDeAnalise', () => {
  // O caso mais comum e o mais barato: quem já vigia por um Esplora não escolhe
  // nada, e nenhum host novo passa a ver os endereços dele.
  it('fonte de cadeia Esplora serve de fonte de análise, sem perguntar nada', () => {
    const r = resolverFonteDeAnalise({
      backendKind: 'esplora',
      backendUrl: 'https://mempool.space/signet/api',
      backendIsPublic: true,
      network: 'signet',
    })

    expect(r).toEqual({
      disponivel: true,
      url: 'https://mempool.space/signet/api',
      origem: 'wallet',
      host: 'mempool.space',
      isPublic: true,
    })
  })

  it('Esplora próprio continua soberano quando serve de fonte de análise', () => {
    expect(
      resolverFonteDeAnalise({
        backendKind: 'esplora',
        backendUrl: 'http://meu-electrs.local:3002',
        backendIsPublic: false,
        network: 'mainnet',
      }),
    ).toMatchObject({ disponivel: true, origem: 'wallet', isPublic: false })
  })

  it('Core usa a fonte que a pessoa escolheu para aquela rede', () => {
    const r = resolverFonteDeAnalise({
      backendKind: 'core',
      backendUrl: 'http://host.docker.internal:38332',
      network: 'signet',
      escolhida: { id: 7, url: 'https://blockstream.info/signet/api', isPublic: true },
    })

    expect(r).toEqual({
      disponivel: true,
      url: 'https://blockstream.info/signet/api',
      origem: 'chosen',
      host: 'blockstream.info',
      isPublic: true,
    })
  })

  it('Electrum segue a mesma regra do Core: ele também não fala REST', () => {
    expect(
      resolverFonteDeAnalise({
        backendKind: 'electrum',
        backendUrl: 'electrum://127.0.0.1:50001',
        network: 'signet',
        escolhida: { id: 7, url: 'https://blockstream.info/signet/api', isPublic: true },
      }),
    ).toMatchObject({ disponivel: true, origem: 'chosen' })
  })

  /*
   * O terceiro estado, e por que ele não é um erro.
   *
   * Escolher a fonte de análise é escolher **quem vê os endereços que você
   * consulta**. O código não toma essa decisão sozinho — mas também não trava:
   * devolve `needsChoice` com o tipo da fonte de cadeia, e a tela pergunta uma
   * vez por rede, listando as candidatas que a instância já traz.
   */
  it('sem escolha ainda, pede a escolha em vez de escolher ou travar', () => {
    const r = resolverFonteDeAnalise({
      backendKind: 'core',
      backendUrl: 'http://host.docker.internal:38332',
      network: 'signet',
    })

    expect(r).toEqual({
      disponivel: false,
      reason: 'needsChoice',
      chainKind: 'core',
      network: 'signet',
    })
  })

  it('escolha nula é o mesmo que não ter escolhido', () => {
    expect(
      resolverFonteDeAnalise({
        backendKind: 'core',
        backendUrl: 'http://127.0.0.1:38332',
        network: 'mainnet',
        escolhida: null,
      }),
    ).toMatchObject({ disponivel: false, reason: 'needsChoice' })
  })

  // Um Esplora próprio escolhido para a análise não é exposição: o selo
  // continua soberano, e a tela precisa desse booleano para não mentir.
  it('a escolha carrega a postura, e não assume pública', () => {
    expect(
      resolverFonteDeAnalise({
        backendKind: 'core',
        backendUrl: 'http://127.0.0.1:8332',
        network: 'mainnet',
        escolhida: { id: 9, url: 'http://meu-esplora.local/api', isPublic: false },
      }),
    ).toMatchObject({ isPublic: false, host: 'meu-esplora.local' })
  })

  it('URL sem forma de URL não derruba nada: o host vira a própria string', () => {
    expect(hostDaAnalise('nao-e-url')).toBe('nao-e-url')
  })
})
