-- Correção: a tabela "push_tokens" (usada tanto pelo aviso de vencimento do
-- Controle de Validade quanto pela notificação do Mural de Avisos) não
-- existe no seu banco de dados — provavelmente porque o arquivo
-- `schema_notificacoes.sql` não terminou de rodar direito da vez que foi
-- executado. Este arquivo cria só o que falta, sozinho, pra não correr risco
-- de dar errado de novo.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.

create extension if not exists pg_net with schema extensions;

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  expo_push_token text not null,
  atualizado_em timestamptz not null default now(),
  unique (colaborador_id, expo_push_token)
);

alter table push_tokens enable row level security;

drop policy if exists "Permitir leitura para todos" on push_tokens;
create policy "Permitir leitura para todos"
  on push_tokens for select
  using (true);

drop policy if exists "Permitir escrita para todos" on push_tokens;
create policy "Permitir escrita para todos"
  on push_tokens for all
  using (true)
  with check (true);
