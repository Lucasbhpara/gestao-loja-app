-- Pedido CD (extensão do Chrome "ULVA – Pedido CD")
--
-- Cada vez que a extensão termina (ou para) de digitar o pedido de uma coleta
-- de ruptura no Portal 360, ela grava uma linha aqui. Assim que a linha entra,
-- o banco manda uma notificação push no celular do colaborador indicado em
-- "destinatario_nome" (o mesmo esquema de push do Mural de Avisos).

create extension if not exists pg_net with schema extensions;

create table if not exists pedido_cd_envios (
  id uuid primary key default gen_random_uuid(),
  coleta_id uuid references ruptura_coletas(id) on delete set null,
  grupo_nome text,
  status text not null check (status in ('pronto', 'parou', 'erro', 'vazio')),
  itens_digitados integer not null default 0,
  itens_ja_estavam integer not null default 0,
  itens_problema integer not null default 0,
  caixas_total integer not null default 0,
  mensagem text,
  detalhe jsonb,
  destinatario_nome text,
  criado_em timestamptz not null default now()
);

alter table pedido_cd_envios enable row level security;

drop policy if exists pedido_cd_envios_tudo on pedido_cd_envios;
create policy pedido_cd_envios_tudo on pedido_cd_envios for all using (true) with check (true);

create or replace function notificar_pedido_cd()
returns trigger
language plpgsql
security definer
as $$
declare
  destinatario record;
  titulo text;
begin
  titulo := case new.status
    when 'pronto' then '✅ Pedido pronto – ' || coalesce(new.grupo_nome, 'ruptura')
    when 'parou'  then '⚠ Pedido parado – ' || coalesce(new.grupo_nome, 'ruptura')
    when 'vazio'  then 'Pedido CD – nada para pedir'
    else '❌ Pedido CD – erro'
  end;

  for destinatario in
    select distinct pt.expo_push_token
    from colaboradores c
    join push_tokens pt on pt.colaborador_id = c.id
    where c.nome = new.destinatario_nome
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'to', destinatario.expo_push_token,
        'title', titulo,
        'body', coalesce(new.mensagem, ''),
        'sound', 'default',
        'priority', 'high'
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists pedido_cd_envios_notificar on pedido_cd_envios;
create trigger pedido_cd_envios_notificar
  after insert on pedido_cd_envios
  for each row
  execute function notificar_pedido_cd();
