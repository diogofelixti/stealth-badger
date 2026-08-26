-- Vigiar endereço avulso, fora de qualquer carteira.
--
-- A descrição do produto sempre prometeu "endereços e carteiras", e só carteira
-- havia sido entregue. O endereço avulso entra como uma carteira de um endereço
-- só, e não como tabela nova, porque assim reaproveita inteiros o log de
-- eventos, a projeção de UTXO, o motor de alertas e a deduplicação — que são
-- justamente as partes onde a falha é silenciosa e que já estão cobertas.
--
-- Sem xpub não há o que derivar nem o que cifrar, então as duas colunas passam
-- a aceitar nulo. `kind` existe para que o motor saiba disso sem inferir de
-- coluna nula, que é o tipo de acordo tácito que se perde na próxima leitura.
ALTER TABLE wallets ALTER COLUMN xpub_encrypted DROP NOT NULL;
ALTER TABLE wallets ALTER COLUMN xpub_fingerprint DROP NOT NULL;
ALTER TABLE wallets ADD COLUMN kind TEXT NOT NULL DEFAULT 'xpub'
  CHECK (kind IN ('xpub', 'address'));

-- Um endereço avulso não tem caminho de derivação. A coluna continua NOT NULL
-- para as carteiras, que sempre têm.
ALTER TABLE addresses ALTER COLUMN derivation_path SET DEFAULT '';
