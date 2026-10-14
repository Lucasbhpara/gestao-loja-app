-- =====================================================================
-- ULVA · Pesquisa de preço (concorrentes)
-- Feita pelo app no concorrente; o preço da loja vem do Estoque Loja.
-- =====================================================================

create table if not exists public.concorrentes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists concorrentes_nome_unico on public.concorrentes (lower(nome));

create table if not exists public.pesquisas_preco (
  id uuid primary key,
  concorrente_id uuid references public.concorrentes(id) on delete set null,
  concorrente_nome text not null,
  feita_por_nome text,
  iniciada_em timestamptz not null default now(),
  enviada_em timestamptz not null default now(),
  localizacao_lat double precision,
  localizacao_lng double precision,
  observacao text,
  total_itens int not null default 0
);

create table if not exists public.pesquisa_preco_itens (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.pesquisas_preco(id) on delete cascade,
  ordem int not null default 0,
  produto_concorrente text not null,
  codigo_barras text,
  preco_concorrente numeric(12,2) not null,
  codigo_interno text,
  produto_loja text,
  preco_loja numeric(12,2),
  similar boolean not null default false,
  foto_url text,
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists pesquisa_preco_itens_pesquisa on public.pesquisa_preco_itens (pesquisa_id);
create index if not exists pesquisa_preco_itens_codigo on public.pesquisa_preco_itens (codigo_interno);

alter table public.concorrentes enable row level security;
alter table public.pesquisas_preco enable row level security;
alter table public.pesquisa_preco_itens enable row level security;
drop policy if exists concorrentes_tudo on public.concorrentes;
create policy concorrentes_tudo on public.concorrentes for all using (true) with check (true);
drop policy if exists pesquisas_preco_tudo on public.pesquisas_preco;
create policy pesquisas_preco_tudo on public.pesquisas_preco for all using (true) with check (true);
drop policy if exists pesquisa_preco_itens_tudo on public.pesquisa_preco_itens;
create policy pesquisa_preco_itens_tudo on public.pesquisa_preco_itens for all using (true) with check (true);
grant all on public.concorrentes, public.pesquisas_preco, public.pesquisa_preco_itens to anon, authenticated;

-- Fotos das etiquetas
insert into storage.buckets (id, name, public) values ('pesquisa-preco-fotos', 'pesquisa-preco-fotos', true)
on conflict (id) do nothing;
drop policy if exists pesquisa_preco_fotos_insert on storage.objects;
create policy pesquisa_preco_fotos_insert on storage.objects for insert with check (bucket_id = 'pesquisa-preco-fotos');
drop policy if exists pesquisa_preco_fotos_select on storage.objects;
create policy pesquisa_preco_fotos_select on storage.objects for select using (bucket_id = 'pesquisa-preco-fotos');
