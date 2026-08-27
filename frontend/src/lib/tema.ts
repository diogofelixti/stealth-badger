export const TEMAS = ['sett', 'bone', 'carvao', 'contraste'] as const
export type Tema = (typeof TEMAS)[number]

const CHAVE = 'sb_theme'

export function ehTema(v: string): v is Tema {
  return (TEMAS as readonly string[]).includes(v)
}

/**
 * O tema guardado neste navegador.
 *
 * É **cache**, não a fonte da verdade: quem manda é `user_preferences`, para
 * que o tema siga a pessoa entre navegadores. O `localStorage` existe para o
 * carregamento não piscar no tema errado antes da resposta do servidor.
 */
export function temaSalvo(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE)
    return salvo && ehTema(salvo) ? salvo : 'sett'
  } catch {
    return 'sett'
  }
}

export function aplicarTema(tema: Tema): void {
  if (!ehTema(tema)) return
  // `sett` mora no `:root` sem atributo: carimbá-lo deixaria marca no HTML
  // sem necessidade nenhuma.
  if (tema === 'sett') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', tema)
  try {
    localStorage.setItem(CHAVE, tema)
  } catch {
    // navegador sem armazenamento: o tema vale só para esta aba
  }
}
