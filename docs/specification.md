# Especificação — Stealth Badger

Comportamento esperado do sistema. Este é o documento canônico do **que** o Stealth
Badger faz; o **como** (arquitetura, schema, decisões) está em
[`superpowers/specs/2026-08-24-coin-control-watchtower-design.md`](superpowers/specs/2026-08-24-coin-control-watchtower-design.md).

Documento vivo, escrito em 25/08/2026. A §12 registra honestamente o que ainda não
existe — nenhum comportamento descrito nas §§1–11 é aspiracional: tudo ali está
implementado e coberto por teste.

---

## 1. O que o produto é

Um **watchtower de privacidade para Bitcoin**. Vigia endereços e carteiras watch-only
e avisa quando a privacidade de quem as usa vaza.

> Alertar sobre privacidade, e não sobre saldo, é a tese. Saldo qualquer explorador
> mostra.

Open source, self-hostável, multi-usuário.

### 1.1 O que o sistema nunca faz

Estas não são limitações a corrigir; são garantias de projeto.

| Nunca | Por quê |
|---|---|
| aceita chave privada, seed ou qualquer material de gasto | watch-only é o modelo de ameaça inteiro |
| sobe nó de Bitcoin | aponta para a infraestrutura que o usuário já tem |
| assina, transmite ou constrói transação | não há caminho de gasto no código |
| devolve o xpub por qualquer rota da API | nem para o dono da carteira |

---

## 2. Atores

- **Usuário** — cadastra carteiras watch-only e recebe alertas. O primeiro a se
  registrar vira admin.
- **Worker** — laço interno que sincroniza carteiras a cada **30 segundos**, sem
  usuário logado.
- **Backend de cadeia** — serviço externo (Esplora) consultado para histórico e UTXOs.
  Pode ser público ou próprio; o sistema trata os dois casos de forma diferente e
  visível.

---

## 3. Autenticação e sessão

| Comportamento | Esperado |
|---|---|
| registro | `POST /api/auth/register` com e-mail, senha e idioma |
| senha mínima | 12 caracteres |
| hashing | Argon2id |
| primeiro usuário | recebe `is_admin` |
| login | `POST /api/auth/login` devolve cookie `sb_session` |
| cookie | `httpOnly`, `sameSite=lax`, validade de 30 dias |
| token no banco | apenas o `sha256` do token; o valor em claro só existe no cliente |
| sessão expirada | tratada como não autenticada |
| rota protegida sem sessão | `401` com `{"error": "não autenticado"}` |

O idioma é persistido **no usuário**, não só no navegador, porque a notificação push é
renderizada no servidor, quando não há navegador nenhum.

---

## 4. Cadastro de carteira

`POST /api/wallets` com `label` e `key`.

### 4.1 Chaves aceitas

`xpub`, `ypub`, `zpub` (mainnet) e `tpub`, `upub`, `vpub` (testnet/signet).

A chave é normalizada para a codificação canônica (`xpub` ou `tpub`) antes de ser
cifrada e guardada.

### 4.2 Como o tipo de script é determinado

O tipo nunca é perguntado ao usuário. Para as codificações da SLIP-132 ele é lido das
*version bytes*:

| Prefixo | Script |
|---|---|
| `ypub` / `upub` | `p2sh-p2wpkh` |
| `zpub` / `vpub` | `p2wpkh` |

**`xpub` e `tpub` são um caso à parte: eles não dizem o tipo de script.** A SLIP-132 os
atribui a BIP-44 legado, mas Bitcoin Core e Sparrow nunca a adotaram — trabalham com
*output descriptors*, onde o tipo vive fora da chave — e exportam `tpub` puro para
legado, segwit aninhado, native segwit e taproot indistintamente.

Tratar esse palpite como certeza produz a pior classe de defeito que este projeto
admite: a carteira é aceita, deriva endereços que nunca existiram, sincroniza até
`synced` e mostra **saldo zero sem erro nenhum**.

Por isso, quando a chave é ambígua, o sistema **descobre o tipo perguntando à cadeia**:
deriva os três primeiros endereços de cada tipo candidato e adota aquele que tem
histórico. A ordem de tentativa é `p2wpkh`, `p2sh-p2wpkh`, `p2pkh`, `p2tr`.

Se nenhum candidato tem histórico, a carteira é nova e não há o que detectar: o sistema
assume **`p2wpkh`**, que é o que qualquer carteira criada hoje usa.

### 4.3 Recusas, todas com mensagem acionável

| Entrada | Resposta |
|---|---|
| chave privada estendida (`xprv`, `yprv`, `zprv`, `tprv`, `uprv`, `vprv`) | `400` — explica que o sistema é watch-only e pede a chave pública |
| chave de rede diferente da vigiada | `400` — nomeia as duas redes: *"esta chave é de mainnet, mas este watchtower vigia signet"* |
| base58check inválido, tamanho ≠ 78 bytes, version bytes desconhecidas | `400` descrevendo o defeito |
| rótulo vazio | `400` |

A recusa por rede errada existe porque um backend Esplora atende **uma rede só**.
Aceitar a chave da outra rede faria o watchtower derivar endereços que o explorador
recusa, e a carteira morreria em `error` sem dizer o motivo — falha silenciosa no
lugar exato onde ainda dá para explicar o problema.

### 4.4 Resposta

`201` com `id`, `label`, `scriptType`, `network`, `fingerprint` e `syncState: "pending"`.
**Nunca** contém o xpub.

---

## 5. Derivação e varredura

- Endereços derivados nas cadeias `0` (recebimento) e `1` (troco).
- **Gap limit** padrão de **20**: a varredura para depois de 20 endereços consecutivos
  sem histórico.
- Derivação validada contra os vetores da **BIP-84**.
- As *version bytes* usadas para ler a chave vêm da própria chave, não da rede vigiada:
  como a chave é lida e como o endereço é escrito são coisas independentes.
- Para cada endereço é calculado também o **scripthash no formato Electrum**
  (`sha256(scriptPubKey)` com os bytes invertidos), que o adapter Electrum usará.

---

## 6. Sincronização e reorganização de cadeia

A cada tick, para cada carteira:

1. Abre o xpub cifrado.
2. **Verifica reorg antes de sincronizar**, comparando hashes de bloco registrados
   contra o backend.
3. Varre as duas cadeias por gap limit.
4. Persiste endereços e grava eventos.
5. Reprojeta os UTXOs.
6. Atualiza `sync_state` e `sync_height`.

### 6.1 Só se reconfere o que mudou

Perguntar tudo de novo a cada 30 segundos é caro para quem vigia e abusivo para o
explorador público. O adapter oferece um **resumo barato** do endereço:

```ts
getAddressStatus?(address: string): Promise<{ used: boolean; status: string | null }>
```

`status` é **opaco** — só se compara por igualdade com o guardado em
`addresses.status`. No Esplora ele é montado dos seis contadores de `/address/:a`:
transações, saídas criadas e saídas gastas, na cadeia e no mempool. Os seis juntos
são necessários: gastar não muda `tx_count` sozinho, e confirmar move a contagem de
um lado para o outro sem mexer no total.

Status repetido significa que nada aconteceu naquele endereço, e a lista de UTXO
dele não é pedida de novo.

Três consequências que o código trata explicitamente:

- **Sumiço deixa de bastar para declarar gasto.** Antes, um UTXO conhecido que não
  aparecesse na lista virava `utxo_spent`; com endereços pulados, isso esvaziaria a
  carteira inteira num ciclo silencioso. Agora o gasto exige que o endereço tenha
  sido **de fato perguntado** naquela volta — o que também cobre o caso, já
  existente, do endereço que sai da janela do gap.
- **O status é gravado depois dos eventos**, para que um ciclo interrompido no meio
  não deixe o endereço marcado como conferido e pulado para sempre.
- **Reorg descarta os status guardados**, que passariam a descrever uma cadeia que
  não existe mais.

Um backend sem `getAddressStatus` cai no caminho antigo, pelo histórico completo, e
nada é pulado.

Medido contra a signet, na mesma carteira de 77 endereços e 31 usados:

| | requisições | tráfego | tempo |
|---|---|---|---|
| varrendo tudo | 109 | 11.029 KB | 62 s |
| reconferindo o que mudou | 79 | 21 KB | 18–27 s |

O tráfego cai porque `/address/:a/txs` devolve as transações inteiras enquanto
`/address/:a` devolve só os contadores. Os scripts da medição estão em
`backend/scripts/`.

### 6.2 Estados da carteira

`pending` → `importing` → `synced`, ou `degraded` / `error`.

Carteira já sincronizada **não volta a `importing`** para reconferir: o selo ficaria
piscando a cada ciclo, e o usuário leria como uma importação que nunca termina.

Falha do backend marca a carteira como `error` e grava `sync_error`. A falha é
**isolada por carteira**: uma carteira quebrada não impede as outras de sincronizar.

### 6.3 Reorg

Reorganização **nunca apaga evento**. O sistema grava um evento `reorg_detected` e
marca os eventos afetados com `rolled_back_by`. Consultas de estado ignoram eventos
revertidos.

É por isso que o tratamento de reorg é correto por construção, e não remendado: o
estado é uma projeção reconstruível de um log que só cresce.

---

## 7. Log de eventos e projeção

`chain_events` é **append-only**. Nunca sofre `UPDATE` de conteúdo nem `DELETE`.

Tipos de evento: `utxo_created`, `utxo_spent`, `reorg_detected`.

Tudo o mais — conjunto de UTXOs, saldo, contagem de UTXOs congelados — é **projeção
reconstruível** a partir do log. A projeção é **idempotente**: reconstruir duas vezes
produz exatamente o mesmo estado.

Saldo é a soma dos UTXOs não gastos.

---

## 8. Motor de alertas

### 8.1 Tipos implementados

| Tipo | Severidade | Dispara quando |
|---|---|---|
| `funds_received` | `info` | UTXO criado |
| `funds_spent` | `info` | UTXO gasto |
| `dust_received` | `critical` | UTXO recebido com valor **abaixo de 1000 sats** |
| `address_reused` | `warning` | chega valor em endereço que já tinha sido usado |
| `reorg_detected` | `warning` | divergência de hash de bloco |

**Por que poeira é crítica e reuso é atenção:** crítico se reserva ao que ainda dá para
evitar. Poeira plantada pede ação imediata — não gastar aquele UTXO. Reuso de endereço
já aconteceu e o dano é permanente; avisa, mas não disputa atenção com o que ainda tem
conserto.

### 8.2 Deduplicação

Sem dedupe, um alerta reapareceria a cada 30 segundos e o produto seria inútil.

A chave é determinística: `wallet:{id}:tx:{txid}:state:{estado}`, onde o estado de
confirmação é `mempool`, `conf1` (1 a 5 confirmações) ou `conf6` (6 ou mais).

Consequências desejadas:

- o mesmo evento no mesmo estado **nunca** gera dois alertas;
- a mesma transação **avançando** de `mempool` para `conf1` para `conf6` gera um alerta
  novo em cada transição, porque é informação nova;
- a persistência usa `ON CONFLICT (dedupe_key) DO NOTHING` — o banco é a autoridade
  final, não a memória do processo.

### 8.3 O alerta não guarda texto

Um alerta persiste apenas `type` e `params`. O texto é escolhido **na hora de exibir**,
no idioma de quem lê. Trocar de idioma reescreve o histórico inteiro do feed, porque
não havia texto guardado para ficar desatualizado.

---

## 9. Entrega

| Canal | Comportamento |
|---|---|
| **Feed ao vivo (SSE)** | `GET /api/stream`. O backend usa `LISTEN/NOTIFY` do Postgres; o alerta aparece na tela **sem recarregar e sem polling** |
| **ntfy** | push renderizado no servidor, no idioma do usuário |
| **webhook** | POST genérico para integração |

O listener SSE reconecta sozinho se a conexão cair, e um erro no cliente Postgres nunca
derruba o processo.

**Requisito de infraestrutura:** o endpoint de SSE precisa de `proxy_buffering off` no
nginx. Sem isso o feed ao vivo quebra **silenciosamente** — a conexão abre, os
cabeçalhos chegam, e nenhum evento aparece.

---

## 10. Privacidade como comportamento observável

### 10.1 O aviso é permanente

Quando o backend de cadeia é um explorador público, ele enxerga quais endereços o
usuário consulta. O sistema trata isso como um estado que precisa estar visível **o
tempo todo**, nunca como um toast que some:

- uma **listra aposemática** no topo de todas as telas;
- um **selo** nomeando a postura (`Explorador público` / `Soberano`) e o host
  consultado.

Os dois saem da mesma fonte de verdade, para que nenhuma tela consiga mostrar um sem o
outro, e ficam **presos ao topo**. Estar no topo não basta: o painel com histórico
passa de cinco mil pixels de altura, e um aviso que a rolagem leva embora é o mesmo
toast que some, disfarçado.

### 10.2 Idioma

Catálogo bilíngue PT/EN servido por `GET /api/i18n/:lang`, com substituição de `{param}`,
formatação numérica por idioma (`10.000` em pt, `10,000` em en) e parâmetros que
referenciam outra chave do catálogo via `@chave`.

---

## 11. Configuração

Toda configuração sensível vive em `.env`, documentada em `.env.example` com valores de
exemplo — jamais reais.

| Variável | Efeito |
|---|---|
| `MASTER_KEY_HEX` | 32 bytes em hex. Cifra os xpubs em repouso |
| `NETWORK` | `mainnet`, `signet` ou `testnet`. Define que chaves o sistema aceita |
| `CHAIN_BACKEND` | `esplora` ou `electrum` |
| `ESPLORA_URL` | backend de cadeia quando `CHAIN_BACKEND=esplora` |
| `ELECTRUM_URL` | `electrum://host:porta` quando `CHAIN_BACKEND=electrum` |
| `PUBLIC_BACKEND` | governa o aviso persistente de privacidade |

### 11.1 O backend é escolhido por carteira

`CHAIN_BACKEND` e companhia definem o backend **da instância** — o que a tela oferece
por padrão e o que uma carteira usa quando nada é dito. Além dele, cada usuário
cadastra os seus:

| Rota | Efeito |
|---|---|
| `GET /api/backends` | lista o backend da instância mais os do usuário. Cria o da instância se ainda não existir, para que a tela nunca receba lista vazia |
| `POST /api/backends` | cadastra backend do usuário. Valida o esquema contra o protocolo — `http(s)://` para Esplora, `electrum://` para Electrum |
| `POST /api/wallets` | aceita `backendId`. Ausente, usa o da instância. De outro usuário, recusa |

Backend inexistente e backend de outra pessoa recebem **a mesma recusa**, de propósito:
distinguir os dois contaria a um usuário quais ids existem no banco de outro.

O backend é resolvido **antes** da detecção de tipo de script, porque é ele que
responderá a consulta. Detectar por um e vigiar por outro perguntaria à cadeia em dois
lugares sem motivo — e, se um deles for público, exporia os endereços a mais um
observador do que o necessário.

#### A postura anunciada passa a ser agregada

Com backend por carteira, o selo do topo não pode mais ser o da primeira carteira da
lista: seria mentira assim que duas discordassem. A regra é conservadora e vale para a
sessão inteira — **basta uma** carteira passando por explorador público para que a
postura anunciada seja pública, porque a exposição existe. Quando mais de um explorador
expõe, a linha conta quantos em vez de eleger um.

Cada cartão de carteira nomeia o seu próprio backend. É ali que o contraste entre uma
carteira exposta e uma soberana fica visível lado a lado.

> **Limitação:** a instância ainda vigia **uma rede só** (`NETWORK`). Dá para contrastar
> as duas posturas — explorador público contra nó próprio — mas ambas na mesma rede.

### 11.2 Dois backends de cadeia

**Esplora**, por HTTP, é o caminho do explorador público — cômodo e observável por
terceiro. **Electrum**, JSON-RPC por TCP, é o caminho de quem já roda infraestrutura:
um adapter só atende Electrs, Fulcrum e Floresta, porque o florestad embute um
servidor Electrum.

O tipo do backend é dado do banco, não escolha costurada em cada ponto de uso: o
motor de sincronização e o cadastro de carteira montam o adapter pelo mesmo caminho,
a partir da coluna `backends.kind`.

O adapter Electrum recebe **endereço** e deriva o scripthash internamente. A
alternativa — expor scripthash na interface — vazaria detalhe do protocolo Electrum
até o motor de sincronização, e custaria a um Esplora ter de conhecê-lo.

`PUBLIC_BACKEND` sem valor assume público no Esplora e soberano no Electrum, que é o
uso corrente dos dois. Quem aponta para um Esplora próprio, ou para um servidor
Electrum de terceiro, precisa dizer — é o aviso de privacidade da tela que depende
disso.

### 11.3 Custódia do xpub

O xpub é cifrado com **AES-256-GCM** sob a chave-mestra do servidor.

Não é chave derivada da senha do usuário, e a razão é concreta: o worker sincroniza com
o usuário deslogado, e não teria como abrir o xpub. A consequência é explícita e
assumida — **quem tem o banco *e* a chave-mestra enxerga os xpubs vigiados**. É por isso
que o projeto é self-hostável e que a chave nunca é versionada.

---

## 11.4 Análise de privacidade

O `am-i-exposed` (MIT) é chamado **como CLI, por subprocess**. O pacote publica só
`bin`, sem `main` nem `exports`: não há biblioteca para importar.

Três decisões que o resultado depende:

- **Vai um descriptor, nunca a chave crua.** Um `tpub` não declara tipo de script; o
  scanner assume legado, deriva endereços que nunca existiram e devolve um relatório
  bem formatado dizendo que a carteira está vazia. Medido contra a signet: 32 UTXOs
  reais, relatório anunciando zero. É a pior forma de errar, porque não parece erro.
- **`--api` aponta para o mesmo backend que vigia a carteira.** Sem isso o scanner
  consulta o explorador público dele, e os endereços ficam expostos a um segundo
  observador que o usuário nunca escolheu — dentro da ferramenta que existe para
  avisar sobre exatamente isso.
- **O campo `links` da saída é descartado.** Ele traz uma URL de site de terceiro com
  o xpub embutido. Guardar ou exibir seria convidar o usuário a colar a chave fora
  daqui.

A análise leva por volta de **78 segundos** contra a signet, porque o scanner faz a
própria varredura por gap limit. Por isso `POST /api/wallets/:id/scan` responde `202` e
o trabalho segue em segundo plano: segurar a conexão entregaria a decisão a um timeout
de proxy, e o usuário veria "erro" numa análise que estava indo bem. Uma segunda
chamada durante a primeira não dispara nada.

`privacy_scans` é **append-only**, como `chain_events` e pela mesma razão: o que este
projeto acrescenta ao scanner original é o eixo do tempo. Sobrescrever o resultado
anterior transformaria "o score caiu depois daquela consolidação" num número solto.

> **Empacotamento:** o scanner depende do `better-sqlite3`, módulo nativo sem prebuild
> para musl. O `Dockerfile` do backend ganhou um estágio com `python3 make g++` para
> compilá-lo; o compilador não viaja para a imagem final. Sem isso o build morre em
> "Could not find any Python installation", erro que não menciona nem o scanner nem o
> sqlite.

---

## 12. O que ainda não existe

Escrito para ser lido antes que alguém pergunte.

### 12.1 Não implementado

| Item | Situação |
|---|---|
| **`registerDescriptor` / `rescanFrom`** | caminho de Bitcoin Core e Floresta; previstos na interface, sem implementação |
| **Vigiar endereço avulso**, fora de carteira | `addresses`, `chain_events`, `utxos` e `alerts` são todos ancorados em `wallet_id` |
| **Busca de endereços** | não há rota nem tela |
| **Alertas sobre endereços sancionados** | fora de escopo por decisão; ver §4 do design |
| **Alertas `score_dropped` e `kyc_origin`** | a análise já roda e é persistida; falta transformar a variação de score e os achados de origem em alerta |
| **Coin control** (rótulos, tags, regras de gasto, BIP-329) | modelado, não construído |
| **Fingerprints de transação** | não construído |
| **Limiar de poeira configurável** | fixo em 1000 sats; não há tabela `alert_rules` |

### 12.2 Limitações conhecidas do que existe

- **`utxo_spent` é gravado na altura da ponta e sem a transação que gastou.** Coin
  control precisará desse dado.
- **O adapter Esplora não tem backoff contra o `429`** do explorador público.
- **O adapter Electrum não foi exercido contra um servidor Electrum de verdade.**
  O protocolo é coberto por um servidor de teste local que fala JSON-RPC por TCP —
  incluindo resposta partida em vários pedaços, notificação sem id e erro devolvido
  pelo servidor — mas nenhum Electrs, Fulcrum ou florestad rodou contra ele ainda.
- **A varredura continua sequencial.** Um ciclo pergunta por um endereço de cada vez,
  e o tempo é dominado pela latência do explorador público. Paralelizar cortaria o
  tempo, mas concentraria a rajada — e o adapter ainda não tem backoff para o `429`.
- **Mensagens de erro da API saem só em português**, embora a interface seja bilíngue.
- **A interface é de duas telas** — login e um dashboard único. Não há navegação nem
  menus; não há uma terceira tela para onde ir.

---

## 13. Como verificar

Testes são critério de avaliação do hackathon e entrega obrigatória. O TDD foi aplicado
onde a falha é **silenciosa** — o caso em que um bug não se anuncia:

deduplicação de alerta, detecção de reorg, gap limit, projeção de UTXO, derivação HD,
cifra em repouso e reconexão do listener SSE.

```bash
cd backend && npm test     # 22 arquivos, 184 testes
npx tsc --noEmit           # sem erros
```

A suíte trunca o banco inteiro entre os casos, e por isso **recusa rodar contra um
banco que não termine em `_test`**. O vitest monta a URL sozinho a partir do `.env`;
o banco é criado uma vez:

```bash
docker exec coin-controll-postgres-1 \
  psql -U badger -d postgres -c 'CREATE DATABASE stealth_badger_test OWNER badger'
```

### 13.1 Verificação ponta a ponta executada em 25/08/2026

Contra a signet real, via `https://mempool.space/signet/api`:

| Comportamento | Observado |
|---|---|
| carteira por `vpub` sincroniza | `synced`, altura 319333, acompanhando a ponta real |
| gap limit varre | 42 endereços `tb1q…` derivados |
| projeção de saldo | 11.000 sats, 2 UTXOs, a partir do log |
| alerta de privacidade dispara sozinho | `address_reused` gerado a partir de movimentação real |
| dedupe segura | 3 alertas mantidos ao longo de vários ticks |
| feed ao vivo pelo nginx | primeiro byte em **+0s**, `X-Accel-Buffering: no` |
| chave de rede errada | recusada no cadastro |
| stack completa | `docker compose up -d --build` sobe os 5 containers |
