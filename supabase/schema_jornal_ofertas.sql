-- Jornal de Ofertas — nona parte do banco de dados.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- (mesmo processo dos outros arquivos supabase/schema*.sql que você já rodou)
--
-- O que isso cria:
-- 1) jornal_ofertas — histórico dos PDFs do encarte de ofertas enviados.
--    O portal e o app sempre mostram o mais recente (o de "enviado_em" mais
--    novo) — não precisa apagar os antigos, eles só ficam de histórico.
-- 2) O espaço de armazenamento (Storage) onde esses PDFs ficam salvos.
--
-- Quem sobe um jornal novo é o administrador, pelo portal (janelinha no
-- canto da tela, com um botão "Atualizar jornal"). O app só mostra o jornal
-- atual — qualquer colaborador consulta, numa bolha flutuante que abre por
-- cima de qualquer tela e pode ser minimizada de volta.

create table if not exists jornal_ofertas (
  id uuid primary key default gen_random_uuid(),
  arquivo_url text not null,
  nome_arquivo text,
  enviado_em timestamptz not null default now()
);

alter table jornal_ofertas enable row level security;
drop policy if exists "Permitir leitura para todos" on jornal_ofertas;
create policy "Permitir leitura para todos" on jornal_ofertas for select using (true);
drop policy if exists "Permitir escrita para todos" on jornal_ofertas;
create policy "Permitir escrita para todos" on jornal_ofertas for all using (true) with check (true);

-- Espaço de armazenamento (Storage) onde os PDFs do jornal de ofertas ficam salvos
insert into storage.buckets (id, name, public)
values ('jornal-ofertas', 'jornal-ofertas', true)
on conflict (id) do nothing;

drop policy if exists "Leitura publica dos jornais de ofertas" on storage.objects;
create policy "Leitura publica dos jornais de ofertas"
  on storage.objects for select
  using (bucket_id = 'jornal-ofertas');

drop policy if exists "Upload de jornais de ofertas para todos" on storage.objects;
create policy "Upload de jornais de ofertas para todos"
  on storage.objects for insert
  with check (bucket_id = 'jornal-ofertas');

drop policy if exists "Atualizar jornais de ofertas para todos" on storage.objects;
create policy "Atualizar jornais de ofertas para todos"
  on storage.objects for update
  using (bucket_id = 'jornal-ofertas');

drop policy if exists "Remover jornais de ofertas para todos" on storage.objects;
create policy "Remover jornais de ofertas para todos"
  on storage.objects for delete
  using (bucket_id = 'jornal-ofertas');
