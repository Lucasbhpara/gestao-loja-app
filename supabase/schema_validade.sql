-- Tabelas de Controle de Validade — quarta parte do banco de dados.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- (mesmo processo dos outros arquivos supabase/schema*.sql que você já rodou)

-- Base de produtos com código de barras. É a "base" que você vai me mandar
-- (código de barras + nome do produto): quando alguém escaneia um produto
-- no app, ele procura aqui pra já preencher o nome e a unidade sozinho.
create table if not exists produtos_catalogo (
  codigo_barras text primary key,
  produto text not null,
  unidade text not null default 'un',
  criado_em timestamptz not null default now()
);

-- Produtos com data de validade sendo acompanhados. Cada linha = um
-- produto escaneado (ou cadastrado manualmente) em algum setor.
create table if not exists validades (
  id uuid primary key default gen_random_uuid(),
  codigo_barras text,
  produto text not null,
  unidade text not null default 'un',
  setor text not null,
  data_validade date not null,
  cadastrado_por_nome text not null,
  criado_em timestamptz not null default now()
);

create index if not exists validades_data_validade_idx on validades (data_validade);

alter table produtos_catalogo enable row level security;
alter table validades enable row level security;

create policy "Permitir leitura para todos"
  on produtos_catalogo for select
  using (true);

create policy "Permitir escrita para todos"
  on produtos_catalogo for all
  using (true)
  with check (true);

create policy "Permitir leitura para todos"
  on validades for select
  using (true);

create policy "Permitir escrita para todos"
  on validades for all
  using (true)
  with check (true);
