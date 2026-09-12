-- PASSO 1: só leitura, não altera nada. Roda isso primeiro e me manda
-- o resultado (ou só me diz quantas linhas apareceram em cada consulta).

-- 1a) A tabela "perdas" tem mesmo a trava de duplicidade (chave única)?
select conname, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.perdas'::regclass and contype = 'u';

-- 1b) Quantos produtos aparecem mais de uma vez pro mesmo loja+período?
select loja, periodo_inicio, periodo_fim, produto_cod, produto, count(*) as vezes
from perdas
group by loja, periodo_inicio, periodo_fim, produto_cod, produto
having count(*) > 1
order by vezes desc, produto;

-- 1c) Total de linhas "extras" que seriam removidas na limpeza (uma
-- estimativa de quantas linhas duplicadas existem no total, olhando
-- produto+quantidade+valor iguais, sem depender do texto exato de loja/período)
select produto_cod, produto, quantidade, valor_perdido, count(*) as vezes
from perdas
group by produto_cod, produto, quantidade, valor_perdido
having count(*) > 1
order by vezes desc;
