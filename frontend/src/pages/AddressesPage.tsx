import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AddWallet } from '../components/AddWallet'
import { Copiar } from '../components/ui/Copiar'
import { Button } from '../components/ui/Button'
import { formatSats } from '../lib/format'
import { render } from '../lib/i18n'
import { useDadosDoPainel } from './Layout'

/**
 * Os endereços avulsos, separados das carteiras.
 *
 * Eles sempre couberam no mesmo modelo — uma carteira de `kind: 'address'` —,
 * e é por isso que o motor não sabe a diferença. A tela sabe: quem vigia um
 * endereço solto não está pensando em gap limit nem em derivação, e procurá-lo
 * no meio das carteiras é procurar outra coisa. Aqui o endereço é o assunto, e
 * aparece inteiro, com botão de copiar.
 */
export function AddressesPage() {
  const { catalog, lang, wallets, recarregar } = useDadosDoPainel()
  const [abrindoForm, setAbrindoForm] = useState(false)

  const avulsos = wallets.filter(w => w.kind === 'address')
  const t = (chave: string, params: Record<string, unknown> = {}) =>
    render(catalog, chave, params, lang)

  return (
    <div className="flex flex-col gap-3 px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-label text-faint">
          {t('addresses.title')}
        </h2>
        <Button onClick={() => setAbrindoForm(v => !v)} aria-expanded={abrindoForm}>
          {t('addresses.add')}
        </Button>
      </div>

      <p className="font-prose text-sm leading-relaxed text-muted">
        {t('addresses.note')}
      </p>

      {abrindoForm && (
        <AddWallet
          catalog={catalog}
          lang={lang}
          onAdded={() => {
            setAbrindoForm(false)
            void recarregar()
          }}
        />
      )}

      {avulsos.length === 0 && !abrindoForm && (
        <p className="font-prose text-sm text-muted">{t('addresses.empty')}</p>
      )}

      {avulsos.map(w => (
        <div
          key={w.id}
          className="rounded border border-line bg-surface px-[18px] py-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Link to={`/carteiras/${w.id}`} className="text-base">
              {w.label}
            </Link>
            <span className="text-xl">{formatSats(Number(w.balanceSats), lang)}</span>
          </div>

          {w.address && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="min-w-0 break-all font-mono text-sm text-muted">
                {w.address}
              </span>
              <Copiar texto={w.address} catalog={catalog} lang={lang} />
            </div>
          )}

          <p className="mt-1 flex items-center gap-[6px] text-xs text-faint">
            <span
              aria-hidden="true"
              className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
              style={{
                background: w.backendIsPublic ? 'var(--sb-public)' : 'var(--sb-sovereign)',
              }}
            />
            {w.network} · {t('balance.utxos', { n: w.utxoCount })}
          </p>
        </div>
      ))}
    </div>
  )
}
