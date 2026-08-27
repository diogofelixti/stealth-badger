# Backlog de 27/08 — fontes de consulta, interface e acessos

Este documento existe porque a execução vai ser feita por outro agente e conferida
depois. Ele não é lista de desejos: cada item traz **o que construir, por que, o
contrato, os arquivos, os testes que provam, e quando está pronto**. Item sem critério
de pronto volta a ser discutido do zero — foi o que o diário de bordo ensinou em vinte
e uma rodadas.

A entrega do hackathon é **28/08 às 19h**. A ordem sugerida no fim do documento é a
ordem em que o valor aparece na tela; parar no meio dela deixa o projeto num estado
apresentável, e parar no meio de um item não.

---

## Decisões tomadas com o dono do projeto em 27/08

Estas quatro decisões já estão fechadas. Não reabrir.

| Assunto | Decisão |
|---|---|
| **Escopo** | Construir tudo o que está aqui; pausar onde parar. A entrega é amanhã à noite |
| **Apagar carteira** | Arquivar é a ação principal; apagar de verdade existe, atrás de confirmação escrita |
| **Preço do BTC** | Mais de uma API pública, o usuário liga ou não cada uma. A consulta é **só de preço** — nunca carrega endereço, txid ou qualquer identificador |
| **Taxas** | O usuário escolhe entre o nó local e uma fonte externa, e sempre pode desligar |
| **Logs e terminal de container** | **Fora de escopo.** A razão está registrada no fim deste documento |

---

## O que a máquina já tem, e por que isso muda a ordem

Verificado em 27/08, nesta máquina:

```
bitcoind -signet -datadir=/mnt/dados2 -daemon     rodando
  getblockchaininfo → chain signet, blocks 319578, verificationprogress 1
  RPC em 127.0.0.1:38332, cookie em /mnt/dados2/signet/.cookie
Fulcrum 2.1.2 em /home/bilbo/fulcrum-dist
  signet.conf → bitcoind 127.0.0.1:38332, tcp 127.0.0.1:50001
```

**A pendência mais antiga do projeto era "a postura soberana nunca foi demonstrada".**
Ela sobreviveu a vinte e uma rodadas por falta de um nó, e o nó está aqui, sincronizado.
É por isso que o item 1 deste documento não é interface: é apontar o Stealth Badger para
este nó e conferir que funciona. Uma hora de trabalho fecha o buraco que está no meio da
tese do produto, e nenhum outro item deste documento vale mais para a demonstração.

---

## Estado de partida (27/08, medido)

- backend: 37 arquivos de teste, **418 testes**; frontend: 12 arquivos, **96 testes**
- `npx tsc --noEmit` limpo nos dois
- migrações aplicadas: `001` a `009`. **Próximo número livre: `010`**
- três adapters de cadeia: `esplora`, `electrum`, `core`

API de hoje, inteira:

```
GET    /api/health
POST   /api/auth/register        POST /api/auth/login      POST /api/auth/logout
GET    /api/auth/me
GET    /api/backends             POST /api/backends
GET    /api/wallets              POST /api/wallets
GET    /api/wallets/:id/utxos    POST /api/wallets/:id/labels
GET    /api/wallets/:id/privacy  POST /api/wallets/:id/scan
GET    /api/search
GET    /api/alerts               GET  /api/stream        (SSE)
GET    /api/channels             POST /api/channels      POST /api/channels/:id/test
DELETE /api/channels/:id
GET    /api/i18n/:lang
```

Frontend: **duas telas** (`Login`, `Dashboard`), sem roteador. Nove componentes.

---

## Regras que valem para todos os itens

1. **Jargão de Bitcoin não se traduz**, nem no catálogo nem na prosa: `dust`, `change`,
   `address reuse`, `faucet`, `xpub`, `descriptor`, `mempool`, `fee`. Está no `CLAUDE.md`
   e tem teste no catálogo.
2. **Toda string nova entra nas duas línguas** em `backend/src/i18n/catalog.ts`. Texto
   escrito direto no componente é regressão: o catálogo é o que faz o histórico de
   alertas mudar de idioma.
3. **TDD onde a falha é silenciosa.** Obrigatório nos itens 3, 4, 6, 11 e 12 — em todos
   eles o defeito não levanta exceção, só mostra o número errado.
4. **Token, nunca cor literal.** Nenhum `#hex` em componente. Cor sai de `var(--sb-*)`,
   e o item 11 depende disso ser verdade em todo lugar.
5. **A postura de privacidade não some de tela nenhuma.** A listra e o selo moram na
   `Shell`; rota nova herda, e há teste que prova.
6. **Segredo novo é cifrado** com `crypto/secretbox` sob `MASTER_KEY_HEX`, como o xpub, e
   **nunca volta numa resposta de API** — só um booleano dizendo que existe.
7. **Migração aplicada não se altera.** Cria-se a próxima. Os números citados dentro dos
   itens (`010_`, `011_`, `012_`) são **indicativos, não reservas**: o número certo é o
   próximo livre no momento em que o item for executado, e a ordem sugerida no fim deste
   documento não é a ordem numérica.
8. **Cada item termina verde**: `npx tsc --noEmit` e `npm test` nos dois projetos, e a
   rodada escrita no diário de bordo com o que quebrou premissa.

---

## Pendências que já existiam antes desta lista

| Pendência | Origem | O que fazer aqui |
|---|---|---|
| Postura soberana nunca demonstrada | diário, 20ª rodada | **item 1** |
| Adapter de Core nunca falou com bitcoind | spec §12.2 | **item 1** |
| Adapter Electrum só contra servidor público | spec §12.2 | **item 1**, pelo Fulcrum local |
| Arquivo BIP-329 nunca aberto por outra carteira | diário | fica; depende de instalar Sparrow |
| `rescanFrom` implementado e não chamado | diário, 21ª rodada | fica, com a razão já registrada |
| `internal: false` também na cadeia de troco | diário, 21ª rodada | **item 1**, se o nó reclamar |
| Falha isolada em `Dashboard > anuncia postura pública` | diário | observar; o `hookTimeout` de 27/08 é candidato a explicação |
| Regras "não gastar junto" | spec §12.1 | fora deste backlog |
| Fingerprints de transação | spec §12.1 | fora deste backlog |
| Limiar de `dust` configurável | spec §12.1 | fora deste backlog |
| Painel de administrador (`users.is_admin`) | spec §12.1 | fora deste backlog |
| Uma instância vigia uma rede só | spec §12.2 | fora deste backlog |
| Análise de privacidade leva ~78 s | spec §12.2 | fora deste backlog |
| Interface de duas telas | spec §12.2 | **item 10** resolve |

---

# Item 1 — A postura soberana, provada contra o nó desta máquina

**Por quê.** É a tese do produto. O projeto alerta sobre privacidade e nunca mostrou o
modo em que a privacidade existe de verdade. Também é a única pendência que a 17ª rodada
já provou custar caro quando fica só no teste: *"o Electrum nunca teria funcionado, e os
testes passavam porque o transporte falso é o servidor"*.

**Não é código novo.** É exercitar o que já existe contra o nó real, e corrigir o que
quebrar.

### 1.1 Bitcoin Core, pelo RPC

1. Dar ao container do backend acesso ao cookie e à porta do nó. No `docker-compose.yml`,
   no serviço `backend`:
   ```yaml
   volumes:
     - /mnt/dados2/signet/.cookie:/bitcoin/.cookie:ro
   extra_hosts:
     - "host.docker.internal:host-gateway"
   ```
   e no `.env`: `CORE_COOKIE_PATH=/bitcoin/.cookie`.
   O cookie é montado **read-only**, e o `.env` real nunca é versionado.
2. Cadastrar o backend pela tela: `kind=core`, `url=http://host.docker.internal:38332`,
   **não** público.
3. Cadastrar uma carteira de signet por ele e deixar o worker rodar um ciclo.

**Conferir, e anotar o número medido de cada um:**

| O que | Como sei que passou |
|---|---|
| `tipHeight` | bate com `bitcoin-cli -signet getblockcount` |
| `blockHashAt` | bate com `bitcoin-cli -signet getblockhash <altura>` |
| carteira de observação | `bitcoin-cli -signet listwallets` mostra `stealth-badger-<id>` |
| `importdescriptors` | responde `success: true` para as duas cadeias |
| `listunspent` | os UTXOs batem com o que o explorador mostra para o mesmo xpub |
| saldo na tela | bate com o saldo conhecido da carteira |
| `derivationPath` | o caminho gravado em `addresses` é `cadeia/índice`, não `84'/1'/...` |
| **selo de privacidade** | **apagado**, e a listra do topo fina |
| segundo ciclo | não duplica evento, e o log não cresce à toa |

**Os três defeitos corrigidos às cegas na 21ª rodada são os primeiros suspeitos** se algo
falhar: `range` no `importdescriptors`, `loadwallet` antes de `createwallet`, e os dois
últimos trechos do caminho no `desc`. Cada um foi escrito a partir do comportamento
documentado do Core, sem nó para provar. Se algum estiver errado, **o teste que o cobre
está errado junto** — corrigir os dois.

**Se o nó recusar a cadeia de troco**, é o `internal: false` que está na dívida da 21ª
rodada: a cadeia 1 é `change`, e o Core sabe marcar isso. Passar `internal: chain === 1`
exige que `registerDescriptor` receba qual cadeia está registrando.

### 1.2 Electrum, pelo Fulcrum local

O Fulcrum está instalado e configurado, e não estava rodando em 27/08. Subir:

```bash
/home/bilbo/fulcrum-dist/Fulcrum-2.1.2-x86_64-linux/Fulcrum \
  /home/bilbo/fulcrum-dist/signet.conf
```

A primeira sincronização de índice demora; começar cedo. Depois: cadastrar
`electrum://host.docker.internal:50001`, não público, e conferir a mesma tabela acima.
O `server.version` da 17ª rodada é o primeiro suspeito se a conexão for recusada.

### 1.3 O que isto entrega para a demonstração

Duas carteiras lado a lado, **na mesma rede**, uma por explorador público e outra pelo nó
da máquina, com o selo aceso numa e apagado na outra. É o passo 5 do roteiro, o único que
nunca funcionou.

**Pronto quando:** as duas tabelas de conferência estão preenchidas com números medidos,
o selo apaga e acende conforme a carteira, e o resultado — inclusive o que quebrou — está
escrito no diário.

---

# Item 2 — Catálogo de fontes de consulta, com o formulário certo para cada uma

**Por quê.** Hoje o cadastro é um `<select>` de três palavras técnicas e um campo de URL
livre. Quem tem um Fulcrum não sabe que ele é `electrum`, e quem quer o mempool.space
precisa saber escrever `https://mempool.space/signet/api` de cabeça.

### A premissa que precisa estar escrita antes de alguém programar

**Fulcrum, Electrs e Floresta são o mesmo `kind`: `electrum`.** Eles falam o mesmo
protocolo — o florestad embute um servidor Electrum. **mempool.space e Blockstream são o
mesmo `kind`: `esplora`.** Diferem na URL base.

Ou seja: **o catálogo é uma camada de apresentação sobre três adapters.** Um preset
escolhe `kind`, sugere porta e monta a URL. **Preset nunca decide comportamento** — se
alguém fizer `if (preset === 'fulcrum')` em qualquer lugar que não seja a montagem do
formulário, o projeto ganhou um quarto adapter sem querer, e a 21ª rodada mostra o que
custa manter dois modelos honestos.

### O catálogo

| Preset | `kind` | Campos que o formulário pede | URL montada | `isPublic` inicial |
|---|---|---|---|---|
| Bitcoin Core (seu nó) | `core` | host, porta (`8332`/`38332`/`18332` conforme `NETWORK`), autenticação: **cookie** (caminho) ou **usuário e senha** | `http://host:porta` | `false` |
| Fulcrum | `electrum` | host, porta (`50001`) | `electrum://host:porta` | `false` |
| Electrs | `electrum` | host, porta (`50001`) | `electrum://host:porta` | `false` |
| Floresta | `electrum` | host, porta (`50001`) | `electrum://host:porta` | `false` |
| mempool.space | `esplora` | nenhum — a rede escolhe o caminho | `https://mempool.space/signet/api` | `true` |
| Blockstream.info | `esplora` | nenhum | `https://blockstream.info/signet/api` | `true` |
| Esplora próprio | `esplora` | URL inteira | o que foi digitado | `false` |
| Outro Electrum | `electrum` | host, porta | `electrum://host:porta` | usuário marca |

`localhost` e `127.0.0.1` digitados por quem roda em Docker **não alcançam o host**. O
formulário avisa isso na hora, com o que funciona: `host.docker.internal`. É a armadilha
que custa a primeira tentativa de todo mundo.

### Credencial do RPC: cifrada, e nunca de volta

O RPC do Core não é leitura inofensiva — quem o alcança pode parar o nó e, se houver
outra carteira com chave carregada, gastar. Portanto:

- migração `010_backend_credentials.sql`:
  ```sql
  ALTER TABLE backends ADD COLUMN credentials_encrypted BYTEA;
  ALTER TABLE backends ADD COLUMN preset TEXT;
  ALTER TABLE backends ADD COLUMN label TEXT;
  ```
- o conteúdo cifrado é o JSON `{"cookiePath":"..."}` ou `{"user":"...","password":"..."}`,
  fechado com `crypto/secretbox` sob `MASTER_KEY_HEX` — a mesma caixa do xpub;
- `GET /api/backends` devolve `hasCredentials: boolean` e **nunca** o conteúdo. Um teste
  garante isso, porque é o tipo de vazamento que ninguém vê revisando a tela;
- `createAdapter` passa a ler a credencial da linha de `backends`. `CORE_COOKIE_PATH` do
  ambiente vira **fallback** para o backend global, não a única fonte.

### Contrato

```
POST /api/backends
  { preset, kind, host?, port?, url?, isPublic, label?,
    auth?: { mode: 'cookie'|'userpass', cookiePath?, user?, password? } }
  201 → { id, kind, preset, label, url, isPublic, network, scope, hasCredentials }
  400 → { error, code: 'backend.<motivo>', params }
```

Validações novas, cada uma com mensagem acionável nas duas línguas:
`backend.hostRequired`, `backend.portRequired`, `backend.portRange` (1–65535),
`backend.unknownPreset`, `backend.authRequired` (Core sem cookie e sem usuário),
`backend.localhostInDocker` (aviso, não recusa).

### Arquivos

`backend/migrations/010_backend_credentials.sql` · `backend/src/chain/backends.ts`
(validação por preset) · `backend/src/chain/routes.ts` · `backend/src/chain/adapter.ts`
(credencial da linha) · `backend/src/i18n/catalog.ts` ·
`frontend/src/components/BackendForm.tsx` (novo, sai de dentro do `AddWallet`) ·
`frontend/src/lib/presets.ts` (novo) · `frontend/src/lib/api.ts`

### Testes

- `backends.test.ts`: cada preset monta a URL esperada; porta fora da faixa recusa;
  Core sem autenticação recusa nomeando o que falta
- `backends.test.ts`: **`GET /api/backends` não devolve a credencial em campo nenhum**
- `adapter.test.ts`: o adapter de Core usa a credencial da linha, e cai no ambiente só
  quando a linha não tem
- `BackendForm.test.tsx`: escolher Fulcrum sugere `50001`; escolher mempool.space esconde
  host e porta; digitar `localhost` mostra o aviso do Docker

**Pronto quando:** dá para cadastrar o nó desta máquina pela tela, sem tocar no `.env`, e
o `GET /api/backends` não tem a senha em lugar nenhum da resposta.

---

# Item 3 — Trocar a fonte de consulta de uma carteira já cadastrada

**Por quê.** Hoje a fonte é escolhida no cadastro e é para sempre. Quem começou pelo
mempool.space porque era o que tinha, e depois subiu um nó, não tem como migrar sem
recadastrar a carteira — e recadastrar perde o histórico.

### A premissa que quebra

**Trocar de backend pode trocar de modelo de sincronização.** Ir de `esplora` para `core`
é sair do modelo de sondagem para o de registro, e voltar é o contrário. O que sobrevive
à troca:

- **`chain_events` sobrevive inteiro.** É append-only, e um UTXO que existe continua
  existindo independentemente de quem responde. Apagar o log na troca seria reescrever
  história por mudança de fonte;
- **a projeção é reconstruída** pelo próximo ciclo. `sync_state` volta a `pending`,
  `sync_progress` a `0`, `sync_error` a `NULL`;
- **`addresses` sobrevive.** No modelo de registro o nó reporta os endereços de novo, com
  `ON CONFLICT DO UPDATE`; no de sondagem eles são resondados.

### A recusa nova: carteira de endereço avulso

Uma carteira `kind: 'address'` vigia **um endereço**, não um descriptor. Num backend de
registro isso ainda funciona — o Core aceita `addr(<endereço>)` como descriptor — mas
`sincronizarPorRegistro` hoje só sabe montar descriptor a partir do xpub.

Duas saídas, nesta ordem de preferência:

1. **fazer funcionar**: `sincronizarPorRegistro` registra `addr(<endereço>)` quando
   `wallet.kind === 'address'`, em vez das duas cadeias. É pouca coisa e fecha o caso;
2. se faltar tempo: **recusar com mensagem que explica**, `wallet.backendNeedsDescriptor`,
   e não deixar a opção clicável na tela.

Escolher a 1. A 2 só se a 1 não couber no dia.

### Contrato

```
PATCH /api/wallets/:id   { backendId }
  200 → a carteira, como o GET /api/wallets a devolve
  400 → backend.networkMismatch    (rede do backend ≠ rede da carteira)
  400 → wallet.backendNeedsDescriptor
  404 → backend inexistente **e** backend de outro usuário, com a mesma resposta
```

A recusa idêntica para inexistente e alheio já é regra do projeto (spec §11.1): distinguir
os dois contaria a um usuário quais ids existem no banco de outro.

### Arquivos

`backend/src/wallet/routes.ts` · `backend/src/sync/engine.ts` (o caso `addr(...)`) ·
`backend/src/i18n/catalog.ts` · `frontend/src/components/WalletCard.tsx` e a página de
detalhe do item 10 · `frontend/src/lib/api.ts`

### Testes

- `wallets.test.ts`: trocar o backend zera `sync_state` e **não apaga `chain_events`**
- `wallets.test.ts`: rede diferente recusa nomeando as duas redes
- `wallets.test.ts`: backend de outro usuário recebe a mesma resposta de inexistente
- `engine.test.ts`: carteira de endereço avulso num adapter de registro registra
  `addr(<endereço>)` e projeta o saldo
- `engine.test.ts`: carteira sincronizada por sondagem, depois por registro, **não
  duplica evento** — é o teste que prova que a troca não reescreve o log

**Pronto quando:** uma carteira de signet cadastrada pelo mempool.space passa a ser
vigiada pelo nó desta máquina, o selo apaga, e o saldo não muda.

---

# Item 4 — Arquivar carteira, e apagar de verdade quando for o caso

**Por quê.** Não há como tirar uma carteira da tela. Quem cadastrou um xpub por engano
convive com ele.

### A exceção ao princípio 5, escrita

O princípio 5 do `CLAUDE.md` diz que `chain_events` **nunca** sofre DELETE. Apagar uma
carteira apaga o log dela — hoje o schema já tem `ON DELETE CASCADE`.

A exceção é deliberada e a razão é esta: **append-only protege a história contra
reescrita, não contra o dono pedindo para esquecer.** Um watchtower de privacidade que
não deixa alguém remover o próprio xpub do banco está contrariando a própria tese. Por
isso a ação principal é arquivar, e apagar existe atrás de uma porta que ninguém abre sem
querer.

**Registrar esta exceção em `docs/specification.md` §7 e no design.** Princípio com
exceção não escrita é princípio que vai ser violado de novo, por engano.

### Comportamento

- **Arquivar** — `archived_at = now()`. A carteira some da lista principal, **o worker
  para de sincronizá-la**, ela sai do total do painel, e o log fica intacto. Reversível.
- **Desarquivar** — `archived_at = NULL`. Volta a sincronizar no próximo ciclo.
- **Apagar** — só depois de arquivada. Exige que o usuário **digite o rótulo da carteira**
  no corpo do pedido; rótulo errado recusa. Apaga em cascade: `chain_events`, `addresses`,
  `utxos`, `alerts`.

### Contrato

```
POST   /api/wallets/:id/archive     → 200, a carteira
POST   /api/wallets/:id/unarchive   → 200, a carteira
DELETE /api/wallets/:id  { confirm: "<rótulo exato>" }
  204 → apagada
  400 → wallet.confirmMismatch    (rótulo digitado não bate)
  409 → wallet.mustArchiveFirst   (não está arquivada)
GET /api/wallets?archived=true      → lista as arquivadas
```

### Arquivos

`backend/migrations/011_wallet_archived.sql`:
```sql
ALTER TABLE wallets ADD COLUMN archived_at TIMESTAMPTZ;
CREATE INDEX ON wallets (user_id) WHERE archived_at IS NULL;
```
`backend/src/wallet/routes.ts` · `backend/src/worker/tick.ts` (o `WHERE`) ·
`backend/src/i18n/catalog.ts` · `frontend/src/components/WalletCard.tsx` ·
`frontend/src/components/ConfirmDialog.tsx` (novo)

### Testes

- `wallets.test.ts`: arquivada some de `GET /api/wallets` e aparece em `?archived=true`
- `tick.test.ts`: **o tick não sincroniza carteira arquivada** — é a
  falha silenciosa deste item: sem isso ela continua consultando o explorador público,
  invisível, contrariando o que o usuário pediu
- `wallets.test.ts`: apagar sem arquivar dá 409; rótulo errado dá 400; rótulo certo apaga
  e `chain_events` daquela carteira some junto
- `Dashboard.test.tsx`: o total não conta carteira arquivada

**Pronto quando:** arquivar tira da tela e do worker; apagar exige digitar o rótulo; e o
teste do worker prova que a arquivada parou de consultar.

---

# Item 5 — Detalhe da transação ao clicar no alerta

**Por quê.** O alerta diz "recebeu 51.000 sats" e acaba ali. A pergunta seguinte —
*qual transação, quantas confirmações, em que endereço* — não tem para onde ir.

### A premissa que quebra, e é o começo do trabalho

**O alerta não guarda o txid inteiro.** Em `backend/src/alerts/rules.ts` os params
gravam `event.txid.slice(0, 12) + '...'` — texto para caber na frase, não identificador.
Nenhum link sai daí.

O que salva: **`alerts.event_id` referencia `chain_events(id)`**, e o evento tem o txid
completo, a altura e o block hash. O detalhe se monta pelo join, **não** pelos params.

`event_id` é nulável: alertas como `score_dropped` não vêm de evento de cadeia. Nesses o
detalhe existe sem transação, e a tela diz isso em vez de mostrar campo vazio.

### O que o detalhe traz

Sempre, vindo do banco, sem consultar ninguém:

- txid completo, com botão de copiar
- altura, block hash, **confirmações** (`ponta - altura + 1`; `0` é mempool)
- valor em sats, endereço, caminho de derivação, rótulo da carteira
- o alerta renderizado no idioma do usuário, e os alertas irmãos do mesmo txid

Quando o usuário pedir, e **só quando pedir**, um botão "buscar na cadeia" acrescenta
entradas e saídas da transação, por um método novo e opcional do adapter:

```ts
getTransaction?(txid: string): Promise<TxDetail | null>
```

| adapter | como |
|---|---|
| `esplora` | `GET /tx/:txid` |
| `electrum` | `blockchain.transaction.get` com `verbose` |
| `core` | `gettransaction` na carteira de observação; `getrawtransaction` só se `txindex` |

**Por que atrás de um clique.** Buscar a transação é **mais uma consulta ao backend**, e
num explorador público é mais um endereço entregue. Fazer isso sozinho ao abrir o feed
multiplicaria a exposição que o produto inteiro existe para denunciar. O botão diz para
onde a consulta vai antes de ir.

Link para explorador externo (`mempool.space/tx/<txid>`) só aparece se o usuário tiver
ligado alguma fonte pública no item 12, e com o mesmo aviso: clicar entrega o txid àquele
serviço.

Quando o adapter não souber responder, mostrar o que o log sabe e dizer que o resto não
foi consultado. **Não inventar** — é a regra da §6.3 da especificação.

### Contrato

```
GET /api/alerts/:id
  200 → { alert, event: {...} | null, wallet: {id,label}, confirmations, siblings: [...] }
  404 → alerta de outro usuário e alerta inexistente, com a mesma resposta

GET /api/tx/:txid?walletId=<id>
  200 → { txid, height, blockHash, confirmations, vin: [...], vout: [...], fee? }
  501 → tx.unsupportedByBackend    (o adapter não tem getTransaction)
  502 → tx.backendFailed           (o backend recusou; a mensagem traz o motivo)
```

### Arquivos

`backend/src/alerts/routes.ts` · `backend/src/chain/types.ts` (`TxDetail`,
`getTransaction`) · os três adapters · `backend/src/i18n/catalog.ts` ·
`frontend/src/components/AlertDetail.tsx` (novo) · `frontend/src/components/AlertFeed.tsx`

### Testes

- `alerts.test.ts`: o detalhe traz **o txid completo**, e não o truncado dos params — é
  o teste que prova que o join foi feito e ninguém tentou remendar a string
- `alerts.test.ts`: alerta sem `event_id` responde 200 com `event: null`
- `alerts.test.ts`: alerta de outro usuário responde igual a inexistente
- `alerts.test.ts`: confirmações contam a partir da ponta; altura nula é mempool
- `adapter`: cada um traduz a resposta do seu backend para o mesmo `TxDetail`
- `AlertDetail.test.tsx`: sem clicar no botão, **nenhuma consulta sai** — teste do espião
  de fetch, porque é exatamente a regressão que ninguém veria

**Pronto quando:** clicar num alerta abre o detalhe com o txid inteiro sem consultar
nada, e a busca na cadeia só acontece por clique.

---

# Item 6 — Paginação do feed

**Por quê.** `GET /api/alerts` devolve tudo, e o painel já passa de cinco mil pixels de
altura. Rolar o feed leva embora o que está no topo — foi por isso que a listra de
privacidade precisou ficar `sticky`, e o problema de fundo continua lá.

### Cursor, não OFFSET

Paginar por `OFFSET` numa lista que **recebe item novo pelo topo em tempo real** faz o
leitor ver o mesmo alerta duas vezes, ou pular um: cada alerta que chega empurra a
janela. O feed é empurrado por SSE, então isto não é hipótese.

Cursor keyset por `(created_at, id)`, decrescente. `id` desempata alertas do mesmo
instante — sem ele a paginação trava num laço quando dois alertas nascem no mesmo `now()`,
que é o caso comum, porque o worker grava vários no mesmo ciclo.

### Contrato

```
GET /api/alerts?limit=20&cursor=<opaco>&type=&severity=&walletId=&since=&until=
  200 → { items: [...], nextCursor: string | null }
```

`limit` padrão 20, teto 100. O cursor é opaco para o cliente (base64 de
`created_at|id`); tratá-lo como opaco é o que permite mudar a ordenação depois sem
quebrar cliente nenhum.

### Tela

- o feed do painel mostra a primeira página e um botão **carregar mais**
- alerta novo pelo SSE entra no topo **sem invalidar o cursor** — o cursor aponta para
  baixo, e o que chega por cima não o afeta
- a página `/alertas` (item 10) traz os filtros: tipo, severidade, carteira, período

### Testes

- `alerts.test.ts`: duas páginas de 2 em 5 alertas devolvem os 5, **sem repetir e sem
  pular**
- `alerts.test.ts`: **inserir um alerta novo entre a primeira e a segunda página não
  desloca a segunda** — é a falha silenciosa deste item
- `alerts.test.ts`: dois alertas com o mesmo `created_at` paginam sem laço
- `alerts.test.ts`: `limit` acima do teto é limitado, e não recusado
- `AlertFeed.test.tsx`: "carregar mais" acrescenta ao fim, e o SSE acrescenta ao começo

**Pronto quando:** o feed carrega 20 por vez e o teste de inserção no meio passa.

---

# Item 7 — Botões que pareçam botões

**Por quê.** Nas palavras do dono do projeto: *"botões mais desenhados, hoje são só texto,
não parece que são clicáveis"*. Está certo — `AddWallet`, `Dashboard`, `WalletCard` e
`Channels` usam `<button>` com classe de texto e cor de link. Ação sem affordance é ação
que ninguém encontra, e numa demonstração cronometrada isso custa o passo inteiro.

### Um componente, quatro variantes

`frontend/src/components/ui/Button.tsx`:

| variante | uso | forma |
|---|---|---|
| `primary` | a ação da tela (vigiar, salvar, analisar) | fundo `--sb-accent`, texto `--sb-bg` |
| `secondary` | ação de apoio | borda `--sb-border`, fundo `--sb-surface-raised` |
| `ghost` | ação terciária, dentro de lista | sem fundo até `:hover` |
| `danger` | apagar, arquivar | borda e texto `--sb-critical`; fundo só no `:hover` |

Tamanhos `sm` (altura 32px) e `md` (40px). Sempre: raio `--sb-radius`, `:focus-visible`
com o contorno que o `index.css` já define, `:disabled` com `opacity .4` e cursor
`not-allowed`, e transição só de cor.

**`type="button"` por padrão.** Sem isso, um botão dentro do `<form>` do `AddWallet`
submete o formulário ao ser clicado — bug esperando para acontecer, e é por isso que ele
merece teste.

Tokens novos em `tokens.css`, na camada semântica:
`--sb-accent-hover`, `--sb-surface-hover`, `--sb-critical-hover`, `--sb-focus`.

### A varredura

Trocar **todos** os `<button>` de texto puro. Arquivos com ocorrência hoje:
`Dashboard.tsx` (adicionar carteira, sair), `AddWallet.tsx` (modo, adicionar backend,
salvar backend, submeter), `WalletCard.tsx`, `Channels.tsx`, `Search.tsx`,
`UtxoTable.tsx`, `LangToggle.tsx`, `PrivacyPanel.tsx`.

Regra para conferir: **nenhuma ação clicável fica sem borda, fundo ou sublinhado.** Link
que navega continua link; ação que muda estado vira botão.

### Testes

- `Button.test.tsx`: `type="button"` por padrão; `disabled` não dispara `onClick`;
  a variante entra como `data-variant` para o teste enxergar
- `AddWallet.test.tsx`: clicar em "adicionar backend" **não submete o formulário**

**Pronto quando:** nenhum `<button>` com só `className="text-xs ..."` sobrou no
`frontend/src`, e o teste do formulário passa.

---

# Item 8 — Escala tipográfica: tirar o 11px da interface

**Por quê.** *"Algumas fontes parecem pequenas para ler"*. São: `--sb-text-xs` é
`0.6875rem` = **11px**, e é o tamanho de quase todo rótulo, do selo de privacidade, do
carimbo de data e do rodapé do feed. Onze pixels em monoespaçada, sobre fundo escuro, é
pequeno para quem tem a vista boa e inacessível para o resto.

### A escala nova

| token | hoje | passa a ser | onde |
|---|---|---|---|
| `--sb-text-xs` | 11px | **12px** (`0.75rem`) | só rótulo em caixa alta com `tracking-label` |
| `--sb-text-sm` | 13px | **14px** (`0.875rem`) | dado secundário, carimbo de data |
| `--sb-text-base` | 15px | **16px** (`1rem`) | corpo |
| `--sb-text-lg` | 18px | **20px** (`1.25rem`) | título de seção |
| `--sb-text-xl` | 24px | **26px** (`1.625rem`) | número grande |
| `--sb-text-2xl` | 40px | 40px | saldo total |

Prosa (`font-prose`) nunca abaixo de 14px, com `leading-relaxed`.

**Isto vai quebrar layout**, e é esperado: a `UtxoTable` tem colunas apertadas e o
cabeçalho da `Shell` tem selo, idioma, e-mail e sair na mesma linha. Conferir as duas na
tela depois de mudar, em 1280px e em 390px de largura. O item 9 refaz a grade do painel
de qualquer modo.

**Pronto quando:** `--sb-text-xs` é 12px, nenhum componente escreve tamanho literal, e a
`UtxoTable` e o cabeçalho continuam legíveis nas duas larguras.

---

# Item 9 — Layout: a barra da esquerda maior, o feed menor

**Por quê.** *"dá para diminuir o tamanho do live feed para a barra da esquerda ser
maior"*. Hoje: `grid lg:grid-cols-[460px_minmax(0,1fr)]` — a coluna do que se vigia é
fixa e estreita, e o feed fica com todo o resto. É o inverso do peso das duas: a esquerda
tem saldo, carteiras, busca, canais e cartões; a direita tem uma lista.

### A grade nova

```
lg:grid-cols-[minmax(0,1fr)_360px]
```

A esquerda cresce com a janela; o feed fica numa coluna fixa de 360px, e abaixo de `lg`
os dois empilham como já empilham. Com a paginação do item 6, 360px comportam o alerta em
duas linhas:

- linha 1: título, e a severidade como régua colorida à esquerda
- linha 2: corpo em uma linha, com reticências, e a hora
- clicar abre o detalhe do item 5, que é onde o texto inteiro cabe

Os cartões de carteira, com a coluna larga, passam a caber **dois por linha** em telas
grandes: `grid gap-4 xl:grid-cols-2` dentro da coluna esquerda.

**A listra e o selo não se movem.** Continuam na `Shell`, `sticky`, acima de tudo.

**Pronto quando:** em 1440px a coluna esquerda ocupa o espaço e o feed cabe em 360px sem
rolagem horizontal; em 390px nada vaza para fora da tela.

---

# Item 10 — Navegação: páginas, e o detalhe da carteira

**Por quê.** *"mais menus com mais páginas, por exemplo dando mais detalhes da
carteira"*. A limitação já estava escrita na especificação §12.2: *"a interface é de duas
telas; não há navegação nem menus; não há uma terceira tela para onde ir"*. Com fontes de
consulta, temas, preço, taxas e acessos externos, não cabe mais tudo numa coluna.

### Rotas

Usar `react-router-dom` v6. Rotas:

| rota | conteúdo |
|---|---|
| `/` | painel: saldo, carteiras, feed |
| `/carteiras/:id` | **detalhe da carteira** |
| `/alertas` | histórico com filtros e paginação |
| `/configuracoes` | fontes de consulta, canais de aviso, tema, preço, taxas, idioma |
| `/acessos` | acessos externos (item 13) |

Navegação lateral na `Shell`, sempre visível em `lg`, gaveta abaixo disso.

### O detalhe da carteira

Numa página, o que hoje está espremido no cartão, mais o que não cabia:

- rótulo (editável), `fingerprint`, tipo de script, rede, `kind`
- **fonte de consulta**, com o selo de exposição e o botão de trocar (item 3)
- estado de sincronização, altura, e o erro quando `degraded` — com o motivo à vista
- saldo, contagem de UTXO, congelados
- `UtxoTable` inteira, com coin control, tags e `dust` destacado
- `PrivacyPanel` com score, nota, achados e histórico
- **os alertas daquela carteira**, paginados
- exportar BIP-329
- arquivar e apagar (item 4)

### A regra que não pode quebrar

**Toda rota nova nasce dentro da `Shell`.** A listra de privacidade e o selo são o
princípio 2 do projeto — *o aviso é persistente, nunca um toast que some*. Uma rota que
se desenhe fora da `Shell` apaga o aviso sem ninguém perceber.

Teste: para cada rota, renderizar com uma carteira pública e afirmar que o elemento com
`data-posture="public"` está presente. É um teste chato e é exatamente o que segura a
tese do produto quando a interface cresce.

**Pronto quando:** as cinco rotas existem, navegar entre elas não recarrega a página, e o
teste de postura passa em todas.

---

# Item 11 — Temas: templates de cor, sem apagar o aviso

**Por quê.** *"usuário poder escolher quais cores a tela vai ter, com templates prontos"*.
O `tokens.css` já foi escrito para isso: são duas camadas, e o comentário no topo diz
*"trocar a paleta é mexer só na primeira"*. Um tema é um conjunto de valores para a
primeira camada.

### Como

`data-theme="<nome>"` no `<html>`; cada tema é um bloco `:root[data-theme="x"]` que
redefine **só a matéria-prima** e o `color-scheme`. A camada semântica não muda: nenhum
componente sabe que temas existem.

Temas a entregar:

| nome | o que é |
|---|---|
| `sett` | o atual — terra quente, escuro. Padrão |
| `bone` | claro, o mesmo vocabulário invertido |
| `carvao` | escuro neutro, sem croma na superfície |
| `contraste` | alto contraste, para acessibilidade; texto puro sobre fundo puro |

### A regra inviolável, e o teste que a segura

Em **todo** tema, o par texto/fundo cumpre WCAG AA (4.5:1 para corpo, 3:1 para texto
grande), e **`--sb-public` continua distinto de `--sb-sovereign`** — não só visível:
distinguível um do outro.

Isto merece teste automatizado, e é o teste mais importante deste item: um tema bonito que
deixe o aviso de explorador público apagado desmonta a tese do produto sem levantar
exceção nenhuma. `theme.test.ts` lê os tokens de cada tema, calcula o contraste relativo e
falha nomeando o par que não passou.

### Persistência

`localStorage` para o efeito ser imediato no carregamento (sem piscar), **e**
`user_preferences.theme` para o tema seguir a pessoa entre navegadores. O servidor manda
quando os dois discordam; o `localStorage` é cache.

**Pronto quando:** os quatro temas trocam pela tela, o `theme.test.ts` passa nos quatro,
e recarregar a página não pisca no tema errado.

---

# Item 12 — Altura da ponta, preço do BTC e estimativa de taxas

Três coisas diferentes, com posturas de privacidade diferentes. A decisão do dono do
projeto, em 27/08:

> *"A fonte pública de preço podemos usar mais de uma API pública e o usuário ativa ou
> não; a consulta deve ser só de preço. Sobre a fonte de taxas, o usuário pode escolher
> entre node local ou fonte externa, sempre dando a opção de desativar."*

### 12.1 Altura da ponta — sem custo nenhum de privacidade

Hoje o rodapé do feed mostra `feed.tip`, que é a **maior `sync_height` entre as
carteiras** — não a ponta da cadeia. Quando o worker está atrás, o painel anuncia uma
altura velha como se fosse a atual.

```
GET /api/chain/tip → { height, backendHost, isPublic, at }
```

Vem do backend que a instância já usa; nenhuma consulta nova a terceiro. Quando a
carteira está atrás da ponta, a tela mostra as duas: `319.578 · sua carteira em 319.560`.

### 12.2 Preço — desligado de fábrica, e só preço

```
GET /api/price?currency=BRL  → { currency, sources: [{id, price, at, error?}], median }
```

- fontes disponíveis: **CoinGecko, Kraken, Bitstamp, Coinbase, mempool.space**;
- **nenhuma ligada por padrão.** Ligar é escolha registrada em `user_preferences`;
- com mais de uma ligada, a tela mostra a **mediana** e as fontes por trás. Duas fontes
  discordando é informação, não erro;
- cache de 60 s no servidor. Sem cache, cada aba aberta é uma consulta.

**Três regras que precisam estar no código, não só aqui:**

1. **A requisição sai do backend, nunca do navegador.** Do navegador, cada usuário
   entrega o próprio IP à CoinGecko; do backend, é um IP só, e ele pode estar atrás de
   Tor. Num watchtower de privacidade a diferença é o produto inteiro;
2. **A consulta de preço não carrega identificador nenhum** — sem endereço, sem txid, sem
   `User-Agent` que nomeie a instância, sem parâmetro que identifique o usuário. Um teste
   afirma que a URL montada contém só o par de moedas;
3. **isto não acende a listra de exposição.** A listra é sobre endereços vigiados, e
   preço não vaza endereço. Inflar o aviso o transforma em ruído, e aviso que vira ruído
   deixa de ser lido — que é o oposto do princípio 2. A página de configuração explica,
   em prosa, o que cada fonte enxerga: que existe um servidor perguntando o preço, e o IP
   dele.

### 12.3 Taxas — nó, fonte externa, ou desligado

```
GET /api/fees → { source, blocks: { 1: sats_vb, 3: sats_vb, 6: sats_vb }, at }
```

| `feeSource` | de onde | disponível quando |
|---|---|---|
| `node` | `estimatesmartfee` para 1, 3 e 6 blocos | o backend da carteira é `core` |
| `mempool` | `https://mempool.space/api/v1/fees/recommended` | sempre |
| `off` | nada; a tela não mostra o painel | sempre — **é o padrão** |

Quando o usuário escolhe `node` e nenhum backend é `core`, a tela **diz por quê** em vez
de mostrar a opção morta: `fees.needsCoreBackend`.

`estimatesmartfee` responde em BTC/kvB. Converter para sat/vB é `valor * 1e8 / 1000`, e a
conversão passa pelo mesmo cuidado do `btcParaSats` — contar dígitos, não multiplicar
ponto flutuante. É o mesmo defeito da 21ª rodada, no mesmo formato.

### 12.4 Preferências do usuário

`backend/migrations/012_user_preferences.sql`:
```sql
CREATE TABLE user_preferences (
  user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme         TEXT NOT NULL DEFAULT 'sett',
  currency      TEXT NOT NULL DEFAULT 'BRL',
  price_sources TEXT[] NOT NULL DEFAULT '{}',   -- vazio = preço desligado
  fee_source    TEXT NOT NULL DEFAULT 'off' CHECK (fee_source IN ('off','node','mempool')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```
GET /api/preferences → as preferências, criando a linha padrão se não existir
PUT /api/preferences { theme?, currency?, priceSources?, feeSource? } → 200
```

Fonte desconhecida em `priceSources` é recusada nomeando as aceitas — array vindo do
cliente não vira URL sem passar por lista branca.

### Testes

- `price.test.ts`: **a URL montada não contém identificador** — só o par de moedas
- `price.test.ts`: sem fonte ligada, `GET /api/price` responde vazio e **não faz
  requisição nenhuma** (espião de fetch)
- `price.test.ts`: uma fonte fora do ar não derruba as outras; ela vem com `error`
- `price.test.ts`: o cache não repete a consulta dentro de 60 s
- `fees.test.ts`: `node` sem backend `core` responde `fees.needsCoreBackend`
- `fees.test.ts`: BTC/kvB vira sat/vB sem perder por arredondamento
- `preferences.test.ts`: fonte de preço desconhecida é recusada
- `chain.test.ts`: `/api/chain/tip` vem do adapter, e não da maior `sync_height`

**Pronto quando:** o painel mostra a ponta real; preço só aparece se alguém ligou; taxa
tem as três opções e a de nó explica quando não dá.

---

# Item 13 — Acessos externos: Tor, Tailscale, Cloudflare Tunnel

**Por quê.** *"menu para acessos externos, como o phoenixd-dashboard tem"*. O `CLAUDE.md`
já promete *"perfis opcionais para `ntfy` e `tor`"*, e o perfil de `tor` **não existe** no
`docker-compose.yml` — a promessa está no documento e não no código.

### O escopo, e a razão dele

Como logs e terminal de container ficaram fora de escopo, **o socket do Docker não é
montado**. Sem ele o painel não liga nem desliga container nenhum.

Então este item entrega **configuração e leitura, não controle**: os perfis do Compose que
sobem cada caminho, e uma página que mostra por onde o painel está acessível, lendo
variáveis de ambiente e arquivos montados read-only. Ligar e desligar é `docker compose
--profile tor up -d`, documentado no README.

Isso não é um recuo: um painel que se desliga sozinho é um painel que se tranca para
fora, e um painel que liga túnel sozinho é um painel que se publica sem ninguém mandar.

### Os três caminhos

| caminho | serviço | o que a página lê | o que ela precisa dizer |
|---|---|---|---|
| **Tor** | `tor` com hidden service para o `nginx` | `/var/lib/tor/hidden_service/hostname`, montado read-only | o mais soberano: ninguém no meio vê o tráfego nem o destino |
| **Tailscale** | `tailscale` com `TS_AUTHKEY` | hostname MagicDNS, do estado do container | rede privada; a Tailscale vê metadado de conexão, não o conteúdo |
| **Cloudflare Tunnel** | `cloudflared` com `TUNNEL_TOKEN` | hostname configurado em `CLOUDFLARE_HOSTNAME` | **a Cloudflare termina o TLS e enxerga o tráfego em claro** |

**A linha da Cloudflare é obrigatória e fica na tela, não numa nota de rodapé.** Publicar
um watchtower de privacidade atrás de um terminador de TLS de terceiro é uma escolha
legítima — e o produto inteiro existe para que escolhas assim sejam feitas sabendo. Um
painel que oferece o túnel sem dizer isso está fazendo com o próprio usuário o que denuncia
os exploradores públicos de fazerem.

```
GET /api/access → { tor: {enabled, onion?}, tailscale: {enabled, hostname?},
                    cloudflare: {enabled, hostname?, warning: true} }
```

Só leitura. O `.onion` aparece com QR code, para abrir no celular sem digitar 56
caracteres.

### Arquivos

`docker-compose.yml` (perfis `tor`, `tailscale`, `cloudflared`) ·
`services/tor/torrc` e `services/tor/Dockerfile` (novos) · `.env.example` ·
`backend/src/access/routes.ts` (novo) · `frontend/src/pages/Acessos.tsx` (novo) ·
`README.md`

### Testes

- `access.test.ts`: sem os arquivos montados, cada caminho responde `enabled: false` e
  **não quebra** — é o caso comum, quem não usa túnel nenhum
- `access.test.ts`: com um `hostname` falso montado, o `.onion` aparece
- `Acessos.test.tsx`: **o aviso da Cloudflare aparece sempre que o caminho está ligado**

**Pronto quando:** `docker compose --profile tor up -d` publica o painel num `.onion` que
abre, e a página nomeia os três caminhos com o que cada um enxerga.

---

# Fora de escopo, com a razão registrada

### Logs e terminal por container

Pedido, e recusado pelo dono do projeto em 27/08 depois de ver o custo.

Ambos exigem montar `/var/run/docker.sock` no backend. Quem alcança esse socket **é root
na máquina hospedeira** — pode subir um container privilegiado e sair para o host. Num
projeto que é **multi-usuário** e que o item 13 ensina a **publicar num túnel**, isso
transforma uma sessão de painel em execução remota de código na máquina de quem
hospeda — sem que nada na tela diga isso.

Fica registrado como pendência com a razão, e não como esquecimento. Se um dia voltar: só
leitura, só `docker logs`, atrás de `users.is_admin`, e por um proxy que permita esse
verbo e nenhum outro — nunca o socket cru.

---

# Ordem sugerida

A ordem é por valor na demonstração, e cada bloco deixa o projeto apresentável se o dia
acabar ali.

| # | Item | Por que nesta posição |
|---|---|---|
| 1 | **Item 1** — soberania provada contra o nó | fecha a pendência mais antiga, com o nó que já está na máquina. Nenhum outro item vale mais para o passo 5 do roteiro |
| 2 | **Item 7** — botões · **Item 8** — tipografia · **Item 9** — grade | três itens visuais, sem migração e sem API. Mudam a impressão da tela inteira em poucas horas |
| 3 | **Item 4** — arquivar e apagar | fecha um buraco que qualquer pessoa encontra em trinta segundos de uso |
| 4 | **Item 2** — catálogo de fontes · **Item 3** — trocar a fonte | juntos, porque o formulário do 2 é o que o 3 usa |
| 5 | **Item 6** — paginação · **Item 5** — detalhe do alerta | o feed vira usável e ganha profundidade |
| 6 | **Item 10** — navegação e detalhe da carteira | precisa dos anteriores para ter o que colocar nas páginas |
| 7 | **Item 12** — ponta, preço e taxas | valor visível, custo baixo, e a parte da ponta é quase de graça |
| 8 | **Item 11** — temas | o mais adiável: encanta e não desbloqueia nada |
| 9 | **Item 13** — acessos externos | depende de configuração de infraestrutura, que é o que mais atrasa perto do prazo |

**Parar no meio de um item é pior do que não começá-lo.** Se o tempo acabar, o certo é
fechar o item em andamento com o que dá, registrar no diário o que ficou, e não abrir o
próximo.
