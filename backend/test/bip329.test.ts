import { describe, expect, it } from 'vitest'
import { exportarBip329, interpretarBip329 } from '../src/coincontrol/bip329'
import type { Marca } from '../src/coincontrol/marks'

const marca = (over: Partial<Marca> = {}): Marca => ({
  txid: 'aa'.repeat(32),
  vout: 0,
  label: null,
  tags: [],
  frozen: false,
  ...over,
})

function linhas(texto: string): Record<string, unknown>[] {
  return texto
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l))
}

describe('exportação BIP-329', () => {
  it('escreve uma linha JSON por marca, do tipo output', () => {
    const texto = exportarBip329([marca({ label: 'do faucet' })])
    expect(linhas(texto)).toEqual([
      { type: 'output', ref: 'aa'.repeat(32) + ':0', label: 'do faucet' },
    ])
  })

  // O congelamento é o que o BIP-329 chama de `spendable: false`. É o campo
  // que faz o Sparrow respeitar a decisão de não gastar aquele UTXO — sem ele
  // a exportação vira só uma lista de nomes.
  it('traduz congelamento para spendable false', () => {
    const texto = exportarBip329([marca({ label: 'não gastar', frozen: true })])
    expect(linhas(texto)[0]).toMatchObject({ spendable: false })
  })

  it('omite spendable quando o UTXO é gastável, que já é o padrão da spec', () => {
    const texto = exportarBip329([marca({ label: 'normal' })])
    expect(linhas(texto)[0]).not.toHaveProperty('spendable')
  })

  // O BIP-329 não tem campo de tag. Anexá-las ao rótulo como #tag mantém a
  // ida e volta sem perda e continua legível em qualquer carteira que só saiba
  // ler o rótulo.
  it('anexa as tags ao rótulo, já que a spec não tem campo para elas', () => {
    const texto = exportarBip329([marca({ label: 'troco', tags: ['nao-kyc', 'coinjoin'] })])
    expect(linhas(texto)[0]!.label).toBe('troco #nao-kyc #coinjoin')
  })

  it('exporta só as tags quando não há rótulo escrito', () => {
    const texto = exportarBip329([marca({ tags: ['kyc'] })])
    expect(linhas(texto)[0]!.label).toBe('#kyc')
  })

  it('não escreve linha para marca que não diz nada', () => {
    expect(exportarBip329([marca()]).trim()).toBe('')
  })

  it('termina o arquivo com quebra de linha, como manda o formato de linhas', () => {
    expect(exportarBip329([marca({ label: 'x' })]).endsWith('\n')).toBe(true)
  })
})

describe('importação BIP-329', () => {
  it('lê rótulo e congelamento de um arquivo de outra carteira', () => {
    const arquivo =
      JSON.stringify({
        type: 'output',
        ref: 'bb'.repeat(32) + ':1',
        label: 'salário',
        spendable: false,
      }) + '\n'
    const { marcas } = interpretarBip329(arquivo)
    expect(marcas).toEqual([
      { txid: 'bb'.repeat(32), vout: 1, label: 'salário', tags: [], frozen: true },
    ])
  })

  it('separa de volta as tags anexadas ao rótulo', () => {
    const arquivo =
      JSON.stringify({
        type: 'output',
        ref: 'cc'.repeat(32) + ':0',
        label: 'troco #nao-kyc #coinjoin',
      }) + '\n'
    const { marcas } = interpretarBip329(arquivo)
    expect(marcas[0]).toMatchObject({ label: 'troco', tags: ['nao-kyc', 'coinjoin'] })
  })

  // Um arquivo do Sparrow traz tx, addr e xpub junto. Engasgar neles perderia
  // o arquivo inteiro por causa de linhas que simplesmente não nos servem.
  it('ignora os tipos que não sabemos usar, sem perder o resto do arquivo', () => {
    const arquivo =
      [
        JSON.stringify({ type: 'tx', ref: 'dd'.repeat(32), label: 'uma transação' }),
        JSON.stringify({ type: 'xpub', ref: 'zpub...', label: 'a carteira' }),
        JSON.stringify({ type: 'output', ref: 'ee'.repeat(32) + ':2', label: 'este serve' }),
      ].join('\n') + '\n'
    const { marcas, ignoradas } = interpretarBip329(arquivo)
    expect(marcas).toHaveLength(1)
    expect(marcas[0]!.label).toBe('este serve')
    expect(ignoradas).toBe(2)
  })

  // Uma linha corrompida no meio do arquivo não pode custar as outras mil.
  it('pula linha inválida em vez de abortar o arquivo inteiro', () => {
    const arquivo =
      [
        JSON.stringify({ type: 'output', ref: 'ff'.repeat(32) + ':0', label: 'antes' }),
        '{ isto não é json',
        '',
        JSON.stringify({ type: 'output', ref: '11'.repeat(32) + ':0', label: 'depois' }),
      ].join('\n') + '\n'
    const { marcas, ignoradas } = interpretarBip329(arquivo)
    expect(marcas.map(m => m.label)).toEqual(['antes', 'depois'])
    expect(ignoradas).toBe(1)
  })

  it('descarta output cuja referência não é txid:vout', () => {
    const arquivo = JSON.stringify({ type: 'output', ref: 'sem-vout', label: 'x' }) + '\n'
    const { marcas, ignoradas } = interpretarBip329(arquivo)
    expect(marcas).toHaveLength(0)
    expect(ignoradas).toBe(1)
  })

  // A prova de que o formato serve para interoperar de verdade.
  it('sobrevive à ida e à volta sem perder nada', () => {
    const originais: Marca[] = [
      marca({ label: 'do faucet', tags: ['nao-kyc'], frozen: true }),
      marca({ txid: '22'.repeat(32), vout: 3, label: 'salário', tags: [] }),
      marca({ txid: '33'.repeat(32), vout: 1, label: null, tags: ['coinjoin'] }),
    ]
    const { marcas } = interpretarBip329(exportarBip329(originais))
    expect(marcas).toEqual(originais)
  })
})
