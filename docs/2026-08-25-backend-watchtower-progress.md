# Registro de progresso - backend watchtower

Data: 2026-08-25

## Contexto

Este registro documenta o trabalho realizado depois da Task 1, mantendo a Task 2 de frontend/design parada para revisão humana/Claude Code, conforme combinado.

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

A Task 2 permanece parada conforme combinado. O scaffold de frontend ainda depende de aprovação humana/Claude Code do dashboard e dos tokens visuais.

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
  aprovado: crítico fica reservado à poeira plantada, que ainda dá para evitar.
- Vite passou a escutar em todas as interfaces, para conferência de outra
  máquina da rede local.

Pendências conhecidas e aceitas: `utxo_spent` é gravado na altura da ponta e sem
a transação que gastou (Plano 2 precisa disso para coin control), e o adapter
Esplora não tem backoff contra o 429 do explorador público.

### Suíte depois das correções

18 arquivos de teste, 117 testes, typecheck limpo.
