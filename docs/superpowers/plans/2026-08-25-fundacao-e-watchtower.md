# Stealth Badger — Plano 1: Fundação e Watchtower

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o fluxo completo do watchtower — um usuário se cadastra, adiciona um xpub, o sistema deriva endereços, sincroniza contra um explorador Esplora, detecta movimentação e reorganização de cadeia, e dispara alerta deduplicado no feed ao vivo e no ntfy.

**Architecture:** Monorepo TypeScript com backend Fastify (API + worker no mesmo processo) e frontend React/Vite, sobre Postgres. O núcleo de dados é a tabela append-only `chain_events`; `utxos` e saldos são projeções reconstruíveis. O acesso à cadeia passa por adapters que declaram capacidades, porque backends indexados (Esplora, Electrs) e backends de registro+rescan (Floresta, Core) têm modelos incompatíveis. Alertas ao vivo chegam ao browser por SSE alimentado pelo `LISTEN/NOTIFY` do Postgres.

**Tech Stack:** Node 20 · TypeScript strict · Fastify 4 · `pg` com migrações SQL puras · Vitest · `@scure/bip32` e `@scure/btc-signer` · `@noble/hashes` · `@node-rs/argon2` · React 18 · Vite · Tailwind · Docker Compose · nginx

**Spec:** `docs/superpowers/specs/2026-08-24-coin-control-watchtower-design.md`

**Briefing do hackathon:** `docs/hackathon-briefing.md`

**Escopo deste plano:** até o checkpoint de 26/08 às 19h. Privacidade (`am-i-exposed`), coin control, BIP-329 e fingerprints ficam para o Plano 2.

## Global Constraints

- **Node 20.20.2**, npm 10.8.2. Sem Go, sem Rust, sem bun no ambiente.
- **TypeScript `strict: true`** em todos os pacotes. Sem `any` implícito.
- **Nenhum commit, push, tag, branch ou corpo de PR pode mencionar IA, assistentes de IA, ou atribuir coautoria a IA.** Autor único: `diogofelixti <diogofelixti@gmail.com>`. Ver `CLAUDE.md`.
- **Nenhuma chave privada, seed ou capacidade de gasto entra no sistema.** Watch-only sempre.
- **`chain_events` é append-only.** Nunca `UPDATE` de conteúdo nem `DELETE`. Reorg marca `rolled_back_by`.
- **Segredos jamais versionados.** Toda configuração em `.env`, documentada em `.env.example` com valores de exemplo, nunca reais.
- **Testes acompanham cada task.** É critério de avaliação do hackathon e entrega obrigatória.
- Mensagens de commit em português, no imperativo, descrevendo o que mudou e por quê.
- Rede padrão de desenvolvimento: **signet**. A demonstração usa signet e mainnet.
- **A interface é bilíngue, português e inglês, desde o MVP.** Nenhum texto voltado ao
  usuário nasce embutido em código: alertas guardam `type` e `params`, e o texto é
  renderizado a partir de um catálogo servido pelo backend.
- **Jargão de Bitcoin permanece em inglês nos dois idiomas** — `dust attack`,
  `address reuse`, `cold wallet`, `hot wallet`, `UTXO`, `xpub`, `descriptor`,
  `coinjoin`, `gap limit`, `mempool`, `reorg`. Traduzir esses termos produz texto que
  soa a manual mal vertido e afasta justamente quem entende do assunto. O que muda de
  idioma é o texto explicativo em volta.

---

## Estrutura de arquivos

```
stealth-badger/
├── docker-compose.yml           orquestra postgres, backend, frontend, nginx
├── .env.example                 todas as configurações, documentadas
├── infra/
│   └── nginx/default.conf       roteamento + proxy_buffering off no SSE
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── migrations/              SQL puro, numerado, aplicado em ordem
│   │   └── 001_base.sql
│   └── src/
│       ├── index.ts             bootstrap do servidor
│       ├── config.ts            leitura e validação de env
│       ├── db/
│       │   ├── pool.ts          pool do pg
│       │   └── migrate.ts       runner de migrações
│       ├── auth/
│       │   ├── password.ts      argon2id: hash e verificação
│       │   ├── sessions.ts      criação, leitura, expiração
│       │   └── routes.ts        POST /api/auth/register, /login, /logout
│       ├── crypto/
│       │   └── secretbox.ts     AES-256-GCM com chave-mestra do servidor
│       ├── wallet/
│       │   ├── descriptor.ts    parse de xpub/ypub/zpub/vpub e descriptors
│       │   ├── derive.ts        derivação HD → endereço + scripthash
│       │   └── routes.ts        POST /api/wallets, GET /api/wallets
│       ├── chain/
│       │   ├── types.ts         ChainAdapter e ChainCapabilities
│       │   ├── esplora.ts       adapter Esplora/mempool.space
│       │   └── electrum.ts      adapter Electrum (cobre Electrs/Fulcrum/Floresta)
│       ├── sync/
│       │   ├── gap.ts           varredura por gap limit
│       │   ├── engine.ts        reconciliação e emissão de eventos
│       │   └── reorg.ts         detecção e reversão
│       ├── events/
│       │   ├── log.ts           append e leitura de chain_events
│       │   └── project.ts       projeção de utxos e saldo
│       ├── alerts/
│       │   ├── rules.ts         evento on-chain → alerta candidato
│       │   ├── dedupe.ts        chave determinística
│       │   ├── store.ts         persistência + NOTIFY
│       │   └── channels/
│       │       ├── ntfy.ts
│       │       └── webhook.ts
│       ├── stream/
│       │   └── sse.ts           LISTEN do Postgres → EventSource
│       └── worker/
│           └── tick.ts          laço de sincronização
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx
│       ├── styles/tokens.css    variáveis de design — fonte única da verdade
│       ├── lib/api.ts           cliente HTTP
│       ├── components/          Shell, AlertFeed, WalletCard, PrivacyBadge
│       └── pages/               Login, Dashboard, WalletDetail
└── docs/
```

Regra de fronteira: `chain/` não conhece o banco; `events/` não conhece HTTP; `alerts/` consome eventos e não fala com a cadeia. Cada arquivo tem uma responsabilidade e cabe na cabeça de quem o lê.

---
### Task 1: Esqueleto do monorepo, Compose e suíte de testes

Sem isto nada mais pode ser testado. Entrega: `docker compose up` sobe Postgres e backend, `/api/health` responde, `npm test` roda verde.

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`
- Create: `backend/src/app.ts`, `backend/src/index.ts`, `backend/src/config.ts`
- Create: `docker-compose.yml`, `.env.example`, `infra/nginx/default.conf`
- Test: `backend/test/health.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `buildApp(): FastifyInstance` — toda task de rota registra plugins nele. `loadConfig(): Config` com os campos listados no Step 3.

- [ ] **Step 1: Criar o pacote do backend**

`backend/package.json`:

```json
{
  "name": "stealth-badger-backend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "fastify": "^5.8.3",
    "@fastify/cookie": "^10.0.1",
    "pg": "^8.13.1",
    "@scure/bip32": "^1.5.0",
    "@scure/btc-signer": "^1.4.0",
    "@noble/hashes": "^1.6.1",
    "@node-rs/argon2": "^2.0.2",
    "tsx": "^4.19.2"
  },
  "devDependencies": {
    "@types/node": "^20.17.9",
    "@types/pg": "^8.11.10",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`backend/tsconfig.json` — resolução `Bundler` e execução via `tsx`, sem etapa de build. Isso elimina toda a confusão de extensões `.js` em imports ESM, que é a armadilha número um de TypeScript com Node:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

`backend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
    // resetDb() trunca o banco inteiro. Arquivos de teste em paralelo
    // truncariam o banco uns dos outros e a suíte ficaria intermitente.
    fileParallelism: false,
  },
})
```

- [ ] **Step 2: Escrever o teste que falha**

`backend/test/health.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildApp } from '../src/app'

describe('GET /api/health', () => {
  it('responde 200 com status ok', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/health' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

```bash
cd backend && npm install && npm test
```

Esperado: FAIL — `Failed to resolve import "../src/app"`.

- [ ] **Step 4: Implementar o mínimo**

`backend/src/config.ts` — validação explícita, porque variável de ambiente faltando tem que quebrar no boot e não seis horas depois:

```ts
export interface Config {
  port: number
  databaseUrl: string
  masterKeyHex: string
  esploraUrl: string
  network: 'mainnet' | 'signet' | 'testnet'
  publicBackend: boolean
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`)
  return v
}

export function loadConfig(): Config {
  const key = required('MASTER_KEY_HEX')
  if (key.length !== 64) {
    throw new Error('MASTER_KEY_HEX deve ter 64 caracteres hex (32 bytes)')
  }
  const network = (process.env.NETWORK ?? 'signet') as Config['network']
  if (!['mainnet', 'signet', 'testnet'].includes(network)) {
    throw new Error(`NETWORK inválida: ${network}`)
  }
  return {
    port: Number(process.env.PORT ?? 3000),
    // mesmo padrão de db/pool.ts, para que a suíte de testes só precise
    // definir MASTER_KEY_HEX
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgres://badger:badger@localhost:5432/stealth_badger',
    masterKeyHex: key,
    esploraUrl: process.env.ESPLORA_URL ?? 'https://mempool.space/signet/api',
    network,
    publicBackend: process.env.PUBLIC_BACKEND !== 'false',
  }
}
```

`backend/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from 'fastify'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.get('/api/health', async () => ({ status: 'ok' }))

  return app
}
```

`backend/src/index.ts`:

```ts
import { buildApp } from './app'
import { loadConfig } from './config'

const config = loadConfig()
const app = buildApp()

app.listen({ port: config.port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`stealth-badger ouvindo em ${address} · rede ${config.network}`)
})
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
cd backend && npm test
```

Esperado: PASS, 1 teste.

- [ ] **Step 6: Escrever o Compose e o nginx**

`docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: badger
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: stealth_badger
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U badger -d stealth_badger"]
      interval: 3s
      timeout: 3s
      retries: 20
    ports:
      - "127.0.0.1:5432:5432"

  backend:
    build: ./backend
    env_file: .env
    environment:
      DATABASE_URL: postgres://badger:${POSTGRES_PASSWORD}@postgres:5432/stealth_badger
    depends_on:
      postgres:
        condition: service_healthy
    expose:
      - "3000"

  frontend:
    build: ./frontend
    depends_on:
      - backend
    expose:
      - "80"

  nginx:
    image: nginx:alpine
    volumes:
      - ./infra/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    ports:
      - "8080:80"
    depends_on:
      - backend
      - frontend

  ntfy:
    image: binwiederhier/ntfy:latest
    command: serve
    profiles: ["ntfy"]
    ports:
      - "127.0.0.1:8090:80"

volumes:
  pgdata:
```

`infra/nginx/default.conf` — o bloco de SSE é obrigatório. Sem `proxy_buffering off` o feed ao vivo não dá erro: os alertas simplesmente chegam atrasados ou em lote, e parece bug no código da aplicação:

```nginx
server {
    listen 80;

    location /api/stream {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        add_header X-Accel-Buffering no;
    }

    location /api/ {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://frontend:80;
    }
}
```

`backend/Dockerfile` — sem etapa de build, porque a execução é via `tsx`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

`backend/.dockerignore`:

```
node_modules
test
.env
```

`.env.example` — todos os valores são exemplos, nunca reais:

```bash
# Postgres
POSTGRES_PASSWORD=troque-esta-senha

# Chave-mestra para cifrar xpubs em repouso (32 bytes em hex).
# Gere com: openssl rand -hex 32
# Perder esta chave torna os xpubs cadastrados irrecuperáveis.
MASTER_KEY_HEX=0000000000000000000000000000000000000000000000000000000000000000

# Rede: mainnet | signet | testnet
NETWORK=signet

# Backend de cadeia. O padrão é um explorador PÚBLICO: ele enxerga
# quais endereços você consulta. Aponte para infraestrutura própria
# em produção e marque PUBLIC_BACKEND=false.
ESPLORA_URL=https://mempool.space/signet/api
PUBLIC_BACKEND=true

PORT=3000
```

- [ ] **Step 7: Confirmar que o Compose sobe**

```bash
cp .env.example .env
sed -i "s/^MASTER_KEY_HEX=.*/MASTER_KEY_HEX=$(openssl rand -hex 32)/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/" .env
docker compose up -d postgres
docker compose ps
```

Esperado: `postgres` com status `healthy`.

- [ ] **Step 8: Commit**

```bash
git add backend docker-compose.yml .env.example infra
git commit -m "Adiciona esqueleto do backend, Compose e suíte de testes

Fastify com endpoint de saúde, configuração validada no boot, Postgres
com healthcheck e nginx roteando com proxy_buffering desligado no
endpoint de SSE."
```

---

### Task 2: Linguagem visual — tokens e casca da aplicação

Decidida antes de qualquer tela, porque retrofitar linguagem visual em seis telas prontas custa muito mais do que travá-la agora. Esta é a única task cujo portão é revisão humana, não teste automatizado.

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.ts`
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/components/Shell.tsx`, `frontend/src/main.tsx`
- Create: `frontend/Dockerfile`

**Interfaces:**
- Consumes: nada
- Produces: o **contrato de tokens** abaixo. Todas as tasks de frontend consomem esses nomes; os valores podem ser ajustados sem quebrar nada, os nomes não.

- [ ] **Step 1: Carregar a skill de design e decidir a direção**

Invocar a skill `frontend-design`. Direção de partida — **Stealth Badger**: noturno e vigilante, com a listra preto-e-branco do texugo como elemento gráfico recorrente (divisores, indicadores de severidade, marca). Interface densa de dados, não arejada de marketing: isto é um painel de vigilância, e precisa parecer um.

Regra que não se negocia: **severidade tem que ser legível sem depender de cor**, porque daltonismo é comum e o alerta crítico é justamente o que não pode passar batido. Cor acompanha ícone e peso tipográfico, nunca carrega a informação sozinha.

- [ ] **Step 2: Escrever o contrato de tokens**

`frontend/src/styles/tokens.css`. Os **nomes** abaixo são contrato; os valores são ponto de partida a ser ajustado no Step 3:

```css
:root {
  /* TERRA — o sett do texugo, não o preto neutro de terminal.
     Toda superfície é quente e sem croma. */
  --sb-sett:         #16110E;  /* fundo da página */
  --sb-soil:         #1F1813;  /* superfície */
  --sb-clay:         #2A211A;  /* superfície elevada */
  --sb-root:         #3B2F26;  /* borda */

  /* PELO — o branco do texugo é osso, não #fff */
  --sb-bone:         #EDE6DC;
  --sb-muted:        #9C8F80;
  --sb-faint:        #6B6055;

  /* SINAL — regra dura: croma só existe quando algo está errado.
     A interface é monocromática até haver o que avisar. */
  --sb-caution:      #E0A33C;  /* atenção · explorador público */
  --sb-alarm:        #C4472F;  /* crítico */
  --sb-moss:         #7E9E8E;  /* soberano · nada a reportar */

  /* TIPOGRAFIA — inversão deliberada: monoespaçada é a face padrão da
     interface, não a secundária. Um watchtower produz um log, e log é
     artefato monoespaçado. A sans serve só para prosa corrida. */
  --sb-font-data:  'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --sb-font-prose: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;

  --sb-text-xs: 0.75rem;
  --sb-text-sm: 0.8125rem;
  --sb-text-base: 0.9375rem;
  --sb-text-lg: 1.125rem;
  --sb-text-xl: 1.5rem;

  --sb-track-tight: -0.01em;
  --sb-track-label:  0.08em;   /* rótulos em caixa alta, espaçados */

  /* espaçamento — escala de 4px */
  --sb-space-1: 0.25rem;
  --sb-space-2: 0.5rem;
  --sb-space-3: 0.75rem;
  --sb-space-4: 1rem;
  --sb-space-6: 1.5rem;
  --sb-space-8: 2rem;

  --sb-radius: 3px;      /* quase reto: instrumento, não cartão */
  --sb-radius-lg: 5px;
}
```

**Assinatura da interface — a listra de advertência.** A faixa preto-e-branca do
texugo é coloração aposemática: existe para avisar. A aplicação veste essa listra
na aresta superior da página **enquanto o usuário estiver consultando um
explorador público**. Não é um toast que some nem um selo no canto: a interface
inteira está usando a coloração de advertência. Em modo soberano a aresta vira
uma linha sólida e discreta em `--sb-moss`.

A mesma listra codifica severidade na régua esquerda de cada alerta: crítico
recebe a faixa completa, atenção recebe meia, informativo não recebe nenhuma.
A listra nunca decora — sempre significa.

Regra de uso: **todo endereço, txid, valor em sats e caminho de derivação usa `--sb-font-mono`.** Dado de Bitcoin é dado técnico e precisa alinhar em coluna para ser conferível de relance.

- [ ] **Step 3: Montar o artboard da tela-herói e obter aprovação**

Invocar a skill `design` para um **único** artboard: o dashboard com o feed de alertas ao vivo. Essa tela concentra todas as decisões visuais — densidade da lista, tratamento de severidade, badge de privacidade, tabela de UTXO, tipografia monoespaçada.

Deve mostrar simultaneamente: um alerta `critical` (poeira recebida), um `warning` (endereço reutilizado), um `info` (fundos recebidos), o badge de privacidade em **modo público** e um cartão de carteira em estado `importando 43%`.

**PORTÃO:** parar e obter aprovação explícita do usuário antes do Step 4. Ajustar os valores de `tokens.css` conforme o que ele mudar no canvas.

- [ ] **Step 4: Montar o frontend com a casca**

`frontend/package.json`:

```json
{
  "name": "stealth-badger-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^6.0.3"
  }
}
```

`frontend/vite.config.ts` — o proxy faz o `npm run dev` funcionar sem nginx:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
```

`frontend/tailwind.config.ts` — Tailwind lê os tokens, e não o contrário, para que exista uma fonte única da verdade:

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--sb-bg)',
        surface: 'var(--sb-surface)',
        raised: 'var(--sb-surface-raised)',
        line: 'var(--sb-border)',
        ink: 'var(--sb-text)',
        muted: 'var(--sb-text-muted)',
        faint: 'var(--sb-text-faint)',
        accent: 'var(--sb-accent)',
        info: 'var(--sb-info)',
        warning: 'var(--sb-warning)',
        critical: 'var(--sb-critical)',
        public: 'var(--sb-public)',
        sovereign: 'var(--sb-sovereign)',
      },
      fontFamily: {
        ui: 'var(--sb-font-ui)',
        mono: 'var(--sb-font-mono)',
      },
    },
  },
} satisfies Config
```

`frontend/postcss.config.js` — sem este arquivo o Tailwind não processa nada e a
interface sai sem estilo nenhum, silenciosamente:

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

`frontend/src/components/Shell.tsx` — a casca carrega o badge de privacidade, que é persistente por decisão de produto e não um aviso que some:

```tsx
import type { ReactNode } from 'react'

export function PrivacyBadge({ isPublic, host }: { isPublic: boolean; host: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded px-2 py-1 text-xs font-mono"
      style={{
        color: isPublic ? 'var(--sb-public)' : 'var(--sb-sovereign)',
        border: `1px solid ${isPublic ? 'var(--sb-public)' : 'var(--sb-sovereign)'}`,
      }}
      title={
        isPublic
          ? `${host} enxerga quais endereços você consulta`
          : `Consultando ${host} — infraestrutura própria`
      }
    >
      {isPublic ? '◍ público' : '◉ soberano'} · {host}
    </span>
  )
}

export function Shell({ children, badge }: { children: ReactNode; badge: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink font-ui">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <span className="font-mono text-sm tracking-wide">stealth&nbsp;badger</span>
        {badge}
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
```

`frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
```

- [ ] **Step 5: Conferir visualmente**

```bash
cd frontend && npm install && npm run dev
```

Abrir `http://localhost:5173`. Confirmar que a casca renderiza, que o badge aparece em amarelo com o texto `◍ público`, e que a tipografia monoespaçada está aplicada.

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "Define a linguagem visual e a casca da aplicação

Tokens de cor, tipografia e espaçamento como fonte única da verdade,
lidos pelo Tailwind. Badge de privacidade persistente no cabeçalho,
com severidade legível sem depender de cor."
```

---
### Task 3: Migrações e schema base

**Files:**
- Create: `backend/src/db/pool.ts`, `backend/src/db/migrate.ts`
- Create: `backend/migrations/001_base.sql`
- Create: `backend/test/helpers/db.ts`
- Test: `backend/test/migrate.test.ts`

**Interfaces:**
- Consumes: `loadConfig()` da Task 1
- Produces: `pool: Pool` (do `pg`), `migrate(dir?: string): Promise<void>`, e o helper de teste `resetDb(): Promise<void>`

- [ ] **Step 1: Escrever o teste que falha**

`backend/test/migrate.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { migrate } from '../src/db/migrate'
import { pool } from '../src/db/pool'

describe('migrações', () => {
  beforeAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  })

  it('cria as tabelas do schema base', async () => {
    await migrate()
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    const names = rows.map(r => r.table_name)
    expect(names).toEqual(
      expect.arrayContaining([
        'users', 'sessions', 'backends', 'wallets',
        'addresses', 'chain_events', 'utxos', 'alerts', 'channels',
      ]),
    )
  })

  it('é idempotente — rodar de novo não falha nem reaplica', async () => {
    await migrate()
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*) FROM schema_migrations',
    )
    expect(Number(rows[0]!.count)).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
docker compose up -d postgres
cd backend && DATABASE_URL=postgres://badger:$(grep POSTGRES_PASSWORD ../.env | cut -d= -f2)@localhost:5432/stealth_badger npm test -- migrate
```

Esperado: FAIL — `Failed to resolve import "../src/db/migrate"`.

- [ ] **Step 3: Implementar o pool e o runner**

`backend/src/db/pool.ts`:

```ts
import pg from 'pg'

const connectionString =
  process.env.DATABASE_URL ??
  'postgres://badger:badger@localhost:5432/stealth_badger'

export const pool = new pg.Pool({ connectionString, max: 10 })
```

`backend/src/db/migrate.ts` — cada migração roda dentro de uma transação, então falha no meio não deixa o schema pela metade:

```ts
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './pool'

const here = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = path.resolve(here, '../../migrations')

export async function migrate(dir: string = DEFAULT_DIR): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()

  for (const file of files) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [file],
    )
    if (rowCount) continue

    const sql = await readFile(path.join(dir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`migração aplicada: ${file}`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw new Error(`falha na migração ${file}: ${(err as Error).message}`)
    } finally {
      client.release()
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => pool.end())
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}
```

- [ ] **Step 4: Escrever o schema**

`backend/migrations/001_base.sql`:

```sql
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  -- idioma preferido: decide em que língua o push do ntfy sai, já que
  -- notificação não tem seletor para o usuário clicar
  language      TEXT NOT NULL DEFAULT 'pt' CHECK (language IN ('pt','en')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- guarda o sha256 do token, nunca o token: vazamento do banco não concede sessão
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON sessions (user_id);

CREATE TABLE backends (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT REFERENCES users(id) ON DELETE CASCADE,  -- NULL = global
  kind         TEXT NOT NULL CHECK (kind IN ('esplora','electrum','core')),
  url          TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_public    BOOLEAN NOT NULL DEFAULT true,
  network      TEXT NOT NULL CHECK (network IN ('mainnet','signet','testnet')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULLS NOT DISTINCT faz o user_id NULL dos backends globais participar da
  -- unicidade. Sem isto, ON CONFLICT nunca dispara e cada carteira cadastrada
  -- insere uma linha duplicada de backend.
  UNIQUE NULLS NOT DISTINCT (user_id, url, network)
);

CREATE TABLE wallets (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label          TEXT NOT NULL,
  xpub_encrypted BYTEA NOT NULL,
  xpub_fingerprint TEXT NOT NULL,
  script_type    TEXT NOT NULL CHECK (script_type IN ('p2pkh','p2sh-p2wpkh','p2wpkh','p2tr')),
  network        TEXT NOT NULL CHECK (network IN ('mainnet','signet','testnet')),
  gap_limit      INT NOT NULL DEFAULT 20,
  backend_id     BIGINT NOT NULL REFERENCES backends(id),
  sync_state     TEXT NOT NULL DEFAULT 'pending'
                 CHECK (sync_state IN ('pending','importing','synced','degraded','error')),
  sync_progress  INT NOT NULL DEFAULT 0,
  sync_height    INT,
  sync_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON wallets (user_id);

CREATE TABLE addresses (
  id              BIGSERIAL PRIMARY KEY,
  wallet_id       BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  chain           SMALLINT NOT NULL CHECK (chain IN (0,1)),  -- 0=recebimento 1=troco
  idx             INT NOT NULL,
  derivation_path TEXT NOT NULL,
  address         TEXT NOT NULL,
  scripthash      TEXT NOT NULL,
  is_used         BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (wallet_id, chain, idx)
);
CREATE INDEX ON addresses (wallet_id, address);
CREATE INDEX ON addresses (scripthash);

-- APPEND-ONLY. Nunca UPDATE de conteúdo, nunca DELETE.
-- Reorg preenche rolled_back_by; tudo o mais é projeção reconstruível.
CREATE TABLE chain_events (
  id             BIGSERIAL PRIMARY KEY,
  wallet_id      BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN
                   ('utxo_created','utxo_spent','reorg_detected')),
  height         INT,
  block_hash     TEXT,
  txid           TEXT,
  vout           INT,
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  rolled_back_by BIGINT REFERENCES chain_events(id)
);
CREATE INDEX ON chain_events (wallet_id, id);
CREATE INDEX ON chain_events (wallet_id, height) WHERE rolled_back_by IS NULL;

-- projeção derivada de chain_events; pode ser derrubada e reconstruída
CREATE TABLE utxos (
  wallet_id     BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  txid          TEXT NOT NULL,
  vout          INT NOT NULL,
  address_id    BIGINT NOT NULL REFERENCES addresses(id),
  value_sats    BIGINT NOT NULL,
  height        INT,
  spent_at_txid TEXT,
  frozen        BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (wallet_id, txid, vout)
);
CREATE INDEX ON utxos (wallet_id) WHERE spent_at_txid IS NULL;

CREATE TABLE channels (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('ntfy','webhook')),
  config_encrypted BYTEA NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON channels (user_id) WHERE enabled;

-- dedupe_key é a defesa contra três notificações da mesma transação.
-- NÃO existem colunas title e body: gravar texto pronto congela o idioma do
-- alerta para sempre e faz o seletor de idioma não valer para o histórico.
-- Grava-se `type` mais os `params` que a frase precisa; o catálogo bilíngue
-- renderiza na hora de exibir ou de notificar.
CREATE TABLE alerts (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id  BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  severity   TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  params     JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT NOT NULL UNIQUE,
  event_id   BIGINT REFERENCES chain_events(id),
  delivered  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at    TIMESTAMPTZ
);
CREATE INDEX ON alerts (user_id, created_at DESC);
```

- [ ] **Step 5: Escrever o helper de teste**

`backend/test/helpers/db.ts`:

```ts
import { pool } from '../../src/db/pool'
import { migrate } from '../../src/db/migrate'

let ready = false

export async function resetDb(): Promise<void> {
  if (!ready) {
    await migrate()
    ready = true
  }
  await pool.query(`
    TRUNCATE alerts, utxos, chain_events, addresses,
             wallets, channels, backends, sessions, users
    RESTART IDENTITY CASCADE
  `)
}
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
cd backend && npm test -- migrate
```

Esperado: PASS, 2 testes.

- [ ] **Step 7: Commit**

```bash
git add backend/src/db backend/migrations backend/test
git commit -m "Adiciona runner de migrações e schema base

Cada migração roda em transação própria. chain_events é append-only,
com rolled_back_by para reorg; utxos é projeção reconstruível. Sessões
guardam sha256 do token, nunca o token."
```

---

### Task 4: Autenticação com sessões

**Files:**
- Create: `backend/src/auth/password.ts`, `backend/src/auth/sessions.ts`, `backend/src/auth/routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/test/auth.test.ts`

**Interfaces:**
- Consumes: `pool`, `resetDb()`, `buildApp()`
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(stored: string, plain: string): Promise<boolean>`
  - `createSession(userId: number): Promise<string>` — devolve o token em claro, uma única vez
  - `userIdForToken(token: string): Promise<number | null>`
  - `registerAuthRoutes(app: FastifyInstance): void`
  - Decorator `request.userId: number | null` disponível em todas as rotas

- [ ] **Step 1: Escrever o teste que falha**

`backend/test/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './helpers/db'
import { buildApp } from '../src/app'
import { hashPassword, verifyPassword } from '../src/auth/password'
import { createSession, userIdForToken } from '../src/auth/sessions'
import { pool } from '../src/db/pool'

beforeEach(resetDb)

describe('senha', () => {
  it('verifica o hash da própria senha', async () => {
    const h = await hashPassword('texugo-furtivo-2026')
    expect(await verifyPassword(h, 'texugo-furtivo-2026')).toBe(true)
  })

  it('rejeita senha errada', async () => {
    const h = await hashPassword('texugo-furtivo-2026')
    expect(await verifyPassword(h, 'texugo-furtivo-2027')).toBe(false)
  })

  it('não devolve a senha em claro no hash', async () => {
    const h = await hashPassword('texugo-furtivo-2026')
    expect(h).not.toContain('texugo')
  })
})

describe('sessões', () => {
  it('resolve o token para o usuário', async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO users (email, password_hash) VALUES ('a@b.c', 'x') RETURNING id`,
    )
    const userId = rows[0]!.id
    const token = await createSession(userId)
    expect(await userIdForToken(token)).toBe(userId)
  })

  it('rejeita token desconhecido', async () => {
    expect(await userIdForToken('nao-existe')).toBeNull()
  })

  it('não guarda o token em claro no banco', async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO users (email, password_hash) VALUES ('d@e.f', 'x') RETURNING id`,
    )
    const token = await createSession(rows[0]!.id)
    const found = await pool.query('SELECT 1 FROM sessions WHERE token_hash = $1', [token])
    expect(found.rowCount).toBe(0)
  })
})

describe('rotas de autenticação', () => {
  it('registra, faz login e reconhece a sessão', async () => {
    const app = buildApp()

    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
    })
    expect(reg.statusCode).toBe(201)

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
    })
    expect(login.statusCode).toBe(200)
    const cookie = login.cookies.find(c => c.name === 'sb_session')
    expect(cookie).toBeDefined()

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { sb_session: cookie!.value },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().email).toBe('dono@exemplo.com')
  })

  it('o primeiro usuário registrado vira admin', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'primeiro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const { rows } = await pool.query<{ is_admin: boolean }>(
      `SELECT is_admin FROM users WHERE email = 'primeiro@exemplo.com'`,
    )
    expect(rows[0]!.is_admin).toBe(true)
  })

  it('assume português quando o registro não informa idioma', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'sem-idioma@exemplo.com', password: 'senha-bem-comprida' },
    })
    const { rows } = await pool.query<{ language: string }>(
      `SELECT language FROM users WHERE email = 'sem-idioma@exemplo.com'`,
    )
    expect(rows[0]!.language).toBe('pt')
  })

  it('guarda o idioma informado no registro', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'en@exemplo.com', password: 'senha-bem-comprida', language: 'en' },
    })
    const { rows } = await pool.query<{ language: string }>(
      `SELECT language FROM users WHERE email = 'en@exemplo.com'`,
    )
    expect(rows[0]!.language).toBe('en')
  })

  it('troca o idioma e devolve o novo valor em /me', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'troca@exemplo.com', password: 'senha-bem-comprida' },
    })
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'troca@exemplo.com', password: 'senha-bem-comprida' },
    })
    const cookie = login.cookies.find(c => c.name === 'sb_session')!.value

    const put = await app.inject({
      method: 'PUT', url: '/api/auth/language',
      cookies: { sb_session: cookie }, payload: { language: 'en' },
    })
    expect(put.statusCode).toBe(200)

    const me = await app.inject({
      method: 'GET', url: '/api/auth/me', cookies: { sb_session: cookie },
    })
    expect(me.json().language).toBe('en')
  })

  it('recusa idioma não suportado', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'ruim@exemplo.com', password: 'senha-bem-comprida' },
    })
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'ruim@exemplo.com', password: 'senha-bem-comprida' },
    })
    const res = await app.inject({
      method: 'PUT', url: '/api/auth/language',
      cookies: { sb_session: login.cookies.find(c => c.name === 'sb_session')!.value },
      payload: { language: 'tlh' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('recusa login com senha errada', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'x@y.z', password: 'senha-bem-comprida' },
    })
    const bad = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'x@y.z', password: 'errada-mas-comprida' },
    })
    expect(bad.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd backend && npm test -- auth
```

Esperado: FAIL — módulos de `src/auth/` não resolvem.

- [ ] **Step 3: Implementar**

`backend/src/auth/password.ts`:

```ts
import { hash, verify } from '@node-rs/argon2'

const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 }

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS)
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await verify(stored, plain)
  } catch {
    return false
  }
}
```

`backend/src/auth/sessions.ts`:

```ts
import { randomBytes, createHash } from 'node:crypto'
import { pool } from '../db/pool'

const TTL_DAYS = 30

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [digest(token), userId, TTL_DAYS],
  )
  return token
}

export async function userIdForToken(token: string): Promise<number | null> {
  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()`,
    [digest(token)],
  )
  return rows[0] ? Number(rows[0].user_id) : null
}

export async function destroySession(token: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)])
}
```

`backend/src/auth/routes.ts` — o primeiro usuário registrado vira admin, que é o comportamento certo para uma instância self-hosted:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { pool } from '../db/pool'
import { hashPassword, verifyPassword } from './password'
import { createSession, userIdForToken, destroySession } from './sessions'

const COOKIE = 'sb_session'

type Language = 'pt' | 'en'

interface Credentials { email: string; password: string; language?: Language }

export function registerAuthRoutes(app: FastifyInstance): void {
  app.decorateRequest('userId', null)

  app.addHook('preHandler', async (req: FastifyRequest) => {
    const token = req.cookies[COOKIE]
    req.userId = token ? await userIdForToken(token) : null
  })

  app.post<{ Body: Credentials }>('/api/auth/register', async (req, reply) => {
    const { email, password } = req.body
    if (!email?.includes('@') || !password || password.length < 12) {
      return reply.code(400).send({ error: 'e-mail inválido ou senha com menos de 12 caracteres' })
    }

    const { rows: existing } = await pool.query('SELECT count(*) AS n FROM users')
    const isFirst = Number(existing[0]!.n) === 0

    const language: Language = req.body.language === 'en' ? 'en' : 'pt'

    try {
      await pool.query(
        `INSERT INTO users (email, password_hash, is_admin, language)
         VALUES ($1, $2, $3, $4)`,
        [email, await hashPassword(password), isFirst, language],
      )
    } catch {
      return reply.code(409).send({ error: 'e-mail já cadastrado' })
    }
    return reply.code(201).send({ ok: true, isAdmin: isFirst })
  })

  app.post<{ Body: Credentials }>('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body
    const { rows } = await pool.query<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE email = $1',
      [email],
    )
    const user = rows[0]
    if (!user || !(await verifyPassword(user.password_hash, password))) {
      return reply.code(401).send({ error: 'credenciais inválidas' })
    }
    const token = await createSession(Number(user.id))
    return reply
      .setCookie(COOKIE, token, {
        httpOnly: true, sameSite: 'lax', path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 30,
      })
      .send({ ok: true })
  })

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[COOKIE]
    if (token) await destroySession(token)
    return reply.clearCookie(COOKIE, { path: '/' }).send({ ok: true })
  })

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
    const { rows } = await pool.query<{ email: string; is_admin: boolean; language: Language }>(
      'SELECT email, is_admin, language FROM users WHERE id = $1',
      [req.userId],
    )
    return reply.send({
      email: rows[0]!.email,
      isAdmin: rows[0]!.is_admin,
      language: rows[0]!.language,
    })
  })

  // O idioma vive no usuário, e não só no navegador, porque a notificação de
  // push é escrita no servidor e não tem seletor para o usuário clicar.
  app.put<{ Body: { language: Language } }>('/api/auth/language', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
    const { language } = req.body
    if (language !== 'pt' && language !== 'en') {
      return reply.code(400).send({ error: `idioma não suportado: ${language}` })
    }
    await pool.query('UPDATE users SET language = $2 WHERE id = $1', [req.userId, language])
    return reply.send({ ok: true, language })
  })
}
```

Declarar o tipo do decorator, senão o TypeScript reclama em toda rota — `backend/src/types/fastify.d.ts`:

```ts
import 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    userId: number | null
  }
}
```

`backend/src/app.ts` passa a registrar cookies e rotas:

```ts
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import { registerAuthRoutes } from './auth/routes'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false })

  app.register(cookie)
  app.get('/api/health', async () => ({ status: 'ok' }))
  registerAuthRoutes(app)

  return app
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd backend && npm test -- auth
```

Esperado: PASS, 13 testes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth backend/src/app.ts backend/src/types backend/test/auth.test.ts
git commit -m "Adiciona autenticação com sessões em cookie

Argon2id para senhas, sessões opacas com sha256 do token no banco,
e o primeiro usuário registrado recebe permissão de administrador."
```

---
### Task 5: Derivação HD — chave estendida para endereços

Lógica pura, sem banco e sem rede. É a base de tudo, e é onde vetores de teste conhecidos dão certeza absoluta de correção.

**Files:**
- Create: `backend/src/wallet/descriptor.ts`, `backend/src/wallet/derive.ts`
- Test: `backend/test/derive.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `type ScriptType = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'p2tr'`
  - `type Network = 'mainnet' | 'signet' | 'testnet'`
  - `parseExtendedKey(key: string): ParsedKey` com `{ canonicalXpub, scriptType, keyNetwork: 'mainnet' | 'testnet', fingerprint }`
  - `deriveAddress(xpub, scriptType, network, chain: 0|1, index): DerivedAddress` com `{ address, scriptPubKey, scripthash, path }`
  - `electrumScripthash(script: Uint8Array): string`

> **Armadilha que custa uma hora se descoberta tarde:** signet usa **os mesmos bytes de versão e os mesmos prefixos de endereço que a testnet** (`tb1…`, `tpub`, `vpub`). Por isso `parseExtendedKey` devolve `keyNetwork` com apenas dois valores, e a rede real da carteira (`signet` vs `testnet`) vive separada, no registro da carteira. Tratar signet como rede própria na codificação de endereço produz endereços inválidos silenciosamente.

- [ ] **Step 1: Escrever o teste que falha**

Os vetores abaixo vêm da própria BIP-84. Se falharem, conferir contra a BIP antes de suspeitar da implementação.

`backend/test/derive.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseExtendedKey } from '../src/wallet/descriptor'
import { deriveAddress, electrumScripthash } from '../src/wallet/derive'

// Vetores oficiais da BIP-84, conta m/84'/0'/0'
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

describe('parseExtendedKey', () => {
  it('reconhece zpub como p2wpkh de mainnet', () => {
    const p = parseExtendedKey(ZPUB)
    expect(p.scriptType).toBe('p2wpkh')
    expect(p.keyNetwork).toBe('mainnet')
  })

  it('normaliza zpub para a codificação canônica xpub', () => {
    expect(parseExtendedKey(ZPUB).canonicalXpub.startsWith('xpub')).toBe(true)
  })

  it('rejeita entrada que não é chave estendida', () => {
    expect(() => parseExtendedKey('não é uma chave')).toThrow()
  })

  it('rejeita chave privada estendida — o sistema é watch-only', () => {
    const zprv =
      'zprvAdG4iTXWBoARxkkzNpNh8r6Qag3irQB8PzEMkAFeTRXxHpbF9z4QgEvBRmfvqWvGp42t42nvgGpNgYSJA9iefm1yYNZKEm7z6qUWCroSQnE'
    expect(() => parseExtendedKey(zprv)).toThrow(/watch-only|privada/i)
  })
})

describe('deriveAddress', () => {
  it('deriva o primeiro endereço de recebimento da BIP-84', () => {
    const { canonicalXpub } = parseExtendedKey(ZPUB)
    const a = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 0)
    expect(a.address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')
    expect(a.path).toBe('0/0')
  })

  it('deriva o segundo endereço de recebimento', () => {
    const { canonicalXpub } = parseExtendedKey(ZPUB)
    const a = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 1)
    expect(a.address).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g')
  })

  it('deriva o primeiro endereço de troco', () => {
    const { canonicalXpub } = parseExtendedKey(ZPUB)
    const a = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 1, 0)
    expect(a.address).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el')
  })

  it('usa o prefixo de testnet em signet', () => {
    const { canonicalXpub } = parseExtendedKey(ZPUB)
    const a = deriveAddress(canonicalXpub, 'p2wpkh', 'signet', 0, 0)
    expect(a.address.startsWith('tb1')).toBe(true)
  })

  it('endereços diferentes produzem scripthashes diferentes', () => {
    const { canonicalXpub } = parseExtendedKey(ZPUB)
    const a = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 0)
    const b = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 1)
    expect(a.scripthash).not.toBe(b.scripthash)
    expect(a.scripthash).toHaveLength(64)
  })
})

describe('electrumScripthash', () => {
  it('é o sha256 do script, invertido em ordem de bytes', () => {
    // script vazio: sha256('') = e3b0c442...b855, invertido = 55b8...42c4e3
    const h = electrumScripthash(new Uint8Array(0))
    expect(h).toBe(
      '55b852781b9995a44c939b64e441ae2724b96f99c8f4fb9a141cfc9842c4b0e3',
    )
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd backend && npm test -- derive
```

Esperado: FAIL — `src/wallet/descriptor` não resolve.

- [ ] **Step 3: Implementar o parser**

`backend/src/wallet/descriptor.ts`:

```ts
import { base58check } from '@scure/base'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

const b58 = base58check(sha256)

export type ScriptType = 'p2pkh' | 'p2sh-p2wpkh' | 'p2wpkh' | 'p2tr'
export type Network = 'mainnet' | 'signet' | 'testnet'
export type KeyNetwork = 'mainnet' | 'testnet'

export interface ParsedKey {
  canonicalXpub: string
  scriptType: ScriptType
  keyNetwork: KeyNetwork
  fingerprint: string
}

// Bytes de versão SLIP-132
const PUBLIC_VERSIONS: Record<string, { scriptType: ScriptType; keyNetwork: KeyNetwork }> = {
  '0488b21e': { scriptType: 'p2pkh',       keyNetwork: 'mainnet' }, // xpub
  '049d7cb2': { scriptType: 'p2sh-p2wpkh', keyNetwork: 'mainnet' }, // ypub
  '04b24746': { scriptType: 'p2wpkh',      keyNetwork: 'mainnet' }, // zpub
  '043587cf': { scriptType: 'p2pkh',       keyNetwork: 'testnet' }, // tpub
  '044a5262': { scriptType: 'p2sh-p2wpkh', keyNetwork: 'testnet' }, // upub
  '045f1cf6': { scriptType: 'p2wpkh',      keyNetwork: 'testnet' }, // vpub
}

// Versões de chave PRIVADA — reconhecidas apenas para recusar com mensagem clara
const PRIVATE_VERSIONS = new Set([
  '0488ade4', '049d7878', '04b2430c', // xprv, yprv, zprv
  '04358394', '044a4e28', '045f18bc', // tprv, uprv, vprv
])

const CANONICAL: Record<KeyNetwork, string> = {
  mainnet: '0488b21e',
  testnet: '043587cf',
}

export function parseExtendedKey(key: string): ParsedKey {
  let raw: Uint8Array
  try {
    raw = b58.decode(key.trim())
  } catch {
    throw new Error('chave estendida inválida: não é base58check válido')
  }
  if (raw.length !== 78) {
    throw new Error(`chave estendida inválida: ${raw.length} bytes, esperado 78`)
  }

  const version = bytesToHex(raw.slice(0, 4))

  if (PRIVATE_VERSIONS.has(version)) {
    throw new Error(
      'isto é uma chave privada estendida. O Stealth Badger é watch-only e nunca ' +
        'aceita material que permita gastar. Use a chave pública correspondente.',
    )
  }

  const info = PUBLIC_VERSIONS[version]
  if (!info) throw new Error(`bytes de versão desconhecidos: ${version}`)

  // reescreve a versão para a forma canônica que a @scure/bip32 entende
  const canonical = new Uint8Array(raw)
  const target = CANONICAL[info.keyNetwork]
  for (let i = 0; i < 4; i++) {
    canonical[i] = parseInt(target.slice(i * 2, i * 2 + 2), 16)
  }

  return {
    canonicalXpub: b58.encode(canonical),
    scriptType: info.scriptType,
    keyNetwork: info.keyNetwork,
    fingerprint: bytesToHex(raw.slice(5, 9)),
  }
}
```

- [ ] **Step 4: Implementar a derivação**

`backend/src/wallet/derive.ts`:

```ts
import { HDKey } from '@scure/bip32'
import * as btc from '@scure/btc-signer'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import type { Network, ScriptType } from './descriptor'

export interface DerivedAddress {
  address: string
  scriptPubKey: Uint8Array
  scripthash: string
  path: string
}

/** Electrum identifica scripts pelo sha256 do scriptPubKey em ordem de bytes invertida. */
export function electrumScripthash(script: Uint8Array): string {
  return bytesToHex(Uint8Array.from(sha256(script)).reverse())
}

/** signet compartilha a codificação de endereço da testnet. */
function netFor(network: Network) {
  return network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK
}

export function deriveAddress(
  canonicalXpub: string,
  scriptType: ScriptType,
  network: Network,
  chain: 0 | 1,
  index: number,
): DerivedAddress {
  const node = HDKey.fromExtendedKey(canonicalXpub).deriveChild(chain).deriveChild(index)
  if (!node.publicKey) throw new Error('nó derivado sem chave pública')

  const net = netFor(network)
  const pub = node.publicKey

  const payment =
    scriptType === 'p2wpkh'       ? btc.p2wpkh(pub, net)
    : scriptType === 'p2pkh'      ? btc.p2pkh(pub, net)
    : scriptType === 'p2sh-p2wpkh'? btc.p2sh(btc.p2wpkh(pub, net), net)
    :                               btc.p2tr(pub.slice(1), undefined, net)

  if (!payment.address) throw new Error(`não foi possível codificar endereço ${scriptType}`)

  return {
    address: payment.address,
    scriptPubKey: payment.script,
    scripthash: electrumScripthash(payment.script),
    path: `${chain}/${index}`,
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
cd backend && npm test -- derive
```

Esperado: PASS, 11 testes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/wallet backend/test/derive.test.ts
git commit -m "Adiciona derivação HD de chaves estendidas

Reconhece xpub, ypub, zpub, tpub, upub e vpub, normaliza para a
codificação canônica e recusa chaves privadas com mensagem explícita.
Validado contra os vetores oficiais da BIP-84."
```

---

### Task 6: Interface de adapter e implementação Esplora

**Files:**
- Create: `backend/src/chain/types.ts`, `backend/src/chain/esplora.ts`
- Test: `backend/test/esplora.test.ts`

**Interfaces:**
- Consumes: nada
- Produces:
  - `interface ChainCapabilities` e `interface ChainAdapter` (definidas abaixo)
  - `createEsploraAdapter(baseUrl: string, opts?: { isPublic?: boolean; fetchFn?: typeof fetch }): ChainAdapter`
  - `interface TxRef { txid: string; height: number | null; blockHash: string | null }`
  - `interface Utxo { txid: string; vout: number; value: number; height: number | null }`

> A interface declara **capacidades** em vez de nivelar por baixo. Nivelar perderia o `subscribe` do Electrum; assumir acesso aleatório quebraria o Floresta, que exige registrar o descriptor antes e varrer a partir de uma altura. Os métodos opcionais existem exatamente por isso.

- [ ] **Step 1: Escrever o teste que falha**

`backend/test/esplora.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createEsploraAdapter } from '../src/chain/esplora'

function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const key = Object.keys(routes).find(k => url.endsWith(k))
    if (!key) return new Response('not found', { status: 404 })
    const body = routes[key]
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: 200,
    })
  }) as typeof fetch
}

describe('adapter Esplora', () => {
  it('declara acesso aleatório e nega registro e assinatura', () => {
    const a = createEsploraAdapter('https://exemplo/api', { fetchFn: fakeFetch({}) })
    expect(a.capabilities()).toMatchObject({
      randomAccess: true,
      needsRegistration: false,
      supportsSubscribe: false,
    })
  })

  it('marca a postura pública, que alimenta o aviso na interface', () => {
    const pub = createEsploraAdapter('https://mempool.space/signet/api', {
      isPublic: true, fetchFn: fakeFetch({}),
    })
    const own = createEsploraAdapter('http://127.0.0.1:3002', {
      isPublic: false, fetchFn: fakeFetch({}),
    })
    expect(pub.capabilities().isPublic).toBe(true)
    expect(own.capabilities().isPublic).toBe(false)
  })

  it('lê a altura da ponta da cadeia', async () => {
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fakeFetch({ '/blocks/tip/height': '319233' }),
    })
    expect(await a.tipHeight()).toBe(319233)
  })

  it('lê o hash de um bloco por altura', async () => {
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fakeFetch({ '/block-height/319233': '0000abc' }),
    })
    expect(await a.blockHashAt(319233)).toBe('0000abc')
  })

  it('traduz o histórico de um endereço, separando confirmado de mempool', async () => {
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fakeFetch({
        '/address/tb1qexemplo/txs': [
          { txid: 'aa', status: { confirmed: true, block_height: 100, block_hash: 'bb' } },
          { txid: 'cc', status: { confirmed: false } },
        ],
      }),
    })
    const hist = await a.getHistoryForAddress!('tb1qexemplo')
    expect(hist).toEqual([
      { txid: 'aa', height: 100, blockHash: 'bb' },
      { txid: 'cc', height: null, blockHash: null },
    ])
  })

  it('lista os UTXOs de um endereço', async () => {
    const a = createEsploraAdapter('https://exemplo/api', {
      fetchFn: fakeFetch({
        '/address/tb1qexemplo/utxo': [
          { txid: 'aa', vout: 0, value: 5000, status: { confirmed: true, block_height: 100 } },
        ],
      }),
    })
    expect(await a.getUtxosForAddress!('tb1qexemplo')).toEqual([
      { txid: 'aa', vout: 0, value: 5000, height: 100 },
    ])
  })

  it('erra com mensagem legível quando o explorador responde erro', async () => {
    const a = createEsploraAdapter('https://exemplo/api', { fetchFn: fakeFetch({}) })
    await expect(a.tipHeight()).rejects.toThrow(/Esplora/)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd backend && npm test -- esplora
```

Esperado: FAIL — `src/chain/esplora` não resolve.

- [ ] **Step 3: Definir a interface**

`backend/src/chain/types.ts`:

```ts
export interface ChainCapabilities {
  /** responde histórico de qualquer endereço ou script na hora */
  randomAccess: boolean
  /** exige registrar o descriptor antes de acompanhar — Floresta, Core watch-only */
  needsRegistration: boolean
  /** entrega notificação por push em vez de exigir polling */
  supportsSubscribe: boolean
  /** consegue buscar transação arbitrária por txid */
  hasTxIndex: boolean
  /** serviço de terceiro: dispara o aviso persistente de privacidade */
  isPublic: boolean
  /** host exibido no badge da interface */
  host: string
}

export interface TxRef {
  txid: string
  height: number | null
  blockHash: string | null
}

export interface Utxo {
  txid: string
  vout: number
  value: number
  height: number | null
}

export interface ChainAdapter {
  capabilities(): ChainCapabilities
  tipHeight(): Promise<number>
  blockHashAt(height: number): Promise<string>

  // presentes quando randomAccess é true
  getHistoryForAddress?(address: string): Promise<TxRef[]>
  getUtxosForAddress?(address: string): Promise<Utxo[]>

  // presentes quando needsRegistration é true
  registerDescriptor?(descriptor: string): Promise<void>
  rescanFrom?(height: number): Promise<void>

  // presente quando supportsSubscribe é true
  subscribe?(scripthash: string, onChange: () => void): () => void
}
```

- [ ] **Step 4: Implementar o adapter**

`backend/src/chain/esplora.ts`:

```ts
import type { ChainAdapter, ChainCapabilities, TxRef, Utxo } from './types'

interface EsploraStatus {
  confirmed: boolean
  block_height?: number
  block_hash?: string
}
interface EsploraTx { txid: string; status: EsploraStatus }
interface EsploraUtxo { txid: string; vout: number; value: number; status: EsploraStatus }

export function createEsploraAdapter(
  baseUrl: string,
  opts: { isPublic?: boolean; fetchFn?: typeof fetch } = {},
): ChainAdapter {
  const base = baseUrl.replace(/\/+$/, '')
  const doFetch = opts.fetchFn ?? fetch
  const host = (() => {
    try { return new URL(base).host } catch { return base }
  })()

  async function get(path: string): Promise<Response> {
    const res = await doFetch(`${base}${path}`)
    if (!res.ok) {
      throw new Error(`Esplora respondeu ${res.status} em ${path} (${host})`)
    }
    return res
  }

  const caps: ChainCapabilities = {
    randomAccess: true,
    needsRegistration: false,
    supportsSubscribe: false,
    hasTxIndex: true,
    isPublic: opts.isPublic ?? true,
    host,
  }

  return {
    capabilities: () => caps,

    async tipHeight() {
      return Number((await (await get('/blocks/tip/height')).text()).trim())
    },

    async blockHashAt(height: number) {
      return (await (await get(`/block-height/${height}`)).text()).trim()
    },

    async getHistoryForAddress(address: string): Promise<TxRef[]> {
      const txs = (await (await get(`/address/${address}/txs`)).json()) as EsploraTx[]
      return txs.map(t => ({
        txid: t.txid,
        height: t.status.confirmed ? t.status.block_height ?? null : null,
        blockHash: t.status.confirmed ? t.status.block_hash ?? null : null,
      }))
    },

    async getUtxosForAddress(address: string): Promise<Utxo[]> {
      const utxos = (await (await get(`/address/${address}/utxo`)).json()) as EsploraUtxo[]
      return utxos.map(u => ({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        height: u.status.confirmed ? u.status.block_height ?? null : null,
      }))
    },
  }
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
cd backend && npm test -- esplora
```

Esperado: PASS, 7 testes.

- [ ] **Step 6: Verificar contra o explorador real**

```bash
curl -s https://mempool.space/signet/api/blocks/tip/height
```

Esperado: um número próximo de 319233. Confirma que o formato assumido pelos testes corresponde ao serviço de verdade.

- [ ] **Step 7: Commit**

```bash
git add backend/src/chain backend/test/esplora.test.ts
git commit -m "Adiciona interface de adapter de cadeia e implementação Esplora

Adapters declaram capacidades em vez de nivelar por baixo, porque
backends indexados e backends de registro mais rescan têm modelos
incompatíveis. A postura pública viaja nas capacidades e alimenta o
aviso de privacidade na interface."
```

---
### Task 7: Cifra em repouso, cadastro de carteira e varredura por gap limit

**Files:**
- Create: `backend/src/crypto/secretbox.ts`, `backend/src/sync/gap.ts`, `backend/src/wallet/routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/test/secretbox.test.ts`, `backend/test/gap.test.ts`, `backend/test/wallets.test.ts`

**Interfaces:**
- Consumes: `parseExtendedKey`, `deriveAddress`, `ChainAdapter`, `pool`, `buildApp`
- Produces:
  - `seal(plain: string, keyHex: string): Buffer` e `open(sealed: Buffer, keyHex: string): string`
  - `scanGap(opts: GapScanOptions): Promise<ScannedAddress[]>` com `ScannedAddress = { chain, index, address, scripthash, path, used }`
  - `registerWalletRoutes(app: FastifyInstance): void` — `POST /api/wallets`, `GET /api/wallets`

> **Modelo de ameaça, declarado sem exagero.** O xpub é cifrado com AES-256-GCM usando chave-mestra do servidor (`MASTER_KEY_HEX`). Isso protege contra dump de banco, backup vazado e Postgres mal exposto. **Não** protege contra comprometimento total do servidor — a chave está lá. Cifrar com chave derivada da senha do usuário seria mais forte, mas impede o worker de sincronizar enquanto o usuário está offline, que é exatamente quando um watchtower precisa vigiar. Documentar essa escolha no README com estas palavras.

- [ ] **Step 1: Escrever os testes que falham**

`backend/test/secretbox.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { seal, open } from '../src/crypto/secretbox'

const KEY = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)

describe('secretbox', () => {
  it('abre o que ele mesmo selou', () => {
    const sealed = seal('zpub6rFR7y4Q2AijB', KEY)
    expect(open(sealed, KEY)).toBe('zpub6rFR7y4Q2AijB')
  })

  it('não deixa o texto em claro visível no resultado', () => {
    const sealed = seal('zpub6rFR7y4Q2AijB', KEY)
    expect(sealed.toString('utf8')).not.toContain('zpub')
  })

  it('produz saída diferente a cada chamada — nonce aleatório', () => {
    expect(seal('mesmo', KEY).equals(seal('mesmo', KEY))).toBe(false)
  })

  it('recusa chave errada em vez de devolver lixo', () => {
    expect(() => open(seal('segredo', KEY), OTHER)).toThrow()
  })

  it('recusa conteúdo adulterado', () => {
    const sealed = seal('segredo', KEY)
    sealed[sealed.length - 1] ^= 0xff
    expect(() => open(sealed, KEY)).toThrow()
  })
})
```

`backend/test/gap.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { scanGap } from '../src/sync/gap'
import type { ChainAdapter } from '../src/chain/types'

/** Adapter falso: só os endereços listados têm histórico. */
function adapterWithUsed(used: Set<string>): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true, needsRegistration: false, supportsSubscribe: false,
      hasTxIndex: true, isPublic: false, host: 'falso',
    }),
    tipHeight: async () => 100,
    blockHashAt: async () => 'hash',
    getHistoryForAddress: async (addr: string) =>
      used.has(addr) ? [{ txid: 'aa', height: 10, blockHash: 'bb' }] : [],
  }
}

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

const base = {
  canonicalXpub: '', scriptType: 'p2wpkh' as const,
  network: 'mainnet' as const, chain: 0 as const,
}

describe('scanGap', () => {
  it('para após gapLimit endereços consecutivos sem uso', async () => {
    const { parseExtendedKey } = await import('../src/wallet/descriptor')
    const canonicalXpub = parseExtendedKey(ZPUB).canonicalXpub
    const found = await scanGap({
      ...base, canonicalXpub, gapLimit: 5,
      adapter: adapterWithUsed(new Set()),
    })
    expect(found).toHaveLength(5)
    expect(found.every(a => !a.used)).toBe(true)
  })

  it('estende a varredura quando encontra endereço usado', async () => {
    const { parseExtendedKey } = await import('../src/wallet/descriptor')
    const { deriveAddress } = await import('../src/wallet/derive')
    const canonicalXpub = parseExtendedKey(ZPUB).canonicalXpub
    const third = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 3).address

    const found = await scanGap({
      ...base, canonicalXpub, gapLimit: 5,
      adapter: adapterWithUsed(new Set([third])),
    })

    // usado no índice 3 reinicia a contagem: varre até o índice 8
    expect(found).toHaveLength(9)
    expect(found.filter(a => a.used).map(a => a.index)).toEqual([3])
  })

  it('marca corretamente qual endereço foi usado', async () => {
    const { parseExtendedKey } = await import('../src/wallet/descriptor')
    const { deriveAddress } = await import('../src/wallet/derive')
    const canonicalXpub = parseExtendedKey(ZPUB).canonicalXpub
    const first = deriveAddress(canonicalXpub, 'p2wpkh', 'mainnet', 0, 0).address

    const found = await scanGap({
      ...base, canonicalXpub, gapLimit: 3,
      adapter: adapterWithUsed(new Set([first])),
    })
    expect(found[0]!.used).toBe(true)
    expect(found[0]!.address).toBe(first)
  })
})
```

`backend/test/wallets.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './helpers/db'
import { buildApp } from '../src/app'
import { pool } from '../src/db/pool'
import { open } from '../src/crypto/secretbox'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'

async function loggedInApp() {
  const app = buildApp()
  await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
  })
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login',
    payload: { email: 'dono@exemplo.com', password: 'senha-bem-comprida' },
  })
  return { app, cookie: login.cookies.find(c => c.name === 'sb_session')!.value }
}

beforeEach(resetDb)

describe('POST /api/wallets', () => {
  it('recusa sem autenticação', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST', url: '/api/wallets',
      payload: { label: 'x', key: ZPUB },
    })
    expect(res.statusCode).toBe(401)
  })

  it('cadastra a carteira e guarda o xpub cifrado', async () => {
    const { app, cookie } = await loggedInApp()
    const res = await app.inject({
      method: 'POST', url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().scriptType).toBe('p2wpkh')
    expect(res.json().syncState).toBe('pending')

    const { rows } = await pool.query<{ xpub_encrypted: Buffer }>(
      'SELECT xpub_encrypted FROM wallets',
    )
    expect(rows[0]!.xpub_encrypted.toString('utf8')).not.toContain('zpub')
    expect(open(rows[0]!.xpub_encrypted, process.env.MASTER_KEY_HEX!)).toContain('pub')
  })

  it('nunca devolve o xpub na resposta da API', async () => {
    const { app, cookie } = await loggedInApp()
    const res = await app.inject({
      method: 'POST', url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })
    expect(JSON.stringify(res.json())).not.toContain('pub6')
  })

  it('recusa chave privada estendida com mensagem clara', async () => {
    const { app, cookie } = await loggedInApp()
    const res = await app.inject({
      method: 'POST', url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: {
        label: 'Perigo',
        key: 'zprvAdG4iTXWBoARxkkzNpNh8r6Qag3irQB8PzEMkAFeTRXxHpbF9z4QgEvBRmfvqWvGp42t42nvgGpNgYSJA9iefm1yYNZKEm7z6qUWCroSQnE',
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/watch-only|privada/i)
  })

  it('lista apenas as carteiras do próprio usuário', async () => {
    const { app, cookie } = await loggedInApp()
    await app.inject({
      method: 'POST', url: '/api/wallets',
      cookies: { sb_session: cookie },
      payload: { label: 'Cofre', key: ZPUB },
    })

    await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { email: 'outro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const outro = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: 'outro@exemplo.com', password: 'senha-bem-comprida' },
    })
    const lista = await app.inject({
      method: 'GET', url: '/api/wallets',
      cookies: { sb_session: outro.cookies.find(c => c.name === 'sb_session')!.value },
    })
    expect(lista.json()).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
cd backend && npm test -- secretbox gap wallets
```

Esperado: FAIL nos três arquivos, por módulos ausentes.

- [ ] **Step 3: Implementar a cifra**

`backend/src/crypto/secretbox.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const NONCE = 12
const TAG = 16

/** Formato do blob: nonce(12) ‖ tag(16) ‖ ciphertext */
export function seal(plain: string, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('chave-mestra deve ter 32 bytes')

  const nonce = randomBytes(NONCE)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([nonce, cipher.getAuthTag(), body])
}

export function open(sealed: Buffer, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('chave-mestra deve ter 32 bytes')
  if (sealed.length < NONCE + TAG) throw new Error('blob cifrado truncado')

  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, NONCE))
  decipher.setAuthTag(sealed.subarray(NONCE, NONCE + TAG))
  return Buffer.concat([
    decipher.update(sealed.subarray(NONCE + TAG)),
    decipher.final(),
  ]).toString('utf8')
}
```

- [ ] **Step 4: Implementar a varredura por gap limit**

`backend/src/sync/gap.ts`:

```ts
import { deriveAddress } from '../wallet/derive'
import type { Network, ScriptType } from '../wallet/descriptor'
import type { ChainAdapter } from '../chain/types'

export interface ScannedAddress {
  chain: 0 | 1
  index: number
  address: string
  scripthash: string
  path: string
  used: boolean
}

export interface GapScanOptions {
  adapter: ChainAdapter
  canonicalXpub: string
  scriptType: ScriptType
  network: Network
  chain: 0 | 1
  gapLimit: number
  /** trava de segurança contra xpub com histórico patológico */
  maxIndex?: number
}

export async function scanGap(opts: GapScanOptions): Promise<ScannedAddress[]> {
  const { adapter, canonicalXpub, scriptType, network, chain, gapLimit } = opts
  const maxIndex = opts.maxIndex ?? 1000

  if (!adapter.getHistoryForAddress) {
    throw new Error(
      'este adapter não oferece acesso aleatório; use o caminho de registro e rescan',
    )
  }

  const found: ScannedAddress[] = []
  let consecutiveUnused = 0

  for (let index = 0; index < maxIndex; index++) {
    const d = deriveAddress(canonicalXpub, scriptType, network, chain, index)
    const history = await adapter.getHistoryForAddress(d.address)
    const used = history.length > 0

    found.push({ chain, index, address: d.address, scripthash: d.scripthash, path: d.path, used })

    consecutiveUnused = used ? 0 : consecutiveUnused + 1
    if (consecutiveUnused >= gapLimit) break
  }

  return found
}
```

- [ ] **Step 5: Implementar as rotas de carteira**

`backend/src/wallet/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { pool } from '../db/pool'
import { seal } from '../crypto/secretbox'
import { parseExtendedKey, type Network } from './descriptor'
import { loadConfig } from '../config'

interface CreateWalletBody { label: string; key: string; gapLimit?: number }

async function ensureBackend(network: Network): Promise<number> {
  const cfg = loadConfig()
  // DO UPDATE em vez de DO NOTHING para que RETURNING sempre traga o id,
  // tanto na inserção quanto no reaproveitamento
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO backends (user_id, kind, url, is_public, network)
     VALUES (NULL, 'esplora', $1, $2, $3)
     ON CONFLICT (user_id, url, network)
     DO UPDATE SET is_public = EXCLUDED.is_public
     RETURNING id`,
    [cfg.esploraUrl, cfg.publicBackend, network],
  )
  return Number(rows[0]!.id)
}

export function registerWalletRoutes(app: FastifyInstance): void {
  app.post<{ Body: CreateWalletBody }>('/api/wallets', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { label, key, gapLimit } = req.body
    if (!label?.trim()) return reply.code(400).send({ error: 'rótulo obrigatório' })

    let parsed
    try {
      parsed = parseExtendedKey(key)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }

    const cfg = loadConfig()
    const network: Network =
      parsed.keyNetwork === 'mainnet' ? 'mainnet' : cfg.network === 'mainnet' ? 'testnet' : cfg.network

    const backendId = await ensureBackend(network)

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO wallets
         (user_id, label, xpub_encrypted, xpub_fingerprint, script_type,
          network, gap_limit, backend_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        req.userId, label.trim(),
        seal(parsed.canonicalXpub, cfg.masterKeyHex),
        parsed.fingerprint, parsed.scriptType,
        network, gapLimit ?? 20, backendId,
      ],
    )

    // a resposta jamais carrega o xpub
    return reply.code(201).send({
      id: Number(rows[0]!.id),
      label: label.trim(),
      scriptType: parsed.scriptType,
      network,
      fingerprint: parsed.fingerprint,
      syncState: 'pending',
    })
  })

  app.get('/api/wallets', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    const { rows } = await pool.query(
      `SELECT w.id, w.label, w.script_type AS "scriptType", w.network,
              w.xpub_fingerprint AS fingerprint, w.sync_state AS "syncState",
              w.sync_progress AS "syncProgress", w.sync_height AS "syncHeight",
              b.is_public AS "backendIsPublic", b.url AS "backendUrl",
              COALESCE((
                SELECT sum(value_sats) FROM utxos u
                WHERE u.wallet_id = w.id AND u.spent_at_txid IS NULL
              ), 0)::bigint AS "balanceSats"
         FROM wallets w
         JOIN backends b ON b.id = w.backend_id
        WHERE w.user_id = $1
        ORDER BY w.created_at DESC`,
      [req.userId],
    )
    return reply.send(rows)
  })
}
```

Registrar em `backend/src/app.ts`, logo após `registerAuthRoutes(app)`:

```ts
import { registerWalletRoutes } from './wallet/routes'
// ...
registerWalletRoutes(app)
```

- [ ] **Step 6: Rodar e confirmar que passam**

```bash
cd backend && MASTER_KEY_HEX=$(openssl rand -hex 32) npm test -- secretbox gap wallets
```

Esperado: PASS, 13 testes.

- [ ] **Step 7: Commit**

```bash
git add backend/src/crypto backend/src/sync/gap.ts backend/src/wallet/routes.ts backend/src/app.ts backend/test
git commit -m "Adiciona cifra em repouso, cadastro de carteira e varredura por gap limit

xpub cifrado com AES-256-GCM sob chave-mestra do servidor, escolha que
permite ao worker sincronizar com o usuário offline. A API nunca devolve
o xpub, e chave privada estendida é recusada com mensagem explícita."
```

---

### Task 8: Log de eventos e projeção de UTXO

O coração do modelo de dados. Tudo o que a interface mostra vem daqui.

**Files:**
- Create: `backend/src/events/log.ts`, `backend/src/events/project.ts`
- Test: `backend/test/events.test.ts`

**Interfaces:**
- Consumes: `pool`, `resetDb`
- Produces:
  - `appendEvent(e: NewEvent): Promise<number>` com `NewEvent = { walletId, type, height, blockHash, txid, vout, payload }`
  - `activeEvents(walletId: number): Promise<StoredEvent[]>` — ignora os revertidos
  - `projectWallet(walletId: number): Promise<void>` — reconstrói `utxos` do zero a partir do log
  - `walletBalance(walletId: number): Promise<number>`

- [ ] **Step 1: Escrever o teste que falha**

`backend/test/events.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './helpers/db'
import { pool } from '../src/db/pool'
import { appendEvent, activeEvents } from '../src/events/log'
import { projectWallet, walletBalance } from '../src/events/project'

let walletId: number
let addressId: number

beforeEach(async () => {
  await resetDb()
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ('a@b.c','x') RETURNING id`)
  const b = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind, url, network) VALUES ('esplora','http://x','signet') RETURNING id`)
  const w = await pool.query<{ id: string }>(
    `INSERT INTO wallets (user_id, label, xpub_encrypted, xpub_fingerprint,
                          script_type, network, backend_id)
     VALUES ($1,'Cofre','\\x00','aabbccdd','p2wpkh','signet',$2) RETURNING id`,
    [u.rows[0]!.id, b.rows[0]!.id])
  walletId = Number(w.rows[0]!.id)
  const a = await pool.query<{ id: string }>(
    `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash)
     VALUES ($1,0,0,'0/0','tb1qexemplo','ff') RETURNING id`, [walletId])
  addressId = Number(a.rows[0]!.id)
})

describe('log de eventos', () => {
  it('acrescenta e relê eventos ativos', async () => {
    await appendEvent({
      walletId, type: 'utxo_created', height: 100, blockHash: 'bb',
      txid: 'aa', vout: 0, payload: { addressId, valueSats: 5000 },
    })
    const events = await activeEvents(walletId)
    expect(events).toHaveLength(1)
    expect(events[0]!.type).toBe('utxo_created')
  })

  it('omite eventos revertidos por reorg', async () => {
    const id = await appendEvent({
      walletId, type: 'utxo_created', height: 100, blockHash: 'bb',
      txid: 'aa', vout: 0, payload: { addressId, valueSats: 5000 },
    })
    const reorgId = await appendEvent({
      walletId, type: 'reorg_detected', height: 100, blockHash: null,
      txid: null, vout: null, payload: {},
    })
    await pool.query('UPDATE chain_events SET rolled_back_by = $1 WHERE id = $2', [reorgId, id])

    const active = await activeEvents(walletId)
    expect(active.map(e => e.type)).toEqual(['reorg_detected'])
  })
})

describe('projeção', () => {
  it('constrói o conjunto de UTXOs a partir do log', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'b1',
      txid: 'aa', vout: 0, payload: { addressId, valueSats: 5000 } })
    await appendEvent({ walletId, type: 'utxo_created', height: 101, blockHash: 'b2',
      txid: 'cc', vout: 1, payload: { addressId, valueSats: 3000 } })

    await projectWallet(walletId)

    const { rows } = await pool.query('SELECT * FROM utxos WHERE wallet_id = $1', [walletId])
    expect(rows).toHaveLength(2)
    expect(await walletBalance(walletId)).toBe(8000)
  })

  it('marca como gasto e tira do saldo', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'b1',
      txid: 'aa', vout: 0, payload: { addressId, valueSats: 5000 } })
    await appendEvent({ walletId, type: 'utxo_spent', height: 102, blockHash: 'b3',
      txid: 'aa', vout: 0, payload: { spentAtTxid: 'dd' } })

    await projectWallet(walletId)
    expect(await walletBalance(walletId)).toBe(0)

    const { rows } = await pool.query<{ spent_at_txid: string }>(
      'SELECT spent_at_txid FROM utxos WHERE wallet_id = $1', [walletId])
    expect(rows[0]!.spent_at_txid).toBe('dd')
  })

  it('é idempotente — projetar duas vezes dá o mesmo resultado', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'b1',
      txid: 'aa', vout: 0, payload: { addressId, valueSats: 5000 } })
    await projectWallet(walletId)
    await projectWallet(walletId)
    const { rows } = await pool.query('SELECT * FROM utxos WHERE wallet_id = $1', [walletId])
    expect(rows).toHaveLength(1)
  })

  it('ignora eventos revertidos ao projetar', async () => {
    const id = await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'b1',
      txid: 'aa', vout: 0, payload: { addressId, valueSats: 5000 } })
    const reorgId = await appendEvent({ walletId, type: 'reorg_detected', height: 100,
      blockHash: null, txid: null, vout: null, payload: {} })
    await pool.query('UPDATE chain_events SET rolled_back_by = $1 WHERE id = $2', [reorgId, id])

    await projectWallet(walletId)
    expect(await walletBalance(walletId)).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd backend && npm test -- events
```

Esperado: FAIL — `src/events/log` não resolve.

- [ ] **Step 3: Implementar o log**

`backend/src/events/log.ts`:

```ts
import { pool } from '../db/pool'

export type EventType = 'utxo_created' | 'utxo_spent' | 'reorg_detected'

export interface NewEvent {
  walletId: number
  type: EventType
  height: number | null
  blockHash: string | null
  txid: string | null
  vout: number | null
  payload: Record<string, unknown>
}

export interface StoredEvent extends NewEvent {
  id: number
  occurredAt: Date
}

/**
 * chain_events é append-only: esta é a única função que escreve nela,
 * e ela nunca faz UPDATE de conteúdo nem DELETE.
 */
export async function appendEvent(e: NewEvent): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO chain_events (wallet_id, type, height, block_hash, txid, vout, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [e.walletId, e.type, e.height, e.blockHash, e.txid, e.vout, JSON.stringify(e.payload)],
  )
  return Number(rows[0]!.id)
}

export async function activeEvents(walletId: number): Promise<StoredEvent[]> {
  const { rows } = await pool.query(
    `SELECT id, wallet_id, type, height, block_hash, txid, vout, payload, occurred_at
       FROM chain_events
      WHERE wallet_id = $1 AND rolled_back_by IS NULL
      ORDER BY id ASC`,
    [walletId],
  )
  return rows.map(r => ({
    id: Number(r.id),
    walletId: Number(r.wallet_id),
    type: r.type as EventType,
    height: r.height,
    blockHash: r.block_hash,
    txid: r.txid,
    vout: r.vout,
    payload: r.payload,
    occurredAt: r.occurred_at,
  }))
}
```

- [ ] **Step 4: Implementar a projeção**

`backend/src/events/project.ts` — reconstrói do zero em vez de aplicar incrementos, o que torna a operação idempotente e corrige qualquer divergência acumulada:

```ts
import { pool } from '../db/pool'
import { activeEvents } from './log'

interface CreatedPayload { addressId: number; valueSats: number }
interface SpentPayload { spentAtTxid: string }

export async function projectWallet(walletId: number): Promise<void> {
  const events = await activeEvents(walletId)

  const utxos = new Map<
    string,
    { txid: string; vout: number; addressId: number; valueSats: number;
      height: number | null; spentAtTxid: string | null }
  >()

  for (const e of events) {
    if (e.type === 'utxo_created' && e.txid !== null && e.vout !== null) {
      const p = e.payload as unknown as CreatedPayload
      utxos.set(`${e.txid}:${e.vout}`, {
        txid: e.txid, vout: e.vout,
        addressId: p.addressId, valueSats: p.valueSats,
        height: e.height, spentAtTxid: null,
      })
    } else if (e.type === 'utxo_spent' && e.txid !== null && e.vout !== null) {
      const found = utxos.get(`${e.txid}:${e.vout}`)
      if (found) found.spentAtTxid = (e.payload as unknown as SpentPayload).spentAtTxid
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM utxos WHERE wallet_id = $1', [walletId])
    for (const u of utxos.values()) {
      await client.query(
        `INSERT INTO utxos (wallet_id, txid, vout, address_id, value_sats, height, spent_at_txid)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [walletId, u.txid, u.vout, u.addressId, u.valueSats, u.height, u.spentAtTxid],
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function walletBalance(walletId: number): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `SELECT COALESCE(sum(value_sats), 0)::bigint AS total
       FROM utxos WHERE wallet_id = $1 AND spent_at_txid IS NULL`,
    [walletId],
  )
  return Number(rows[0]!.total)
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
cd backend && npm test -- events
```

Esperado: PASS, 7 testes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/events backend/test/events.test.ts
git commit -m "Adiciona log de eventos append-only e projeção de UTXO

A projeção reconstrói o conjunto de UTXOs do zero a cada execução, o que
a torna idempotente e capaz de corrigir divergência acumulada. Eventos
revertidos por reorg são ignorados na leitura e na projeção."
```

---
### Task 9: Motor de sincronização e tratamento de reorganização

**Files:**
- Create: `backend/src/sync/reorg.ts`, `backend/src/sync/engine.ts`
- Test: `backend/test/reorg.test.ts`, `backend/test/engine.test.ts`

**Interfaces:**
- Consumes: `scanGap`, `appendEvent`, `activeEvents`, `projectWallet`, `open`, `ChainAdapter`
- Produces:
  - `detectReorg(walletId: number, adapter: ChainAdapter): Promise<number | null>` — devolve a altura divergente ou `null`
  - `rollbackFrom(walletId: number, height: number): Promise<number>` — devolve quantos eventos reverteu
  - `syncWallet(walletId: number, adapter: ChainAdapter): Promise<SyncResult>` com `SyncResult = { newEvents: number[]; reorgAt: number | null; tipHeight: number }`

> Reorg é onde watchtower ingênuo mente com confiança: mostra saldo errado sem sinal de erro. O log append-only torna a correção estrutural — nada é apagado, um evento compensatório marca os revertidos, e a projeção é reconstruída.

- [ ] **Step 1: Escrever o teste de reorg que falha**

`backend/test/reorg.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './helpers/db'
import { pool } from '../src/db/pool'
import { appendEvent, activeEvents } from '../src/events/log'
import { detectReorg, rollbackFrom } from '../src/sync/reorg'
import type { ChainAdapter } from '../src/chain/types'

function adapterWithChain(hashes: Record<number, string>): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true, needsRegistration: false, supportsSubscribe: false,
      hasTxIndex: true, isPublic: false, host: 'falso',
    }),
    tipHeight: async () => Math.max(...Object.keys(hashes).map(Number)),
    blockHashAt: async (h: number) => hashes[h] ?? 'desconhecido',
  }
}

let walletId: number

beforeEach(async () => {
  await resetDb()
  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email,password_hash) VALUES ('a@b.c','x') RETURNING id`)
  const b = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://x','signet') RETURNING id`)
  const w = await pool.query<{ id: string }>(
    `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,network,backend_id)
     VALUES ($1,'C','\\x00','aabb','p2wpkh','signet',$2) RETURNING id`,
    [u.rows[0]!.id, b.rows[0]!.id])
  walletId = Number(w.rows[0]!.id)
})

describe('detectReorg', () => {
  it('devolve null quando os hashes conferem', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'h100',
      txid: 'aa', vout: 0, payload: { addressId: 1, valueSats: 1000 } })
    expect(await detectReorg(walletId, adapterWithChain({ 100: 'h100' }))).toBeNull()
  })

  it('devolve null quando não há evento confirmado', async () => {
    expect(await detectReorg(walletId, adapterWithChain({ 100: 'h100' }))).toBeNull()
  })

  it('aponta a altura em que o hash divergiu', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'h100',
      txid: 'aa', vout: 0, payload: { addressId: 1, valueSats: 1000 } })
    await appendEvent({ walletId, type: 'utxo_created', height: 101, blockHash: 'h101',
      txid: 'bb', vout: 0, payload: { addressId: 1, valueSats: 2000 } })

    // a cadeia reorganizou a partir de 101
    const reorged = adapterWithChain({ 100: 'h100', 101: 'OUTRO' })
    expect(await detectReorg(walletId, reorged)).toBe(101)
  })

  it('recua por várias alturas até achar o ponto comum', async () => {
    for (const [h, hash] of [[100, 'h100'], [101, 'h101'], [102, 'h102']] as const) {
      await appendEvent({ walletId, type: 'utxo_created', height: h, blockHash: hash,
        txid: `tx${h}`, vout: 0, payload: { addressId: 1, valueSats: 1000 } })
    }
    const reorged = adapterWithChain({ 100: 'h100', 101: 'X', 102: 'Y' })
    expect(await detectReorg(walletId, reorged)).toBe(101)
  })
})

describe('rollbackFrom', () => {
  it('reverte eventos da altura em diante e preserva os anteriores', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 100, blockHash: 'h100',
      txid: 'aa', vout: 0, payload: { addressId: 1, valueSats: 1000 } })
    await appendEvent({ walletId, type: 'utxo_created', height: 101, blockHash: 'h101',
      txid: 'bb', vout: 0, payload: { addressId: 1, valueSats: 2000 } })

    const reverted = await rollbackFrom(walletId, 101)
    expect(reverted).toBe(1)

    const active = await activeEvents(walletId)
    const created = active.filter(e => e.type === 'utxo_created')
    expect(created.map(e => e.txid)).toEqual(['aa'])
  })

  it('registra um evento de reorg e nunca apaga nada', async () => {
    await appendEvent({ walletId, type: 'utxo_created', height: 101, blockHash: 'h101',
      txid: 'bb', vout: 0, payload: { addressId: 1, valueSats: 2000 } })
    await rollbackFrom(walletId, 101)

    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*) FROM chain_events WHERE wallet_id = $1', [walletId])
    expect(Number(rows[0]!.count)).toBe(2)  // o criado + o reorg_detected

    const active = await activeEvents(walletId)
    expect(active.map(e => e.type)).toEqual(['reorg_detected'])
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd backend && npm test -- reorg
```

Esperado: FAIL — `src/sync/reorg` não resolve.

- [ ] **Step 3: Implementar reorg**

`backend/src/sync/reorg.ts`:

```ts
import { pool } from '../db/pool'
import { appendEvent } from '../events/log'
import type { ChainAdapter } from '../chain/types'

/**
 * Compara o hash registrado em cada altura confirmada, da mais recente para trás,
 * até achar a última que ainda confere. Devolve a primeira altura divergente.
 */
export async function detectReorg(
  walletId: number,
  adapter: ChainAdapter,
): Promise<number | null> {
  const { rows } = await pool.query<{ height: number; block_hash: string }>(
    `SELECT DISTINCT height, block_hash
       FROM chain_events
      WHERE wallet_id = $1 AND rolled_back_by IS NULL
        AND height IS NOT NULL AND block_hash IS NOT NULL
      ORDER BY height DESC`,
    [walletId],
  )
  if (rows.length === 0) return null

  let divergent: number | null = null
  for (const row of rows) {
    const actual = await adapter.blockHashAt(row.height)
    if (actual === row.block_hash) break
    divergent = row.height
  }
  return divergent
}

/** Marca como revertidos todos os eventos a partir da altura, e registra o reorg. */
export async function rollbackFrom(walletId: number, height: number): Promise<number> {
  const reorgId = await appendEvent({
    walletId, type: 'reorg_detected', height,
    blockHash: null, txid: null, vout: null,
    payload: { rolledBackFromHeight: height },
  })

  const { rowCount } = await pool.query(
    `UPDATE chain_events
        SET rolled_back_by = $1
      WHERE wallet_id = $2
        AND rolled_back_by IS NULL
        AND id <> $1
        AND height >= $3`,
    [reorgId, walletId, height],
  )
  return rowCount ?? 0
}
```

- [ ] **Step 4: Escrever o teste do motor**

`backend/test/engine.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './helpers/db'
import { pool } from '../src/db/pool'
import { syncWallet } from '../src/sync/engine'
import { walletBalance } from '../src/events/project'
import { seal } from '../src/crypto/secretbox'
import { parseExtendedKey } from '../src/wallet/descriptor'
import { deriveAddress } from '../src/wallet/derive'
import type { ChainAdapter, TxRef, Utxo } from '../src/chain/types'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
const KEY = 'c'.repeat(64)

function adapterWith(
  history: Record<string, TxRef[]>, utxos: Record<string, Utxo[]>, tip = 200,
): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true, needsRegistration: false, supportsSubscribe: false,
      hasTxIndex: true, isPublic: false, host: 'falso',
    }),
    tipHeight: async () => tip,
    blockHashAt: async (h: number) => `h${h}`,
    getHistoryForAddress: async (a: string) => history[a] ?? [],
    getUtxosForAddress: async (a: string) => utxos[a] ?? [],
  }
}

let walletId: number
let firstAddress: string

beforeEach(async () => {
  await resetDb()
  process.env.MASTER_KEY_HEX = KEY
  const parsed = parseExtendedKey(ZPUB)
  firstAddress = deriveAddress(parsed.canonicalXpub, 'p2wpkh', 'mainnet', 0, 0).address

  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email,password_hash) VALUES ('a@b.c','x') RETURNING id`)
  const b = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://x','mainnet') RETURNING id`)
  const w = await pool.query<{ id: string }>(
    `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,
                          network,gap_limit,backend_id)
     VALUES ($1,'C',$2,'aabb','p2wpkh','mainnet',3,$3) RETURNING id`,
    [u.rows[0]!.id, seal(parsed.canonicalXpub, KEY), b.rows[0]!.id])
  walletId = Number(w.rows[0]!.id)
})

describe('syncWallet', () => {
  it('grava os endereços derivados e marca a carteira como sincronizada', async () => {
    await syncWallet(walletId, adapterWith({}, {}))
    const { rows } = await pool.query('SELECT * FROM addresses WHERE wallet_id = $1', [walletId])
    expect(rows.length).toBeGreaterThan(0)

    const w = await pool.query<{ sync_state: string }>(
      'SELECT sync_state FROM wallets WHERE id = $1', [walletId])
    expect(w.rows[0]!.sync_state).toBe('synced')
  })

  it('cria evento e projeta saldo ao encontrar UTXO', async () => {
    const adapter = adapterWith(
      { [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
      { [firstAddress]: [{ txid: 'aa', vout: 0, value: 7500, height: 100 }] },
    )
    const result = await syncWallet(walletId, adapter)
    expect(result.newEvents).toHaveLength(1)
    expect(await walletBalance(walletId)).toBe(7500)
  })

  it('é idempotente — sincronizar de novo não duplica eventos', async () => {
    const adapter = adapterWith(
      { [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
      { [firstAddress]: [{ txid: 'aa', vout: 0, value: 7500, height: 100 }] },
    )
    await syncWallet(walletId, adapter)
    const second = await syncWallet(walletId, adapter)

    expect(second.newEvents).toHaveLength(0)
    expect(await walletBalance(walletId)).toBe(7500)
  })

  it('emite utxo_spent quando o UTXO some da lista', async () => {
    const comUtxo = adapterWith(
      { [firstAddress]: [{ txid: 'aa', height: 100, blockHash: 'h100' }] },
      { [firstAddress]: [{ txid: 'aa', vout: 0, value: 7500, height: 100 }] },
    )
    await syncWallet(walletId, comUtxo)

    const gasto = adapterWith(
      { [firstAddress]: [
        { txid: 'aa', height: 100, blockHash: 'h100' },
        { txid: 'zz', height: 105, blockHash: 'h105' }] },
      { [firstAddress]: [] },
    )
    await syncWallet(walletId, gasto)
    expect(await walletBalance(walletId)).toBe(0)
  })

  it('registra estado de erro em vez de estourar quando o backend falha', async () => {
    const quebrado: ChainAdapter = {
      ...adapterWith({}, {}),
      tipHeight: async () => { throw new Error('explorador fora do ar') },
    }
    await expect(syncWallet(walletId, quebrado)).rejects.toThrow()
    const w = await pool.query<{ sync_state: string; sync_error: string }>(
      'SELECT sync_state, sync_error FROM wallets WHERE id = $1', [walletId])
    expect(w.rows[0]!.sync_state).toBe('error')
    expect(w.rows[0]!.sync_error).toMatch(/fora do ar/)
  })
})
```

- [ ] **Step 5: Implementar o motor**

`backend/src/sync/engine.ts`:

```ts
import { pool } from '../db/pool'
import { open } from '../crypto/secretbox'
import { scanGap } from './gap'
import { detectReorg, rollbackFrom } from './reorg'
import { appendEvent, activeEvents } from '../events/log'
import { projectWallet } from '../events/project'
import type { ChainAdapter } from '../chain/types'
import type { Network, ScriptType } from '../wallet/descriptor'

export interface SyncResult {
  newEvents: number[]
  reorgAt: number | null
  tipHeight: number
}

interface WalletRow {
  id: string; xpub_encrypted: Buffer; script_type: ScriptType
  network: Network; gap_limit: number
}

async function setState(
  walletId: number, state: string, extra: { progress?: number; height?: number; error?: string } = {},
): Promise<void> {
  await pool.query(
    `UPDATE wallets SET sync_state = $2,
            sync_progress = COALESCE($3, sync_progress),
            sync_height   = COALESCE($4, sync_height),
            sync_error    = $5
      WHERE id = $1`,
    [walletId, state, extra.progress ?? null, extra.height ?? null, extra.error ?? null],
  )
}

export async function syncWallet(
  walletId: number, adapter: ChainAdapter,
): Promise<SyncResult> {
  const { rows } = await pool.query<WalletRow>(
    `SELECT id, xpub_encrypted, script_type, network, gap_limit
       FROM wallets WHERE id = $1`, [walletId],
  )
  const wallet = rows[0]
  if (!wallet) throw new Error(`carteira ${walletId} não encontrada`)

  try {
    await setState(walletId, 'importing', { progress: 0 })

    const masterKey = process.env.MASTER_KEY_HEX
    if (!masterKey) throw new Error('MASTER_KEY_HEX ausente')
    const canonicalXpub = open(wallet.xpub_encrypted, masterKey)

    const tipHeight = await adapter.tipHeight()

    // 1. reorg antes de qualquer coisa: sincronizar sobre cadeia divergente corrompe o log
    const reorgAt = await detectReorg(walletId, adapter)
    if (reorgAt !== null) {
      await rollbackFrom(walletId, reorgAt)
    }

    // 2. varrer as duas cadeias de derivação
    const scanned = []
    for (const chain of [0, 1] as const) {
      scanned.push(
        ...(await scanGap({
          adapter, canonicalXpub,
          scriptType: wallet.script_type, network: wallet.network,
          chain, gapLimit: wallet.gap_limit,
        })),
      )
      await setState(walletId, 'importing', { progress: chain === 0 ? 50 : 90 })
    }

    // 3. persistir endereços
    const addressIds = new Map<string, number>()
    for (const a of scanned) {
      const { rows: ar } = await pool.query<{ id: string }>(
        `INSERT INTO addresses (wallet_id, chain, idx, derivation_path, address, scripthash, is_used)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (wallet_id, chain, idx)
         DO UPDATE SET is_used = EXCLUDED.is_used
         RETURNING id`,
        [walletId, a.chain, a.index, a.path, a.address, a.scripthash, a.used],
      )
      addressIds.set(a.address, Number(ar[0]!.id))
    }

    // 4. diferença contra o que o log já conhece
    const existing = await activeEvents(walletId)
    const known = new Set(
      existing.filter(e => e.type === 'utxo_created').map(e => `${e.txid}:${e.vout}`),
    )
    const spent = new Set(
      existing.filter(e => e.type === 'utxo_spent').map(e => `${e.txid}:${e.vout}`),
    )

    const newEvents: number[] = []
    const seen = new Set<string>()

    for (const a of scanned.filter(s => s.used)) {
      const utxos = await adapter.getUtxosForAddress!(a.address)
      for (const u of utxos) {
        const key = `${u.txid}:${u.vout}`
        seen.add(key)
        if (known.has(key)) continue
        newEvents.push(
          await appendEvent({
            walletId, type: 'utxo_created', height: u.height,
            blockHash: u.height !== null ? await adapter.blockHashAt(u.height) : null,
            txid: u.txid, vout: u.vout,
            payload: { addressId: addressIds.get(a.address)!, valueSats: u.value },
          }),
        )
      }
    }

    // 5. o que estava no log e sumiu da lista de UTXOs foi gasto
    for (const key of known) {
      if (seen.has(key) || spent.has(key)) continue
      const [txid, voutStr] = key.split(':')
      newEvents.push(
        await appendEvent({
          walletId, type: 'utxo_spent', height: tipHeight,
          blockHash: await adapter.blockHashAt(tipHeight),
          txid: txid!, vout: Number(voutStr),
          payload: { spentAtTxid: 'desconhecido' },
        }),
      )
    }

    await projectWallet(walletId)
    await setState(walletId, 'synced', { progress: 100, height: tipHeight })

    return { newEvents, reorgAt, tipHeight }
  } catch (err) {
    await setState(walletId, 'error', { error: (err as Error).message })
    throw err
  }
}
```

- [ ] **Step 6: Rodar e confirmar que passam**

```bash
cd backend && npm test -- reorg engine
```

Esperado: PASS, 11 testes.

- [ ] **Step 7: Commit**

```bash
git add backend/src/sync backend/test/reorg.test.ts backend/test/engine.test.ts
git commit -m "Adiciona motor de sincronização e tratamento de reorganização

Reorg é verificado antes de qualquer escrita, porque sincronizar sobre
cadeia divergente corrompe o log. A reversão marca os eventos afetados
sem apagar nada e a projeção é reconstruída. Sincronizar duas vezes com
o mesmo estado não duplica eventos."
```

---

### Task 10: Catálogo bilíngue e motor de alertas com deduplicação

**Files:**
- Create: `backend/src/i18n/catalog.ts`, `backend/src/i18n/render.ts`, `backend/src/i18n/routes.ts`
- Create: `backend/src/alerts/dedupe.ts`, `backend/src/alerts/rules.ts`, `backend/src/alerts/store.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/test/i18n.test.ts`, `backend/test/alerts.test.ts`

**Interfaces:**
- Consumes: `pool`, `StoredEvent`, `buildApp`
- Produces:
  - `type Lang = 'pt' | 'en'`, `LANGS: Lang[]`
  - `CATALOG: Record<Lang, Record<string, string>>`
  - `render(key: string, params: Record<string, unknown>, lang: Lang): string`
  - `renderAlert(type: string, params: Record<string, unknown>, lang: Lang): { title: string; body: string }`
  - `registerI18nRoutes(app)` — `GET /api/i18n/:lang`
  - `confirmationState(height: number | null, tip: number): 'mempool' | 'conf1' | 'conf6'`
  - `dedupeKey(walletId: number, txid: string, state: string): string`
  - `alertsForEvent(event: StoredEvent, ctx: AlertContext): AlertCandidate[]` — **carrega `type` e `params`, nunca texto**
  - `saveAlert(c: AlertCandidate): Promise<number | null>` — `null` quando já existia
  - `recentAlerts(userId: number, limit?: number)`

> **Por que não se grava texto.** Se o alerta guardasse a frase pronta, ela ficaria
> naquele idioma para sempre e o seletor não valeria para o histórico. O alerta guarda
> `type` e `params`; o catálogo vira frase na hora de exibir ou notificar.
>
> **Jargão de Bitcoin fica em inglês nos dois catálogos** — `dust attack`,
> `address reuse`, `UTXO`, `mempool`, `reorg`. O que muda de idioma é o texto em volta.

- [ ] **Step 1: Escrever o teste do catálogo**

`backend/test/i18n.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CATALOG, LANGS } from '../src/i18n/catalog'
import { render, renderAlert } from '../src/i18n/render'
import { buildApp } from '../src/app'

describe('catálogo', () => {
  it('tem exatamente as mesmas chaves em todos os idiomas', () => {
    const pt = Object.keys(CATALOG.pt).sort()
    const en = Object.keys(CATALOG.en).sort()
    expect(en).toEqual(pt)
  })

  it('não deixa nenhuma frase vazia', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(CATALOG[lang])) {
        expect(value.trim(), `${lang}:${key}`).not.toBe('')
      }
    }
  })

  it('mantém o jargão de Bitcoin em inglês também no catálogo português', () => {
    expect(CATALOG.pt['alert.dust_received.title']).toContain('dust attack')
    expect(CATALOG.pt['alert.address_reused.title']).toContain('Address reuse')
    expect(CATALOG.pt['alert.dust_received.body']).toContain('UTXO')
  })

  it('cobre as chaves de interface que a tela consome', () => {
    const daTela = [
      'feed.title', 'feed.live', 'feed.empty',
      'balance.total', 'balance.wallets', 'balance.utxos', 'balance.frozen',
      'wallets.title', 'wallets.add', 'wallets.formTitle',
      'wallets.labelPlaceholder', 'wallets.keyPlaceholder', 'wallets.watchOnly',
      'wallets.submit', 'wallets.submitting',
      'wallet.coins', 'wallet.frozen', 'wallet.importing',
      'wallet.importingNote', 'wallet.syncError',
      'auth.tagline', 'auth.email', 'auth.password', 'auth.login', 'auth.register',
      'privacy.public', 'privacy.publicHint',
      'privacy.sovereign', 'privacy.sovereignHint',
      'severity.info', 'severity.warning', 'severity.critical',
    ]
    for (const lang of LANGS) {
      for (const k of daTela) {
        expect(CATALOG[lang][k], `${lang}:${k}`).toBeTruthy()
      }
    }
  })

  it('cobre todo tipo de alerta com título e corpo nos dois idiomas', () => {
    const tipos = ['funds_received', 'funds_spent', 'dust_received',
                   'address_reused', 'reorg_detected']
    for (const lang of LANGS) {
      for (const t of tipos) {
        expect(CATALOG[lang][`alert.${t}.title`], `${lang}:${t}`).toBeTruthy()
        expect(CATALOG[lang][`alert.${t}.body`], `${lang}:${t}`).toBeTruthy()
      }
    }
  })
})

describe('render', () => {
  it('substitui parâmetros nomeados', () => {
    expect(render('alert.reorg_detected.body', { height: 319233 }, 'pt'))
      .toContain('319.233')
  })

  it('formata número conforme o idioma', () => {
    expect(render('alert.reorg_detected.body', { height: 319233 }, 'en'))
      .toContain('319,233')
  })

  it('resolve parâmetro que aponta para outra chave do catálogo', () => {
    const pt = render('alert.funds_received.body', { value: 50000, state: '@state.mempool' }, 'pt')
    const en = render('alert.funds_received.body', { value: 50000, state: '@state.mempool' }, 'en')
    expect(pt).toContain(CATALOG.pt['state.mempool'])
    expect(en).toContain(CATALOG.en['state.mempool'])
  })

  it('devolve a própria chave quando ela não existe, em vez de string vazia', () => {
    expect(render('nao.existe', {}, 'pt')).toBe('nao.existe')
  })

  it('deixa o marcador visível quando falta o parâmetro, em vez de apagar', () => {
    expect(render('alert.reorg_detected.body', {}, 'pt')).toContain('{height}')
  })
})

describe('renderAlert', () => {
  it('monta título e corpo de um dust attack nos dois idiomas', () => {
    const params = { value: 600, threshold: 1000, address: 'tb1q…306fyu' }
    const pt = renderAlert('dust_received', params, 'pt')
    const en = renderAlert('dust_received', params, 'en')

    expect(pt.title).toContain('dust attack')
    expect(pt.body).toContain('600')
    expect(en.title).toContain('dust attack')
    expect(en.body).toContain('600')
    expect(pt.body).not.toBe(en.body)
  })
})

describe('GET /api/i18n/:lang', () => {
  it('serve o catálogo pedido', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/i18n/en' })
    expect(res.statusCode).toBe(200)
    expect(res.json()['alert.dust_received.title']).toBe(CATALOG.en['alert.dust_received.title'])
  })

  it('recusa idioma desconhecido', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/i18n/tlh' })
    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd backend && npm test -- i18n
```

Esperado: FAIL — `src/i18n/catalog` não resolve.

- [ ] **Step 3: Escrever o catálogo**

`backend/src/i18n/catalog.ts`:

```ts
export type Lang = 'pt' | 'en'

export const LANGS: Lang[] = ['pt', 'en']

export function isLang(v: string): v is Lang {
  return (LANGS as string[]).includes(v)
}

/**
 * Chaves planas e pontuadas, para o catálogo viajar como JSON até a tela.
 * Jargão de Bitcoin permanece em inglês nos dois idiomas: traduzir "dust attack"
 * ou "address reuse" produz texto que soa a manual mal vertido e afasta quem
 * entende do assunto. O que muda de idioma é o texto explicativo em volta.
 */
export const CATALOG: Record<Lang, Record<string, string>> = {
  pt: {
    'alert.funds_received.title': 'Fundos recebidos',
    'alert.funds_received.body': '{value} sats, {state}.',

    'alert.funds_spent.title': 'Fundos gastos',
    'alert.funds_spent.body': 'O UTXO {txid}:{vout} foi consumido.',

    'alert.dust_received.title': 'Possível dust attack',
    'alert.dust_received.body':
      'Chegaram {value} sats de origem desconhecida em {address}, abaixo do limiar ' +
      'de {threshold} sats. Dust é plantado para rastrear você no instante em que ' +
      'gastar. Congele este UTXO.',

    'alert.address_reused.title': 'Address reuse detectado',
    'alert.address_reused.body':
      'O endereço {address} recebeu de novo. Os dois pagamentos passam a estar ' +
      'publicamente ligados — é a maior causa isolada de perda de privacidade.',

    'alert.reorg_detected.title': 'Reorg detectado',
    'alert.reorg_detected.body':
      'Transações a partir da altura {height} foram revertidas e o saldo recalculado.',

    'state.mempool': 'ainda no mempool',
    'state.conf1': 'confirmado',
    'state.conf6': 'confirmado com 6 blocos',

    'severity.info': 'informativo',
    'severity.warning': 'atenção',
    'severity.critical': 'crítico',

    'feed.title': 'Registro',
    'feed.live': 'ao vivo',
    'feed.empty': 'Nenhum alerta ainda. O watchtower avisa assim que algo se mexer.',

    'balance.total': 'Saldo total',
    'balance.wallets': '{n} carteiras',
    'balance.utxos': '{n} UTXOs',
    'balance.frozen': '{n} congelado',

    'wallets.title': 'Carteiras',
    'wallets.add': '+ Vigiar carteira',
    'wallets.formTitle': 'Vigiar uma carteira',
    'wallets.labelPlaceholder': 'Rótulo — por exemplo, Cold wallet',
    'wallets.keyPlaceholder': 'xpub, ypub, zpub, tpub, upub ou vpub',
    'wallets.watchOnly':
      'Somente chaves públicas. O Stealth Badger é watch-only e recusa qualquer ' +
      'material que permita gastar.',
    'wallets.submit': 'Começar a vigiar',
    'wallets.submitting': 'cadastrando…',

    'wallet.coins': 'Moedas',
    'wallet.frozen': 'congelado',
    'wallet.importing': 'Importando {progress}%',
    'wallet.importingNote':
      'Varrendo a cadeia de troco. O saldo total acima ainda não inclui esta carteira.',
    'wallet.syncError': 'Falha na sincronização',

    'auth.tagline': 'Watchtower de privacidade para Bitcoin',
    'auth.email': 'e-mail',
    'auth.password': 'senha (mínimo 12 caracteres)',
    'auth.login': 'Entrar',
    'auth.register': 'Criar conta',

    'privacy.public': 'Explorador público',
    'privacy.publicHint': '{host} enxerga quais endereços você consulta',
    'privacy.sovereign': 'Soberano',
    'privacy.sovereignHint': 'Consultando {host} — infraestrutura própria',
  },

  en: {
    'alert.funds_received.title': 'Funds received',
    'alert.funds_received.body': '{value} sats, {state}.',

    'alert.funds_spent.title': 'Funds spent',
    'alert.funds_spent.body': 'UTXO {txid}:{vout} was consumed.',

    'alert.dust_received.title': 'Possible dust attack',
    'alert.dust_received.body':
      '{value} sats arrived from an unknown source at {address}, below the ' +
      '{threshold} sats threshold. Dust is planted to trace you the moment you ' +
      'spend. Freeze this UTXO.',

    'alert.address_reused.title': 'Address reuse detected',
    'alert.address_reused.body':
      'Address {address} received again. Both payments are now publicly linked — ' +
      'the single largest cause of lost privacy.',

    'alert.reorg_detected.title': 'Reorg detected',
    'alert.reorg_detected.body':
      'Transactions from height {height} were rolled back and the balance recomputed.',

    'state.mempool': 'still in the mempool',
    'state.conf1': 'confirmed',
    'state.conf6': 'confirmed with 6 blocks',

    'severity.info': 'info',
    'severity.warning': 'warning',
    'severity.critical': 'critical',

    'feed.title': 'Log',
    'feed.live': 'live',
    'feed.empty': 'No alerts yet. The watchtower speaks up the moment something moves.',

    'balance.total': 'Total balance',
    'balance.wallets': '{n} wallets',
    'balance.utxos': '{n} UTXOs',
    'balance.frozen': '{n} frozen',

    'wallets.title': 'Wallets',
    'wallets.add': '+ Watch a wallet',
    'wallets.formTitle': 'Watch a wallet',
    'wallets.labelPlaceholder': 'Label — for example, Cold wallet',
    'wallets.keyPlaceholder': 'xpub, ypub, zpub, tpub, upub or vpub',
    'wallets.watchOnly':
      'Public keys only. Stealth Badger is watch-only and refuses anything that ' +
      'could spend.',
    'wallets.submit': 'Start watching',
    'wallets.submitting': 'adding…',

    'wallet.coins': 'Coins',
    'wallet.frozen': 'frozen',
    'wallet.importing': 'Importing {progress}%',
    'wallet.importingNote':
      'Scanning the change chain. The total above does not include this wallet yet.',
    'wallet.syncError': 'Sync failed',

    'auth.tagline': 'Bitcoin privacy watchtower',
    'auth.email': 'email',
    'auth.password': 'password (at least 12 characters)',
    'auth.login': 'Sign in',
    'auth.register': 'Create account',

    'privacy.public': 'Public explorer',
    'privacy.publicHint': '{host} can see which addresses you look up',
    'privacy.sovereign': 'Sovereign',
    'privacy.sovereignHint': 'Querying {host} — your own infrastructure',
  },
}
```

- [ ] **Step 4: Escrever o renderizador**

`backend/src/i18n/render.ts` — três regras, e só três:

```ts
import { CATALOG, type Lang } from './catalog'

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US' }

/**
 * 1. `{nome}` é trocado por `params.nome`.
 * 2. Número é formatado no locale do idioma (1.284.310 contra 1,284,310).
 * 3. Valor de parâmetro começando com `@` é chave do próprio catálogo e é
 *    resolvido recursivamente — permite `{state}` virar "ainda no mempool"
 *    ou "still in the mempool" sem que a regra de negócio saiba de idioma.
 *
 * Chave ausente devolve a própria chave, e parâmetro ausente deixa o marcador
 * visível: falhar de forma visível é melhor que servir frase truncada.
 */
export function render(
  key: string,
  params: Record<string, unknown>,
  lang: Lang,
): string {
  const template = CATALOG[lang][key]
  if (template === undefined) return key

  return template.replace(/\{(\w+)\}/g, (marker, name: string) => {
    const value = params[name]
    if (value === undefined || value === null) return marker
    if (typeof value === 'string' && value.startsWith('@')) {
      return render(value.slice(1), {}, lang)
    }
    if (typeof value === 'number') return value.toLocaleString(LOCALE[lang])
    return String(value)
  })
}

export function renderAlert(
  type: string,
  params: Record<string, unknown>,
  lang: Lang,
): { title: string; body: string } {
  return {
    title: render(`alert.${type}.title`, params, lang),
    body: render(`alert.${type}.body`, params, lang),
  }
}
```

`backend/src/i18n/routes.ts` — o catálogo é servido por HTTP porque frontend e
backend são contêineres com builds independentes, então um diretório compartilhado
não sobreviveria ao `COPY . .` de cada Dockerfile:

```ts
import type { FastifyInstance } from 'fastify'
import { CATALOG, isLang } from './catalog'

export function registerI18nRoutes(app: FastifyInstance): void {
  app.get<{ Params: { lang: string } }>('/api/i18n/:lang', async (req, reply) => {
    const { lang } = req.params
    if (!isLang(lang)) {
      return reply.code(404).send({ error: `idioma não suportado: ${lang}` })
    }
    return reply.header('cache-control', 'public, max-age=300').send(CATALOG[lang])
  })
}
```

Registrar em `backend/src/app.ts`, junto das demais rotas:

```ts
import { registerI18nRoutes } from './i18n/routes'
// ...
registerI18nRoutes(app)
```

- [ ] **Step 5: Rodar e confirmar que o catálogo passa**

```bash
cd backend && npm test -- i18n
```

Esperado: PASS, 13 testes.

- [ ] **Step 6: Escrever o teste dos alertas**

`backend/test/alerts.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './helpers/db'
import { pool } from '../src/db/pool'
import { confirmationState, dedupeKey } from '../src/alerts/dedupe'
import { alertsForEvent } from '../src/alerts/rules'
import { saveAlert } from '../src/alerts/store'
import { renderAlert } from '../src/i18n/render'
import type { StoredEvent } from '../src/events/log'

describe('confirmationState', () => {
  it('sem altura é mempool', () => expect(confirmationState(null, 200)).toBe('mempool'))
  it('uma confirmação', () => expect(confirmationState(200, 200)).toBe('conf1'))
  it('cinco confirmações ainda é conf1', () => expect(confirmationState(196, 200)).toBe('conf1'))
  it('seis confirmações vira conf6', () => expect(confirmationState(195, 200)).toBe('conf6'))
})

describe('dedupeKey', () => {
  it('é determinística', () => {
    expect(dedupeKey(1, 'aa', 'conf1')).toBe(dedupeKey(1, 'aa', 'conf1'))
  })
  it('separa por carteira, transação e estado', () => {
    const keys = new Set([
      dedupeKey(1, 'aa', 'conf1'), dedupeKey(2, 'aa', 'conf1'),
      dedupeKey(1, 'bb', 'conf1'), dedupeKey(1, 'aa', 'mempool'),
    ])
    expect(keys.size).toBe(4)
  })
})

describe('alertsForEvent', () => {
  const base: StoredEvent = {
    id: 1, walletId: 7, type: 'utxo_created', height: 200, blockHash: 'h',
    txid: 'aa', vout: 0, payload: { addressId: 1, valueSats: 50_000 },
    occurredAt: new Date(),
  }
  const ctx = { userId: 3, tipHeight: 200, dustThreshold: 1000,
                addressWasUsed: false, address: 'tb1qexemplo' }

  it('gera alerta informativo ao receber fundos', () => {
    const [a] = alertsForEvent(base, ctx)
    expect(a!.type).toBe('funds_received')
    expect(a!.severity).toBe('info')
  })

  it('não carrega texto pronto — só tipo e parâmetros', () => {
    const [a] = alertsForEvent(base, ctx)
    expect(a).not.toHaveProperty('title')
    expect(a).not.toHaveProperty('body')
    expect(a!.params).toMatchObject({ value: 50_000 })
  })

  it('os parâmetros rendem frase nos dois idiomas', () => {
    const [a] = alertsForEvent(base, ctx)
    const pt = renderAlert(a!.type, a!.params, 'pt')
    const en = renderAlert(a!.type, a!.params, 'en')
    expect(pt.title).toBe('Fundos recebidos')
    expect(en.title).toBe('Funds received')
    expect(pt.body).not.toContain('{')
    expect(en.body).not.toContain('{')
  })

  it('classifica recebimento pequeno como dust, com severidade crítica', () => {
    const dust = { ...base, payload: { addressId: 1, valueSats: 600 } }
    const achado = alertsForEvent(dust, ctx).find(a => a.type === 'dust_received')
    expect(achado).toBeDefined()
    expect(achado!.severity).toBe('critical')
    expect(achado!.params).toMatchObject({ value: 600, threshold: 1000 })
  })

  it('alerta address reuse quando o endereço já tinha uso', () => {
    const kinds = alertsForEvent(base, { ...ctx, addressWasUsed: true })
    expect(kinds.map(a => a.type)).toContain('address_reused')
  })

  it('gera alerta de aviso ao detectar reorg', () => {
    const reorg: StoredEvent = { ...base, type: 'reorg_detected', txid: null, vout: null }
    const [a] = alertsForEvent(reorg, ctx)
    expect(a!.type).toBe('reorg_detected')
    expect(a!.severity).toBe('warning')
    expect(a!.params).toMatchObject({ height: 200 })
  })
})

describe('saveAlert', () => {
  let userId: number, walletId: number

  beforeEach(async () => {
    await resetDb()
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email,password_hash) VALUES ('a@b.c','x') RETURNING id`)
    userId = Number(u.rows[0]!.id)
    const b = await pool.query<{ id: string }>(
      `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://x','signet') RETURNING id`)
    const w = await pool.query<{ id: string }>(
      `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,network,backend_id)
       VALUES ($1,'C','\\x00','aabb','p2wpkh','signet',$2) RETURNING id`,
      [userId, b.rows[0]!.id])
    walletId = Number(w.rows[0]!.id)
  })

  const candidate = (key: string) => ({
    userId, walletId, type: 'funds_received', severity: 'info' as const,
    params: { value: 50_000, state: '@state.conf1' }, dedupeKey: key, eventId: null,
  })

  it('grava o alerta e devolve o id', async () => {
    expect(await saveAlert(candidate('k1'))).toBeGreaterThan(0)
  })

  it('devolve null na segunda vez com a mesma chave', async () => {
    await saveAlert(candidate('k1'))
    expect(await saveAlert(candidate('k1'))).toBeNull()
  })

  it('grava apenas uma linha após cinco tentativas idênticas', async () => {
    for (let i = 0; i < 5; i++) await saveAlert(candidate('k1'))
    const { rows } = await pool.query<{ count: string }>('SELECT count(*) FROM alerts')
    expect(Number(rows[0]!.count)).toBe(1)
  })

  it('guarda os parâmetros como JSONB, e nenhum texto renderizado', async () => {
    await saveAlert(candidate('k1'))
    const { rows } = await pool.query<{ params: Record<string, unknown> }>(
      'SELECT params FROM alerts')
    expect(rows[0]!.params).toMatchObject({ value: 50_000, state: '@state.conf1' })
  })
})
```

- [ ] **Step 7: Implementar dedupe, regras e persistência**

`backend/src/alerts/dedupe.ts`:

```ts
export type ConfirmationState = 'mempool' | 'conf1' | 'conf6'

export function confirmationState(height: number | null, tip: number): ConfirmationState {
  if (height === null) return 'mempool'
  const confirmations = tip - height + 1
  return confirmations >= 6 ? 'conf6' : 'conf1'
}

/**
 * Determinística e com UNIQUE no banco. Mempool e confirmado geram alertas
 * distintos de propósito; reprocessamento não gera nada.
 */
export function dedupeKey(walletId: number, txid: string, state: string): string {
  return `wallet:${walletId}:tx:${txid}:state:${state}`
}
```

`backend/src/alerts/rules.ts` — a regra de negócio não conhece idioma nenhum:

```ts
import type { StoredEvent } from '../events/log'
import { confirmationState, dedupeKey } from './dedupe'

export type Severity = 'info' | 'warning' | 'critical'

export interface AlertCandidate {
  userId: number
  walletId: number
  type: string
  severity: Severity
  /** insumos da frase, nunca a frase — ver §7.1 do design */
  params: Record<string, unknown>
  dedupeKey: string
  eventId: number | null
}

export interface AlertContext {
  userId: number
  tipHeight: number
  dustThreshold: number
  addressWasUsed: boolean
  address: string
}

export function alertsForEvent(event: StoredEvent, ctx: AlertContext): AlertCandidate[] {
  const out: AlertCandidate[] = []
  const base = { userId: ctx.userId, walletId: event.walletId, eventId: event.id }

  if (event.type === 'reorg_detected') {
    return [{
      ...base, type: 'reorg_detected', severity: 'warning',
      params: { height: event.height },
      dedupeKey: `wallet:${event.walletId}:reorg:${event.height}:${event.id}`,
    }]
  }

  if (event.type === 'utxo_created' && event.txid) {
    const value = Number((event.payload as { valueSats?: number }).valueSats ?? 0)
    const state = confirmationState(event.height, ctx.tipHeight)

    out.push({
      ...base, type: 'funds_received', severity: 'info',
      params: { value, state: `@state.${state}` },
      dedupeKey: dedupeKey(event.walletId, event.txid, state),
    })

    if (value > 0 && value < ctx.dustThreshold) {
      out.push({
        ...base, type: 'dust_received', severity: 'critical',
        params: { value, threshold: ctx.dustThreshold, address: ctx.address },
        dedupeKey: dedupeKey(event.walletId, event.txid, `dust:${state}`),
      })
    }

    if (ctx.addressWasUsed) {
      out.push({
        ...base, type: 'address_reused', severity: 'critical',
        params: { address: ctx.address },
        dedupeKey: dedupeKey(event.walletId, event.txid, `reuse:${state}`),
      })
    }
  }

  if (event.type === 'utxo_spent' && event.txid) {
    out.push({
      ...base, type: 'funds_spent', severity: 'info',
      params: { txid: `${event.txid.slice(0, 12)}…`, vout: event.vout },
      dedupeKey: dedupeKey(event.walletId, event.txid, `spent:${event.vout}`),
    })
  }

  return out
}
```

`backend/src/alerts/store.ts` — `ON CONFLICT DO NOTHING` faz do banco a autoridade
sobre duplicidade, o que continua correto mesmo com dois workers concorrentes:

```ts
import { pool } from '../db/pool'
import type { AlertCandidate } from './rules'

export async function saveAlert(c: AlertCandidate): Promise<number | null> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO alerts (user_id, wallet_id, type, severity, params, dedupe_key, event_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [c.userId, c.walletId, c.type, c.severity, JSON.stringify(c.params),
     c.dedupeKey, c.eventId],
  )
  if (!rows[0]) return null

  const id = Number(rows[0].id)
  // acorda os streams SSE conectados sem que ninguém faça polling
  await pool.query(`SELECT pg_notify('sb_alerts', $1)`, [
    JSON.stringify({ id, userId: c.userId, walletId: c.walletId, severity: c.severity }),
  ])
  return id
}

/** Devolve tipo e parâmetros; quem renderiza é a tela, no idioma escolhido. */
export async function recentAlerts(userId: number, limit = 50) {
  const { rows } = await pool.query(
    `SELECT id, wallet_id AS "walletId", type, severity, params,
            created_at AS "createdAt", read_at AS "readAt"
       FROM alerts WHERE user_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  )
  return rows
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

```bash
cd backend && npm test -- i18n alerts
```

Esperado: PASS, 12 + 16 testes.

- [ ] **Step 9: Commit**

```bash
git add backend/src/i18n backend/src/alerts backend/src/app.ts backend/test
git commit -m "Adiciona catálogo bilíngue e motor de alertas com deduplicação

O alerta guarda tipo e parâmetros, nunca a frase pronta: texto renderizado
no banco congelaria o idioma e faria o seletor não valer para o histórico.
O catálogo é servido por HTTP porque frontend e backend têm builds
independentes. Jargão de Bitcoin permanece em inglês nos dois idiomas.

A chave de deduplicação tem UNIQUE no banco, então o banco é a autoridade
sobre duplicidade mesmo com workers concorrentes."
```

---

### Task 11: Entrega de alertas — ntfy, webhook, feed ao vivo e laço do worker

Fecha o fluxo do watchtower. Ao final desta task existe demonstração de ponta a ponta.

**Files:**
- Create: `backend/src/alerts/channels/ntfy.ts`, `backend/src/alerts/channels/webhook.ts`, `backend/src/alerts/channels/index.ts`
- Create: `backend/src/stream/sse.ts`, `backend/src/alerts/routes.ts`, `backend/src/worker/tick.ts`
- Modify: `backend/src/app.ts`, `backend/src/index.ts`
- Test: `backend/test/channels.test.ts`, `backend/test/tick.test.ts`

**Interfaces:**
- Consumes: `saveAlert`, `recentAlerts`, `syncWallet`, `activeEvents`, `alertsForEvent`, `createEsploraAdapter`
- Produces:
  - `deliver(alert: StoredAlert, channels: ChannelRow[]): Promise<DeliveryReport>`
  - `startAlertListener(): Promise<void>` e `subscribeToAlerts(userId, send): () => void`
  - `registerAlertRoutes(app)` — `GET /api/alerts`, `GET /api/stream`
  - `tick(): Promise<TickReport>` com `{ walletsSynced: number; alertsCreated: number }`

- [ ] **Step 1: Escrever os testes que falham**

`backend/test/channels.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { sendToNtfy } from '../src/alerts/channels/ntfy'
import { sendToWebhook } from '../src/alerts/channels/webhook'

const alert = {
  id: 1, walletId: 2, type: 'dust_received', severity: 'critical' as const,
  title: 'Possível ataque de poeira', body: 'Recebidos 600 sats',
}

describe('canal ntfy', () => {
  it('publica no tópico com prioridade alta quando é crítico', async () => {
    const fetchFn = vi.fn(async () => new Response('ok', { status: 200 }))
    await sendToNtfy(alert, { server: 'https://ntfy.exemplo', topic: 'badger' }, fetchFn as never)

    expect(fetchFn).toHaveBeenCalledOnce()
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://ntfy.exemplo/badger')
    expect((init.headers as Record<string, string>)['Priority']).toBe('high')
    expect((init.headers as Record<string, string>)['Title']).toContain('poeira')
  })

  it('usa prioridade padrão quando é informativo', async () => {
    const fetchFn = vi.fn(async () => new Response('ok', { status: 200 }))
    await sendToNtfy({ ...alert, severity: 'info' },
      { server: 'https://ntfy.exemplo', topic: 'badger' }, fetchFn as never)
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['Priority']).toBe('default')
  })

  it('devolve falha em vez de estourar quando o servidor recusa', async () => {
    const fetchFn = vi.fn(async () => new Response('nope', { status: 500 }))
    const r = await sendToNtfy(alert,
      { server: 'https://ntfy.exemplo', topic: 'badger' }, fetchFn as never)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/500/)
  })
})

describe('canal webhook', () => {
  it('envia o alerta como JSON', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 204 }))
    await sendToWebhook(alert, { url: 'https://exemplo/hook' }, fetchFn as never)
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://exemplo/hook')
    expect(JSON.parse(init.body as string).type).toBe('dust_received')
  })
})
```

`backend/test/tick.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb } from './helpers/db'
import { pool } from '../src/db/pool'
import { tick } from '../src/worker/tick'
import { seal } from '../src/crypto/secretbox'
import { parseExtendedKey } from '../src/wallet/descriptor'
import { deriveAddress } from '../src/wallet/derive'
import type { ChainAdapter } from '../src/chain/types'

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs'
const KEY = 'd'.repeat(64)

let firstAddress: string

function adapterWithDust(): ChainAdapter {
  return {
    capabilities: () => ({
      randomAccess: true, needsRegistration: false, supportsSubscribe: false,
      hasTxIndex: true, isPublic: false, host: 'falso',
    }),
    tipHeight: async () => 200,
    blockHashAt: async (h: number) => `h${h}`,
    getHistoryForAddress: async (a: string) =>
      a === firstAddress ? [{ txid: 'aa', height: 200, blockHash: 'h200' }] : [],
    getUtxosForAddress: async (a: string) =>
      a === firstAddress ? [{ txid: 'aa', vout: 0, value: 600, height: 200 }] : [],
  }
}

beforeEach(async () => {
  await resetDb()
  process.env.MASTER_KEY_HEX = KEY
  const parsed = parseExtendedKey(ZPUB)
  firstAddress = deriveAddress(parsed.canonicalXpub, 'p2wpkh', 'mainnet', 0, 0).address

  const u = await pool.query<{ id: string }>(
    `INSERT INTO users (email,password_hash) VALUES ('a@b.c','x') RETURNING id`)
  const b = await pool.query<{ id: string }>(
    `INSERT INTO backends (kind,url,network) VALUES ('esplora','http://x','mainnet') RETURNING id`)
  await pool.query(
    `INSERT INTO wallets (user_id,label,xpub_encrypted,xpub_fingerprint,script_type,
                          network,gap_limit,backend_id)
     VALUES ($1,'C',$2,'aabb','p2wpkh','mainnet',3,$3)`,
    [u.rows[0]!.id, seal(parsed.canonicalXpub, KEY), b.rows[0]!.id])
})

describe('tick', () => {
  it('sincroniza a carteira e cria alertas a partir dos eventos novos', async () => {
    const r = await tick({ adapterFactory: () => adapterWithDust() })
    expect(r.walletsSynced).toBe(1)
    expect(r.alertsCreated).toBeGreaterThan(0)
  })

  it('classifica 600 sats como dust, com severidade crítica', async () => {
    await tick({ adapterFactory: () => adapterWithDust() })
    const { rows } = await pool.query<{ type: string; severity: string }>(
      'SELECT type, severity FROM alerts')
    const dust = rows.find(r => r.type === 'dust_received')
    expect(dust?.severity).toBe('critical')
  })

  it('grava parâmetros, e nenhum texto renderizado, no alerta', async () => {
    await tick({ adapterFactory: () => adapterWithDust() })
    const { rows } = await pool.query<{ params: Record<string, unknown> }>(
      `SELECT params FROM alerts WHERE type = 'dust_received'`)
    expect(rows[0]!.params).toMatchObject({ value: 600, threshold: 1000 })
    expect(rows[0]!.params.address).toBeTruthy()
  })

  it('o mesmo alerta rende frases diferentes em pt e en', async () => {
    const { renderAlert } = await import('../src/i18n/render')
    await tick({ adapterFactory: () => adapterWithDust() })
    const { rows } = await pool.query<{ type: string; params: Record<string, unknown> }>(
      `SELECT type, params FROM alerts WHERE type = 'dust_received'`)
    const pt = renderAlert(rows[0]!.type, rows[0]!.params, 'pt')
    const en = renderAlert(rows[0]!.type, rows[0]!.params, 'en')
    expect(pt.body).not.toBe(en.body)
    expect(pt.body).not.toContain('{')
    expect(en.body).not.toContain('{')
  })

  it('rodar duas vezes não duplica alerta — a chave de dedup segura', async () => {
    await tick({ adapterFactory: () => adapterWithDust() })
    const primeira = await pool.query<{ count: string }>('SELECT count(*) FROM alerts')
    await tick({ adapterFactory: () => adapterWithDust() })
    const segunda = await pool.query<{ count: string }>('SELECT count(*) FROM alerts')
    expect(segunda.rows[0]!.count).toBe(primeira.rows[0]!.count)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
cd backend && npm test -- channels tick
```

Esperado: FAIL nos dois arquivos.

- [ ] **Step 3: Implementar os canais**

`backend/src/alerts/channels/ntfy.ts`:

```ts
export interface DeliverableAlert {
  id: number; walletId: number; type: string
  severity: 'info' | 'warning' | 'critical'
  title: string; body: string
}
export interface DeliveryResult { ok: boolean; error?: string }

export interface NtfyConfig { server: string; topic: string; token?: string }

const PRIORITY: Record<DeliverableAlert['severity'], string> = {
  info: 'default', warning: 'high', critical: 'high',
}
const TAG: Record<DeliverableAlert['severity'], string> = {
  info: 'information_source', warning: 'warning', critical: 'rotating_light',
}

export async function sendToNtfy(
  alert: DeliverableAlert, config: NtfyConfig, fetchFn: typeof fetch = fetch,
): Promise<DeliveryResult> {
  const headers: Record<string, string> = {
    Title: alert.title,
    Priority: PRIORITY[alert.severity],
    Tags: TAG[alert.severity],
  }
  if (config.token) headers['Authorization'] = `Bearer ${config.token}`

  try {
    const res = await fetchFn(`${config.server.replace(/\/+$/, '')}/${config.topic}`, {
      method: 'POST', headers, body: alert.body,
    })
    return res.ok ? { ok: true } : { ok: false, error: `ntfy respondeu ${res.status}` }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
```

`backend/src/alerts/channels/webhook.ts`:

```ts
import type { DeliverableAlert, DeliveryResult } from './ntfy'

export interface WebhookConfig { url: string; secret?: string }

export async function sendToWebhook(
  alert: DeliverableAlert, config: WebhookConfig, fetchFn: typeof fetch = fetch,
): Promise<DeliveryResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.secret) headers['X-Stealth-Badger-Secret'] = config.secret

  try {
    const res = await fetchFn(config.url, {
      method: 'POST', headers, body: JSON.stringify(alert),
    })
    return res.ok ? { ok: true } : { ok: false, error: `webhook respondeu ${res.status}` }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
```

`backend/src/alerts/channels/index.ts`:

```ts
import { pool } from '../../db/pool'
import { open } from '../../crypto/secretbox'
import { renderAlert } from '../../i18n/render'
import type { Lang } from '../../i18n/catalog'
import type { Severity } from '../rules'
import { sendToNtfy } from './ntfy'
import { sendToWebhook } from './webhook'

/**
 * O push é renderizado NO SERVIDOR, com o idioma do usuário: notificação não
 * tem seletor de idioma para a pessoa clicar. A tela renderiza por conta
 * própria, no idioma escolhido naquele momento.
 */
export async function deliver(
  alert: { id: number; walletId: number; type: string; severity: Severity;
           params: Record<string, unknown> },
  userId: number,
): Promise<void> {
  const { rows: userRows } = await pool.query<{ language: Lang }>(
    'SELECT language FROM users WHERE id = $1', [userId],
  )
  const lang: Lang = userRows[0]?.language ?? 'pt'
  const { title, body } = renderAlert(alert.type, alert.params, lang)
  const rendered = { ...alert, title, body }

  const { rows } = await pool.query<{ id: string; kind: string; config_encrypted: Buffer }>(
    'SELECT id, kind, config_encrypted FROM channels WHERE user_id = $1 AND enabled',
    [userId],
  )

  const report: Record<string, unknown> = {}
  for (const row of rows) {
    const config = JSON.parse(open(row.config_encrypted, process.env.MASTER_KEY_HEX!))
    const result =
      row.kind === 'ntfy'
        ? await sendToNtfy(rendered, config)
        : await sendToWebhook(rendered, config)
    report[`${row.kind}:${row.id}`] = result
  }

  await pool.query('UPDATE alerts SET delivered = $2 WHERE id = $1', [
    alert.id, JSON.stringify(report),
  ])
}
```

- [ ] **Step 4: Implementar o stream ao vivo**

`backend/src/stream/sse.ts` — um cliente dedicado escuta o `NOTIFY` do Postgres, então nenhum componente faz polling:

```ts
import pg from 'pg'

type Send = (payload: unknown) => void
const subscribers = new Map<number, Set<Send>>()
let listener: pg.Client | null = null

export async function startAlertListener(): Promise<void> {
  if (listener) return
  listener = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await listener.connect()
  await listener.query('LISTEN sb_alerts')

  listener.on('notification', msg => {
    if (!msg.payload) return
    const payload = JSON.parse(msg.payload) as { userId: number }
    for (const send of subscribers.get(payload.userId) ?? []) send(payload)
  })
}

export function subscribeToAlerts(userId: number, send: Send): () => void {
  let set = subscribers.get(userId)
  if (!set) { set = new Set(); subscribers.set(userId, set) }
  set.add(send)
  return () => {
    set!.delete(send)
    if (set!.size === 0) subscribers.delete(userId)
  }
}
```

`backend/src/alerts/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { recentAlerts } from './store'
import { subscribeToAlerts } from '../stream/sse'

export function registerAlertRoutes(app: FastifyInstance): void {
  app.get('/api/alerts', async (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })
    return reply.send(await recentAlerts(req.userId))
  })

  app.get('/api/stream', (req, reply) => {
    if (!req.userId) return reply.code(401).send({ error: 'não autenticado' })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    reply.raw.write(': conectado\n\n')

    const unsubscribe = subscribeToAlerts(req.userId, payload => {
      reply.raw.write(`event: alert\ndata: ${JSON.stringify(payload)}\n\n`)
    })

    // comentário periódico impede que proxies derrubem a conexão ociosa
    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 25_000)

    req.raw.on('close', () => {
      clearInterval(keepAlive)
      unsubscribe()
    })
  })
}
```

- [ ] **Step 5: Implementar o laço do worker**

`backend/src/worker/tick.ts`:

```ts
import { pool } from '../db/pool'
import { syncWallet } from '../sync/engine'
import { activeEvents } from '../events/log'
import { alertsForEvent } from '../alerts/rules'
import { saveAlert } from '../alerts/store'
import { deliver } from '../alerts/channels'
import { createEsploraAdapter } from '../chain/esplora'
import type { ChainAdapter } from '../chain/types'

export interface TickReport { walletsSynced: number; alertsCreated: number }

const DUST_THRESHOLD = 1000

interface TickOptions {
  adapterFactory?: (backend: { url: string; isPublic: boolean }) => ChainAdapter
}

export async function tick(opts: TickOptions = {}): Promise<TickReport> {
  const factory =
    opts.adapterFactory ??
    ((b: { url: string; isPublic: boolean }) =>
      createEsploraAdapter(b.url, { isPublic: b.isPublic }))

  const { rows: wallets } = await pool.query<{
    id: string; user_id: string; url: string; is_public: boolean
  }>(
    `SELECT w.id, w.user_id, b.url, b.is_public
       FROM wallets w JOIN backends b ON b.id = w.backend_id
      ORDER BY w.id`,
    // Sem filtro por sync_state: o laço é sequencial num processo só, então
    // nenhuma carteira pode estar em sincronização quando esta consulta roda.
    // Filtrar por <> 'importing' só criava um modo de falha permanente — um
    // crash no meio da sincronização deixaria a carteira parada para sempre.
  )

  let walletsSynced = 0
  let alertsCreated = 0

  for (const w of wallets) {
    const walletId = Number(w.id)
    const userId = Number(w.user_id)

    let result
    try {
      result = await syncWallet(walletId, factory({ url: w.url, isPublic: w.is_public }))
    } catch (err) {
      // estado de erro já foi gravado pelo motor; uma carteira quebrada
      // não pode derrubar a varredura das outras
      console.error(`falha ao sincronizar carteira ${walletId}: ${(err as Error).message}`)
      continue
    }
    walletsSynced++

    if (result.newEvents.length === 0) continue

    const events = await activeEvents(walletId)
    const novos = events.filter(e => result.newEvents.includes(e.id))

    for (const event of novos) {
      const { address, wasUsedBefore } = await addressContext(walletId, event)
      for (const candidate of alertsForEvent(event, {
        userId, tipHeight: result.tipHeight, dustThreshold: DUST_THRESHOLD,
        addressWasUsed: wasUsedBefore, address,
      })) {
        const id = await saveAlert(candidate)
        if (id === null) continue
        alertsCreated++
        // o alerta viaja como tipo e parâmetros; quem vira frase é o deliver
        await deliver(
          { id, walletId, type: candidate.type, severity: candidate.severity,
            params: candidate.params },
          userId,
        )
      }
    }
  }

  return { walletsSynced, alertsCreated }
}

/**
 * Devolve o endereço do evento e se ele já havia recebido antes.
 * As duas informações vêm juntas porque as regras precisam das duas: o endereço
 * entra nos parâmetros da frase, e o uso anterior decide se há address reuse.
 */
async function addressContext(
  walletId: number, event: { id: number; payload: Record<string, unknown> },
): Promise<{ address: string; wasUsedBefore: boolean }> {
  const addressId = (event.payload as { addressId?: number }).addressId
  if (!addressId) return { address: '', wasUsedBefore: false }

  const { rows: addr } = await pool.query<{ address: string }>(
    'SELECT address FROM addresses WHERE id = $1', [addressId],
  )
  const full = addr[0]?.address ?? ''
  // encurtado aqui, e não no catálogo, para o texto ficar igual nos dois idiomas
  const address = full.length > 18 ? `${full.slice(0, 8)}…${full.slice(-6)}` : full

  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM chain_events
      WHERE wallet_id = $1 AND type = 'utxo_created' AND rolled_back_by IS NULL
        AND id < $2 AND (payload->>'addressId')::int = $3`,
    [walletId, event.id, addressId],
  )
  return { address, wasUsedBefore: Number(rows[0]!.count) > 0 }
}
```

`backend/src/index.ts` passa a iniciar o listener e o laço:

```ts
import { buildApp } from './app'
import { loadConfig } from './config'
import { migrate } from './db/migrate'
import { startAlertListener } from './stream/sse'
import { tick } from './worker/tick'

const config = loadConfig()

await migrate()
await startAlertListener()

const app = buildApp()
await app.listen({ port: config.port, host: '0.0.0.0' })
console.log(`stealth-badger ouvindo na porta ${config.port} · rede ${config.network}`)

const INTERVALO_MS = 30_000
setInterval(() => {
  tick().catch(err => console.error('falha no ciclo do worker:', err))
}, INTERVALO_MS)
```

E `backend/src/app.ts` registra as rotas de alerta:

```ts
import { registerAlertRoutes } from './alerts/routes'
// ...
registerAlertRoutes(app)
```

- [ ] **Step 6: Rodar e confirmar que passam**

```bash
cd backend && npm test
```

Esperado: PASS na suíte inteira.

- [ ] **Step 7: Verificar de ponta a ponta com o ntfy real**

```bash
docker compose --profile ntfy up -d
curl -s -H "Title: teste" -d "alerta de teste" http://127.0.0.1:8090/badger
```

Abrir `http://127.0.0.1:8090/badger` no navegador ou assinar o tópico no aplicativo do ntfy no celular. Esperado: a notificação chega.

- [ ] **Step 8: Commit**

```bash
git add backend/src/alerts backend/src/stream backend/src/worker backend/src/index.ts backend/src/app.ts backend/test
git commit -m "Fecha o fluxo do watchtower com entrega de alertas

Canais ntfy e webhook, feed ao vivo por SSE alimentado pelo LISTEN do
Postgres — sem polling em lugar nenhum — e laço de worker que isola
falha por carteira para que uma quebrada não derrube a varredura."
```

---
### Task 12: Frontend — login, carteiras e feed ao vivo

**Files:**
- Create: `frontend/src/lib/api.ts`, `frontend/src/lib/format.ts`
- Create: `frontend/src/components/AlertFeed.tsx`, `frontend/src/components/AddWallet.tsx`, `frontend/src/components/WalletCard.tsx`
- Create: `frontend/src/pages/Login.tsx`, `frontend/src/pages/Dashboard.tsx`
- Create: `frontend/src/main.tsx`, `frontend/index.html`
- Create: `frontend/vitest.config.ts`
- Test: `frontend/test/format.test.ts`, `frontend/test/AlertFeed.test.tsx`

**Interfaces:**
- Consumes: as rotas HTTP das Tasks 4, 7 e 11; os tokens da Task 2
- Produces: `api` (cliente), `formatSats(n: number): string`, `SEVERITY_MARK: Record<Severity, string>`

- [ ] **Step 1: Instalar as dependências de teste do frontend**

```bash
cd frontend && npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

`frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, include: ['test/**/*.test.{ts,tsx}'] },
})
```

Acrescentar `"test": "vitest run"` aos scripts do `frontend/package.json`.

- [ ] **Step 2: Escrever os testes que falham**

`frontend/test/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatSats } from '../src/lib/format'

describe('formatSats', () => {
  it('agrupa milhares no padrão brasileiro', () => {
    expect(formatSats(1234567)).toBe('1.234.567 sats')
  })
  it('trata zero', () => expect(formatSats(0)).toBe('0 sats'))
  it('usa singular para um satoshi', () => expect(formatSats(1)).toBe('1 sat'))
})
```

`frontend/test/AlertFeed.test.tsx` — a regra de que severidade não pode depender só de cor merece teste, porque é acessibilidade e é o alerta crítico que não pode passar batido:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AlertFeed } from '../src/components/AlertFeed'

const alerts = [
  { id: 1, walletId: 1, type: 'dust_received', severity: 'critical' as const,
    title: 'Possível ataque de poeira', body: '600 sats', createdAt: '2026-08-25T10:00:00Z' },
  { id: 2, walletId: 1, type: 'funds_received', severity: 'info' as const,
    title: 'Fundos recebidos', body: '50.000 sats', createdAt: '2026-08-25T09:00:00Z' },
]

describe('AlertFeed', () => {
  it('lista os alertas mais recentes primeiro', () => {
    render(<AlertFeed alerts={alerts} />)
    const titles = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
    expect(titles[0]).toContain('poeira')
  })

  it('marca severidade com símbolo textual, não apenas com cor', () => {
    render(<AlertFeed alerts={alerts} />)
    const critico = screen.getByText('Possível ataque de poeira').closest('article')!
    expect(critico.textContent).toContain('crítico')
  })

  it('expõe a severidade em atributo acessível', () => {
    render(<AlertFeed alerts={alerts} />)
    const critico = screen.getByText('Possível ataque de poeira').closest('article')!
    expect(critico.getAttribute('data-severity')).toBe('critical')
  })

  it('mostra estado vazio quando não há alertas', () => {
    render(<AlertFeed alerts={[]} />)
    expect(screen.getByText(/nenhum alerta/i)).toBeDefined()
  })
})
```

- [ ] **Step 3: Rodar e confirmar que falham**

```bash
cd frontend && npm test
```

Esperado: FAIL — módulos não resolvem.

- [ ] **Step 4: Implementar as bibliotecas**

`frontend/src/lib/format.ts`:

```ts
export function formatSats(n: number): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? 'sat' : 'sats'}`
}

export function shorten(id: string, head = 8, tail = 6): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`
}
```

`frontend/src/lib/api.ts`:

```ts
export type Severity = 'info' | 'warning' | 'critical'

export type Lang = 'pt' | 'en'

/** Sem title nem body: o texto é renderizado na tela, no idioma escolhido. */
export interface Alert {
  id: number; walletId: number; type: string; severity: Severity
  params: Record<string, unknown>; createdAt: string; readAt?: string | null
}

export type Catalog = Record<string, string>

export interface Wallet {
  id: number; label: string; scriptType: string; network: string
  fingerprint: string; syncState: string; syncProgress: number
  balanceSats: string; backendIsPublic: boolean; backendUrl: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `erro ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  login: (email: string, password: string) =>
    request<{ ok: true }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    request<{ ok: true; isAdmin: boolean }>('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  me: () => request<{ email: string; isAdmin: boolean }>('/api/auth/me'),
  wallets: () => request<Wallet[]>('/api/wallets'),
  addWallet: (label: string, key: string) =>
    request<Wallet>('/api/wallets', {
      method: 'POST', body: JSON.stringify({ label, key }),
    }),
  alerts: () => request<Alert[]>('/api/alerts'),
  catalog: (lang: Lang) => request<Catalog>(`/api/i18n/${lang}`),
  setLanguage: (language: Lang) =>
    request<{ ok: true; language: Lang }>('/api/auth/language', {
      method: 'PUT', body: JSON.stringify({ language }),
    }),
}
```

- [ ] **Step 5: Implementar os componentes**

`frontend/src/lib/i18n.ts` — as **frases** têm fonte única, no backend; o que se
repete aqui são as três regras de interpolação, cerca de quinze linhas. Duplicar
lógica curta é aceitável; duplicar texto é o que geraria divergência:

```ts
import type { Catalog, Lang } from './api'

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en-US' }

/**
 * Mesmas três regras do renderizador do servidor:
 * `{nome}` vira params.nome; número é formatado no locale; valor começando
 * com `@` é chave do próprio catálogo, resolvida recursivamente.
 */
export function render(
  catalog: Catalog, key: string,
  params: Record<string, unknown>, lang: Lang,
): string {
  const template = catalog[key]
  if (template === undefined) return key

  return template.replace(/\{(\w+)\}/g, (marker, name: string) => {
    const value = params[name]
    if (value === undefined || value === null) return marker
    if (typeof value === 'string' && value.startsWith('@')) {
      return render(catalog, value.slice(1), {}, lang)
    }
    if (typeof value === 'number') return value.toLocaleString(LOCALE[lang])
    return String(value)
  })
}

export function renderAlert(
  catalog: Catalog, type: string,
  params: Record<string, unknown>, lang: Lang,
): { title: string; body: string } {
  return {
    title: render(catalog, `alert.${type}.title`, params, lang),
    body: render(catalog, `alert.${type}.body`, params, lang),
  }
}
```

`frontend/src/components/AlertFeed.tsx`:

```tsx
import type { Alert, Catalog, Lang, Severity } from '../lib/api'
import { render, renderAlert } from '../lib/i18n'

/**
 * Severidade legível sem depender de cor: o rótulo em caixa alta carrega a
 * informação, e a cor apenas reforça. Daltonismo é comum, e o alerta crítico
 * é justamente o que não pode passar batido.
 */
export const SEVERITY_TOKEN: Record<Severity, string> = {
  info:     'var(--sb-text-faint)',
  warning:  'var(--sb-caution)',
  critical: 'var(--sb-alarm)',
}

export function AlertFeed(
  { alerts, catalog, lang }: { alerts: Alert[]; catalog: Catalog; lang: Lang },
) {
  if (alerts.length === 0) {
    return (
      <p className="font-mono text-sm text-faint">
        {render(catalog, 'feed.empty', {}, lang)}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {alerts.map(a => {
        const token = SEVERITY_TOKEN[a.severity]
        const { title, body } = renderAlert(catalog, a.type, a.params, lang)
        // crítico recebe a listra completa do texugo; os demais, régua sólida
        const rule =
          a.severity === 'critical'
            ? `repeating-linear-gradient(180deg, ${token} 0 7px, var(--sb-bone) 7px 14px)`
            : token
        return (
          <article
            key={a.id}
            data-severity={a.severity}
            className="flex rounded border border-line bg-surface"
            style={{ borderLeft: 'none' }}
          >
            <div style={{ width: '4px', flexShrink: 0, background: rule }} />
            <div className="flex-grow p-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold">{title}</h3>
                <span
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: token }}
                >
                  {render(catalog, `severity.${a.severity}`, {}, lang)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{body}</p>
              <time className="mt-1 block font-mono text-xs text-faint">
                {new Date(a.createdAt).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US')}
              </time>
            </div>
          </article>
        )
      })}
    </div>
  )
}
```

`frontend/src/components/WalletCard.tsx`:

```tsx
import type { Wallet } from '../lib/api'
import { formatSats } from '../lib/format'

export function WalletCard({ wallet }: { wallet: Wallet }) {
  const importando = wallet.syncState === 'importing'
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{wallet.label}</h3>
        <span className="font-mono text-xs text-faint">{wallet.fingerprint}</span>
      </div>
      <p className="mt-2 font-mono text-xl">{formatSats(Number(wallet.balanceSats))}</p>
      <p className="mt-1 font-mono text-xs text-muted">
        {wallet.scriptType} · {wallet.network}
      </p>
      {importando && (
        <p className="mt-2 font-mono text-xs" style={{ color: 'var(--sb-warning)' }}>
          importando {wallet.syncProgress}% — os dados abaixo ainda estão incompletos
        </p>
      )}
      {wallet.syncState === 'error' && (
        <p className="mt-2 font-mono text-xs" style={{ color: 'var(--sb-critical)' }}>
          ■ falha na sincronização
        </p>
      )}
    </article>
  )
}
```

`frontend/src/components/AddWallet.tsx`:

```tsx
import { useState } from 'react'
import { api } from '../lib/api'

export function AddWallet({ onAdded }: { onAdded: () => void }) {
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      await api.addWallet(label, key.trim())
      setLabel(''); setKey(''); onAdded()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">Vigiar uma carteira</h2>
      <input
        value={label} onChange={e => setLabel(e.target.value)}
        placeholder="Rótulo — por exemplo, Cofre frio"
        className="mb-2 w-full rounded border border-line bg-bg px-3 py-2 text-sm"
      />
      <textarea
        value={key} onChange={e => setKey(e.target.value)}
        placeholder="xpub, ypub, zpub, tpub, upub ou vpub"
        rows={3}
        className="mb-2 w-full rounded border border-line bg-bg px-3 py-2 font-mono text-xs"
      />
      <p className="mb-3 text-xs text-faint">
        Somente chaves públicas. O Stealth Badger é watch-only e recusa qualquer
        material que permita gastar.
      </p>
      {erro && (
        <p className="mb-2 font-mono text-xs" style={{ color: 'var(--sb-critical)' }}>
          ■ {erro}
        </p>
      )}
      <button
        type="submit" disabled={enviando || !label || !key}
        className="rounded px-3 py-2 text-sm font-semibold disabled:opacity-40"
        style={{ background: 'var(--sb-accent)', color: 'var(--sb-bg)' }}
      >
        {enviando ? 'cadastrando…' : 'Começar a vigiar'}
      </button>
    </form>
  )
}
```

- [ ] **Step 6: Implementar as páginas**

`frontend/src/pages/Dashboard.tsx` — o `EventSource` é o que faz o alerta aparecer sozinho durante a demonstração:

```tsx
import { useEffect, useState, useCallback } from 'react'
import { api, type Alert, type Wallet } from '../lib/api'
import { Shell, PrivacyBadge } from '../components/Shell'
import { AlertFeed } from '../components/AlertFeed'
import { WalletCard } from '../components/WalletCard'
import { AddWallet } from '../components/AddWallet'

export function Dashboard() {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])

  const recarregar = useCallback(async () => {
    const [w, a] = await Promise.all([api.wallets(), api.alerts()])
    setWallets(w); setAlerts(a)
  }, [])

  useEffect(() => { void recarregar() }, [recarregar])

  useEffect(() => {
    const source = new EventSource('/api/stream', { withCredentials: true })
    source.addEventListener('alert', () => { void recarregar() })
    return () => source.close()
  }, [recarregar])

  const primeira = wallets[0]

  return (
    <Shell
      badge={
        primeira
          ? <PrivacyBadge
              isPublic={primeira.backendIsPublic}
              host={new URL(primeira.backendUrl).host}
            />
          : null
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="flex flex-col gap-4">
          <AddWallet onAdded={recarregar} />
          {wallets.map(w => <WalletCard key={w.id} wallet={w} />)}
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold">Alertas</h2>
          <AlertFeed alerts={alerts} />
        </section>
      </div>
    </Shell>
  )
}
```

`frontend/src/pages/Login.tsx`:

```tsx
import { useState } from 'react'
import { api } from '../lib/api'

export function Login({ onEntrou }: { onEntrou: () => void }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function entrar(criarConta: boolean) {
    setErro(null)
    try {
      if (criarConta) await api.register(email, senha)
      await api.login(email, senha)
      onEntrou()
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg text-ink font-ui">
      <div className="w-80 rounded-lg border border-line bg-surface p-6">
        <h1 className="mb-1 font-mono text-lg">stealth badger</h1>
        <p className="mb-5 text-xs text-faint">Watchtower de privacidade para Bitcoin</p>

        <input
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="e-mail" type="email"
          className="mb-2 w-full rounded border border-line bg-bg px-3 py-2 text-sm"
        />
        <input
          value={senha} onChange={e => setSenha(e.target.value)}
          placeholder="senha (mínimo 12 caracteres)" type="password"
          className="mb-3 w-full rounded border border-line bg-bg px-3 py-2 text-sm"
        />
        {erro && (
          <p className="mb-2 font-mono text-xs" style={{ color: 'var(--sb-critical)' }}>■ {erro}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => entrar(false)}
            className="flex-1 rounded px-3 py-2 text-sm font-semibold"
            style={{ background: 'var(--sb-accent)', color: 'var(--sb-bg)' }}
          >
            Entrar
          </button>
          <button
            onClick={() => entrar(true)}
            className="flex-1 rounded border border-line px-3 py-2 text-sm"
          >
            Criar conta
          </button>
        </div>
      </div>
    </div>
  )
}
```

`frontend/src/main.tsx`:

```tsx
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { api } from './lib/api'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import './styles/tokens.css'
import './styles/index.css'

function App() {
  const [autenticado, setAutenticado] = useState<boolean | null>(null)

  useEffect(() => {
    api.me().then(() => setAutenticado(true)).catch(() => setAutenticado(false))
  }, [])

  if (autenticado === null) return null
  return autenticado ? <Dashboard /> : <Login onEntrou={() => setAutenticado(true)} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
```

`frontend/src/styles/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`frontend/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Stealth Badger</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Rodar e confirmar que passam**

```bash
cd frontend && npm test
```

Esperado: PASS, 7 testes.

- [ ] **Step 8: Verificar o fluxo completo no navegador**

```bash
docker compose up -d postgres
cd backend && npm run dev &
cd frontend && npm run dev
```

Em `http://localhost:5173`: criar conta, cadastrar um xpub de signet, esperar o ciclo do worker (30 s) e confirmar que a carteira sai de `pending` e que os alertas aparecem **sem recarregar a página**.

- [ ] **Step 9: Commit**

```bash
git add frontend
git commit -m "Adiciona interface de login, carteiras e feed de alertas ao vivo

O feed atualiza sozinho por EventSource, sem polling. Severidade é
marcada por símbolo e palavra além da cor, e o estado de importação
aparece explicitamente em vez de a tela fingir que já tem os dados."
```

---

### Task 13: Adapter Electrum — cobre Electrs, Fulcrum e Floresta

**Files:**
- Create: `backend/src/chain/electrum.ts`
- Test: `backend/test/electrum.test.ts`

**Interfaces:**
- Consumes: `ChainAdapter`, `ChainCapabilities`, `electrumScripthash`
- Produces: `createElectrumAdapter(opts: ElectrumOptions): ChainAdapter` com `ElectrumOptions = { host: string; port: number; network: Network; isPublic?: boolean; connect?: ConnectFn }`

> Um único adapter Electrum cobre três backends porque o **florestad embute um servidor Electrum**. O protocolo é JSON-RPC delimitado por quebra de linha sobre TCP.
>
> **Decisão de interface:** o adapter recebe *endereço* e calcula o scripthash internamente, em vez de a interface expor scripthash. Isso mantém `ChainAdapter` idêntico ao da Task 6 — o custo é um hash por consulta, irrelevante, e o ganho é não vazar detalhe do protocolo Electrum para o motor de sincronização.

- [ ] **Step 1: Escrever o teste que falha**

`backend/test/electrum.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createElectrumAdapter } from '../src/chain/electrum'

/** Transporte falso: responde por método, sem abrir socket. */
function fakeTransport(handlers: Record<string, (params: unknown[]) => unknown>) {
  return async () => ({
    call: async (method: string, params: unknown[]) => {
      const h = handlers[method]
      if (!h) throw new Error(`método não simulado: ${method}`)
      return h(params)
    },
    close: () => {},
  })
}

const ENDERECO = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'

describe('adapter Electrum', () => {
  it('declara acesso aleatório e suporte a assinatura', () => {
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({}),
    })
    expect(a.capabilities()).toMatchObject({
      randomAccess: true, needsRegistration: false, supportsSubscribe: true,
    })
  })

  it('lê a altura da ponta pela assinatura de cabeçalhos', async () => {
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({
        'blockchain.headers.subscribe': () => ({ height: 963938, hex: '00' }),
      }),
    })
    expect(await a.tipHeight()).toBe(963938)
  })

  it('traduz histórico usando o scripthash derivado do endereço', async () => {
    let scripthashRecebido = ''
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({
        'blockchain.scripthash.get_history': params => {
          scripthashRecebido = params[0] as string
          return [{ tx_hash: 'aa', height: 100 }, { tx_hash: 'bb', height: 0 }]
        },
        'blockchain.block.header': () => '00'.repeat(80),
      }),
    })

    const hist = await a.getHistoryForAddress!(ENDERECO)
    expect(scripthashRecebido).toHaveLength(64)
    // altura 0 no protocolo Electrum significa mempool
    expect(hist.map(h => h.height)).toEqual([100, null])
  })

  it('traduz UTXOs não gastos', async () => {
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({
        'blockchain.scripthash.listunspent': () => [
          { tx_hash: 'aa', tx_pos: 0, value: 5000, height: 100 },
          { tx_hash: 'bb', tx_pos: 1, value: 1000, height: 0 },
        ],
      }),
    })
    expect(await a.getUtxosForAddress!(ENDERECO)).toEqual([
      { txid: 'aa', vout: 0, value: 5000, height: 100 },
      { txid: 'bb', vout: 1, value: 1000, height: null },
    ])
  })

  it('calcula o hash do bloco a partir do cabeçalho', async () => {
    const a = createElectrumAdapter({
      host: 'localhost', port: 50001, network: 'mainnet',
      connect: fakeTransport({ 'blockchain.block.header': () => '00'.repeat(80) }),
    })
    const hash = await a.blockHashAt(100)
    expect(hash).toHaveLength(64)
  })

  it('marca postura soberana quando aponta para infraestrutura própria', () => {
    const a = createElectrumAdapter({
      host: '127.0.0.1', port: 50001, network: 'signet',
      isPublic: false, connect: fakeTransport({}),
    })
    expect(a.capabilities().isPublic).toBe(false)
    expect(a.capabilities().host).toBe('127.0.0.1:50001')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd backend && npm test -- electrum
```

Esperado: FAIL — `src/chain/electrum` não resolve.

- [ ] **Step 3: Implementar**

`backend/src/chain/electrum.ts`:

```ts
import { createConnection, type Socket } from 'node:net'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import * as btc from '@scure/btc-signer'
import { electrumScripthash } from '../wallet/derive'
import type { Network } from '../wallet/descriptor'
import type { ChainAdapter, ChainCapabilities, TxRef, Utxo } from './types'

interface Transport {
  call(method: string, params: unknown[]): Promise<unknown>
  close(): void
}
type ConnectFn = () => Promise<Transport>

export interface ElectrumOptions {
  host: string
  port: number
  network: Network
  isPublic?: boolean
  connect?: ConnectFn
}

interface ElectrumHistory { tx_hash: string; height: number }
interface ElectrumUnspent { tx_hash: string; tx_pos: number; value: number; height: number }

/** JSON-RPC delimitado por quebra de linha sobre TCP. */
function tcpTransport(host: string, port: number): ConnectFn {
  return () =>
    new Promise<Transport>((resolve, reject) => {
      const socket: Socket = createConnection({ host, port }, () => {
        let buffer = ''
        let nextId = 1
        const pending = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>()

        socket.on('data', chunk => {
          buffer += chunk.toString('utf8')
          let newline: number
          while ((newline = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newline)
            buffer = buffer.slice(newline + 1)
            if (!line.trim()) continue
            const msg = JSON.parse(line) as {
              id?: number; result?: unknown; error?: { message: string }
            }
            if (msg.id === undefined) continue  // notificação de assinatura
            const waiting = pending.get(msg.id)
            if (!waiting) continue
            pending.delete(msg.id)
            msg.error ? waiting.fail(new Error(msg.error.message)) : waiting.ok(msg.result)
          }
        })

        socket.on('error', err => {
          for (const w of pending.values()) w.fail(err)
          pending.clear()
        })

        resolve({
          call(method, params) {
            const id = nextId++
            return new Promise((ok, fail) => {
              pending.set(id, { ok, fail })
              socket.write(`${JSON.stringify({ id, method, params })}\n`)
            })
          },
          close: () => socket.destroy(),
        })
      })
      socket.on('error', reject)
    })
}

function addressToScripthash(address: string, network: Network): string {
  const net = network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK
  const decoded = btc.Address(net).decode(address)
  return electrumScripthash(btc.OutScript.encode(decoded))
}

export function createElectrumAdapter(opts: ElectrumOptions): ChainAdapter {
  const connect = opts.connect ?? tcpTransport(opts.host, opts.port)
  let transport: Transport | null = null

  async function call(method: string, params: unknown[] = []): Promise<unknown> {
    if (!transport) transport = await connect()
    try {
      return await transport.call(method, params)
    } catch (err) {
      transport = null  // força reconexão no próximo uso
      throw new Error(`Electrum ${opts.host}:${opts.port} falhou em ${method}: ${(err as Error).message}`)
    }
  }

  const caps: ChainCapabilities = {
    randomAccess: true,
    needsRegistration: false,
    supportsSubscribe: true,
    hasTxIndex: true,
    isPublic: opts.isPublic ?? false,
    host: `${opts.host}:${opts.port}`,
  }

  return {
    capabilities: () => caps,

    async tipHeight() {
      const r = (await call('blockchain.headers.subscribe')) as { height: number }
      return r.height
    },

    async blockHashAt(height: number) {
      const headerHex = (await call('blockchain.block.header', [height])) as string
      // hash do bloco = sha256 duplo do cabeçalho de 80 bytes, em ordem invertida
      const digest = sha256(sha256(hexToBytes(headerHex)))
      return bytesToHex(Uint8Array.from(digest).reverse())
    },

    async getHistoryForAddress(address: string): Promise<TxRef[]> {
      const scripthash = addressToScripthash(address, opts.network)
      const rows = (await call('blockchain.scripthash.get_history', [scripthash])) as ElectrumHistory[]
      return rows.map(r => ({
        txid: r.tx_hash,
        height: r.height > 0 ? r.height : null,  // 0 ou negativo significa mempool
        blockHash: null,
      }))
    },

    async getUtxosForAddress(address: string): Promise<Utxo[]> {
      const scripthash = addressToScripthash(address, opts.network)
      const rows = (await call('blockchain.scripthash.listunspent', [scripthash])) as ElectrumUnspent[]
      return rows.map(r => ({
        txid: r.tx_hash, vout: r.tx_pos, value: r.value,
        height: r.height > 0 ? r.height : null,
      }))
    },
  }
}
```

> **Nota deliberada:** `getHistoryForAddress` devolve `blockHash: null` porque o protocolo Electrum não entrega o hash junto do histórico. O motor de sincronização já chama `blockHashAt(height)` quando precisa do hash, então nada quebra — mas quem for otimizar depois deve saber que isso custa uma chamada extra por altura.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd backend && npm test -- electrum
```

Esperado: PASS, 6 testes.

- [ ] **Step 5: Verificar contra um servidor Electrum de verdade**

Subir o electrs apontado para o signet local, esperar a indexação e conferir:

```bash
echo '{"id":1,"method":"blockchain.headers.subscribe","params":[]}' \
  | timeout 5 nc 127.0.0.1 50001
```

Esperado: JSON com `"height"` próximo de 319233. Se o electrs ainda estiver indexando, adiar este passo — não bloqueia o restante.

- [ ] **Step 6: Commit**

```bash
git add backend/src/chain/electrum.ts backend/test/electrum.test.ts
git commit -m "Adiciona adapter Electrum cobrindo Electrs, Fulcrum e Floresta

Um adapter só atende os três porque o florestad embute servidor Electrum.
O adapter recebe endereço e deriva o scripthash internamente, para não
vazar detalhe do protocolo até o motor de sincronização."
```

---
## Auto-revisão

Executada após escrever o plano completo, conferindo-o contra o spec.

### Defeitos encontrados e corrigidos inline

| Defeito | Consequência se não corrigido |
|---|---|
| `vitest` roda arquivos em paralelo, mas `resetDb()` trunca o banco inteiro | suíte intermitente, com testes derrubando uns aos outros — e horas perdidas caçando um bug que não existe |
| `loadConfig()` exigia `DATABASE_URL`, mas os comandos de teste só definem `MASTER_KEY_HEX` | Task 7 falharia no boot, sem relação com o que ela testa |
| `docker-compose.yml` referencia `build: ./backend`, e nenhuma task criava `backend/Dockerfile` | `docker compose up` quebraria na Task 1 |
| Tailwind configurado sem `postcss.config.js` | interface renderiza sem estilo nenhum, e sem mensagem de erro |

### Cobertura do spec

| Seção do spec | Onde é implementada |
|---|---|
| §5.1 topologia de deploy | Task 1 (compose, nginx, Dockerfiles) |
| §5.2 módulos do backend | estrutura de arquivos + Tasks 4 a 13 |
| §6.1 dois modelos de backend | Task 6 (interface), Task 13 (Electrum) |
| §6.2 adapter por capacidades | Task 6 |
| §6.3 gap limit, estado, reorg | Tasks 7 e 9 |
| §7 modelo de dados | Task 3 |
| §8.1 taxonomia de eventos | Task 10 — parcial, ver abaixo |
| §8.2 deduplicação e idempotência | Task 10 |
| §8.3 canais | Task 11 (ntfy, webhook, SSE) |
| §10 segurança e custódia de xpub | Task 7 |

### Fora deste plano, por decisão e não por esquecimento

- **`registerDescriptor` e `rescanFrom`** — o caminho de registro mais rescan do Floresta e do Bitcoin Core. A interface da Task 6 já os prevê como métodos opcionais; nenhum adapter os implementa ainda. O Floresta é atendido pelo servidor Electrum embutido, que é o caminho mais barato.
- **Alertas `score_dropped` e `kyc_origin`** — dependem da integração com o `am-i-exposed`, que é Plano 2. Os outros cinco tipos da §8.1 estão na Task 10.
- **Tabela `alert_rules`** — não entra na migração 001. A Task 11 usa um limiar de poeira fixo (`DUST_THRESHOLD = 1000`). Limiar configurável por usuário é Plano 2, com sua própria migração.
- **`labels`, `tags`, `spend_rules`, `privacy_scans`, `tx_fingerprints`** — Plano 2.

### Consistência de tipos

Conferidas as assinaturas que atravessam tasks: `parseExtendedKey` → `deriveAddress` → `scanGap` → `syncWallet`; `appendEvent`/`activeEvents`/`StoredEvent` → `projectWallet` → `alertsForEvent` → `saveAlert` → `deliver`; e `ChainAdapter` entre Esplora (Task 6), gap (Task 7), motor (Task 9) e Electrum (Task 13). Sem divergência de nome ou de tipo.

A única assimetria deliberada está registrada na Task 13: `getHistoryForAddress` devolve `blockHash: null` no Electrum, porque o protocolo não entrega o hash junto do histórico. O motor já busca o hash separadamente quando precisa.

---

## Ordem de execução e pontos de parada

Tasks 1 a 11 formam o **fluxo mínimo demonstrável** e são o alvo do checkpoint de quarta às 19h. As Tasks 12 e 13 melhoram a demonstração mas não a viabilizam.

Se o tempo apertar antes do checkpoint, a ordem de corte é: **13, depois 12, depois o Step 3 da Task 2** (o artboard; os tokens continuam). Nunca cortar as Tasks 9, 10 ou 11 — são o watchtower, que é a tese do produto.

| Task | Entrega verificável |
|---|---|
| 1 | `docker compose up` sobe e `/api/health` responde |
| 2 | linguagem visual aprovada e casca renderizando |
| 3 | schema aplicado, migração idempotente |
| 4 | registro, login e sessão funcionando |
| 5 | derivação batendo com os vetores da BIP-84 |
| 6 | Esplora consultando a cadeia de verdade |
| 7 | carteira cadastrada, xpub cifrado, gap limit varrido |
| 8 | saldo projetado a partir do log |
| 9 | sincronização idempotente e reorg revertendo corretamente |
| 10 | alerta deduplicado, poeira classificada como crítica |
| 11 | **notificação chegando no celular — o checkpoint** |
| 12 | alerta aparecendo na tela sem recarregar |
| 13 | modo soberano contra Electrum próprio |
