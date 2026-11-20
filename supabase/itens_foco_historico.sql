-- =============================================================================
-- Itens Foco — parte 2: histórico das conferências + Pedido CD pelo
-- Assistente ULVA. E troca o nome "Pedido CD automático" por "Assistente ULVA"
-- no histórico das tratativas.
--
-- Precisa ter rodado antes: itens_foco.sql e pedido_cd_solicitacoes.sql.
-- COMO RODAR: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- Pode rodar de novo sem problema.
-- =============================================================================

-- Em que pedido do CD cada item foco entrou (fila pedido_cd_solicitacoes).
alter table public.itens_foco add column if not exists pedido_solicitacao_id uuid;
alter table public.itens_foco add column if not exists pedido_em timestamptz;

-- Uma linha por conferência finalizada: os números e a foto dos itens.
create table if not exists public.itens_foco_conferencias (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  por text,
  responsavel text,                  -- null = todos os responsáveis
  total int not null default 0,
  ok int not null default 0,
  ruptura int not null default 0,
  pendentes int not null default 0,
  itens jsonb not null default '[]', -- [{codigo, produto, responsavel, status}]
  pedido_solicitacao_id uuid
);
create index if not exists itens_foco_conf_data on public.itens_foco_conferencias (criado_em desc);

alter table public.itens_foco_conferencias enable row level security;
drop policy if exists itens_foco_conf_tudo on public.itens_foco_conferencias;
create policy itens_foco_conf_tudo on public.itens_foco_conferencias for all using (true) with check (true);
grant select, insert, update, delete on public.itens_foco_conferencias to anon, authenticated;

-- Nome novo no histórico das tratativas: "Assistente ULVA" no lugar de
-- "Pedido CD automático". Mexe só nesse texto da função que já está no banco.
do $$
declare
  d text;
begin
  select pg_get_functiondef('public.pedido_cd_concluir(uuid, text, jsonb, text)'::regprocedure) into d;
  d := replace(d, 'Pedido CD automático (MG SECOS): ', 'Assistente ULVA (MG SECOS): ');
  d := replace(d, 'coalesce(s.criado_por, ''Pedido CD'')', 'coalesce(s.criado_por, ''Assistente ULVA'')');
  execute d;
exception when undefined_function then
  raise notice 'pedido_cd_concluir não existe: nada a renomear';
end;
$$;
