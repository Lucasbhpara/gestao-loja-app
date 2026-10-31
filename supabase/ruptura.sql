-- =====================================================================
-- ULVA · Controle de Ruptura
-- Coleta por grupo de gôndola, cruzada com Estoque Loja, Vendas diárias
-- e o Formulário de Pedido do CD. Só cria tabelas novas; não altera nada
-- que já existe.
-- =====================================================================

-- 1) Grupos de gôndola (ex.: "Amaciante concentrado") ------------------
create table if not exists public.ruptura_grupos (
  id uuid primary key default gen_random_uuid(),
  setor text not null,
  nome text not null,
  ordem int not null default 0,
  dias_sem_venda int not null default 10,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists ruptura_grupos_nome on public.ruptura_grupos (setor, nome);

-- Regras: quais produtos entram no grupo.
--  tipo 'classe5' = subcategoria (classe_5_nome) da classificação
--  tipo 'prefixo' = começo da descrição (para itens sem classificação)
create table if not exists public.ruptura_grupo_regras (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.ruptura_grupos(id) on delete cascade,
  tipo text not null check (tipo in ('classe5','prefixo')),
  valor text not null
);
create unique index if not exists ruptura_grupo_regras_unica on public.ruptura_grupo_regras (tipo, upper(valor));

-- 2) Mix do CD (Formulário Pedido) -------------------------------------
create table if not exists public.mix_cd_itens (
  codigo_interno text primary key,
  produto text not null,
  embalagem text,
  estoque_cd numeric,
  formulario text,
  deposito text,
  no_formulario boolean not null default true,   -- veio no último formulário importado
  zerado_desde date,                              -- desde quando está zerado no CD
  importacoes_zerado int not null default 0,      -- quantos formulários seguidos veio zerado
  primeira_vez date not null default current_date,
  importado_em timestamptz not null default now()
);

-- 3) Descontinuados (marcados pelo gerente) ---------------------------
create table if not exists public.ruptura_descontinuados (
  codigo_interno text primary key,
  produto text,
  motivo text not null,
  marcado_por text,
  marcado_em timestamptz not null default now()
);

-- 4) Coletas e resultado ----------------------------------------------
create table if not exists public.ruptura_coletas (
  id uuid primary key,
  grupo_id uuid references public.ruptura_grupos(id) on delete set null,
  grupo_nome text not null,
  setor text,
  feita_por text,
  iniciada_em timestamptz not null default now(),
  finalizada_em timestamptz,
  total_itens int not null default 0,
  total_coletados int not null default 0,
  total_ruptura int not null default 0,
  resumo jsonb
);
create index if not exists ruptura_coletas_grupo on public.ruptura_coletas (grupo_id, finalizada_em desc);

create table if not exists public.ruptura_coleta_itens (
  id uuid primary key default gen_random_uuid(),
  coleta_id uuid not null references public.ruptura_coletas(id) on delete cascade,
  codigo_interno text,
  codigo_barras text,
  produto text,
  situacao text not null,   -- ok, parado, ruptura, repor, suspeito, cd_sem, nunca_veio, nao_cadastrado
  saldo numeric,
  ultima_venda date,
  estoque_cd numeric
);
create index if not exists ruptura_coleta_itens_coleta on public.ruptura_coleta_itens (coleta_id);

-- 5) Pai/filho no banco (mesma lista de src/data/paiFilho.json) --------
create table if not exists public.produtos_pai_filho (
  pai text not null,
  filho text not null,
  fator numeric not null default 1,
  primary key (pai, filho)
);
insert into public.produtos_pai_filho (pai, filho, fator) values
('234','146840',1.0),('234','233',1.0),('234','360627',1.0),('234','56401',1.0),('234','360597',1.0),('234','56403',1.0),('234','345577',1.0),('234','57377',1.0),('234','345576',1.0),('234','71567',1.0),('234','71785',1.0),('234','57376',1.0),('72075','1220',1.0),('72075','1222',1.0),('135326','268948',1.0),('135326','6752',1.0),('126951','269508',4.0),('333502','13098',0.083333),('22962','22963',1.0),('2385','16610',1.0),('279586','279585',0.2),('262222','8458',1.0),('5987','6004',1.0),('230327','6820',1.0),('77017','141413',1.0),('7517','6759',1.0),('242','92089',1.0),('274','273',1.0),('287941','89216',1.0),('634','16531',1.0),('394','461',1.0),('9125','9128',1.0),('15426','15428',1.0),('266752','298095',1.0),('266752','1883',1.0),('268742','346444',20.0),('148753','334289',1.0),('130200','334632',1.0),('73424','73425',1.0),('217','216',1.0),('88969','142624',2.5),('77185','136529',1.0),('262027','346451',40.0),('349','124284',1.0),('349','186237',5.0),('171','136530',1.0),('350','136525',1.0),('350','156637',3.3),('271572','302099',4.0),('325581','325618',1.0),('325581','325691',1.0),('302579','302581',0.166667),('192364','139127',0.027778),('6724','132446',25.0),('287940','334287',1.0),('343047','346509',4.0),('288900','288899',0.416667),('288900','288902',0.033333),('183328','183444',0.166667),('28103','136524',1.0),('28103','188766',5.0),('186','267325',1.0),('186','103891',1.0),('288905','3011',0.041667),('183321','183440',0.166667),('62476','136528',1.0),('78581','334093',1.0),('6695','9373',1.0),('60782','262433',0.166667),('183335','183446',0.166667),('302580','302583',0.166667),('241','16617',1.0),('235927','499',1.0),('22426','2806',0.333333),('345960','345963',1.0),('86206','86207',1.0),('263089','23044',1.0),('18534','188762',5.0),('326082','326085',1.0),('332','135946',1.0),('333499','333434',1.0),('106','9390',1.0),('124472','300985',1.0),('18779','139808',3.0),('288437','288438',1.0),('134869','134868',1.0),('288439','288440',1.0),('170961','280147',1.0),('18536','2808',0.333333),('66623','66626',0.333333),('177315','179697',36.0),('6746','16608',1.0),('163107','188815',1.0),('68546','68525',1.0),('363','89211',1.0),('347229','347231',1.0),('300061','342966',1.0),('129','16615',1.0),('179455','140820',2.0),('344934','344935',1.0),('347080','180882',1.0),('6464','6727',1.0),('77268','270858',1.0),('12595','12594',1.0),('263274','263272',1.0),('64805','64804',1.0),('136821','7493',0.166667),('266','265',1.0),('188450','17328',1.0),('188450','196',1.0),('139093','3030',0.222222),('3934','131071',3.0),('3934','132450',4.0),('270659','44313',1.0),('190081','11425',0.166667),('90738','11422',0.166667),('89072','82189',1.0),('6410','333306',1.0),('6442','6416',1.0),('14704','23089',1.0),('10831','392',1.0),('148605','146439',0.083333)
on conflict do nothing;

-- Permissões (mesmo padrão das outras ferramentas do ULVA) -------------
do $$ declare t text; begin
  foreach t in array array['ruptura_grupos','ruptura_grupo_regras','mix_cd_itens','ruptura_descontinuados','ruptura_coletas','ruptura_coleta_itens','produtos_pai_filho'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_tudo', t);
    execute format('create policy %I on public.%I for all using (true) with check (true)', t||'_tudo', t);
    execute format('grant all on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- 6) Universo de um grupo: tudo que o app precisa numa chamada só --------
-- Retorna os produtos do grupo (loja + CD), com EANs, saldo, última venda
-- (pai herda venda dos filhos), estoque no CD e se está descontinuado.
create or replace function public.ruptura_universo(p_grupo uuid)
returns table (
  codigo_interno text, produto text, eans text[], saldo numeric,
  ultima_venda date, no_cd boolean, estoque_cd numeric, cd_zerado_desde date,
  importacoes_zerado int, loja_trabalha boolean, descontinuado boolean, motivo_descontinuado text
) language sql stable as $$
  with regras as (select tipo, upper(valor) valor from ruptura_grupo_regras where grupo_id = p_grupo),
  est as (
    select distinct on (codigo_interno::text) codigo_interno::text cod, produto, quantidade
    from estoque_loja_itens where coalesce(codigo_interno::text,'') <> ''
    order by codigo_interno::text, atualizado_em desc
  ),
  cls as (select codigo_produto::text cod, upper(classe_5_nome) c5 from produtos_classes),
  base as (
    select cod, max(prod) prod from (
      select e.cod, e.produto prod from est e
      union all select m.codigo_interno, m.produto from mix_cd_itens m
    ) x group by cod
  ),
  -- Grupo do produto: subcategoria primeiro; sem subcategoria, pelo começo da descrição.
  -- Um produto entra no grupo pelo prefixo só se nenhuma regra de prefixo mais longa de outro grupo o pegar.
  dentro as (
    select b.cod, b.prod from base b left join cls c on c.cod = b.cod
    where (c.c5 is not null and c.c5 in (select valor from regras where tipo='classe5'))
       or (c.c5 is null and exists (
            select 1 from regras r where r.tipo='prefixo' and upper(b.prod) like r.valor||'%'
              and not exists (select 1 from ruptura_grupo_regras o
                              where o.tipo='prefixo' and o.grupo_id <> p_grupo
                                and length(o.valor) > length(r.valor)
                                and upper(b.prod) like upper(o.valor)||'%')))
  ),
  filhos as (select pai, filho from produtos_pai_filho where pai in (select cod from dentro)),
  venda as (
    select coalesce(f.pai, v.codigo_produto::text) cod, max(v.data_venda) ult
    from vendas_diarias v left join filhos f on f.filho = v.codigo_produto::text
    where v.venda_valor > 0 and (v.codigo_produto::text in (select cod from dentro) or f.pai is not null)
    group by 1
  ),
  ean as (
    select cod, array_agg(distinct ean) eans from (
      select codigo_interno::text cod, codigo_barras::text ean from estoque_loja_itens
        where codigo_interno::text in (select cod from dentro) and coalesce(codigo_barras::text,'') <> ''
      union select codigo_interno::text, codigo_barras::text from produtos_catalogo
        where codigo_interno::text in (select cod from dentro) and coalesce(codigo_barras::text,'') <> ''
    ) y group by cod
  )
  select d.cod, coalesce(e.produto, m.produto, d.prod), coalesce(ea.eans, '{}'),
         e.quantidade::numeric, v.ult::date,
         coalesce(m.no_formulario, false), m.estoque_cd, m.zerado_desde, coalesce(m.importacoes_zerado, 0),
         (e.cod is not null), (x.codigo_interno is not null), x.motivo
  from dentro d
  left join est e on e.cod = d.cod
  left join mix_cd_itens m on m.codigo_interno = d.cod
  left join venda v on v.cod = d.cod
  left join ean ea on ea.cod = d.cod
  left join ruptura_descontinuados x on x.codigo_interno = d.cod
  -- Escondidos: CD zerado (ou fora do formulário) e a loja nunca trabalhou.
  where e.cod is not null or (m.no_formulario and coalesce(m.estoque_cd,0) > 0)
  order by 2;
$$;
grant execute on function public.ruptura_universo(uuid) to anon, authenticated;
