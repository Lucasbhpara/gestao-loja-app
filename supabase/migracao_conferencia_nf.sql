-- Adiciona o campo pra anexar a foto da nota fiscal (NF) na conferência do
-- FLV — antes só dava pra anexar foto item por item (nas divergências), a
-- NF inteira da entrega não tinha onde ficar salva.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.

alter table conferencias add column if not exists nota_fiscal_url text;
