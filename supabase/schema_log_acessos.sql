-- Log de acessos ao app — sétima parte do banco de dados.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- (mesmo processo dos outros arquivos supabase/schema*.sql que você já rodou)
--
-- O que isso cria:
-- Uma tabela que guarda um registro toda vez que alguém faz login no app
-- (nome, função e setor no momento do login, mais data/hora). É isso que
-- alimenta a página "Acessos" do portal — quem abriu o app e quantas
-- vezes por dia.
--
-- Importante: esse registro só existe a partir de quando esse arquivo é
-- rodado (não tem como reconstruir logins que já aconteceram antes disso).
--
-- nome/função/setor ficam guardados aqui por cópia (não só o id) pra que,
-- se um colaborador for removido da equipe depois, o histórico de acessos
-- dele continue legível no portal.

create table if not exists log_acessos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references colaboradores(id) on delete set null,
  nome text not null,
  funcao text,
  setor text,
  data_hora timestamptz not null default now()
);

create index if not exists log_acessos_data_hora_idx on log_acessos (data_hora desc);
create index if not exists log_acessos_colaborador_id_idx on log_acessos (colaborador_id);

-- Mesma política liberal das outras tabelas (o app usa a chave "anon" pra
-- tudo, sem Supabase Auth "de verdade" ainda).
alter table log_acessos enable row level security;

create policy "Permitir leitura para todos"
  on log_acessos for select
  using (true);

create policy "Permitir escrita para todos"
  on log_acessos for all
  using (true)
  with check (true);
