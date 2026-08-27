-- Notificações de Validade — quinta parte do banco de dados.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- (mesmo processo dos outros arquivos supabase/schema*.sql que você já rodou)
--
-- O que isso cria:
-- 1) A tabela que guarda o "token" de notificação de cada colaborador
--    (gerado pelo próprio celular quando ele faz login com notificações
--    permitidas).
-- 2) Uma coluna de controle em "validades" pra não avisar o mesmo produto
--    duas vezes.
-- 3) Uma função que verifica produtos vencendo em até 3 dias e manda
--    notificação pro setor responsável (mais administradores e a função
--    A.P.P).
-- 4) O agendamento pra essa função rodar sozinha, todo dia, sem precisar
--    de nenhum servidor externo — o próprio banco de dados cuida disso.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores(id) on delete cascade,
  expo_push_token text not null,
  atualizado_em timestamptz not null default now(),
  unique (colaborador_id, expo_push_token)
);

alter table push_tokens enable row level security;

create policy "Permitir leitura para todos"
  on push_tokens for select
  using (true);

create policy "Permitir escrita para todos"
  on push_tokens for all
  using (true)
  with check (true);

alter table validades add column if not exists notificado boolean not null default false;

create or replace function verificar_validades_vencendo()
returns void
language plpgsql
security definer
as $$
declare
  v record;
  destinatario record;
  nome_setor text;
begin
  for v in
    select *
    from validades
    where notificado = false
      and data_validade >= current_date
      and data_validade <= current_date + interval '3 days'
  loop
    nome_setor := case v.setor
      when 'gerencia' then 'Gerência'
      when 'cpd' then 'CPD'
      when 'acougue' then 'Açougue'
      when 'frios' then 'Frios'
      when 'padaria' then 'Padaria'
      when 'flv' then 'FLV'
      when 'mercearia' then 'Mercearia'
      when 'frente-caixa' then 'Frente de Caixa'
      when 'deposito' then 'Depósito'
      when 'prevencao' then 'Prevenção'
      else v.setor
    end;

    for destinatario in
      select distinct pt.expo_push_token
      from colaboradores c
      join push_tokens pt on pt.colaborador_id = c.id
      where c.setor = v.setor or c.is_admin = true or c.funcao = 'A.P.P'
    loop
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'to', destinatario.expo_push_token,
          'title', 'Produto vencendo',
          'body', v.produto || ' vence em ' || (v.data_validade - current_date)::text ||
                  ' dia(s) — ' || nome_setor
        )
      );
    end loop;

    update validades set notificado = true where id = v.id;
  end loop;
end;
$$;

-- Remove um agendamento anterior com esse nome, se já existir (deixa
-- seguro rodar esse arquivo mais de uma vez).
do $$
declare
  j record;
begin
  for j in select jobid from cron.job where jobname = 'verificar-validades-diario' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- Roda todo dia às 8h no horário de Brasília (11:00 UTC).
select cron.schedule(
  'verificar-validades-diario',
  '0 11 * * *',
  $$select verificar_validades_vencendo();$$
);
