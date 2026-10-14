-- =====================================================================
-- ULVA · Visitas do site ulva.com.br
-- O site grava uma linha por visita (e por clique nos botões dos portais).
-- Não guarda nome, IP nem nada que identifique a pessoa: só a origem
-- (Instagram, LinkedIn, Google...), se é celular ou computador e um código
-- aleatório do navegador para contar visitantes únicos.
-- =====================================================================

create table if not exists public.site_visitas (
  id bigserial primary key,
  criado_em timestamptz not null default now(),
  evento text not null default 'visita',
  pagina text,
  origem text,
  utm_source text,
  utm_campaign text,
  dispositivo text,
  visitante text,
  novo boolean not null default false
);
create index if not exists site_visitas_criado_em on public.site_visitas (criado_em desc);

alter table public.site_visitas enable row level security;

-- O site (público) só consegue INSERIR, e só linhas pequenas e do tipo esperado.
drop policy if exists site_visitas_inserir on public.site_visitas;
create policy site_visitas_inserir on public.site_visitas for insert
  with check (
    evento in ('visita', 'clique_portal_ulva', 'clique_portal_alcateia', 'clique_contato')
    and coalesce(length(pagina), 0) <= 200
    and coalesce(length(origem), 0) <= 60
    and coalesce(length(utm_source), 0) <= 60
    and coalesce(length(utm_campaign), 0) <= 80
    and coalesce(length(dispositivo), 0) <= 20
    and coalesce(length(visitante), 0) <= 40
  );

-- O portal lê para montar o relatório.
drop policy if exists site_visitas_ler on public.site_visitas;
create policy site_visitas_ler on public.site_visitas for select using (true);

grant select, insert on public.site_visitas to anon, authenticated;
grant usage, select on sequence public.site_visitas_id_seq to anon, authenticated;
