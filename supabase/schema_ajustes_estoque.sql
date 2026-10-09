-- =============================================================================
-- Ajustes de estoque (Giro de Produtos).
--
-- Quem olha o Giro conta o produto e registra a quantidade real. Os ajustes
-- ficam "pendente" até serem exportados em Excel para a diretoria avaliar;
-- aí viram "enviado" (com a data do envio no campo lote).
-- =============================================================================

create table if not exists public.ajustes_estoque (
  id uuid primary key default gen_random_uuid(),
  codigo_produto text not null,
  produto text not null,
  setor text,
  subcategoria text,
  estoque_sistema numeric not null,
  quantidade_contada numeric not null,
  custo numeric,
  motivo text,
  observacao text,
  status text not null default 'pendente', -- pendente | enviado
  lote text,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index if not exists ajustes_estoque_status_idx on public.ajustes_estoque (status, criado_em desc);
create index if not exists ajustes_estoque_codigo_idx on public.ajustes_estoque (codigo_produto);

alter table public.ajustes_estoque enable row level security;
drop policy if exists ajustes_estoque_tudo on public.ajustes_estoque;
create policy ajustes_estoque_tudo on public.ajustes_estoque for all using (true) with check (true);
grant select, insert, update, delete on public.ajustes_estoque to anon, authenticated;
