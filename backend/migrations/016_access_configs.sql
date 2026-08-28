CREATE TABLE access_configs (
  profile TEXT PRIMARY KEY CHECK (profile IN ('tor','tailscale','cloudflared')),
  config_encrypted BYTEA NOT NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
