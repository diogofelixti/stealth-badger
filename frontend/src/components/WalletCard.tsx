import type { Catalog, Lang, Wallet } from '../lib/api'
import { formatSats } from '../lib/format'
import { render } from '../lib/i18n'

export function WalletCard({
  wallet,
  catalog,
  lang,
}: {
  wallet: Wallet
  catalog: Catalog
  lang: Lang
}) {
  const importando = wallet.syncState === 'importing' || wallet.syncState === 'pending'

  return (
    <article className="rounded border border-line bg-surface px-[18px] py-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-medium">{wallet.label}</h3>
        <span className="text-xs text-faint">{wallet.fingerprint}</span>
      </div>

      {importando ? (
        <>
          {/* O saldo parcial não aparece: número incompleto exibido como final
              é mentira com aparência de dado. */}
          <div className="mb-[10px] flex items-baseline gap-[10px]">
            <span className="text-xl font-medium text-faint">———</span>
            <span className="text-xs uppercase tracking-label" style={{ color: 'var(--sb-warning)' }}>
              {render(catalog, 'wallet.importing', { progress: wallet.syncProgress }, lang)}
            </span>
          </div>
          <div className="mb-[9px] h-[3px] overflow-hidden rounded-sm bg-raised">
            <div
              className="h-full"
              style={{ width: `${wallet.syncProgress}%`, background: 'var(--sb-warning)' }}
            />
          </div>
          <p className="font-prose text-xs leading-relaxed text-muted">
            {render(catalog, 'wallet.importingNote', {}, lang)}
          </p>
        </>
      ) : (
        <>
          <p className="mb-1 text-xl font-medium tracking-tight">
            {formatSats(Number(wallet.balanceSats), lang)}
          </p>
          <p className="text-xs uppercase tracking-label text-faint">
            {wallet.scriptType} · {wallet.network} ·{' '}
            {render(catalog, 'balance.utxos', { n: wallet.utxoCount }, lang)}
          </p>
        </>
      )}

      {wallet.syncState === 'error' && (
        <p className="mt-3 text-xs uppercase tracking-label" style={{ color: 'var(--sb-critical)' }}>
          {render(catalog, 'wallet.syncError', {}, lang)}
        </p>
      )}
    </article>
  )
}
