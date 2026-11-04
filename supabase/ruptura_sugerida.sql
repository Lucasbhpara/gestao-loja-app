-- Ruptura sugerida (planilha da Falcon).
--
-- No Portal Admin (Operação › Ruptura sugerida) sobe a planilha "ruptura loja
-- e CD" da Falcon. O importador (ruptura_sugerida_importar) monta uma lista
-- para conferência no app, já tirando:
--   • produtos descontinuados;
--   • produtos com pedido nos últimos 14 dias (Pedido CD ou "Pedido feito").
-- Cada item já vem com o grupo da gôndola (mesmas regras da Ruptura), EANs e
-- saldo da loja. No app (Ruptura › Ruptura sugerida) o gerente vai nos
-- lugares: bipar = está na área de venda; botão = ruptura. No fim,
-- ruptura_sugerida_enviar_pedido manda as rupturas com estoque no CD para a
-- fila do Pedido CD (extensão do Chrome).

create table if not exists ruptura_sugerida_lotes (
  id uuid primary key default gen_random_uuid(),
  arquivo text,
  criado_por text,
  criado_em timestamptz not null default now(),
  total_planilha integer not null default 0,
  total_itens integer not null default 0,
  excluidos jsonb not null default '{}'::jsonb,
  status text not null default 'aberta' check (status in ('aberta', 'concluida', 'substituida')),
  enviado_em timestamptz
);

create table if not exists ruptura_sugerida_itens (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references ruptura_sugerida_lotes(id) on delete cascade,
  codigo_interno text not null,
  produto text,
  secao text,
  cx_cd numeric,
  dias_sem_entrada integer,
  ult_entrada text,
  grupo_id uuid,
  grupo_nome text,
  eans text[] not null default '{}',
  saldo numeric,
  estoque_cd numeric,
  status text not null default 'pendente' check (status in ('pendente', 'na_area', 'ruptura')),
  conferido_por text,
  conferido_em timestamptz,
  enviado_pedido_em timestamptz,
  unique (lote_id, codigo_interno)
);
create index if not exists ruptura_sug_itens_lote on ruptura_sugerida_itens (lote_id, status);

alter table ruptura_sugerida_lotes enable row level security;
alter table ruptura_sugerida_itens enable row level security;
drop policy if exists ruptura_sugerida_lotes_tudo on ruptura_sugerida_lotes;
create policy ruptura_sugerida_lotes_tudo on ruptura_sugerida_lotes for all using (true) with check (true);
drop policy if exists ruptura_sugerida_itens_tudo on ruptura_sugerida_itens;
create policy ruptura_sugerida_itens_tudo on ruptura_sugerida_itens for all using (true) with check (true);
grant all on ruptura_sugerida_lotes, ruptura_sugerida_itens to anon, authenticated;

-- Códigos com pedido nos últimos p_dias (fila/feito no Pedido CD ou tratativa "Pedido feito").
create or replace function pedido_cd_recentes(p_dias int default 14)
returns table (codigo_interno text)
language sql stable as $$
  select distinct x->>'codigo'
    from pedido_cd_solicitacoes s, jsonb_array_elements(s.itens) x
   where s.criado_em > now() - make_interval(days => p_dias)
     and (s.status in ('pendente', 'processando', 'parou')
          or exists (select 1 from jsonb_array_elements(coalesce(s.resultado->'ok', '[]') || coalesce(s.resultado->'ja', '[]')) r
                      where r->>'codigo' = x->>'codigo'))
  union
  select codigo_interno from ruptura_tratativas
   where acao in ('pedido_feito', 'pedido_cd') and status <> 'resolvida'
     and atualizada_em > now() - make_interval(days => p_dias)
$$;

-- Grupo da gôndola de cada código (mesmas regras da Ruptura: classe 5,
-- prefixo do nome e produtos movidos de grupo).
create or replace function ruptura_grupo_dos_produtos(p_cods text[])
returns table (cod text, grupo_id uuid)
language sql stable as $$
  with base as (
    select cod, upper(max(prod)) prod from (
      select codigo_interno::text cod, produto prod from estoque_loja_itens where codigo_interno::text = any(p_cods)
      union all select codigo_interno, produto from mix_cd_itens where codigo_interno = any(p_cods)) x group by cod),
  rp as (select upper(valor) v, grupo_id from ruptura_grupo_regras where tipo = 'prefixo'),
  rpl as (select * from rp where right(v, 1) <> ' '),
  semc as (select b.cod, b.prod, split_part(b.prod,' ',1)||' ' p1, split_part(b.prod,' ',1)||' '||split_part(b.prod,' ',2)||' ' p2
             from base b where not exists (select 1 from produtos_classes c where c.codigo_produto::text = b.cod and c.classe_5_nome is not null)),
  cand as (select s.cod, rp.grupo_id, length(rp.v) l from semc s join rp on rp.v = s.p1
           union all select s.cod, rp.grupo_id, length(rp.v) from semc s join rp on rp.v = s.p2
           union all select s.cod, rpl.grupo_id, length(rpl.v) from semc s join rpl on s.prod like rpl.v||'%'),
  g2 as (select distinct on (cod) cod, grupo_id from cand order by cod, l desc),
  g1 as (select b.cod, r.grupo_id from base b join produtos_classes c on c.codigo_produto::text = b.cod
           join ruptura_grupo_regras r on r.tipo = 'classe5' and upper(r.valor) = upper(c.classe_5_nome)),
  pg0 as (select distinct on (cod) * from (select * from g1 union all select * from g2) z order by cod)
  select p.cod, p.grupo_id from pg0 p where not exists (select 1 from ruptura_produto_grupo mv where mv.codigo_interno = p.cod)
  union all
  select mv.codigo_interno, mv.grupo_id from ruptura_produto_grupo mv where mv.codigo_interno = any(p_cods)
$$;

-- p_itens: [{codigo, produto, secao, cx_cd, dias, ult_entrada}]
create or replace function ruptura_sugerida_importar(p_arquivo text, p_itens jsonb, p_por text)
returns jsonb
language plpgsql security definer as $$
declare
  v_lote uuid;
  v_total int := coalesce(jsonb_array_length(p_itens), 0);
  v_desc int; v_ped int; v_ins int;
begin
  create temp table _sug on commit drop as
  select distinct on (trim(x->>'codigo')) trim(x->>'codigo') cod, x->>'produto' produto, x->>'secao' secao,
         nullif(x->>'cx_cd', '')::numeric cx_cd, nullif(regexp_replace(coalesce(x->>'dias', ''), '\D', '', 'g'), '')::int dias,
         x->>'ult_entrada' ult_entrada
    from jsonb_array_elements(p_itens) x
   where coalesce(trim(x->>'codigo'), '') <> '';

  select count(*) into v_desc from _sug s where exists (select 1 from ruptura_descontinuados d where d.codigo_interno = s.cod);
  select count(*) into v_ped from _sug s where s.cod in (select codigo_interno from pedido_cd_recentes(14))
     and not exists (select 1 from ruptura_descontinuados d where d.codigo_interno = s.cod);

  update ruptura_sugerida_lotes set status = 'substituida' where status = 'aberta';
  insert into ruptura_sugerida_lotes (arquivo, criado_por, total_planilha, excluidos)
  values (p_arquivo, p_por, v_total, jsonb_build_object('descontinuados', v_desc, 'pedido_14_dias', v_ped))
  returning id into v_lote;

  with ok as (
    select s.* from _sug s
     where not exists (select 1 from ruptura_descontinuados d where d.codigo_interno = s.cod)
       and s.cod not in (select codigo_interno from pedido_cd_recentes(14))),
  est as (select distinct on (codigo_interno::text) codigo_interno::text cod, quantidade
            from estoque_loja_itens where codigo_interno::text in (select cod from ok) order by codigo_interno::text, atualizado_em desc),
  ean as (select cod, array_agg(distinct ean) eans from (
            select codigo_interno::text cod, codigo_barras::text ean from estoque_loja_itens
             where codigo_interno::text in (select cod from ok) and coalesce(codigo_barras::text, '') <> ''
            union select codigo_interno::text, codigo_barras::text from produtos_catalogo
             where codigo_interno::text in (select cod from ok) and coalesce(codigo_barras::text, '') <> '') y group by cod),
  gr as (select * from ruptura_grupo_dos_produtos(array(select cod from ok)))
  insert into ruptura_sugerida_itens (lote_id, codigo_interno, produto, secao, cx_cd, dias_sem_entrada, ult_entrada,
                                      grupo_id, grupo_nome, eans, saldo, estoque_cd)
  select v_lote, ok.cod, ok.produto, ok.secao, ok.cx_cd, ok.dias, ok.ult_entrada,
         gr.grupo_id, g.nome, coalesce(ean.eans, '{}'), est.quantidade, m.estoque_cd
    from ok
    left join gr on gr.cod = ok.cod
    left join ruptura_grupos g on g.id = gr.grupo_id
    left join ean on ean.cod = ok.cod
    left join est on est.cod = ok.cod
    left join mix_cd_itens m on m.codigo_interno = ok.cod;
  get diagnostics v_ins = row_count;

  update ruptura_sugerida_lotes set total_itens = v_ins where id = v_lote;
  return jsonb_build_object('lote_id', v_lote, 'planilha', v_total, 'itens', v_ins,
                            'descontinuados', v_desc, 'pedido_14_dias', v_ped,
                            'sem_grupo', (select count(*) from ruptura_sugerida_itens where lote_id = v_lote and grupo_id is null));
end;
$$;

-- Manda as rupturas conferidas para a fila do Pedido CD.
-- Só vai quem tem estoque no CD e não tem estoque na loja (com estoque na
-- loja é "verificar estoque", não pedido).
create or replace function ruptura_sugerida_enviar_pedido(p_lote uuid, p_por text)
returns jsonb
language plpgsql security definer as $$
declare
  v_itens jsonb; v_n int; v_semcd int; v_loja int; v_sol uuid;
begin
  select count(*) filter (where coalesce(m.estoque_cd, 0) <= 0),
         count(*) filter (where coalesce(m.estoque_cd, 0) > 0 and coalesce(i.saldo, 0) > 0)
    into v_semcd, v_loja
    from ruptura_sugerida_itens i left join mix_cd_itens m on m.codigo_interno = i.codigo_interno
   where i.lote_id = p_lote and i.status = 'ruptura' and i.enviado_pedido_em is null;

  select coalesce(jsonb_agg(jsonb_build_object('codigo', i.codigo_interno, 'produto', i.produto, 'grupo_nome', i.grupo_nome)), '[]'), count(*)
    into v_itens, v_n
    from ruptura_sugerida_itens i join mix_cd_itens m on m.codigo_interno = i.codigo_interno
   where i.lote_id = p_lote and i.status = 'ruptura' and i.enviado_pedido_em is null
     and coalesce(m.estoque_cd, 0) > 0 and coalesce(i.saldo, 0) <= 0
     and i.codigo_interno not in (select codigo_interno from pedido_cd_recentes(14));

  if v_n > 0 then
    insert into pedido_cd_solicitacoes (itens, grupos, criado_por)
    values (v_itens, 'Ruptura sugerida', p_por) returning id into v_sol;
    update ruptura_sugerida_itens i set enviado_pedido_em = now()
     where i.lote_id = p_lote and i.codigo_interno in (select x->>'codigo' from jsonb_array_elements(v_itens) x);
  end if;
  update ruptura_sugerida_lotes set enviado_em = now() where id = p_lote;
  return jsonb_build_object('enviados', v_n, 'sem_cd', v_semcd, 'com_estoque_loja', v_loja, 'solicitacao_id', v_sol);
end;
$$;

grant execute on function pedido_cd_recentes(int) to anon, authenticated;
grant execute on function ruptura_grupo_dos_produtos(text[]) to anon, authenticated;
grant execute on function ruptura_sugerida_importar(text, jsonb, text) to anon, authenticated;
grant execute on function ruptura_sugerida_enviar_pedido(uuid, text) to anon, authenticated;
