-- Pontas e Pontos Extras — o que está montado em cada ponta de gôndola da
-- loja agora (diferente do Mapa da Loja, que mostra ONDE cada ponta fica;
-- aqui é O QUE tem nela: até 4 produtos, cada um com foto e/ou nome).
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- (mesmo processo dos outros arquivos supabase/schema*.sql que você já rodou)
--
-- O que isso cria:
-- 1) pontas_extras — cada ponta cadastrada: nome ("Ponta 1"), um local
--    opcional pra identificar ("Corredor 3 — entrada") e a ordem de exibição.
-- 2) pontas_produtos — os produtos que estão hoje em cada ponta (o limite de
--    4 por ponta é controlado no portal/app, não aqui no banco): foto e/ou
--    nome do produto.
-- 3) O espaço de armazenamento (Storage) onde as fotos dos produtos ficam.
--
-- Só administradores criam/editam pontas e produtos — pelo portal OU direto
-- pelo app, tirando a foto na hora em frente à ponta. Os demais
-- colaboradores só consultam (igual ao Mapa da Loja).

create table if not exists pontas_extras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  local text,              -- opcional: "Corredor 3 — entrada"
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

alter table pontas_extras enable row level security;
drop policy if exists "Permitir leitura para todos" on pontas_extras;
create policy "Permitir leitura para todos" on pontas_extras for select using (true);
drop policy if exists "Permitir escrita para todos" on pontas_extras;
create policy "Permitir escrita para todos" on pontas_extras for all using (true) with check (true);

create table if not exists pontas_produtos (
  id uuid primary key default gen_random_uuid(),
  ponta_id uuid not null references pontas_extras(id) on delete cascade,
  nome text,
  foto_url text,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists pontas_produtos_ponta_id_idx on pontas_produtos (ponta_id);

alter table pontas_produtos enable row level security;
drop policy if exists "Permitir leitura para todos" on pontas_produtos;
create policy "Permitir leitura para todos" on pontas_produtos for select using (true);
drop policy if exists "Permitir escrita para todos" on pontas_produtos;
create policy "Permitir escrita para todos" on pontas_produtos for all using (true) with check (true);

-- Espaço de armazenamento (Storage) onde as fotos das pontas ficam salvas
insert into storage.buckets (id, name, public)
values ('pontas-fotos', 'pontas-fotos', true)
on conflict (id) do nothing;

drop policy if exists "Leitura publica das fotos das pontas" on storage.objects;
create policy "Leitura publica das fotos das pontas"
  on storage.objects for select
  using (bucket_id = 'pontas-fotos');

drop policy if exists "Upload de fotos das pontas para todos" on storage.objects;
create policy "Upload de fotos das pontas para todos"
  on storage.objects for insert
  with check (bucket_id = 'pontas-fotos');

drop policy if exists "Atualizar fotos das pontas para todos" on storage.objects;
create policy "Atualizar fotos das pontas para todos"
  on storage.objects for update
  using (bucket_id = 'pontas-fotos');

drop policy if exists "Remover fotos das pontas para todos" on storage.objects;
create policy "Remover fotos das pontas para todos"
  on storage.objects for delete
  using (bucket_id = 'pontas-fotos');
