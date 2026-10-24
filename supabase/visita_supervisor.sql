-- =============================================================================
-- Visita Supervisor (ULVA)
-- Quando o supervisor vem à loja, ele (ou a gerência) registra o que ele
-- orientou mudar, por setor (gaveta): descrição + até 2 fotos. Cada item pode
-- virar tarefa para o encarregado do setor (tarefas.visita_supervisor_id e
-- tarefas.fotos_referencia levam o vínculo e as fotos para a tarefa).
-- Rodar uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
-- =============================================================================

create table if not exists public.visitas_supervisor (
  id uuid primary key default gen_random_uuid(),
  supervisor_nome text not null,
  registrada_por_nome text not null,
  registrada_por_matricula text,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'finalizada')),
  observacoes text,
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz
);
create index if not exists visitas_supervisor_iniciada on public.visitas_supervisor (iniciada_em desc);

create table if not exists public.visita_supervisor_itens (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.visitas_supervisor(id) on delete cascade,
  setor text not null,
  descricao text not null,
  fotos text[] not null default '{}',
  virar_tarefa boolean not null default false,
  prioridade text not null default 'normal' check (prioridade in ('normal', 'alta')),
  prazo date,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  criado_por_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists visita_supervisor_itens_visita on public.visita_supervisor_itens (visita_id);

alter table public.tarefas add column if not exists visita_supervisor_id uuid references public.visitas_supervisor(id) on delete set null;
alter table public.tarefas add column if not exists fotos_referencia text[];

alter table public.visitas_supervisor enable row level security;
alter table public.visita_supervisor_itens enable row level security;
drop policy if exists visitas_supervisor_all on public.visitas_supervisor;
drop policy if exists visita_supervisor_itens_all on public.visita_supervisor_itens;
create policy visitas_supervisor_all on public.visitas_supervisor for all using (true) with check (true);
create policy visita_supervisor_itens_all on public.visita_supervisor_itens for all using (true) with check (true);

insert into storage.buckets (id, name, public) values ('visita-supervisor-fotos', 'visita-supervisor-fotos', true)
on conflict (id) do nothing;
drop policy if exists visita_supervisor_fotos_insert on storage.objects;
drop policy if exists visita_supervisor_fotos_select on storage.objects;
drop policy if exists visita_supervisor_fotos_delete on storage.objects;
create policy visita_supervisor_fotos_insert on storage.objects for insert with check (bucket_id = 'visita-supervisor-fotos');
create policy visita_supervisor_fotos_select on storage.objects for select using (bucket_id = 'visita-supervisor-fotos');
create policy visita_supervisor_fotos_delete on storage.objects for delete using (bucket_id = 'visita-supervisor-fotos');
