-- O que o usuário diz sobre um UTXO: rótulo, tags de proveniência, congelamento.
--
-- NÃO mora em `utxos`, e a razão é estrutural: `utxos` é projeção, e
-- `projectWallet` a apaga e reconstrói inteira a cada sincronização. Dado do
-- usuário guardado ali seria apagado a cada ciclo, em silêncio — o usuário
-- congelaria um UTXO e o encontraria gastável de novo minutos depois, sem
-- nada na tela explicando por quê.
--
-- A chave é (carteira, txid, vout) e não referencia `utxos`: a marca precisa
-- sobreviver ao UTXO ser gasto, porque o BIP-329 exporta rótulo de saída
-- gasta também, e apagar destruiria texto que o usuário escreveu.
CREATE TABLE utxo_marks (
  wallet_id  BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  txid       TEXT NOT NULL,
  vout       INT NOT NULL,
  label      TEXT,
  tags       TEXT[] NOT NULL DEFAULT '{}',
  frozen     BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_id, txid, vout)
);
CREATE INDEX ON utxo_marks (wallet_id) WHERE frozen;
