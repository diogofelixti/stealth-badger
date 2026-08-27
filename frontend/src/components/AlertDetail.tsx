import { useEffect, useState } from 'react'
import {
  api,
  mensagemDoErro,
  type AlertDetail as Detalhe,
  type Catalog,
  type Lang,
  type TxDetail,
} from '../lib/api'
import { formatSats } from '../lib/format'
import { render, renderAlert } from '../lib/i18n'
import { Button } from './ui/Button'

const linha = 'flex flex-wrap items-baseline gap-2 text-sm'
const rotulo = 'text-xs uppercase tracking-label text-faint'

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
      setTx(await api.transaction(detalhe.event.txid, detalhe.wallet.id))
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    } finally {
      setBuscando(false)
    }
  }

  const alerta = detalhe ? renderAlert(catalog, detalhe.alert.type, detalhe.alert.params, lang) : null

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
              <p className="break-all font-mono text-sm">{detalhe.event.txid}</p>
            </div>
            <p className={linha}>
              <span className={rotulo}>{render(catalog, 'alert.height', {}, lang)}</span>
              <span>{detalhe.event.height ?? '—'}</span>
              <span className="text-faint">
                {detalhe.confirmations && detalhe.confirmations > 0
                  ? render(catalog, 'alert.confirmations', { n: detalhe.confirmations }, lang)
                  : render(catalog, 'alert.inMempool', {}, lang)}
              </span>
            </p>
            {detalhe.event.blockHash && (
              <p className={linha}>
                <span className={rotulo}>{render(catalog, 'alert.blockHash', {}, lang)}</span>
                <span className="break-all font-mono text-sm">{detalhe.event.blockHash}</span>
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
          <div className="mb-2 flex flex-col gap-3 sm:flex-row">
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
