-- Mural de Avisos
-- Administrador publica um aviso (geral ou só pra um setor, com opção de
-- marcar como urgente) e todo mundo vê na Home. Rode este script uma vez
-- no SQL Editor do Supabase.

create table if not exists avisos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  mensagem text not null,
  urgente boolean not null default false,
  setor text, -- null = aparece pra todos os setores
  criado_por_nome text not null,
  criado_em timestamptz not null default now()
);
create index if not exists avisos_criado_em_idx on avisos (criado_em desc);
create index if not exists avisos_setor_idx on avisos (setor);

alter table avisos enable row level security;
create policy "Permitir leitura para todos" on avisos for select using (true);
create policy "Permitir escrita para todos" on avisos for all using (true) with check (true);
