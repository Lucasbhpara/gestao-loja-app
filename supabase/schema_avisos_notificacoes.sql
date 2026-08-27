-- Notificação automática do Mural de Avisos.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- (mesmo processo dos outros arquivos supabase/schema*.sql que você já rodou)
--
-- IMPORTANTE: precisa ter rodado antes o `schema_notificacoes.sql` (é lá que
-- a tabela "push_tokens" é criada) e o `schema_avisos.sql`. Se você já rodou
-- os dois — e você já rodou, porque estão na lista do README antes deste —
-- pode rodar este arquivo direto.
--
-- O que isso cria: assim que alguém publica um aviso novo, todo colaborador
-- que pode ver aquele aviso (do setor escolhido, ou todo mundo se for "Todos
-- os setores", mais os administradores) recebe uma notificação no celular na
-- hora — mesmo com o app fechado. Quem publicou o aviso não recebe
-- notificação do próprio aviso. Avisos marcados como "Urgente" aparecem com
-- um título diferente na notificação, pra chamar mais atenção.

create extension if not exists pg_net with schema extensions;

create or replace function notificar_novo_aviso()
returns trigger
language plpgsql
security definer
as $$
declare
  destinatario record;
  nome_setor text;
  titulo_notificacao text;
begin
  nome_setor := case new.setor
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
    when null then 'Geral'
    else new.setor
  end;

  titulo_notificacao := case when new.urgente then '⚠ Aviso urgente' else 'Novo aviso no mural' end;

  for destinatario in
    select distinct pt.expo_push_token
    from colaboradores c
    join push_tokens pt on pt.colaborador_id = c.id
    where c.nome is distinct from new.criado_por_nome
      and (new.setor is null or c.setor = new.setor or c.is_admin = true)
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'to', destinatario.expo_push_token,
        'title', titulo_notificacao,
        'body', new.titulo || ' — ' || nome_setor
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists avisos_notificar_after_insert on avisos;

create trigger avisos_notificar_after_insert
  after insert on avisos
  for each row
  execute function notificar_novo_aviso();
