# Orientações para agentes de código

Este arquivo é o ponto de entrada para qualquer assistente de programação que
trabalhe neste repositório. Ele existe porque as convenções abaixo não são
dedutíveis do código: são decisões de produto que já foram tomadas, e que custam
caro quando alguém as renegocia sem saber que existiam.

**As regras completas estão em [`CLAUDE.md`](CLAUDE.md)**, que é a fonte da
verdade. O que segue é o resumo do que mais se quebra por desconhecimento.

## As cinco que mais importam

1. **Autoria.** Todo commit tem um único autor: o desenvolvedor humano do
   projeto. Nenhum commit, branch, tag, mensagem, corpo de PR ou metadado deste
   repositório atribui autoria a ferramenta nenhuma, nem menciona uma.

2. **Jargão de Bitcoin não se traduz.** `dust` não vira "poeira", `change` não
   vira "troco", `address reuse` não vira "reutilização de endereço". Vale no
   catálogo bilíngue e em toda a prosa. Há teste cobrindo o catálogo; a prosa
   depende de quem escreve.

3. **Toda rodada termina escrita no diário de bordo**
   ([`docs/2026-08-25-backend-watchtower-progress.md`](docs/2026-08-25-backend-watchtower-progress.md)),
   em três partes: o que foi construído, **o que quebrou a premissa** — com
   medição, erro observado ou número medido — e o que ficou de dívida, com a
   razão de ter ficado. Sem a segunda parte o registro vira changelog, que o
   `git log` já faz melhor.

4. **A honestidade é funcionalidade, não estilo.** Este produto denuncia
   exposição de privacidade; uma tela que afirma o que não mediu o desmonta por
   dentro. Daí `unknown` existir separado de `down` na página de acessos, o
   saldo virar `———` durante a primeira importação, e o aviso da Cloudflare ser
   constante em vez de configurável. Quando não souber, escreva que não sabe.

5. **Nenhuma consulta externa sem clique.** Análise de privacidade, busca na
   cadeia e qualquer coisa que entregue um endereço a um terceiro acontecem
   **depois** de uma ação explícita do usuário, nunca ao abrir uma tela.

## Antes de mexer em arquitetura ou escopo

Leia o design em
[`docs/superpowers/specs/2026-08-24-coin-control-watchtower-design.md`](docs/superpowers/specs/2026-08-24-coin-control-watchtower-design.md).
O recorte da §4 existe para ser obedecido sob pressão, não renegociado.

| Arquivo | Conteúdo |
|---|---|
| `CLAUDE.md` | as regras completas: commits, jargão, registro, stack, princípios |
| `docs/specification.md` | comportamento esperado |
| `docs/2026-08-25-backend-watchtower-progress.md` | diário de bordo, rodada a rodada |
| `docs/2026-08-27-backlog-interface-e-fontes.md` | backlog de 27/08 |
| `docs/2026-08-28-backlog-profundidade-e-atrito.md` | backlog de 28/08 |
| `docs/acessos/` | um documento por caminho externo |

## Convenções de código que os testes cobrem

- **Tokens, nunca cor literal.** `var(--sb-*)`, definidos em
  `frontend/src/styles/tokens.css`. `theme.test.ts` mede contraste de cada tema.
- **Nenhuma ação clicável sem forma.** Link e `<label>` que agem usam o
  `Button` com `as`. `acoes-com-forma.test.ts` varre e falha nomeando a linha.
- **Frase tem fonte única**, no catálogo do backend, nos dois idiomas.
  Comando **não** é frase: ele mora no código, porque não se traduz.
- **`chain_events` é append-only.** Reorg gera evento compensatório; nunca
  `UPDATE` de conteúdo, nunca `DELETE`.
- **TDD onde a falha é silenciosa**: deduplicação de alerta, reorg, gap limit,
  projeção de UTXO, BIP-329.

## Como rodar

```bash
cd backend  && npm test && npx tsc --noEmit
cd frontend && npm test && npx tsc --noEmit
```

Suba o ambiente com `docker compose up -d`; o painel fica em
`http://localhost:8080`.

A suíte do backend roda num banco **separado** do de desenvolvimento, e recusa
rodar em qualquer banco cujo nome não termine em `_test` — ela trunca tudo entre
os casos, e apontá-la para o banco de desenvolvimento apaga as carteiras
cadastradas. O banco de teste é criado uma vez:

```bash
docker compose exec -T postgres \
  psql -U badger -d postgres -c 'CREATE DATABASE stealth_badger_test OWNER badger'
```

**Ele mora no mesmo volume do Postgres**, então apagar o volume para começar do
zero leva o banco de teste junto, e a suíte inteira passa a falhar com
`database "stealth_badger_test" does not exist`. Recrie com o comando acima.
