-- As escolhas do usuário sobre o que a instância consulta por ele.
--
-- Tudo desligado de fábrica: `price_sources` vazio significa preço desligado, e
-- `fee_source = 'off'` significa nenhuma consulta de taxa. Um watchtower de
-- privacidade não pode começar perguntando preço a cinco serviços sem que
-- ninguém tenha pedido.
CREATE TABLE user_preferences (
  user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme         TEXT NOT NULL DEFAULT 'sett',
  currency      TEXT NOT NULL DEFAULT 'BRL',
  price_sources TEXT[] NOT NULL DEFAULT '{}',
  fee_source    TEXT NOT NULL DEFAULT 'off' CHECK (fee_source IN ('off','node','mempool')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
