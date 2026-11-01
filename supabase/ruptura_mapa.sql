-- Ruptura + Mapa da Loja (já aplicado no Supabase: migração ruptura_mapa_localizacao)
--  • produto_localizacao: onde cada produto foi bipado (área marcada como "Estou em")
--  • ruptura_grupo_area: área do mapa de cada grupo (perguntada na 1ª coleta)
--  • ruptura_produto_grupo: produto movido para outro grupo durante a coleta
-- As funções ruptura_universo e ruptura_prioridade foram atualizadas para
-- respeitar ruptura_produto_grupo (ver migração no Supabase para o corpo
-- completo; o resto da lógica é o mesmo de ruptura.sql).

create table if not exists public.produto_localizacao (
  codigo_interno text primary key,
  mapa_area_id uuid not null references public.mapa_areas(id) on delete cascade,
  produto text,
  grupo_id uuid,
  fonte text not null default 'coleta' check (fonte in ('coleta','manual')),
  vezes integer not null default 1,
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);
create index if not exists produto_localizacao_area on public.produto_localizacao(mapa_area_id);
alter table public.produto_localizacao enable row level security;
create policy produto_localizacao_all on public.produto_localizacao for all using (true) with check (true);

create table if not exists public.ruptura_grupo_area (
  grupo_id uuid primary key references public.ruptura_grupos(id) on delete cascade,
  mapa_area_id uuid not null references public.mapa_areas(id) on delete cascade,
  definido_por text,
  atualizado_em timestamptz not null default now()
);
alter table public.ruptura_grupo_area enable row level security;
create policy ruptura_grupo_area_all on public.ruptura_grupo_area for all using (true) with check (true);

create table if not exists public.ruptura_produto_grupo (
  codigo_interno text primary key,
  grupo_id uuid not null references public.ruptura_grupos(id) on delete cascade,
  grupo_anterior uuid,
  produto text,
  movido_por text,
  movido_em timestamptz not null default now()
);
alter table public.ruptura_produto_grupo enable row level security;
create policy ruptura_produto_grupo_all on public.ruptura_produto_grupo for all using (true) with check (true);

-- Trecho novo dentro de ruptura_universo(p_grupo):
--   movidos as (select codigo_interno cod, grupo_id from ruptura_produto_grupo),
--   dentro as (
--     select p.cod, p.prod from pelas_regras p
--      where not exists (select 1 from movidos mv where mv.cod = p.cod and mv.grupo_id <> p_grupo)
--     union
--     select b.cod, b.prod from base b join movidos mv on mv.cod = b.cod and mv.grupo_id = p_grupo
--   )
-- Trecho novo dentro de ruptura_prioridade():
--   pg as (
--     select p.* from pg0 p where not exists (select 1 from ruptura_produto_grupo mv where mv.codigo_interno = p.cod)
--     union all
--     select mv.codigo_interno, mv.grupo_id from ruptura_produto_grupo mv where mv.codigo_interno in (select cod from base)
--   )
