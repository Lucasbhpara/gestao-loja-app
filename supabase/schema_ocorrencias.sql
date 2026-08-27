-- Ocorrências — colaborador registra um problema (texto + foto opcional)
-- e os administradores acompanham e marcam como resolvida.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.

create table if not exists ocorrencias (
  id uuid primary key default gen_random_uuid(),
  colaborador_nome text not null,
  setor text not null,
  texto text not null,
  foto_url text,
  status text not null default 'aberta' check (status in ('aberta', 'resolvida')),
  resolvida_em timestamptz,
  criado_em timestamptz not null default now()
);

alter table ocorrencias enable row level security;

drop policy if exists "Permitir leitura para todos" on ocorrencias;
create policy "Permitir leitura para todos"
  on ocorrencias for select
  using (true);

drop policy if exists "Permitir escrita para todos" on ocorrencias;
create policy "Permitir escrita para todos"
  on ocorrencias for all
  using (true)
  with check (true);

-- Bucket de fotos das ocorrências (mesmo esquema do Mural de Avisos).
insert into storage.buckets (id, name, public)
values ('ocorrencias-fotos', 'ocorrencias-fotos', true)
on conflict (id) do nothing;

drop policy if exists "Leitura publica das fotos de ocorrencias" on storage.objects;
create policy "Leitura publica das fotos de ocorrencias"
  on storage.objects for select
  using (bucket_id = 'ocorrencias-fotos');

drop policy if exists "Upload de fotos de ocorrencias" on storage.objects;
create policy "Upload de fotos de ocorrencias"
  on storage.objects for insert
  with check (bucket_id = 'ocorrencias-fotos');

drop policy if exists "Atualizacao de fotos de ocorrencias" on storage.objects;
create policy "Atualizacao de fotos de ocorrencias"
  on storage.objects for update
  using (bucket_id = 'ocorrencias-fotos');
