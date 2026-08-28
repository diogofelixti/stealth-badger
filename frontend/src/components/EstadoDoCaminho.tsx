import type { Catalog, EstadoDoAcesso, FonteDoEstado, Lang } from '../lib/api'
import { render } from '../lib/i18n'

/**
 * O indicador de estado de um caminho externo, e a escolha de cor que ele faz.
 *
 * `up` é soberano. `down` é apagado, porque estar desligado não é defeito: é o
 * estado de quem não ligou aquele caminho. E **`unknown` é atenção** — não
 * saber merece mais destaque do que saber que não, porque é o único dos três
 * que pede alguma coisa de quem opera. Pintar `unknown` de vermelho mandaria a
 * pessoa consertar um túnel que talvez esteja perfeitamente de pé; pintá-lo de
 * apagado o esconderia junto com o que está simplesmente desligado.
 */
const COR: Record<EstadoDoAcesso, string> = {
  up: 'var(--sb-sovereign)',
  down: 'var(--sb-text-faint)',
  unknown: 'var(--sb-warning)',
}

const CHAVE: Record<EstadoDoAcesso, string> = {
  up: 'access.up',
  down: 'access.down',
  unknown: 'access.unknown',
}

/** Por onde o estado foi medido. A tela diz, em vez de só mostrar a cor. */
const FONTE: Record<FonteDoEstado, string> = {
  docker: 'access.by.docker',
  dns: 'access.by.dns',
  http: 'access.by.http',
  none: 'access.by.none',
}

export function EstadoDoCaminho({
  status,
  statusSource,
  catalog,
  lang,
  comFonte = true,
}: {
  status: EstadoDoAcesso
  statusSource: FonteDoEstado
  catalog: Catalog
  lang: Lang
  /** a lista de acessos mostra só o estado; a página do caminho diz como mediu */
  comFonte?: boolean
}) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: COR[status] }}
      />
      <span style={{ color: COR[status] }}>{render(catalog, CHAVE[status], {}, lang)}</span>
      {comFonte && (
        <span className="text-faint">
          {render(catalog, FONTE[statusSource], {}, lang)}
        </span>
      )}
    </span>
  )
}
