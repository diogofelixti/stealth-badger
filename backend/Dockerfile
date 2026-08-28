# O am-i-exposed depende do better-sqlite3, que é módulo nativo e não publica
# prebuild para musl. Sem toolchain o build morre em "Could not find any Python
# installation" — erro que não menciona nem o scanner nem o sqlite, e por isso
# custa caro de diagnosticar. O compilador fica neste estágio e não viaja para
# a imagem final.
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install --omit=dev

FROM node:20-alpine
WORKDIR /app

# O CLI do compose, e não uma biblioteca de Docker.
#
# Ele existe aqui por uma razão só: criar o container de um caminho externo
# pela tela. A API do Docker Engine tem `start` e `stop`, e não tem `up` — ela
# não lê `docker-compose.yml`. Montar o `ContainerCreate` no backend duplicaria
# a definição do serviço e faria tela e compose divergirem em silêncio; chamar
# o compose lê o arquivo que já existe, e não há o que divergir.
#
# Sem `docker-compose.controle.yml` somado ao principal, isto é peso morto:
# não há socket para falar e não há diretório de projeto para ler.
RUN apk add --no-cache docker-cli docker-cli-compose

COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
