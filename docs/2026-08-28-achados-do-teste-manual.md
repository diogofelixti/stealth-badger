# Achados do teste manual de 28/08

Levantado depois do primeiro teste do zero, com o painel reconstruído e o banco
recém-criado. Quinze pontos: **cinco são defeito medido**, quatro são pedido de
produto, e o resto é pergunta respondida com medição.

Nada foi desenvolvido nesta rodada — o pedido foi analisar e registrar. A ordem
proposta está no fim, e leva o relógio em conta.

> **O relógio.** São 08h02 de 28/08. A entrega é hoje, 19h. Onze horas.
> Isso não muda o que está errado; muda o que cabe.

---

## 0. A descoberta que reordena o resto

**`mempool.space` está inalcançável desta rede.** Medido de dentro do container
e da máquina hospedeira:

| destino | resposta |
|---|---|
| `mempool.space/api/blocks/tip/height` | **sem resposta**, timeout |
| `mempool.space/signet/api/blocks/tip/height` | **sem resposta**, timeout |
| `blockstream.info/api/blocks/tip/height` | 200 em **0,65 s** |
| `mempool.emzy.de/api/blocks/tip/height` | 200 em **0,74 s** |
| `api.coingecko.com/api/v3/ping` | 200 |

O DNS resolve (`103.165.192.202`), então não é resolução: é a conexão que não
completa. Coingecko responde, então não é falta de saída para a internet. É
`mempool.space`, especificamente.

**Por que isso reordena tudo:** o item D semeia exatamente **duas** fontes
prontas na instância nova, e as duas são `mempool.space` — mainnet e signet. O
primeiro acesso, nesta rede, entrega ao usuário duas fontes que não respondem.

E é a causa direta do ponto 9 abaixo: a carteira de mainnet cadastrada no teste
está com `sync_error: "fetch failed"`.

---

## 1. Resposta à pergunta: o `am-i-exposed` depende de um Esplora?

**Sim, é dependência dura, e é do scanner — não do nosso código.**

O `--help` do binário instalado:

```
--api <url>    Custom mempool API URL
```

Sem `--api`, ele usa `mempool.space`. Os endpoints que ele chama, extraídos do
bundle em `node_modules/am-i-exposed/dist`:

```
{api}/address/{addr}/txs
{api}/address/{addr}/txs/chain/{lastTxid}
{api}/address/{addr}/utxo
{api}/tx/{txid}/hex
{api}/tx/{txid}/outspends
```

São todos REST no formato **Esplora**. O scanner **não fala** RPC do Bitcoin
Core, e **não fala** Electrum. Não há flag, não há adaptador: é HTTP nesse
formato ou nada.

**O que isso não quer dizer.** Não estamos presos ao `mempool.space`. Testei o
scanner ponta a ponta contra o Blockstream, e funciona:

```
npx am-i-exposed --json --api https://blockstream.info/api \
  scan address bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4
→ {"version":"0.34.2","score":0,"grade":"F","addressInfo":{…}}
```

*(O primeiro teste contra o Blockstream deu `HTTP 400`, e isso era do endereço,
não do host: usei o endereço do bloco gênesis, que tem histórico grande demais e
o Blockstream recusa. Com endereço normal, `200`.)*

**As três saídas possíveis**, em ordem de soberania:

1. **Esplora próprio** — quem roda `electrs` ou `esplora` em casa tem a análise
   completa sem contar nada a ninguém. É a resposta certa, e é a que o projeto
   já defende;
2. **outro Esplora público** — Blockstream, `mempool.emzy.de`. Funciona nesta
   rede, e o custo é o de sempre: aquele host vê os endereços consultados;
3. **nada** — com Core ou Electrum puros, a análise profunda não existe. A tela
   precisa dizer isso onde a pessoa tentaria.

**O que não pode continuar:** a fonte de cadeia e a fonte de análise serem a
mesma coisa. Hoje `--api` recebe `backendUrl`, e quando a carteira está no Core,
o scanner recebe `http://host.docker.internal:38332` — um RPC. Ele chama
`/address/…/txs` naquilo e recebe `Not found`.

---

## 2. As dez análises de transação falharam, todas

`tx_scans`: **10 de 10 com erro.** Todas iguais:

```
am-i-exposed --json --network signet --api http://host.docker.internal:38332 \
  scan tx 3f828be2…
 · saída: {"error":true,"message":"Not found"}
```

Causa: o ponto 1 acima. `--api` apontado para o RPC do nó.

**Consequência na tela** (é o ponto 5 da lista do teste): o bloco *"Privacidade
da transação"* em `AlertDetail` é renderizado quando `txPrivacy.latest` existe —
e a linha existe, com `score`, `grade`, `txType` e `boltzmann` todos nulos.
Sobra o título com nada embaixo. Foi exatamente o que apareceu.

---

## 3. A varredura da carteira devolveu um número que não significa nada

`privacy_scans` tem uma linha: **score 70 · nota C**, e o `walletInfo`:

```json
{"totalTxs":0,"dustUtxos":0,"totalUtxos":0,
 "totalBalance":0,"activeAddresses":0,"reusedAddresses":0}
```

Zero achados. Numa carteira que tem **30 endereços, 32 UTXOs e 7.552.468 sats**.

O scanner rodou, não conseguiu consultar nada, e devolveu "não encontrei". O
`scanWallet` só recusa o resultado quando falta `score` ou `walletInfo` — os dois
vieram, então ele guardou.

**Este é o defeito mais grave da lista**, e não pelo tamanho do código: é o
produto cometendo o que existe para denunciar. Um watchtower que não distingue
**"nada encontrado"** de **"não consegui olhar"** afirma o que não mediu. É o
mesmo problema que a página de acessos resolveu com o terceiro estado `unknown`,
e a análise de privacidade ainda tem só dois.

---

## 4. O reuso de endereço está medindo errado, e a causa não é aritmética

`PrivacyPanel.tsx:144-146`:

```ts
const ativos    = numero(relatorio.walletInfo.activeAddresses) ?? 0
const reusados  = numero(relatorio.walletInfo.reusedAddresses) ?? 0
const percentualReuso = ativos > 0 ? (reusados / ativos) * 100 : 0
```

O reuso vem **do scanner**. Como o scanner devolveu zeros (ponto 3), a barra
mostra 0 de 0.

**Mas o dado certo já está no banco.** O watchtower detectou o reuso sozinho, sem
scanner nenhum: há **2 alertas `address_reused`** nesta carteira, gerados pela
regra em `alerts/rules.ts`. O painel ignora o que a própria aplicação observou e
repete o que um processo externo disse.

Vale mesmo com o scanner funcionando: o número que o watchtower mediu na cadeia
que ele sincronizou é de primeira mão, e o do scanner é de segunda.

---

## 5. O histograma de UTXOs quebra na faixa `10k-100k`

`PrivacyPanel.tsx:57-65`. Cinco faixas, cada uma num `flex-1 min-w-0`, rótulo em
`text-xs`:

```
<1k · 1k-10k · 10k-100k · 100k-1M · >=1M
```

`10k-100k` é o rótulo mais largo. Dentro da coluna do `WalletCard`, a caixa de
cada faixa não comporta oito caracteres e o texto estoura.

Junto veio o pedido geral: **os gráficos em caixas bem organizadas.** Hoje as
seis seções do painel são `<section>` sem moldura num grid de duas colunas, e
não há separação visível entre um gráfico e o seguinte — a mesma queixa que
levou os acessos a virarem cartões.

---

## 6. Moedas e rótulos não mostram o endereço

`UtxoTable.tsx:124` mostra `txid:vout · derivationPath`.

O endereço **já vem da API**: `Utxo.address` existe em `lib/api.ts:276`, e a
tabela simplesmente não o desenha. É o achado mais barato da lista.

---

## 7. Falta botão de copiar onde há identificador

Endereço, altura, hash de bloco e txid aparecem em `AlertDetail`, `UtxoTable` e
na página da carteira, todos como texto puro.

O componente já existe: `ui/Copiar.tsx`, feito no item F, com caminho de reserva
para contexto não-seguro e aviso quando não copia. Falta usá-lo fora da página
de acessos.

---

## 8. O rótulo da carteira não chega às notificações

Onde está: `AlertDetail.tsx:138` mostra `detalhe.wallet.label`.

Onde **não** está:

- **no feed de alertas** — a lista não mostra de qual carteira é o alerta;
- **no push do ntfy** — `channels/index.ts:24` monta a mensagem com
  `renderAlert(alert.type, alert.params, lang)`, e o `label` não está em
  `params`. O celular recebe *"Fundos recebidos · 12.345 sats, confirmado"* sem
  dizer onde.

Com mais de uma carteira, o alerta não identifica o assunto. É defeito de
produto, não de layout.

---

## 9. A carteira de mainnet: 0% por muito tempo, e depois 0 UTXOs

Estado medido:

| campo | valor |
|---|---|
| `sync_state` | **error** |
| `sync_error` | **fetch failed** |
| `sync_progress` | 0 |
| `sync_height` | 964420 |
| endereços derivados | **44** |
| endereços com status não-vazio | **4** (`2:1:1:0:0:0`) |
| UTXOs | **0** |

Três coisas separadas, e vale não juntá-las:

**a) A falha é do ponto 0.** A fonte é `mempool.space`, que não responde nesta
rede. `fetch failed` é honesto e chegou ao banco; o problema é que a **tela não
mostrou isso** — ficou em 0% até o F5, e depois mostrou 0 UTXOs.

**b) A política de progresso não cobre a espera longa.** É o mesmo buraco que o
rescan do Core expôs ontem: `sync_progress` fica em 0 até o import retornar. Já
corrigido para o Core, com prosa própria; para o Esplora que não responde,
continua 0% mudo. O estado `error` existe e a carteira chegou nele — a tela
precisa dizer *qual* fonte falhou e *o que* fazer.

**c) Histórico sem saldo.** Quatro endereços já vieram com status não-vazio, ou
seja, **a varredura chegou a ver movimento** antes de falhar. A carteira tem
UTXOs gastos, e a tabela `utxos` da carteira 1 mostra `spent = 0` em 32 de 32 —
sugere que a projeção guarda o não-gasto e o gasto não sobrevive como histórico
visível. **Isto eu não consegui confirmar**, porque a carteira 2 nunca terminou
de sincronizar. Fica como pergunta a investigar, e não como diagnóstico.

---

## 10. Alertas de entidade: o que existe e o que não existe

**Existe.** O alerta `kyc_origin`, com severidade *atenção*, cobre cinco espécies
— as chaves estão no catálogo:

| chave | o que é |
|---|---|
| `entity.exchange` | saque em lote de exchange |
| `entity.darknet` | serviço de darknet |
| `entity.gambling` | serviço de gambling |
| **`entity.ofac`** | **endereço em lista de sanções (OFAC)** |
| `entity.known` | entidade conhecida |

A frase distingue **base** (`database` — bateu na base de entidades) de
**comportamento** (`behavior` — tem forma compatível), e declara a confiança que
o scanner reportou. O watchtower repassa o que o scanner viu; não promove
heurística a fato. Isso está certo e é para manter.

**Não existe.** `grep -rn "coinjoin|payjoin|whirlpool" backend/src` volta
**vazio**. O scanner devolve `txType` — `simple-payment`, `whirlpool-coinjoin`,
etc. —, `tx_scans.tx_type` guarda essa coluna, e **nenhuma regra de alerta a
consome**. Moeda que passou por coinjoin, ou transação com forma de payjoin, não
gera aviso nenhum.

Vale notar que a leitura aqui é ao contrário das outras: coinjoin normalmente é
**bom** para a privacidade de quem o fez, e relevante para quem recebe. O alerta
seria informativo, e a prosa precisa dizer de que lado a pessoa está.

---

## 11. O painel de privacidade está escondido

`PrivacyPanel` é renderizado em `WalletCard.tsx:193` — dentro do cartão de cada
carteira. Não há rota, não há item de menu, e para chegar nele é preciso saber
que ele existe.

O pedido: **um item na barra lateral**, com estatísticas gerais, seletor de
carteira e os endereços clicáveis para o detalhe. *"Trazer o máximo de
informações com a mínima ação."*

Concordo com o diagnóstico e registro uma tensão: a regra de nunca consultar
sem clique explícito continua valendo. Uma tela de privacidade que abre e
dispara varredura viola o princípio. O que ela **pode** fazer sem clique nenhum
é mostrar tudo o que já está no banco — score guardado, alertas, reuso medido
localmente, dust, contagem de UTXO —, e reservar o clique para o que sai para a
rede.

---

## 12. Preço e taxa: o desenho não convenceu

Registrado como está, para a conversa: hoje são réguas verticais separando selo
│ mercado │ ações, com preço e taxa em linha única no cabeçalho, e a pilha de
três andares na página de Configurações.

Sem proposta aqui — é o próximo assunto a discutir, e três perguntas decidem:

1. **preço e taxa merecem o cabeçalho?** Eles competem com o selo de postura,
   que é a tese do produto. Talvez o lugar deles seja o painel;
2. **a taxa precisa das três estimativas o tempo todo**, ou uma com a
   possibilidade de abrir?
3. **o que a pessoa faz com esse número?** Se é para decidir quando gastar, ele
   quer destaque e tendência. Se é ambiente, quer discrição.

---

## 13. "Acessos" vira "Acesso Externo", e os comandos viram botão

Duas coisas no mesmo pedido.

**O nome** é trivial: `nav.access` no catálogo, PT e EN.

**O botão em vez do comando** não é. O pedido é: clicar, subir o container, e
abrir um wizard de configuração. Isso exige o socket do Docker, que é a exceção
registrada de ontem — e a metade que **falta** é justamente a que não existe na
API do Engine:

| ação | temos? |
|---|---|
| `start` / `stop` de container que existe | **sim**, item F, com lista branca e admin |
| **criar** o container a partir do compose | **não** — o Engine não lê `docker-compose.yml` |

Foi por isso que ontem ficou o `./scripts/acessos.sh preparar`. Um wizard de
verdade precisa resolver essa metade, e há dois caminhos:

- **(a)** o backend monta o `ContainerCreate` do Engine ele mesmo, duplicando a
  definição do serviço em código — e aí tela e compose divergem em silêncio na
  primeira vez que um dos dois mudar;
- **(b)** o compose de controle sobe os três containers **criados e parados**, e
  o wizard só liga e desliga o que já existe. Nada é duplicado, e o botão
  funciona a partir do segundo comando que a pessoa já dá uma vez.

**(b)** é honesto e cabe hoje. **(a)** não cabe, e paga uma dívida que o item C
já ensinou a não contrair.

O wizard em si — coletar `TS_AUTHKEY`, `TUNNEL_TOKEN`, hostname — tem uma
consequência que precisa de decisão: **hoje o painel não escreve no `.env`.**
Aceitar esses valores pela tela significa ou gravá-los no banco cifrados, ou o
backend passar a escrever num arquivo do host. As duas mudam a superfície.

---

# Decisões do dono do projeto, 28/08 manhã

Tomadas depois da análise acima. Elas mudam o recorte, e por isso ficam
escritas antes da ordem de execução.

| # | Assunto | Decisão |
|---|---|---|
| 1 | **A dependência de Esplora** | Precisa ficar **explícita ao usuário**: no README e na configuração inicial do projeto. Não é detalhe de implementação, é requisito de funcionamento |
| 2 | **Fonte de cadeia × fonte de análise** | **Separar as duas.** O que o `mempool` precisa e o que o `am-i-exposed` precisa são coisas diferentes, e hoje estão coladas |
| 3 | **Cadastro de fontes** | Está confuso. **Simplificar ao máximo** para quem for usar |
| 4 | **Consulta sem clique** | **A regra pode ser relaxada.** O menu de privacidade mostra o máximo de informação com a mínima ação do usuário |
| 5 | **Wizard de acesso externo** | Ajustar o que for preciso para ele **funcionar de verdade**, e rápido |
| 6 | **Escopo** | Tocar **todos** os pontos levantados. Quem decide quando parar de programar e passar para o ensaio da apresentação é o dono do projeto |

## O que a decisão 4 muda, e o que ela não muda

A regra "nenhuma consulta externa sem clique" era mais rígida do que o produto
precisa. Ela existia para que ninguém fosse assinado num serviço sem saber. Fica
assim, a partir de agora:

- **o que já está no banco aparece sem clique nenhum** — score guardado, alertas,
  reuso medido localmente, dust, contagem de UTXO. Isto nunca foi consulta;
- **a tela de privacidade pode disparar análise sozinha**, e o que ela deve à
  pessoa é **dizer que vai fazer isso e para quem**, com o host à vista, e não
  perguntar antes de cada uma;
- **o que continua exigindo clique** é o que entrega um identificador novo a um
  terceiro que ainda não o tinha, e o aviso de postura continua permanente.

## O modelo de fontes, depois da decisão 2

Duas coisas com nomes diferentes, porque são responsabilidades diferentes:

| | **Fonte de cadeia** | **Fonte de análise** |
|---|---|---|
| para quê | sincronizar saldo, UTXO e eventos | rodar o `am-i-exposed` |
| escopo | **por carteira** | **por rede**, uma só |
| aceita | Esplora, Electrum, **Bitcoin Core** | **só Esplora/mempool** |
| se faltar | a carteira não sincroniza | a análise profunda não existe, e a tela diz isso |

É o que desfaz o defeito de raiz: hoje `--api` recebe a URL da fonte de cadeia,
e quando ela é um Core o scanner recebe um RPC e responde `Not found`. Com as
duas separadas, quem vigia pelo próprio nó **continua** tendo análise profunda,
apontando-a para um Esplora — e sabendo que é ele que vê os endereços
consultados.

---

# Ordem de execução

Um ponto por vez, cada um com teste, e o registro no diário ao fim. A ordem é
por quanto a entrega perde se o ponto ficar de fora.

| # | Ponto | Fecha |
|---|---|---|
| ~~1~~ | ~~**Fonte de análise separada da fonte de cadeia**~~ | **feito** · §0, §1, §2 |
| ~~2~~ | ~~**`scanWallet` recusa resultado vazio**~~ | **feito** · §3 |
| ~~3~~ | ~~**Cadastro de fontes simplificado**~~ | **feito** · decisões 1 e 3 |
| ~~4~~ | ~~**Reuso medido do banco**~~ | **feito** · §4 |
| ~~5~~ | ~~**Endereço na tabela, e `Copiar` nos identificadores**~~ | **feito** · §6, §7 |
| ~~6~~ | ~~**Rótulo da carteira** no feed e no push~~ | **feito** · §8 |
| ~~7~~ | ~~**Menu de Privacidade**: rota própria, estatísticas gerais, seletor de carteira, endereços clicáveis~~ | **feito** · §11, decisão 4 |
| ~~8~~ | ~~**Gráficos em caixas**, com o histograma que não quebra~~ | **feito** · §5 |
| ~~9~~ | ~~**Preço e taxa** redesenhados~~ | **feito** · §12 |
| **10** | **Acesso Externo**: nome novo e wizard que funciona | **feito** · §13, decisão 5 |
| **11** | **Alerta de coinjoin e payjoin** a partir do `txType` já guardado | **feito** · §10 |
| **12** | **Carteira que falha**: dizer qual fonte falhou, e o histórico de UTXO gasto | **feito** · §9 |

---

## Ponto 1, feito · a fonte de análise deixou de ser a fonte de cadeia

**Refeito depois da revisão do dono do projeto.** A primeira versão criou
`ANALYSIS_API_MAINNET` / `_SIGNET` / `_TESTNET` no `.env`, e a crítica foi
direta: *"tu tá colando um monte de coisas no .env, isso não é prático para
usuários; o que ele precisa cadastrar é nó ou serviço local"*.

Estava certa, e por um motivo que o próprio repositório já registrava: **o
catálogo de fontes já existe** (`chain/presets.ts` e `lib/presets.ts`, nove
presets, com o `blockstream` entre eles), a tabela `backends` já guarda
`preset`, `is_public` e `network`, e o item D já semeia fontes públicas sozinho.
A fonte de análise é uma fonte como as outras; variável de ambiente era uma
estrutura paralela a uma que já estava pronta.

O argumento de "não escolher um terceiro pelo usuário" também estava mal
aplicado. O princípio 1 do projeto diz o contrário do que a primeira versão
fez: *oferece exploradores públicos como alternativa **consciente e avisada***.
A regra não é não escolher — é **escolher e avisar quem viu**.

**O que ficou.** `privacy/fonte-de-analise.ts` resolve, por carteira:

| fonte de cadeia | o que acontece |
|---|---|
| já é **Esplora** | serve para analisar; ninguém é perguntado, nenhum host novo vê os endereços |
| **Core** ou **Electrum** | usa a fonte de análise escolhida para aquela rede |
| ...e ainda não há escolha | `needsChoice`: a tela pergunta **uma vez por rede**, com as candidatas na própria recusa |

A escolha é **por usuário e por rede** (`user_analysis_sources`, migração 015).
Escolher a fonte de análise é escolher quem vê os endereços que você consulta, e
num painel multi-usuário ninguém deve herdar a exposição que o admin aceitou
para si.

A instância passou a semear **quatro** Esploras públicos em vez de dois —
`mempool.space` e `blockstream.info`, mainnet e signet. Uma opção só não é
escolha, e obrigar a cadastrar à mão o que já é catálogo é o atrito que o item B
existiu para tirar.

**O que quebrou a premissa.** O projeto sempre tratou "a fonte" como uma coisa
só, e a §1 mostrou que são duas. O efeito é contraintuitivo e está no README:
**quem vigia pelo próprio nó, a postura mais soberana, é justamente quem precisa
apontar a análise para outro lugar.** Não é defeito do nosso código — é o que o
`am-i-exposed` aceita.

**Provado.** A transação que falhou dez de dez vezes:

```
antes:  --api http://host.docker.internal:38332  → {"error":true,"message":"Not found"}
depois: --api https://blockstream.info/signet/api → {"score":10, …}
```

**Documentado** no README (seção própria, com a tabela das duas fontes e o fluxo
de escolha na tela) e no `.env.example` — que agora diz explicitamente que **não
há variável**, e existe só para a dependência não ser descoberta depois.

Testes: `fonte-de-analise.test.ts` (8) e `analysis-source.test.ts` (11), este
cobrindo a recusa com candidatas, as três recusas de escolha separadas, e o
caminho completo — recusa, escolha, análise que roda.

---

## Ponto 2, feito · "não consegui olhar" deixou de virar um score

**O defeito.** `scanWallet` só recusava quando faltava `score` ou `walletInfo`.
Em 28/08 os dois vieram, e o que foi guardado foi isto:

```json
score 70 · C   {"totalTxs":0,"dustUtxos":0,"totalUtxos":0,
                "totalBalance":0,"activeAddresses":0,"reusedAddresses":0}
```

Numa carteira que o próprio watchtower já tinha sincronizado, com 30 endereços,
32 UTXOs e 7.552.468 sats. O scanner não conseguiu consultar nada e respondeu
"não encontrei"; o resultado virou um número que parece diagnóstico e não é.

**Como se descobre.** Com o que o watchtower sabe de **primeira mão**. Ele
sincronizou a carteira e contou os UTXOs. `scanWallet` passou a receber esse
número, e quando o scanner responde que a carteira não tem endereço, transação,
UTXO nem saldo **e** a projeção local diz que tem, a varredura é descartada com
código próprio — `privacy.blindScan`.

**A regra que impede o zelo cego.** A cegueira é o conjunto **inteiro** zerado.
Um campo em zero é informação legítima: carteira que gastou tudo tem
`totalUtxos: 0` e `totalTxs` alto. E carteira recém-cadastrada, que o watchtower
também vê vazia, passa normalmente — recusar ali faria toda carteira nova
parecer quebrada.

**A tela.** O erro passou a viajar com código, e o painel traduz. Sem código,
cai no texto do servidor — pior que traduzido, muito melhor que a chave crua.
A cor é de atenção, e não de crítico: não saber não é falha da carteira.

Testes: `varredura-cega.test.ts` (7), mais dois casos no `PrivacyPanel.test`.

**Dívida deste ponto:** a linha antiga com score 70 · C continua no banco desta
máquina. Não foi apagada porque é dado do usuário; a regra nova impede que
outra seja gravada.

---

## Ponto 3, feito · o cadastro de fontes parou de falar a língua de quem construiu

Três coisas, e a primeira é a que mais confundia.

**O formulário perguntava a coisa errada primeiro.** Nove presets numa lista
plana — `core-datadir`, `core`, `fulcrum`, `electrs`, `floresta`, `mempool`,
`blockstream`, `esplora`, `electrum` — misturando nó próprio, servidor próprio e
explorador de terceiro, e obrigando a saber que Fulcrum é `electrum` e que
mempool.space é `esplora`. Vocabulário de quem construiu.

Agora a primeira pergunta é **o que você tem**, com três respostas sobre o mundo
de quem responde:

| grupo | postura | o que abre |
|---|---|---|
| um nó Bitcoin Core meu | soberana | o preset de **um campo só** (o diretório, do item C) |
| um servidor Electrum ou Esplora meu | soberana | os cinco programas, com host e porta ou URL |
| nenhum dos dois: explorador público | **exposta** | mempool.space ou Blockstream, com o aviso do que isso custa |

**O padrão mudou junto.** O formulário abria em `core` por host e porta —
quatro campos e três conceitos —, com o atalho de um campo do item C escondido
três linhas abaixo. Agora abre em "tenho um nó" e, dentro dele, no atalho.

**A caixa "é pública" saiu.** Ela deixava a pessoa marcar uma coisa que o preset
já sabe, e marcar errado fazia o selo de privacidade do cabeçalho mentir. A
postura passou a vir do grupo escolhido, e aparece ao lado dele antes do clique.

**A rede deixou de ser herdada em silêncio.** Ela vinha de `fontes[0]?.network`:
cadastrar uma fonte de mainnet numa instância de signet dava uma fonte de
signet. Agora é um campo, e a rede detectada no nó ainda ganha dela — o cookie
em `signet/.cookie` prova a rede melhor que um `select`.

**O apelido só aparece para o que é seu.** `mempool.space` já tem nome próprio, e
o campo vazio ali era pergunta sem resposta útil.

### A lista de fontes mentia por omissão

As duas `mempool.space` que a instância semeia estão **inalcançáveis** da rede
desta máquina — medido: o host não completa a conexão, enquanto
`blockstream.info` responde em 0,65 s — e apareciam idênticas às que funcionam.
Quem cadastrava uma carteira numa delas descobria pelo `fetch failed` num canto
da tela, minutos depois, sem nada ligando o erro à fonte escolhida.

`POST /api/backends/:id/test` responde com a altura da ponta, que é a prova mais
barata de que a fonte serve. **200 com `ok: false`, e não 502**: não responder é
o *resultado* do teste, e a tela precisa do motivo para mostrá-lo ao lado da
fonte. Testar não roda sozinho — é consulta a um terceiro, e sai quando a pessoa
pede; o que a tela dá de graça é o botão à vista, e não a suposição de que está
tudo bem.

### A dívida do ponto 1, paga

A fonte de análise ganhou seção própria em Configurações, com seletor de rede e
a postura de cada candidata. Sem ela, a escolha ficaria presa no momento da
primeira análise, e quem subisse um Esplora próprio depois não teria onde mudar.

**Testes.** `backends.test` (33, com quatro novos do teste de fonte),
`BackendForm.test` (11, reescritos para o fluxo de dois passos) e
`AddWallet.test` (15). Um deles precisou ficar mais específico: `getByText(/signet/)`
passou a casar com o `<option>` do seletor de rede, e provava outra coisa.

---

## Ponto 4, feito · o reuso passou a ser medido, e não repetido

**O defeito não era aritmético.** `PrivacyPanel` lia
`walletInfo.reusedAddresses` e `activeAddresses` — o que o **scanner** viu. Com
o scanner cego (§3), a barra mostrava `0 de 0` numa carteira que tinha reuso.

**O dado certo já estava no banco.** O watchtower detectou o reuso **sozinho**,
sem scanner nenhum: a mesma carteira tinha dois alertas `address_reused`,
gerados a partir dos eventos que ele próprio gravou ao sincronizar. O painel
ignorava o que a aplicação observou e repetia o que um processo externo disse.

`privacy/medido.ts` conta na cadeia que o watchtower sincronizou: endereço com
um recebimento é **ativo**, com dois ou mais é **reusado**. Conferido contra o
banco desta máquina, os dois caminhos concordam — **30 ativos, 2 reusados, 2
alertas** — porque leem o mesmo log.

**Duas decisões dentro da consulta**, as duas com teste:

- **`LEFT JOIN`, e não `WHERE`.** Endereço derivado que nunca recebeu precisa
  aparecer com zero, senão vira ativo e dilui o percentual: uma carteira com gap
  limit de 20 pareceria melhor do que é só por ter endereços vazios à frente;
- **`rolled_back_by IS NULL`.** Reorg compensado deixa de contar. Sem isso, um
  endereço que recebeu uma vez e sofreu reorg ficaria reusado para sempre.

`GET /api/wallets/:id/privacy` passou a devolver `measured`, e a tela o prefere.
O `walletInfo` continua como reserva, para instância antiga não ficar sem barra.

Vale mesmo com o scanner funcionando: o número medido na cadeia que o watchtower
sincronizou é de primeira mão, e o do scanner é de segunda.

**Testes.** `reuso-medido.test.ts` (5), mais dois no `PrivacyPanel.test` — um
provando que o medido ganha do scanner cego, outro que a reserva funciona.

---

## Ponto 5, feito · o endereço apareceu, e o que se cola virou botão

**O endereço já vinha da API.** `Utxo.address` existe em `lib/api.ts` desde
sempre, e a tabela desenhava só `txid:vout · derivationPath`. Sem o endereço,
decidir o que congelar ou o que gastar junto exige sair da tela e cruzar o
caminho de derivação à mão em outro lugar — que é o trabalho que este painel
existe para poupar. Foi o achado mais barato da lista inteira.

**Identificador de cadeia é feito para ser colado, nunca digitado.** Txid, hash
de bloco, altura e endereço estavam como texto puro: copiar exigia selecionar 64
caracteres monoespaçados à mão, com o risco silencioso de levar um a menos e ir
procurar defeito no explorador.

`ui/Identificador.tsx` resolve os dois de uma vez, e carrega a única regra que
importa nele: **o que se mostra e o que se copia são coisas diferentes.** A tela
pode encurtar um txid de 64 caracteres para caber na linha; o botão copia o
valor inteiro. Encurtar o que vai para a área de transferência seria exatamente
o defeito que o componente existe para evitar — e há teste medindo o
comprimento do que foi copiado.

Aplicado na tabela de moedas (endereço) e no detalhe do alerta (txid, altura,
hash do bloco). O `Copiar` por baixo é o mesmo do item F, com caminho de reserva
para contexto não-seguro — que é o caso do endereço da Tailscale, `http://100.x`.

**Testes.** Dois no `UtxoTable.test` e um no `AlertDetail.test`, os três
provando o valor **inteiro** na área de transferência e não o encurtado.

## Ponto 6, feito · o alerta passou a nomear a carteira

**O defeito.** O detalhe do alerta já fazia `JOIN` com `wallets` e mostrava
`wallet.label`, mas o feed e o ntfy só tinham `walletId`. Com duas carteiras, a
notificação no celular dizia "Fundos recebidos · 12.345 sats, confirmado" sem
dizer qual assunto exigia atenção.

**O que ficou.** `listarAlertas` e `recentAlerts` passaram a juntar a carteira
e devolver `wallet: { id, label }` junto do alerta. O feed desenha esse rótulo
acima do título, e ainda aceita um mapa de rótulos do contexto para o caso em
que o alerta venha só com `walletId`, como no intervalo entre SSE e recarga.

No backend, `deliver` consulta a carteira do alerta antes de renderizar a
entrega e prefixa o título enviado aos canais com `Cofre frio · Fundos
recebidos`. O texto do alerta continuou no catálogo como estava: obrigar
`walletLabel` em todos os templates faria alertas antigos e candidatos de teste
renderizarem marcador cru, que é outra forma de a tela afirmar o que não sabe.

**O que quebrou a premissa.** A primeira correção parecia ser colocar
`{walletLabel}` nas frases `alert.*.body`. O typecheck não pegaria, mas os
testes de renderização dos candidatos já mostravam a premissa errada: o motor
de alertas produz tipo e parâmetros mínimos, e o rótulo é contexto da carteira,
não fato do evento. A medição concreta foi a diferença entre os focados e a
suíte: `AlertFeed` passou com rótulo próprio, enquanto `renderAlert` sem
`walletLabel` deixaria `{walletLabel}` cru na prosa.

**Dívida.** O detalhe do alerta ainda mostra o rótulo no cabeçalho próprio em
vez de reutilizar a mesma linha visual do feed. Ficou assim porque o detalhe já
tinha o dado certo e o defeito medido era feed e push; mexer no modal agora
seria redesenho, não correção.

**Testes.** `alerts.test` cobre o `wallet.label` na página do feed,
`channels.test` cobre o título do ntfy com a carteira, e `AlertFeed.test` cobre
o rótulo vindo da API e o fallback pelo contexto. Verificações completas:
`backend` 52 arquivos, **618** testes; `frontend` 25 arquivos, **240** testes;
`npx tsc --noEmit` nos dois lados e `git diff --check` sem erro.

## Ponto 7, feito · Privacidade virou tela própria

**O que foi construído.** A barra lateral ganhou `Privacidade`, com rota
`/privacidade` dentro da `Shell`, preservando o selo de postura. A tela mostra,
sem clique, o que já está no banco: score médio guardado, alertas por
severidade, reuso medido, dust e contagem de UTXO. Também tem seletor de
carteira, lista de endereços da carteira e abertura de detalhe salvo por
endereço.

**O backend que faltava.** `GET /api/wallets/:id/addresses` lista endereços da
carteira do usuário com caminho de derivação, se já foram usados, saldo atual,
contagem de UTXO e último score profundo salvo do endereço. A rota só lê banco
local; não consulta explorador nem scanner.

**O que quebrou a premissa.** A tela não conseguiria cumprir o pedido usando
só a lista de UTXOs: uma carteira sem saldo mas com histórico continuaria
parecendo vazia, exatamente o problema levantado no ponto 12(c). A medição foi
de contrato, não de rede: antes não havia endpoint para endereço; depois
`privacy-routes.test` prova que o endereço usado aparece com `used: true`,
`balanceSats`, `utxoCount` e `privacyScore`, sem novo pedido ao scanner além
do que o teste disparou explicitamente antes.

**Dívida.** A tela ainda abre apenas análise salva de endereço. Ela não dispara
varredura profunda sozinha, embora a decisão 4 permita isso se o host for
nomeado antes. Ficou assim porque o critério deste ponto era tornar visível o
que já existe e abrir detalhe por endereço; automatizar varredura muda o
momento em que um endereço sai para um terceiro.

**Testes.** `privacy-routes.test` cobre a listagem de endereços e a recusa para
carteira alheia. `Rotas.test` cobre `/privacidade` dentro da `Shell`, o item de
menu, o resumo e a abertura de detalhe salvo. Verificações completas: `backend`
52 arquivos, **620** testes; `frontend` 25 arquivos, **242** testes; `npx tsc
--noEmit` nos dois lados e `git diff --check` sem erro.

## Ponto 8, feito · os gráficos ganharam caixa e o histograma parou de estourar

**O que foi construído.** As seções de gráfico do `PrivacyPanel` passaram a
usar a mesma régua visual dos cartões de acesso: `rounded-lg border
border-line bg-surface p-4`. Score, severidade, faixas de UTXO, reuso,
histórico e contrapartes agora têm moldura própria quando aparecem.

**O histograma.** As cinco faixas deixaram de ser cinco filhos `flex-1` e
viraram uma grade fixa `grid-cols-5`. O rótulo `10k-100k` ganhou fonte menor,
altura de linha estável e `whitespace-nowrap`. Isso preserva cinco caixas
iguais e impede que a faixa mais larga quebre a coluna estreita do
`WalletCard`.

**O que quebrou a premissa.** O defeito não era o dado do histograma, era a
geometria: cinco rótulos competiam pelo mesmo espaço fluido, e `10k-100k` era
o único com largura suficiente para escapar. O teste novo mede exatamente essa
decisão de forma, conferindo caixa própria, grade de cinco colunas e rótulo sem
quebra.

**Dívida.** O teste não mede pixel real de overflow, porque jsdom não calcula
layout. A garantia aqui é estrutural: a grade e a classe sem quebra ficam
travadas por teste; validação visual em navegador ainda é o jeito de confirmar
a caixa final em viewport estreita.

**Testes.** `PrivacyPanel.test` ganhou o caso do histograma e passou com 12
testes no focado. Verificações completas: `backend` 52 arquivos, **620**
testes; `frontend` 25 arquivos, **243** testes; `npx tsc --noEmit` nos dois
lados e `git diff --check` sem erro.

## Ponto 9, feito · preço e taxa saíram do cabeçalho

**Decisão do dono.** Preço e taxa podem sair do cabeçalho. Taxa deve mostrar
sempre as três estimativas, com legenda do que é cada uma. O uso ficou
definido como contexto discreto para o Painel, não como alerta nem como
competidor do selo de postura.

**O que foi construído.** O `Layout` deixou de montar `Mercado` no cabeçalho.
O `Dashboard` passou a mostrar `Mercado` logo depois do resumo de saldo, e o
próprio componente desenha a caixa `rounded-lg border border-line bg-surface
p-5` apenas quando há preço ou taxa ligada. O cabeçalho ficou só com postura e
ações de sessão.

**Taxas.** As três estimativas continuam sempre visíveis quando taxa está
ligada: próximo bloco, 3 blocos e 6 blocos, cada uma com seu valor em sat/vB e
legenda. Preço aparece junto quando há fonte de preço ligada, com a mediana e
as fontes que contribuíram.

**O que quebrou a premissa.** A versão anterior tratava preço e taxa como
informação de cabeçalho. A conversa mostrou que isso dava peso demais a
conveniência e pouco espaço ao aviso que sustenta o produto. A medição de teste
mudou junto: antes `Rotas.test` exigia `header [data-market="header"]`; agora
exige ausência de `data-market` no cabeçalho e presença de
`main [data-market="panel"]`.

**Dívida.** Não foi desenhada tendência de preço nem classificação de taxa
alta/baixa. Ficou fora porque a decisão foi deixar discreto e legível; sem uma
regra de limiar por rede e mempool, cor ali pareceria diagnóstico que o
produto não mediu.

**Testes.** `Mercado.test` cobre as três legendas de taxa. `Rotas.test` cobre
que mercado e taxa estão no Painel e não no cabeçalho. Verificações completas:
`backend` 52 arquivos, **620** testes; `frontend` 25 arquivos, **243** testes;
`npx tsc --noEmit` nos dois lados e `git diff --check` sem erro.

## Ponto 10, feito · configuração cifrada e consumida no start do container

**Decisão do dono.** As credenciais do wizard ficam cifradas no banco sob
`MASTER_KEY_HEX`, e não escritas pelo backend em arquivo do host. A razão é a
mesma dos xpubs e credenciais RPC: um lugar só para segredo, cifrado em
repouso, sem dar ao backend uma permissão geral de escrita no host.

**O que foi construído.** `nav.access` virou `Acesso Externo` em PT e
`External Access` em EN. Entrou a migração `016_access_configs.sql`, com
`access_configs(profile, config_encrypted, updated_by, updated_at)`. O backend
ganhou `GET/PUT /api/access/config/:profile`, atrás de sessão, admin e lista
branca de perfis. O `PUT` valida Tailscale e Cloudflare, cifra
`TS_AUTHKEY`/`TUNNEL_TOKEN` e hostname, e o `GET` devolve só resumo:
`configured`, `hostname`, `hasSecret`.

Na tela de cada caminho, o admin com socket montado ganha botão
`Configurar`. O wizard salva hostname e segredo, limpa o campo sensível depois
do envio e relê `/api/access`; o hostname salvo no banco ganha do fallback do
`.env`.

Para fazer o segredo chegar ao processo real sem arquivo no host, entrou a
ponte interna `GET /internal/access/config/:profile/runtime-env`, fora de
`/api`. Ela devolve as variáveis do perfil apenas dentro da rede do compose,
com `cache-control: no-store`. Os perfis `tailscale` e `cloudflared` agora usam
imagens derivadas mínimas, cada uma com um wrapper Go estático que, se
`TS_AUTHKEY` ou `TUNNEL_TOKEN` não vierem do `.env`, lê essa ponte interna,
injeta as variáveis no ambiente e faz `exec` do binário original.

**O que quebrou a premissa.** A decisão "banco cifrado" é melhor para a
superfície do painel, mas ela não chega sozinha ao container. Medição de API do
Docker: o caminho que temos e aceitamos usar é `POST /containers/:id/start` e
`/stop`; `start` não recebe `Env`, e o container criado pelo compose guarda as
variáveis no momento do `create`. Portanto, sem escrever arquivo do host, sem
duplicar `ContainerCreate` no backend e sem um entrypoint que busque a
configuração no backend ao iniciar, `TS_AUTHKEY` e `TUNNEL_TOKEN` salvos no
banco não configuram o processo que sobe. A primeira ponte tentada copiava
`busybox` de Alpine para as imagens finais; a prova de execução falhou no
Tailscale com `exec /bin/busybox: no such file or directory`, porque a base não
tinha o loader dinâmico esperado. O wrapper Go estático removeu essa hipótese.

**O que ficou de dívida.** A chamada interna não tem sessão nem segredo
próprio; a proteção é topológica: não fica sob `/api`, o nginx não a proxya, e
o backend segue só com `expose: 3000`. Isso evita colocar `MASTER_KEY_HEX` nos
containers de acesso e evita arquivo no host, mas ainda presume que só serviços
do compose alcançam `backend:3000`.

**Testes.** `access.test` prova configuração cifrada, resumo sem segredo,
recusa de configuração incompleta e precedência do hostname salvo sobre o
fallback do `.env`, além da ponte interna em formato shell e JSON. O wrapper
foi validado por build das duas imagens, `docker run` mínimo do Tailscale com
env de fallback, `cloudflared --version` pela imagem derivada, e falha explícita
sem backend/config disponível. `CaminhoExterno.test` prova o wizard do admin e
que a credencial não volta para a tela. Verificações executadas: backend
focado em acesso com **57** testes, `backend` completo em 52 arquivos e **626**
testes, `frontend` completo em 25 arquivos e **244** testes, `npx tsc
--noEmit` nos dois lados, `docker compose --profile tailscale config`, `docker
compose --profile cloudflared config` e `git diff --check` sem erro.

## Ponto 11, feito · alerta informativo para coinjoin e payjoin

**O que foi construído.** Entrou `alertsForTxType`, que lê o `txType` reportado
pelo scanner e gera alerta `privacy_tx_type` quando a transação recebida contém
`coinjoin` ou `payjoin`. O alerta é informativo, fica amarrado ao evento
`utxo_created` que trouxe os fundos, deduplica por carteira, txid e classe, e
usa texto do catálogo nos dois idiomas.

O serviço de origem passou a salvar o `tx_scan` completo e, no mesmo fluxo,
emitir tanto os alertas de origem (`kyc_origin`) quanto o novo alerta de tipo de
transação. A frase diz explicitamente o lado de quem recebeu: coinjoin costuma
ser bom para quem fez, mas para quem recebeu vira contexto sensível antes de
misturar UTXO; payjoin costuma proteger os dois lados, mas ainda merece atenção
antes de gastar junto com outros.

**O que quebrou a premissa.** A hipótese inicial seria tratar coinjoin como
perigo, porque ele aparece em detector de privacidade. Isso cairia na régua já
registrada em `kyc_origin`: o produto repassa o que o scanner viu, sem promover
heurística a fato. A medição local era que `rg "coinjoin|payjoin|whirlpool"
backend/src` não encontrava nenhuma regra, apesar de `tx_scans.tx_type` já
existir e `TxScan.txType` já vir do parser.

**O que ficou de dívida.** O alerta não tenta inferir se a pessoa foi quem fez
o coinjoin/payjoin ou só recebeu dele. O único lado conhecido nesse fluxo é que
a transação criou UTXO na carteira vigiada; qualquer coisa além disso seria
afirmação não medida.

**Testes.** `alerts.test` cobre ausência em `simple-payment`, severidade
informativa, dedupe e renderização PT/EN sem placeholder. `privacy-routes.test`
cobre o fluxo real: análise de transação com `txType: whirlpool-coinjoin`
salva scan e aparece no feed como `privacy_tx_type`. Verificações executadas:
recorte de backend com **95** testes, `backend` completo em 52 arquivos e
**630** testes, `frontend` completo em 25 arquivos e **244** testes, `npx tsc
--noEmit` nos dois lados e `git diff --check` sem erro.

## Ponto 12, feito · erro de fonte nomeado e histórico sem saldo visível

**O que foi construído.** A listagem de carteiras passou a devolver
`spentUtxoCount` e `usedAddressCount`. O cartão usa esses contadores para dizer
"Sem UTXO ativo, com histórico" quando a carteira não tem saldo ativo, mas já
teve movimento ou UTXO gasto. Em erro inicial (`sync_state = error` e
`sync_height` nulo), o cartão deixa de mostrar `0 sats` como fato: mostra saldo
desconhecido, nomeia a fonte que falhou pelo host da `backendUrl`, e inclui o
motivo salvo em `sync_error`.

A rota de UTXO deixou de filtrar só `NOT spent`: ela agora devolve UTXO ativo e
histórico gasto, com `spent` e `spentAtTxid`. A tabela mostra o gasto como
histórico, com opacidade reduzida e sem botão de congelar, porque UTXO já
consumido não é decisão de gasto futura.

**O que quebrou a premissa.** A hipótese do prompt dizia que talvez o UTXO
gasto não sobrevivesse. Isso não se confirmou no código: `events/project.ts`
projeta `utxos.spent = true` e preserva `spent_at_txid` quando a fonte sabe
dizer. O que escondia o histórico era a consulta de tela em
`utxosDaCarteira`, que filtrava `WHERE NOT u.spent`, e a listagem de carteiras,
que só contava saldo e UTXO ativos. A falha de fonte também já estava no banco:
`sync_error = "fetch failed"`; o defeito era a tela anunciar `0 sats` antes de
explicar que `mempool.space` não respondeu.

**O que ficou de dívida.** Não validei a carteira real `HotMain` até o fim,
porque o próprio achado medido é que `mempool.space` está inalcançável desta
rede. A correção foi confirmada por projeção local e testes: histórico gasto
existe quando há evento `utxo_spent`, e erro inicial não vira saldo zero na UI.

**Testes.** `wallets.test` cobre os contadores de histórico no cartão.
`coincontrol-routes.test` e `coincontrol.test` cobrem UTXO gasto voltando pela
rota/projeção com `spent` e `spentAtTxid`. `WalletCard.test` cobre fonte
falhada nomeada, saldo desconhecido em erro inicial e histórico sem saldo.
`UtxoTable.test` cobre a linha gasta sem botão de congelar. Verificações
executadas: recorte backend com **55** testes, recorte frontend com **78**
testes, `backend` completo em 52 arquivos e **632** testes, `frontend` completo
em 25 arquivos e **247** testes, `npx tsc --noEmit` nos dois lados e `git diff
--check` sem erro.

---

## Estimativas de esforço, da análise inicial

A ordem que vale é a de cima, decidida com o dono do projeto. Estes números
ficam porque são a única medida de esforço que temos, e o relógio precisa de
alguma.

### Faixa 1 — sem isto, a demonstração mente (≈2 h)

| # | O quê | Por quê |
|---|---|---|
| 0 | **Trocar a fonte semeada** de `mempool.space` para uma que responda, ou semear as duas e deixar escolher | hoje o primeiro acesso entrega fonte morta |
| 3 | **`scanWallet` recusar resultado vazio** de carteira que tem UTXO, e a tela dizer "não consegui olhar" | é o produto cometendo o que denuncia |
| 1 | **Separar a fonte de análise da fonte de cadeia** — `--api` deixa de receber o RPC do Core | conserta os pontos 2 e 3 na raiz |
| 4 | **Reuso medido do banco**, não do scanner | o dado certo já está lá |

### Faixa 2 — barato e muito visível (≈1,5 h)

| # | O quê |
|---|---|
| 6 | endereço na tabela de moedas — o campo já vem da API |
| 7 | `Copiar` em endereço, txid, altura e hash |
| 8 | rótulo da carteira no feed e no push |
| 5 | histograma em caixas, com rótulo que caiba |
| 13a | "Acessos" → "Acesso Externo" |

### Faixa 3 — o que muda a impressão do produto (≈3 h)

| # | O quê |
|---|---|
| 11 | rota e menu de **Privacidade**, mostrando o que já está no banco sem clique |
| 12 | redesenho de preço e taxa, depois da conversa |
| 9 | a tela dizer qual fonte falhou, em vez de 0% mudo |

### Faixa 4 — se sobrar tempo

| # | O quê |
|---|---|
| 10 | alerta de coinjoin/payjoin a partir do `txType` que já é guardado |
| 13b | wizard de acesso externo pelo caminho **(b)** |
| 9c | histórico de UTXO gasto, depois de investigar |

**O que eu tiraria da frente primeiro:** o ponto 0. Ele é uma linha de
configuração e destrava o teste manual inteiro — sem uma fonte que responda,
metade dos outros pontos não dá nem para conferir.
