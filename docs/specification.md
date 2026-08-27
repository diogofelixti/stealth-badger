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
| varrendo tudo, uma de cada vez | 109 | 11.029 KB | 62 s |
| reconferindo o que mudou, uma de cada vez | 79 | 21 KB | 18–27 s |
| reconferindo o que mudou, cinco de cada vez | 87 | 23 KB | **6 s** |

As oito requisições a mais da última linha são o preço de sondar em bloco: a condição
de parada do gap limit é reavaliada ao fim de cada bloco de cinco, então a varredura vai
no máximo quatro endereços além de onde iria sozinha.

O tráfego cai porque `/address/:a/txs` devolve as transações inteiras enquanto
`/address/:a` devolve só os contadores. Os scripts da medição estão em
`backend/scripts/`.

### 6.2 Estados da carteira

`pending` → `importing` → `synced`, ou `degraded` / `error`.

Carteira já sincronizada **não volta a `importing`** para reconferir: o selo ficaria
piscando a cada ciclo, e o usuário leria como uma importação que nunca termina.

Falha do backend marca a carteira como `error` e grava `sync_error`. A falha é
**isolada por carteira**: uma carteira quebrada não impede as outras de sincronizar.

### 6.3 Gasto: o que se sabe e o que não se inventa

Quando um UTXO conhecido some da lista, o backend é perguntado **quem o gastou** —
`/tx/:txid/outspend/:vout` no Esplora. Sabendo, o evento registra a transação, a altura
e o hash de bloco reais. Não sabendo, registra `null`.

Antes o evento gravava a altura da ponta e a palavra `desconhecido` no lugar do txid.
Altura errada num log append-only é pior que altura ausente: a **detecção de reorg
compara exatamente esses pares de altura e hash**, e passaria a comparar um par que
nunca descreveu o gasto.

Isso obrigou a separar duas coisas que estavam na mesma coluna. `utxos.spent` diz que o
gasto aconteceu; `utxos.spent_at_txid` diz por quem, e pode ser nulo sem que isso
signifique "ainda tenho o dinheiro".

### 6.4 Reorg

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
| `score_dropped` | `warning` | privacy score caiu **5 pontos ou mais** entre duas análises |
| `kyc_origin` | `warning` | a transação que trouxe fundos aponta origem em entidade conhecida |

Os dois últimos **não nascem de evento de cadeia**, e isso muda o que eles podem
afirmar.

`score_dropped` nasce de o scanner ter olhado a carteira duas vezes e visto piora, e
por isso grava `event_id` nulo: amarrá-lo a um evento seria inventar uma causa que
ninguém verificou. O limiar de cinco pontos existe porque o scanner reavalia a carteira
inteira a cada execução, e variação de um ou dois pontos é ruído de heurística —
alertar sobre ruído ensina o usuário a ignorar o alerta. A primeira análise nunca gera
queda: tratar a ausência de anterior como "era 100" produziria alerta em toda carteira
recém-cadastrada.

`kyc_origin` nasce de analisar **a transação**, não a carteira: `scan xpub` só emite
achados sobre a forma da carteira, e quem mandou os fundos só aparece em `scan tx`. Ele
aponta para o `utxo_created` que trouxe os fundos, porque ali existe causa concreta.

#### O que o alerta de origem pode e não pode afirmar

O scanner separa **correspondência na base de entidades** de **heurística sobre a forma
da transação**, e declara a própria confiança em cada achado. Achatar essa diferença
faria o watchtower afirmar o que ninguém verificou, então ela viaja até o texto:

| Base | Frase | Exemplo de achado |
|---|---|---|
| `database` | "foi reconhecida pela base de entidades do scanner como" | `entity-known-input`, `entity-ofac-match` |
| `behavior` | "tem forma compatível com" | `entity-behavior-exchange`, `exchange-withdrawal-pattern` |

A confiança declarada pelo scanner aparece na frase, sem retoque. Correspondência em
base vence heurística quando as duas apontam para a mesma espécie: dizer "possível
padrão de exchange" quando o scanner reconheceu a entidade subestimaria o que ele sabe.

Isso inclui correspondência com lista de sanções. A decisão é surfacear, **com
atribuição explícita ao scanner**, um achado que a biblioteca já computa — o que é
diferente de este projeto construir um produto de sanções e decidir por conta própria
procedência de lista, jurisdição e tratamento de falso positivo.

A análise de origem tem **dois gatilhos, um caminho só**: o clique em "analisar
privacidade" e o worker, quando detecta transação nova — que é o gatilho previsto no
design. Sai do worker porque é ele que detecta: senão a origem de um depósito só seria
conhecida se alguém estivesse olhando a tela. Roda em segundo plano nos dois casos; se o
ciclo esperasse por ela, deixaria de sincronizar as outras carteiras durante os segundos
que cada transação custa.

Cada `scan tx` custa segundos contra a cadeia, então `tx_scans` deduplica por
`(carteira, txid)` — o que uma transação confirmada revela não muda — e cada rodada
processa no máximo **cinco** transações, da mais recente para a mais antiga. Duas
análises da mesma carteira ao mesmo tempo são impedidas: o clique e o worker
analisariam a mesma fila em paralelo, gastando o dobro do explorador para chegar ao
mesmo lugar.

**Por que dust é crítico e reuso é atenção:** crítico se reserva ao que ainda dá para
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

**Erro de API também é bilíngue.** A resposta traz `code` e, quando a frase precisa
deles, `params`:

```json
{ "error": "esta chave é de mainnet, mas este watchtower vigia signet.",
  "code": "wallet.wrongNetwork",
  "params": { "chave": "mainnet", "rede": "signet" } }
```

A tela renderiza `error.<code>` do catálogo; a mensagem em português viaja junto como
reserva, para quem consome a API direto e para o caso de o servidor emitir um código que
o catálogo da tela ainda não conhece — situação normal entre dois deploys. Um teste
garante que **todo código emitido tem frase nos dois idiomas**.

---

## 11. Configuração

Toda configuração sensível vive em `.env`, documentada em `.env.example` com valores de
exemplo — jamais reais.

| Variável | Efeito |
|---|---|
| `MASTER_KEY_HEX` | 32 bytes em hex. Cifra os xpubs em repouso |
| `NETWORK` | rede do backend pronto da instância (`mainnet`, `signet` ou `testnet`). A rede da carteira vem do backend escolhido |
| `CHAIN_BACKEND` | `esplora`, `electrum` ou `core` |
| `ESPLORA_URL` | backend de cadeia quando `CHAIN_BACKEND=esplora` |
| `ELECTRUM_URL` | `electrum://host:porta` quando `CHAIN_BACKEND=electrum` |
| `CORE_URL` | `http://host:porta` do RPC quando `CHAIN_BACKEND=core` |
| `CORE_COOKIE_PATH` | caminho do `.cookie` do bitcoind. Ausente, o RPC vai sem credencial |
| `PUBLIC_BACKEND` | governa o aviso persistente de privacidade |
| `WORKER_INTERVAL_MS` | intervalo entre ciclos; padrão 30000, mínimo 5000 |

### 11.1 O backend é escolhido por carteira

`CHAIN_BACKEND` e companhia definem o backend **da instância** — o que a tela oferece
por padrão e o que uma carteira usa quando nada é dito. Além dele, cada usuário
cadastra os seus:

| Rota | Efeito |
|---|---|
| `GET /api/backends` | lista o backend da instância mais os do usuário. Cria o da instância se ainda não existir, para que a tela nunca receba lista vazia |
| `POST /api/backends` | cadastra backend do usuário. Valida o esquema contra o protocolo — `http(s)://` para Esplora e para o RPC do Core, `electrum://` para Electrum |
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

A instância oferece um backend pronto na rede de `NETWORK`, mas backends cadastrados pelo usuário podem vigiar mainnet, signet e testnet lado a lado. A rede de cada carteira é a rede do backend escolhido.

### 11.2 Três backends de cadeia

**Esplora**, por HTTP, é o caminho do explorador público — cômodo e observável por
terceiro. **Electrum**, JSON-RPC por TCP, é o caminho de quem já roda infraestrutura:
um adapter só atende Electrs, Fulcrum e Floresta, porque o florestad embute um
servidor Electrum. **Bitcoin Core**, pelo RPC do próprio nó, é o caminho de quem não
quer nem servidor de índice no meio.

O tipo do backend é dado do banco, não escolha costurada em cada ponto de uso: o
motor de sincronização e o cadastro de carteira montam o adapter pelo mesmo caminho,
a partir da coluna `backends.kind`.

O adapter Electrum recebe **endereço** e deriva o scripthash internamente. A
alternativa — expor scripthash na interface — vazaria detalhe do protocolo Electrum
até o motor de sincronização, e custaria a um Esplora ter de conhecê-lo.

O protocolo exige `server.version` como **primeira** chamada de cada conexão; sem ele o
servidor recusa tudo com "use server.version to identify client". O handshake vale por
conexão e é refeito quando ela é reaberta.

Verificado em 26/08 contra um ElectrumX 1.19 público de signet: altura da ponta,
histórico, UTXOs e status de endereço. O hash de bloco que o adapter calcula do
cabeçalho **confere com o que o mempool.space reporta** para a mesma altura.

`PUBLIC_BACKEND` sem valor assume público no Esplora e soberano no Electrum e no Core,
que é o uso corrente dos três. Quem aponta para um Esplora próprio, ou para um servidor
Electrum de terceiro, precisa dizer — é o aviso de privacidade da tela que depende
disso.

#### O Core não responde por endereço, e isso muda o motor

Os dois primeiros respondem histórico de qualquer script na hora. O Core **não**: sem
`-txindex` e sem carteira, perguntar por um endereço arbitrário não é operação que o
RPC ofereça. Ele precisa que o descriptor seja **registrado** antes, e então segue
aquilo — é a distinção que o adapter declara em `needsRegistration`, e é por ela que o
motor de sincronização escolhe o caminho, não por tentativa e erro.

No caminho de registro **não há gap limit a sondar**: quem sabe quais endereços existem
é o nó, e ele reporta a carteira inteira de uma vez. O que existe é o `range` do
`importdescriptors` — `[0, 999]`, o padrão do próprio Core para carteiras de descriptor,
bem acima do gap limit de 20 do caminho de sondagem, porque aqui a faixa é varrida uma
vez e não a cada ciclo. O Core recusa descriptor com curinga sem `range`. A consequência prática é que
**sumir de `listunspent` é evidência de gasto**, o que no modelo de sondagem não seria
verdade — lá só conta o endereço que foi de fato perguntado. O endereço e o caminho de
derivação vêm do nó, porque o motor não derivou nada — e o caminho é lido dos **dois
últimos** trechos da origem que o `desc` carrega, porque ela vem tão longa quanto o nó
souber (`[fp/84'/1'/0'/0/7]`) e o resto do sistema guarda `cadeia/índice`.

Cada carteira vigiada ganha no nó uma **carteira de observação própria**,
`stealth-badger-<id>`, criada com `disable_private_keys`. Compartilhar uma carteira de
observação entre duas vigiadas faria `listunspent` devolver a união das duas, e os
UTXOs de uma apareceriam como saldo da outra. As duas cadeias — recebimento e troco —
são registradas: só a primeira deixaria o troco invisível, e o saldo apareceria menor
do que é.

Duas consequências ficam à vista no cadastro. A **detecção do tipo de script pela
cadeia** (§4.2) não roda com Core, porque ela pergunta por endereço: o tipo declarado
pela chave é assumido, e quem quer outro informa. E o **cookie do bitcoind é lido a
cada chamada**, não guardado: ele é regerado a cada reinício do nó, e guardá-lo faria o
watchtower parar de autenticar depois de um restart, com um "unauthorized" que não
explica por quê.

O valor vem do Core em **BTC, com ponto flutuante**. A conversão para satoshi conta os
dígitos do texto em vez de multiplicar por `1e8`: `0.00000001 * 1e8` não dá exatamente
1 em binário, e o watchtower projeta saldo a partir desse número.

### 11.3 Custódia do xpub

O xpub é cifrado com **AES-256-GCM** sob a chave-mestra do servidor.

Não é chave derivada da senha do usuário, e a razão é concreta: o worker sincroniza com
o usuário deslogado, e não teria como abrir o xpub. A consequência é explícita e
assumida — **quem tem o banco *e* a chave-mestra enxerga os xpubs vigiados**. É por isso
que o projeto é self-hostável e que a chave nunca é versionada.

---

### 11.4 Análise de privacidade

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

### 11.5 Coin control e BIP-329

Cada UTXO aceita **rótulo**, **tags de proveniência** e **congelamento**.

Essas três coisas são dados do usuário, e por isso **não moram em `utxos`**: aquela
tabela é projeção, apagada e reconstruída a cada sincronização. Moram em `utxo_marks`,
com chave `(carteira, txid, vout)` que não referencia `utxos` de propósito — a marca
precisa sobreviver ao UTXO ser gasto, porque o BIP-329 exporta rótulo de saída gasta
também.

A exportação é **JSON Lines**, um objeto por linha, como a spec manda:

```json
{"type":"output","ref":"<txid>:<vout>","label":"do faucet #nao-kyc","spendable":false}
```

Duas decisões que o formato impõe:

- **`spendable` é sempre escrito.** A BIP-329 diz que *omitir* manda a carteira de
  destino preservar o que ela já tinha — então omitir faria o nosso "não está
  congelado" nunca chegar lá. Pela mesma razão, na importação, campo ausente **preserva**
  o congelamento local em vez de desfazê-lo;
- **a spec não tem campo de tag.** Elas são anexadas ao rótulo como `#tag`, o que mantém
  a ida e a volta sem perda e continua legível em carteira que só saiba mostrar o
  rótulo.

A importação atravessa arquivo de outra carteira sem engasgar: `tx`, `addr`, `pubkey`,
`input`, `xpub` e `spscan` são contados e pulados, linha corrompida não aborta o
arquivo, e saída que não é desta carteira não vira marca órfã. O **arquivo de exemplo da
própria BIP-329** é lido por teste.

---

## 12. O que ainda não existe

Escrito para ser lido antes que alguém pergunte. O que está **planejado e especificado**,
com contrato e critério de pronto, está em
[`2026-08-27-backlog-interface-e-fontes.md`](2026-08-27-backlog-interface-e-fontes.md).

### 12.1 Não implementado

| Item | Situação |
|---|---|
| **Regras "não gastar junto"** | a parte do coin control que não foi construída; rótulo, tags e congelamento existem |
| **Fingerprints de transação** | não construído |
| **Limiar de dust configurável** | fixo em 1000 sats; não há tabela `alert_rules` |
| **Painel de administrador** | `users.is_admin` existe no schema e nada o usa |

### 12.2 Limitações conhecidas do que existe

- **O adapter Electrum foi verificado contra um servidor público**, não contra um nó do
  próprio usuário. Electrs, Fulcrum e florestad continuam sem terem sido exercitados.
- **O adapter de Bitcoin Core não falou com um bitcoind de verdade.** O RPC, o registro
  de descriptor e a leitura dos UTXOs estão cobertos por teste contra um transporte
  simulado, e o motor tem o caminho de registro coberto ponta a ponta contra o banco —
  mas nenhum nó respondeu ainda. `rescanFrom` existe no adapter e o motor não o chama:
  `importdescriptors` com `timestamp: 0` já varre a cadeia, e um rescan explícito por
  cima seria uma segunda varredura pelo mesmo motivo.
- **O arquivo BIP-329 exportado não foi aberto por outra carteira.** A ida e a volta
  estão cobertas por teste, incluindo o arquivo de exemplo da spec, mas nenhum Sparrow
  ou Nunchuk leu o nosso.
- **O paralelismo é fixo em cinco consultas simultâneas.** É um número escolhido para
  não virar rajada contra o explorador público, não um valor ajustado por medição de
  cada backend.
- **A análise de privacidade leva por volta de 78 segundos** numa carteira de 77
  endereços, porque o scanner faz a própria varredura por gap limit.
- **A interface é de duas telas** — login e um dashboard único. Não há navegação nem
  menus; não há uma terceira tela para onde ir.

---

## 13. Como verificar

Testes são critério de avaliação do hackathon e entrega obrigatória. O TDD foi aplicado
onde a falha é **silenciosa** — o caso em que um bug não se anuncia:

deduplicação de alerta, detecção de reorg, gap limit, projeção de UTXO, derivação HD,
cifra em repouso, reconexão do listener SSE, ida e volta em BIP-329, e o que separa
"não sei" de "é zero".

```bash
cd backend  && npm test && npx tsc --noEmit   # 35 arquivos, 388 testes
cd frontend && npm test && npx tsc --noEmit   # 11 arquivos,  95 testes
```

Há ainda uma **passagem de regressão pela interface**, em
`backend/scripts/regressao-navegador.mjs`, contra a stack de pé. Ela existe porque
metade dos defeitos deste projeto só apareceu na tela: o aviso de privacidade que a
rolagem levava embora, a unidade duplicada no saldo, o botão de sair quebrado por um
cabeçalho HTTP. Nenhum teste de unidade pega esses três.

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

### 13.2 Verificação ponta a ponta executada em 26/08/2026

| Comportamento | Observado |
|---|---|
| ciclo de sincronização | **6,0 a 6,6 s** para 77 endereços, medido três vezes |
| análise de privacidade | score 66, nota C, três achados na carteira de 32 UTXOs |
| análise de endereço avulso | score 100, nota A+, quatro achados |
| origem dos fundos | `kyc_origin` disparado por `entity-behavior-exchange` em transação real |
| coin control | 32 UTXOs com rótulo e congelamento; **congelamento sobreviveu a um ciclo** que reconstruiu a projeção |
| exportação BIP-329 | `spendable: false` e `Content-Disposition` nomeando o `.jsonl` |
| push no celular | notificação lida de volta no `ntfy.sh`, com título, corpo e tag |
| adapter Electrum | contra ElectrumX 1.19 público: altura, histórico, UTXOs e status. **O hash de bloco calculado do cabeçalho confere com o mempool.space** |
| degradação honesta | endereço de 33 mil transações recusado pelo explorador: carteira em `degraded` com o motivo, e as outras seguem |
| regressão pela interface | 11 verificações, nenhuma resposta 4xx, nenhum erro de página |
