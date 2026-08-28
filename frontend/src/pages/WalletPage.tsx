import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, type Alert } from '../lib/api'
import { WalletCard } from '../components/WalletCard'
import { AlertFeed } from '../components/AlertFeed'
import { AlertDetail } from '../components/AlertDetail'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { render } from '../lib/i18n'
import { useDadosDoPainel } from './Layout'
import { Button } from '../components/ui/Button'

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * A carteira inteira numa página.
 *
 * O cartão do painel mostra o resumo; aqui cabe o que não cabia: os alertas
 * daquela carteira, paginados, a exportação BIP-329, e as ações de arquivar e
 * apagar sem disputar espaço com as outras carteiras.
 */
export function WalletPage() {
  const { catalog, lang, wallets, fontes, carregado, recarregar } = useDadosDoPainel()
  const { id } = useParams()
  const walletId = Number(id)
  // Comparação por texto: `bigint` do Postgres chega como **string** no JSON,
  // e `w.id === 10` seria falso para a carteira 10. O tipo diz `number`, a
  // rede entrega `"10"`, e quem confia no tipo mostra "carteira não existe"
  // para uma carteira que existe.
  const carteira = wallets.find(w => String(w.id) === String(id))

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [aberto, setAberto] = useState<Alert | null>(null)
  const [paraApagar, setParaApagar] = useState(false)

  const buscarAlertas = useCallback(async () => {
    const pagina = await api.alerts({ walletId })
    setAlerts(pagina.items)
    setCursor(pagina.nextCursor)
  }, [walletId])

  useEffect(() => {
    if (Number.isFinite(walletId)) void buscarAlertas()
  }, [buscarAlertas, walletId])

  if (!carteira) {
    return (
      <div className="px-4 py-6 sm:px-8">
        <p className="font-prose text-sm text-faint">
          {render(catalog, carregado ? 'wallet.notFoundOnScreen' : 'wallets.loading', {}, lang)}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-8">
      <WalletCard
        wallet={carteira}
        catalog={catalog}
        lang={lang}
        onScan={() => void api.scanPrivacy(carteira.id).then(recarregar)}
        onArchive={() => void api.archiveWallet(carteira.id).then(recarregar)}
        onUnarchive={() => void api.unarchiveWallet(carteira.id).then(recarregar)}
        onDelete={() => setParaApagar(true)}
        backends={fontes.filter(f => f.network === carteira.network)}
        onChangeBackend={fonte =>
          void api.changeWalletBackend(carteira.id, fonte).then(recarregar)
        }
      />

      <Button as="a" href={api.exportLabels(carteira.id)} download className="self-start">
        {render(catalog, 'utxos.export', {}, lang)}
      </Button>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-label text-faint">
          {render(catalog, 'wallet.alerts', {}, lang)}
        </h2>
        <AlertFeed
          alerts={alerts}
          catalog={catalog}
          lang={lang}
          temMais={cursor !== null}
          onSelect={setAberto}
          onLoadMore={() => {
            if (!cursor) return
            void api.alerts({ walletId, cursor }).then(pagina => {
              setAlerts(anteriores => [...anteriores, ...pagina.items])
              setCursor(pagina.nextCursor)
            })
          }}
        />
      </section>

      {aberto && (
        <AlertDetail
          alertId={aberto.id}
          fonte={host(carteira.backendUrl)}
          catalog={catalog}
          lang={lang}
          onClose={() => setAberto(null)}
        />
      )}

      {paraApagar && (
        <ConfirmDialog
          label={carteira.label}
          catalog={catalog}
          lang={lang}
          onCancel={() => setParaApagar(false)}
          onConfirm={confirmado =>
            void api
              .removeWallet(carteira.id, confirmado)
              .then(() => {
                setParaApagar(false)
                return recarregar()
              })
              .catch(() => setParaApagar(false))
          }
        />
      )}
    </div>
  )
}
