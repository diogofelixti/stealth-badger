import { useState } from 'react'
import type { Catalog, Lang, Wallet } from '../lib/api'
import { formatSats, shorten } from '../lib/format'
import { render } from '../lib/i18n'
import { PrivacyPanel } from './PrivacyPanel'
import { UtxoTable } from './UtxoTable'

/** Verde acima de 80, âmbar acima de 50, vermelho abaixo. */
function corDoScore(score: number): string {
  if (score >= 80) return 'var(--sb-sovereign)'
  if (score >= 50) return 'var(--sb-warning)'
  return 'var(--sb-critical)'
}

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function WalletCard({
  wallet,
  catalog,
  lang,
  onScan,
}: {
  wallet: Wallet
  catalog: Catalog
  lang: Lang
  onScan?: () => void
}) {
  const [moedasAbertas, setMoedasAbertas] = useState(false)

  // Só a primeira importação esconde o saldo. O backend deixou de remarcar
  // como `importing` quem já sincronizou, mas a condição continua checando
  // `syncHeight`: é ele que distingue "ainda não sei o saldo" de "estou
  // reconferindo um saldo que já conheço". Trocar um número conhecido por
  // travessões não é prudência, é deixar o painel parecer vazio.
  const importando =
    wallet.syncHeight === null &&
    (wallet.syncState === 'importing' || wallet.syncState === 'pending')

  return (
    <article
      data-wallet-kind={wallet.kind}
      className="rounded border border-line bg-surface px-[18px] py-4"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-base font-medium">{wallet.label}</h3>
        {/* Carteira se identifica pela fingerprint da chave; endereço avulso
            não tem chave, e o campo vazio pareceria defeito. */}
        <span className="text-xs text-faint">
          {wallet.kind === 'address' && wallet.address
            ? shorten(wallet.address)
            : wallet.fingerprint}
        </span>
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
            {wallet.kind === 'address'
              ? render(catalog, 'wallet.watchedAddress', {}, lang)
              : wallet.scriptType}{' '}
            · {wallet.network} ·{' '}
            {render(catalog, 'balance.utxos', { n: wallet.utxoCount }, lang)}
          </p>
        </>
      )}

      {/* O score de privacidade é a leitura do scanner sobre esta carteira.
          Enquanto não houver análise, a linha diz que não houve — inventar um
          número, ou mostrar zero, seria pior que admitir a ausência. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-[10px]">
        {wallet.privacyScore === null ? (
          <span className="text-xs text-faint">
            {render(catalog, 'privacy.never', {}, lang)}
          </span>
        ) : (
          <span
            className="text-xs uppercase tracking-label"
            style={{ color: corDoScore(wallet.privacyScore) }}
          >
            {render(
              catalog,
              'privacy.score',
              { score: wallet.privacyScore, grade: wallet.privacyGrade ?? '?' },
              lang,
            )}
          </span>
        )}

        {onScan &&
          (wallet.privacyScanning ? (
            <span className="text-xs text-faint">
              {render(catalog, 'privacy.scanning', {}, lang)}
            </span>
          ) : (
            <button
              type="button"
              onClick={onScan}
              className="text-xs uppercase tracking-label"
              style={{ color: 'var(--sb-accent)' }}
            >
              {render(catalog, 'privacy.scan', {}, lang)}
            </button>
          ))}
      </div>

      {wallet.privacyScore !== null && (
        <PrivacyPanel walletId={wallet.id} catalog={catalog} lang={lang} />
      )}

      {/* Fechado por padrão: uma carteira com trinta UTXOs empurraria o resto
          do painel para fora da tela antes de alguém pedir para ver. */}
      <div className="mt-[10px]">
        <button
          type="button"
          onClick={() => setMoedasAbertas(v => !v)}
          aria-expanded={moedasAbertas}
          className="text-xs uppercase tracking-label text-faint hover:text-ink"
        >
          {render(catalog, 'utxos.toggle', {}, lang)}
        </button>
        {moedasAbertas && (
          <UtxoTable walletId={wallet.id} catalog={catalog} lang={lang} />
        )}
      </div>

      {/* Por onde *esta* carteira é vigiada. O selo do topo fala da sessão
          inteira e não distingue uma carteira da outra; aqui é onde o
          contraste entre exposta e soberana fica visível lado a lado. */}
      <p
        data-wallet-posture={wallet.backendIsPublic ? 'public' : 'sovereign'}
        className="mt-[10px] flex items-center gap-[6px] text-xs text-faint"
      >
        <span
          aria-hidden="true"
          className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
          style={{
            background: wallet.backendIsPublic
              ? 'var(--sb-public)'
              : 'var(--sb-sovereign)',
          }}
        />
        {host(wallet.backendUrl)}
      </p>

      {wallet.syncState === 'error' && (
        <p className="mt-3 text-xs uppercase tracking-label" style={{ color: 'var(--sb-critical)' }}>
          {render(catalog, 'wallet.syncError', {}, lang)}
        </p>
      )}
    </article>
  )
}
