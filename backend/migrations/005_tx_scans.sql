-- Análise de origem por transação: de onde vieram os fundos que entraram.
--
-- Existe separada de `privacy_scans` porque responde outra pergunta. A
-- varredura de carteira só emite achados `wallet-*`, sobre a forma da carteira;
-- quem mandou os fundos só aparece analisando a transação em si.
--
-- A chave é (carteira, txid) e não uma sequência: cada transação é analisada
-- uma vez só. Reanalisar custaria segundos contra a cadeia a cada clique e
-- repetiria o mesmo aviso, sem dizer nada novo — o que uma transação
-- confirmada revela não muda.
CREATE TABLE tx_scans (
  wallet_id       BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  txid            TEXT NOT NULL,
  findings        JSONB NOT NULL DEFAULT '[]'::jsonb,
  scanner_version TEXT NOT NULL,
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_id, txid)
);
