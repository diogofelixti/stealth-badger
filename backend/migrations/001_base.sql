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
