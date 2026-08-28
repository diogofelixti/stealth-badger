-- A fonte de análise, escolhida uma vez por rede e guardada por usuário.
--
-- ── Por que ela não é a fonte de cadeia ───────────────────────────────────
-- O `am-i-exposed` só fala REST no formato Esplora: `/address/:a/txs`,
-- `/address/:a/utxo`, `/tx/:id/hex`, `/tx/:id/outspends`. Ele não fala o RPC do
-- Bitcoin Core e não fala Electrum. Quem vigia pelo próprio nó — a postura mais
-- soberana — é justamente quem precisa apontar a análise para outro lugar.
--
-- Medido em 28/08: dez de dez análises de transação falharam com
-- `{"error":true,"message":"Not found"}`, porque `--api` recebia o RPC do nó.
--
-- ── Por que por usuário, e não por instância ──────────────────────────────
-- Escolher a fonte de análise é escolher **quem vê os endereços que você
-- consulta**. Num painel multi-usuário, uma escolha de instância faria todo
-- mundo herdar a exposição que o admin aceitou para si. Carteira e fonte já são
-- por usuário; esta acompanha.
--
-- ── Por que aponta para `backends`, e não guarda uma URL ──────────────────
-- A fonte de análise é uma fonte como as outras: mesmo catálogo de presets,
-- mesma postura pública ou privada, mesma tela de cadastro. Guardar URL solta
-- aqui criaria um segundo lugar onde fonte existe, e os dois divergiriam no
-- primeiro preset novo.
CREATE TABLE user_analysis_sources (
  user_id    BIGINT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  network    TEXT   NOT NULL,
  backend_id BIGINT NOT NULL REFERENCES backends(id) ON DELETE CASCADE,
  chosen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, network)
);
