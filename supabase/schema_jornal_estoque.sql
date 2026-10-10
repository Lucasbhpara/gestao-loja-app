-- =============================================================================
-- Estoque do Jornal — liga os produtos do jornal de ofertas (quinzenal) aos
-- produtos do estoque da loja e avisa o que vai acabar antes do fim do jornal.
--
--   * jornal_campanhas ....... cada jornal (título, início, fim)
--   * jornal_itens ........... os itens do jornal ("LAVA ROUPAS OMO 3L")
--   * jornal_item_produtos ... os produtos do estoque ligados a cada item
--                              (todas as fragrâncias/sabores). origem:
--                              'auto' (o sistema ligou), 'manual' (alguém
--                              adicionou) ou 'sugestao' (ainda falta confirmar
--                              — não entra no total)
--   * jornal_itens_status .... (view) estoque total, venda/dia, se vai faltar
--
-- Estoque = Estoque Loja (planilha). Venda = vendas importadas no Portal.
-- Pode rodar mais de uma vez sem duplicar nada.
-- =============================================================================

create table if not exists public.jornal_campanhas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  inicio date not null,
  fim date not null,
  arquivo_nome text,
  criado_por text,
  criado_em timestamptz not null default now()
);

create table if not exists public.jornal_itens (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.jornal_campanhas(id) on delete cascade,
  ordem int not null default 0,
  descricao text not null,
  preco numeric,                 -- preço do jornal (opcional)
  estoque_minimo numeric,        -- alerta manual (opcional)
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists jornal_itens_campanha_idx on public.jornal_itens (campanha_id, ordem);

create table if not exists public.jornal_item_produtos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.jornal_itens(id) on delete cascade,
  codigo text,                   -- código interno (pode faltar no Estoque Loja)
  produto text not null,
  origem text not null default 'auto',   -- auto | manual | sugestao
  score numeric,
  criado_por text,
  criado_em timestamptz not null default now(),
  unique (item_id, produto)
);
create index if not exists jornal_item_produtos_item_idx on public.jornal_item_produtos (item_id);

alter table public.jornal_campanhas enable row level security;
alter table public.jornal_itens enable row level security;
alter table public.jornal_item_produtos enable row level security;
drop policy if exists jornal_campanhas_tudo on public.jornal_campanhas;
drop policy if exists jornal_itens_tudo on public.jornal_itens;
drop policy if exists jornal_item_produtos_tudo on public.jornal_item_produtos;
create policy jornal_campanhas_tudo on public.jornal_campanhas for all using (true) with check (true);
create policy jornal_itens_tudo on public.jornal_itens for all using (true) with check (true);
create policy jornal_item_produtos_tudo on public.jornal_item_produtos for all using (true) with check (true);
grant select, insert, update, delete on public.jornal_campanhas, public.jornal_itens, public.jornal_item_produtos to anon, authenticated;

-- Situação de cada item ---------------------------------------------------------
-- venda/dia em unidades ≈ soma, produto a produto, de (venda R$ dos últimos 14 dias ÷ preço) ÷ 14
-- necessário até o fim = venda/dia × dias que faltam do jornal
create or replace view public.jornal_itens_status as
with hoje as (
  select (now() at time zone 'America/Sao_Paulo')::date as d
),
ult as (
  select max(data_venda) as d from public.vendas_diarias
),
links as (
  select l.item_id, l.codigo, l.produto,
         coalesce(e.quantidade, 0)::numeric as qtd, e.preco_venda as preco
    from public.jornal_item_produtos l
    left join lateral (
      select x.quantidade, x.preco_venda
        from public.estoque_loja_itens x
       where (l.codigo is not null and x.codigo_interno = l.codigo)
          or (l.codigo is null and x.produto = l.produto)
       limit 1
    ) e on true
   where l.origem <> 'sugestao'
),
est as (
  select item_id, count(*) as produtos, sum(greatest(qtd, 0)) as estoque,
         count(*) filter (where qtd <= 0) as produtos_zerados, avg(preco) as preco_medio
    from links group by item_id
),
vend as (
  select l.item_id, sum(v.venda_valor) as valor14, sum(v.venda_valor / nullif(l.preco, 0)) as un14
    from links l
    join public.vendas_diarias v on v.codigo_produto = l.codigo
    cross join ult
   where l.codigo is not null and v.data_venda > ult.d - 14
   group by l.item_id
),
base as (
  select i.*, c.titulo as campanha, c.inicio, c.fim,
         coalesce(e.produtos, 0) as produtos,
         coalesce(e.produtos_zerados, 0) as produtos_zerados,
         coalesce(e.estoque, 0) as estoque,
         e.preco_medio,
         (select count(*) from public.jornal_item_produtos s where s.item_id = i.id and s.origem = 'sugestao') as sugestoes,
         round(coalesce(v.valor14, 0) / 14.0, 2) as venda_dia_valor,
         round(coalesce(v.un14, 0) / 14.0, 2) as venda_dia_un,
         greatest(0, c.fim - greatest(hoje.d, c.inicio) + 1) as dias_restantes,
         (select d from ult) as vendas_ate
    from public.jornal_itens i
    join public.jornal_campanhas c on c.id = i.campanha_id
    cross join hoje
    left join est e on e.item_id = i.id
    left join vend v on v.item_id = i.id
)
select b.*,
       case when b.venda_dia_un > 0 then round(b.estoque / b.venda_dia_un, 1) end as dias_cobertura,
       case when b.venda_dia_un > 0 then ceil(b.venda_dia_un * b.dias_restantes) end as necessario_ate_fim,
       case
         when b.produtos = 0 then 'sem_produto'
         when b.estoque <= 0 then 'zerado'
         when b.venda_dia_un > 0 and b.estoque < b.venda_dia_un * b.dias_restantes then 'vai_faltar'
         when b.estoque_minimo is not null and b.estoque <= b.estoque_minimo then 'baixo'
         else 'ok'
       end as situacao
  from base b;

grant select on public.jornal_itens_status to anon, authenticated;

-- Aviso diário (9h) pros gerentes enquanto o jornal está valendo ---------------
create or replace function public.avisar_estoque_jornal()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  c record;
  n_zerado int;
  n_faltar int;
  mensagens jsonb;
  enviados int := 0;
begin
  for c in select * from jornal_campanhas where hoje between inicio and fim loop
    select count(*) filter (where situacao = 'zerado'),
           count(*) filter (where situacao in ('vai_faltar', 'baixo'))
      into n_zerado, n_faltar
      from jornal_itens_status where campanha_id = c.id;
    continue when n_zerado + n_faltar = 0;
    select coalesce(jsonb_agg(jsonb_build_object(
             'to', t.expo_push_token,
             'title', '⚠️ Estoque do jornal',
             'body', c.titulo || ': ' ||
                     case when n_zerado > 0 then n_zerado || ' item(ns) zerado(s)' else '' end ||
                     case when n_zerado > 0 and n_faltar > 0 then ' e ' else '' end ||
                     case when n_faltar > 0 then n_faltar || ' que vão acabar antes do fim' else '' end ||
                     '. Abra Ofertas → Estoque do Jornal.',
             'sound', 'default',
             'data', jsonb_build_object('tipo', 'estoque_jornal', 'id', c.id))), '[]'::jsonb)
      into mensagens
      from push_tokens t
      join colaboradores col on col.id = t.colaborador_id
     where col.is_admin;
    if jsonb_array_length(mensagens) > 0 then
      perform net.http_post(url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
        body := mensagens);
    end if;
    enviados := enviados + 1;
  end loop;
  return enviados;
end;
$$;

select cron.unschedule('ulva_estoque_jornal_9h')
 where exists (select 1 from cron.job where jobname = 'ulva_estoque_jornal_9h');
select cron.schedule('ulva_estoque_jornal_9h', '5 12 * * *', 'select public.avisar_estoque_jornal();');

select 'ok' as resultado;
