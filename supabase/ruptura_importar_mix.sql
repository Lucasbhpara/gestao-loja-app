-- =====================================================================
-- ULVA · Ruptura: importação do Formulário Pedido do CD
-- Recebe a lista lida do PDF (código, produto, embalagem, estoque no CD)
-- e atualiza mix_cd_itens, contando há quantos formulários seguidos cada
-- item está zerado no CD. Itens que não vieram no formulário ficam com
-- no_formulario = false (não são apagados).
-- Uso: select ruptura_importar_mix('[{"cod":"123","produto":"...","emb":"CX12","estq":10}]'::jsonb, 'MG SECOS', 'C800 - CD 1 BOA VISTA');
-- =====================================================================
create or replace function public.ruptura_importar_mix(p_itens jsonb, p_formulario text, p_deposito text)
returns jsonb language plpgsql as $$
declare
  v_novos int; v_zerados int; v_total int; v_sairam int;
begin
  create temp table _mix on commit drop as
  select x->>'cod' cod, x->>'produto' produto, x->>'emb' emb, nullif(x->>'estq','')::numeric estq
  from jsonb_array_elements(p_itens) x where coalesce(x->>'cod','') <> '';

  select count(*) into v_total from _mix;
  select count(*) into v_novos from _mix m where not exists (select 1 from mix_cd_itens c where c.codigo_interno = m.cod);
  select count(*) into v_zerados from _mix where coalesce(estq,0) <= 0;

  insert into mix_cd_itens as c (codigo_interno, produto, embalagem, estoque_cd, formulario, deposito, no_formulario, zerado_desde, importacoes_zerado, importado_em)
  select cod, produto, emb, estq, p_formulario, p_deposito, true,
         case when coalesce(estq,0) <= 0 then current_date end,
         case when coalesce(estq,0) <= 0 then 1 else 0 end, now()
  from _mix
  on conflict (codigo_interno) do update set
    produto = excluded.produto,
    embalagem = excluded.embalagem,
    estoque_cd = excluded.estoque_cd,
    formulario = excluded.formulario,
    deposito = excluded.deposito,
    no_formulario = true,
    zerado_desde = case when coalesce(excluded.estoque_cd,0) <= 0 then coalesce(c.zerado_desde, current_date) end,
    importacoes_zerado = case when coalesce(excluded.estoque_cd,0) <= 0
                              then c.importacoes_zerado + case when c.importado_em::date = current_date then 0 else 1 end
                              else 0 end,
    importado_em = now();

  -- Itens do mesmo formulário que não vieram desta vez
  update mix_cd_itens set no_formulario = false
  where formulario = p_formulario and no_formulario and codigo_interno not in (select cod from _mix);
  get diagnostics v_sairam = row_count;

  return jsonb_build_object('total', v_total, 'novos', v_novos, 'zerados', v_zerados, 'sairam', v_sairam);
end $$;
grant execute on function public.ruptura_importar_mix(jsonb, text, text) to anon, authenticated;
