-- =====================================================================
-- ULVA · Confeitaria › Estoque de insumos
-- Contagem inicial; a produção (lote lançado) tira do estoque o que a ficha
-- técnica usa; a compra (cupom ou à mão) põe no estoque. Todo dia às 16:30
-- (horário de Brasília) quem tem setor 'confeitaria' recebe uma notificação
-- se algum item estiver abaixo do mínimo.
-- Rodar uma vez no SQL Editor do Supabase (depois de confeitaria.sql).
-- =====================================================================

create table if not exists public.conf_estoque (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  chave text not null,                 -- nome normalizado (sem acento, minúsculo)
  unidade text not null default 'un',  -- g | ml | un
  quantidade numeric(14,3) not null default 0,
  minimo numeric(14,3) not null default 0,
  embalagem_qtd numeric(14,3),         -- quanto vem numa embalagem (ex.: 395 g)
  embalagem_texto text,
  atualizado_em timestamptz not null default now(),
  constraint conf_estoque_chave_unica unique (chave)
);

create table if not exists public.conf_estoque_mov (
  id uuid primary key default gen_random_uuid(),
  estoque_id uuid not null references public.conf_estoque(id) on delete cascade,
  criado_em timestamptz not null default now(),
  tipo text not null check (tipo in ('contagem', 'compra', 'producao', 'ajuste', 'estorno')),
  quantidade numeric(14,3) not null,   -- + entrada / − saída (na contagem: o novo saldo)
  saldo_depois numeric(14,3),
  referencia text,
  origem_id uuid                       -- id da compra ou do lote de produção
);
create index if not exists conf_estoque_mov_item on public.conf_estoque_mov (estoque_id, criado_em desc);
create index if not exists conf_estoque_mov_origem on public.conf_estoque_mov (origem_id);

do $$
declare t text;
begin
  foreach t in array array['conf_estoque','conf_estoque_mov'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_tudo', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_tudo', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- Movimenta o estoque de um item e registra o histórico, numa operação só.
-- Na contagem, p_qtd é o novo saldo; nos outros tipos, é a entrada (+) ou saída (−).
create or replace function public.conf_movimentar(p_estoque uuid, p_tipo text, p_qtd numeric, p_referencia text default null, p_origem uuid default null)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $$
declare novo numeric;
begin
  if p_tipo = 'contagem' then
    update conf_estoque set quantidade = p_qtd, atualizado_em = now() where id = p_estoque returning quantidade into novo;
  else
    update conf_estoque set quantidade = quantidade + p_qtd, atualizado_em = now() where id = p_estoque returning quantidade into novo;
  end if;
  insert into conf_estoque_mov (estoque_id, tipo, quantidade, saldo_depois, referencia, origem_id)
  values (p_estoque, p_tipo, p_qtd, novo, p_referencia, p_origem);
  return novo;
end;
$$;

-- Desfaz o que uma compra ou um lote mexeu no estoque (quando é apagado).
create or replace function public.conf_estornar(p_origem uuid, p_referencia text default null)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; n int := 0;
begin
  for r in
    select estoque_id, sum(quantidade) as total
      from conf_estoque_mov
     where origem_id = p_origem and tipo in ('compra', 'producao')
     group by estoque_id
  loop
    if r.total <> 0 then
      perform conf_movimentar(r.estoque_id, 'estorno', -r.total, coalesce(p_referencia, 'Estorno'), null);
      n := n + 1;
    end if;
  end loop;
  update conf_estoque_mov set origem_id = null where origem_id = p_origem;
  return n;
end;
$$;

grant execute on function public.conf_movimentar(uuid, text, numeric, text, uuid) to anon, authenticated;
grant execute on function public.conf_estornar(uuid, text) to anon, authenticated;

-- Aviso diário de estoque baixo (push no celular de quem é da confeitaria)
create or replace function public.conf_alerta_estoque_baixo()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  qtd int;
  nomes text;
  mensagens jsonb;
begin
  select count(*), string_agg(nome, ', ' order by (quantidade / nullif(minimo, 0)), nome)
    into qtd, nomes
    from (select nome, quantidade, minimo from conf_estoque where minimo > 0 and quantidade <= minimo
          order by (quantidade / nullif(minimo, 0)), nome limit 6) x;
  select count(*) into qtd from conf_estoque where minimo > 0 and quantidade <= minimo;
  if qtd = 0 then return; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'to', t.expo_push_token,
           'title', '🧁 Hora de fazer as compras',
           'body', qtd || case when qtd = 1 then ' item está' else ' itens estão' end || ' com estoque baixo: ' || nomes || case when qtd > 6 then '…' else '' end,
           'sound', 'default',
           'data', jsonb_build_object('tipo', 'conf_estoque')
         )), '[]'::jsonb)
    into mensagens
    from (select distinct pt.expo_push_token
            from push_tokens pt
            join colaboradores c on c.id = pt.colaborador_id
           where c.setor = 'confeitaria') t;

  if jsonb_array_length(mensagens) > 0 then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := mensagens
    );
  end if;
end;
$$;

-- 16:30 em Brasília = 19:30 UTC
select cron.unschedule('conf_estoque_baixo_1630') where exists (select 1 from cron.job where jobname = 'conf_estoque_baixo_1630');
select cron.schedule('conf_estoque_baixo_1630', '30 19 * * *', 'select public.conf_alerta_estoque_baixo()');

select 'estoque da confeitaria pronto' as ok;
