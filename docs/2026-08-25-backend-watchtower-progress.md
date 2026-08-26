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

## Roteiro da demonstração — estado real, conferido em 26/08

O roteiro da §12.1 do design é a intenção. Isto é o que sobe no palco.

| Passo do roteiro original | Estado |
|---|---|
| 1. Login, painel vazio | **funciona** — conferido em navegador em 26/08 |
| 2. xpub → modo público, badge de aviso aceso | **funciona** |
| 3. `am-i-exposed`: score e achados | **funciona desde 26/08** — botão no cartão, 78 s, score e achados persistidos |
| 4. Tabela de UTXO com tags de proveniência, dust congelado | **funciona desde 26/08** — rótulo, tags, congelamento e dust destacado |
| 5. Segunda carteira em modo soberano, lado a lado com a pública | **possível desde 26/08**, na mesma rede — falta um servidor Electrum de verdade rodando. `NETWORK` único ainda impede mainnet e signet juntas |
| 6. Transação real no signet → alerta no celular | **funciona** — é o que foi validado ponta a ponta |
| 7. Exportar BIP-329 e abrir no Sparrow | **exporta e importa desde 26/08** — falta abrir o arquivo no Sparrow de verdade |
| 8. Roadmap | falar |

O passo 6 é o clímax e está de pé. O passo 5 é chamado no design de argumento central,
e é o que motiva a seleção de backend a entrar no escopo.

### Roteiro alternativo, se nada mais for construído

Login → cadastrar a carteira de signet → selo de explorador público aceso e preso ao
topo → o feed mostra `address_reused` e `dust_received` disparados por transação real →
faucet dispara nova transação → alerta chega no celular ao vivo → roadmap honesto.

Perde o contraste das duas posturas e perde o coin control, mas sustenta a tese: alertar
sobre privacidade, não sobre saldo.

## Pendências

### Em execução

- **Nada.** Os sete tipos da taxonomia da §8.1 estão implementados.

### Reconhecidas e adiadas, com razão registrada

- **Análise de origem disparada pelo worker**, e não só pelo botão. O gatilho da §9.1
  prevê "transação nova detectada"; hoje só o clique dispara. Precisa de fila própria,
  senão um `scan tx` de cinco segundos por depósito estica o ciclo de sincronização
- **Campo de busca de endereços** — barato, mas não muda a avaliação

### Técnicas

- **O adapter Electrum ainda não completou uma consulta contra servidor real.**
  Tentado em 26/08 contra um ElectrumX público de signet: conectou e negociou, mas o
  servidor passou a não responder depois de algumas conexões. O protocolo segue coberto
  por servidor de teste local — resposta partida em pedaços, notificação sem id, erro
  devolvido pelo servidor, e servidor que aceita e fica calado
- **Uma falha isolada na suíte do frontend**, em `Dashboard > anuncia postura pública`,
  numa execução entre quinze. Não reproduziu depois, e a máquina construía imagem
  Docker no mesmo instante. Fica anotada em vez de dada por resolvida: intermitência
  que não se explica costuma voltar
- Varredura ainda sequencial: um endereço de cada vez. Paralelizar cortaria o tempo
  mas concentraria a rajada, e o adapter Esplora segue sem backoff para o `429`
- `utxo_spent` continua gravado na altura da ponta e sem a transação que gastou
- Itens não-código do checklist: repositório público antes de 28/08 19h, pitch
  ensaiado, plano B gravado
