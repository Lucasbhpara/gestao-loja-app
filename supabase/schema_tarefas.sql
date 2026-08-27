-- Tabela de Tarefas/Prioridades — segunda parte do banco de dados.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- (mesmo processo do supabase/schema.sql que você já rodou antes)

create table if not exists tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  setor text, -- null = tarefa pra todos os setores
  criado_por_nome text not null,
  prazo date,
  concluida boolean not null default false,
  concluida_por_nome text,
  concluida_em timestamptz,
  foto_url text,
  criado_em timestamptz not null default now()
);

alter table tarefas enable row level security;

create policy "Permitir leitura para todos"
  on tarefas for select
  using (true);

create policy "Permitir escrita para todos"
  on tarefas for all
  using (true)
  with check (true);
