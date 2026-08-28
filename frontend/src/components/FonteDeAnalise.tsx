import { useEffect, useState } from 'react'
import {
  api,
  mensagemDoErro,
  type CandidataDeAnalise,
  type Catalog,
  type Lang,
  type Network,
} from '../lib/api'
import { render } from '../lib/i18n'

const REDES: Network[] = ['mainnet', 'signet', 'testnet']
const campo = 'rounded border border-line bg-bg px-3 py-2 text-sm'

/**
 * Qual Esplora roda a análise de privacidade, por rede.
 *
 * ── Por que esta seção existe ─────────────────────────────────────────────
 * O `am-i-exposed` só fala REST no formato Esplora. Quem vigia pelo próprio
 * Bitcoin Core — a postura mais soberana — tem uma fonte de cadeia que o
 * scanner não sabe consultar, e precisa apontar a análise para outro lugar.
 *
 * A pergunta já é feita na primeira análise, dentro do cartão da carteira. Esta
 * seção existe para **trocar depois**: sem ela, a escolha ficaria presa no
 * momento em que foi feita, e quem subisse um Esplora próprio depois não teria
 * onde mudar.
 *
 * A escolha é por usuário: escolher a fonte de análise é escolher quem vê os
 * endereços que você consulta, e ninguém deve herdar a exposição de outro.
 */
export function FonteDeAnalise({
  catalog,
  lang,
}: {
  catalog: Catalog
  lang: Lang
}) {
  const [rede, setRede] = useState<Network>('mainnet')
  const [candidatas, setCandidatas] = useState<CandidataDeAnalise[]>([])
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void api
      .analysisSource(rede)
      .then(r => setCandidatas(r.candidates))
      .catch(err => setErro(mensagemDoErro(catalog, err, lang)))
  }, [rede, catalog, lang])

  async function escolher(backendId: number): Promise<void> {
    setErro(null)
    try {
      const r = await api.chooseAnalysisSource(rede, backendId)
      setCandidatas(r.candidates)
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    }
  }

  const t = (chave: string, params: Record<string, unknown> = {}) =>
    render(catalog, chave, params, lang)
  const escolhida = candidatas.find(c => c.escolhida)

  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-label text-faint">
        {t('privacy.analysisSource')}
      </h2>
      <p className="mb-3 font-prose text-sm leading-relaxed text-muted">
        {t('privacy.analysisSourceNote')}
      </p>

      <label htmlFor="analise-rede" className="mb-1 block text-xs uppercase tracking-label text-faint">
        {t('backends.network')}
      </label>
      <select
        id="analise-rede"
        value={rede}
        onChange={e => setRede(e.target.value as Network)}
        className={`mb-3 ${campo}`}
      >
        {REDES.map(n => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      {candidatas.length === 0 ? (
        <p className="text-sm text-faint">{t('privacy.analysisNone')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {candidatas.map(c => (
            <label key={c.id} className="flex items-baseline gap-2 text-sm">
              <input
                type="radio"
                name={`fonte-de-analise-${rede}`}
                checked={c.escolhida}
                onChange={() => void escolher(c.id)}
              />
              <span className="min-w-0 break-all">
                {c.label ?? c.preset ?? c.url}
                <span
                  className="ml-2 text-xs"
                  style={{
                    color: c.isPublic ? 'var(--sb-public)' : 'var(--sb-sovereign)',
                  }}
                >
                  {t(c.isPublic ? 'privacy.analysisPublic' : 'privacy.analysisOwn')}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      {/* O host à vista, porque é ele que vê os endereços consultados. */}
      {escolhida && (
        <p className="mt-2 text-xs text-faint">
          {t('privacy.analysisBy', { host: escolhida.url })}
        </p>
      )}

      {erro && (
        <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--sb-critical)' }}>
          {erro}
        </p>
      )}
    </section>
  )
}
