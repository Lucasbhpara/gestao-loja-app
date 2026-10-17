-- =====================================================================
-- ULVA · Resultados de inventário (resumo por setor e período)
-- O Portal lê o PDF "Resultado de Inventário" (pdf.js), confere a soma dos
-- produtos com o Total Geral e grava aqui só o resumo: resultado final,
-- metas, quebra e sobra brutas e os destaques (maiores quebras, maiores
-- sobras e produtos com saldo negativo). Importar o mesmo setor e período
-- de novo substitui o anterior. A cada resultado novo, os administradores
-- recebem uma notificação no celular.
-- Rodar uma vez no SQL Editor do Supabase.
-- =====================================================================

create table if not exists public.inventario_resultados (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  importado_por text,
  arquivo_nome text,
  setor text not null,
  loja text,
  nome_loja text,
  supervisor text,
  periodo_inicio date not null,
  periodo_fim date not null,
  venda numeric(14,2) not null default 0,
  perda_total numeric(14,2) not null default 0,
  perda_total_pct numeric(7,2),
  perda_identificada numeric(14,2),
  perda_identificada_pct numeric(7,2),
  perda_nao_identificada numeric(14,2),
  perda_nao_identificada_pct numeric(7,2),
  meta_total_pct numeric(7,2),
  meta_identificada_pct numeric(7,2),
  meta_nao_identificada_pct numeric(7,2),
  quebra_bruta numeric(14,2),
  sobra_bruta numeric(14,2),
  n_produtos int,
  n_quebra int,
  n_sobra int,
  n_com_quebra_lancada int,
  destaques jsonb not null default '{}',
  constraint inventario_resultados_periodo unique (setor, periodo_inicio, periodo_fim)
);
create index if not exists inventario_resultados_fim on public.inventario_resultados (periodo_fim desc);

alter table public.inventario_resultados enable row level security;
drop policy if exists inventario_resultados_ler on public.inventario_resultados;
create policy inventario_resultados_ler on public.inventario_resultados for select using (true);
drop policy if exists inventario_resultados_inserir on public.inventario_resultados;
create policy inventario_resultados_inserir on public.inventario_resultados for insert with check (true);
drop policy if exists inventario_resultados_atualizar on public.inventario_resultados;
create policy inventario_resultados_atualizar on public.inventario_resultados for update using (true) with check (true);
grant select, insert, update on public.inventario_resultados to anon, authenticated;

-- Histórico que já estava no Painel Resultados (FLV e Açougue, jul–set/2026)
insert into public.inventario_resultados (setor, loja, nome_loja, supervisor, periodo_inicio, periodo_fim, venda, perda_total, perda_total_pct, perda_identificada, perda_identificada_pct, perda_nao_identificada, perda_nao_identificada_pct, meta_total_pct, meta_identificada_pct, meta_nao_identificada_pct, quebra_bruta, sobra_bruta, n_produtos, n_quebra, n_sobra, n_com_quebra_lancada, destaques, importado_por) values
  ('FLV', '327', 'ITATIAIUCU', 'REINALDO S.', '2026-07-27', '2026-08-23', 375451.62, 22951.34, 6.1, 16863.25, 4.5, 6088.09, 1.6, 6.0, 4.7, 1.3, 27492.69, -4541.32, 104, 74, 30, 76, '{"maiores_quebras": [{"codigo": "6724", "produto": "BATATA INGLESA KG", "valor": 3039.26, "pct": 15.8}, {"codigo": "182167", "produto": "OVOS BCOS.MANTIQUEIRA GDE.C/30 BJ", "valor": 2497.44, "pct": 6.9}, {"codigo": "188450", "produto": "MANDIOCA EMBALADA DESC.1KG PT", "valor": 1807.61, "pct": 0.0}, {"codigo": "6424", "produto": "TOMATE LONGA VIDA KG", "valor": 1501.43, "pct": 16.0}, {"codigo": "203", "produto": "MEXERICA PONKAN KG", "valor": 1360.92, "pct": 14.6}], "maiores_sobras": [{"codigo": "17328", "produto": "MANDIOCA EMBALADA 1KG PT", "valor": -1241.17, "pct": -80.9}, {"codigo": "138", "produto": "LARANJA SERRA D''AGUA KG", "valor": -480.09, "pct": -87.6}, {"codigo": "190", "produto": "MACA NACIONAL FUJI KG", "valor": -289.29, "pct": -2.7}, {"codigo": "139", "produto": "LIMAO KG", "valor": -242.93, "pct": -2.7}, {"codigo": "59536", "produto": "LARANJA BAHIA IMPORTADA KG", "valor": -223.21, "pct": -65.6}], "vendeu_sem_estoque": []}'::jsonb, 'histórico (Painel Resultados)'),
  ('FLV', '327', 'ITATIAIUCU', 'REINALDO S.', '2026-08-24', '2026-09-28', 461455.94, 21609.64, 4.7, 20171.68, 4.4, 1437.96, 0.3, 6.0, 4.7, 1.3, 28307.0, -6697.33, 99, 69, 30, 76, '{"maiores_quebras": [{"codigo": "6724", "produto": "BATATA INGLESA KG", "valor": 3932.52, "pct": 12.1}, {"codigo": "7131", "produto": "TOMATE ITALIANO ANDREA KG", "valor": 2400.96, "pct": 10.7}, {"codigo": "188450", "produto": "MANDIOCA EMBALADA DESC.1KG PT", "valor": 2303.16, "pct": 0.0}, {"codigo": "139", "produto": "LIMAO KG", "valor": 1549.76, "pct": 11.0}, {"codigo": "5610", "produto": "MEXERICA MURCOTE KG", "valor": 1479.44, "pct": 28.0}], "maiores_sobras": [{"codigo": "17328", "produto": "MANDIOCA EMBALADA 1KG PT", "valor": -1578.69, "pct": -81.4}, {"codigo": "182167", "produto": "OVOS BCOS.MANTIQUEIRA GDE.C/30 BJ", "valor": -1010.41, "pct": -2.0}, {"codigo": "203", "produto": "MEXERICA PONKAN KG", "valor": -720.9, "pct": -32.9}, {"codigo": "876", "produto": "MANGA PALMER KG", "valor": -542.41, "pct": -13.1}, {"codigo": "344146", "produto": "OVOS VERM.MANTIQUEIRA EXTRA C/10 BJ", "valor": -350.0, "pct": -76.6}], "vendeu_sem_estoque": [{"codigo": "3074", "produto": "MORANGO 250G BJ", "vendas": 283.0, "saldo": -18.0}, {"codigo": "125", "produto": "JILO KG", "vendas": 166.09, "saldo": -21.35}, {"codigo": "6719", "produto": "BANANA CATURRA KG", "vendas": 1895.66, "saldo": -11.81}, {"codigo": "3317", "produto": "GOIABA VERMELHA KG", "vendas": 222.99, "saldo": -0.19}, {"codigo": "89750", "produto": "LIMAO SICILIANO KG", "vendas": 2.51, "saldo": -0.05}, {"codigo": "3252", "produto": "UVA ITALIA 500G BJ", "vendas": 72.0, "saldo": -2.0}, {"codigo": "91040", "produto": "ABOBORA MENINA 408G BJ", "vendas": 1.0, "saldo": -1.0}, {"codigo": "6425", "produto": "PEPINO CAIPIRA KG", "vendas": 2.41, "saldo": -2.41}, {"codigo": "6814", "produto": "BANANA DA TERRA KG", "vendas": 1.28, "saldo": -1.28}, {"codigo": "6744", "produto": "CENOURA BAROA KG", "vendas": 1.41, "saldo": -1.41}, {"codigo": "6519", "produto": "MACA GRAN SMITH KG", "vendas": 1.15, "saldo": -1.15}, {"codigo": "6782", "produto": "ABOBORA MENINA KG", "vendas": 6.58, "saldo": -6.58}, {"codigo": "235900", "produto": "MELANCIA AMARELA KG", "vendas": 7.7, "saldo": -7.7}, {"codigo": "499", "produto": "PEPINO JAPONES 500G BJ", "vendas": 6.0, "saldo": -6.0}, {"codigo": "194", "produto": "MAMAO HAVAI KG", "vendas": 616.47, "saldo": -44.42}, {"codigo": "201", "produto": "MELANCIA KG", "vendas": 1524.13, "saldo": -102.81}, {"codigo": "138", "produto": "LARANJA SERRA D''AGUA KG", "vendas": 61.36, "saldo": -21.36}, {"codigo": "107449", "produto": "TOMATE SWEET GRAPE 300G BJ", "vendas": 382.0, "saldo": -28.0}, {"codigo": "88986", "produto": "ABOBORA MORANGA VERM.KG", "vendas": 161.45, "saldo": -161.45}, {"codigo": "334529", "produto": "RAPADURA H&M C/COCO 500G PT", "vendas": 12.0, "saldo": -12.0}, {"codigo": "7887", "produto": "BATATA BOLINHA KG", "vendas": 413.33, "saldo": -124.78}, {"codigo": "1804", "produto": "PERA PORTUGUESA KG", "vendas": 14.2, "saldo": -14.2}, {"codigo": "196", "produto": "MANDIOCA KG", "vendas": 64.82, "saldo": -65.27}, {"codigo": "181230", "produto": "MELANCIA PINGO DOCE KG", "vendas": 456.31, "saldo": -85.77}, {"codigo": "6721", "produto": "BANANA PRATA KG", "vendas": 2239.84, "saldo": -129.29}, {"codigo": "59536", "produto": "LARANJA BAHIA IMPORTADA KG", "vendas": 82.51, "saldo": -82.51}, {"codigo": "344146", "produto": "OVOS VERM.MANTIQUEIRA EXTRA C/10 BJ", "vendas": 52.0, "saldo": -4.0}, {"codigo": "876", "produto": "MANGA PALMER KG", "vendas": 823.68, "saldo": -131.58}, {"codigo": "203", "produto": "MEXERICA PONKAN KG", "vendas": 439.62, "saldo": -212.34}, {"codigo": "17328", "produto": "MANDIOCA EMBALADA 1KG PT", "vendas": 191.0, "saldo": -214.0}]}'::jsonb, 'histórico (Painel Resultados)'),
  ('Açougue', '327', 'ITATIAIUCU', 'REINALDO S.', '2026-07-28', '2026-08-24', 584720.81, 19366.75, 3.3, 1059.54, 0.2, 18307.21, 3.1, 4.0, 1.5, 2.5, 39698.15, -20331.41, 65, 41, 24, 9, '{"maiores_quebras": [{"codigo": "130200", "produto": "CARNE BOV.PICANHA FRIBOI MATURATTA KG", "valor": 7008.13, "pct": 57.6}, {"codigo": "9018", "produto": "CARNE BOV.PA RESF.PCA/PED.KG", "valor": 6452.91, "pct": 29.0}, {"codigo": "2385", "produto": "CARNE BOV.C.FILE RESF.PCA/PED.KG", "valor": 2802.57, "pct": 5.5}, {"codigo": "148753", "produto": "CARNE BOV.ANCHO FRIBOI MATUR.RESF.KG", "valor": 2389.65, "pct": 59.8}, {"codigo": "7517", "produto": "CARNE BOV.DOBRADINHA CONG.KG", "valor": 2376.21, "pct": 92.5}], "maiores_sobras": [{"codigo": "232", "produto": "CARNE BOV.MUSCULO RESF.PCA/PED.KG", "valor": -6301.87, "pct": -13.9}, {"codigo": "6794", "produto": "CARNE BOV.ACEM RESF.KG", "valor": -3516.54, "pct": -14.2}, {"codigo": "270659", "produto": "FRANGO CAIPIRA NHO BENTO CORT.CONG.KG", "valor": -1749.54, "pct": -233.6}, {"codigo": "135326", "produto": "CARNE BOV.COSTELA C/OSSO KG", "valor": -1616.6, "pct": -19.4}, {"codigo": "28103", "produto": "LINGUICA SEARA CARNE SUINA KG", "valor": -1217.94, "pct": -16.9}], "vendeu_sem_estoque": [{"codigo": "68304", "produto": "CARNE BOV.C.FILE NOIX PORC.RESF.KG", "vendas": 47.9, "saldo": -0.04}, {"codigo": "280861", "produto": "CARNE SUINA BARRIGA COZINHA PREM.TEMP.KG", "vendas": 17.38, "saldo": -0.38}, {"codigo": "159625", "produto": "ALCAT.COZINHA CARNE SUINA PREM.TEMP.KG", "vendas": 19.98, "saldo": -0.98}, {"codigo": "4983", "produto": "GALINHA CONG.GORDA KG", "vendas": 51.67, "saldo": -51.67}, {"codigo": "135326", "produto": "CARNE BOV.COSTELA C/OSSO KG", "vendas": 278.95, "saldo": -75.99}, {"codigo": "232", "produto": "CARNE BOV.MUSCULO RESF.PCA/PED.KG", "vendas": 1663.04, "saldo": -208.07}]}'::jsonb, 'histórico (Painel Resultados)'),
  ('Açougue', '327', 'ITATIAIUCU', 'MARCOS CAMPIDELI', '2026-08-25', '2026-09-29', 705550.88, 746.76, 0.1, 1034.93, 0.1, -288.17, 0.0, 4.0, 1.5, 2.5, 46567.52, -45820.76, 72, 33, 39, 6, '{"maiores_quebras": [{"codigo": "9018", "produto": "CARNE BOV.PA RESF.PCA/PED.KG", "valor": 10019.28, "pct": 34.9}, {"codigo": "6812", "produto": "CARNE BOV.ALCATRA RESF.PCA/PED.KG", "valor": 6502.67, "pct": 32.7}, {"codigo": "243", "produto": "PEITO FGO.RESF.KG", "valor": 5725.71, "pct": 207.1}, {"codigo": "2385", "produto": "CARNE BOV.C.FILE RESF.PCA/PED.KG", "valor": 3465.17, "pct": 5.3}, {"codigo": "187", "produto": "CARNE BOV.MACA PEITO RESF.PC/PD.KG", "valor": 2821.66, "pct": 9.8}], "maiores_sobras": [{"codigo": "232", "produto": "CARNE BOV.MUSCULO RESF.PCA/PED.KG", "valor": -11695.79, "pct": -24.9}, {"codigo": "6794", "produto": "CARNE BOV.ACEM RESF.KG", "valor": -6458.22, "pct": -17.8}, {"codigo": "77185", "produto": "LINGUICA PERDIGAO KG LCSP", "valor": -4685.37, "pct": -12.1}, {"codigo": "56057", "produto": "FILE PEITO FGO.IN NATURA CONG.KG", "valor": -3788.94, "pct": -55.3}, {"codigo": "106", "produto": "FILE PEITO FGO.RESF.KG", "valor": -3237.27, "pct": -45.8}], "vendeu_sem_estoque": [{"codigo": "264", "produto": "MOELA FGO.CONG.KG", "vendas": 3.07, "saldo": -3.07}, {"codigo": "62476", "produto": "LINGUICA AURORA FGO.KG", "vendas": 107.2, "saldo": -9.2}, {"codigo": "298095", "produto": "CARNE BOV.PICANHA TRAD.CONG.KG", "vendas": 17.08, "saldo": -17.08}, {"codigo": "4983", "produto": "GALINHA CONG.GORDA KG", "vendas": 135.16, "saldo": -135.16}, {"codigo": "371", "produto": "PEITO FGO.IN NATURA CONG.KG", "vendas": 702.0, "saldo": -123.11}, {"codigo": "77185", "produto": "LINGUICA PERDIGAO KG LCSP", "vendas": 2446.5, "saldo": -273.5}, {"codigo": "232", "produto": "CARNE BOV.MUSCULO RESF.PCA/PED.KG", "vendas": 1641.91, "saldo": -377.44}]}'::jsonb, 'histórico (Painel Resultados)')
on conflict (setor, periodo_inicio, periodo_fim) do nothing;

-- Notificação: resultado novo avisa os administradores no celular.
-- (criada depois do histórico, para não disparar avisos dos inventários antigos)
create or replace function public.notificar_inventario_resultado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  mensagens jsonb;
  dentro boolean := new.meta_total_pct is null or new.perda_total_pct <= new.meta_total_pct;
  titulo text := '📊 Resultado do inventário · ' || new.setor;
  corpo text;
begin
  corpo := to_char(new.periodo_inicio, 'DD/MM') || ' a ' || to_char(new.periodo_fim, 'DD/MM') ||
           ': perda total ' || replace(to_char(new.perda_total_pct, 'FM9990.0'), '.', ',') || '%' ||
           case when new.meta_total_pct is not null
                then ' (meta ' || replace(to_char(new.meta_total_pct, 'FM9990.0'), '.', ',') || '%) ' || case when dentro then '✅' else '❌' end
                else '' end ||
           ' · R$ ' || replace(to_char(new.perda_total, 'FM9999990.00'), '.', ',') || '. Veja no Portal.';

  select coalesce(jsonb_agg(jsonb_build_object(
           'to', t.expo_push_token, 'title', titulo, 'body', corpo, 'sound', 'default',
           'data', jsonb_build_object('tipo', 'inventario_resultado', 'id', new.id)
         )), '[]'::jsonb)
    into mensagens
    from (select distinct pt.expo_push_token
            from push_tokens pt
            join colaboradores c on c.id = pt.colaborador_id
           where c.is_admin = true) t;

  if jsonb_array_length(mensagens) > 0 then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := mensagens
    );
  end if;
  return new;
exception when others then
  return new;  -- a notificação nunca impede o registro
end;
$$;

drop trigger if exists inventario_resultados_notificar on public.inventario_resultados;
create trigger inventario_resultados_notificar
  after insert on public.inventario_resultados
  for each row execute function public.notificar_inventario_resultado();

select 'inventario_resultados pronta' as ok;
