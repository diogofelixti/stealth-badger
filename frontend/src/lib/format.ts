import type { Lang } from './api'

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US' }

/** Sats sempre em grupo de milhar: valor de Bitcoin se confere de relance. */
export function formatSats(n: number, lang: Lang = 'pt'): string {
  return `${n.toLocaleString(LOCALE[lang])} ${n === 1 ? 'sat' : 'sats'}`
}

/** Encurta pelo meio: as pontas são o que se compara entre dois identificadores. */
export function shorten(id: string, head = 8, tail = 6): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`
}

export function formatDateTime(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(LOCALE[lang])
}
