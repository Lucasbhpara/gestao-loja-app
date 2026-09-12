-- Importação do catálogo de Paletes e Caixas Pretas pro Inventário —
-- gerado a partir de 'INV.PALETE.CAIXAS.pdf' (lista de produtos, 02/09/2026).
--
-- Rode DEPOIS de já ter rodado supabase/migracao_inventario_paletes_caixas.sql
-- (que libera 'paletes_caixas' como sortimento válido).
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.

insert into inventario_itens (sortimento, codigo_interno, codigo_barras, produto, unidade)
values
('paletes_caixas', '136467', '0000001364675', 'CAIXA PL.HORTIFRUT 6424', 'UN'),
('paletes_caixas', '5282', '0000000052825', 'PALETE CHEP', 'UN'),
('paletes_caixas', '5247', '0000000052474', 'PALETE PBR', 'UN')
on conflict (sortimento, codigo_interno) do update set
  codigo_barras = excluded.codigo_barras,
  produto = excluded.produto,
  unidade = excluded.unidade;
