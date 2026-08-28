# Acesso pelo Cloudflare Tunnel

O caminho que abre em qualquer navegador, sem instalar nada. É também o único
dos três em que um terceiro enxerga o seu tráfego, e este documento existe para
que essa escolha seja feita sabendo.

## O que ele enxerga

**A Cloudflare termina o TLS e enxerga o seu tráfego em claro.** Isso inclui os
endereços que você vigia, os saldos que a tela mostra e as suas credenciais de
login, no momento em que você as digita.

Não é um defeito da Cloudflare: é como um túnel com TLS terminado na borda
funciona. É uma escolha legítima, com uma contrapartida real de conveniência, e
um watchtower de privacidade que a oferecesse sem dizer isso estaria fazendo com
o próprio usuário o que ele denuncia nos exploradores públicos.

Se essa troca não lhe serve, use o Tor ou a Tailscale, que estão nesta mesma
pasta.

## Passo a passo

1. Crie o túnel no painel da Cloudflare e copie o token para `TUNNEL_TOKEN`, no
   `.env`.

2. Suba o perfil na máquina que hospeda:

   ```
   docker compose --profile cloudflared up -d
   ```

3. No painel da Cloudflare, aponte o hostname público para o serviço `nginx` na
   porta `80`, e ponha o domínio em `CLOUDFLARE_HOSTNAME`.

## Como saber que está de pé

A página pergunta ao endpoint de prontidão do próprio `cloudflared`, servido
pela porta de métricas que o `docker-compose.yml` já abre na rede interna.

A resposta traz `readyConnections`. O indicador só fica verde com pelo menos uma
conexão: o `cloudflared` responde `200` assim que o processo sobe, ainda sem
falar com a borda, e verde ali diria que o painel está publicado quando ele não
é alcançável de lugar nenhum.

Sem a porta de métricas não há a quem perguntar, e o estado fica **não medido**.
O túnel pode estar perfeitamente de pé.

## Quando não funciona

**Túnel sem conexão nenhuma.** Token errado, ou a saída da máquina bloqueia a
porta `7844`.

**O domínio abre e o painel não responde.** A rota do túnel está apontando para
outro serviço. Ela precisa apontar para `nginx` na `80`, que é quem serve a
interface.

**O estado fica "não medido".** `CLOUDFLARE_METRICS_URL` aponta para um lugar
que não responde, ou o `--metrics` saiu do comando do serviço.

## Desligar

```
docker compose --profile cloudflared stop
```

O túnel some da borda em segundos. Apague-o também no painel da Cloudflare se
não pretende usá-lo de novo.
