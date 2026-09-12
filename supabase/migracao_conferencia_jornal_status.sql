-- Ajusta a Conferência pra suportar um formato próprio pro "Jornal de
-- Aniversário" (checklist, sem nota fiscal): em vez de OK/Divergência, esse
-- tipo usa OK / Ruptura / Falta Explosivo, e pode ser reiniciado pela
-- própria pessoa que está conferindo, sem precisar de um script novo cada
-- vez que quiserem refazer.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.

-- 1) Novo campo "tipo" em conferencias: 'nf' (conferência de nota fiscal,
--    comportamento de sempre) ou 'jornal' (checklist do jornal de ofertas).
--    Tudo que já existe vira 'nf' por padrão — não muda nada pro que já tem.
alter table conferencias add column if not exists tipo text not null default 'nf';
alter table conferencias drop constraint if exists conferencias_tipo_check;
alter table conferencias
  add constraint conferencias_tipo_check
  check (tipo in ('nf', 'jornal'));

-- 2) Marca a(s) conferência(s) do Jornal de Aniversário que já existem como
--    tipo='jornal' (hoje identificadas pelo setor 'cpd' + título).
update conferencias
  set tipo = 'jornal'
  where setor = 'cpd' and titulo ilike 'Conferência Jornal%';

-- 3) Libera os novos status 'ruptura' e 'falta_explosivo' em
--    conferencia_itens, mantendo 'divergencia' (usado pelas conferências de
--    NF, que não mudam).
alter table conferencia_itens drop constraint if exists conferencia_itens_status_check;
alter table conferencia_itens
  add constraint conferencia_itens_status_check
  check (status in ('pendente', 'ok', 'divergencia', 'ruptura', 'falta_explosivo'));
