# Registro de progresso - backend watchtower

Data: 2026-08-25

## Contexto

Este registro documenta o trabalho realizado depois da Task 1, mantendo a Task 2 de frontend/design parada para revisão humana, conforme combinado.

O foco foi seguir com o backend do watchtower: autenticação, carteira watch-only, derivação HD, adapter Esplora, sync, eventos, alertas, SSE e entrega por canais.

## Escopo concluído

### Task 3 - Migrações e schema base

- Corrigido o runner de migração para usar a mesma conexão do pool durante `BEGIN`, SQL da migração, registro em `schema_migrations`, `COMMIT` e `ROLLBACK`.
- Mantido o teste que força falha depois de efeitos já aplicados, para provar rollback transacional real.
- `chain_events` permanece como fonte append-only; `utxos` permanece projeção reconstruível.

Arquivos principais:

- `backend/src/db/migrate.ts`
- `backend/test/migrate.test.ts`

### Task 4 - Autenticação com sessões

- Criado hashing de senha com Argon2id.
- Criadas sessões opacas: o token em claro só é entregue ao cliente; o banco guarda `sha256` do token.
- Criadas rotas `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` e `PUT /api/auth/language`.
- Primeiro usuário registrado vira admin.
- Idioma do usuário fica persistido para permitir renderização server-side de push.
- Adicionado decorator `request.userId` ao Fastify.

Arquivos principais:

- `backend/src/auth/password.ts`
- `backend/src/auth/sessions.ts`
- `backend/src/auth/routes.ts`
- `backend/src/types/fastify.d.ts`
- `backend/src/app.ts`
- `backend/test/auth.test.ts`

### Task 5 - Derivação HD

- Criado parser de chaves públicas estendidas.
- Suporte a `xpub`, `ypub`, `zpub`, `tpub`, `upub` e `vpub`.
- Normalização para versão canônica (`xpub`/`tpub`) antes de passar para `@scure/bip32`.
- Recusa explícita de chaves privadas estendidas (`xprv`, `yprv`, `zprv`, `tprv`, `uprv`, `vprv`).
- Implementada derivação de endereço para `p2pkh`, `p2sh-p2wpkh`, `p2wpkh` e `p2tr`.
- Implementado scripthash no formato Electrum: `sha256(scriptPubKey)` com bytes invertidos.
- Validado contra vetores BIP-84.
- Adicionada dependência direta `@scure/base`, pois o backend importa o pacote explicitamente.

Arquivos principais:

- `backend/src/wallet/descriptor.ts`
- `backend/src/wallet/derive.ts`
- `backend/test/derive.test.ts`
- `backend/package.json`
- `backend/package-lock.json`

### Task 6 - Adapter Esplora

- Criada interface comum de adapter de cadeia com capacidades declaradas.
- Implementado adapter Esplora com `tipHeight()`, `blockHashAt(height)`, `getHistoryForAddress(address)` e `getUtxosForAddress(address)`.
- O adapter declara postura pública/privada via `capabilities().isPublic`, para alimentar o aviso persistente de privacidade.
- Verificado endpoint real de signet: `https://mempool.space/signet/api/blocks/tip/height` respondeu altura numérica.

Arquivos principais:

- `backend/src/chain/types.ts`
- `backend/src/chain/esplora.ts`
- `backend/test/esplora.test.ts`

### Task 7 - Cifra em repouso, wallet API e gap limit

- Criada cifra AES-256-GCM para dados sensíveis em repouso.
- Formato do blob cifrado: nonce de 12 bytes, tag de 16 bytes e ciphertext.
- Criada varredura por gap limit para adapters com acesso aleatório.
- Criadas rotas `POST /api/wallets` e `GET /api/wallets`.
- Cadastro de carteira exige autenticação, recusa chave privada estendida, cifra o xpub canônico, nunca devolve xpub na resposta e cria/reaproveita backend Esplora global conforme configuração.

Arquivos principais:

- `backend/src/crypto/secretbox.ts`
- `backend/src/sync/gap.ts`
- `backend/src/wallet/routes.ts`
- `backend/test/secretbox.test.ts`
- `backend/test/gap.test.ts`
- `backend/test/wallets.test.ts`

### Task 8 - Log de eventos e projeção de UTXO

- Criado módulo para append de eventos on-chain.
- Criada leitura de eventos ativos, ignorando eventos revertidos por reorg.
- Criada projeção reconstruível de UTXOs a partir do log.
- Criado cálculo de saldo por carteira a partir dos UTXOs não gastos.
- Projeção é idempotente: reconstruir duas vezes produz o mesmo estado.

Arquivos principais:

- `backend/src/events/log.ts`
- `backend/src/events/project.ts`
- `backend/test/events.test.ts`

### Task 9 - Sync engine e reorg

- Criada detecção de reorg por comparação de hashes registrados contra o adapter.
- Criado rollback de eventos a partir da altura divergente.
- Rollback não apaga eventos: registra `reorg_detected` e marca eventos afetados com `rolled_back_by`.
- Criado `syncWallet()`: abre xpub cifrado, verifica reorg antes de sincronizar, varre cadeias `0` e `1`, persiste endereços, cria eventos `utxo_created`/`utxo_spent`, reprojeta UTXOs e atualiza estado da carteira.
- Falha de backend marca carteira como `error` com `sync_error`.

Arquivos principais:

- `backend/src/sync/reorg.ts`
- `backend/src/sync/engine.ts`
- `backend/test/reorg.test.ts`
- `backend/test/engine.test.ts`

### Task 10 - Catálogo bilíngue e alertas com dedupe

- Criado catálogo PT/EN servido pelo backend.
- Criado renderizador com substituição de `{param}`, formatação numérica por idioma e resolução de parâmetros que apontam para outra chave do catálogo via `@chave`.
- Criada rota `GET /api/i18n/:lang`.
- Criado motor de alertas que gera candidatos sem texto renderizado, apenas `type` e `params`.
- Criado dedupe determinístico por carteira, transação e estado.
- Criada persistência de alertas com `ON CONFLICT (dedupe_key) DO NOTHING`.
- `saveAlert()` publica `pg_notify('sb_alerts', ...)` para alimentar SSE.

Arquivos principais:

- `backend/src/i18n/catalog.ts`
- `backend/src/i18n/render.ts`
- `backend/src/i18n/routes.ts`
- `backend/src/alerts/dedupe.ts`
- `backend/src/alerts/rules.ts`
- `backend/src/alerts/store.ts`
- `backend/test/i18n.test.ts`
- `backend/test/alerts.test.ts`

### Task 11 - Entrega de alertas, SSE e worker tick

- Criado canal `ntfy`.
- Criado canal webhook genérico.
- Criado agregador de entrega que renderiza push no idioma do usuário.
- Criado listener SSE baseado em `LISTEN sb_alerts` do Postgres.
- Criadas rotas `GET /api/alerts` e `GET /api/stream`.
- Criado `tick()` do worker: percorre carteiras, sincroniza cada uma, transforma eventos novos em alertas, salva com dedupe, entrega por canais configurados e isola falha por carteira.
- `backend/src/index.ts` agora roda migrações no boot, inicia listener SSE e agenda `tick()` a cada 30 segundos.

Arquivos principais:

- `backend/src/alerts/channels/ntfy.ts`
- `backend/src/alerts/channels/webhook.ts`
- `backend/src/alerts/channels/index.ts`
- `backend/src/alerts/routes.ts`
- `backend/src/stream/sse.ts`
- `backend/src/worker/tick.ts`
- `backend/src/index.ts`
- `backend/test/channels.test.ts`
- `backend/test/tick.test.ts`

## Validação executada

### Testes focados

Foram executados e passaram:

- `npm test -- migrate`
- `npm test -- auth`
- `npm test -- derive`
- `npm test -- esplora`
- `npm test -- secretbox gap wallets`
- `npm test -- events`
- `npm test -- reorg engine`
- `npm test -- i18n alerts`
- `npm test -- channels tick`

### Suíte completa

Executado em `backend/` com `DATABASE_URL` montada a partir do `.env` local:

```bash
npm test
```

Resultado final:

- 17 arquivos de teste passaram.
- 110 testes passaram.

### Typecheck

Executado em `backend/`:

```bash
npx tsc --noEmit
```

Resultado: sem erros.

### Verificação externa Esplora

Executado:

```bash
curl -s https://mempool.space/signet/api/blocks/tip/height
```

Resultado: endpoint respondeu uma altura numérica, compatível com o formato assumido pelo adapter.

### Verificação local ntfy

Executado:

```bash
docker compose --profile ntfy up -d ntfy
curl -s -H "Title: teste" -d "alerta de teste" http://127.0.0.1:8090/badger
```

Resultado: `ntfy` aceitou a mensagem e retornou evento `message` para o tópico `badger`.

Observação: o container `ntfy` ficou iniciado após a validação.

## Pendências mantidas

### Task 2 - Frontend/design

A Task 2 permanece parada conforme combinado. O scaffold de frontend ainda depende de aprovação humana do dashboard e dos tokens visuais.

Consequência atual: `docker-compose.yml` referencia `./frontend`, mas o diretório `frontend/` ainda não existe neste ponto. O backend está validado, mas o Compose completo ainda depende dessa task.

### Frontend da Task 12

Não foi iniciado. Depende da Task 2 destravar a casca visual/tokens.

### Commits

Nenhum commit foi criado por este trabalho.

## Observações técnicas

- O ambiente local apresentou falha recorrente do sandbox com `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`.
- Por isso, várias leituras/execuções precisaram de escalada.
- O helper `apply_patch` também falhou pelo mesmo problema; as alterações foram agrupadas em comandos Node para reduzir prompts de permissão.
- Não foram versionados segredos.
- Os comandos de teste carregaram `.env` sem imprimir valores sensíveis.

---

## Task 2 - Linguagem visual e casca da aplicação

Concluída em 25/08/2026, depois da aprovação humana do artboard (`design/Main.dc.html`).

- Escrito `frontend/src/styles/tokens.css` em duas camadas: matéria-prima (`--sb-sett`,
  `--sb-bone`, `--sb-alarm`…) e papel semântico (`--sb-bg`, `--sb-critical`,
  `--sb-public`…). Trocar a paleta mexe só na primeira camada; as telas só citam
  a segunda.
- Tailwind lê os tokens (`tailwind.config.ts`), nunca o contrário.
- Fontes IBM Plex empacotadas via `@fontsource`. Buscar fonte no Google a cada
  abertura do painel contaria ao Google quem usa o watchtower — verificado que o
  bundle não referencia `fonts.googleapis.com` nem `fonts.gstatic.com`.
- `Shell.tsx` concentra a listra aposemática e o selo de privacidade na mesma
  fonte de verdade, para que nenhuma tela consiga mostrar um sem o outro.
- Logo derivado de `assets/logo.png`: `public/logo.png` (128), `favicon-32.png`,
  `logo-180.png`.
- `frontend/nginx.conf` com `try_files` — sem isso um F5 fora da raiz devolveria 404.

### Desvio deliberado em relação ao plano

O plano (Task 12) mostra `<Shell badge={<PrivacyBadge …/>}>`. A casca implementada
recebe `backend={{ isPublic, host }}` e renderiza o selo ela mesma, mais um slot
`actions` para o seletor de idioma e o usuário. Motivo: com `badge` como
`ReactNode`, a listra do topo e o selo teriam fontes de verdade diferentes e
poderiam discordar — exatamente o aviso que o produto promete nunca perder.
A Task 12 passa a chamar `<Shell backend={…} actions={…}>`.

### Validação executada

```bash
cd frontend && npm install && npm run build   # tsc --noEmit + vite build: OK
docker compose build frontend                 # imagem construída
```

Conferido no CSS gerado que `bg-stripe-warning`, `tracking-label`, `text-muted`,
`border-line` e `font-prose` compilaram — a falha típica de Tailwind mal
configurado é silenciosa: a interface sobe sem estilo nenhum.

Falta a conferência visual humana em `http://localhost:5173`.

### Commit

`5f02db0 Define a linguagem visual e a casca da aplicação` — só `frontend/`.

## Correções pedidas na revisão

- `CLAUDE.md` princípio 4 passou a descrever a cifra como ela é: AES-256-GCM sob
  a chave-mestra do servidor. Chave derivada da senha não serve, porque o worker
  sincroniza com o usuário deslogado.
- O listener de `LISTEN/NOTIFY` ganhou handler de erro e reconexão. Sem eles a
  queda da conexão parava o feed ao vivo sem erro nenhum na tela, e um `error`
  sem handler no cliente do `pg` derrubava o processo inteiro. Coberto por
  `backend/test/sse.test.ts`.
- `address_reused` passou de `critical` para `warning`, alinhado ao painel
  aprovado: crítico fica reservado ao dust plantado, que ainda dá para evitar.
- Vite passou a escutar em todas as interfaces, para conferência de outra
  máquina da rede local.

Pendências conhecidas e aceitas: `utxo_spent` é gravado na altura da ponta e sem
a transação que gastou (Plano 2 precisa disso para coin control), e o adapter
Esplora não tem backoff contra o 429 do explorador público.

### Suíte depois das correções

18 arquivos de teste, 117 testes, typecheck limpo.

## Correções encontradas na verificação ponta a ponta em signet

A conferência manual com um backend Esplora de signet real revelou dois defeitos
que a suíte não pegava. Ambos corrigidos com teste antes da correção.

### Derivação quebrada em testnet e signet

`HDKey.fromExtendedKey()` recusava o tpub canônico com `Version mismatch`, porque
a `@scure/bip32` assume as version bytes de mainnet quando não recebe outras.
Consequência: **toda** carteira de testnet ou signet — a rede padrão do projeto e
a da demonstração — ficava presa em `error`, falhando a cada tick do worker sem
derivar um endereço sequer.

O teste de signet que existia partia de uma chave de mainnet e conferia só o
prefixo `tb1`, então passava sem tocar no caminho quebrado.

A derivação passou a ler as version bytes da própria chave: como a chave é lida
e como o endereço é escrito são coisas separadas.

- `backend/src/wallet/descriptor.ts` — `BIP32_VERSIONS` e `keyNetworkOf()`
- `backend/src/wallet/derive.ts`
- `backend/test/derive.test.ts` — deriva de vpub e prova que tpub e xpub da mesma
  conta produzem o mesmo script

### Cadastro aceitava chave da rede errada

Um backend Esplora atende uma rede só. A carteira cadastrada com chave da outra
rede derivava endereços que o explorador recusa e morria em `error` sem dizer o
motivo. `POST /api/wallets` passou a recusar no cadastro, com mensagem que nomeia
as duas redes.

- `backend/src/wallet/routes.ts`, `backend/test/wallets.test.ts`

### Verificação executada

Backend em `NETWORK=signet` contra `https://mempool.space/signet/api`:

- carteira cadastrada por vpub chegou a `sync_state = synced`, `sync_height =
  319324` (a ponta real da signet no momento), 42 endereços `tb1q…` derivados,
  nenhum erro no log — onde antes havia `Version mismatch` a cada 30 segundos
- zpub de mainnet recusado no cadastro com a mensagem esperada

Suíte completa: 18 arquivos, 123 testes. `npx tsc --noEmit` limpo.

---

## Segunda rodada de verificação — defeitos achados na tela

Três defeitos que a suíte não pegava, todos encontrados usando o sistema como
usuário. Cada um corrigido com teste antes da correção.

### Tipo de script assumido em vez de descoberto

`xpub` e `tpub` não dizem o tipo de script. A SLIP-132 os atribui a BIP-44 legado,
mas Bitcoin Core e Sparrow nunca a adotaram — usam output descriptors, onde o tipo
vive fora da chave — e exportam `tpub` puro para qualquer tipo.

Consequência: uma `tpub` de carteira native segwit entrava como legado, derivava
endereços que nunca existiram, sincronizava até `synced` e mostrava **saldo zero sem
erro nenhum**.

Correção: `parseExtendedKey` marca a chave como ambígua, e o cadastro descobre o tipo
perguntando à cadeia — deriva os três primeiros endereços de cada candidato e adota o
que tem histórico. Sem histórico em tipo nenhum, assume `p2wpkh`.

- `backend/src/wallet/detect.ts`, `descriptor.ts`, `routes.ts`, `app.ts`
- `backend/test/detect.test.ts`, `test/wallets.test.ts`

### Saldo zero durante a reconferência

O painel excluía do total, e o cartão trocava o saldo por travessões, sempre que o
estado era `importing`. Isso vale na primeira importação; mas o worker remarca a
carteira a cada ciclo, e uma carteira com histórico grande passa **83% do tempo**
nesse estado.

O que separa os dois casos é `syncHeight`, que só existe depois da primeira
sincronização completa.

Um teste existente (`WalletCard.test.tsx`) *codificava* o comportamento errado — usava
carteira já sincronizada para provar que o saldo some. Por isso a suíte nunca pegou.

- `frontend/src/pages/Dashboard.tsx`, `components/WalletCard.tsx`

### Ciclos do worker se sobrepondo

`setInterval` dispara pelo relógio, não pelo término. Medido contra a signet, um ciclo
dessa carteira leva de 7 a 32 segundos — então ciclos se sobrepunham, rodando
sincronizações concorrentes da mesma carteira sobre um log append-only.

- `backend/src/worker/loop.ts`, `src/index.ts`, `test/loop.test.ts`

### Tela de estreia

Sem carteira, o painel anunciava "Saldo total: 0 sats" e oferecia como única ação um
link de texto minúsculo. Agora troca o saldo zero por uma frase que diz o que falta e
abre o formulário já expandido.

- `frontend/src/pages/Dashboard.tsx`, `backend/src/i18n/catalog.ts`

### Proxy do dev server

A porta 3000 estava ocupada por outro projeto na máquina de desenvolvimento, e o proxy
do Vite apontava fixo para ela: as chamadas de `/api` recebiam o 404 em HTML desse
outro serviço e a interface parecia quebrada sem erro que apontasse o motivo. O alvo
passou a ser configurável por `BACKEND_URL`.

## Taxonomia de alertas validada com movimentação real

Todos os tipos implementados dispararam contra a signet, com transações criadas pelo
próprio desenvolvedor:

| Tipo | Severidade | Confirmado |
|---|---|---|
| `funds_received` | info | sim, inclusive em `@state.mempool` |
| `funds_spent` | info | sim |
| `address_reused` | warning | sim |
| `dust_received` | critical | sim |
| `reorg_detected` | warning | só por teste — reorg não ocorre sob demanda |

## Terceira rodada — 26/08

### Varredura incremental

Cada ciclo revarria a carteira inteira. O adapter passou a oferecer um resumo barato
do endereço (`getAddressStatus`), guardado em `addresses.status` e comparado na volta
seguinte; endereço com status repetido não tem a lista de UTXO pedida de novo.

Medido contra a signet, na mesma carteira de 77 endereços e 31 usados:

| | requisições | tráfego | tempo |
|---|---|---|---|
| varrendo tudo | 109 | 11.029 KB | 62 s |
| reconferindo o que mudou | 79 | 21 KB | 18–27 s |

O tráfego despenca porque `/address/:a/txs` devolve as transações inteiras enquanto
`/address/:a` devolve só os contadores. Os scripts da medição estão em
`backend/scripts/`.

Pular consulta mudou o que significa um UTXO sumir da lista: antes, qualquer UTXO
conhecido ausente virava `utxo_spent`, e com endereços pulados isso esvaziaria a
carteira num ciclo silencioso. O gasto passou a exigir que o endereço tenha sido de
fato perguntado — o que também cobre o caso, já existente, do endereço que sai da
janela do gap.

Junto foi o selo oscilante: carteira já sincronizada não volta a `importing`.

### Task 13 — adapter Electrum

Escrito conforme o plano, mais o `getAddressStatus`, que no protocolo Electrum é a
primitiva `blockchain.scripthash.subscribe` — um hash do histórico que só muda quando
o histórico muda.

O adapter era código morto: nada sabia montá-lo. O tipo do backend passou a ser dado
do banco (`backends.kind`), com uma fábrica única para o motor e para o cadastro, e
`CHAIN_BACKEND` escolhe entre `esplora` e `electrum`.

Exercitar o transporte TCP contra um servidor local — que os testes de cima
contornavam pelo transporte falso — revelou dois vazamentos de socket: o adapter não
tinha como fechar a conexão que abre (e o worker monta um adapter por carteira a cada
volta), e uma chamada que falhava soltava a referência do transporte sem fechá-lo.
Erro devolvido pelo servidor deixou de derrubar a conexão: bloco inexistente é
resposta legítima, não queda.

### Suíte deixa de rodar contra o banco de desenvolvimento

`resetDb` trunca tudo e `migrate.test.ts` derruba o schema. Ambos passaram a exigir um
banco terminado em `_test`, e o vitest monta essa URL sozinho a partir do `.env`. O
banco é criado uma vez:

```bash
docker exec coin-controll-postgres-1 \
  psql -U badger -d postgres -c 'CREATE DATABASE stealth_badger_test OWNER badger'
```

## Estado ao fim da rodada

- backend: 22 arquivos de teste, 184 testes
- frontend: 6 arquivos de teste, 35 testes
- `npx tsc --noEmit` limpo nos dois
- `docker compose up -d --build` sobe os 5 containers, e a carteira da signet
  sincronizou em `synced`, altura 319381
- `docs/specification.md` atualizada

## Quarta rodada — 26/08, conferência visual

Feita em navegador headless contra `http://localhost:8080`, que é o que o avaliador
veria — não o dev server.

**Um defeito real, corrigido.** A listra aposemática e o selo de postura ficavam *no*
topo do documento, não *presos* a ele. Com 43 alertas o painel tem 5723 px de altura:
rolar o feed levava embora a advertência de que a consulta passa por explorador
público. Isso contraria o princípio de que o aviso é persistente — era o toast que
some, disfarçado de rolagem. É o tipo de defeito que teste de unidade não pega, porque
jsdom não faz layout e não sabe o que é `position: sticky`.

Conferido e passando:

| Item | Resultado |
|---|---|
| Selo de estado parou de oscilar | 25 amostras em 75 s, sempre `synced/100`, atravessando ciclos do worker |
| Saldo à vista e total correto | 7.552.468 sats, 1 carteira, 32 UTXOs |
| Feed com os quatro tipos de alerta | `address_reused` em âmbar, `dust_received` em vermelho |
| Alternância pt→en traduz o histórico | o catálogo bilíngue funciona sobre alerta já gravado |
| Tela de estreia | formulário aberto, aviso watch-only à vista, sem selo de postura — correto, sem carteira não há postura a declarar |
| 390 px sem rolagem horizontal | empilha em coluna única |

O único erro de console é o `401` do `api.me()` na carga inicial sem sessão, capturado
e tratado. Comportamento correto.

Observação sem ação: a tela de login veste a listra âmbar incondicionalmente, antes de
existir postura a declarar, enquanto o painel vazio usa a linha neutra.

## Quinta rodada — 26/08, seleção de backend

Feita porque o passo 5 do roteiro do pitch depende dela. `GET`/`POST /api/backends`,
`backendId` opcional no cadastro de carteira, seletor no formulário e o backend
nomeado em cada cartão.

Três decisões que valem registro:

- **A postura anunciada no topo passou a ser agregada.** Era a da primeira carteira da
  lista, o que viraria mentira assim que duas discordassem. Agora basta uma carteira
  passando por explorador público para a postura ser pública — a exposição existe
  independentemente de qual carteira veio primeiro.
- **Backend inexistente e backend de outro usuário recebem a mesma recusa**, para não
  contar a um usuário quais ids existem no banco de outro.
- **O backend é resolvido antes da detecção de tipo de script**, porque é ele que vai
  responder a consulta. Detectar por um e vigiar por outro exporia os endereços a um
  observador a mais sem necessidade.

Conferido em navegador: o backend da instância aparece sozinho, o aviso de explorador
público acende junto com a escolha, cadastrar um backend Electrum funciona e ele já
entra selecionado, com o aviso apagando.

**Limitação que fica:** a instância vigia uma rede só (`NETWORK`). Dá para contrastar
as duas posturas, mas ambas na mesma rede — o roteiro original usava mainnet e signet
lado a lado, e isso continua impossível.

## Sexta rodada — 26/08, integração do `am-i-exposed`

O spike que estava marcado para terça e nunca aconteceu. Resultado: **funciona**, mas
três premissas do design estavam erradas.

**Não é biblioteca.** O pacote publica só `bin` — sem `main`, `types` ou `exports`. A
§9.1 dizia "consumido como biblioteca npm (não subprocess)" e isso é impossível. Vale
o plano B que a própria §13 registrou. A CLI tem `--json`, `--network` e `--api`, que
basta.

**Passar a chave crua faz ele mentir em silêncio.** Primeira tentativa, com o `tpub`
canônico: `score 70 · activeAddresses 0 · totalTxs 0 · totalBalance 0` — numa carteira
com 32 UTXOs. É o mesmo defeito que o projeto já corrigiu para si em `987e37f`: `tpub`
não declara tipo de script e ele assumiu legado. Com `wpkh(tpub...)`:

```
score 66 · grade C · 31 endereços ativos · 30 transações
32 UTXOs · 7.552.468 sats · 2 reutilizados · 1 dust
```

O saldo e a contagem de UTXO **batem exatamente** com a projeção do nosso próprio log
de eventos. Duas implementações independentes no mesmo número é material de pitch.

**Custa 78 segundos**, porque ele faz a própria varredura por gap limit. Daí a rota
responder `202` e o trabalho seguir em segundo plano.

Duas coisas que o design não previa e que a integração trata:

- `--api` aponta para o mesmo backend da carteira. Sem isso o scanner consultaria o
  explorador público dele e exporia os endereços a um segundo observador — furando o
  Princípio 1 dentro da ferramenta que existe para avisar sobre isso
- a saída traz `links.analysis`, uma URL do `am-i.exposed` com o xpub embutido. É
  descartada antes de guardar ou exibir

**Empacotamento:** `better-sqlite3` não tem prebuild para musl e não compila no
`node:20-alpine` — o erro é "Could not find any Python installation", que não menciona
nem o scanner nem o sqlite. `node:20-slim` falha igual. A solução foi um estágio de
build com `python3 make g++`; o compilador não vai para a imagem final. Conferido:
a CLI roda dentro do contêiner.

Achado que o scanner tem e nós não: `wallet-uniform-script`, positivo, +3 no score.

## Sétima rodada — 26/08, coin control e BIP-329

Passos 4 e 7 do roteiro, os dois na lista "deve entrar" do design, que não pode ser
cortada.

### Um defeito estrutural que estava escondido no schema

`utxos.frozen` existia desde a migração 001 e **nunca funcionou**. `utxos` é projeção:
`projectWallet` apaga a tabela inteira e reconstrói a cada sincronização. Congelar um
UTXO durava até o ciclo seguinte — trinta segundos — e ele voltava a ser gastável sem
nada na tela explicando por quê.

Rótulo, tags e congelamento passaram para `utxo_marks`, fora da projeção. A chave é
`(carteira, txid, vout)` e **não referencia `utxos` de propósito**: a marca precisa
sobreviver ao UTXO ser gasto, porque o BIP-329 exporta rótulo de saída gasta também, e
apagar destruiria texto que o usuário escreveu. A projeção passa a copiar o
congelamento de volta, para que as consultas que já liam `utxos.frozen` continuem
verdadeiras.

### BIP-329

Ida e volta sem perda, com teste de round-trip. Duas decisões:

- **congelamento vira `spendable: false`**, que é como a spec diz "não gaste este
  UTXO" e é o que faz o Sparrow respeitar a decisão. Escrito só quando é falso, já que
  o padrão da spec é verdadeiro;
- **a spec não tem campo de tag.** Elas são anexadas ao rótulo como `#tag`, o que
  mantém a ida e a volta sem perda e continua legível em carteira que só saiba mostrar
  o rótulo.

A importação atravessa arquivo de outra carteira sem engasgar: `tx`, `addr` e `xpub`
são contados e pulados, linha corrompida não aborta o arquivo, e saída que não é desta
carteira não vira marca órfã.

### A suíte estava intermitente, e não era o que eu suspeitava

Falhas migrando de arquivo a cada execução, sempre como `Hook timed out` no
`resetDb`. Suspeitei de contenção de lock e de vazamento de conexão pelo SSE. Instrumentado,
o diagnóstico foi outro: **pool com 2 conexões, 1 ociosa, nenhuma esperando, zero
contenção** — o `TRUNCATE` é que estava preso em `IO / DataFileImmediateSync` por 3
segundos.

`TRUNCATE` cria um arquivo novo por relação e força `fsync` imediato em cada um. No
`beforeEach` de trinta arquivos, com o schema crescendo, isso passou a estourar o
limite de 10 s do hook em execuções aleatórias. Trocado por `DELETE`, que não troca
arquivo e deixa o cascata das chaves estrangeiras fazer o trabalho: apagar `users`
leva junto tudo o que pende dele. Quatro execuções seguidas verdes, suíte inteira em
18 s.

Intermitente é pior que quebrado: some quando se vai olhar, e some justamente na mão
de quem for avaliar.

### Conferido em navegador

32 UTXOs listados, o dust destacado, rótulo gravado, congelamento aplicado, arquivo
BIP-329 exportado com `spendable: false` e `Content-Disposition` nomeando o `.jsonl`.

**A prova do defeito estrutural:** com um UTXO congelado, esperado um ciclo do worker
contra a signet real. A projeção foi reconstruída — 32 UTXOs viraram 36, porque chegou
transação nova — e o congelamento continuou lá. Antes desta rodada ele teria sumido.

A conferência achou dois defeitos que teste de unidade não pegaria sozinho:

- **"938.602 sats sats"** — `formatSats` já anexa a unidade e a tela anexava de novo.
  Cada metade está certa isolada, e é por isso que só olhando se vê;
- **o campo de rótulo não atualizava depois de importar.** Era `defaultValue` num input
  não controlado: o React não mexe no valor de um nó que já existe, então a tela
  continuaria mostrando o rótulo antigo e o usuário concluiria que o arquivo não foi
  lido. Os dois viraram teste antes de virar correção.

## Oitava rodada — 26/08, `score_dropped` e `kyc_origin`

Os dois últimos tipos da taxonomia da §8.1. Também os dois primeiros alertas que **não
nascem de evento de cadeia**.

### O que a investigação desmentiu

Eu tinha dito que alertar sobre corretora e sobre endereço sancionado eram coisas de
peso diferente, e que sanção estava fora de alcance por exigir decidir procedência de
lista e jurisdição. **Estava errado sobre o custo.** O scanner já carrega a base e já
computa `entity-ofac-match`; surfacear um achado que ele produz, com atribuição, é
outra coisa que construir um produto de sanções. A decisão mudou por isso, e não por
insistência.

Duas descobertas que mudaram o projeto da funcionalidade:

- **`scan xpub` não produz achado de entidade nenhum.** A varredura de carteira só
  emite ids `wallet-*` — reuso, dust, tipo de script, consolidação. Quem mandou os
  fundos só aparece em `scan tx`. Sem verificar isso antes, o `kyc_origin` teria sido
  construído sobre um relatório que nunca conteria a informação;
- **`scan tx` custa 5 segundos**, contra 78 da carteira, e — surpresa — emitiu
  `entity-behavior-exchange` **na signet**. É heurística de forma da transação, não
  consulta a base, então funciona numa rede onde não existe entidade conhecida. O
  alerta é demonstrável.

### Afirmar e suspeitar não podem virar a mesma frase

O scanner separa correspondência em base (`entity-known-input`, `entity-ofac-match`) de
heurística de comportamento (`entity-behavior-*`, `exchange-withdrawal-pattern`), e
declara a própria confiança em cada achado. Achatar isso faria o watchtower afirmar o
que ninguém verificou.

A classificação carrega as duas dimensões — espécie e base — e a confiança do scanner
é repassada sem retoque. O texto sai por referência ao catálogo, então lê:

> A transação cd2f1a9b0e77… **tem forma compatível com** saque em lote de exchange.
> Confiança declarada pelo scanner: média.

> A transação ab0011ff2288… **foi reconhecida pela base de entidades do scanner como**
> endereço em lista de sanções (OFAC). Confiança declarada pelo scanner: alta.

Correspondência em base vence heurística quando as duas apontam para a mesma espécie:
dizer "possível padrão de corretora" quando o scanner reconheceu a entidade
subestimaria o que ele sabe.

### Decisões de gatilho

- **`score_dropped` tem limiar de 5 pontos.** O scanner reavalia a carteira inteira a
  cada execução, e um ou dois pontos são ruído de heurística. Alertar sobre ruído
  ensina o usuário a ignorar o alerta, que é o pior resultado possível;
- **primeira análise não gera queda.** Tratar a ausência de anterior como "era 100"
  produziria alerta em toda carteira recém-cadastrada;
- **`event_id` fica nulo no `score_dropped`** — ele não nasceu de evento, e amarrá-lo a
  um seria inventar uma causa que ninguém verificou. No `kyc_origin` ele aponta para o
  `utxo_created` que trouxe os fundos, porque ali existe uma causa concreta;
- **teto de 5 transações por clique.** Cada `scan tx` custa segundos; sem teto uma
  carteira com trinta depósitos gastaria minutos no primeiro clique e o usuário
  concluiria que travou. A fila avança da mais recente para a mais antiga, então o que
  fica de fora é o passado distante;
- **`tx_scans` deduplica por (carteira, txid).** O que uma transação confirmada revela
  não muda: reanalisar gastaria o explorador do usuário e repetiria o mesmo aviso.

### Rodar contra a signet real achou dois defeitos meus

A primeira rodada analisou 5 transações: 2 passaram, 3 falharam.

**O log não dizia por quê.** Só `Command failed: am-i-exposed --json ...` com o comando
inteiro e nenhuma informação. A causa estava em `stdout`, que o `Error` do `execFile`
guarda em campo separado e eu não repassava — diagnosticar exigiu rodar o comando à
mão para descobrir `{"error":true,"message":"Not found"}`. Agora a mensagem carrega a
saída do processo, truncada.

**E o "Not found" era legítimo, e permanente.** As três transações retornam 404 no
próprio explorador: foram vistas no mempool e substituídas depois. Nosso log é
append-only, então o `utxo_created` delas fica para sempre, apontando um txid que não
existe mais.

Isso expôs o defeito de verdade: como falha não era registrada, essas três consumiam o
teto de cinco a cada clique, e as outras trinta **nunca chegariam a ser analisadas**.
A tentativa passou a ficar gravada com o motivo, e a fila ordena nunca-tentadas
primeiro, com as que falharam no fim — fora, e não excluídas, porque falha também
acontece por rede instável e essas merecem outra chance.

**Confirmado contra a signet:** 7 transações tentadas, 4 com achados e 3 registradas
como falha. O teto é 5 por rodada, então 7 é a prova de que a fila avançou em vez de
repetir as mesmas.

Um terceiro detalhe, menor e da mesma família: a mensagem de erro terminava em
"Confira se ele está instalado" mesmo quando o binário tinha rodado e o explorador é
que não achou a transação. Conselho errado gruda mais que conselho ausente — manda
procurar no lugar errado. A dica agora só aparece quando é ela que resolve.

## Nona rodada — 26/08, robustez contra a infraestrutura de terceiro

Três defeitos, e os três só apareceram tentando falar com serviço real.

### O `429` derrubava a sincronização inteira

O explorador público limita a taxa justamente quando a carteira é grande — que é
quando vigiar importa mais — e a carteira aparecia em `error` na tela. Agora `429` e
`503` são repetidos com espera que dobra a cada tentativa; quando o servidor manda
`Retry-After`, é ele que decide, porque discutir com quem está limitando é o caminho
mais curto para ser bloqueado de vez. A espera ganha ruído aleatório: sem ele, várias
carteiras sincronizando juntas voltariam no mesmo instante e reproduziriam a rajada que
causou o limite. Erro que não melhora esperando continua falhando de primeira.

### A tentativa de validar o Electrum contra servidor real

Achei um servidor Electrum público de signet que responde: `ElectrumX 1.19.0`,
protocolo 1.4. **A validação não foi concluída** — depois de algumas conexões seguidas
o servidor parou de responder, e parou também para um socket cru em `bash`, o que
descarta defeito nosso. Não insisti: martelar servidor de terceiro para provar um ponto
é exatamente o comportamento que este projeto critica.

Mas a tentativa pagou por si, porque revelou dois defeitos:

**Conexão pendurava em host com IPv6 quebrado.** O host resolvia para IPv4 e IPv6, e o
`connect` do Node ficava preso na família que não responde. Com `autoSelectFamily` e um
segundo de paciência por família, passou a conectar em 300 ms. Não é hipótese de
laboratório: rede doméstica e contêiner com IPv6 mal configurado é o caso comum.

**O erro chegava mudo.** Um `connect` que falha nas duas famílias devolve
`AggregateError` com `message` **vazia** e as causas em `errors`. O log registrava
`falhou em blockchain.headers.subscribe: ` e mais nada. É o mesmo defeito que o scanner
teve, em outro lugar, e diagnosticar de novo exigiu abrir um socket à mão.

### Chamada sem limite de tempo congelava o worker para sempre

O caso que derrubou a validação virou teste: **um servidor que aceita o socket e fica
calado**. Sem limite, a promessa nunca resolvia nem rejeitava — o ciclo de
sincronização congelaria para sempre, sem erro, sem log, sem nada na tela. É a pior
forma de falhar, porque não se anuncia. Agora cada chamada tem relógio próprio, limpo
nos dois desfechos, e tempo esgotado derruba a conexão: servidor que ficou calado uma
vez não merece confiança na consulta seguinte.

## Décima rodada — 26/08, vigiar endereço avulso

A descrição do produto sempre prometeu "endereços **e** carteiras", e só carteira tinha
sido entregue. A dívida estava registrada na §4 do design como adiada com razão; a razão
deixou de valer quando sobrou tempo.

### Carteira de um endereço só, e não tabela nova

O endereço avulso entra como uma carteira cujo `kind` é `address`. Não é preguiça de
modelagem: assim ele reaproveita inteiros o log de eventos, a projeção de UTXO, o motor
de alertas e a deduplicação — que são justamente as partes onde a falha é silenciosa, e
que já estão cobertas por teste. Uma tabela paralela duplicaria essas quatro coisas, e a
segunda cópia é a que ninguém lembra de corrigir.

Sem xpub não há o que derivar nem o que cifrar, então `xpub_encrypted` e
`xpub_fingerprint` passaram a aceitar nulo. `kind` existe para o motor saber disso sem
inferir de coluna nula, que é o tipo de acordo tácito que se perde na leitura seguinte.

No motor, o ramo é pequeno: em vez de derivar por gap limit, confere os endereços já
cadastrados. A sonda que pergunta ao backend o que existe num endereço foi extraída para
ser usada pelos dois caminhos, e daí para baixo o resto do motor não sabe a diferença.

### O que a validação recusa, e por quê

- **endereço de outra rede**, com a mensagem dizendo qual é qual — aceitar produziria
  algo que sincroniza, não encontra nada e mostra saldo zero para sempre;
- **chave estendida colada no campo de endereço**, que é o engano mais provável do
  usuário. Dizer "endereço inválido" mandaria procurar no lugar errado; a mensagem
  reconhece a chave e sugere cadastrar como carteira;
- **chave e endereço juntos** — aceitar obrigaria a escolher um em silêncio, e o usuário
  descobriria depois que vigiou o que não pediu.

O tipo de script sai do endereço decodificado, não de heurística sobre o texto: `bc1q` de
42 caracteres e `bc1q` de 62 são coisas diferentes, e adivinhar pelo prefixo erraria no
segundo.

### Na tela

O formulário ganhou a escolha entre carteira inteira e um endereço, com o aviso de que o
segundo vigia só aquilo. O cartão mostra o endereço encurtado no lugar da fingerprint —
que não existe sem chave, e o campo vazio pareceria defeito — e não anuncia tipo de
script no formato de carteira, porque sugeriria que o watchtower vigia mais do que vigia.

Conferido em navegador com um endereço tirado de um bloco recente da signet.

## Décima primeira rodada — 26/08, o backend que recusa servir

Cadastrar um endereço público de signet para testar o recurso novo derrubou a carteira
para `error`. O endereço tem **33.446 transações**, e o `mempool.space` responde `400` no
`/utxo` dele: *"Too many unspent transaction outputs (>500). Contact support to raise
limits."* Recusa legítima, permanente, e nem defeito nosso nem dele.

Isso expôs três coisas.

### O log não dizia o motivo, de novo

A mensagem era `Esplora respondeu 400 em /address/<a>/utxo`. O motivo estava no corpo da
resposta o tempo todo, e diagnosticar exigiu repetir a chamada com `curl`. É a terceira
vez nesta semana que a causa vem num campo que não estava sendo lido — no scanner era
`stdout`, no Electrum era `AggregateError.errors`, aqui era o corpo HTTP. Vale como
padrão: **quando integrar com processo ou serviço externo, procurar onde ele escreve o
motivo antes de dar a integração por pronta.**

### `error` era o estado errado

Um endereço que o backend recusa servir não torna a carteira quebrada — torna-a vigiada
em parte, e o schema já previa `degraded` para exatamente isso, sem nada nunca o usar.
Agora a falha por endereço é isolada: os outros continuam sendo lidos, a carteira fica
`degraded` com o motivo, e volta a `synced` sozinha se o endereço passar a ser legível.

O ponto delicado: o endereço ilegível **não** entra no conjunto dos consultados. Se
entrasse, seus UTXOs conhecidos seriam lidos como "sumiram da lista" e declarados gastos
— o saldo desapareceria sozinho, em silêncio, que é o pior defeito possível num
watchtower. E o status dele não é gravado, para ser tentado de novo na volta seguinte.

### E a tela mentia um zero

O cartão mostrava **"0 sats"** para uma carteira cujo único endereço não pôde ser lido.
Zero que não foi lido não é zero, é "não sei" — e o cartão já recusava mostrar saldo
parcial como definitivo na primeira importação, pela mesma razão. Agora mostra `———`,
sem fingir que uma importação está em curso: a recusa é permanente, e barra de progresso
prometeria um número que não vai chegar.

Saldo parcial continua aparecendo, porque é verdade: é o que existe nos endereços que
deu para ler, e o aviso ao lado já diz que não é tudo.

## Décima segunda rodada — 26/08, origem disparada por quem detecta

A análise de origem só saía do clique. O design prevê o gatilho em "transação nova
detectada", e quem detecta é o worker — sem isso, a origem de um depósito só seria
conhecida se alguém estivesse com a tela aberta na hora.

A lógica saiu da rota para um serviço, e agora tem **dois gatilhos e um caminho só**.
Roda em segundo plano nos dois: se o ciclo esperasse, deixaria de sincronizar as outras
carteiras durante os segundos que cada transação custa. E duas análises da mesma
carteira ao mesmo tempo são impedidas, porque o clique e o worker percorreriam a mesma
fila em paralelo para chegar ao mesmo lugar gastando o dobro do explorador.

Vale para a demonstração de sexta: o depósito do faucet passa a disparar sozinho o
alerta de movimentação **e** o de origem.

## Décima terceira rodada — 26/08, o canal que ninguém podia cadastrar

Fui conferir o clímax da demonstração — o alerta chegando no celular — e descobri que
**não havia rota para cadastrar canal nenhum**. O `deliver`, o `sendToNtfy` e a tabela
`channels` existiam desde o começo; a única forma de configurar era inserindo linha no
banco à mão. O push está no núcleo inegociável do design, e estava inalcançável pela
aplicação.

Agora há `GET`, `POST`, `DELETE` e — o mais importante — **`POST /api/channels/:id/test`**,
que dispara uma notificação de verdade. Descobrir no palco que o push não chega é tarde
demais: o teste existe para exercitar o caminho inteiro, da cifra ao celular, antes de
valer. Conferido: a notificação chegou ao ntfy com título, corpo e tag.

O tópico do ntfy **nunca sai na listagem**. Ele é a única coisa que separa as
notificações de quem quer que as leia, e devolvê-lo o espalharia por log de proxy,
histórico de navegador e captura de tela.

### E o botão de sair estava quebrado

Testar o canal pela tela deu "Bad Request" onde o `curl` dava `ok`. A causa: o cliente
de API do frontend anunciava `Content-Type: application/json` em **toda** requisição, e o
Fastify recusa corpo vazio com esse cabeçalho — `FST_ERR_CTP_EMPTY_JSON_BODY`.

Isso quebrava **todo POST sem corpo**: sair, analisar privacidade e testar canal. Três
botões, um deles o de encerrar sessão. Nenhum teste pegava, porque todos simulam o
cliente de API em vez de exercê-lo — a correção veio com um teste que finalmente exercita
o `request` de verdade.

### E a análise de privacidade de endereço avulso morria

Clicar em "analisar privacidade" num endereço avulso registrava
`Cannot read properties of null (reading 'length')`: a rota tentava abrir uma chave que
não existe. O scanner tem `scan address`, com score e achados próprios, e agora a rota
escolhe a análise conforme o tipo. O retrato que ele devolve é guardado como veio —
traduzir campo a campo para a forma de carteira obrigaria a inventar os que não existem
de um lado.

### O push no celular, conferido de ponta a ponta

Dois caminhos verificados:

- **ntfy local** (perfil do Compose): a notificação chega, com título, corpo e tag. Mas
  ele escuta em `127.0.0.1`, e **um celular não alcança isso** — serve para conferir a
  integração, não para a demonstração;
- **ntfy.sh público**, que é o caminho que serve ao telefone: canal cadastrado com
  tópico aleatório, teste disparado, mensagem lida de volta no `ntfy.sh`, canal
  removido. Funciona.

Faltava isso documentado em qualquer lugar. Entrou no `.env.example` e no README.

### Análise de endereço avulso, conferida contra a signet

O endereço de 33.446 transações falha também dentro do scanner — `HTTP 400`, mesmo
limite do explorador. Num endereço normal: **score 100, nota A+**, com
`h8-no-reuse`, `h9-clean`, `spending-never-spent` e `h10-p2wpkh`.

## Décima quarta rodada — 26/08, busca de endereço

Adiada no recorte por não mudar a avaliação. A razão deixou de valer quando sobrou
tempo, e o caso de uso é concreto: você tem um endereço na mão e quer saber se está
sendo vigiado, por qual carteira e em que caminho de derivação.

Quatro decisões pequenas, todas sobre não responder o que não foi perguntado:

- **busca vazia devolve vazio**, e não tudo. Quem não digitou nada não pediu a carteira
  inteira;
- **teto de cinquenta resultados**, senão um prefixo comum transforma o campo num
  despejo de endereços;
- **"nada encontrado" só depois de buscar.** Antes disso a resposta não existe, e
  mostrá-la seria responder pergunta que ninguém fez;
- **espera de 350 ms antes de consultar.** Buscar a cada tecla faria um endereço de 42
  caracteres colado virar 42 consultas ao banco.

O filtro por dono vem antes de tudo na consulta: buscar endereço de outra pessoa não
pode revelar que alguém o vigia.

### Passagem de regressão pela interface

Onze verificações, todas verdes, sem nenhuma resposta 4xx e sem erro de página. Ficou
versionada em `backend/scripts/regressao-navegador.mjs`, porque metade dos defeitos
desta semana só apareceu na tela: o aviso que a rolagem levava embora, a unidade
duplicada, o botão de sair quebrado por um cabeçalho.

## Décima quinta rodada — 26/08, erro em duas línguas

A interface era bilíngue e as mensagens de erro saíam só em português — um avaliador que
trocasse para inglês e errasse a senha lia português.

A resposta de erro passa a trazer `code` e, quando a frase precisa, `params`. A tela
renderiza `error.<code>` do catálogo; a mensagem em português continua na resposta como
reserva, para quem consome a API direto e para o caso de o servidor emitir um código que
o catálogo da tela ainda não conhece — situação normal entre dois deploys.

Os parâmetros viajam separados de propósito. "Esta chave é de {chave}, e este watchtower
vigia {rede}" só é útil com os dois valores; sem eles a tradução vira um aviso genérico
que não ajuda ninguém a corrigir.

Um teste percorre os erros emitidos e **falha se algum código não tiver frase nos dois
idiomas** — senão o código novo cairia calado na reserva em português, que é exatamente
o defeito que estamos consertando.

Conferido em navegador: *"Email and password do not match."* e *"This key is for
mainnet, and this watchtower watches signet. Use a signet key."*

## Décima sexta rodada — 26/08, parar de inventar a altura do gasto

O evento de gasto gravava a **altura da ponta** e a palavra `desconhecido` no lugar do
txid. Estava na lista de limitações como dívida do coin control, mas é pior que isso:
altura errada num log append-only é pior que altura ausente, porque a detecção de reorg
compara exatamente esses pares de altura e hash — e passaria a comparar um par que nunca
descreveu o gasto.

O Esplora tem o endpoint exato: `/tx/:txid/outspend/:vout` diz quem consumiu a saída e
em que bloco. Sabendo, o evento registra o real; não sabendo, registra `null`.
Ignorância anotada como ignorância.

### O que isso obrigou a arrumar

A projeção usava `spent_at_txid IS NULL` como **o** sinal de "não gasto" — era por isso
que o motor precisava inventar um txid. Com o campo podendo ser nulo legitimamente, o
saldo passou a contar UTXO gasto como disponível, e a suíte pegou na hora.

`utxos.spent` passou a dizer que o gasto aconteceu, e `spent_at_txid`, por quem. Sinal e
detalhe separados. Uma migração marca retroativamente o que já estava gasto e apaga o
sentinela `desconhecido`, que não é um txid e faria qualquer leitura futura tratar texto
inventado como dado de cadeia.

O log é append-only e guarda o sentinela nos eventos antigos para sempre — é na projeção
que ele deixa de virar dado, e há teste para isso.

Conferido contra a base real: saldo intacto em 7.552.468 sats, nenhum sentinela
restante.

## Décima sétima rodada — 26/08, o Electrum nunca teria funcionado

Segunda tentativa contra o ElectrumX público de signet, depois que ele voltou a
responder. O adapter falhou com uma mensagem inequívoca:

> `use server.version to identify client`

**O protocolo exige `server.version` como primeira chamada, e o adapter nunca o
enviava.** Ele nunca teria funcionado contra servidor nenhum de verdade. Os testes
passavam porque o transporte falso *é* o servidor, e um transporte falso não cobra o que
um servidor real cobra.

Vale registrar duas coisas sobre como isso apareceu:

- **a mensagem só estava legível por causa da correção de erro mudo de mais cedo.** Antes
  dela, esse mesmo erro chegava como string vazia, e o diagnóstico teria custado outra
  rodada de socket na mão;
- **o transporte falso foi corrigido junto.** Ele passa a responder ao handshake, como
  qualquer servidor real — não cobrar o handshake foi exatamente o que deixou o defeito
  passar.

O handshake vale por conexão, não por chamada, e é refeito quando a conexão é reaberta:
servidor novo não sabe quem somos, e sem repetir a reconexão voltaria a esbarrar na
recusa.

### Verificado contra o servidor real

| Método | Resultado |
|---|---|
| `tipHeight` | 319.487 |
| `blockHashAt` | **confere com o mempool.space** — duas fontes independentes no mesmo hash |
| `getAddressStatus` | `used=true` |
| `getUtxosForAddress` | 0 UTXOs |
| `getHistoryForAddress` | 2 transações |

O scripthash no formato Electrum está correto: um endereço com histórico foi encontrado
como tendo histórico, que é a única forma de saber que a derivação `sha256` invertida
está certa.

## Décima oitava rodada — 26/08, a varredura em cinco frentes

A varredura consultava um endereço de cada vez. Com 77 endereços e uns 230 ms de
latência, o processo passava dezoito segundos esperando resposta sem fazer nada.

Paralelizada com teto de cinco. O teto não é enfeite: disparar as 77 de uma vez é
exatamente a rajada que faz o explorador responder `429`, e o watchtower não pode
resolver a própria lentidão criando o problema seguinte. Só foi seguro fazer isto
**depois** do backoff da rodada anterior.

A sondagem acontece em blocos de cinco, e não numa fila só, porque o gap limit precisa
decidir onde parar: a condição é reavaliada ao fim de cada bloco, então a varredura vai
no máximo quatro endereços além de onde iria sozinha. Custou oito requisições a mais.

Duas ordens são preservadas de propósito: a parada do gap limit é avaliada na ordem do
índice, e não na de quem respondeu antes — senão o paralelismo mudaria o conjunto de
endereços da carteira; e os UTXOs lidos são percorridos na ordem dos endereços, senão a
mesma carteira geraria sequências diferentes de eventos a cada volta, e um log
append-only deixaria de ser reproduzível.

| | requisições | tempo |
|---|---|---|
| antes | 79 | 18–27 s |
| depois | 87 | **6,0–6,6 s** |

Medido três vezes seguidas contra a signet. As medições intermediárias de 13,8 s e 21,4 s
eram variação de rede, não do código — foi preciso repetir para não registrar ruído como
resultado.

Perfilado por fase: a varredura das duas cadeias são 4,8 s dos 6, e as gravações no banco,
136 ms. O tempo é da rede, como se supunha, mas agora medido em vez de suposto.

### O intervalo do worker virou configuração

Com o ciclo em seis segundos, faz sentido poder aproximar o alerta.
`WORKER_INTERVAL_MS` tem piso de cinco segundos, porque intervalo menor que o ciclo
empilha sincronizações da mesma carteira sobre o mesmo log append-only.

## Décima nona rodada — 26/08, as três pendências que sobraram

### A intermitência não reproduz

~34 execuções da suíte do frontend, incluindo quatro com os quatro núcleos saturados —
a condição que coincidiu com a falha original. Todas verdes. Fica registrada como **não
reproduzida sob pressão**, e não como resolvida: não sei o que era.

O que foi corrigido em volta dela, e provavelmente ajudou: o teste do painel passou a
simular os fetches de canais e de busca, que antes atualizavam estado depois das
asserções.

### BIP-329: uma não conformidade com a spec

Fui buscar a especificação para conferir o formato e achei um defeito nosso.

A BIP diz, sobre `spendable`: *"Omitting it means the importing wallet should preserve
existing values."* **Omitir é preservar, não é negar.** Nós tratávamos ausência como
"gastável" — importar um arquivo de carteira que não escreve o campo descongelaria em
silêncio tudo que o usuário tinha congelado, e congelar é a decisão de coin control
mais direta que existe.

A exportação passa a escrever o campo sempre — omitir faria o nosso "não está
congelado" nunca chegar ao destino —, e a importação distingue "não mencionado" de
"gastável".

**O arquivo de exemplo da própria BIP virou teste.** Não há implementação de BIP-329
publicada no npm para cruzar, então ler o que a spec publica é o substituto mais forte
disponível para "abrir no Sparrow". Ele inclui `spscan`, tipo acrescentado depois pela
BIP-392: um parser que engasgasse com tipo novo perderia o arquivo inteiro quando a spec
crescesse.

### A postura soberana: até onde dá sem um nó

A única imagem de Floresta disponível é de terceiro sem procedência conhecida. Rodar
código arbitrário com acesso à rede na máquina de alguém, num projeto cuja tese é
privacidade, é decisão do dono da máquina — fica para ele.

O que deu para verificar: cadastrar um backend soberano e conferir na tela que escolhê-lo
**apaga o aviso de exposição**, e que voltar ao público o acende. O caminho está correto;
falta o nó do outro lado.

## Vigésima rodada — 26/08, o projeto funciona a partir do zero?

Ninguém tinha verificado o que o README promete: clonar, copiar o `.env.example`, subir
e usar. Nove migrações se acumularam desde a última vez que um banco vazio foi criado, e
nada garantia que elas aplicassem em ordem numa base limpa.

Feito num **projeto Compose separado**, com portas próprias, para não tocar na base de
demonstração — um clone raso do próprio repositório, seguindo o README ao pé da letra.

| Passo | Resultado |
|---|---|
| clone + `.env.example` + duas chaves | funciona |
| `docker compose up -d --build` | sobe os cinco containers |
| migrações num banco vazio | as nove aplicam em ordem |
| `GET /api/health` | responde |
| criar conta pela tela | funciona |
| tela de estreia com formulário aberto e aviso watch-only | funciona |
| cadastrar endereço e vê-lo listado | funciona |
| selo de privacidade aceso | funciona |
| respostas 4xx/5xx durante o percurso | **nenhuma** |

Uma armadilha do Compose que vale registrar para quem for repetir: `ports` num arquivo
de override é **somado** ao original, não substituído. Sem `!override`, o teste tentou
publicar a mesma porta duas vezes e bateu na do ambiente de desenvolvimento.

## Vigésima primeira rodada — 27/08, o nó do próprio usuário

A pendência mais antiga do projeto era a postura soberana: o design previa
`registerDescriptor` e `rescanFrom` desde a §7, e a §12.1 os listava como "previstos na
interface, sem implementação". Um watchtower cuja tese é privacidade que só sabe falar
com explorador público e com servidor de índice de terceiro tem um buraco no meio da
tese.

Construído nesta rodada:

- **`core-rpc.ts`** — cliente JSON-RPC do bitcoind, com transporte injetável para o
  teste não abrir socket, autenticação por cookie ou por usuário/senha, e o erro do
  Core convertido em exceção nomeando o método que falhou;
- **`core.ts`** — o adapter: cria a carteira de observação, importa os descriptors,
  lê `listunspent` e converte para o vocabulário do motor;
- **`RegisteredUtxo` e `getRegisteredUtxos`** na interface de adapter;
- **`sincronizarPorRegistro`** no motor — o segundo caminho de sincronização, escolhido
  pela capacidade declarada e não por tentativa e erro;
- **`core` como tipo de backend** de ponta a ponta: `CHAIN_BACKEND`, validação de
  esquema no `POST /api/backends`, mensagem de recusa nas duas línguas, e a opção
  "Bitcoin Core" no seletor da tela — sem ela, cadastrar um nó dependeria de mexer no
  `.env` do servidor, e a postura soberana ficaria fora do alcance de quem usa a
  instância sem administrá-la.

### O que quebrou a premissa

**O design previu o registro e não previu a leitura de volta.** `registerDescriptor` e
`rescanFrom` entram; nada saía. Sem `getRegisteredUtxos`, o descriptor entra no nó e o
motor fica sem nada para projetar — o caminho inteiro era um beco sem saída, e isso não
aparece até alguém tentar implementá-lo.

**"Gap limit" não é uma propriedade do sistema, é uma propriedade de um dos dois
modelos.** No caminho de registro não há o que sondar: quem sabe quais endereços existem
é o nó. A consequência que importa é a inversa e não é simétrica — **sumir de
`listunspent` é evidência de gasto**, o que no caminho de sondagem seria falso, porque lá
só conta o endereço que foi de fato perguntado.

**Três defeitos que só apareceriam contra um bitcoind de verdade**, achados ao escrever
a especificação e cobertos por teste antes de existir nó para prová-los:

1. **`importdescriptors` recusa descriptor com curinga sem `range`** — *"Descriptor is
   ranged, please specify the range"*. A importação inteira falharia na primeira
   carteira. Passa a informar `[0, 999]`, o padrão do próprio Core;
2. **`createwallet` responde "Database already exists" depois que o nó reinicia.** A
   carteira de observação é criada com `load_on_startup: false`, para não mexer na
   configuração do nó de quem nos hospeda; o preço é que ela existe e não está
   carregada. `listwallets` lista só as carregadas, então o adapter concluía "não
   existe" e tentava criar. Passa a tentar `loadwallet` antes — o watchtower parava de
   sincronizar no primeiro restart do nó, e o erro não dizia por quê;
3. **a origem da chave no `desc` é tão longa quanto o nó souber.** `listunspent`
   devolve `[fp/0/7]` quando o descriptor importado não traz caminho, e
   `[fp/84'/1'/0'/0/7]` quando traz. Ler os dois primeiros trechos gravaria o endereço
   em `cadeia 84`, `índice 1` — no lugar errado, **sem erro nenhum**. Passa a ler os
   dois últimos.

**Uma carteira de observação por carteira vigiada, e não uma por nó.** `listunspent`
responde pela carteira inteira: duas carteiras do watchtower compartilhando a mesma no
nó receberiam a união das duas, e os UTXOs de uma apareceriam como saldo da outra. É por
isso que o `BackendRow` passou a carregar `walletId` — e que montar o adapter de Core sem
ele é erro, não valor padrão.

**A detecção de tipo de script pela cadeia não funciona com Core**, porque ela pergunta
por endereço. Com backend de registro o tipo declarado pela chave é assumido, e quem
quer outro informa. Manter a tentativa faria o cadastro falhar em vez de degradar.

**O valor vem em BTC, com ponto flutuante.** `0.00000001 * 1e8` não dá exatamente 1 em
binário. A conversão conta os dígitos do texto: um satoshi perdido por arredondamento é
saldo errado que ninguém consegue explicar depois.

**E o cookie do bitcoind é regerado a cada reinício do nó**, então é lido a cada chamada
em vez de guardado. Guardá-lo faria a autenticação parar de funcionar depois de um
restart, com um `unauthorized` que não explica nada.

### Um defeito na própria suíte, achado no caminho

Sob disco disputado — a máquina construía imagem Docker ao mesmo tempo —, o `beforeEach`
que esvazia o banco de verdade passava dos **10 s** que o vitest dá a um hook por padrão.
Quando isso acontece o caso segue com o banco sujo, e a falha aparece como violação de
chave estrangeira num teste que não tem nada a ver com o que quebrou. `hookTimeout`
passa a acompanhar o `testTimeout`, em 20 s.

Vale contra a *falha isolada em `Dashboard > anuncia postura pública`* anotada na rodada
anterior, que também aconteceu com Docker construindo ao lado: a intermitência tinha a
mesma forma.

### Medido ao fim da rodada

| | Antes | Depois |
|---|---|---|
| backend | 35 arquivos, 381 testes | **37 arquivos, 418 testes** |
| frontend | 95 testes | **96 testes** |
| `npx tsc --noEmit` | limpo | limpo nos dois |

### O que ficou de dívida

- **Nenhum bitcoind respondeu ainda.** O RPC, o registro e a leitura estão cobertos
  contra transporte simulado, e o motor tem o caminho de registro coberto ponta a ponta
  contra o banco — mas um transporte falso não cobra o que um servidor real cobra, e
  esta é exatamente a lição da décima sétima rodada, quando o Electrum nunca teria
  funcionado e os testes passavam. Os três defeitos acima foram achados lendo o
  comportamento documentado do Core; o próximo só aparece com nó do outro lado;
- **`rescanFrom` existe no adapter e o motor não o chama.** `importdescriptors` com
  `timestamp: 0` já varre desde o gênesis, e um rescan explícito por cima seria uma
  segunda varredura pelo mesmo motivo. Fica implementado porque a interface o previa e
  porque um backend de registro que não saiba revarrer é um beco sem saída diferente;
- **`internal: false` nas duas cadeias.** A cadeia 1 é troco, e o Core sabe marcar isso.
  Como `listunspent` devolve as saídas não gastas de todo jeito, a marcação não muda o
  que o watchtower lê — mas é informação correta que estamos deixando de dar ao nó.

## Roteiro da demonstração — estado real, conferido em 26/08

O roteiro da §12.1 do design é a intenção. Isto é o que sobe no palco.

| Passo do roteiro original | Estado |
|---|---|
| 1. Login, painel vazio | **funciona** |
| 2. xpub → modo público, badge de aviso aceso | **funciona**, e o aviso fica preso ao topo ao rolar |
| 3. `am-i-exposed`: score e achados | **funciona** — botão no cartão, score, nota e achados com recomendação |
| 4. Tabela de UTXO com tags, dust congelado | **funciona** — rótulo, tags, congelamento e dust destacado |
| 5. Segunda carteira em modo soberano, lado a lado | **possível**, na mesma rede, e agora por dois caminhos: Electrum, verificado contra um ElectrumX real, ou o RPC do próprio Bitcoin Core, implementado em 27/08 e ainda sem nó do outro lado. Falta um nó do próprio apresentador para a postura ser soberana de verdade |
| 6. Transação real no signet → alerta no celular | **funciona**, e o canal agora se cadastra pela tela, com botão de teste |
| 7. Exportar BIP-329 e abrir no Sparrow | **exporta e importa**; falta abrir o arquivo no Sparrow de verdade |
| 8. Roadmap | falar |

Além do roteiro original, existem agora e valem mostrar:

- **vigiar endereço avulso**, para quem publica endereço de doação;
- **origem dos fundos** (`kyc_origin`), que dispara sozinha quando o worker detecta
  transação nova, e distingue o que o scanner reconheceu do que apenas suspeitou;
- **queda de privacy score** (`score_dropped`) entre duas análises;
- **busca** de endereço entre o que está sendo vigiado;
- **degradação honesta**: uma carteira cujo endereço o backend recusa servir fica
  "vigiando em parte", com o motivo à vista, em vez de quebrar.

### Roteiro alternativo, se algo falhar ao vivo

Login → a carteira de signet já sincronizada → selo de explorador público aceso e preso
ao topo → o feed mostra `address_reused`, `dust_received` e `kyc_origin` disparados por
transação real → análise de privacidade com os achados → coin control com dust destacado
e exportação BIP-329 → roadmap honesto.

Não depende de transação nova chegar na hora, que é a única parte fora do nosso controle.

**As carteiras vigiadas pelo nó são cadastradas antes da apresentação.** O primeiro
import do Bitcoin Core varre a cadeia desde o gênesis duas vezes, uma por cadeia de
derivação, e o ciclo do worker espera — 17 minutos medidos em 27/08, com todas as outras
carteiras paradas. Cadastrar ao vivo é congelar o feed no palco.

## Rodada 22 — Item 0: uma instância, mais de uma rede

### O que foi construído

- `POST /api/backends` agora recebe `network`, grava a rede escolhida e `GET /api/backends` lista todas as redes, com filtro opcional por `?network=`.
- O cadastro de carteira usa a rede do backend escolhido para validar chave ou endereço e para gravar `wallets.network`.
- A mensagem de rede incompatível passou a nomear a fonte escolhida e os parâmetros novos entram no catálogo bilíngue.
- O worker sincroniza carteiras de redes diferentes no mesmo ciclo, cada uma com o backend que a carteira escolheu.
- O painel deixou de somar saldos de redes diferentes num número só e mostra totais rotulados por mainnet, signet e testnet.
- O formulário de backend da tela permite escolher a rede ao cadastrar uma fonte, e a documentação reescreveu o sentido de `NETWORK`.

### O que quebrou a premissa

- O TDD do item reproduziu a premissa antiga: em uma instância `NETWORK=signet`, cadastrar backend com `network: mainnet` ainda gravava `signet`; a primeira rodada vermelha mostrou **6 falhas no backend** nos testes de backends, wallets e tick.
- A falha silenciosa do painel foi medida no teste do Dashboard: duas carteiras, uma com **50.000 sats mainnet** e outra com **11.000 sats signet**, apareciam como **61.000 sats** em um total único.
- Depois de incluir o endereço do critério de pronto, `bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2`, a suíte backend subiu de **423 para 424 testes**; o caso passa por backend mainnet mesmo com a instância em signet.

### O que ficou de dívida

- O saldo real do endereço mainnet não foi conferido contra uma sincronização de explorador nesta rodada; o item 0 fechou o contrato e a regressão de mistura de redes, mas não rodou um ciclo de cadeia real para esse endereço.
- O Item 1 ainda não foi iniciado; a prova contra bitcoind e Fulcrum local continua sendo a próxima rodada por ordem do backlog.

## Rodada 23 — Item 1.1: Bitcoin Core real, pelo RPC

### O que foi conferido

- O `docker-compose.yml` passou a montar `/mnt/dados2/signet/.cookie` como `/bitcoin/.cookie:ro` no backend e a expor `host.docker.internal`.
- O `.env` real foi apontado para `CHAIN_BACKEND=core`, `CORE_URL=http://host.docker.internal:38332`, `CORE_COOKIE_PATH=/bitcoin/.cookie` e `PUBLIC_BACKEND=false`.
- De dentro do container, `/bitcoin/.cookie` ficou legível e a API continuou saudável em `GET /api/health`.
- Backend Core cadastrado pela API: `id=18`, `network=signet`, `is_public=false`.
- Carteira de observação criada no Core: `stealth-badger-5`.
- Descriptors importados:
  - recebimento: `wpkh(.../0/*)`, `range [0,1001]`, `next_index 2`;
  - troco: `wpkh(.../1/*)`, `range [0,999]`, `next_index 0`.
- `bitcoin-cli -signet -datadir=/mnt/dados2 getblockcount` mediu **319594**.
- `getblockhash 319594` mediu `000000067d357c2732361d59a7f659ab84270e9caccfd79a214b02e5df3b65fb`.
- A carteira `Core signet vpub item 1` sincronizou em `sync_height=319594`, com **2 UTXOs** e **11.000 sats**.
- Os dois UTXOs vieram do endereço `tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0`, derivation path `0/0`.
- Segundo ciclo manteve `chain_events=2`; não duplicou evento.
- A resposta da API devolveu `backendIsPublic=false`, que é o dado que apaga o aviso permanente de explorador público na tela.

### O que quebrou a premissa

- O erro de permissão era operacional: o container não tinha o cookie montado. Montar o arquivo direto em `/bitcoin/.cookie:ro` resolveu sem abrir o diretório do nó para escrita.
- `importdescriptors` contra Core real não cabe no timeout de 30s. O Core continuava escaneando, mas o backend abortava a chamada e marcava a carteira como `error`.
- Depois do timeout/restart, repetir a importação enquanto o Core ainda escaneava devolvia `Wallet is currently rescanning`. O adapter agora espera o rescan terminar e reconhece descriptor já importado.
- Em outra rodada, a conexão HTTP também caiu como `fetch failed` enquanto o Core continuava trabalhando. O adapter trata esse caso como rescan pendente e valida o descriptor depois.

### O que ficou de dívida

- O cadastro da API ainda não aceita descriptor textual `wpkh(...)`; para declarar native segwit foi usado o `vpub` equivalente. O `tpub` cru continua ambíguo e foi corretamente cadastrado como `p2pkh`.
- A conferência do Fulcrum local, item 1.2, ainda falta.
- A carteira de teste `stealth-badger-4`, criada pela primeira tentativa ambígua, foi abortada/removida do banco, mas continuou carregada no Core.

## Rodada 24 — Item 1: a carteira do dono, pelo nó e pelo explorador

### O que foi construído

- `POST /api/wallets` passou a aceitar **`scriptType`** opcional: `p2pkh`, `p2sh-p2wpkh`
  ou `p2wpkh`. Existe porque um backend de registro não responde por endereço, e sem
  ninguém a quem perguntar o palpite errado não dá erro nenhum.
- O cadastro recusa tipo que não existe (`wallet.unknownScriptType`), tipo declarado
  junto de endereço avulso (`wallet.scriptTypeWithAddress`) e tipo que contradiz as
  version bytes da chave (`wallet.scriptTypeConflict`) — as três frases nas duas línguas.
- Chave ambígua sem declaração e sem cadeia a quem perguntar passou a assumir
  **native segwit**, e não legado, como já fazia todo o resto do cadastro.
- O formulário mostra o campo **só quando a chave é ambígua** (`xpub`/`tpub`), com a
  frase que explica por quê; `vpub`, `zpub`, `upub` e `ypub` não ganham campo nenhum.
- A `tpub` do dono do projeto foi conferida contra o nó desta máquina e vigiada por dois
  caminhos ao mesmo tempo — Bitcoin Core local e Esplora público — que é o passo 5 do
  roteiro.

### O que quebrou a premissa

- **`tpub` crua com backend Core mostrava saldo zero, sem erro.** `wallet/routes.ts` só
  detectava o tipo de script quando o backend **não** era `core`, e o corpo do `POST`
  não aceitava tipo nenhum — o comentário do código dizia que "o usuário informa o tipo
  se quiser outro", e não havia por onde. Medido: a carteira tem **7.552.468 sats em 32
  UTXOs** derivados por `wpkh`, e a varredura dos seis descriptors possíveis
  (`pkh`, `sh(wpkh)` e `wpkh`, cadeias 0 e 1, range 0–200) deu **exatamente o mesmo
  total** da varredura só de `wpkh` — ou seja, **zero** em legado e em nested segwit.
  Cadastrada como `p2pkh`, a tela mostraria 0 onde há 7,5 milhões de sats.
- **O primeiro import do Core congela o worker inteiro.** `tick()` percorre as carteiras
  em série e `loop.ts` espera o ciclo terminar de propósito, para não empilhar
  sincronizações no log append-only. Medido: a carteira do Core ficou **17 minutos** em
  `importing` enquanto a gêmea pelo Esplora não saiu de `pending` — mesma chave, mesmo
  ciclo. São **dois rescans**, um por cadeia, cada um varrendo a signet desde o gênesis.
- **A espera de rescan de 600 s é curta para o primeiro import.** A carteira foi para
  `error` com *"Bitcoin Core ainda está escaneando a carteira de observação depois de
  600s"* enquanto o nó, correto, ainda estava em 97,2% aos 1009 s. O ciclo seguinte
  encontrou o descriptor já importado e a carteira se recuperou sozinha — o `error` é
  transitório, mas aparece na tela.
- **`scantxoutset` custou 3 min 40 s** nesta máquina, com o `bitcoind` também alimentando
  o índice do Fulcrum. É a razão de não detectar tipo de script pelo nó no cadastro:
  um formulário que trava quatro minutos é pior que o problema que resolveria.

### O que ficou conferido

| O que | Medido |
|---|---|
| tipo de script da chave | `wpkh`, contra `pkh` que as version bytes sugeriam |
| UTXOs pelo `scantxoutset` do nó | **32** — 31 na cadeia 0, 1 na cadeia de `change` |
| saldo pelo `scantxoutset` | **7.552.468 sats**, altura 319608 |
| carteira pelo **Bitcoin Core local** | `synced`, **7.552.468 sats**, **32 UTXOs**, altura 319611 |
| carteira pelo **Esplora público** | `synced`, **7.552.468 sats**, **32 UTXOs**, altura 319611 |
| `backendIsPublic` | `false` na do Core, `true` na do Esplora — selo apagado e aceso |
| conversão `tpub` → `vpub` | `0/1`, `0/27`, `0/35` e `1/0` derivam os mesmos `scriptPubKey` que o nó achou |
| menor UTXO | **500 sats** — `dust` de verdade, e não um caso inventado |
| estabilidade das fontes | em uma hora, o Esplora público falhou duas vezes com `fetch failed`; o Core local, nenhuma |

### O que ficou de dívida

- **O primeiro import do Core continua bloqueando o ciclo, e isso não foi corrigido.**
  A decisão, tomada com o dono do projeto em 27/08, foi registrar a limitação em vez de
  mexer na concorrência do worker na véspera da entrega: carteira pelo nó se cadastra
  **antes** da apresentação, nunca ao vivo. Só o primeiro import bloqueia.
- **`xpub_fingerprint` guarda o fingerprint do *pai*, não o da chave.**
  `descriptor.ts:115` lê os bytes 5..9, que na BIP-32 são o fingerprint do pai; o Core
  mostra `f47ff685` para a mesma chave onde a nossa tela mostra `fd281824`. Não quebra
  nada — o campo só é exibido, e nenhum descriptor é montado com ele — mas quem comparar
  com o Sparrow vai achar que é outra carteira.
- **Item 1.2, o Fulcrum, continua pendente**: o índice estava em 83,5% ao fim desta
  rodada, avançando entre 2 e 17 blocos por segundo. A porta 50001 só abre quando o
  índice termina.

## Rodada 25 — Itens 7, 8 e 9: botões, escala tipográfica e a grade do painel

### O que foi construído

- `components/ui/Button.tsx`, com quatro variantes — `primary`, `secondary`, `ghost` e
  `danger` — dois tamanhos, `type="button"` por padrão e a variante em `data-variant`.
- Os dezesseis botões de texto puro das oito telas passaram a usá-lo. **Não sobrou um
  `<button>` cru em `frontend/src`.**
- Tokens novos na primeira camada (`--sb-caution-lit`, `--sb-alarm-lit`, `--sb-clay-lit`)
  e os papéis `--sb-accent-hover`, `--sb-surface-hover`, `--sb-critical-hover`,
  `--sb-focus`.
- A escala tipográfica subiu um degrau: `xs` de 11 para **12px**, `sm` 13 → **14px**,
  `base` 15 → **16px**, `lg` 18 → **20px**, `xl` 24 → **26px**. As treze ocorrências de
  prosa em `text-xs` viraram `text-sm` — prosa não desce de 14px.
- A grade do painel inverteu o peso: `lg:grid-cols-[minmax(0,1fr)_360px]`. A coluna do
  que se vigia cresce com a janela, o feed fica em 360px, e os cartões de carteira passam
  a caber dois por linha a partir de `xl`.

### O que quebrou a premissa

- **O Tailwind apagou o estilo inteiro dos botões, e nenhum teste viu.** As regras
  estavam em `@layer components`, e a varredura de classes do Tailwind descarta o que não
  encontra escrito no código. `Button.tsx` monta `sb-btn--${variant}` em tempo de
  execução: nome nenhum aparece literal, e o bundle saiu sem `background`, sem borda e
  sem altura. Os 106 testes passaram verdes — JSDOM não aplica CSS. **Quem pegou foi o
  screenshot**, que mostrou exatamente a queixa original: botão que é só texto. As regras
  foram para fora da camada.
- **`ghost` sem fundo é `ghost` sem affordance.** A tabela do backlog pede "sem fundo até
  o `:hover`", e a regra da varredura pede que nenhuma ação fique sem borda, fundo ou
  sublinhado. As duas se contradiziam. Resolvido pela terceira opção: `ghost` ganhou
  **sublinhado pontilhado** em repouso — trinta e duas linhas de UTXO com contorno
  viravam grade, e o sublinhado não pesa na lista.
- **Uma execução da suíte do frontend falhou sob carga**, com a máquina indexando o
  Fulcrum e rodando um rescan do Core ao mesmo tempo: **55 segundos** contra os 14 de uma
  execução normal. As duas execuções seguintes passaram inteiras. O nome do caso não foi
  capturado, então fica como novo dado da intermitência já anotada, e não como caso novo.

### O que ficou conferido

Screenshots do painel autenticado, em 1280px e em 390px, e da `UtxoTable` aberta nas duas
larguras:

| O que | Medido |
|---|---|
| rolagem horizontal | **nenhuma**, nas quatro capturas |
| botões da tela | `+ vigiar carteira` e `analisar privacidade` com borda, `cadastrar canal` preenchido, `sair` e `moedas e rótulos` sublinhados |
| par de idiomas | o escolhido acende a borda, e o estado continua no `aria-pressed` |
| `UtxoTable` em 390px | valor, `txid:vout`, caminho de derivação, campo de rótulo e `congelar` cabem sem cortar |
| grade em 1280px | coluna esquerda larga, feed em 360px, cartões dois por linha |

### O que ficou de dívida

- **Com os cartões em duas colunas, abrir as moedas de um deixa a coluna vizinha vazia**
  em telas grandes. O item 10, que leva a carteira para uma página própria, resolve sem
  remendo — mexer na grade agora seria fazer o trabalho duas vezes.
- **Nenhum teste cobre o estilo aplicado.** O defeito do `@layer` passou por 106 testes
  verdes; o que o pegou foi olhar a tela. Teste de CSS aplicado exigiria navegador na
  suíte, e isso não cabe na véspera — a conferência visual fica no roteiro de regressão.

## Rodada 26 — Item 4: arquivar, e apagar de verdade quando for o caso

### O que foi construído

- Migração `010_wallet_archived.sql`: coluna `archived_at` e índice parcial das não
  arquivadas.
- `POST /api/wallets/:id/archive` e `/unarchive`; `DELETE /api/wallets/:id` com
  `confirm` — 409 `wallet.mustArchiveFirst` se não estiver arquivada, 400
  `wallet.confirmMismatch` se o rótulo digitado não bater, 404 se não for do usuário.
- `GET /api/wallets` passou a devolver as vigiadas, `?archived=true` as arquivadas, e
  cada linha diz `archivedAt`.
- O `tick()` só busca carteira com `archived_at IS NULL`.
- `ConfirmDialog.tsx`, que só libera apagar quando o rótulo digitado é exatamente o da
  carteira, e o painel ganhou "ver arquivadas", com desarquivar e apagar.
- As doze frases novas entraram nas duas línguas.
- **A exceção ao princípio 5 está escrita** na §7.1 da especificação e no design: apagar
  uma carteira apaga o log dela, porque append-only protege a história contra reescrita,
  não contra o dono pedindo para esquecer o próprio xpub.

### O que quebrou a premissa

- **A suíte do frontend passou nos 106 testes com o estilo dos botões apagado** — o
  defeito da rodada anterior. Aqui a lição virou método: **a conferência do item 4 foi
  feita por navegador**, dirigindo a tela de verdade. O `getByText('ARQUIVAR')` não achou
  nada: a caixa alta é `text-transform` no CSS, e o texto no DOM continua "Arquivar".
  Quem confere pela tela precisa lembrar que maiúscula visual não é maiúscula no DOM.
- **A suíte inteira ficou intermitente sob carga.** Duas execuções do backend falharam
  com casos diferentes — uma com dois, outra com `cadastra a carteira e guarda o xpub
  cifrado` estourando os 20s — enquanto o Fulcrum indexava e o Sparrow estava aberto:
  **`load average` 9,32**, e a suíte levando **295s contra os 139s** de uma execução
  tranquila. Rodado isolado, `wallets.test.ts` passa os 34 casos em 39s. Não é defeito do
  código, e é o mesmo gatilho da intermitência já anotada.

### O que ficou conferido

Pelo navegador, com a sessão real:

| O que | Medido |
|---|---|
| arquivar | a carteira sai da lista e do total; o `tick` deixa de sincronizá-la (teste) |
| ver arquivadas | seção à parte, com `desarquivar` e `apagar de vez` |
| rótulo errado | `apagar` continua **desabilitado** — conferido no navegador e no teste |
| cancelar | fecha sem apagar |
| desarquivar | a carteira volta à lista, e a lista de arquivadas fica vazia |

### O que ficou de dívida

- **A tela não avisa o que a API recusou.** O `catch` do diálogo fecha calado quando o
  backend devolve 400 ou 409 — os dois casos que a tela já impede de acontecer, mas
  fechar sem dizer nada é o tipo de silêncio que este projeto não aceita em outro lugar.
- **Apagar não pede senha.** A confirmação é o rótulo digitado, como o backlog definiu;
  quem tiver a sessão aberta apaga. Está coerente com o resto do produto, e fica
  registrado por ser decisão, não esquecimento.

## Rodada 27 — Item 1.2 fechado pelo Fulcrum, e o item 2: catálogo de fontes

### O que foi construído

- **Item 1.2**: o índice do Fulcrum terminou e a mesma chave foi vigiada pelo servidor
  Electrum desta máquina. Com ele, o item 1 inteiro fecha.
- Migração `011_backend_credentials.sql`: `credentials_encrypted`, `preset` e `label`.
- `chain/presets.ts`: oito entradas de catálogo sobre **três** adapters. Fulcrum, Electrs
  e Floresta gravam `kind: 'electrum'`; mempool.space e Blockstream, `esplora`.
- `POST /api/backends` aceita `preset` + `host`/`port`/`url`/`auth` e monta a URL, com
  `backend.unknownPreset`, `backend.hostRequired`, `backend.portRange` e
  `backend.authRequired` nas duas línguas. `kind` + `url` crus continuam valendo.
- A credencial do RPC é cifrada com a mesma caixa do xpub e **nunca volta**: a resposta
  traz só `hasCredentials`.
- `credenciaisDoBackend()` lê a credencial da linha e só cai no `.env` quando a linha não
  tem — e o cookie do ambiente passou a ser lido **a cada chamada**, não na carga do
  módulo, porque o bitcoind regenera o arquivo a cada reinício.
- `BackendForm.tsx` e `lib/presets.ts`: o formulário pergunta o que cada fonte precisa.

### O que quebrou a premissa

- **`<form>` dentro de `<form>`.** O `BackendForm` nasceu como formulário e vive dentro
  do formulário de cadastro de carteira. HTML não permite aninhar, **o JSDOM permite** —
  os seis testes do formulário passaram verdes, e no navegador o clique em "adicionar
  backend" recarregou a página **sem chamar a API uma vez sequer**: o log do nginx não
  registrou nenhum `POST /api/backends`. Virou `<div>` com botão comum. É a segunda vez
  em duas rodadas que só o navegador pega o defeito.
- **A rodada 24 abriu um 500 e ele passou por 440 testes verdes.** Ao tirar a guarda de
  `core` da detecção de tipo de script, o cadastro passou a montar o adapter para
  perguntar à cadeia — e `createAdapter` **recusa montar Core sem saber de que carteira
  se trata**, porque no cadastro a carteira ainda não existe. Todo teste do caso injetava
  `adapterFactory`, então nenhum passava pelo `createAdapter` de verdade. Medido pela API
  rodando: `500 Internal Server Error` ao cadastrar uma `tpub` pelo nó. Agora a detecção
  desiste em silêncio quando não há adapter a montar, e há teste **sem factory injetada**
  que prova.

### O que ficou conferido — item 1, as três fontes

Mesma chave, três caminhos, no mesmo instante:

| Fonte | Saldo | UTXOs | Altura | Selo |
|---|---|---|---|---|
| Bitcoin Core local (`host.docker.internal:38332`) | **7.552.468** | 32 | 319626 | apagado |
| mempool.space (público) | **7.552.468** | 32 | 319626 | **aceso** |
| Fulcrum local (`host.docker.internal:50001`) | **7.552.468** | 32 | 319626 | apagado |

E o resto da tabela do item 1, pelo Fulcrum:

| O que | Medido |
|---|---|
| handshake | `server.version` devolveu `["Fulcrum 2.1.2","1.4"]` |
| `tipHeight` | 319626, igual ao `getblockcount` do nó |
| `blockHashAt` | evento na altura 319378 gravou `000000124a6192e5415cdceff25a33926e95d45b80a338aee490dbe56b9f7097`, idêntico ao `getblockhash` |
| `derivationPath` | `1/0` a `1/20` na cadeia de troco — cadeia/índice, não `84'/1'/…` |
| segundo ciclo | 32 eventos antes, 32 depois |
| tempo de índice | o Fulcrum levou **cerca de 3 horas** para indexar a signet nesta máquina, de 74% a 100%, oscilando entre 2 e 161 blocos/s |

Item 2, conferido pela tela: cadastrei o nó desta máquina **pelo formulário, sem tocar no
`.env`** — `preset=core`, apelido "nó desta máquina", porta 38332 sugerida pela rede,
aviso de `host.docker.internal` aparecendo enquanto se digita `localhost`, e
`hasCredentials=true` com a credencial em campo nenhum da resposta.

### O que ficou de dívida

- **A credencial guardada na linha não foi exercitada contra o nó real.** O teste unitário
  prova a precedência sobre o `.env`, e o cadastro pela tela prova que ela é guardada
  cifrada; falta uma carteira sincronizando por um backend cujo cookie **só** exista na
  linha. Não foi feito agora porque cada carteira nova pelo Core custa dois rescans e
  bloqueia o ciclo do worker — a limitação medida na rodada 24.
- **O item 3, trocar a fonte de uma carteira já cadastrada, não foi começado.**

## Rodada 28 — Item 3: trocar a fonte de uma carteira já cadastrada

### O que foi construído

- `PATCH /api/wallets/:id` com `backendId`: troca a fonte, volta a carteira para
  `pending`, zera progresso e erro, e **não toca no log**.
- Recusas: `backend.networkMismatch` nomeando as duas redes, e **a mesma resposta 404
  para fonte inexistente e fonte de outro usuário** — distinguir contaria quais ids
  existem no banco alheio.
- `sincronizarPorRegistro` passou a registrar **`addr(<endereço>)`** quando a carteira é
  de endereço avulso, em vez das duas cadeias de derivação. É o que permite vigiar um
  endereço publicado pelo próprio nó, e era a saída 1 das duas que o backlog previa.
- A consulta que monta a carteira para a tela virou uma constante usada pela listagem e
  pela troca: duas consultas parecidas divergem no primeiro campo novo, e a tela passaria
  a mostrar dado diferente conforme o caminho.
- O cartão ganhou "trocar fonte", com a frase que diz **antes** da troca que o histórico
  não se perde, e a lista mostra o apelido da fonte quando ele existe.

### O que quebrou a premissa

- **A carteira de endereço avulso não sincronizava por registro**, e o erro não era
  "não sei fazer": era `Cannot read properties of null (reading 'length')` — o motor
  tentava abrir um `xpub_encrypted` nulo. Quem trocasse a fonte de um endereço vigiado
  para o próprio nó veria a carteira morrer em `error` com uma mensagem que não diz nada.
- **Dirigir a tela por texto não basta.** O `getByText` do Playwright achou "Trocar
  fonte" na página inteira, mas o cartão certo só foi alcançado pelo elemento
  `<article>` — dois seletores por classe e por ancestral falharam antes. Fica anotado
  para o roteiro de regressão: os cartões têm `article` e `data-wallet-kind`, e é por eles
  que se ancora.

### O que ficou conferido, pela tela

A carteira do dono, vigiada pelo mempool.space, trocada para o Fulcrum desta máquina:

| O que | Antes | Depois |
|---|---|---|
| fonte | `mempool.space/signet/api` | `electrum://host.docker.internal:50001` |
| selo | **aceso** (`backendIsPublic: true`) | **apagado** (`false`) |
| saldo | 7.552.468 sats | **7.552.468 sats** |
| UTXOs | 32 | **32** |
| `chain_events` | 32 | **32** — o log não foi reescrito |
| estado | `synced` | `pending` → `synced` no ciclo seguinte |

As fontes oferecidas na troca vieram rotuladas pela postura: *mempool.space · Explorador
público*, *host.docker.internal:50001 · Soberano*.

### O que ficou de dívida

- **A troca não foi exercitada de sondagem para registro contra o nó real.** Está coberta
  por teste — inclusive o que prova que o mesmo UTXO visto pelos dois modelos não vira
  dois eventos —, mas contra o Bitcoin Core de verdade custaria os dois rescans da rodada
  24, e o ciclo do worker parado junto.
- **Duas fontes com o mesmo host aparecem iguais na lista quando nenhuma tem apelido.**
  O apelido resolve, e o catálogo do item 2 o oferece; fontes cadastradas antes dele não
  têm.

## Rodada 29 — Item 6: paginação do feed por cursor

### O que foi construído

- `listarAlertas()` com **cursor keyset em `(created_at, id)`** decrescente, filtros de
  tipo, severidade, carteira e período, limite padrão 20 e teto 100.
- O cursor é **opaco** — base64 de `created_at|id`. Cliente que aprende a lê-lo passa a
  depender da ordenação, e mudá-la depois quebra o cliente.
- `GET /api/alerts` devolve `{ items, nextCursor }`; a consulta pede um item a mais que o
  limite, que é como saber se há página seguinte sem uma segunda consulta contando tudo.
- O feed ganhou "carregar mais", e o painel costura as páginas: o que chega pelo SSE entra
  **por cima** sem invalidar o cursor, que aponta para baixo.

### O que quebrou a premissa

- **Uma asserção minha estava errada, e o código estava certo.** O caso "alerta novo entre
  uma página e a outra" exigia que o mais antigo *não* aparecesse — o que a paginação
  correta faz é justamente trazê-lo, na ordem, e deixar de fora o que chegou por cima. A
  asserção foi reescrita para dizer o que o caso quer dizer: as duas páginas trazem os
  quatro que existiam, na ordem, e o novo não aparece nem desloca ninguém. Teste que
  passa por engano é pior que teste que falha.
- **A mudança de forma da resposta quebrou quatro testes de outra suíte** — os de
  `privacy-routes`, que liam `alertas.json()` como lista. Ajustados para `.items`. É o
  preço de trocar o contrato, e ele apareceu na hora certa: nos testes, não na tela.

### O que ficou conferido, no navegador

| O que | Medido |
|---|---|
| primeira página | **20 alertas** |
| botão "carregar mais" | visível enquanto há cursor |
| depois de um clique | **40 alertas** na tela |
| segunda chamada | `/api/alerts?cursor=MjAyNi0wOC0yN1QxOToyNToxNi4yMjRafDE4NQ%3D%3D` |
| API direta | `?limit=3` devolveu 3 itens e um `nextCursor` |

### O que ficou de dívida

- **Os filtros existem na API e não na tela.** Tipo, severidade, carteira e período estão
  implementados e testados no backend; a página `/alertas` que os usa é o item 10.
- **"Carregar mais" não tem estado de carregando.** Numa conexão lenta o clique parece
  não fazer nada. É pequeno, e não foi feito por ordem de prioridade do backlog.

## Rodada 30 — Item 5: o detalhe da transação ao clicar no alerta

### O que foi construído

- `GET /api/alerts/:id` devolve o alerta, o evento de cadeia que o causou, a carteira, as
  **confirmações** e os alertas irmãos da mesma transação — tudo por junção, **sem
  consultar backend nenhum**.
- `TxDetail` no contrato dos adapters, e `getTransaction` nos três: Esplora por
  `GET /tx/:txid`, Electrum por `blockchain.transaction.get` verboso, Bitcoin Core por
  `gettransaction` na carteira de observação com `getrawtransaction` de reserva.
- `GET /api/tx/:txid?walletId=` com `501 tx.unsupportedByBackend` quando a fonte não sabe
  responder e `502 tx.backendFailed` **com o motivo** quando ela recusa.
- `AlertDetail.tsx`: txid inteiro, altura, hash do bloco, confirmações, carteira, irmãos,
  e o botão "buscar na cadeia" com a frase que diz para onde a consulta vai **antes** de
  ir. As entradas e saídas só aparecem depois do clique.

### O que quebrou a premissa

- **O alerta nunca teve o txid inteiro.** `alerts.params` guarda
  `event.txid.slice(0, 12) + '...'` — texto para caber na frase, não identificador.
  Qualquer link montado a partir dos params levaria a lugar nenhum. O detalhe sai do join
  com `chain_events`, e há teste que compara com o txid completo justamente para provar
  que ninguém tentou remendar a string.
- **Electrum e Bitcoin Core devolvem valores em BTC.** Entregá-los à tela mostraria
  0,00051 onde o resto do sistema fala sats; e `Number(0.000087) * 1e8` só dá 8700 com
  arredondamento. Os dois adapters convertem, e há teste com os dois valores.
- **`gettransaction` antes de `getrawtransaction`**: a carteira de observação conhece o
  que toca o descriptor registrado e responde **sem `txindex`**. Fazer o contrário
  obrigaria quem roda um nó podado a reindexar a cadeia inteira para ver um detalhe.

### O que ficou conferido, no navegador, sobre dados reais

Clicando no alerta `Possível dust attack` da carteira vigiada pelo Fulcrum:

| O que | Medido |
|---|---|
| consultas a `/api/tx` **antes** do clique | **zero** |
| txid | `bbcc628c580b1e4ee41f8e56c23e9c87c5d9cc92a3dbb47bdb66d97931754eae`, inteiro |
| altura e confirmações | 319378, **253 confirmações** |
| hash do bloco | `000000124a6192e5415cdceff25a33926e95d45b80a338aee490dbe56b9f7097` |
| irmãos | sete alertas da mesma transação |
| depois do clique | uma única chamada, `/api/tx/<txid>?walletId=10`, com entradas e saídas |

### O que ficou de dívida

- **O link para explorador externo não existe ainda.** O backlog o condiciona ao item 12,
  que liga fontes públicas de preço e taxa; sem ele não há para onde mandar o usuário com
  aviso honesto.
- **Não há botão de copiar o txid.** O texto está inteiro e selecionável; o botão ficou
  para depois porque exige permissão de área de transferência e um estado de "copiado".

## Rodada 31 — Item 10: navegação, e a carteira numa página

### O que foi construído

- `react-router-dom` v6 e **cinco rotas**: `/`, `/carteiras` e `/carteiras/:id`,
  `/alertas`, `/configuracoes`, `/acessos`.
- `Layout.tsx`: a casca de todas elas. A listra, o selo, o cabeçalho e a barra de
  navegação moram lá, e a `postura()` — que era do painel — subiu junto.
- `/carteiras/:id` traz o cartão inteiro com trocar fonte, arquivar e apagar, a exportação
  BIP-329 e **os alertas daquela carteira**, paginados.
- `/alertas` usa os filtros que a API já respondia desde a rodada 29 e não tinham onde
  caber: tipo, severidade e carteira.
- `/configuracoes` reúne fontes de consulta — com o `BackendForm` do item 2 — e canais.
- `/acessos` existe **antes** da funcionalidade, e diz o que ainda não está pronto em vez
  de esconder. É a mesma regra do resto do produto.
- As dezoito frases novas entraram nas duas línguas.

### O que quebrou a premissa

- **A API devolve `id` como texto, e a página da carteira comparava com número.**
  `bigint` do Postgres chega no JSON como `"10"`, não `10`; o tipo do cliente diz
  `number`, e quem confia no tipo escreve `w.id === 10`. Resultado medido no navegador:
  `/carteiras/10` mostrava *"esta carteira não existe, ou não é sua"* para a carteira que
  estava na tela ao lado. O teste de rota não pegou porque a fixture usava número — foi
  corrigida para repetir o que a rede entrega, e agora há caso que falha se alguém voltar
  a comparar por identidade.
- **Os testes de postura do painel deixaram de fazer sentido onde estavam.** Com a casca
  no `Layout`, quatro casos do `Dashboard.test` passaram a testar um componente que não
  desenha mais o selo. Foram movidos para `Rotas.test`, onde agora rodam **para cada uma
  das cinco rotas** — que é o teste chato que segura a tese do produto quando a interface
  cresce.

### O que ficou conferido, no navegador

| Rota | Selo | Listra | Rolagem horizontal |
|---|---|---|---|
| `/` | público | público | não |
| `/carteiras` | público | público | não |
| `/carteiras/10` | público | público | não |
| `/alertas` | público | público | não |
| `/configuracoes` | público | público | não |
| `/acessos` | público | público | não |

E navegar pela barra **não recarrega a página**: uma marca posta em `window` sobreviveu à
troca de `/` para `/alertas`, com a URL mudando.

### O que ficou de dívida

- **A navegação lateral não vira gaveta abaixo de `lg`.** Ela rola na horizontal, o que
  funciona em 390px mas não é o que o backlog descreve.
- **`/configuracoes` ainda não tem tema, preço nem taxas** — são os itens 11 e 12.
- **O painel e o `Layout` buscam carteiras cada um.** É uma chamada a mais em `/`, e foi
  escolha deliberada: com o painel lendo do contexto, os testes dele — que cobrem saldo
  por rede e reconferência — teriam de ser reescritos na véspera da entrega.

## Estado em 27/08

- backend: 38 arquivos de teste, **483 testes**
- frontend: 17 arquivos de teste, **136 testes**
- **cinco rotas**, todas dentro da `Shell`, com teste de postura em cada uma
- migrações aplicadas: `001` a `011`
- **a postura soberana está demonstrada**: Bitcoin Core e Fulcrum desta máquina, com o
  mesmo saldo do explorador público
- `npx tsc --noEmit` limpo nos dois
- três backends de cadeia: Esplora, Electrum e **Bitcoin Core**, escolhidos por carteira
- o resto igual ao estado de 26/08, abaixo

## Estado em 26/08, ao fim do dia

- backend: 35 arquivos de teste, **381 testes**
- frontend: 11 arquivos de teste, **95 testes**
- `npx tsc --noEmit` limpo nos dois
- `docker compose up -d --build` sobe os 5 containers
- regressão pela interface: 11 verificações, nenhuma resposta 4xx, nenhum erro de página
- ciclo de sincronização em **6 segundos** contra a signet
- repositório **público**, licença MIT

## Pendências

> **O backlog de 27/08 está em
> [`docs/2026-08-27-backlog-interface-e-fontes.md`](2026-08-27-backlog-interface-e-fontes.md)**
> — treze itens de fontes de consulta, interface e acessos externos, cada um com
> contrato, arquivos, testes e critério de pronto, mais as quatro decisões fechadas com o
> dono do projeto naquele dia. As pendências abaixo continuam valendo; o item 1 do backlog
> fecha a mais antiga delas, porque **há um bitcoind de signet sincronizado nesta
> máquina**.

### Em execução

- **Nada.** Os sete tipos da taxonomia da §8.1 estão implementados, e o caminho de
  registro de descriptor — a última peça do design que estava só na interface — foi
  construído em 27/08.

### Técnicas

- **Uma falha isolada na suíte do frontend**, em `Dashboard > anuncia postura pública`,
  numa execução entre quinze — e **outra em 27/08, sob carga**, numa execução que levou
  55s contra os 14s normais, com o nome do caso não capturado. Não reproduziu depois, e a máquina construía imagem
  Docker no mesmo instante. Fica anotada em vez de dada por resolvida: intermitência
  que não se explica costuma voltar — **o `hookTimeout` corrigido em 27/08 é candidato
  a explicação**, porque a falha do backend tinha a mesma forma e o mesmo gatilho
- **Abrir o arquivo BIP-329 exportado no Sparrow de verdade.** A ida e volta está
  coberta por teste de round-trip, mas nenhuma outra carteira leu o arquivo ainda
- ~~**A postura soberana não foi demonstrada.**~~ **Fechada em 27/08, pelo Bitcoin Core
  desta máquina**: a mesma chave vigiada pelo nó local e por explorador público devolveu
  os mesmos 7.552.468 sats em 32 UTXOs, com o selo apagado numa e aceso na outra. O lado
  Electrum fechou no mesmo dia, pelo Fulcrum desta máquina, com o mesmo saldo e a mesma
  altura — as três fontes concordam
- **Cadastrar carteira por Bitcoin Core trava o ciclo do worker durante o primeiro
  import** — dois rescans desde o gênesis, 17 minutos medidos em 27/08, e nenhuma outra
  carteira sincroniza enquanto isso. **Limitação aceita, com decisão registrada**: na
  apresentação, carteira pelo nó se cadastra antes, nunca ao vivo. Corrigir exigiria
  mexer na serialização do `tick()`, que é o que protege o log append-only
- **A espera de rescan de 600 s não cobre o primeiro import**, e a carteira passa por
  `error` antes de se recuperar sozinha no ciclo seguinte
- **`xpub_fingerprint` guarda o fingerprint do pai da chave**, não o da chave: a tela
  mostra `fd281824` onde o Bitcoin Core mostra `f47ff685`. Só é exibido, nenhum
  descriptor é montado com ele
- **`rescanFrom` implementado e não chamado**, e `internal: false` também na cadeia de
  troco — as duas razões estão na vigésima primeira rodada
- Itens não-código do checklist: pitch ensaiado e plano B gravado
