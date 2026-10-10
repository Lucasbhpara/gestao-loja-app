-- =============================================================================
-- Ofertas para o grupo de WhatsApp.
--
--   * produto_fotos ......... foto de cada produto (buscada na internet pelo
--                             código de barras ou tirada pelo celular)
--   * ofertas ............... cada oferta: de/por, validade, de onde veio
--                             (manual, giro, validade, jornal), envio e agenda
--   * ofertas_agenda ........ dias fixos de oferta (ex.: terça do FLV) — avisa
--                             no horário pra montar e enviar
--   * notificar_ofertas() ... roda a cada 15 min: avisa ofertas agendadas e
--                             os dias fixos da agenda
--
-- Pode rodar mais de uma vez sem duplicar nada.
-- =============================================================================

-- Fotos -----------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('produtos-fotos', 'produtos-fotos', true)
on conflict (id) do nothing;

drop policy if exists "Leitura publica das fotos de produtos" on storage.objects;
create policy "Leitura publica das fotos de produtos" on storage.objects for select using (bucket_id = 'produtos-fotos');
drop policy if exists "Upload de fotos de produtos" on storage.objects;
create policy "Upload de fotos de produtos" on storage.objects for insert with check (bucket_id = 'produtos-fotos');
drop policy if exists "Troca de fotos de produtos" on storage.objects;
create policy "Troca de fotos de produtos" on storage.objects for update using (bucket_id = 'produtos-fotos');

create table if not exists public.produto_fotos (
  codigo text primary key,          -- código interno
  codigo_barras text,
  foto_url text not null,
  origem text not null default 'camera',  -- camera | internet | galeria
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

-- Ofertas ---------------------------------------------------------------------
create table if not exists public.ofertas (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  codigo_barras text,
  produto text not null,
  unidade_venda text not null default 'un',   -- un | kg | pct ...
  preco_de numeric,
  preco_por numeric not null,
  inicio date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  fim date,
  origem text not null default 'manual',      -- manual | giro | validade | jornal
  observacao text,
  agendada_para timestamptz,                   -- aviso pra enviar no grupo
  avisado_em timestamptz,
  enviada_em timestamptz,
  enviada_por text,
  criado_por text,
  matricula text,
  criado_em timestamptz not null default now()
);
create index if not exists ofertas_criado_idx on public.ofertas (criado_em desc);
create index if not exists ofertas_agendada_idx on public.ofertas (agendada_para) where avisado_em is null;
create index if not exists ofertas_codigo_idx on public.ofertas (codigo);

create table if not exists public.ofertas_agenda (
  id uuid primary key default gen_random_uuid(),
  dia_semana int not null check (dia_semana between 0 and 6), -- 0 = domingo
  hora time not null default '09:00',
  titulo text not null,                 -- ex.: Terça do FLV
  setor text,                           -- setor das sugestões (opcional)
  ativo boolean not null default true,
  ultimo_aviso date,
  criado_por text,
  criado_em timestamptz not null default now()
);

alter table public.produto_fotos enable row level security;
alter table public.ofertas enable row level security;
alter table public.ofertas_agenda enable row level security;
drop policy if exists produto_fotos_tudo on public.produto_fotos;
drop policy if exists ofertas_tudo on public.ofertas;
drop policy if exists ofertas_agenda_tudo on public.ofertas_agenda;
create policy produto_fotos_tudo on public.produto_fotos for all using (true) with check (true);
create policy ofertas_tudo on public.ofertas for all using (true) with check (true);
create policy ofertas_agenda_tudo on public.ofertas_agenda for all using (true) with check (true);
grant select, insert, update, delete on public.produto_fotos, public.ofertas, public.ofertas_agenda to anon, authenticated;

-- Avisos (push) ----------------------------------------------------------------
create or replace function public.notificar_ofertas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  agora_local timestamp := now() at time zone 'America/Sao_Paulo';
  hoje date := agora_local::date;
  o record;
  a record;
  mensagens jsonb;
  enviados int := 0;
begin
  -- 1) Ofertas agendadas: avisa quem criou (e os administradores)
  for o in
    select * from ofertas
     where agendada_para is not null and avisado_em is null and enviada_em is null
       and agendada_para <= now()
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'to', t.expo_push_token,
             'title', '📣 Hora de postar a oferta',
             'body', o.produto || ' por R$ ' || replace(to_char(o.preco_por, 'FM999990.00'), '.', ',') || ' — abra o app e envie no grupo.',
             'sound', 'default',
             'data', jsonb_build_object('tipo', 'oferta', 'id', o.id)
           )), '[]'::jsonb)
      into mensagens
      from push_tokens t
      join colaboradores c on c.id = t.colaborador_id
     where c.matricula = o.matricula or c.is_admin;
    if jsonb_array_length(mensagens) > 0 then
      perform net.http_post(url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
        body := mensagens);
    end if;
    update ofertas set avisado_em = now() where id = o.id;
    enviados := enviados + 1;
  end loop;

  -- 2) Dias fixos da agenda: avisa todo mundo uma vez no dia, a partir do horário
  for a in
    select * from ofertas_agenda
     where ativo and dia_semana = extract(dow from agora_local)::int
       and hora <= agora_local::time
       and (ultimo_aviso is null or ultimo_aviso < hoje)
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'to', t.expo_push_token,
             'title', '🗓️ ' || a.titulo,
             'body', 'Dia de oferta no grupo! Abra Ofertas no app — já tem sugestões prontas' || coalesce(' de ' || a.setor, '') || '.',
             'sound', 'default',
             'data', jsonb_build_object('tipo', 'oferta_agenda', 'id', a.id)
           )), '[]'::jsonb)
      into mensagens
      from push_tokens t;
    if jsonb_array_length(mensagens) > 0 then
      perform net.http_post(url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
        body := mensagens);
    end if;
    update ofertas_agenda set ultimo_aviso = hoje where id = a.id;
    enviados := enviados + 1;
  end loop;
  return enviados;
end;
$$;

select cron.unschedule('ulva_ofertas_15min')
 where exists (select 1 from cron.job where jobname = 'ulva_ofertas_15min');
select cron.schedule('ulva_ofertas_15min', '*/15 * * * *', 'select public.notificar_ofertas();');

select 'ok' as resultado;
