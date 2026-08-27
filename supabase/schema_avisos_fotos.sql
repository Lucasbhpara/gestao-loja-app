-- Mural de Avisos — fotos + visibilidade de quem abriu
-- Rode DEPOIS de já ter rodado supabase/schema_avisos.sql uma vez. Esse
-- script é seguro de rodar mais de uma vez (não duplica nada).

-- Foto anexada ao aviso (opcional)
alter table avisos add column if not exists foto_url text;

-- Espaço de armazenamento (Storage) onde as fotos dos avisos ficam salvas
insert into storage.buckets (id, name, public)
values ('avisos-fotos', 'avisos-fotos', true)
on conflict (id) do nothing;

drop policy if exists "Leitura publica das fotos de avisos" on storage.objects;
create policy "Leitura publica das fotos de avisos"
  on storage.objects for select
  using (bucket_id = 'avisos-fotos');

drop policy if exists "Upload de fotos de avisos para todos" on storage.objects;
create policy "Upload de fotos de avisos para todos"
  on storage.objects for insert
  with check (bucket_id = 'avisos-fotos');

drop policy if exists "Atualizar fotos de avisos para todos" on storage.objects;
create policy "Atualizar fotos de avisos para todos"
  on storage.objects for update
  using (bucket_id = 'avisos-fotos');

-- Quem já abriu cada aviso (o app registra sozinho, sem o colaborador
-- precisar fazer nada — é só entrar no Mural de Avisos).
create table if not exists avisos_visualizacoes (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references avisos(id) on delete cascade,
  colaborador_nome text not null,
  visualizado_em timestamptz not null default now(),
  unique (aviso_id, colaborador_nome)
);
create index if not exists avisos_visualizacoes_aviso_idx on avisos_visualizacoes (aviso_id);

alter table avisos_visualizacoes enable row level security;
drop policy if exists "Permitir leitura para todos" on avisos_visualizacoes;
create policy "Permitir leitura para todos" on avisos_visualizacoes for select using (true);
drop policy if exists "Permitir escrita para todos" on avisos_visualizacoes;
create policy "Permitir escrita para todos" on avisos_visualizacoes for all using (true) with check (true);
