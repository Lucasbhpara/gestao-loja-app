-- =====================================================================
-- ULVA · Entradas no estoque (para o Giro › "Chegou parado")
-- O Estoque Loja guarda só a foto do dia (cada importação sobrescreve a
-- anterior). Esta tabela anota, a cada importação, os produtos que
--   - APARECERAM no estoque (estavam zerados ou não existiam e passaram a ter), e
--   - foram REPOSTOS (a quantidade aumentou de um dia para o outro).
-- O Giro cruza essas entradas com as vendas para mostrar o que chegou nos
-- últimos 7 dias e ainda não vendeu.
-- O histórico começa a partir da primeira importação de estoque depois de
-- rodar este arquivo.
-- Rodar uma vez no SQL Editor do Supabase.
-- =====================================================================

create table if not exists public.estoque_entradas (
  id bigserial primary key,
  item_id uuid not null,
  codigo_interno text,
  produto text,
  data date not null,
  tipo text not null check (tipo in ('apareceu', 'reposicao')),
  qtd_antes numeric,
  qtd_depois numeric,
  registrado_em timestamptz not null default now(),
  constraint estoque_entradas_unica unique (item_id, data, tipo)
);
create index if not exists estoque_entradas_data on public.estoque_entradas (data desc);
create index if not exists estoque_entradas_codigo on public.estoque_entradas (codigo_interno);

alter table public.estoque_entradas enable row level security;
drop policy if exists estoque_entradas_ler on public.estoque_entradas;
create policy estoque_entradas_ler on public.estoque_entradas for select using (true);
grant select on public.estoque_entradas to anon, authenticated;

create or replace function public.registrar_entrada_estoque()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  antes numeric := case when tg_op = 'INSERT' then 0 else coalesce(old.quantidade, 0) end;
  depois numeric := coalesce(new.quantidade, 0);
  v_tipo text;
begin
  if depois <= antes or depois <= 0 then
    return new;
  end if;
  v_tipo := case when antes <= 0 then 'apareceu' else 'reposicao' end;
  insert into public.estoque_entradas (item_id, codigo_interno, produto, data, tipo, qtd_antes, qtd_depois)
  values (new.id, nullif(trim(new.codigo_interno), ''), new.produto,
          coalesce(new.data_planilha, (now() at time zone 'America/Sao_Paulo')::date),
          v_tipo, antes, depois)
  on conflict (item_id, data, tipo) do update
    set qtd_depois = excluded.qtd_depois,
        codigo_interno = coalesce(excluded.codigo_interno, public.estoque_entradas.codigo_interno);
  return new;
exception when others then
  return new;  -- registrar a entrada nunca pode travar a importação do estoque
end;
$$;

drop trigger if exists estoque_loja_registrar_entrada on public.estoque_loja_itens;
create trigger estoque_loja_registrar_entrada
  after insert or update of quantidade on public.estoque_loja_itens
  for each row execute function public.registrar_entrada_estoque();

select 'estoque_entradas pronta' as ok;
