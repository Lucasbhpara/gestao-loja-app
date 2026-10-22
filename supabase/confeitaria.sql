-- =====================================================================
-- ULVA · Confeitaria (aba exclusiva de quem tem setor = 'confeitaria')
-- Controle de produção caseira: fichas técnicas (receitas com custo por
-- unidade), compras (inclusive lidas do QR Code do cupom fiscal), vendas,
-- produção, investimentos e a vitrine para mandar no WhatsApp com a logo
-- da marca. Tabelas separadas das da loja (prefixo conf_).
-- Rodar uma vez no SQL Editor do Supabase. Depois rodar confeitaria_dados.sql
-- (dados que vieram da planilha) e, por último, criar o login (fim deste arquivo).
-- =====================================================================

-- Produtos / fichas técnicas
create table if not exists public.conf_produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sabor text,
  categoria text,
  rendimento numeric not null default 1,
  tamanho text,
  montagem text,
  preco_venda numeric(10,2),
  foto_url text,
  descricao text,
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Itens da ficha: o custo é o valor que aquele item representa na receita
-- inteira (ex.: 1 caixa de leite condensado = R$ 5,78). O custo por
-- unidade do produto = soma dos itens (menos os opcionais) ÷ rendimento.
create table if not exists public.conf_produto_itens (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.conf_produtos(id) on delete cascade,
  grupo text not null default 'MASSA',
  nome text not null,
  qtd_texto text,
  embalagem_texto text,
  preco_embalagem numeric(10,2),
  custo numeric(12,4) not null default 0,
  opcional boolean not null default false,
  ordem int not null default 0
);
create index if not exists conf_produto_itens_produto on public.conf_produto_itens (produto_id);

create table if not exists public.conf_compras (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  item text not null,
  categoria text,
  quantidade numeric(12,3),
  unidade text,
  valor_total numeric(12,2) not null default 0,
  fornecedor text,
  destino text,
  observacao text,
  cupom_chave text,
  criado_em timestamptz not null default now()
);
create index if not exists conf_compras_data on public.conf_compras (data desc);

create table if not exists public.conf_vendas (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  cliente text,
  produto_id uuid references public.conf_produtos(id) on delete set null,
  produto text not null,
  quantidade numeric(12,3) not null default 1,
  preco_unitario numeric(10,2) not null default 0,
  forma_pagamento text,
  recebido boolean not null default false,
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists conf_vendas_data on public.conf_vendas (data desc);

create table if not exists public.conf_producao (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  produto_id uuid references public.conf_produtos(id) on delete set null,
  produto text not null,
  quantidade numeric(12,3) not null default 1,
  custo_unitario numeric(10,4),
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists conf_producao_data on public.conf_producao (data desc);

create table if not exists public.conf_investimentos (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  item text not null,
  categoria text,
  quantidade numeric(12,3),
  valor_total numeric(12,2) not null default 0,
  forma_pagamento text,
  observacao text,
  criado_em timestamptz not null default now()
);

-- Ajustes da marca: nome, logo, WhatsApp, margem-alvo, listas (clientes,
-- fornecedores, formas de pagamento, categorias)
create table if not exists public.conf_config (
  chave text primary key,
  valor jsonb,
  atualizado_em timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['conf_produtos','conf_produto_itens','conf_compras','conf_vendas','conf_producao','conf_investimentos','conf_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_tudo', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_tudo', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- Fotos dos produtos e a logo
insert into storage.buckets (id, name, public)
values ('confeitaria-fotos', 'confeitaria-fotos', true)
on conflict (id) do nothing;
drop policy if exists confeitaria_fotos_ler on storage.objects;
create policy confeitaria_fotos_ler on storage.objects for select using (bucket_id = 'confeitaria-fotos');
drop policy if exists confeitaria_fotos_enviar on storage.objects;
create policy confeitaria_fotos_enviar on storage.objects for insert with check (bucket_id = 'confeitaria-fotos');
drop policy if exists confeitaria_fotos_trocar on storage.objects;
create policy confeitaria_fotos_trocar on storage.objects for update using (bucket_id = 'confeitaria-fotos');

-- Login da Priscila (Sabores da Pri). Senha inicial = matrícula; no primeiro
-- acesso o app pede para ela criar a senha dela, igual aos colaboradores.
insert into public.colaboradores (nome, matricula, funcao, setor, is_admin, senha_atual, senha_definida)
select 'Priscila', '040491', 'Confeiteira', 'confeitaria', false, '040491', false
where not exists (select 1 from public.colaboradores where lower(nome) = 'priscila');

select 'confeitaria pronta' as ok;
