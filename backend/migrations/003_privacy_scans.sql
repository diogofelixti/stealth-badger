-- Histórico de análises de privacidade, uma linha por execução do scanner.
--
-- APPEND-ONLY, como chain_events e pela mesma razão: o diferencial deste
-- projeto sobre o scanner original é o eixo do tempo. Sobrescrever o resultado
-- anterior transformaria "o score caiu depois daquela consolidação" — que é a
-- história que importa — em um número solto sem passado.
CREATE TABLE privacy_scans (
  id              BIGSERIAL PRIMARY KEY,
  wallet_id       BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  score           INT NOT NULL,
  grade           TEXT NOT NULL,
  wallet_info     JSONB NOT NULL DEFAULT '{}'::jsonb,
  findings        JSONB NOT NULL DEFAULT '[]'::jsonb,
  scanner_version TEXT NOT NULL,
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON privacy_scans (wallet_id, scanned_at DESC);
