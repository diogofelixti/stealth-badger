# Stealth Badger

Watchtower de privacidade para Bitcoin. Vigia endereços e carteiras (xpub/descriptor),
alerta sobre movimentação e sobre vazamentos de privacidade, e orienta a gestão de UTXO.

Projeto do hackathon **Bitcoin Vibe Builder** — entrega em 28/08/2026, 19h.
Open source, self-hostável, multi-usuário.

---

## Regras de commit e push

**NENHUM commit, push, tag, branch, mensagem, corpo de PR ou metadado deste repositório
pode conter referência a IA, a assistentes de IA, ou atribuir autoria/coautoria a IA.**

Especificamente proibido:

- Trailers `Co-Authored-By:` que nomeiem qualquer IA ou assistente
- Frases como "Generated with", "Created by", "with the help of" seguidas de nome de IA
- Emojis de robô, selos, badges ou assinaturas indicando geração assistida
- Menção a IA em mensagens de commit, descrições de PR, releases ou nomes de branch

Todo commit tem **um único autor: o desenvolvedor humano do projeto**
(`diogofelixti <diogofelixti@gmail.com>`).

Mensagens de commit descrevem *o que mudou e por quê*, e nada sobre como foram escritas.

---

## Documentos de referência

| Arquivo | Conteúdo |
|---|---|
| `docs/superpowers/specs/2026-08-24-coin-control-watchtower-design.md` | design completo: arquitetura, schema, recorte, plano, riscos |
| `docs/hackathon-briefing.md` | regras oficiais do hackathon e o que elas impõem ao projeto |
| `docs/specification.md` | comportamento esperado — entrega obrigatória do hackathon |

Antes de mudar arquitetura ou escopo, ler o design. O recorte da §4 existe para ser
obedecido sob pressão, não renegociado.

---

## Stack

TypeScript ponta a ponta.

- **backend** — Node 20, API + worker no mesmo processo, SSE para o feed ao vivo
- **frontend** — SPA React, container separado
- **postgres** — `JSONB` no log de eventos, `LISTEN/NOTIFY` para alertas, multi-tenant
- **nginx** — TLS e roteamento; `proxy_buffering off` no endpoint de SSE (sem isso o
  feed ao vivo quebra silenciosamente)
- Empacotamento em Docker Compose; perfis opcionais para `ntfy` e `tor`

## Princípios

1. **A aplicação não sobe nó de ninguém.** Aponta para infraestrutura existente e
   oferece exploradores públicos como alternativa consciente e avisada.
2. **O aviso de privacidade é persistente**, nunca um toast que some. Quando o usuário
   está consultando via serviço público, ele precisa saber o tempo todo.
3. **Nenhuma chave privada, seed ou capacidade de gasto entra no sistema.** Só watch-only.
4. **xpub é cifrado em repouso** com chave derivada da senha do usuário.
5. **`chain_events` é append-only.** Nunca sofre UPDATE de conteúdo nem DELETE; reorg
   gera evento compensatório. Todo o resto é projeção reconstruível.
6. **Alertar sobre privacidade, não sobre saldo** — é a tese do produto.

## Testes

Critério de avaliação do hackathon e entrega obrigatória. TDD nas regras onde a falha é
silenciosa: deduplicação de alerta, reorg, gap limit, projeção de UTXO, BIP-329.

## Segurança

Nunca versionar segredos. Toda configuração sensível vai em `.env`, documentada em
`.env.example` com valores de exemplo — jamais reais.
