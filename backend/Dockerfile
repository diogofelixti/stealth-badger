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
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
