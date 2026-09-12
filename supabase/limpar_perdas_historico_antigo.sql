-- Limpeza única: apaga TODAS as linhas de "perdas" que não são do período
-- mais recente de cada setor, mantendo só o relatório mais atual.
-- (Depois disso, o portal atualizado já evita esse acúmulo sozinho a cada
-- nova importação — esse script é só pra arrumar o que já ficou pra trás.)

with mais_recente_por_setor as (
  select setor, max(periodo_fim) as periodo_fim_recente
  from perdas
  group by setor
)
delete from perdas p
using mais_recente_por_setor m
where p.setor = m.setor
  and p.periodo_fim < m.periodo_fim_recente;

-- Confirma o que sobrou: deve ter só 1 período por setor agora.
select setor, periodo_inicio, periodo_fim, count(*) as itens
from perdas
group by setor, periodo_inicio, periodo_fim
order by setor;
