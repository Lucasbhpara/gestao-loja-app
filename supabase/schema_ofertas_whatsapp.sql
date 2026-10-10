-- =============================================================================
-- Ofertas para o grupo de WhatsApp — com validação dos gerentes.
--
-- Fluxo:
--   1. Colaborador cria a oferta (sugestões do setor dele)  → status 'pendente'
--      → aviso no celular dos gerentes (administradores)
--   2. Gerente aprova (pode ajustar preço/validade)          → status 'aprovada'
--      → aviso pra Marcela S. disparar no grupo
--      (ou reprova com motivo → aviso pra quem criou)
--   3. Marcela gera o card e envia no grupo                   → enviada_em
--
-- Tabelas:
--   * produto_fotos ......... foto de cada produto (internet ou celular)
--   * ofertas ............... cada oferta (de/por, validade, status, envio)
--   * ofertas_agenda ........ dias fixos de oferta (ex.: terça do FLV)
--
-- Quem dispara no grupo: matrículas em ofertas_disparadores() (hoje a
-- Marcela S., 9734844). Pra trocar, é só mudar a lista na função abaixo e no
-- app (DISPARADORES_OFERTAS em src/data/ofertasApi.ts).
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
  fim date,                                    -- validade da oferta
  origem text not null default 'manual',      -- manual | giro | estoque_alto | validade
  setor text,                                  -- setor da oferta (Açougue, FLV...)
  observacao text,
  status text not null default 'pendente',    -- pendente | aprovada | reprovada
  aprovada_por text,
  aprovada_em timestamptz,
  motivo_reprovacao text,
  agendada_para timestamptz,                   -- quando disparar no grupo (opcional)
  avisado_em timestamptz,
  enviada_em timestamptz,
  enviada_por text,
  criado_por text,
  matricula text,
  criado_em timestamptz not null default now()
);
alter table public.ofertas add column if not exists setor text;
alter table public.ofertas add column if not exists status text not null default 'pendente';
alter table public.ofertas add column if not exists aprovada_por text;
alter table public.ofertas add column if not exists aprovada_em timestamptz;
alter table public.ofertas add column if not exists motivo_reprovacao text;
create index if not exists ofertas_criado_idx on public.ofertas (criado_em desc);
create index if not exists ofertas_status_idx on public.ofertas (status, criado_em desc);
create index if not exists ofertas_codigo_idx on public.ofertas (codigo);

create table if not exists public.ofertas_agenda (
  id uuid primary key default gen_random_uuid(),
  dia_semana int not null check (dia_semana between 0 and 6), -- 0 = domingo
  hora time not null default '09:00',
  titulo text not null,                 -- ex.: Terça do FLV
  setor text,
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
create or replace function public.ofertas_disparadores()
returns text[] language sql immutable as $$ select array['9734844']::text[] $$;

-- Manda um push pra uma lista de colaboradores (por filtro).
create or replace function public.ofertas_push(p_para text, p_matricula text, p_titulo text, p_corpo text, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mensagens jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'to', t.expo_push_token, 'title', p_titulo, 'body', p_corpo, 'sound', 'default', 'data', p_dados)), '[]'::jsonb)
    into mensagens
    from push_tokens t
    join colaboradores c on c.id = t.colaborador_id
   where (p_para = 'gerentes' and c.is_admin)
      or (p_para = 'disparadores' and c.matricula = any (ofertas_disparadores()))
      or (p_para = 'matricula' and c.matricula = p_matricula)
      or (p_para = 'todos');
  if jsonb_array_length(mensagens) > 0 then
    perform net.http_post(url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := mensagens);
  end if;
end;
$$;

-- Avisa na hora: nova oferta pra validar, aprovada, reprovada.
create or replace function public.ofertas_avisar_mudanca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  preco text := 'R$ ' || replace(to_char(new.preco_por, 'FM999990.00'), '.', ',');
begin
  if new.status = 'pendente' and (tg_op = 'INSERT' or old.status is distinct from 'pendente') then
    perform ofertas_push('gerentes', null, '📝 Oferta para validar',
      new.produto || ' por ' || preco || coalesce(' — sugerida por ' || new.criado_por, ''),
      jsonb_build_object('tipo', 'oferta_validar', 'id', new.id));
  elsif new.status = 'aprovada' and (tg_op = 'INSERT' or old.status is distinct from 'aprovada')
        and new.enviada_em is null and (new.agendada_para is null or new.agendada_para <= now()) then
    perform ofertas_push('disparadores', null, '✅ Oferta aprovada — disparar no grupo',
      new.produto || ' por ' || preco || coalesce(' até ' || to_char(new.fim, 'DD/MM'), '') || '. Abra Ofertas no app e envie.',
      jsonb_build_object('tipo', 'oferta_disparar', 'id', new.id));
    new.avisado_em := now();
  elsif new.status = 'reprovada' and tg_op = 'UPDATE' and old.status is distinct from 'reprovada' and new.matricula is not null then
    perform ofertas_push('matricula', new.matricula, '❌ Oferta não aprovada',
      new.produto || coalesce(' — ' || new.motivo_reprovacao, ''),
      jsonb_build_object('tipo', 'oferta_reprovada', 'id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists ofertas_avisar_mudanca on public.ofertas;
create trigger ofertas_avisar_mudanca before insert or update of status on public.ofertas
  for each row execute function public.ofertas_avisar_mudanca();

-- A cada 15 min: ofertas aprovadas com horário marcado + dias fixos da agenda
-- + segunda 8h: lembrete das sugestões do setor.
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
  enviados int := 0;
begin
  for o in
    select * from ofertas
     where status = 'aprovada' and agendada_para is not null and avisado_em is null and enviada_em is null
       and agendada_para <= now()
  loop
    perform ofertas_push('disparadores', null, '📣 Hora de disparar a oferta',
      o.produto || ' por R$ ' || replace(to_char(o.preco_por, 'FM999990.00'), '.', ',') || '. Abra Ofertas no app e envie no grupo.',
      jsonb_build_object('tipo', 'oferta_disparar', 'id', o.id));
    update ofertas set avisado_em = now() where id = o.id;
    enviados := enviados + 1;
  end loop;

  for a in
    select * from ofertas_agenda
     where ativo and dia_semana = extract(dow from agora_local)::int
       and hora <= agora_local::time
       and (ultimo_aviso is null or ultimo_aviso < hoje)
  loop
    perform ofertas_push('todos', null, '🗓️ ' || a.titulo,
      'Dia de oferta no grupo! Abra Ofertas no app e mande suas sugestões' || coalesce(' de ' || a.setor, '') || ' para validação.',
      jsonb_build_object('tipo', 'oferta_agenda', 'id', a.id));
    update ofertas_agenda set ultimo_aviso = hoje where id = a.id;
    enviados := enviados + 1;
  end loop;
  return enviados;
end;
$$;

select cron.unschedule('ulva_ofertas_15min')
 where exists (select 1 from cron.job where jobname = 'ulva_ofertas_15min');
select cron.schedule('ulva_ofertas_15min', '*/15 * * * *', 'select public.notificar_ofertas();');

-- Segunda 8h (11h UTC): lembra os setores que tem sugestão de oferta no app.
select cron.unschedule('ulva_ofertas_sugestoes_segunda')
 where exists (select 1 from cron.job where jobname = 'ulva_ofertas_sugestoes_segunda');
select cron.schedule('ulva_ofertas_sugestoes_segunda', '0 11 * * 1',
  $$select public.ofertas_push('todos', null, '💡 Sugestões de oferta da semana', 'O app separou produtos parados, com estoque alto e perto de vencer do seu setor. Escolha os melhores e mande para validação.', '{"tipo":"oferta_sugestoes"}'::jsonb);$$);

select 'ok' as resultado;
