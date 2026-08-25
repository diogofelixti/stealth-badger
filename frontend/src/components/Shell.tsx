import type { ReactNode } from 'react'

/** De onde os dados de cadeia vêm — e, portanto, quem vê o que você consulta. */
export interface BackendPosture {
  isPublic: boolean
  host: string
}

/**
 * A listra aposemática.
 *
 * Enquanto o usuário consulta um explorador público, a interface inteira veste
 * a coloração de advertência do texugo na aresta superior da página. Não é um
 * toast que some nem um selo no canto: some junto com a exposição, e não com o
 * tempo. Em modo soberano vira uma linha discreta; sem carteira cadastrada,
 * ainda não há postura a declarar e a linha é neutra.
 */
function PrivacyStripe({ backend }: { backend: BackendPosture | null }) {
  if (backend?.isPublic) {
    return (
      <div
        aria-hidden="true"
        className="h-[5px] shrink-0 bg-stripe-warning"
        data-posture="public"
      />
    )
  }
  return (
    <div
      aria-hidden="true"
      className="h-px shrink-0"
      data-posture={backend ? 'sovereign' : 'unknown'}
      style={{ background: backend ? 'var(--sb-sovereign)' : 'var(--sb-border)' }}
    />
  )
}

/**
 * O aviso em palavras, ao lado da listra em cor: quem não distingue o âmbar
 * ainda lê "explorador público" no cabeçalho, sempre.
 */
export function PrivacyBadge({ isPublic, host }: BackendPosture) {
  const cor = isPublic ? 'var(--sb-public)' : 'var(--sb-sovereign)'
  return (
    <div
      role="status"
      data-posture={isPublic ? 'public' : 'sovereign'}
      className="flex items-center gap-[10px] rounded border px-3 py-[7px]"
      style={{ borderColor: cor }}
    >
      <span
        className="text-xs font-semibold uppercase tracking-label"
        style={{ color: cor }}
      >
        {isPublic ? 'Explorador público' : 'Infraestrutura própria'}
      </span>
      <span className="text-xs text-muted">
        {isPublic
          ? `${host} enxerga o que você consulta`
          : `consultando ${host}`}
      </span>
    </div>
  )
}

/**
 * A casca: listra, cabeçalho e corpo. Tudo que é persistente na aplicação
 * mora aqui, para que nenhuma tela consiga esquecer de mostrar a postura de
 * privacidade — a listra e o selo saem da mesma fonte.
 */
export function Shell({
  children,
  backend = null,
  actions,
}: {
  children: ReactNode
  backend?: BackendPosture | null
  actions?: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg font-ui text-ink">
      <PrivacyStripe backend={backend} />

      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-4 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" width={28} height={28} className="block" />
          <span className="text-base font-semibold uppercase tracking-label">
            Stealth Badger
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:gap-5">
          {backend && <PrivacyBadge {...backend} />}
          {actions}
        </div>
      </header>

      <main className="min-h-0 flex-grow">{children}</main>
    </div>
  )
}
