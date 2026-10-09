-- =============================================================================
-- Validade dos documentos da loja (Visita Técnica → Geral e Documentos).
--
-- O veterinário informa a data de vencimento de cada documento por unidade.
-- Todo dia às 9h (Brasília) o banco confere e manda push pro(s) veterinário(s)
-- quando faltar 60, 30 e 15 dias, e no dia em que vencer — uma vez por faixa.
-- O envio é direto pra API de push da Expo (pg_net), sem edge function.
-- =============================================================================

create table if not exists public.documentos_validade (
  id uuid primary key default gen_random_uuid(),
  unidade text not null,
  documento text not null,
  data_validade date not null,
  atualizado_por text,
  atualizado_em timestamptz not null default now(),
  unique (unidade, documento)
);
alter table public.documentos_validade enable row level security;
drop policy if exists documentos_validade_tudo on public.documentos_validade;
create policy documentos_validade_tudo on public.documentos_validade for all using (true) with check (true);
grant select, insert, update, delete on public.documentos_validade to anon, authenticated;

-- Registro dos avisos já enviados (pra não repetir a mesma faixa).
create table if not exists public.documentos_validade_avisos (
  unidade text not null,
  documento text not null,
  data_validade date not null,
  faixa text not null, -- '60' | '30' | '15' | 'vencido'
  enviado_em timestamptz not null default now(),
  primary key (unidade, documento, data_validade, faixa)
);
alter table public.documentos_validade_avisos enable row level security;
drop policy if exists documentos_validade_avisos_ler on public.documentos_validade_avisos;
create policy documentos_validade_avisos_ler on public.documentos_validade_avisos for select using (true);

create or replace function public.notificar_documentos_vencendo()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  d record;
  faixa text;
  dias int;
  titulo text;
  corpo text;
  mensagens jsonb;
  enviados int := 0;
begin
  for d in select * from documentos_validade loop
    dias := d.data_validade - hoje;
    faixa := case
      when dias < 0 then null              -- já vencido antes: o aviso 'vencido' sai no dia
      when dias = 0 then 'vencido'
      when dias <= 15 then '15'
      when dias <= 30 then '30'
      when dias <= 60 then '60'
      else null
    end;
    continue when faixa is null;

    insert into documentos_validade_avisos (unidade, documento, data_validade, faixa)
    values (d.unidade, d.documento, d.data_validade, faixa)
    on conflict do nothing;
    continue when not found;

    titulo := case when faixa = 'vencido'
      then '⛔ ' || d.documento || ' vence hoje'
      else '📄 ' || d.documento || ' vence em ' || dias || ' dias' end;
    corpo := 'Loja ' || d.unidade || ' · vencimento em ' || to_char(d.data_validade, 'DD/MM/YYYY') || '. Providencie a renovação.';

    select coalesce(jsonb_agg(jsonb_build_object(
             'to', t.expo_push_token,
             'title', titulo,
             'body', corpo,
             'sound', 'default',
             'data', jsonb_build_object('tipo', 'documento_validade', 'unidade', d.unidade, 'documento', d.documento)
           )), '[]'::jsonb)
      into mensagens
      from push_tokens t
      join colaboradores c on c.id = t.colaborador_id
     where lower(coalesce(c.funcao, '')) ~ '(veterin|respons.vel t.cnico)';

    if jsonb_array_length(mensagens) > 0 then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
        body := mensagens
      );
    end if;
    enviados := enviados + 1;
  end loop;
  return enviados;
end;
$$;

-- Todo dia às 9h de Brasília (12h UTC).
select cron.unschedule('ulva_documentos_validade_09h')
 where exists (select 1 from cron.job where jobname = 'ulva_documentos_validade_09h');
select cron.schedule('ulva_documentos_validade_09h', '0 12 * * *', 'select public.notificar_documentos_vencendo();');
