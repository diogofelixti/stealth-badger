# Stealth Badger

Watchtower de privacidade para Bitcoin.

Monitora endereços e carteiras (xpub ou output descriptor), avisa quando há movimentação
— e, mais importante, **avisa quando sua privacidade vaza**: reutilização de endereço,
ataque de poeira, queda no score de privacidade, fundos chegando de entidade conhecida.
Junto disso, oferece controle de UTXO com rótulos, proveniência e regras de gasto.

> **Alertar sobre privacidade, e não sobre saldo, é a tese do produto.**
> Saldo qualquer explorador mostra.

Open source, self-hostável, multi-usuário.

## Estado

Em desenvolvimento. Projeto do hackathon **Bitcoin Vibe Builder**, com entrega em
28/08/2026. O design está fechado e documentado; a implementação começou em 25/08/2026.

## O problema

Quem usa Bitcoin perde privacidade por descuido silencioso: reaproveita um endereço,
consolida UTXOs de origens que deveriam permanecer separadas, gasta uma poeira que
alguém plantou justamente para rastreá-lo. Nada disso dispara aviso. Quando a pessoa
descobre, o vazamento já está gravado na blockchain — permanentemente.

Existem excelentes ferramentas de diagnóstico pontual. Falta algo que **vigie de forma
contínua e avise a tempo**.

## Princípios

- **Não sobe nó nenhum.** Aponta para a infraestrutura que você já tem — Bitcoin Core,
  Electrs, Fulcrum, Floresta — e oferece exploradores públicos como alternativa
  consciente.
- **O aviso de privacidade é permanente**, não um toast que some. Se você está
  consultando via serviço público, você sabe disso o tempo todo.
- **Watch-only, sempre.** Nenhuma chave privada, seed ou capacidade de gasto entra no
  sistema. Chaves públicas estendidas são cifradas em repouso.

## Arquitetura

```
nginx      TLS e roteamento
frontend   SPA React
backend    API + worker de sincronização, SSE para alertas ao vivo
postgres   log de eventos on-chain append-only e projeções
```

Perfis opcionais do Compose para `ntfy` e `tor`.

O núcleo é um **log append-only de eventos on-chain**. Saldo, conjunto de UTXOs, score de
privacidade e alertas são projeções derivadas dele — o que torna o tratamento de
reorganização de cadeia correto por construção, em vez de remendado.

A camada de acesso à cadeia usa **adapters que declaram suas capacidades**, porque os
backends suportados não são variações de um mesmo modelo: Esplora e Electrs respondem
histórico de qualquer script na hora, enquanto Floresta e Bitcoin Core exigem registrar
o descriptor antes e varrer a cadeia a partir de uma altura.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/superpowers/specs/2026-08-24-coin-control-watchtower-design.md`](docs/superpowers/specs/2026-08-24-coin-control-watchtower-design.md) | design completo: arquitetura, modelo de dados, recorte, riscos |
| [`docs/hackathon-briefing.md`](docs/hackathon-briefing.md) | regras do hackathon e o que impõem ao projeto |

## Notas de segurança

As dependências da suíte de testes (`vitest` e, por baixo dela, `vite`/`esbuild`) têm
avisos de segurança publicados relacionados ao servidor de UI do Vitest
(`vitest --ui`). Este projeto nunca inicia esse servidor, e `npm install --omit=dev`
já mantém esses pacotes fora da imagem do container em produção. Quem rodar
`vitest --ui` manualmente numa máquina acessível pela rede deve estar ciente disso.

## Créditos

A análise de privacidade se apoia no [`am-i-exposed`](https://github.com/Copexit/am-i-exposed)
(MIT). As heurísticas de fingerprint de transação seguem o trabalho do
[`lumen-fingerprints`](https://fungi-protocol.github.io/lumen-fingerprints/).
