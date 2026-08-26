import { useEffect, useState } from 'react'
import { api, mensagemDoErro, type Catalog, type Lang, type Utxo } from '../lib/api'
import { formatSats } from '../lib/format'
import { render } from '../lib/i18n'

/**
 * Limiar de poeira, o mesmo do motor de alertas. Abaixo dele o UTXO custa mais
 * para gastar do que vale, e é o formato usado em ataque de rastreamento.
 */
const POEIRA = 1000

function encurtar(txid: string): string {
  return txid.slice(0, 8) + '…' + txid.slice(-6)
}

export function UtxoTable({
  walletId,
  catalog,
  lang,
}: {
  walletId: number
  catalog: Catalog
  lang: Lang
}) {
  const [utxos, setUtxos] = useState<Utxo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function recarregar(): Promise<void> {
    try {
      setUtxos(await api.utxos(walletId))
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    }
  }

  useEffect(() => {
    void recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletId])

  async function marcar(
    u: Utxo,
    mudanca: { label?: string | null; tags?: string[]; frozen?: boolean },
  ): Promise<void> {
    // Otimista na tela, confirmado no servidor: congelar precisa responder ao
    // clique, e recarregar a lista inteira a cada marca piscaria a tabela.
    setUtxos(atual =>
      (atual ?? []).map(x =>
        x.txid === u.txid && x.vout === u.vout ? { ...x, ...mudanca } : x,
      ),
    )
    try {
      await api.markUtxo(walletId, u.txid, u.vout, mudanca)
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
      await recarregar()
    }
  }

  if (erro) {
    return (
      <p role="alert" className="text-xs" style={{ color: 'var(--sb-critical)' }}>
        {erro}
      </p>
    )
  }

  if (utxos === null) return null

  return (
    <section className="mt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-label text-faint">
          {render(catalog, 'utxos.title', {}, lang)}
        </h3>
        <div className="flex items-center gap-3">
          <a
            href={api.exportLabels(walletId)}
            className="text-xs uppercase tracking-label"
            style={{ color: 'var(--sb-accent)' }}
          >
            {render(catalog, 'utxos.export', {}, lang)}
          </a>
          <label
            className="cursor-pointer text-xs uppercase tracking-label"
            style={{ color: 'var(--sb-accent)' }}
          >
            {render(catalog, 'utxos.import', {}, lang)}
            <input
              type="file"
              accept=".jsonl,application/jsonl,text/plain"
              className="hidden"
              onChange={async e => {
                const arquivo = e.target.files?.[0]
                if (!arquivo) return
                try {
                  await api.importLabels(walletId, await arquivo.text())
                  await recarregar()
                } catch (err) {
                  setErro(mensagemDoErro(catalog, err, lang))
                }
              }}
            />
          </label>
        </div>
      </div>

      {utxos.length === 0 ? (
        <p className="text-xs text-muted">{render(catalog, 'utxos.empty', {}, lang)}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {utxos.map(u => {
            const poeira = u.valueSats < POEIRA
            return (
              <li
                key={`${u.txid}:${u.vout}`}
                data-dust={poeira}
                data-frozen={u.frozen}
                className="rounded border px-3 py-2"
                style={{
                  borderColor: poeira ? 'var(--sb-critical)' : 'var(--sb-border)',
                  opacity: u.frozen ? 0.65 : 1,
                }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {formatSats(u.valueSats, lang)}
                  </span>
                  <span className="text-xs text-faint">
                    {encurtar(u.txid)}:{u.vout} · {u.derivationPath}
                  </span>
                </div>

                <div className="mt-[6px] flex flex-wrap items-center gap-2">
                  <input
                    // A chave inclui o rótulo de propósito. O input é não
                    // controlado — digitar não deve custar um render por
                    // tecla —, e o React não mexe no valor de um nó que já
                    // existe. Sem remontar, um rótulo que chega pela
                    // importação nunca apareceria, e o usuário concluiria que
                    // o arquivo não foi lido.
                    key={u.label ?? ''}
                    defaultValue={u.label ?? ''}
                    placeholder={render(catalog, 'utxos.labelPlaceholder', {}, lang)}
                    onBlur={e => {
                      const novo = e.target.value.trim()
                      if (novo === (u.label ?? '')) return
                      void marcar(u, { label: novo || null })
                    }}
                    className="min-w-0 flex-1 rounded border border-line bg-bg px-2 py-1 text-xs placeholder:text-faint"
                  />
                  <button
                    type="button"
                    onClick={() => void marcar(u, { frozen: !u.frozen })}
                    className="text-xs uppercase tracking-label"
                    style={{ color: u.frozen ? 'var(--sb-warning)' : 'var(--sb-faint)' }}
                  >
                    {render(catalog, u.frozen ? 'utxos.unfreeze' : 'utxos.freeze', {}, lang)}
                  </button>
                </div>

                {(poeira || u.frozen || u.tags.length > 0) && (
                  <p className="mt-[6px] flex flex-wrap gap-2 text-xs uppercase tracking-label">
                    {poeira && (
                      <span style={{ color: 'var(--sb-critical)' }}>
                        {render(catalog, 'utxos.dust', {}, lang)}
                      </span>
                    )}
                    {u.frozen && (
                      <span style={{ color: 'var(--sb-warning)' }}>
                        {render(catalog, 'utxos.frozen', {}, lang)}
                      </span>
                    )}
                    {u.tags.map(t => (
                      <span key={t} className="text-faint">
                        #{t}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
