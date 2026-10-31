create table if not exists public.ruptura_tratativas (
  id uuid primary key default gen_random_uuid(),
  codigo_interno text not null,
  produto text,
  grupo_id uuid,
  grupo_nome text,
  setor text,
  situacao text not null,
  status text not null default 'aberta',
  acao text,
  setor_tarefa text,
  tarefa_id uuid,
  foto_url text,
  obs text,
  saldo numeric,
  estoque_cd numeric,
  coleta_id uuid,
  aberta_por text,
  aberta_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  respondida_por text,
  resolvida_por text,
  resolvida_em timestamptz,
  historico jsonb not null default '[]'::jsonb
);
create unique index if not exists ruptura_trat_aberta on public.ruptura_tratativas (codigo_interno) where status <> 'resolvida';
create index if not exists ruptura_trat_status on public.ruptura_tratativas (status, setor_tarefa);
alter table public.ruptura_tratativas enable row level security;
drop policy if exists ruptura_tratativas_tudo on public.ruptura_tratativas;
create policy ruptura_tratativas_tudo on public.ruptura_tratativas for all using (true) with check (true);
grant all on public.ruptura_tratativas to anon, authenticated;
create or replace function public.ruptura_prioridade()
returns table (grupo_id uuid, suspeitos int, com_cd int, nunca_veio int)
language sql stable as $$
  with est as (
    select distinct on (codigo_interno::text) codigo_interno::text cod, produto, quantidade
    from estoque_loja_itens where coalesce(codigo_interno::text,'') <> ''
    order by codigo_interno::text, atualizado_em desc),
  base as (
    select cod, upper(max(prod)) prod from (
      select cod, produto prod from est
      union all select codigo_interno, produto from mix_cd_itens) x group by cod),
  rp as (select upper(valor) v, grupo_id from ruptura_grupo_regras where tipo = 'prefixo'),
  rpl as (select * from rp where right(v, 1) <> ' '),
  semc as (
    select b.cod, b.prod,
      split_part(b.prod,' ',1)||' ' p1,
      split_part(b.prod,' ',1)||' '||split_part(b.prod,' ',2)||' ' p2
    from base b where not exists (
      select 1 from produtos_classes c
      where c.codigo_produto::text = b.cod and c.classe_5_nome is not null)),
  cand as (
    select s.cod, rp.grupo_id, length(rp.v) l from semc s join rp on rp.v = s.p1
    union all
    select s.cod, rp.grupo_id, length(rp.v) from semc s join rp on rp.v = s.p2
    union all
    select s.cod, rpl.grupo_id, length(rpl.v) from semc s join rpl on s.prod like rpl.v||'%'),
  g2 as (select distinct on (cod) cod, grupo_id from cand order by cod, l desc),
  g1 as (
    select b.cod, r.grupo_id from base b
    join produtos_classes c on c.codigo_produto::text = b.cod
    join ruptura_grupo_regras r on r.tipo = 'classe5' and upper(r.valor) = upper(c.classe_5_nome)),
  pg as (select * from g1 union all select * from g2),
  mx as (select max(data_venda) d from vendas_diarias),
  v as (
    select codigo_produto::text cod, count(distinct data_venda) dias
    from vendas_diarias
    where venda_valor > 0 and data_venda > (select d from mx) - 30 group by 1),
  t as (
    select pg.grupo_id,
      (e.cod is not null and coalesce(e.quantidade,0) <= 0
        and coalesce(v.dias,0) >= 4 and x.codigo_interno is null) susp,
      coalesce(m.no_formulario and m.estoque_cd > 0, false) cdtem,
      (e.cod is null and v.cod is null and x.codigo_interno is null) nunca
    from pg
    left join est e on e.cod = pg.cod
    left join v on v.cod = pg.cod
    left join mix_cd_itens m on m.codigo_interno = pg.cod
    left join ruptura_descontinuados x on x.codigo_interno = pg.cod)
  select grupo_id,
    count(*) filter (where susp)::int,
    count(*) filter (where susp and cdtem)::int,
    count(*) filter (where nunca and cdtem)::int
  from t group by grupo_id;
$$;
grant execute on function public.ruptura_prioridade() to anon, authenticated;
