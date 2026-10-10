-- =============================================================================
-- Uso e Consumo — controle de material de uso interno da loja (embalagens,
-- limpeza, EPI, utensílios, gás...).
--
-- Como funciona:
--   * uso_consumo_itens ........ cadastro dos itens (já vem com os itens do
--                                sistema que não são de venda)
--   * uso_consumo_contagens .... cada contagem física; a última é a base do saldo
--   * uso_consumo_retiradas .... cada retirada: quem, setor, quantidade
--   * uso_consumo_saldo (view).. saldo = última contagem − retiradas depois dela
--
-- Pode rodar mais de uma vez sem duplicar nada.
-- =============================================================================

create table if not exists public.uso_consumo_itens (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  nome text not null,
  unidade text not null default 'UN',
  categoria text not null default 'Outros',
  custo numeric,
  estoque_minimo numeric,
  ativo boolean not null default true,
  criado_por text,
  criado_em timestamptz not null default now()
);
create unique index if not exists uso_consumo_itens_codigo_uidx on public.uso_consumo_itens (codigo) where codigo is not null;

create table if not exists public.uso_consumo_contagens (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.uso_consumo_itens(id) on delete cascade,
  quantidade numeric not null,
  contado_por text,
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists uso_consumo_contagens_item_idx on public.uso_consumo_contagens (item_id, criado_em desc);

create table if not exists public.uso_consumo_retiradas (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.uso_consumo_itens(id) on delete cascade,
  quantidade numeric not null check (quantidade > 0),
  setor text not null,
  retirado_por text,
  matricula text,
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists uso_consumo_retiradas_item_idx on public.uso_consumo_retiradas (item_id, criado_em desc);
create index if not exists uso_consumo_retiradas_data_idx on public.uso_consumo_retiradas (criado_em desc);

-- Saldo de cada item
create or replace view public.uso_consumo_saldo as
select
  i.*,
  c.quantidade  as ultima_contagem,
  c.criado_em   as contado_em,
  c.contado_por as contado_por,
  coalesce(r.qtd, 0)   as retirado_desde_contagem,
  case when c.id is null then null else c.quantidade - coalesce(r.qtd, 0) end as saldo,
  coalesce(r30.qtd, 0) as retirado_30d
from public.uso_consumo_itens i
left join lateral (
  select * from public.uso_consumo_contagens x where x.item_id = i.id order by x.criado_em desc limit 1
) c on true
left join lateral (
  select sum(x.quantidade) as qtd from public.uso_consumo_retiradas x
  where x.item_id = i.id and (c.id is null or x.criado_em > c.criado_em)
) r on true
left join lateral (
  select sum(x.quantidade) as qtd from public.uso_consumo_retiradas x
  where x.item_id = i.id and x.criado_em > now() - interval '30 days'
) r30 on true;

-- Acesso (mesmo padrão do resto do app)
alter table public.uso_consumo_itens enable row level security;
alter table public.uso_consumo_contagens enable row level security;
alter table public.uso_consumo_retiradas enable row level security;
drop policy if exists uso_consumo_itens_tudo on public.uso_consumo_itens;
drop policy if exists uso_consumo_contagens_tudo on public.uso_consumo_contagens;
drop policy if exists uso_consumo_retiradas_tudo on public.uso_consumo_retiradas;
create policy uso_consumo_itens_tudo on public.uso_consumo_itens for all using (true) with check (true);
create policy uso_consumo_contagens_tudo on public.uso_consumo_contagens for all using (true) with check (true);
create policy uso_consumo_retiradas_tudo on public.uso_consumo_retiradas for all using (true) with check (true);
grant select, insert, update, delete on public.uso_consumo_itens, public.uso_consumo_contagens, public.uso_consumo_retiradas to anon, authenticated;
grant select on public.uso_consumo_saldo to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Itens iniciais: o que o sistema da loja já tem fora de venda (embalagens,
-- limpeza, EPI, utensílios...) + os itens de uso e consumo do Inventário.
-- Paletes, caixas plásticas e galão vazio ficam de fora (já têm inventário
-- próprio em "Paletes e Caixas").
-- -----------------------------------------------------------------------------
with base as (
  select codigo_produto as codigo, nome_produto as nome, custo_medio::numeric as custo
  from public.produtos_classes
  where classe_2_nome in ('ALMOX/RH/MANUT/EPI/ARTES', 'DIVERSOS', 'EMBALAGEM/GARRAFEIRA/GF', 'EMBALAGENS', 'MANUTENCAO', 'NI')
  union all
  select ii.codigo_interno, ii.produto, null::numeric
  from public.inventario_itens ii
  where ii.sortimento = 'uso_consumo'
    and ii.codigo_interno is not null
    and not exists (select 1 from public.produtos_classes pc where pc.codigo_produto = ii.codigo_interno)
),
filtrado as (
  select distinct on (codigo) codigo, trim(nome) as nome, custo
  from base
  where nome !~* '^(PALETE|CAIXA PL\.SUPERMERCADO|GALAO AGUA)'
  order by codigo
)
insert into public.uso_consumo_itens (codigo, nome, unidade, categoria, custo, criado_por)
select
  codigo,
  nome,
  case
    when nome ~* ' KG$' or nome ~* 'GRANEL KG' then 'KG'
    when nome ~* ' PR$' then 'PAR'
    when nome ~* ' GL$' or nome ~* ' 5L$' then 'GALÃO'
    when nome ~* ' FD$' or nome ~* 'C/1000' or nome ~* 'SACOLA' then 'FARDO'
    when nome ~* ' RL$' then 'ROLO'
    when nome ~* ' PT$' then 'PACOTE'
    when nome ~* ' CX$' or nome ~* 'C/\d+' then 'CAIXA'
    else 'UN'
  end,
  case
    when nome ~* '(DESINF|DET\.|SABONETE|SACO LIXO|PAPEL TOALHA)' then 'Limpeza e higiene'
    when nome ~* '(LUVA|TOUCA|BOTA|PROTETOR CARRINHO)' then 'EPI e descartáveis'
    when nome ~* '(GAS GLP|FILTRO LINHA)' then 'Gás e manutenção'
    when nome ~* '(ASSAD|BAILARINA|BATEDOR|BISTURI|CESTO|BICO CONFEIT|ESPATULA|FACA|FORMA ALUM|MANGA CONFEITAR|PEGADOR|PINCEL|RALADOR|ROLO MASSA|ARO CORTADOR|ARAME)' then 'Utensílios'
    else 'Embalagens'
  end,
  custo,
  'sistema'
from filtrado
on conflict (codigo) where codigo is not null do nothing;

select categoria, count(*) as itens from public.uso_consumo_itens group by 1 order by 1;
