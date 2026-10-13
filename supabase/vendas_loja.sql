-- =====================================================================
-- ULVA · Vendas da Loja
-- Consultas usadas pela aba "Vendas da Loja" (portal) e pela tela do app.
-- Só leem dados que já existem: vendas_diarias + produtos_classes + estoque.
-- =====================================================================

-- Venda total por dia num período
create or replace function public.vendas_loja_dias(p_ini date, p_fim date)
returns table (dia date, venda numeric, produtos bigint)
language plpgsql
stable
set search_path = public
as $fn$
begin
  return query
  select v.data_venda, round(sum(v.venda_valor), 2), count(*) filter (where v.venda_valor > 0)
  from vendas_diarias v
  where v.data_venda between p_ini and p_fim
  group by v.data_venda
  order by v.data_venda;
end;
$fn$;

-- Venda por nível do sortimento, comparando dois períodos.
-- p_nivel: 2 = setor, 3 = grupo, 4 = categoria, 5 = subcategoria, 6 = produto
-- p_c2..p_c5: filtros do caminho já escolhido (null = todos)
create or replace function public.vendas_loja_grupos(
  p_ini date, p_fim date, p_ini_ant date, p_fim_ant date,
  p_nivel int default 2,
  p_c2 text default null, p_c3 text default null, p_c4 text default null, p_c5 text default null
)
returns table (chave text, nome text, venda numeric, venda_ant numeric, itens bigint, margem numeric)
language plpgsql
stable
set search_path = public
as $fn$
begin
  return query
  with v as (
    select d.codigo_produto,
      sum(d.venda_valor) filter (where d.data_venda between p_ini and p_fim) as venda,
      sum(d.venda_valor) filter (where d.data_venda between p_ini_ant and p_fim_ant) as venda_ant
    from vendas_diarias d
    where d.data_venda between least(p_ini, p_ini_ant) and greatest(p_fim, p_fim_ant)
    group by d.codigo_produto
  ),
  j as (
    select v.codigo_produto, v.venda, v.venda_ant,
      coalesce(p.classe_2_nome, 'SEM CLASSIFICACAO') as c2,
      coalesce(p.classe_3_nome, '(sem grupo)') as c3,
      coalesce(p.classe_4_nome, '(sem categoria)') as c4,
      coalesce(p.classe_5_nome, '(sem subcategoria)') as c5,
      coalesce(e.produto, p.nome_produto, v.codigo_produto) as nome_prod,
      coalesce(nullif(e.preco_venda, 0), p.preco_venda) as pv,
      coalesce(nullif(e.preco_custo, 0), p.custo_medio) as pc
    from v
    left join produtos_classes p on p.codigo_produto = v.codigo_produto
    left join estoque_loja_itens e on e.codigo_interno = v.codigo_produto and e.codigo_interno <> ''
  ),
  k as (
    select j.*,
      case p_nivel when 2 then j.c2 when 3 then j.c3 when 4 then j.c4 when 5 then j.c5 else j.codigo_produto end as ch
    from j
    where (p_c2 is null or j.c2 = p_c2)
      and (p_c3 is null or j.c3 = p_c3)
      and (p_c4 is null or j.c4 = p_c4)
      and (p_c5 is null or j.c5 = p_c5)
  )
  select k.ch,
    case when p_nivel >= 6 then max(k.nome_prod) else k.ch end,
    round(coalesce(sum(k.venda), 0), 2),
    round(coalesce(sum(k.venda_ant), 0), 2),
    count(*) filter (where k.venda > 0),
    round(100 * sum(case when k.pv > 0 and k.pc > 0 then coalesce(k.venda, 0) * (1 - k.pc / k.pv) end)
          / nullif(sum(case when k.pv > 0 and k.pc > 0 then k.venda end), 0), 1)
  from k
  group by k.ch
  having coalesce(sum(k.venda), 0) <> 0 or coalesce(sum(k.venda_ant), 0) <> 0
  order by 3 desc;
end;
$fn$;

grant execute on function public.vendas_loja_dias(date, date) to anon, authenticated;
grant execute on function public.vendas_loja_grupos(date, date, date, date, int, text, text, text, text) to anon, authenticated;
