import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

/**
 * O botão da interface inteira.
 *
 * `type="button"` por padrão porque o padrão do HTML é `submit`: um botão de
 * apoio dentro de um `<form>` — abrir o cadastro de backend, alternar o modo —
 * enviava o formulário ao ser clicado. O padrão certo é o que não faz nada
 * além do `onClick`.
 *
 * A forma mora em `index.css`, sob os tokens: hover e foco não cabem em
 * `style` inline, e cor literal em componente é o que o item 11 vai precisar
 * que não exista.
 */
export function Button({
  variant = 'secondary',
  size = 'sm',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      data-variant={variant}
      data-size={size}
      className={`sb-btn sb-btn--${variant} sb-btn--${size} ${className}`.trim()}
    />
  )
}
