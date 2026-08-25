import type { Catalog, Lang } from './api'

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US' }

/**
 * As frases têm fonte única no backend; o que se repete aqui são as três
 * regras de interpolação, quinze linhas. Duplicar lógica curta é aceitável,
 * duplicar texto é o que geraria divergência entre a tela e o push.
 *
 * `{nome}` vira params.nome; número é formatado no locale; valor começando com
 * `@` é chave do próprio catálogo, resolvida recursivamente.
 */
export function render(
  catalog: Catalog,
  key: string,
  params: Record<string, unknown>,
  lang: Lang,
): string {
  const template = catalog[key]
  if (template === undefined) return key

  return template.replace(/\{(\w+)\}/g, (marcador, nome: string) => {
    const value = params[nome]
    if (value === undefined || value === null) return marcador
    if (typeof value === 'string' && value.startsWith('@')) {
      return render(catalog, value.slice(1), {}, lang)
    }
    if (typeof value === 'number') return value.toLocaleString(LOCALE[lang])
    return String(value)
  })
}

export function renderAlert(
  catalog: Catalog,
  type: string,
  params: Record<string, unknown>,
  lang: Lang,
): { title: string; body: string } {
  return {
    title: render(catalog, `alert.${type}.title`, params, lang),
    body: render(catalog, `alert.${type}.body`, params, lang),
  }
}
