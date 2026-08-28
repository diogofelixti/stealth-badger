-- Detalhe completo da análise de privacidade por transação.
--
-- `tx_scans` nasceu para origem dos fundos, guardando só achados. G3 usa a
-- mesma chave (carteira, txid), mas preserva o resto que o scanner já devolve:
-- score, tipo da transação, análise de cadeia e matriz de Boltzmann.
ALTER TABLE tx_scans ADD COLUMN score INT;
ALTER TABLE tx_scans ADD COLUMN grade TEXT;
ALTER TABLE tx_scans ADD COLUMN tx_type TEXT;
ALTER TABLE tx_scans ADD COLUMN tx_info JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE tx_scans ADD COLUMN chain_analysis JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE tx_scans ADD COLUMN boltzmann JSONB;
