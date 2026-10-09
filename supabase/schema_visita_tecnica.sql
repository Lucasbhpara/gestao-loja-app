-- Visita Técnica (checklist do Técnico Veterinário) — ULVA, Loja 327.
-- JÁ APLICADO no projeto Lucas-Gestão-SBH em 09/10/2026 (migração
-- "visita_tecnica_veterinario"). Guardado aqui só como referência.
-- Tabelas novas e isoladas; não alteram avaliacao_* (Checklist de Setor).
-- As 178 perguntas (7 setores) vieram da planilha
-- "Checklist_Tecnico_Veterinario_ALCATEIA.xlsx", baseada no Manual de Boas
-- Práticas e POPs (Loja 296, rev. 12.26) — cadastradas direto no banco e
-- editáveis (ativar/desativar) pela aba "Visita Técnica" do Portal.

create table if not exists public.visita_tecnica_perguntas (
  id uuid primary key default gen_random_uuid(),
  setor text not null check (setor in ('acougue','frios','padaria','deposito','mercearia','flv','geral')),
  ordem integer not null default 0,
  grupo text,
  texto text not null,
  foto_obrigatoria boolean not null default false,
  critico boolean not null default false,
  base_manual text,
  como_verificar text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists visita_tecnica_perguntas_setor_idx on public.visita_tecnica_perguntas (setor, ordem);

create table if not exists public.visitas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  setor text not null check (setor in ('acougue','frios','padaria','deposito','mercearia','flv','geral')),
  status text not null default 'em_andamento' check (status in ('em_andamento','finalizada')),
  veterinario_nome text not null,
  veterinario_matricula text,
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  pontos_possiveis integer,
  pontos_realizados integer,
  nao_conformidades integer,
  criticos_nao_conformes integer,
  aproveitamento numeric,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  passos_contados integer,
  localizacao_lat double precision,
  localizacao_lng double precision,
  localizacao_endereco text
);
create index if not exists visitas_tecnicas_setor_idx on public.visitas_tecnicas (setor, status, finalizada_em desc);

create table if not exists public.visita_tecnica_respostas (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references public.visitas_tecnicas(id) on delete cascade,
  pergunta_id uuid references public.visita_tecnica_perguntas(id) on delete set null,
  pergunta_texto text not null,
  critico boolean not null default false,
  resposta text not null check (resposta in ('sim','nao','na')),
  justificativa text,
  foto_url text,
  respondida_em timestamptz not null default now(),
  unique (visita_id, pergunta_id)
);

alter table public.tarefas add column if not exists visita_tecnica_id uuid references public.visitas_tecnicas(id) on delete set null;

alter table public.visita_tecnica_perguntas enable row level security;
alter table public.visitas_tecnicas enable row level security;
alter table public.visita_tecnica_respostas enable row level security;
create policy visita_tecnica_perguntas_all on public.visita_tecnica_perguntas for all using (true) with check (true);
create policy visitas_tecnicas_all on public.visitas_tecnicas for all using (true) with check (true);
create policy visita_tecnica_respostas_all on public.visita_tecnica_respostas for all using (true) with check (true);

insert into storage.buckets (id, name, public) values ('visita-tecnica-fotos','visita-tecnica-fotos', true)
on conflict (id) do nothing;
create policy visita_tecnica_fotos_insert on storage.objects for insert with check (bucket_id = 'visita-tecnica-fotos');
create policy visita_tecnica_fotos_select on storage.objects for select using (bucket_id = 'visita-tecnica-fotos');
