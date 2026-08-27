-- Controle de Contagem de Inventário
-- Catálogo de itens por sortimento (FLV, Açougue, Padaria, Uso e Consumo) e
-- os lançamentos de contagem feitos por cada pessoa, separados por área
-- (venda / depósito). Rode este script uma vez no SQL Editor do Supabase.

create table if not exists inventario_itens (
  id uuid primary key default gen_random_uuid(),
  sortimento text not null check (sortimento in ('flv', 'acougue', 'padaria', 'uso_consumo')),
  codigo_interno text,
  codigo_barras text,
  produto text not null,
  unidade text not null default 'un',
  criado_em timestamptz not null default now()
);
create index if not exists inventario_itens_sortimento_idx on inventario_itens (sortimento);
create index if not exists inventario_itens_codigo_interno_idx on inventario_itens (codigo_interno);
create index if not exists inventario_itens_codigo_barras_idx on inventario_itens (codigo_barras);
-- Evita item duplicado ao importar a mesma planilha de novo (permite
-- atualizar nome/unidade de um código já existente em vez de duplicar).
-- Se você já rodou uma versão anterior deste script, o DROP abaixo troca o
-- índice antigo (parcial) por esse novo, sem o que o "ON CONFLICT" do
-- script de importação não funciona.
drop index if exists inventario_itens_sortimento_codigo_interno_idx;
create unique index if not exists inventario_itens_sortimento_codigo_interno_idx
  on inventario_itens (sortimento, codigo_interno);

alter table inventario_itens enable row level security;
create policy "Permitir leitura para todos" on inventario_itens for select using (true);
create policy "Permitir escrita para todos" on inventario_itens for all using (true) with check (true);

-- Um lançamento por (sortimento, pessoa, área, item) — contar o mesmo item
-- de novo na mesma área soma na quantidade já lançada (nunca sobrescreve).
create table if not exists inventario_contagens (
  id uuid primary key default gen_random_uuid(),
  sortimento text not null check (sortimento in ('flv', 'acougue', 'padaria', 'uso_consumo')),
  pessoa_nome text not null,
  area text not null check (area in ('venda', 'deposito')),
  item_id uuid not null references inventario_itens(id) on delete cascade,
  codigo_interno text,
  codigo_barras text,
  produto text not null,
  unidade text not null default 'un',
  quantidade numeric not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (sortimento, pessoa_nome, area, item_id)
);
create index if not exists inventario_contagens_sortimento_idx on inventario_contagens (sortimento);
create index if not exists inventario_contagens_pessoa_idx on inventario_contagens (sortimento, pessoa_nome);

alter table inventario_contagens enable row level security;
create policy "Permitir leitura para todos" on inventario_contagens for select using (true);
create policy "Permitir escrita para todos" on inventario_contagens for all using (true) with check (true);
