import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = resolve(process.cwd(), 'src')

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap(nome => {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) return arquivos(caminho)
    return caminho.endsWith('.tsx') ? [caminho] : []
  })
}

/**
 * A assinatura do "texto que age": um `<a>` ou um `<label>` clicável vestido de
 * rótulo em caixa alta — `tracking-label` — e sem a forma de botão.
 *
 * A varredura de 27/08 trocou todos os `<button>` e deixou estes dois de fora,
 * porque eles agem sem ser botão: exportar rótulos é um link, importar é um
 * `<label>` com um `input file` escondido. Continuavam texto com cor de link.
 */
function acoesSemForma(): string[] {
  const achados: string[] = []
  for (const caminho of arquivos(RAIZ)) {
    const linhas = readFileSync(caminho, 'utf8').split('\n')
    linhas.forEach((linha, i) => {
      const abreAcao = /<(a|label)\b/.test(linha)
      if (!abreAcao) return
      // o elemento e seus atributos podem ocupar várias linhas
      const bloco = linhas.slice(i, i + 8).join(' ')
      if (!/tracking-label/.test(bloco)) return
      // `<label htmlFor>` de campo é rótulo de verdade, e não ação
      if (/htmlFor=/.test(bloco) && !/<input[^>]*type="file"/.test(bloco)) return
      if (/sb-btn|className=\{`sb-btn/.test(bloco)) return
      if (/<Button/.test(bloco)) return
      achados.push(`${relative(RAIZ, caminho)}:${i + 1}`)
    })
  }
  return achados
}

describe('nenhuma ação clicável fica sem forma', () => {
  it('não há link nem label agindo como botão de texto', () => {
    expect(acoesSemForma()).toEqual([])
  })
})
