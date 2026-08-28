# Acesso pela Tailscale

Uma rede privada entre os seus aparelhos. É o caminho mais fechado dos que não
exigem Tor: o painel não fica publicado na internet, e só quem está na sua
tailnet o alcança.

## O que ele enxerga

A Tailscale vê **metadado de conexão**, e não o conteúdo: quais máquinas
existem na sua tailnet, quando elas se falam, e de onde. O tráfego em si é
cifrado ponta a ponta entre os seus aparelhos.

O nome da MagicDNS é público: `<máquina>.<tailnet>.ts.net` resolve para
qualquer um que perguntar. O que ele resolve é um endereço `100.x`, que só é
alcançável de dentro da tailnet. É por isso que a página consegue dizer se a
máquina entrou na rede sem que isso signifique que ela está exposta.

## Passo a passo

1. Gere uma auth key no admin da Tailscale e ponha em `TS_AUTHKEY`, no `.env`.

2. Suba o perfil na máquina que hospeda:

   ```
   docker compose --profile tailscale up -d
   ```

3. Aprove a máquina no admin da Tailscale, se a sua tailnet exigir aprovação.

4. Copie o nome da MagicDNS que apareceu no admin para `TAILSCALE_HOSTNAME`, no
   `.env`. É ele que a página resolve para dizer se a máquina entrou na tailnet.

## Como saber que está de pé

A página resolve o nome da MagicDNS. Se ele resolve, a máquina entrou na
tailnet, e o indicador fica verde.

O que isso **não** prova é que você alcança o painel: só quem está na mesma
tailnet alcança o `100.x` que o registro aponta. Verde aqui quer dizer "a
máquina está na rede", e não "este navegador chega nela".

## Quando não funciona

**O nome não resolve.** A máquina não entrou na tailnet. Auth key vencida e
aprovação pendente são as duas causas comuns; `docker compose --profile
tailscale logs` mostra qual das duas.

**O nome resolve e a página não abre.** O aparelho de onde você está não está na
tailnet. Instale o cliente nele e entre na mesma rede.

**O botão de copiar não copia com um clique só.** O endereço da Tailscale é
`http`, e não `https`: o navegador não o considera contexto seguro, e a API
moderna de área de transferência não existe ali. A página cai no caminho de
reserva sozinha, e continua copiando.

## Desligar

```
docker compose --profile tailscale stop
```

Para tirar a máquina da tailnet de vez, remova-a também no admin da Tailscale:
parar o container não a desregistra.
