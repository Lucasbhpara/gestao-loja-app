-- Libera 'bebidas' como um sortimento válido no Inventário (além de FLV,
-- Açougue, Padaria e Uso e Consumo que já existiam).
--
-- Rode ISSO ANTES do supabase/inventario_bebidas_import.sql (a importação
-- dos produtos falha com "violates check constraint" se você rodar na
-- ordem errada).
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.

alter table inventario_itens drop constraint if exists inventario_itens_sortimento_check;
alter table inventario_itens
  add constraint inventario_itens_sortimento_check
  check (sortimento in ('flv', 'acougue', 'padaria', 'uso_consumo', 'bebidas'));

alter table inventario_contagens drop constraint if exists inventario_contagens_sortimento_check;
alter table inventario_contagens
  add constraint inventario_contagens_sortimento_check
  check (sortimento in ('flv', 'acougue', 'padaria', 'uso_consumo', 'bebidas'));
