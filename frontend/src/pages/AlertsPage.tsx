import { useCallback, useEffect, useState } from 'react'
import { api, type Alert } from '../lib/api'
import { AlertFeed } from '../components/AlertFeed'
import { AlertDetail } from '../components/AlertDetail'
import { render } from '../lib/i18n'
import { useDadosDoPainel } from './Layout'

const TIPOS = [
  'funds_received',
  'funds_spent',
  'address_reused',
  'dust_received',
  'kyc_origin',
  'score_dropped',
  'reorg_detected',
] as const

const SEVERIDADES = ['info', 'warning', 'critical'] as const

const campo = 'rounded border border-line bg-bg px-3 py-2 text-sm'

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * O histórico inteiro, com os filtros que a API já sabia responder desde a
 * paginação por cursor — e que no painel não tinham onde caber.
 */
export function AlertsPage() {
  const { catalog, lang, wallets } = useDadosDoPainel()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [tipo, setTipo] = useState('')
  const [severidade, setSeveridade] = useState('')
  const [carteira, setCarteira] = useState('')
  const [aberto, setAberto] = useState<Alert | null>(null)

  const filtro = useCallback(
    () => ({
      ...(tipo ? { type: tipo } : {}),
      ...(severidade ? { severity: severidade } : {}),
      ...(carteira ? { walletId: Number(carteira) } : {}),
    }),
    [tipo, severidade, carteira],
  )

  useEffect(() => {
    void api.alerts(filtro()).then(pagina => {
      setAlerts(pagina.items)
      setCursor(pagina.nextCursor)
    })
  }, [filtro])

  return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-8">
      <h2 className="text-xs font-semibold uppercase tracking-label text-faint">
        {render(catalog, 'feed.title', {}, lang)}
      </h2>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label={render(catalog, 'alerts.filterType', {}, lang)}
          value={tipo}
          onChange={e => setTipo(e.target.value)}
          className={campo}
        >
          <option value="">{render(catalog, 'alerts.filterType', {}, lang)}</option>
          {TIPOS.map(t => (
            <option key={t} value={t}>
              {render(catalog, `alert.${t}.title`, {}, lang)}
            </option>
          ))}
        </select>

        <select
          aria-label={render(catalog, 'alerts.filterSeverity', {}, lang)}
          value={severidade}
          onChange={e => setSeveridade(e.target.value)}
          className={campo}
        >
          <option value="">{render(catalog, 'alerts.filterSeverity', {}, lang)}</option>
          {SEVERIDADES.map(sev => (
            <option key={sev} value={sev}>
              {render(catalog, `severity.${sev}`, {}, lang)}
            </option>
          ))}
        </select>

        <select
          aria-label={render(catalog, 'alerts.filterWallet', {}, lang)}
          value={carteira}
          onChange={e => setCarteira(e.target.value)}
          className={campo}
        >
          <option value="">{render(catalog, 'alerts.filterWallet', {}, lang)}</option>
          {wallets.map(w => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
      </div>

      <AlertFeed
        alerts={alerts}
        catalog={catalog}
        lang={lang}
        walletLabels={Object.fromEntries(wallets.map(w => [w.id, w.label]))}
        temMais={cursor !== null}
        onSelect={setAberto}
        onLoadMore={() => {
          if (!cursor) return
          void api.alerts({ ...filtro(), cursor }).then(pagina => {
            setAlerts(anteriores => [...anteriores, ...pagina.items])
            setCursor(pagina.nextCursor)
          })
        }}
      />

      {aberto && (
        <AlertDetail
          alertId={aberto.id}
          fonte={host(wallets.find(w => w.id === aberto.walletId)?.backendUrl ?? '')}
          catalog={catalog}
          lang={lang}
          onClose={() => setAberto(null)}
        />
      )}
    </div>
  )
}
