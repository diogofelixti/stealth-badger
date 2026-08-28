import { useEffect, useRef, useState } from 'react'
import type { Catalog, Lang } from '../../lib/api'
import { render } from '../../lib/i18n'
import { Button } from './Button'

type Estado = 'parado' | 'copiado' | 'falhou'

/**
 * Copiar um endereço ou um comando, com dois caminhos e nenhum silêncio.
 *
 * `navigator.clipboard` só existe em **contexto seguro**. O painel alcançado
 * pelo IP da Tailscale é `http://100.x`, que não é — então justamente no
 * caminho em que a pessoa está passando o endereço para o celular, a API
 * moderna não está lá. Daí o `execCommand`, que é legado e continua sendo o
 * único que funciona ali.
 *
 * E quando os dois falham, a etiqueta diz. Copiar em silêncio faria a pessoa
 * colar o endereço antigo achando que colou o novo, e ela iria procurar defeito
 * no túnel — que é o lugar errado.
 */
export function Copiar({
  texto,
  catalog,
  lang,
  rotulo,
}: {
  texto: string
  catalog: Catalog
  lang: Lang
  /** chave do catálogo para o rótulo parado; o padrão é `access.copy` */
  rotulo?: string
}) {
  const [estado, setEstado] = useState<Estado>('parado')
  const prazo = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => void (prazo.current && clearTimeout(prazo.current)), [])

  function marcar(novo: Estado): void {
    setEstado(novo)
    if (prazo.current) clearTimeout(prazo.current)
    prazo.current = setTimeout(() => setEstado('parado'), 2_500)
  }

  /** O caminho de reserva: seleção invisível e o `copy` do documento. */
  function copiarSemApi(): boolean {
    try {
      const area = document.createElement('textarea')
      area.value = texto
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const deu = document.execCommand('copy')
      document.body.removeChild(area)
      return deu
    } catch {
      return false
    }
  }

  async function copiar(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto)
        marcar('copiado')
        return
      }
    } catch {
      // Contexto seguro pode existir e a permissão ainda ser negada. Cai para
      // o caminho de reserva em vez de desistir.
    }
    marcar(copiarSemApi() ? 'copiado' : 'falhou')
  }

  const chave =
    estado === 'copiado'
      ? 'access.copied'
      : estado === 'falhou'
        ? 'access.copyFailed'
        : (rotulo ?? 'access.copy')

  return (
    <Button
      variant="ghost"
      onClick={() => void copiar()}
      aria-live="polite"
      style={estado === 'falhou' ? { color: 'var(--sb-warning)' } : undefined}
    >
      {render(catalog, chave, {}, lang)}
    </Button>
  )
}
