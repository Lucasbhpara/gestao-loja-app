-- Pedido CD a partir de cortes (planilha "pedidos cortados" que o gerente
-- exporta do Portal 360 / sistema de pedidos, mostrando o que foi cortado do
-- pedido dos últimos dias por CD de origem).
--
-- No Portal Admin (Operação › Cortes do pedido (CD)) sobe a planilha. O ULVA
-- agrupa por CD de origem (ORIGEM), tira os descontinuados e o que já teve
-- pedido novo nos últimos 14 dias (mesma regra da Ruptura sugerida), soma a
-- quantidade cortada por produto e, ao clicar em "Disparar pedido" num dos
-- grupos de CD, grava uma solicitação em pedido_cd_solicitacoes — a mesma
-- fila que a extensão do Chrome "ULVA – Pedido CD" já lê sozinha e digita no
-- formulário certo do Portal 360 (hoje, MG SECOS).
-- Precisa ter rodado antes: ruptura_sugerida.sql (usa ruptura_descontinuados
-- e a função pedido_cd_recentes) e pedido_cd_solicitacoes.sql.

create table if not exists pedido_cortes_lotes (
  id uuid primary key default gen_random_uuid(),
  arquivo text,
  origem_cd text not null,
  criado_por text,
  criado_em timestamptz not null default now(),
  total_planilha integer not null default 0,
  excluidos jsonb not null default '{}'::jsonb,
  total_itens integer not null default 0,
  enviado_em timestamptz,
  solicitacao_id uuid references pedido_cd_solicitacoes(id)
);

create table if not exists pedido_cortes_itens (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references pedido_cortes_lotes(id) on delete cascade,
  codigo_interno text not null,
  produto text,
  qtd_corte numeric not null default 0,
  n_pedidos text[] not null default '{}',
  unique (lote_id, codigo_interno)
);
create index if not exists pedido_cortes_itens_lote on pedido_cortes_itens (lote_id);

alter table pedido_cortes_lotes enable row level security;
alter table pedido_cortes_itens enable row level security;
drop policy if exists pedido_cortes_lotes_tudo on pedido_cortes_lotes;
create policy pedido_cortes_lotes_tudo on pedido_cortes_lotes for all using (true) with check (true);
drop policy if exists pedido_cortes_itens_tudo on pedido_cortes_itens;
create policy pedido_cortes_itens_tudo on pedido_cortes_itens for all using (true) with check (true);
grant all on pedido_cortes_lotes, pedido_cortes_itens to anon, authenticated;

-- p_itens: [{codigo, produto, qtd_corte, n_pedido}], já filtrados por ORIGEM no front
-- (um grupo por CD) e com qtd_corte > 0. Soma qtd_corte quando o mesmo código
-- aparece em mais de uma linha (pedidos diferentes cortados no período).
-- Tira descontinuados e códigos com pedido novo nos últimos 14 dias, grava o
-- lote para histórico e já dispara a solicitação para a fila do Pedido CD.
create or replace function pedido_cortes_importar(p_arquivo text, p_origem text, p_itens jsonb, p_por text)
returns jsonb
language plpgsql security definer as $$
declare
  v_lote uuid;
  v_sol uuid;
  v_total int := coalesce(jsonb_array_length(p_itens), 0);
  v_desc int; v_ped int; v_ins int;
  v_itens_sol jsonb;
begin
  create temp table _cortes on commit drop as
  select trim(x->>'codigo') cod, max(x->>'produto') produto, sum(coalesce((x->>'qtd_corte')::numeric, 0)) qtd,
         array_agg(distinct x->>'n_pedido') filter (where coalesce(x->>'n_pedido', '') <> '') n_pedidos
    from jsonb_array_elements(p_itens) x
   where coalesce(trim(x->>'codigo'), '') <> ''
   group by trim(x->>'codigo');

  delete from _cortes where qtd <= 0;

  select count(*) into v_desc from _cortes c where exists (select 1 from ruptura_descontinuados d where d.codigo_interno = c.cod);
  select count(*) into v_ped from _cortes c where c.cod in (select codigo_interno from pedido_cd_recentes(14))
     and not exists (select 1 from ruptura_descontinuados d where d.codigo_interno = c.cod);

  insert into pedido_cortes_lotes (arquivo, origem_cd, criado_por, total_planilha, excluidos)
  values (p_arquivo, p_origem, p_por, v_total, jsonb_build_object('descontinuados', v_desc, 'pedido_14_dias', v_ped))
  returning id into v_lote;

  with ok as (
    select c.* from _cortes c
     where not exists (select 1 from ruptura_descontinuados d where d.codigo_interno = c.cod)
       and c.cod not in (select codigo_interno from pedido_cd_recentes(14)))
  insert into pedido_cortes_itens (lote_id, codigo_interno, produto, qtd_corte, n_pedidos)
  select v_lote, ok.cod, ok.produto, ok.qtd, coalesce(ok.n_pedidos, '{}') from ok;
  get diagnostics v_ins = row_count;

  update pedido_cortes_lotes set total_itens = v_ins where id = v_lote;

  select coalesce(jsonb_agg(jsonb_build_object('codigo', i.codigo_interno, 'produto', i.produto, 'qtd', i.qtd_corte)), '[]')
    into v_itens_sol
    from pedido_cortes_itens i where i.lote_id = v_lote;

  if v_ins > 0 then
    insert into pedido_cd_solicitacoes (itens, grupos, criado_por)
    values (v_itens_sol, 'Cortes CD ' || p_origem || ' (MG Secos)', p_por)
    returning id into v_sol;
    update pedido_cortes_lotes set enviado_em = now(), solicitacao_id = v_sol where id = v_lote;
  end if;

  return jsonb_build_object('lote_id', v_lote, 'planilha', v_total, 'itens', v_ins,
                            'descontinuados', v_desc, 'pedido_14_dias', v_ped, 'solicitacao_id', v_sol);
end;
$$;

grant execute on function pedido_cortes_importar(text, text, jsonb, text) to anon, authenticated;
