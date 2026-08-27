# Backlog de 28/08 — profundidade da análise, e o atrito que sobrou

Escrito depois da revisão do dono do projeto sobre a entrega de 27/08. Sete pontos, na
ordem em que foram levantados, mais as respostas às duas perguntas que vieram junto.

Como o backlog anterior: cada item traz **o que construir, por que, o contrato, os testes
que provam e quando está pronto**. O que ele não traz é decisão que não é minha — essas
estão marcadas com **decisão pendente** e agrupadas no fim.

---

## Primeiro, as duas perguntas

### "Está tudo apontando só pra signet? Por quê?"

Sim, e por três razões que se somaram:

1. **`.env` da máquina tem `NETWORK=signet`.** Desde o item 0, essa variável significa
   apenas *"a rede do backend que a instância oferece pronto"* — mas é ela que decide o
   que aparece sem ninguém cadastrar nada;
2. **os oito backends e as nove carteiras no banco são de signet**, porque foram criados
   durante a prova do item 1, que era justamente sobre o nó de signet desta máquina;
3. **o nó desta máquina é de signet.** `bitcoind -signet`, Fulcrum de signet. Mainnet, na
   prática, só existiria pelo mempool.space.

**O que não é verdade:** que o app só vigie signet. O item 0 fez rede ser propriedade da
*fonte*, e o item 2 já monta `https://mempool.space/api` para mainnet. Falta o padrão da
instância oferecer as duas — é o **item 4** abaixo.

### "A análise de privacidade parece muito rasa. Por quê?"

Porque usamos **o mais raso dos quatro modos** do scanner que já está instalado.

Medido agora, com o `am-i-exposed 0.34.3` que já é dependência do projeto:

| Modo | O que devolve | Usamos? |
|---|---|---|
| `scan xpub` | score, `walletInfo` (6 números) e **3 achados** | **sim** — é tudo o que a tela mostra |
| `scan address` | score, `addressInfo` e **8 achados**, com `params` e recomendação por achado | não |
| `scan tx` | score, `txType`, `txInfo`, **10 achados**, `chainAnalysis` | só internamente, para origem dos fundos |
| `boltzmann <txid>` | entropia, eficiência, nº de combinações e **matriz de probabilidade de ligação** | não |

E há mais: **32 heurísticas de transação, 12 módulos de análise de cadeia, e comparação
contra 364 entidades conhecidas (30 milhões de endereços)** — tudo local, no pacote.

A comparação concreta, medida hoje:

| | a sua carteira de signet (`scan xpub`) | `bc1q8yj0…qst4g` (`scan address`) |
|---|---|---|
| score | **66 · C** | **0 · F** |
| achados | 3 | **8** |
| detalhe | "2 de 31 endereços reusados" | "reusado em 97 transações", "12 contrapartes recorrentes, a mais frequente 19 vezes", "78 UTXOs de dust somando 39.752 sats" |
| recomendação | **descartada pelo nosso código** | urgência, manchete, texto e ferramentas |

O último ponto é o mais barato de corrigir: `scan.ts` já recebe `recommendation`
— urgência, manchete, o que fazer e as ferramentas — e **joga fora**. É o "como resolver"
que falta na tela.

---

# Item A — Nenhuma ação clicável sem forma

**O que ficou.** A varredura de 27/08 trocou todos os `<button>`, e **não** os elementos
que agem sem ser botão: `exportar rótulos` é um `<a href>`, `importar rótulos` é um
`<label>` com `input file` escondido dentro. Os dois continuam texto com cor de link.

**O que construir.** O `Button` ganha `as`: `'button' | 'a' | 'label'`, mantendo `sb-btn`
e as variantes. Trocar os dois na `UtxoTable`, e o `exportar rótulos` da página da
carteira.

**Teste que fecha a porta.** Um caso que varre `frontend/src/**/*.tsx` e falha se
encontrar `<a` ou `<label` com `tracking-label` e sem `sb-btn` — a assinatura do
"texto que age". Ele nomeia o arquivo e a linha.

**Pronto quando:** o teste de varredura passa, e `exportar`/`importar` têm borda.

---

# Item B — Cadastrar fonte deixa de estar escondido

**O que ficou.** `+ outro backend` é um `ghost` sublinhado, dentro do formulário de
carteira, abaixo de um `select`. Quem não abre o formulário de carteira nunca o vê.

**O que construir.**

- Em **Configurações**, a seção de fontes vira a primeira, com botão `primary`
  **Adicionar fonte**, e cada fonte listada com apelido, rede, postura e credencial;
- no **formulário de carteira**, o seletor de fonte ganha, ao lado, um botão `secondary`
  **Nova fonte** — mesma altura do campo, não um link solto;
- no **primeiro acesso** (nenhuma carteira e nenhuma fonte própria), o painel abre com
  dois passos numerados: *1. escolha por onde vigiar* · *2. cole a chave*. Hoje ele abre
  no passo 2 e o passo 1 fica implícito.

**Testes.** `AddWallet.test`: o botão de nova fonte existe fora do estado aberto.
`Dashboard.test`: sem carteira e sem fonte própria, os dois passos aparecem na ordem.

**Pronto quando:** dá para cadastrar uma fonte sem passar pelo formulário de carteira.

---

# Item C — Bitcoin Core pelo diretório do nó

**O que ficou.** Cadastrar o Core pede host, porta, modo de autenticação e caminho do
cookie — quatro campos e três conceitos. Quem tem um nó sabe onde ele guarda os dados, e
não necessariamente qual porta a rede usa.

**O que construir.** Um preset **"Bitcoin Core (procurar o meu nó)"** que pede **um campo
só: o diretório de dados** — `/mnt/dados2`, `~/.bitcoin`, `/home/você/.bitcoin`.

```
POST /api/backends/detect  { datadir: "/mnt/dados2" }
  200 → {
    found: true, network: "signet", rpcPort: 38332,
    cookiePath: "/mnt/dados2/signet/.cookie", cookieReadable: true,
    reachable: true, blocks: 319631, chain: "signet"
  }
  200 → { found: false, reason: "notMounted" | "noCookie" | "unreachable",
          hint: "...", compose: "<trecho pronto para colar>" }
```

O backend olha, em ordem: `<datadir>/.cookie` (mainnet), `<datadir>/signet/.cookie`,
`<datadir>/testnet3/.cookie`, `<datadir>/testnet4/.cookie`. A subpasta encontrada **diz a
rede**, e a rede diz a porta — `8332`, `38332`, `18332`. Com o cookie legível, ele chama
`getblockchaininfo` e devolve altura e `chain`, que é a confirmação de que achou o nó
certo. Só então o cadastro acontece, já com rede, URL e credencial preenchidas.

**A falha honesta que este item precisa ter.** O backend roda em container: um diretório
que existe na sua máquina **não existe dentro dele**. Quando `found: false` com
`reason: "notMounted"`, a resposta traz o trecho de `docker-compose.yml` que monta aquele
diretório em modo leitura, com botão de copiar. Dizer "não achei" sem dizer isso manda a
pessoa procurar defeito onde não há.

**Testes.** `detect.test.ts`: com um diretório temporário contendo `signet/.cookie`,
responde rede `signet`, porta `38332` e o caminho; sem nada, responde `notMounted` com o
trecho do compose; cookie ilegível responde `noCookie`. `BackendForm.test`: escolher o
preset mostra **um** campo, e o resultado da detecção preenche o resto.

**Pronto quando:** cadastrar o nó desta máquina é digitar `/mnt/dados2` e confirmar.

---

# Item D — Mainnet e signet lado a lado, desde o primeiro acesso

**O que construir.**

- A instância passa a garantir **duas fontes prontas**: `mempool.space` de mainnet e de
  signet, ambas marcadas como públicas. `NETWORK` deixa de escolher qual existe e passa a
  escolher **qual vem selecionada**;
- o seletor de fonte agrupa por rede, e o rótulo diz a rede antes do host;
- a mensagem de rede incompatível continua como está — ela já nomeia as duas redes.

**Testes.** `backends.test`: instância nova oferece mainnet e signet sem ninguém cadastrar
nada. `wallets.test`: `xpub` de mainnet cadastra sem erro numa instância `NETWORK=signet`
(já passa hoje; vira teste de não-regressão do padrão novo).

**Pronto quando:** um `zpub` de mainnet entra no primeiro acesso, sem configurar fonte.

---

# Item E — Preço e taxa no cabeçalho

**O que construir.** O `Mercado` sai da coluna esquerda e entra na `Shell`, entre o selo
de postura e as ações: preço com a moeda, e as três estimativas em `sat/vB`, compactos, em
uma linha. Abaixo de `lg`, só o preço; a taxa some, e volta na página de Configurações.

**A regra que não muda:** o cabeçalho é onde mora o aviso de privacidade. Preço e taxa
entram **depois** do selo, nunca antes, e **não** acendem a listra — pelo mesmo motivo
registrado na rodada 32.

**Teste.** `Rotas.test`: com preço ligado, o cabeçalho mostra o valor **e** o selo de
postura continua presente nas cinco rotas.

**Pronto quando:** o preço aparece no topo em todas as rotas, e o painel não o repete.

---

# Item F — Acessos externos como no phoenixd-dashboard

**O que eles fazem** (lido no repositório e na documentação): Configurações → Privacidade,
um botão **Ativar** por caminho que baixa a imagem e gera o `.onion`, indicador verde
quando pronto, endereço com **botão de copiar** e **QR code**, e uma página de
documentação por caminho, com o passo a passo de conectar o celular.

**O que temos:** leitura. A página nomeia os três caminhos e diz o comando.

**O que construir, sem decisão pendente:**

- **uma página por caminho** (`/acessos/tor`, `/acessos/tailscale`, `/acessos/cloudflare`),
  com passo a passo numerado, comandos com **botão de copiar**, o que cada um enxerga, e
  o que fazer quando não funciona;
- **indicador de estado**, verde quando o caminho responde: para o Tor, o `hostname`
  existe **e** o serviço está de pé; para o Tailscale, o hostname da MagicDNS; para o
  Cloudflare, o túnel conectado. `GET /api/access` passa a devolver `status` além de
  `enabled`;
- **QR e copiar** no endereço de cada caminho, não só no `.onion`;
- documentação em `docs/acessos/{tor,tailscale,cloudflare}.md`, ligada da tela.

**Decisão pendente 1 — o botão "Ativar".** Ele exige falar com o Docker. O phoenixd-
dashboard monta o socket; nós recusamos isso em 27/08 com a razão escrita: quem alcança
o socket é root na máquina hospedeira, e este projeto é multi-usuário e ensina a publicar
o painel num túnel. Três caminhos, no fim do documento.

---

# Item G — A análise profunda

O item grande, e o mais valioso: **tudo o que falta já está no pacote que instalamos.**

## G1 · Guardar o que já vem e é jogado fora

`scan.ts` descarta `recommendation` — urgência, manchete, detalhe e **ferramentas**
(nome + URL). É o "como resolver". Passa a ser guardado e exibido, com as ferramentas
como links externos marcados como tais.

`links` continua fora **para a varredura de carteira** — ele embute o xpub numa URL de
terceiro. Para endereço e transação, o link vira botão explícito, com o mesmo aviso do
"buscar na cadeia": *clicar entrega este endereço ao am-i.exposed*.

## G2 · Análise por endereço

`POST /api/wallets/:id/addresses/:addressId/scan` roda `scan address` naquele endereço, e
`GET` devolve o resultado guardado. É de onde vêm os achados que a carteira não vê:
**reuso contado**, **contrapartes recorrentes**, **dust identificado como ataque**,
**tamanho do conjunto de UTXOs**, **nível de atividade**, **tipo de script**.

Na `UtxoTable` e na página da carteira, cada endereço ganha um selo com a nota, e clicar
abre o detalhe com os achados e as recomendações.

## G3 · Análise por transação, e a matriz de Boltzmann

O detalhe do alerta já tem o `txid`. Ele ganha, **atrás do mesmo clique que já existe**:

- `scan tx` completo: `txType` (`simple-payment`, `whirlpool-coinjoin`, …), as 10+
  heurísticas com severidade, e a recomendação;
- `boltzmann <txid>`: entropia, eficiência, número de combinações, e a **matriz de
  probabilidade de ligação** entre entradas e saídas.

Medido hoje numa transação real: `score 24 · F`, `txType simple-payment`, achados como
*"mesmo endereço na entrada e na saída — troco revelado"*, *"entropia muito baixa"*,
*"entrada desnecessária"*, e Boltzmann com `entropy 0`, `efficiency 0.33`, matriz
`[[1,1],[1,1]]` — ou seja, **ligação determinística**.

## G4 · Os gráficos

Sete, e cada um responde a uma pergunta que hoje fica sem resposta:

| Gráfico | Pergunta | Dado |
|---|---|---|
| medidor de score | quão exposto estou? | `score` + `grade` |
| linha do histórico | está melhorando? | `privacy_scans`, **já guardado** |
| barras por severidade | o que é urgente? | contagem de `findings` por severidade |
| histograma de UTXOs com faixa de `dust` | onde está o risco? | `utxos` da carteira |
| barra de reuso | quantos endereços reusei? | `walletInfo.reusedAddresses / activeAddresses` |
| mapa de calor da matriz de Boltzmann | esta transação me liga a quem? | `boltzmann.matrix.probabilities` |
| linha do tempo de contrapartes | com quem eu transaciono sempre? | `params.recurringCount` do achado |

Todos com a paleta dos temas, e nenhum com cor literal — a regra 4 do backlog anterior.

## G5 · Tema `cypherpunk`

O quinto tema: fundo preto, verde de fósforo, e a listra de exposição em magenta. Passa
pelo mesmo `theme.test.ts` dos outros quatro — contraste medido, exposto distinguível de
soberano.

## A restrição honesta deste item

O scanner consulta uma **API tipo Esplora** (`--api`). Com fonte Esplora — o mempool.space
ou um Esplora próprio — a análise profunda funciona inteira. Com **Electrum ou Bitcoin
Core puro**, não: não há REST para ele consultar. A tela precisa dizer isso onde o usuário
tentaria, e oferecer a saída: apontar a análise para um Esplora, sabendo que é ele que vê
os endereços consultados. **Fingir que dá é o defeito que este produto existe para
denunciar.**

**Testes.** `scan.test`: `recommendation` sobrevive ao parse. `address-scan.test`: o
resultado guarda `addressInfo`, achados e recomendação. `boltzmann.test`: a matriz é
devolvida como veio, e a tela não a recalcula. `PrivacyPanel.test`: sem análise, nenhuma
consulta sai; com fonte que não é Esplora, a tela **diz por quê** em vez de mostrar erro.

**Pronto quando:** o relatório de um endereço mostra os oito achados que o
`am-i-exposed` produz, cada um com a sua recomendação, e a transação mostra a matriz de
ligação.

---

# Item H — Resetar o usuário para testar do zero

**O que construir.** `npm run reset:user -- <email>` no backend: apaga o usuário e tudo
que cascateia dele — carteiras, endereços, UTXOs, eventos, alertas, canais, análises,
preferências e as fontes próprias — e **preserva** as fontes globais da instância.

Sem argumento, lista os usuários e não apaga nada. Com `--all`, exige a palavra `apagar`
digitada, pela mesma razão do item 4 de 27/08.

**Pronto quando:** o primeiro acesso depois do reset abre no passo 1 do item B, com as
duas fontes do item D já disponíveis.

---

# Decisões tomadas com o dono do projeto em 28/08

| # | Assunto | Decisão |
|---|---|---|
| 1 | **Ativar acesso externo pela tela** | **Socket do Docker no backend**, como o phoenixd-dashboard. Escolhido depois do risco apresentado |
| 2 | **Profundidade por endereço** | **Todos os endereços usados** da carteira |
| 3 | **Ordem** | atrito primeiro (A, H, B, C, D, E), profundidade depois (G), e F por último |

## A exceção do socket, escrita

O backlog de 27/08 recusou montar `/var/run/docker.sock` com esta razão: *quem alcança o
socket é root na máquina hospedeira*, e este projeto é multi-usuário e ensina a publicar o
painel num túnel. A decisão de 28/08 reverte isso, e a consequência fica registrada aqui
em vez de descoberta depois:

**Com o socket montado, uma sessão do painel vale execução de código na máquina que
hospeda.** Se o painel estiver publicado num túnel, isso passa a valer para quem obtiver
uma sessão de fora.

O que estreita a superfície, e é obrigatório neste item:

1. **Lista branca de comandos.** O backend não executa string vinda do cliente. Ele aceita
   `{ profile: 'tor'|'tailscale'|'cloudflared', action: 'up'|'down' }` e monta o comando
   ele mesmo. Nenhum outro verbo, nenhum outro perfil, nenhum `exec`, nenhum `logs`;
2. **`users.is_admin`**, que já existe no schema e nunca foi usado. Quem não é admin
   recebe 403;
3. **a tela diz o que isso significa**, na página de acessos, em cor de atenção — a mesma
   régua do aviso da Cloudflare;
4. **o README diz** que o perfil de controle é opt-in: sem `DOCKER_SOCKET=/var/run/docker.sock`
   montado, tudo continua como antes, em leitura.

---

# Ordem sugerida

| # | Item | Por quê |
|---|---|---|
| 1 | **A** · botões sem forma | quinze minutos, e fecha a queixa mais visível |
| 2 | **H** · reset do usuário | precisa existir antes do teste do zero, que é o que valida B, C e D |
| 3 | **B · C · D** | os três são o mesmo caminho: cadastrar fonte e carteira sem atrito |
| 4 | **E** · preço e taxa no cabeçalho | pequeno, e muda a impressão do topo |
| 5 | **G1 · G2 · G3** | a profundidade, do mais barato ao mais caro |
| 6 | **G4 · G5** | gráficos e tema, que dependem de G1–G3 estarem devolvendo dado |
| 7 | **F** | depende da decisão 1 |
