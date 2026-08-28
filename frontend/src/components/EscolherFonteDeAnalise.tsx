import { useState } from 'react'
import {
  api,
  mensagemDoErro,
  type CandidataDeAnalise,
  type Catalog,
  type Lang,
  type Network,
} from '../lib/api'
import { render } from '../lib/i18n'
import { Button } from './ui/Button'

/**
 * A única pergunta que o sistema faz sobre análise, e ela é feita uma vez.
 *
 * ── Por que existe ────────────────────────────────────────────────────────
 * O `am-i-exposed` só fala REST no formato Esplora. Quem vigia pelo próprio
 * Bitcoin Core — a postura mais soberana — tem uma fonte de cadeia que o
 * scanner não sabe consultar: em 28/08, dez de dez análises falharam com
 * `Not found` porque o RPC do nó era mandado ao scanner como se fosse uma API.
 *
 * ── Por que perguntar, e não escolher ─────────────────────────────────────
 * Escolher a fonte de análise é escolher **quem vê os endereços que você
 * consulta**. Cair sozinho num Esplora público faria isso pelas costas de quem
 * escolheu vigiar pelo próprio nó. Mas travar também não serve: a pergunta é
 * uma, por rede, e a resposta fica guardada.
 *
 * O host aparece antes do clique, e a postura de cada candidata vem marcada —
 * uma fonte sua não expõe nada, e uma pública expõe. É a mesma régua do selo do
 * cabeçalho, aplicada à escolha em vez de ao resultado.
 */
export function EscolherFonteDeAnalise({
  network,
  chainKind,
  candidatas,
  catalog,
  lang,
  onEscolheu,
}: {
  network: Network
  /** o tipo da fonte de cadeia que não serviu, para a tela dizer por quê */
  chainKind: string
  candidatas: CandidataDeAnalise[]
  catalog: Catalog
  lang: Lang
  /** chamado depois de guardar a escolha: quem chama repete a análise */
  onEscolheu: () => void | Promise<void>
}) {
  // A própria vem primeiro na lista, e por isso é a pré-selecionada: quem tem
  // Esplora seu não deve ter de desmarcar um público para escolhê-lo.
  const [escolha, setEscolha] = useState<number | null>(candidatas[0]?.id ?? null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function confirmar(): Promise<void> {
    if (escolha === null) return
    setSalvando(true)
    setErro(null)
    try {
      await api.chooseAnalysisSource(network, escolha)
      await onEscolheu()
    } catch (err) {
      setErro(mensagemDoErro(catalog, err, lang))
    } finally {
      setSalvando(false)
    }
  }

  const t = (chave: string, params: Record<string, unknown> = {}) =>
    render(catalog, chave, params, lang)

  return (
    <div
      className="mt-3 rounded-lg border p-4"
      style={{ borderColor: 'var(--sb-warning)' }}
      data-testid="escolher-fonte-de-analise"
    >
      <h4 className="mb-1 text-xs uppercase tracking-label text-faint">
        {t('privacy.analysisSource')}
      </h4>
      <p
        className="mb-3 font-prose text-sm leading-relaxed"
        style={{ color: 'var(--sb-warning)' }}
      >
        {t('error.privacy.needsAnalysisSource', { chainKind })}
      </p>

      <div className="mb-3 flex flex-col gap-2">
        {candidatas.map(c => (
          <label key={c.id} className="flex items-baseline gap-2 text-sm">
            <input
              type="radio"
              name="fonte-de-analise"
              value={c.id}
              checked={escolha === c.id}
              onChange={() => setEscolha(c.id)}
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

      {/* O que a escolha custa, dito antes do clique e não depois. */}
      <p className="mb-3 font-prose text-sm leading-relaxed text-muted">
        {t('privacy.analysisNote')}
      </p>

      <Button
        variant="primary"
        disabled={escolha === null || salvando}
        onClick={() => void confirmar()}
      >
        {t('privacy.analysisChoose')}
      </Button>

      {erro && (
        <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--sb-critical)' }}>
          {erro}
        </p>
      )}
    </div>
  )
}
