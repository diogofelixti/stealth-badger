-- Separa "foi gasto" de "quem gastou".
--
-- A projeção usava `spent_at_txid IS NULL` como o sinal de não gasto, o que
-- obrigava o motor a inventar um txid quando o backend não sabia dizer quem
-- consumiu a saída. Sinal e detalhe passam a ser coisas distintas: `spent` diz
-- que aconteceu, `spent_at_txid` diz por quem — e pode ser nulo sem que isso
-- signifique "ainda tenho o dinheiro".
ALTER TABLE utxos ADD COLUMN spent BOOLEAN NOT NULL DEFAULT false;

-- Retroativo: o que já estava marcado com um txid continua gasto.
UPDATE utxos SET spent = true WHERE spent_at_txid IS NOT NULL;

DROP INDEX IF EXISTS utxos_wallet_id_idx;
CREATE INDEX ON utxos (wallet_id) WHERE NOT spent;
