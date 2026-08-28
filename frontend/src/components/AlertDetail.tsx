import { useEffect, useState } from 'react'
import {
  api,
  mensagemDoErro,
  type AlertDetail as Detalhe,
  type Catalog,
  type Lang,
  type TxDetail,
  type TxPrivacyReport,
} from '../lib/api'
import { formatSats } from '../lib/format'
import { render, renderAlert } from '../lib/i18n'
import { RecommendationView } from './PrivacyPanel'
import { Button } from './ui/Button'
import { Identificador } from './ui/Identificador'

const linha = 'flex flex-wrap items-baseline gap-2 text-sm'
const rotulo = 'text-xs uppercase tracking-label text-faint'

function matrizBoltzmann(boltzmann: Record<string, unknown> | null | undefined): number[][] | null {
  const direta = boltzmann?.matrix
  const aninhada = typeof direta === 'object' && direta !== null && !Array.isArray(direta)
    ? (direta as Record<string, unknown>).probabilities
    : null
  const candidata = Array.isArray(direta)
    ? direta
    : Array.isArray(boltzmann?.probabilities)
      ? boltzmann.probabilities
      : aninhada
  if (!Array.isArray(candidata)) return null
  const matriz = candidata
    .filter(linha => Array.isArray(linha))
    .map(linha => linha.filter(v => typeof v === 'number' && Number.isFinite(v)) as number[])
    .filter(linha => linha.length > 0)
  return matriz.length > 0 ? matriz : null
}

/**
 * O detalhe de um alerta.
 *
 * Tudo o que ele mostra de saída **já está no banco**: o alerta, o evento que
 * o causou, a carteira e as confirmações. Nenhuma consulta sai daqui sozinha.
 *
 * Buscar a transação na cadeia é um clique separado, e a frase acima do botão
 * diz para onde a consulta vai antes de ir. Fazer isso ao abrir o feed
 * multiplicaria a exposição que o produto inteiro existe para denunciar.
 */
export function AlertDetail({
  alertId,
  fonte,
  catalog,
  lang,
  onClose,
}: {
  alertId: number
  /** host da fonte desta carteira, para o aviso dizer o nome de quem vai saber */
  fonte: string
  catalog: Catalog
  lang: Lang
  onClose: () => void
}) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [tx, setTx] = useState<TxDetail | null>(null)
  const [txPrivacy, setTxPrivacy] = useState<TxPrivacyReport | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void api
      .alertDetail(alertId)
      .then(setDetalhe)
      .catch(err => setErro(mensagemDoErro(catalog, err, lang)))
  }, [alertId, catalog, lang])

  async function buscarNaCadeia(): Promise<void> {
    if (!detalhe?.event?.txid) return
    setBuscando(true)
    setErro(null)
    try {
      const walletId = detalhe.wallet.id
      const txid = detalhe.event.txid
      setTx(await api.transaction(txid, walletId))
      await api.scanTxPrivacy(walletId, txid)
      setTxPrivacy(await api.txPrivacy(walletId, txid))
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    } finally {
      setBuscando(false)
    }
  }

  const alerta = detalhe ? renderAlert(catalog, detalhe.alert.type, detalhe.alert.params, lang) : null
  const matriz = matrizBoltzmann(txPrivacy?.latest?.boltzmann)

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-10"
      style={{ background: 'rgb(0 0 0 / 0.6)' }}
    >
      <div className="w-full max-w-2xl rounded border border-line bg-surface px-5 py-5">
        {alerta && (
          <>
            <h3 className="mb-1 text-lg">{alerta.title}</h3>
            <p className="mb-4 font-prose text-sm leading-relaxed text-muted">{alerta.body}</p>
          </>
        )}

        {detalhe && !detalhe.event && (
          <p className="mb-4 font-prose text-sm leading-relaxed text-faint">
            {render(catalog, 'alert.noEvent', {}, lang)}
          </p>
        )}

        {detalhe?.event && (
          <div className="mb-4 flex flex-col gap-2">
            <div>
              <span className={rotulo}>{render(catalog, 'alert.txid', {}, lang)}</span>
              {/* Identificador de cadeia é feito para ser colado num explorador
                  ou numa carteira, nunca digitado. Selecionar 64 caracteres
                  monoespaçados à mão arrisca levar um a menos, e aí a pessoa vai
                  procurar defeito no explorador. */}
              <p>
                {detalhe.event.txid && (
                  <Identificador valor={detalhe.event.txid} catalog={catalog} lang={lang} />
                )}
              </p>
            </div>
            <p className={linha}>
              <span className={rotulo}>{render(catalog, 'alert.height', {}, lang)}</span>
              {detalhe.event.height === null ? (
                <span>—</span>
              ) : (
                <Identificador
                  valor={String(detalhe.event.height)}
                  catalog={catalog}
                  lang={lang}
                />
              )}
              <span className="text-faint">
                {detalhe.confirmations && detalhe.confirmations > 0
                  ? render(catalog, 'alert.confirmations', { n: detalhe.confirmations }, lang)
                  : render(catalog, 'alert.inMempool', {}, lang)}
              </span>
            </p>
            {detalhe.event.blockHash && (
              <p className={linha}>
                <span className={rotulo}>{render(catalog, 'alert.blockHash', {}, lang)}</span>
                <Identificador
                  valor={detalhe.event.blockHash}
                  catalog={catalog}
                  lang={lang}
                />
              </p>
            )}
            <p className={linha}>
              <span className={rotulo}>{render(catalog, 'alert.wallet', {}, lang)}</span>
              <span>{detalhe.wallet.label}</span>
            </p>
          </div>
        )}

        {detalhe && detalhe.siblings.length > 0 && (
          <div className="mb-4">
            <span className={rotulo}>{render(catalog, 'alert.siblings', {}, lang)}</span>
            <ul className="mt-1 flex flex-col gap-1">
              {detalhe.siblings.map(s => (
                <li key={s.id} className="text-sm text-muted">
                  {renderAlert(catalog, s.type, s.params, lang).title}
                </li>
              ))}
            </ul>
          </div>
        )}

        {detalhe?.event?.txid && !tx && (
          <>
            <p className="mb-2 font-prose text-sm leading-relaxed" style={{ color: 'var(--sb-warning)' }}>
              {render(catalog, 'alert.fetchNote', { fonte }, lang)}
            </p>
            <Button variant="secondary" disabled={buscando} onClick={() => void buscarNaCadeia()}>
              {render(catalog, 'alert.fetchOnChain', {}, lang)}
            </Button>
          </>
        )}

        {tx && (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <span className={rotulo}>{render(catalog, 'alert.inputs', {}, lang)}</span>
              <ul className="text-sm">
                {tx.vin.map((i, n) => (
                  <li key={n} className="break-all text-muted">
                    {i.address ?? i.txid.slice(0, 12) + '…'}{' '}
                    {i.value !== undefined && <span>{formatSats(i.value, lang)}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-1">
              <span className={rotulo}>{render(catalog, 'alert.outputs', {}, lang)}</span>
              <ul className="text-sm">
                {tx.vout.map(o => (
                  <li key={o.n} className="break-all">
                    {o.address ?? '—'}{' '}
                    <span className="text-muted">{formatSats(o.value, lang)}</span>
                  </li>
                ))}
              </ul>
              {tx.fee !== undefined && (
                <p className="mt-1 text-sm text-faint">
                  {render(catalog, 'alert.fee', { value: formatSats(tx.fee, lang) }, lang)}
                </p>
              )}
            </div>
          </div>
        )}

        {txPrivacy?.running && !txPrivacy.latest && (
          <p className="mb-3 text-sm text-faint">
            {render(catalog, 'alert.txPrivacyRunning', {}, lang)}
          </p>
        )}

        {txPrivacy?.latest && (
          <section className="mb-3 border-t border-line pt-3">
            <div className="mb-3 flex flex-wrap items-baseline gap-2">
              <span className={rotulo}>{render(catalog, 'alert.txPrivacy', {}, lang)}</span>
              {txPrivacy.latest.score !== null && txPrivacy.latest.grade && (
                <span className="text-sm">
                  {txPrivacy.latest.score}/100 · {txPrivacy.latest.grade}
                </span>
              )}
              {txPrivacy.latest.txType && (
                <span className="text-xs text-faint">
                  {render(catalog, 'alert.txType', {}, lang)}: {txPrivacy.latest.txType}
                </span>
              )}
            </div>

            {matriz && (
              <div className="mb-3">
                <span className={rotulo}>{render(catalog, 'alert.boltzmann', {}, lang)}</span>
                <div className="mt-2 overflow-x-auto">
                  <div
                    className="inline-grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${matriz[0]?.length ?? 1}, minmax(1.75rem, 1fr))` }}
                  >
                    {matriz.flatMap((linha, y) =>
                      linha.map((valor, x) => (
                        <span
                          key={y + ':' + x}
                          className="flex h-7 min-w-7 items-center justify-center text-xs text-ink"
                          style={{
                            background: `color-mix(in srgb, var(--sb-critical) ${Math.round(valor * 100)}%, var(--sb-surface-raised))`,
                          }}
                          title={`in ${y + 1} -> out ${x + 1}`}
                        >
                          {Math.round(valor * 100)}
                        </span>
                      )),
                    )}
                  </div>
                </div>
              </div>
            )}

            {txPrivacy.latest.findings.length > 0 && (
              <ul className="flex flex-col gap-2">
                {txPrivacy.latest.findings.map(f => (
                  <li key={f.id} className="border-l-2 border-line pl-[10px]">
                    <p className="text-xs font-medium">{f.title}</p>
                    <p className="font-prose text-sm leading-relaxed text-muted">{f.description}</p>
                    <RecommendationView recommendation={f.recommendation} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {erro && (
          <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--sb-critical)' }}>
            {erro}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={onClose}>{render(catalog, 'alert.close', {}, lang)}</Button>
        </div>
      </div>
    </div>
  )
}
