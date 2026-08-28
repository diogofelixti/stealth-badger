-- O estado medido de cada fonte de consulta.
--
-- Existe porque a lista de fontes mentia por omissão: as duas `mempool.space`
-- que a instância semeia estão inalcançáveis desta rede, e apareciam no
-- seletor exatamente iguais às que respondem. Quem escolhia uma delas
-- descobria o problema como `fetch failed` num canto da tela, minutos depois.
--
-- Uma linha por fonte, sobrescrita a cada medição: o histórico de saúde não
-- serve a ninguém aqui, e `chain_events` é o único log append-only do projeto.
CREATE TABLE IF NOT EXISTS backend_health (
  backend_id BIGINT PRIMARY KEY REFERENCES backends(id) ON DELETE CASCADE,
  ok         BOOLEAN     NOT NULL,
  height     BIGINT,
  error      TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
