-- Retrato opaco do endereço na última volta da varredura.
--
-- Guardado para que o ciclo seguinte saiba, com uma consulta barata, quais
-- endereços não mudaram — e possa deixar de pedir a lista de UTXO deles.
-- NULL significa "nunca conferido" ou "backend não informa": nos dois casos o
-- endereço é reconferido, que é o comportamento seguro.
ALTER TABLE addresses ADD COLUMN status TEXT;
