import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Lido do disco, e não importado: o teste confere o CSS que vai para o bundle,
// e não uma cópia dos valores mantida à parte — que envelheceria sozinha.
const CSS = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')

/** Os cinco temas que a tela oferece. `sett` mora no `:root` sem atributo. */
const TEMAS = ['sett', 'bone', 'carvao', 'contraste', 'cypherpunk'] as const

function blocoDoTema(tema: string): string {
  if (tema === 'sett') {
    const i = CSS.indexOf(':root {')
    return CSS.slice(i, CSS.indexOf('\n}', i))
  }
  const marca = `:root[data-theme='${tema}']`
  const alternativa = `:root[data-theme="${tema}"]`
  const i = CSS.includes(marca) ? CSS.indexOf(marca) : CSS.indexOf(alternativa)
  if (i === -1) return ''
  return CSS.slice(i, CSS.indexOf('\n}', i))
}

/** Resolve `--sb-text` até o hexadecimal, seguindo os `var()` da camada crua. */
function valor(tema: string, token: string): string {
  const bloco = blocoDoTema(tema)
  const padrao = new RegExp(`${token}:\\s*([^;]+);`)
  const doTema = bloco.match(padrao)?.[1]?.trim()
  const doPadrao = blocoDoTema('sett').match(padrao)?.[1]?.trim()
  const bruto = doTema ?? doPadrao ?? ''
  const referencia = bruto.match(/var\((--[a-z0-9-]+)\)/)
  return referencia ? valor(tema, referencia[1]!) : bruto
}

function canal(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminancia(hex: string): number {
  const h = hex.replace('#', '').trim()
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

function contraste(a: string, b: string): number {
  const [maior, menor] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (maior! + 0.05) / (menor! + 0.05)
}

/**
 * As duas cores da listra de aviso, resolvidas até o hexadecimal.
 *
 * `valor()` não serve aqui: ele segue **o primeiro** `var()` e para. A listra
 * é um gradiente de dois tons, e o que importa dela é justamente o par.
 */
function coresDaListra(tema: string): [string, string] {
  const padrao = /--sb-stripe-warning:\s*([^;]+);/
  const bruto =
    blocoDoTema(tema).match(padrao)?.[1] ?? blocoDoTema('sett').match(padrao)![1]!
  const nomes = [...bruto.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(m => m[1]!)
  return [valor(tema, nomes[0]!), valor(tema, nomes[1]!)]
}

function distanciaRgb(a: string, b: string): number {
  const canais = (hex: string) => {
    const h = hex.replace('#', '')
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
  }
  const [x, y] = [canais(a), canais(b)]
  return Math.sqrt(x!.reduce((soma, c, i) => soma + (c - y![i]!) ** 2, 0))
}

describe.each(TEMAS)('tema %s', tema => {
  it('existe e define a matéria-prima', () => {
    expect(blocoDoTema(tema)).not.toBe('')
    expect(valor(tema, '--sb-bg')).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('o corpo do texto cumpre 4,5:1 sobre o fundo', () => {
    expect(contraste(valor(tema, '--sb-text'), valor(tema, '--sb-bg'))).toBeGreaterThanOrEqual(4.5)
  })

  it('o texto secundário cumpre 4,5:1 sobre a superfície', () => {
    expect(
      contraste(valor(tema, '--sb-text-muted'), valor(tema, '--sb-surface')),
    ).toBeGreaterThanOrEqual(4.5)
  })

  // O aviso de explorador público é a tese do produto. Um tema que o deixe
  // invisível a desmonta sem levantar exceção nenhuma.
  it('o aviso de explorador público aparece sobre o fundo, com 3:1', () => {
    expect(contraste(valor(tema, '--sb-public'), valor(tema, '--sb-bg'))).toBeGreaterThanOrEqual(3)
  })

  it('o crítico aparece sobre o fundo, com 3:1', () => {
    expect(contraste(valor(tema, '--sb-critical'), valor(tema, '--sb-bg'))).toBeGreaterThanOrEqual(3)
  })

  // A listra de aviso é a assinatura da interface, e ela só avisa enquanto as
  // duas barras se distinguem. O `cypherpunk` remonta a listra sobre
  // `--sb-caution` porque, num tema todo verde, a barra de `--sb-bone` teria a
  // cor de todo o resto — este caso é o que impede a remontagem de sair errada.
  it('as duas barras da listra de aviso se distinguem, com 3:1', () => {
    const [clara, escura] = coresDaListra(tema)
    expect(contraste(clara, escura)).toBeGreaterThanOrEqual(3)
  })

  // Não basta cada um ser visível: exposto e soberano precisam ser
  // distinguíveis **um do outro**, ou o selo deixa de dizer qual é qual.
  it('exposto e soberano continuam distinguíveis entre si', () => {
    expect(distanciaRgb(valor(tema, '--sb-public'), valor(tema, '--sb-sovereign'))).toBeGreaterThan(60)
  })
})
