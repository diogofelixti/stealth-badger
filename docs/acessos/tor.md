# Acesso pelo Tor

O mais soberano dos três caminhos, e o único que não depende de terceiro nenhum.
O painel inteiro passa a ser alcançável por um endereço `.onion`, e ninguém no
meio vê o tráfego nem o destino.

## O que ele enxerga

Ninguém. Não há intermediário que possa ler o conteúdo, e não há operador de
rede que saiba para onde a conexão vai.

O que existe é outra coisa, e é preciso dizer: **o endereço é a credencial de
alcance.** Quem tem o `.onion` chega à tela de login, e a sua senha continua
sendo a única barreira depois disso. Tratar o endereço como segredo é parte da
postura deste caminho.

A chave privada do endereço mora no volume `tor-data`. O backend monta dali
apenas o arquivo `hostname`, em modo leitura: ele lê por onde o painel está
publicado, e nunca enxerga a chave que faz aquele endereço ser aquele endereço.

## Passo a passo

1. Suba o perfil na máquina que hospeda:

   ```
   docker compose --profile tor up -d
   ```

   Na primeira vez, o Tor gera a chave e o endereço. Isso leva alguns segundos.

2. O endereço aparece em **Acessos › Tor**, lido do arquivo `hostname` montado
   em modo leitura.

3. Abra o endereço no Tor Browser, ou leia o QR da página no celular com o Tor
   Browser instalado.

## Como saber que está de pé

A página mostra o estado medido, e não a configuração. Sem o socket do Docker
montado, ela diz **não medido** para este caminho, e a razão é honesta: o
`torrc` deste projeto traz `SocksPort 0`, então não há porta a que perguntar. A
alternativa seria abrir um SOCKS na rede do compose só para poder dar um ping
nele, o que troca uma pergunta por uma superfície.

Com o socket montado (veja `README.md`), o estado vem do container, e o
indicador passa a valer para o Tor também.

## Quando não funciona

**O endereço não aparece depois de subir.** O volume `tor-data` não chegou ao
backend. Confira, em `docker-compose.yml`, o volume em modo leitura no serviço
`backend`, e `TOR_HOSTNAME_PATH` no `.env`.

**O endereço aparece e não abre.** O serviço parou depois de gerar a chave. O
endereço sobrevive ao container, então ele continua na tela mesmo com o Tor fora
do ar. `docker compose --profile tor ps` diz se ele está de pé.

**O endereço mudou sozinho.** O volume foi apagado, e com ele a chave. Endereço
novo, e o antigo não volta.

## Desligar

```
docker compose --profile tor stop
```

O endereço continua existindo enquanto o volume existir. Para apagá-lo de vez,
apague o volume `tor-data`, ciente de que isso é irreversível.
