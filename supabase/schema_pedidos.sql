-- Pedidos — começa só com o setor FLV.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
--
-- Como usar: quando você me mandar a planilha dos produtos do FLV (Material,
-- Embalagem, Palete, Estoque CD, Giro semanal, Qtd. pendente entrega), eu
-- devolvo um script de importação pronto pra colar aqui, do mesmo jeito que
-- já fizemos com Perdas & Quebras e o catálogo do Inventário. Depois disso,
-- o encarregado do FLV já vê a lista de produtos na aba "Pedidos" do
-- celular, preenche a quantidade desejada de cada um, e manda tudo de uma
-- vez com o botão "Enviar pedido".

create table if not exists pedidos_produtos (
  id uuid primary key default gen_random_uuid(),
  setor text not null default 'flv',
  codigo text not null,
  produto text not null,
  embalagem text,
  palete numeric,
  estoque_cd numeric,
  giro_semanal numeric,
  qtd_pendente_entrega numeric,
  atualizado_em timestamptz not null default now(),
  unique (setor, codigo)
);

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  setor text not null,
  encarregado_nome text not null,
  criado_em timestamptz not null default now()
);

create table if not exists pedidos_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  codigo text not null,
  produto text not null,
  quantidade numeric not null
);

create index if not exists pedidos_itens_pedido_id_idx on pedidos_itens (pedido_id);

alter table pedidos_produtos enable row level security;
alter table pedidos enable row level security;
alter table pedidos_itens enable row level security;

drop policy if exists "Permitir leitura para todos" on pedidos_produtos;
create policy "Permitir leitura para todos" on pedidos_produtos for select using (true);
drop policy if exists "Permitir escrita para todos" on pedidos_produtos;
create policy "Permitir escrita para todos" on pedidos_produtos for all using (true) with check (true);

drop policy if exists "Permitir leitura para todos" on pedidos;
create policy "Permitir leitura para todos" on pedidos for select using (true);
drop policy if exists "Permitir escrita para todos" on pedidos;
create policy "Permitir escrita para todos" on pedidos for all using (true) with check (true);

drop policy if exists "Permitir leitura para todos" on pedidos_itens;
create policy "Permitir leitura para todos" on pedidos_itens for select using (true);
drop policy if exists "Permitir escrita para todos" on pedidos_itens;
create policy "Permitir escrita para todos" on pedidos_itens for all using (true) with check (true);
