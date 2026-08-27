-- Arquivar uma carteira: some da tela, sai do total e o worker para de
-- consultá-la. O log fica intacto, e a ação é reversível.
--
-- Apagar de verdade existe atrás de confirmação escrita, e é a exceção
-- deliberada ao princípio 5: append-only protege a história contra reescrita,
-- não contra o dono pedindo para esquecer o próprio xpub. Um watchtower de
-- privacidade que não deixa alguém remover a própria chave contraria a
-- própria tese. O cascata que apaga o log já existe desde a migração 001.
ALTER TABLE wallets ADD COLUMN archived_at TIMESTAMPTZ;

-- O worker e a lista pedem sempre as não arquivadas.
CREATE INDEX ON wallets (user_id) WHERE archived_at IS NULL;
