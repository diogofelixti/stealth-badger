-- Histórico de análises de privacidade por endereço.
--
-- Separada de `privacy_scans`: o relatório da carteira responde "como estou
-- como conjunto", enquanto `scan address` responde "o que este endereço
-- específico revela". Misturar os dois apagaria a diferença justamente onde o
-- scanner fica mais detalhado.
CREATE TABLE address_privacy_scans (
  id              BIGSERIAL PRIMARY KEY,
  wallet_id       BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  address_id      BIGINT NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
  score           INT NOT NULL,
  grade           TEXT NOT NULL,
  address_info    JSONB NOT NULL DEFAULT '{}'::jsonb,
  findings        JSONB NOT NULL DEFAULT '[]'::jsonb,
  scanner_version TEXT NOT NULL,
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON address_privacy_scans (wallet_id, address_id, scanned_at DESC);
