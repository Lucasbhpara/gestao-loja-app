-- Correção pontual — só precisa rodar UMA VEZ, antes do schema_mapa_loja.sql novo.
--
-- O que aconteceu: a tabela mapa_areas já existia no seu banco (da versão
-- antiga, em grade), com colunas grid_linha/grid_coluna. O schema novo usa
-- "create table if not exists", que NÃO altera uma tabela que já existe —
-- só cria se não existir. Por isso deu erro "column pos_x does not exist"
-- ao rodar o seed: a tabela continuava com a estrutura antiga.
--
-- Esse script apaga mapa_areas e mapa_fotos (elas ainda não tinham fotos
-- reais cadastradas nessa fase de testes) pra deixar o caminho livre pro
-- schema novo recriar do zero, já com as colunas certas.
--
-- Como rodar: SQL Editor do Supabase → New query → cola isso → Run.
-- Depois disso, roda o schema_mapa_loja.sql (de novo) e por último o
-- seed_mapa_areas_327.sql — nessa ordem.

drop table if exists mapa_fotos;
drop table if exists mapa_areas;
