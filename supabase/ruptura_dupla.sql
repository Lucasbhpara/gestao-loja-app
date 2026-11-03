-- Ruptura: coleta em dupla (dois celulares bipando o mesmo grupo).
-- A coleta fica aberta em ruptura_coletas (finalizada_em null, compartilhada)
-- e cada celular grava os bipes em ruptura_coleta_leituras. Quem finaliza
-- junta tudo e gera o resultado normal.

alter table public.ruptura_coletas add column if not exists compartilhada boolean not null default false;
alter table public.ruptura_coletas add column if not exists aberta_por text;

create table if not exists public.ruptura_coleta_leituras (
  coleta_id uuid not null references public.ruptura_coletas(id) on delete cascade,
  aparelho text not null,
  ean text not null,
  codigo_interno text,
  produto text,
  area_id text,
  por text,
  em timestamptz not null default now(),
  primary key (coleta_id, aparelho, ean)
);
create index if not exists ruptura_coleta_leituras_coleta on public.ruptura_coleta_leituras (coleta_id);

alter table public.ruptura_coleta_leituras enable row level security;
drop policy if exists ruptura_coleta_leituras_tudo on public.ruptura_coleta_leituras;
create policy ruptura_coleta_leituras_tudo on public.ruptura_coleta_leituras for all using (true) with check (true);
grant all on public.ruptura_coleta_leituras to anon, authenticated;
