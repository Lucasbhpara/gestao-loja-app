-- Conferência do FLV — NF 000.229.432, emitida 26/08/2026, recebida na
-- loja 327 (transferência de mercadoria, valor total dos produtos R$ 17.694,48).
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- Depois disso a conferência já aparece pendente pro encarregado do FLV
-- conferir, item por item, direto no celular (ou no Portal Admin).

with nova_conferencia as (
  insert into conferencias (titulo, setor, criada_por_nome)
  values ('NF 229432 - Conferência FLV (26/08)', 'flv', 'Lucas Alberto')
  returning id
)
insert into conferencia_itens (conferencia_id, codigo_interno, produto, quantidade_esperada)
select nova_conferencia.id, itens.codigo_interno, itens.produto, itens.quantidade_esperada
from nova_conferencia, (values
    ('1250', 'JILO KG', 1),
    ('2448', 'PEPINO KG', 2),
    ('2530', 'PIMENTAO VERDE KG', 4),
    ('37815', 'BATATA DOCE BRANCA KG', 2),
    ('64248', 'TOMATE LONGA VIDA KG', 5),
    ('67232', 'BATATA DOCE ROXA KG', 3),
    ('67256', 'BERINJELA KG', 5),
    ('67263', 'BETERRABA KG', 5),
    ('67331', 'CARA/INHAME KG', 5),
    ('67416', 'CEBOLA AMARELA KG', 10),
    ('67430', 'CEBOLA ROXA KG', 2),
    ('67454', 'CENOURA VERMELHA KG', 5),
    ('67492', 'CHUCHU KG', 2),
    ('67782', 'ABOBORA ITALIANA KG', 2),
    ('71314', 'TOMATE ITALIANO ANDREA KG', 10),
    ('7898114190167', 'VAGEM 300G BJ', 1),
    ('199933', 'PIMENTAO AMARELO/VERMELHO KG', 1),
    ('7898947710426', 'TOMATE SWEET GRAPE 300G BJ', 2),
    ('1366', 'LARANJA BAHIA KG', 10),
    ('1397', 'LIMAO KG', 5),
    ('2035', 'MEXERICA PONKAN KG', 10),
    ('8761', 'MANGA PALMER KG', 1),
    ('30441', 'ABACAXI UN', 10),
    ('67195', 'BANANA CATURRA KG', 10),
    ('67218', 'BANANA PRATA KG', 10),
    ('67690', 'ABACATE KG', 4),
    ('46435', 'ALHO GRANEL KG', 15),
    ('67249', 'BATATA INGLESA KG', 20),
    ('67850', 'ABOBORA MORANGA JAPONESA KG', 5),
    ('1908', 'MACA NACIONAL FUJI KG', 6),
    ('1915', 'MACA NACIONAL GALA KG', 10),
    ('1939', 'MAMAO FORMOSO KG', 4),
    ('1946', 'MAMAO HAVAI KG', 4),
    ('2011', 'MELANCIA KG', 10),
    ('2028', 'MELAO AMARELO KG', 2),
    ('2462', 'PERA KG', 2),
    ('5258', 'PESSEGO IMPORTADO KG', 2),
    ('7898114190037', 'MORANGO 250G BJ', 10),
    ('33176', 'GOIABA VERMELHA KG', 4),
    ('68178', 'AMEIXA IMPORTADA KG', 2),
    ('7898703000464', 'UVA CRIMSON 500G BJ', 2),
    ('7898949747932', 'UVA THOMPSON 500G BJ', 6),
    ('7898217410339', 'UVA RUBI 500G BJ', 2),
    ('7898957749027', 'UVA RED GLOBE 500G BJ', 2),
    ('7898949747949', 'UVA VITORIA 500G BJ', 15),
    ('272087', 'MELANCIA PINGO DOCE KG', 5)
) as itens(codigo_interno, produto, quantidade_esperada);
