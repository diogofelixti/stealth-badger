import { createElement } from 'react'
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

interface Comum {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children?: ReactNode
}

type ComoBotao = Comum & { as?: 'button' } & ButtonHTMLAttributes<HTMLButtonElement>
type ComoLink = Comum & { as: 'a' } & AnchorHTMLAttributes<HTMLAnchorElement>
type ComoRotulo = Comum & { as: 'label' } & LabelHTMLAttributes<HTMLLabelElement>

/**
 * O botão da interface inteira.
 *
 * `type="button"` por padrão porque o padrão do HTML é `submit`: um botão de
 * apoio dentro de um `<form>` — abrir o cadastro de backend, alternar o modo —
 * enviava o formulário ao ser clicado.
 *
 * `as` existe porque nem toda ação é um `<button>`: baixar um arquivo é um
 * `<a href download>`, e escolher um arquivo é um `<label>` com um `input file`
 * escondido dentro. Os dois **agem**, e por isso precisam da mesma forma —
 * ficaram de fora da varredura de 27/08 justamente por não serem `<button>`,
 * e continuaram texto com cor de link.
 *
 * A forma mora em `index.css`, sob os tokens: hover e foco não cabem em
 * `style` inline, e cor literal em componente é o que o item 11 precisa que
 * não exista.
 */
export function Button(props: ComoBotao | ComoLink | ComoRotulo) {
  const { variant = 'secondary', size = 'sm', className = '', as = 'button', ...resto } =
    props as Comum & { as?: 'button' | 'a' | 'label' } & Record<string, unknown>

  const comuns = {
    ...resto,
    'data-variant': variant,
    'data-size': size,
    className: `sb-btn sb-btn--${variant} sb-btn--${size} ${className}`.trim(),
  }

  // `type` só existe em botão: num link ou num label ele seria um atributo
  // inválido, e o React o entregaria ao DOM assim mesmo.
  if (as === 'button') {
    return createElement('button', { type: 'button', ...comuns })
  }
  return createElement(as, comuns)
}
