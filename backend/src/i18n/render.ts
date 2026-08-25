import { CATALOG, type Lang } from './catalog'

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US' }

export function render(
  key: string,
  params: Record<string, unknown>,
  lang: Lang,
): string {
  const template = CATALOG[lang][key]
  if (template === undefined) return key

  return template.replace(/\{(\w+)\}/g, (marker, name: string) => {
    const value = params[name]
    if (value === undefined || value === null) return marker
    if (typeof value === 'string' && value.startsWith('@')) {
      return render(value.slice(1), {}, lang)
    }
    if (typeof value === 'number') return value.toLocaleString(LOCALE[lang])
    return String(value)
  })
}

export function renderAlert(
  type: string,
  params: Record<string, unknown>,
  lang: Lang,
): { title: string; body: string } {
  return {
    title: render('alert.' + type + '.title', params, lang),
    body: render('alert.' + type + '.body', params, lang),
  }
}
