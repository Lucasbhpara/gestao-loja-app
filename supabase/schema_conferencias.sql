-- Conferência de nota fiscal — começa só com o setor FLV.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
--
-- Como usar: quando você mandar uma nota fiscal (foto ou PDF) no chat, eu
-- devolvo um script pronto que cria a conferência com os itens (código
-- interno, produto, quantidade esperada) — é só colar e rodar, do mesmo
-- jeito que já fazemos com Perdas & Quebras. A partir daí ela aparece pro
-- encarregado do FLV conferir, item por item, direto no celular.

create table if not exists conferencias (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  setor text not null default 'flv',
  status text not null default 'pendente' check (status in ('pendente', 'concluida')),
  criada_por_nome text not null,
  conferida_por_nome text,
  criado_em timestamptz not null default now(),
  concluida_em timestamptz
);

create table if not exists conferencia_itens (
  id uuid primary key default gen_random_uuid(),
  conferencia_id uuid not null references conferencias(id) on delete cascade,
  codigo_interno text,
  produto text not null,
  quantidade_esperada numeric not null,
  quantidade_real numeric,
  status text not null default 'pendente' check (status in ('pendente', 'ok', 'divergencia')),
  foto_url text,
  conferido_em timestamptz
);

create index if not exists conferencia_itens_conferencia_id_idx on conferencia_itens (conferencia_id);

alter table conferencias enable row level security;
alter table conferencia_itens enable row level security;

drop policy if exists "Permitir leitura para todos" on conferencias;
create policy "Permitir leitura para todos" on conferencias for select using (true);
drop policy if exists "Permitir escrita para todos" on conferencias;
create policy "Permitir escrita para todos" on conferencias for all using (true) with check (true);

drop policy if exists "Permitir leitura para todos" on conferencia_itens;
create policy "Permitir leitura para todos" on conferencia_itens for select using (true);
drop policy if exists "Permitir escrita para todos" on conferencia_itens;
create policy "Permitir escrita para todos" on conferencia_itens for all using (true) with check (true);

-- Bucket de fotos das divergências (mesmo esquema do Mural de Avisos).
insert into storage.buckets (id, name, public)
values ('conferencias-fotos', 'conferencias-fotos', true)
on conflict (id) do nothing;

drop policy if exists "Leitura publica das fotos de conferencias" on storage.objects;
create policy "Leitura publica das fotos de conferencias"
  on storage.objects for select
  using (bucket_id = 'conferencias-fotos');

drop policy if exists "Upload de fotos de conferencias" on storage.objects;
create policy "Upload de fotos de conferencias"
  on storage.objects for insert
  with check (bucket_id = 'conferencias-fotos');
