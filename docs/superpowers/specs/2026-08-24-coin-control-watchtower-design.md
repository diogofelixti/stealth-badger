# Stealth Badger — Design

> Watchtower de privacidade para Bitcoin: vigia endereços e carteiras, alerta sobre
> vazamentos de privacidade e orienta a gestão de UTXO.

**Data:** 2026-08-24 · revisado em 2026-08-25 com o briefing oficial
**Entrega:** 2026-08-28, das 19h às 22h (Zoom) — link do repositório no GitHub
**Acompanhamento:** 2026-08-26, das 19h às 20h (Zoom)
**Status:** design aprovado; briefing do hackathon analisado em `docs/hackathon-briefing.md`

---

## 1. Contexto e restrições

Projeto para hackathon de comunidade Bitcoin. Da noite de segunda até a manhã de
sexta restam **3 dias e meio úteis**. O produto precisa ser open source, rodar num
servidor Linux com login de usuários e administrador, e ser self-hostável.

Ambiente do desenvolvedor (levantado em 2026-08-24):

| Recurso | Estado |
|---|---|
| Bitcoin Core mainnet (`/mnt/isso/isso`) | sincronizado, altura 963.938, sem prune, **sem txindex**, RPC em `0.0.0.0:8332` |
| Bitcoin Core signet (`/mnt/dados2`) | sincronizado, altura 319.233, sem prune, **txindex pronto**, RPC em `0.0.0.0:38332` |
| Disco livre | 48 G em `/mnt/isso`, 35 G em `/mnt/dados2`, 118 G em `/` |
| Indexador Electrum | nenhum instalado |
| Toolchain | Node 20.20.2, npm 10.8.2, Python 3.12.3, Docker 29.4.0 — sem Go, sem Rust |

Duas consequências diretas:

- **Não indexar a mainnet.** electrs ou Fulcrum sobre a mainnet pedem 60–100 GB e
  12–24 h de indexação, com 48 G livres onde a chain mora. O ganho não paga o risco.
  Mainnet será servida por Esplora público — que é exatamente o modo com aviso de
  privacidade previsto no design. A limitação vira coerência.
- **O signet é o palco da demonstração.** Chain de 22 GB com txindex pronto: um
  electrs em container indexa em dezenas de minutos e cabe em `/`. Permite disparar
  uma transação real durante a apresentação e ver o alerta chegar ao vivo.

**Pendência de segurança do ambiente:** as portas RPC `8332` e `38332` escutam em
`0.0.0.0`. Se essa máquina for a que hospeda a aplicação exposta, amarrar em
`127.0.0.1` antes de sexta.

---

## 2. Tese do produto

O `am-i-exposed` (MIT, Copexit) já resolve a análise de privacidade: 31 heurísticas,
detecção de CoinJoin, base de 364 entidades conhecidas cobrindo mais de 30 milhões de
endereços, engine Boltzmann em Rust/WASM, varredura BIP44/49/84/86 completa, e é
distribuído como pacote npm com CLI e servidor MCP.

**Reimplementar essas heurísticas seria desperdiçar o prazo produzindo uma versão pior
de algo que já existe.** O projeto integra o `am-i-exposed` e constrói o que ele não
pode ser:

| `am-i-exposed` | este projeto |
|---|---|
| scanner client-side, uso pontual | **estado persistente** — histórico e evolução no tempo |
| sem backend, sem contas | **multi-usuário, self-hosted, com administrador** |
| o usuário precisa ir até ele | **ele vai até o usuário** — alertas |
| diagnostica | **vigia continuamente e prescreve ação** |

> **Tese:** o watchtower persistente e soberano que transforma análise pontual de
> privacidade em vigilância contínua e em decisão de coin control.

Princípio de design que decorre disso e vale para todo o projeto: **a aplicação não
sobe nó de ninguém.** Ela aponta para infraestrutura que já existe, e oferece
exploradores públicos como alternativa consciente e avisada.

---

## 3. Decisões tomadas

| Decisão | Escolha | Razão |
|---|---|---|
| Pilar herói | **Watchtower + alertas** | é o que justifica existir um servidor, e o que o `am-i-exposed` nunca poderá ser |
| Fonte de dados | **Adapter multi-backend** | público com aviso, ou nó próprio; Floresta contemplado |
| Multi-usuário | **Multi-tenant raso + admin mínimo** | `user_id` no schema desde o commit 1 é barato agora e doloroso de retrofitar depois |
| Stack | **TypeScript ponta a ponta** | `am-i-exposed` é npm nativo; fluência do dev; menos peças móveis |
| Núcleo de dados | **Log de eventos append-only + projeções** | reorg correto e score-no-tempo saem de graça |
| Empacotamento | **3 camadas: postgres, backend, frontend** + perfis opcionais | não é microserviço; permite habilitar só o necessário na infra |
| Proxy | **nginx** | escolha do dev; mais conservadora e conhecida |

---

## 4. Recorte do MVP

Tudo o que foi descrito não cabe em 3 dias. O recorte é a decisão central.

### Núcleo inegociável — sem isso não há demonstração

- Autenticação (senha + sessão), `user_id` no schema desde o início, flag `is_admin`
- Cadastro de carteira por xpub/ypub/zpub/vpub ou descriptor, com gap limit
- Adapter **Esplora** (público, com aviso) e adapter **Electrum** — este último cobre
  Electrs, Fulcrum e **Floresta** de uma vez só
- Sync engine com log de eventos e projeção de UTXO e saldo
- Motor de alertas com deduplicação, feed in-app ao vivo (SSE) e **ntfy**
- `docker compose up` funcionando do zero, e um README honesto

### Deve entrar — separa produto de protótipo

- **Alertas de privacidade, não só de movimento:** dust attack, reutilização de
  endereço, queda de score, fundos originados de entidade KYC conhecida
- Integração do `am-i-exposed`: score por carteira e principais achados
- Tabela de UTXO com labels e tags de proveniência
- **BIP-329 import/export** — interopera com Sparrow, Nunchuk, BlueWallet, Jade
- Painel de administrador mínimo
- Tratamento de reorg de verdade

> Se o tempo apertar, cortar da lista seguinte — **nunca desta**. Alertar sobre
> privacidade em vez de sobre saldo é a tese do produto; sem isso o projeto é um
> block explorer com login.

### Se sobrar tempo — nesta ordem

1. Regras "não gastar junto" e freeze de UTXO
2. Card de fingerprint por transação
3. Gráfico de privacy score ao longo do tempo
4. Canais Telegram e Nostr (NIP-17)
5. Adapter Bitcoin Core RPC direto

### Fora de escopo, explicitamente

- **Simulador de gasto e preflight de PSBT.** É a ideia mais forte levantada e a mais
  cara de construir. Vai para o roadmap do pitch como a próxima estrela.
- `chain-trace` multi-hop e estatísticas de anonymity set sobre janela de 20k blocos —
  peso computacional que não paga em 3 dias
- Quotas, convites, RBAC, internacionalização, SMTP

---

## 5. Arquitetura

### 5.1 Topologia de deploy

```
nginx      → TLS + roteia /api → backend e / → frontend
frontend   → SPA estática (React)
backend    → API + worker no mesmo processo; SSE para o feed ao vivo
postgres   → base
ntfy       [profile opcional]
tor        [profile opcional]
electrs    [profile dev — bancada do desenvolvedor, não faz parte do produto]
```

Os perfis opcionais são conveniência, nunca requisito. `ntfy` e `tor` servem a quem não
tem esses serviços; `electrs` existe apenas para o desenvolvedor indexar o próprio signet
e ensaiar o modo soberano — **não é oferecido como forma de o usuário rodar
infraestrutura Bitcoin.** Apontar para serviços externos já existentes é o caminho
principal, não o alternativo.

`docker compose up` sobe app apontando para Esplora público, com o aviso aceso.
`docker compose --profile ntfy up` adiciona notificação push self-hosted.
No ambiente do dev: `BITCOIN_RPC_URL=127.0.0.1:38332`, sem subir nó nenhum.

O worker vive dentro do backend por enquanto. Separá-lo depois custa uma linha —
mesma imagem, `command: npm run worker` — e nenhum Dockerfile novo.

**Configuração obrigatória do nginx para SSE.** Sem isto o feed de alertas ao vivo
quebra silenciosamente: não dá erro, os eventos só chegam atrasados ou em lote.

```nginx
location /api/stream {
    proxy_pass http://backend:3000;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 24h;
    add_header X-Accel-Buffering no;
}
```

### 5.2 Módulos do backend

Fronteiras desenhadas para que cada um seja compreensível e testável isoladamente.

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `chain/` | adapters por capacidade; fala com Esplora, Electrum, Core | — |
| `wallet/` | descriptors, derivação BIP32, gap limit, scripthash | — |
| `sync/` | reconciliação, detecção de reorg, emissão de eventos | `chain`, `wallet` |
| `events/` | log append-only e projeções (UTXO, saldo, score) | — |
| `alerts/` | regras, deduplicação, entrega por canal | `events` |
| `privacy/` | integração `am-i-exposed`, persistência de scans | `events` |
| `coincontrol/` | tags, labels, BIP-329, regras de gasto | `events` |
| `auth/` | usuários, sessões, admin, cifra de xpub | — |

---

## 6. Camada de chain

### 6.1 Os dois modelos de backend

A descoberta técnica mais importante do design: os backends suportados **não são
variações do mesmo modelo**. São dois modelos incompatíveis.

| | Indexados — Esplora, Electrs, Fulcrum | Registro + rescan — Floresta, Core watch-only |
|---|---|---|
| acesso | aleatório: histórico de um scripthash responde na hora | exige **registrar o descriptor antes** |
| histórico | já indexado | exige `rescan` a partir de uma altura, assíncrono |
| gap limit | sonda e recua rapidamente | cada extensão do gap pode exigir novo rescan |

O Floresta é um nó de validação completa com Utreexo e **servidor Electrum integrado**,
com `listdescriptors` e `rescan` via RPC, seguimento assíncrono de endereços novos ao
assinar, e endpoints experimentais `blockchain.scriptpubkey`. Por causa do servidor
Electrum embutido, **um único adapter Electrum bem-feito cobre Electrs, Fulcrum e
Floresta**.

### 6.2 Adapter por capacidades declaradas

Nivelar por baixo perde o subscribe do Electrum; assumir acesso aleatório quebra o
Floresta. Cada adapter declara o que sabe fazer, e o `sync/` escolhe a estratégia:

```ts
interface ChainCapabilities {
  randomAccess: boolean      // responde histórico de scripthash arbitrário na hora
  needsRegistration: boolean // exige registrar descriptor antes de seguir
  supportsSubscribe: boolean // push real, em vez de polling
  hasTxIndex: boolean        // consegue getrawtransaction de tx arbitrária
  isPublic: boolean          // dispara o aviso de privacidade na interface
}

interface ChainAdapter {
  capabilities(): ChainCapabilities
  tipHeight(): Promise<number>
  blockHashAt(height: number): Promise<string>
  getHistory?(scripthash: string): Promise<TxRef[]>        // se randomAccess
  registerDescriptor?(d: string): Promise<void>            // se needsRegistration
  rescanFrom?(height: number): Promise<RescanHandle>       // se needsRegistration
  subscribe?(scripthash: string, cb: Callback): Unsubscribe // se supportsSubscribe
}
```

### 6.3 Sync engine

**Gap limit.** Com backend indexado: deriva em lote, consulta histórico, estende
enquanto encontrar uso, recua ao atingir o gap. Com backend de registro: registra o
descriptor, dispara `rescanFrom`, acompanha progresso de forma assíncrona.

**Estado de carteira.** A diferença entre os modelos vaza para o domínio e para a
interface, e isso é intencional — a tela deve ser honesta em vez de fingir que já tem
os dados:

```
pending → importing(progress%) → synced → degraded → error
```

**Reorg.** Detectado comparando `blockHashAt(h)` com o hash registrado no log. Ao
divergir na altura `H`: marcar todos os eventos com `height >= H` como revertidos
(campo `rolled_back_by`), reprojetar UTXO e saldo, e emitir um alerta próprio de reorg.
O log append-only nunca é editado nem apagado.

---

## 7. Modelo de dados

Postgres. `JSONB` para payloads heterogêneos de evento, `LISTEN/NOTIFY` para empurrar
alerta novo do worker ao stream SSE sem polling, window functions para projetar score
ao longo do tempo.

```sql
users        (id, email, password_hash, is_admin, language, created_at)
sessions     (id, user_id, expires_at)

backends     (id, user_id NULL=global, kind, url, capabilities JSONB,
              is_public, created_at)

wallets      (id, user_id, label, descriptor, xpub_encrypted, script_type,
              network, gap_limit, backend_id, sync_state, sync_height, created_at)

addresses    (id, wallet_id, chain, index, derivation_path, address,
              scripthash, first_seen_height, is_used)

-- núcleo append-only: nunca sofre UPDATE de conteúdo nem DELETE
chain_events (id BIGSERIAL, wallet_id, type, height, block_hash, txid, vout,
              payload JSONB, occurred_at, rolled_back_by BIGINT NULL)

-- projeções derivadas de chain_events
utxos        (wallet_id, txid, vout, address_id, value_sats, height,
              script_type, spent_at_txid NULL, frozen,
              PRIMARY KEY (wallet_id, txid, vout))

labels       (wallet_id, ref_type, ref, label, origin)   -- compatível com BIP-329
tags         (id, wallet_id, name, color)                -- KYC, no-KYC, mining, coinjoin
utxo_tags    (wallet_id, txid, vout, tag_id)
spend_rules  (id, wallet_id, kind, group_key)            -- do_not_spend_together

alert_rules  (id, user_id, wallet_id NULL=todas, type, threshold JSONB, enabled)
alerts       (id, user_id, wallet_id, type, severity, params JSONB,
              dedupe_key UNIQUE, event_id, created_at, read_at, delivered JSONB)
channels     (id, user_id, kind, config_encrypted, enabled)

privacy_scans    (id, wallet_id, score, grade, findings JSONB, scanned_at, height)
tx_fingerprints  (txid, features JSONB, wallet_guess, computed_at)
```

`chain_events` é a fonte da verdade; `utxos` é cache reconstruível. Se a projeção
divergir, ela pode ser derrubada e reconstruída a partir do log.

### 7.1 Modelo bilíngue

Decidido em 2026-08-25: a interface é português e inglês desde o MVP. O texto que o
usuário lê nunca é gravado no banco nem embutido em código — o alerta guarda `type` e
`params`, e um catálogo transforma isso em frase.

```
alerts.type   = 'dust_received'
alerts.params = { "valueSats": 600, "address": "tb1q…306fyu" }

pt → "Chegaram {valueSats} sats de origem desconhecida em {address}.
      Dust é plantado para rastrear você no instante em que gastar."
en → "{valueSats} sats arrived from an unknown source at {address}.
      Dust is planted to trace you the moment you spend."
```

**Um catálogo só, servido pelo backend.** Os dois lados precisam dele: a tela para
renderizar, o worker para escrever a notificação de push. Duplicar as frases em dois
pacotes garante divergência. Como frontend e backend são contêineres separados com
builds independentes, um diretório compartilhado não sobrevive ao `COPY . .` de cada
Dockerfile. Então o backend é dono do catálogo e o expõe em `GET /api/i18n/:lang`; a
tela busca uma vez e guarda. Acrescentar um idioma vira um arquivo no backend, sem
rebuild do frontend.

**Push é renderizado no servidor**, com `users.language` — notificação não tem
seletor de idioma para o usuário clicar.

**Jargão de Bitcoin fica em inglês nos dois catálogos.** Ver Global Constraints do
plano de implementação.

---

## 8. Motor de alertas

### 8.1 Taxonomia de eventos

Alertar sobre movimento é o que qualquer explorer faz. O diferencial está nos quatro
últimos:

| Tipo | Severidade | Gatilho |
|---|---|---|
| `funds_received` | info | UTXO novo, em mempool → 1 conf → 6 confs |
| `funds_spent` | info | UTXO da carteira consumido |
| `reorg_detected` | warning | hash de bloco divergente na altura registrada |
| `dust_received` | **crítico** | UTXO abaixo do limiar, de origem desconhecida — provável dust attack; recomendar congelar |
| `address_reused` | **crítico** | endereço já usado recebeu de novo |
| `score_dropped` | warning | privacy score da carteira caiu além do limiar após uma transação |
| `kyc_origin` | warning | fundos vieram de entidade conhecida da base do `am-i-exposed` |

### 8.2 Deduplicação e idempotência

Sem isso, o usuário recebe três notificações da mesma transação e desinstala o produto.
Chave determinística com constraint `UNIQUE` no banco:

```
wallet:{wallet_id}:tx:{txid}:state:{mempool|conf1|conf6}
```

Mempool e confirmado geram alertas distintos **de propósito**; retentativa do worker,
reprocessamento e reinício do container não geram nada. A entrega por canal é
registrada em `alerts.delivered` para permitir reenvio sem duplicar o alerta.

### 8.3 Canais

MVP: **feed in-app via SSE**, **ntfy** e **webhook genérico**.
Stretch, nesta ordem: **Telegram bot**, **Nostr DM (NIP-17)**.
Fora: SMTP — é o mais chato de configurar numa demonstração.

---

## 9. Privacidade e coin control

### 9.1 Integração do am-i-exposed

Consumido como biblioteca npm (não subprocess), com resultado persistido em
`privacy_scans`. Reexecução disparada por: cadastro de carteira, transação nova
detectada, e sob demanda.

O que este projeto adiciona e o scanner original não pode ter: **o eixo do tempo.**
Cada scan é uma linha em `privacy_scans`; o gráfico de score por carteira ao longo dos
meses, com cada transação marcada como degrau para cima ou para baixo, é material
visual que nenhuma ferramenta equivalente oferece hoje.

> **Risco de dependência:** o pilar inteiro de privacidade depende dessa integração
> funcionar sob Node 20. Validar **na terça de manhã**, não na quinta. Ver §12.

### 9.2 Coin control

- Tabela de UTXO com valor, idade em blocos, endereço, caminho de derivação, tipo de
  script, transação de origem, label e tags
- **BIP-329 import e export** — interoperabilidade com Sparrow, Nunchuk, BlueWallet e
  Jade. Barato de implementar e transmite maturidade na avaliação
- Tags de proveniência: KYC, não-KYC, mineração, coinjoin, P2P
- **Regras "não gastar junto"** — marcar clusters que nunca podem aparecer no mesmo
  conjunto de inputs. Praticamente nenhuma carteira faz isso bem
- Freeze de UTXO, com sugestão automática para dust recebido

### 9.3 Fingerprints de transação

Vetor de features por transação, na linha do `lumen-fingerprints`: `nVersion`, classe
de `nSequence` (RBF opt-in, non-final, max, misto), classe de `nLockTime`
(**anti-fee-snipe denuncia Bitcoin Core**), ordenação BIP-69, **low-R grinding**,
uniformidade de tipos de script, arredondamento de fee e de valor, posição do troco,
UIH1 e UIH2.

Apresentado como card legível: *"anti-fee-snipe + low-R + BIP-69 → provavelmente
Bitcoin Core; nSequence 0xfffffffd → RBF ligado; feerate redondo → digitado à mão, não
saído de estimador."*

**Deliberadamente fora:** reproduzir as estatísticas de anonymity set sobre 20 mil
blocos. Peso computacional incompatível com o prazo. A leitura fica qualitativa.

---

## 10. Segurança e custódia de xpub

Um xpub revela saldo e histórico completos **para sempre**. Num ambiente multi-usuário,
guardá-lo em texto puro transforma um vazamento de banco em catástrofe permanente para
todos os usuários.

- **xpub cifrado em repouso** com AES-256-GCM, chave-mestra do servidor vinda de variável
  de ambiente. Protege contra o risco realista — dump de banco, backup vazado, Postgres
  mal exposto — e **não** contra comprometimento total do servidor. Declarar isso com
  essas palavras; ver a nota de modelo de ameaça abaixo

> **Nota de modelo de ameaça (corrigida em 2026-08-25).** Uma versão anterior deste
> design previa cifrar o xpub com chave derivada da senha do usuário, afirmando que o
> servidor não conseguiria lê-lo fora de uma sessão ativa. **Isso é incompatível com um
> watchtower:** se a chave só existe durante a sessão, o worker não consegue sincronizar
> enquanto o usuário está offline — exatamente quando a vigilância importa. O modelo
> adotado é chave-mestra do servidor.
>
> O caminho para um modelo mais forte, registrado como evolução futura: derivar e
> persistir apenas os *endereços* (dado público, que o worker precisa em claro de
> qualquer forma) e manter o xpub cifrado com a chave do usuário, exigindo sessão ativa
> só para estender o gap limit. Custo: recebimentos além da janela derivada passam
> despercebidos enquanto o usuário estiver ausente.
- Senhas com Argon2id; sessões opacas em banco, não JWT
- Configuração de canal (tokens de ntfy, Telegram) cifrada da mesma forma
- Aviso de privacidade **persistente** — badge no cabeçalho e estado por carteira, não
  um toast que some. O aviso é parte da identidade do produto, não um disclaimer legal
- Jitter no polling contra endpoints públicos; suporte a `.onion`
- Nenhuma chave privada, nenhuma seed, nenhuma capacidade de gasto entra no sistema

---

## 11. Plano de execução

Quatro dias, com um checkpoint no meio. Prazo real: **sexta 28/08 às 19h** — não a manhã
de sexta, como se supôs antes de ler o briefing.

### 11.0 Testes são contínuos, não uma etapa

`testes e validação` é critério de avaliação **e** entrega mínima obrigatória do
hackathon. Não existe "dia de escrever testes". TDD nas regras onde um bug é silencioso
e caro:

| Regra | Por que testar |
|---|---|
| deduplicação de alerta | falha silenciosa: usuário recebe 3 notificações da mesma tx |
| detecção e reversão de reorg | falha silenciosa: a interface mostra saldo errado com confiança |
| gap limit nos dois modelos de backend | falha silenciosa: fundos existem e não aparecem |
| projeção de UTXO a partir do log | é a fonte de todo o resto |
| parsing e emissão BIP-329 | interoperabilidade quebrada é constrangedora na demo |

### 11.1 Terça 25/08 — fundação
`docker compose` completo, Postgres com schema, autenticação e sessões, adapter
Esplora, derivação de descriptor com gap limit, primeira sincronização, tabela de UTXO
na tela. *Spike de validação do `am-i-exposed` logo cedo.*

### 11.2 Quarta 26/08 — o watchtower (herói) · **checkpoint às 19h**

Log de eventos e projeções, detecção de reorg, motor de alertas com deduplicação, canal
ntfy, feed SSE ao vivo, adapter Electrum.

**Meta dura:** às 19h da quarta existe um fluxo demonstrável ponta a ponta — cadastrar
carteira, sincronizar, receber alerta real do signet no celular. A sessão de
acompanhamento não é para mostrar slides.

### 11.3 Quinta 27/08 — privacidade e coin control

Integração do `am-i-exposed` e persistência de score, os quatro alertas de privacidade,
labels e tags, BIP-329, painel de administrador. Itens da lista "se sobrar tempo"
conforme a folga real.

### 11.4 Sexta 28/08 até as 18h — entrega

`README.md`, `docs/specification.md`, `.env.example`, varredura do `.gitignore` atrás de
segredos, seed de demonstração com carteiras pré-sincronizadas, **tornar o repositório
público**, ensaio cronometrado do pitch e gravação do vídeo de backup.

---

## 12. Pitch e demonstração — 10 minutos

O briefing fixa quatro partes obrigatórias: **problema + solução · arquitetura ·
demonstração ao vivo · limitações + próximos passos.** Sugestão de divisão:

| Parte | Tempo | Conteúdo |
|---|---|---|
| Problema + solução | 2 min | reutilização de endereço e má gestão de UTXO destroem privacidade, e ninguém avisa você |
| Arquitetura | 2 min | **uma frase justificando cada componente** — o slide 6 pede isso explicitamente |
| Demonstração ao vivo | 5 min | roteiro abaixo |
| Limitações + próximos passos | 1 min | critério pontuado; ver §13 e a lista "fora de escopo" da §4 |

### 12.1 Roteiro da demonstração ao vivo

1. Login. Painel vazio
2. Adicionar xpub de mainnet com histórico ruim → **modo público, badge de aviso aceso**
3. `am-i-exposed` roda: score baixo, achados de reutilização de endereço, consolidação
   e origem KYC
4. Tabela de UTXO: tags de proveniência, dust destacado e congelado
5. Adicionar carteira de signet → **modo soberano, badge apagado**, apontando para o nó
   local do apresentador
6. **Clímax:** faucet dispara transação real no signet → o watchtower detecta → a
   notificação chega no celular, ao vivo, no palco
7. Exportar BIP-329 e abrir o arquivo no Sparrow
8. Roadmap: simulador de gasto e preflight de PSBT

O ponto 5 combinado com o 2 é o argumento central: **as duas posturas de privacidade
demonstradas lado a lado, na mesma aplicação.** O adapter deixa de ser arquitetura
abstrata e vira a tese.

---

## 13. Riscos e planos B

| Risco | Probabilidade | Plano B |
|---|---|---|
| Integração do `am-i-exposed` falhar sob Node 20 | média | validar no spike de terça de manhã; recuo é chamar a CLI por subprocess |
| electrs do signet não indexar a tempo | média | usar Esplora público de signet — demonstra o adapter, perde o "soberano" |
| Rede do evento cair no clímax | média | vídeo de backup gravado na quinta |
| xpub grande demorar a sincronizar na demo | alta | carteiras da demonstração pré-carregadas e sincronizadas antes |
| Escopo de sexta não fechar | **alta** | ordem de corte já definida na §4; cortar de baixo para cima |

O maior risco do projeto não é técnico, é de escopo. O recorte da §4 existe para ser
obedecido sob pressão, não para ser renegociado na quinta à noite.

---

## 14. Questões abertas

Resolvidas em 2026-08-25 com a leitura do briefing oficial (ver `docs/hackathon-briefing.md`):

- ~~formato exigido~~ → "monitoramento" está na lista de formatos aceitos
- ~~tempo de pitch~~ → 10 minutos, com quatro partes obrigatórias
- ~~repositório público~~ → sim, a entrega oficial é o link do GitHub
- ~~nome do projeto~~ → **Stealth Badger**

Ainda em aberto:

1. Identidade visual — paleta, logo, tom da interface
2. O simulador de PSBT continua fora de escopo. Reavaliar apenas se o watchtower fechar
   antes do previsto na quinta
3. Licença do repositório — MIT é a escolha natural por compatibilidade com o
   `am-i-exposed`, mas não foi decidida formalmente

## 15. Referências

- [`am-i-exposed`](https://github.com/Copexit/am-i-exposed) — MIT, scanner de privacidade; npm, CLI e servidor MCP
- [`lumen-fingerprints`](https://fungi-protocol.github.io/lumen-fingerprints/) — heurísticas de fingerprint de transação
- [Floresta](https://github.com/vinteumorg/Floresta) — nó de validação completa com Utreexo e servidor Electrum integrado
- BIP-329 — formato de exportação de labels de carteira
- BIP-32 / 44 / 49 / 84 / 86 — derivação e tipos de script
