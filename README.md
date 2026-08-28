<p align="center">
  <img src="docs/screenshots/logo.png" alt="Stealth Badger" width="120">
</p>

<h1 align="center">Stealth Badger</h1>

<p align="center">
  <strong>Watchtower de privacidade para Bitcoin. Alerta sobre vazamento de privacidade, não sobre saldo.</strong>
</p>

<p align="center">
  <a href="#o-problema">Problema</a> •
  <a href="#o-que-ele-faz">Recursos</a> •
  <a href="#início-rápido">Início rápido</a> •
  <a href="#arquitetura">Arquitetura</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Bitcoin-watch--only-F7931A?style=flat-square&logo=bitcoin&logoColor=white" alt="Watch-only">
  <img src="https://img.shields.io/badge/Docker-compose%20up-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/rede-signet%20%C2%B7%20testnet%20%C2%B7%20mainnet-6f42c1?style=flat-square" alt="Redes">
  <img src="https://img.shields.io/badge/licen%C3%A7a-MIT-2ea44f?style=flat-square" alt="Licença MIT">
</p>

<br>

<p align="center">
  <img src="docs/screenshots/coin-control.png" alt="Painel do Stealth Badger">
</p>

<br>

## O problema

Quem usa Bitcoin perde privacidade por descuido silencioso: reaproveita um endereço,
consolida UTXOs de origens que deveriam ficar separadas, gasta um dust que alguém
plantou justamente para rastreá-lo.

**Nada disso dispara aviso.** Quando a pessoa descobre, o vazamento já está gravado na
blockchain, permanentemente.

Existem boas ferramentas de diagnóstico pontual — você roda, lê o relatório, fecha. Falta
algo que **vigie de forma contínua e avise a tempo**.

> **Saldo qualquer explorador mostra. Privacidade, ninguém vigia.**

## O que ele faz

✅ **Vigia carteiras por chave pública estendida** — `xpub`, `ypub`, `zpub`, `tpub`,
`upub`, `vpub` ou output descriptor, com gap limit e varredura das duas cadeias

✅ **Vigia endereço avulso**, fora de qualquer carteira, para quem publica um endereço
de doação e não quer entregar a carteira inteira ao watchtower

✅ **Sete tipos de alerta**, dos quais quatro são de privacidade e não de movimento:
reutilização de endereço, dust attack, queda de privacy score e origem dos fundos

✅ **Análise de privacidade contínua** via [`am-i-exposed`](https://github.com/Copexit/am-i-exposed),
com score, nota e achados guardados ao longo do tempo — o eixo do tempo é o que um
scanner pontual não pode ter

✅ **Origem dos fundos** — avisa quando a transação que trouxe dinheiro tem forma de saque
de exchange, ou bate com entidade conhecida, distinguindo o que foi reconhecido do que foi
apenas suspeitado

✅ **Coin control** — rótulo, tags de proveniência e congelamento por UTXO, com dust
destacado

✅ **BIP-329** — importa e exporta rótulos, interoperando com Sparrow, Nunchuk, BlueWallet
e Jade

✅ **Feed ao vivo** por SSE, empurrado pelo servidor, sem polling

✅ **Push no celular** via [ntfy](https://ntfy.sh), renderizado no idioma do usuário,
com botão de teste para conferir que o aviso chega antes de precisar

✅ **Degrada em vez de quebrar** — quando o backend recusa servir um endereço, a carteira
fica "vigiando em parte" com o motivo à vista, e os outros endereços continuam sendo
lidos

✅ **Escolha do backend de cadeia por carteira** — Esplora, Electrum (que cobre Electrs,
Fulcrum e Floresta de uma vez) ou o RPC do seu próprio **Bitcoin Core**, sem servidor de
índice no meio; o Electrum verificado contra um ElectrumX real

✅ **Aviso de privacidade permanente** — enquanto qualquer carteira consultar por
explorador público, a advertência fica presa no topo da tela

✅ **Busca** — cole um endereço e descubra se está sendo vigiado, por qual carteira e em
que caminho de derivação

✅ **Bilíngue** pt/en, inclusive no histórico de alertas já gravado

✅ **Multi-usuário**, com xpub cifrado em repouso

### O que o sistema nunca faz

- **Não aceita chave privada, seed ou qualquer material de gasto.** Watch-only, sempre.
- **Não sobe nó nenhum.** Aponta para a infraestrutura que você já tem.
- **Não esconde que você está exposto.** Se a consulta passa por serviço público, a tela
  diz isso o tempo todo.

## Início rápido

Requer Docker e Docker Compose.

```bash
git clone https://github.com/diogofelixti/stealth-badger.git
cd stealth-badger

cp .env.example .env
# gere a chave-mestra que cifra os xpubs em repouso:
openssl rand -hex 32   # cole em MASTER_KEY_HEX
# escolha uma senha para o Postgres em POSTGRES_PASSWORD

docker compose up -d --build
```

A interface fica em **http://localhost:8080**. Crie uma conta na primeira tela e cole a
chave pública estendida da carteira que você quer vigiar.

Para experimentar, use a **signet** e um faucet como o
[signetfaucet.com](https://signetfaucet.com).

> ⚠️ **Perder o `MASTER_KEY_HEX` torna os xpubs cadastrados irrecuperáveis.** Ele nunca é
> versionado.

### Configuração

Tudo em `.env`, documentado em [`.env.example`](.env.example):

| Variável | Efeito |
|---|---|
| `MASTER_KEY_HEX` | 32 bytes em hex. Cifra os xpubs em repouso |
| `POSTGRES_PASSWORD` | senha do banco |
| `NETWORK` | rede do backend pronto da instância (`mainnet`, `signet` ou `testnet`); outras redes entram por backends cadastrados na tela/API |
| `CHAIN_BACKEND` | `esplora`, `electrum` ou `core` |
| `ESPLORA_URL` / `ELECTRUM_URL` / `CORE_URL` | endereço do backend de cadeia |
| `CORE_COOKIE_PATH` | caminho do `.cookie` do bitcoind, quando o backend é `core` |
| `CORE_RPC_TIMEOUT_MS` | timeout das chamadas RPC longas do Core, como registro e rescan |
| `PUBLIC_BACKEND` | governa o aviso permanente de privacidade |
| `TOR_HOSTNAME_PATH` | onde o backend lê o `hostname` do hidden service |
| `TS_AUTHKEY` / `TAILSCALE_HOSTNAME` | chave e nome na Tailscale, quando o perfil sobe |
| `TUNNEL_TOKEN` / `CLOUDFLARE_HOSTNAME` | túnel e domínio da Cloudflare, quando o perfil sobe |
| `CLOUDFLARE_METRICS_URL` | onde perguntar se o túnel tem conexão com a borda; o padrão é o `--metrics` do compose |
| `DOCKER_SOCKET` / `COMPOSE_PROJECT` | **opt-in.** Ligam o controle dos acessos pela tela; vêm de `docker-compose.controle.yml`, e não do `.env` |

### Avisos no celular

O watchtower serve para avisar quando você **não** está olhando a tela. Na interface,
cadastre um canal **ntfy** com um tópico longo e difícil de adivinhar, e assine o mesmo
tópico no aplicativo ntfy do celular.

Há um botão de **testar** ao lado do canal: ele dispara uma notificação de verdade. Use
antes de precisar — descobrir que o push não chega no momento em que ele importaria é
tarde demais.

> Quem souber o tópico recebe seus alertas. Ele nunca é devolvido pela API depois de
> cadastrado, justamente para não se espalhar por log de proxy ou captura de tela.

O perfil `ntfy` do Compose sobe um servidor local, mas ele escuta em `127.0.0.1` e um
celular não alcança isso. Para receber no telefone, use o `ntfy.sh` público ou publique
o servidor local na sua rede.

### Alcançar o painel de fora

Três caminhos, três posturas de privacidade, e **nenhum ligado por padrão**. A página
**Acessos** mostra por onde o painel está acessível e o que cada caminho enxerga. Por
padrão, ligar e desligar é na máquina que hospeda: um painel que abre túnel sozinho é um
painel que se publica sem ninguém mandar. Quem quiser fazer isso pela tela precisa
montar o socket do Docker de propósito, e a seção **opt-in**, mais abaixo, diz o que
isso custa.

```bash
docker compose --profile tor up -d          # endereço .onion, com QR na tela
docker compose --profile tailscale up -d    # rede privada entre seus aparelhos
docker compose --profile cloudflared up -d  # domínio público, com o aviso abaixo
```

| Caminho | Quem vê o quê |
|---|---|
| **Tor** | ninguém no meio vê o tráfego nem o destino. É o mais soberano, e não depende de terceiro |
| **Tailscale** | rede privada entre os seus aparelhos; a Tailscale vê metadado de conexão, não o conteúdo |
| **Cloudflare Tunnel** | **a Cloudflare termina o TLS e enxerga o seu tráfego em claro** |

A linha da Cloudflare fica na tela, e não numa nota de rodapé. Publicar um watchtower de
privacidade atrás de um terminador de TLS de terceiro é escolha legítima — e este produto
existe para que escolhas assim sejam feitas sabendo.

Cada caminho tem uma página própria — **Acessos › Tor**, **Tailscale**, **Cloudflare** —
com o passo a passo numerado, os comandos com botão de copiar, o endereço com QR, o
estado medido e o que fazer quando não funciona. O mesmo conteúdo está em
[`docs/acessos/`](docs/acessos/), para quem prefere ler no repositório.

A página distingue **configurado** de **respondendo**, e a diferença entre os dois é o
caso em que a pessoa acha que está publicada e não está: o `.onion` no arquivo, com o Tor
parado. Um terceiro estado, **não medido**, existe para a tela não afirmar o que não
mediu — e ele nunca aparece como vermelho.

O perfil `tor` guarda a chave do endereço `.onion` num volume do Docker; o backend monta
apenas o `hostname`, em modo leitura.

#### Ligar e desligar pela tela é opt-in

**Por padrão, o socket do Docker não é montado em lugar nenhum**, e o painel lê por onde
está acessível sem ligar nem desligar container nenhum. É o comportamento de fábrica, e
ele não muda sozinho.

Quem quiser os botões de **Ativar** e **Desativar** na página de cada caminho soma um
segundo arquivo ao compose, de propósito:

```bash
docker compose -f docker-compose.yml -f docker-compose.controle.yml up -d
docker compose --profile tor create   # uma vez por perfil que você vá controlar
```

> **Quem alcança o socket do Docker é root na máquina que hospeda.** Não há montagem em
> modo leitura que mude isso: um socket não é um arquivo que se lê, é um canal, e o
> engine do outro lado obedece a quem fala nele. Com o socket montado, **uma sessão do
> painel vale execução de código nessa máquina** — e, se o painel estiver publicado num
> túnel, isso vale para quem obtiver uma sessão de fora.

O que estreita a superfície, e está no código, não na documentação:

1. **o backend não recebe comando.** Ele recebe `{ profile, action }`, confere contra
   três perfis e dois verbos, e monta ele mesmo as duas únicas chamadas que sabe fazer:
   `/start` e `/stop`, sobre um id que veio do próprio engine. Não há shell em lugar
   nenhum desse caminho, e nenhum `exec`, `logs` ou `create` é alcançável;
2. **`users.is_admin`**, conferido antes de qualquer chamada: quem não é admin da
   instância recebe 403, e o engine não chega a ser tocado;
3. **o arquivo separado.** Sem somá-lo, nada disto existe.

A tela repete esse aviso, em cor de atenção, para quem tem o botão à frente.

## Onde o Bitcoin participa do fluxo

Não como tema, e sim como funcionamento:

- **Derivação HD** — BIP-32/44/49/84/86, validada contra os vetores da BIP-84, com o tipo
  de script descoberto pela cadeia quando a chave não o declara
- **UTXOs e mempool** — o sistema inteiro é uma projeção do conjunto de UTXOs; alerta
  distingue mempool, 1 confirmação e 6
- **Blocos e transações** — detecção de reorganização de cadeia comparando hash de bloco
  na altura registrada
- **APIs e nós** — Esplora por HTTP, Electrum por JSON-RPC sobre TCP e Bitcoin Core pelo
  RPC do nó, escolhidos por carteira
- **Análise de cadeia** — heurísticas de privacidade sobre a carteira e sobre a
  transação que trouxe os fundos

## Arquitetura

```
nginx      TLS e roteamento
frontend   SPA React
backend    API + worker de sincronização, SSE para alertas ao vivo
postgres   log de eventos on-chain append-only e projeções
```

Perfis opcionais do Compose para `ntfy` (push) e `tor`.

**Uma frase justificando cada peça:**

| Peça | Por que existe |
|---|---|
| **postgres** | `LISTEN/NOTIFY` empurra o alerta para o feed sem polling, `JSONB` guarda payload de evento sem uma tabela por tipo, e `user_id` isola os inquilinos desde a primeira migração |
| **backend** | o watchtower precisa vigiar com o usuário deslogado; sem processo permanente não existe vigilância, só um relatório sob demanda |
| **worker no mesmo processo** | um watchtower de uma carteira não justifica fila nem segundo container; separar seria arquitetura para um problema que não temos |
| **frontend separado** | o painel é servido como estático e o feed chega por SSE; acoplá-lo ao backend não traria nada e tiraria o cache |
| **nginx** | TLS e roteamento, e `proxy_buffering off` no endpoint de SSE — sem isso o feed ao vivo quebra em silêncio |
| **ntfy** | notificação precisa chegar com o navegador fechado, que é justamente quando vigiar importa |

### O núcleo é um log append-only

`chain_events` só cresce. Saldo, conjunto de UTXOs, score de privacidade e alertas são
**projeções reconstruíveis** a partir dele. É o que torna o tratamento de reorganização de
cadeia correto por construção em vez de remendado: reorg não apaga evento, grava um evento
compensatório e marca os afetados.

### Adapters declaram capacidades

Os backends suportados não são variações do mesmo modelo. Esplora e Electrum respondem
histórico de qualquer script na hora; Bitcoin Core exige registrar o descriptor antes e
varrer a cadeia a partir de uma altura. O adapter declara o que sabe fazer, e o motor
decide o caminho — os dois estão implementados, e a diferença não vaza para o resto do
sistema.

No caminho de registro não há gap limit: quem sabe quais endereços existem é o nó, que
reporta a carteira inteira de uma vez. Por isso sumir da lista é evidência de gasto, o
que no caminho de sondagem não seria verdade.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/specification.md`](docs/specification.md) | **comportamento esperado** — o que o sistema faz, e o que ainda não faz |
| [`docs/2026-08-25-backend-watchtower-progress.md`](docs/2026-08-25-backend-watchtower-progress.md) | diário de bordo: o que cada rodada fez, e que premissa ela desmentiu |
| [`docs/superpowers/specs/2026-08-24-coin-control-watchtower-design.md`](docs/superpowers/specs/2026-08-24-coin-control-watchtower-design.md) | design completo: arquitetura, modelo de dados, recorte, riscos |

## Notas de segurança

**O xpub é cifrado com AES-256-GCM** sob a chave-mestra do servidor, e não sob uma chave
derivada da senha do usuário. A razão é concreta: o worker sincroniza com o usuário
deslogado e não teria como abrir o xpub. A consequência é explícita e assumida — **quem
tem o banco *e* a chave-mestra enxerga os xpubs vigiados**. É por isso que o projeto é
self-hostável e que a chave nunca é versionada.

As dependências da suíte de testes (`vitest` e, por baixo, `vite`/`esbuild`) têm avisos
publicados relacionados ao servidor de UI do Vitest (`vitest --ui`). Este projeto nunca
inicia esse servidor, e `npm install --omit=dev` mantém esses pacotes fora da imagem de
produção.

## Créditos

A análise de privacidade se apoia no [`am-i-exposed`](https://github.com/Copexit/am-i-exposed)
(MIT), de Copexit. As heurísticas de fingerprint de transação seguem o trabalho do
[`lumen-fingerprints`](https://fungi-protocol.github.io/lumen-fingerprints/).

Projeto do hackathon **Bitcoin Vibe Builder**, do [bitcoin Coders](https://x.com/bitcoin_coders).

## Licença

[MIT](LICENSE).
