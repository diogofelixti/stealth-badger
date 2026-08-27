-- O catálogo de fontes: o preset que o usuário escolheu, o rótulo que ele deu,
-- e a credencial do RPC.
--
-- A credencial é cifrada com a mesma caixa do xpub (`crypto/secretbox`, sob
-- `MASTER_KEY_HEX`) e nunca volta numa resposta de API — só um booleano
-- dizendo que existe. O RPC do Bitcoin Core não é leitura inofensiva: quem o
-- alcança pode parar o nó, e se houver outra carteira com chave carregada,
-- gastar.
--
-- `preset` é apresentação, não comportamento: Fulcrum, Electrs e Floresta
-- gravam `kind = 'electrum'` e falam com o mesmo adapter. Quem ler esta coluna
-- para decidir o que fazer criou um quarto adapter sem querer.
ALTER TABLE backends ADD COLUMN credentials_encrypted BYTEA;
ALTER TABLE backends ADD COLUMN preset TEXT;
ALTER TABLE backends ADD COLUMN label TEXT;
