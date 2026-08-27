import { useState } from 'react'
import type { Backend, Catalog, Lang, Wallet } from '../lib/api'
import { formatSats, shorten } from '../lib/format'
import { render } from '../lib/i18n'
import { PrivacyPanel } from './PrivacyPanel'
import { UtxoTable } from './UtxoTable'
import { Button } from './ui/Button'

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
  onArchive,
  onUnarchive,
  onDelete,
  backends,
  onChangeBackend,
}: {
  wallet: Wallet
  catalog: Catalog
  lang: Lang
  onScan?: () => void
  onArchive?: () => void
  onUnarchive?: () => void
  onDelete?: () => void
  /** as fontes que esta carteira pode usar; já filtradas pela rede dela */
  backends?: Backend[]
  onChangeBackend?: (backendId: number) => void
}) {
  const [moedasAbertas, setMoedasAbertas] = useState(false)
  const [trocandoFonte, setTrocandoFonte] = useState(false)

  // Só a primeira importação esconde o saldo. O backend deixou de remarcar
  // como `importing` quem já sincronizou, mas a condição continua checando
  // `syncHeight`: é ele que distingue "ainda não sei o saldo" de "estou
  // reconferindo um saldo que já conheço". Trocar um número conhecido por
  // travessões não é prudência, é deixar o painel parecer vazio.
  const importando =
    wallet.syncHeight === null &&
    (wallet.syncState === 'importing' || wallet.syncState === 'pending')

  // Zero que não foi lido não é zero, é "não sei". Uma carteira degradada sem
  // nenhum UTXO legível não tem saldo conhecido — e mostrar 0 ao lado do aviso
  // de "vigiando em parte" convida a ler o número como fato. Com saldo
  // parcial, o número é verdade: é o que existe no que deu para ler.
  const saldoDesconhecido =
    wallet.syncState === 'degraded' && wallet.utxoCount === 0

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
          <div
            data-progress={wallet.syncProgress}
            className="mb-[9px] h-[3px] overflow-hidden rounded-sm bg-raised"
          >
            <div
              className="h-full"
              style={{ width: `${wallet.syncProgress}%`, background: 'var(--sb-warning)' }}
            />
          </div>
          <p className="font-prose text-sm leading-relaxed text-muted">
            {render(catalog, 'wallet.importingNote', {}, lang)}
          </p>
        </>
      ) : saldoDesconhecido ? (
        <>
          {/* Nada foi lido: o saldo não é zero, é desconhecido. E não está a
              caminho — a recusa do backend é permanente, então prometer
              progresso seria mentir sobre o futuro além do presente. */}
          <p className="mb-1 text-xl font-medium text-faint">———</p>
          <p className="text-xs uppercase tracking-label text-faint">
            {wallet.kind === 'address'
              ? render(catalog, 'wallet.watchedAddress', {}, lang)
              : wallet.scriptType}{' '}
            · {wallet.network}
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
            <Button onClick={onScan}>{render(catalog, 'privacy.scan', {}, lang)}</Button>
          ))}
      </div>

      {wallet.privacyScore !== null && (
        <PrivacyPanel walletId={wallet.id} catalog={catalog} lang={lang} />
      )}

      {/* Fechado por padrão: uma carteira com trinta UTXOs empurraria o resto
          do painel para fora da tela antes de alguém pedir para ver. */}
      <div className="mt-[10px]">
        <Button
          variant="ghost"
          onClick={() => setMoedasAbertas(v => !v)}
          aria-expanded={moedasAbertas}
        >
          {render(catalog, 'utxos.toggle', {}, lang)}
        </Button>
        {moedasAbertas && (
          <UtxoTable walletId={wallet.id} catalog={catalog} lang={lang} />
        )}
      </div>

      {/* Arquivar é a ação de todo dia: tira da tela e do worker, e volta
          atrás. Apagar só aparece depois de arquivada, e é a única ação em
          vermelho da carteira. */}
      {(onArchive || onUnarchive) && (
        <div className="mt-[10px] flex flex-wrap gap-2">
          {wallet.archivedAt ? (
            <>
              {onUnarchive && (
                <Button variant="ghost" onClick={onUnarchive}>
                  {render(catalog, 'wallets.unarchive', {}, lang)}
                </Button>
              )}
              {onDelete && (
                <Button variant="danger" onClick={onDelete}>
                  {render(catalog, 'wallets.delete', {}, lang)}
                </Button>
              )}
            </>
          ) : (
            onArchive && (
              <Button variant="ghost" onClick={onArchive}>
                {render(catalog, 'wallets.archive', {}, lang)}
              </Button>
            )
          )}
        </div>
      )}

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

      {/* Trocar a fonte é trocar quem vê os endereços desta carteira — e pode
          trocar de modelo de sincronização junto. O log não é tocado, e a
          frase abaixo diz isso antes da troca, não depois. */}
      {onChangeBackend && backends && backends.length > 1 && (
        <div className="mt-2">
          {trocandoFonte ? (
            <>
              <label htmlFor={`fonte-da-carteira-${wallet.id}`} className="mb-1 block text-xs uppercase tracking-label text-faint">
                {render(catalog, 'wallets.changeSource', {}, lang)}
              </label>
              <select
                id={`fonte-da-carteira-${wallet.id}`}
                value={backends.find(b => host(b.url) === host(wallet.backendUrl))?.id ?? ''}
                onChange={e => onChangeBackend(Number(e.target.value))}
                className="w-full rounded border border-line bg-bg px-3 py-2 text-sm"
              >
                {backends.map(b => (
                  <option key={b.id} value={b.id}>
                    {/* o apelido, quando existe, é como a pessoa chama a fonte;
                        duas linhas com o mesmo host são indistinguíveis sem ele */}
                    {b.label ? `${b.label} · ${host(b.url)}` : host(b.url)} · {b.isPublic
                      ? render(catalog, 'privacy.public', {}, lang)
                      : render(catalog, 'privacy.sovereign', {}, lang)}
                  </option>
                ))}
              </select>
              <p className="mt-1 font-prose text-sm leading-relaxed text-faint">
                {render(catalog, 'wallets.changeSourceNote', {}, lang)}
              </p>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setTrocandoFonte(true)}>
              {render(catalog, 'wallets.changeSource', {}, lang)}
            </Button>
          )}
        </div>
      )}

      {/* Degradada não é quebrada: o watchtower vigia, só não tudo. Pintar de
          vermelho assustaria sem motivo; não mostrar nada esconderia o ponto
          cego, que é pior. */}
      {wallet.syncState === 'degraded' && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-label" style={{ color: 'var(--sb-warning)' }}>
            {render(catalog, 'wallet.syncDegraded', {}, lang)}
          </p>
          {wallet.syncError && (
            <p className="font-prose text-sm leading-relaxed text-muted">
              {wallet.syncError}
            </p>
          )}
        </div>
      )}

      {wallet.syncState === 'error' && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-label" style={{ color: 'var(--sb-critical)' }}>
            {render(catalog, 'wallet.syncError', {}, lang)}
          </p>
          {wallet.syncError && (
            <p className="font-prose text-sm leading-relaxed text-muted">
              {wallet.syncError}
            </p>
          )}
        </div>
      )}
    </article>
  )
}
