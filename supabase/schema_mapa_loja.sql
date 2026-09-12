-- Mapa da Loja — oitava parte do banco de dados.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- (mesmo processo dos outros arquivos supabase/schema*.sql que você já rodou)
--
-- O que isso cria:
-- 1) mapa_areas — cada corredor/setor/ponto extra desenhado em cima da
--    planta da loja: nome, tipo, e a posição dele na imagem (x, y, largura,
--    altura — tudo em PORCENTAGEM da imagem, de 0 a 100, pra funcionar em
--    qualquer tamanho de tela). O campo "tipo" aceita 'corredor' | 'setor' |
--    'ponto-extra', deixando o caminho aberto pras próximas ferramentas sem
--    precisar mudar o schema de novo.
-- 2) mapa_fotos — as fotos de cada área (o colaborador toca na área no app
--    e vê essas fotos, pra tirar dúvida de onde o produto vai).
-- 3) O espaço de armazenamento (Storage) onde essas fotos ficam salvas.
--
-- A imagem de fundo da planta (o croqui da loja) NÃO fica no banco — ela
-- vem junto com o app/portal (arquivo local), então carrega instantâneo e
-- não depende de internet pra aparecer.
--
-- A edição (criar área, subir foto) é feita só pelo portal (administrador).
-- O app só lê — qualquer colaborador consulta a planta e as fotos.

create table if not exists mapa_areas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'corredor', -- 'corredor' | 'setor' | 'ponto-extra' | 'ponta-gondola'
  pos_x numeric not null,      -- % da largura da imagem (0-100), canto esquerdo da área
  pos_y numeric not null,      -- % da altura da imagem (0-100), canto superior da área
  pos_w numeric not null,      -- % da largura da imagem que a área ocupa
  pos_h numeric not null,      -- % da altura da imagem que a área ocupa
  cor text not null default '#1E2761',
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

alter table mapa_areas enable row level security;
drop policy if exists "Permitir leitura para todos" on mapa_areas;
create policy "Permitir leitura para todos" on mapa_areas for select using (true);
drop policy if exists "Permitir escrita para todos" on mapa_areas;
create policy "Permitir escrita para todos" on mapa_areas for all using (true) with check (true);

create table if not exists mapa_fotos (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references mapa_areas(id) on delete cascade,
  foto_url text not null,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists mapa_fotos_area_id_idx on mapa_fotos (area_id);

alter table mapa_fotos enable row level security;
drop policy if exists "Permitir leitura para todos" on mapa_fotos;
create policy "Permitir leitura para todos" on mapa_fotos for select using (true);
drop policy if exists "Permitir escrita para todos" on mapa_fotos;
create policy "Permitir escrita para todos" on mapa_fotos for all using (true) with check (true);

-- Espaço de armazenamento (Storage) onde as fotos do Mapa da Loja ficam salvas
insert into storage.buckets (id, name, public)
values ('mapa-loja-fotos', 'mapa-loja-fotos', true)
on conflict (id) do nothing;

drop policy if exists "Leitura publica das fotos do mapa da loja" on storage.objects;
create policy "Leitura publica das fotos do mapa da loja"
  on storage.objects for select
  using (bucket_id = 'mapa-loja-fotos');

drop policy if exists "Upload de fotos do mapa da loja para todos" on storage.objects;
create policy "Upload de fotos do mapa da loja para todos"
  on storage.objects for insert
  with check (bucket_id = 'mapa-loja-fotos');

drop policy if exists "Atualizar fotos do mapa da loja para todos" on storage.objects;
create policy "Atualizar fotos do mapa da loja para todos"
  on storage.objects for update
  using (bucket_id = 'mapa-loja-fotos');

drop policy if exists "Remover fotos do mapa da loja para todos" on storage.objects;
create policy "Remover fotos do mapa da loja para todos"
  on storage.objects for delete
  using (bucket_id = 'mapa-loja-fotos');
