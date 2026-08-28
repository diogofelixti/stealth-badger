import type { Catalog, Lang } from '../../lib/api'
import { Copiar } from './Copiar'

/**
 * Um identificador da cadeia, à vista e copiável.
 *
 * Endereço, txid, hash de bloco e altura são valores que ninguém digita: eles
 * são colados num explorador, numa carteira ou numa mensagem. Estavam todos
 * como texto puro, e copiar exigia selecionar caractere a caractere numa fonte
 * monoespaçada — com o risco silencioso de levar um caractere a menos e ir
 * procurar defeito no explorador.
 *
 * **O que se mostra e o que se copia são coisas diferentes.** Um txid de 64
 * caracteres estoura qualquer linha, então a tela mostra as pontas; o botão
 * copia o valor inteiro. Encurtar o que vai para a área de transferência seria
 * o defeito que este componente existe para evitar.
 */
export function Identificador({
  valor,
  catalog,
  lang,
  encurtar = false,
  className = '',
}: {
  valor: string
  catalog: Catalog
  lang: Lang
  /** mostra as pontas em vez do valor inteiro; o botão copia tudo */
  encurtar?: boolean
  className?: string
}) {
  const visivel =
    encurtar && valor.length > 20
      ? valor.slice(0, 10) + '…' + valor.slice(-8)
      : valor

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-1 ${className}`.trim()}>
      <span className="min-w-0 break-all font-mono text-sm" title={valor}>
        {visivel}
      </span>
      <Copiar texto={valor} catalog={catalog} lang={lang} />
    </span>
  )
}
