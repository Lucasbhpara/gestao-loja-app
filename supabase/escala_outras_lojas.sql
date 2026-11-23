-- Escala de outras lojas (Portal → Colaboradores → Escala de outras lojas).
-- Uma linha por loja; pessoas, grupos e ajustes ficam em JSON. Não mexe nas
-- tabelas da Loja 327. Pode rodar mais de uma vez.
create table if not exists escala_outras_lojas (
  loja text primary key,              -- número da loja (ex.: 215)
  nome text,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz default now(),
  atualizado_por text
);
alter table escala_outras_lojas enable row level security;
drop policy if exists escala_outras_lojas_tudo on escala_outras_lojas;
create policy escala_outras_lojas_tudo on escala_outras_lojas for all using (true) with check (true);
select 'escala_outras_lojas pronta' as resultado;
