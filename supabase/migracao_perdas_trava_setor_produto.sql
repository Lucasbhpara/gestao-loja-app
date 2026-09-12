-- Corrige de vez a "quebra duplicada": até agora, se a importação de Perdas
-- rodasse numa aba do portal com a página desatualizada, o passo que apaga
-- o relatório anterior podia não rodar de verdade — e o mesmo produto ficava
-- salvo duas vezes (às vezes no mesmo período, às vezes em períodos
-- diferentes), somando errado no total.
--
-- Esse script:
--   1) limpa o que já está duplicado hoje (mantém só a linha mais recente
--      de cada produto em cada setor);
--   2) trava isso no banco pra nunca mais poder duplicar — só pode existir
--      UMA linha por (setor, código do produto). A próxima importação
--      atualiza essa linha em vez de criar outra, não importa se a aba do
--      portal está com a versão antiga da página aberta ou não.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.

-- 1) Limpeza: por (setor, produto_cod), mantém só a linha com o
--    importado_em mais recente (produto_cod só entra pra desempatar linhas
--    com timestamp idêntico, o que não deveria acontecer mas evita erro).
delete from perdas p
using perdas p2
where p.setor = p2.setor
  and p.produto_cod = p2.produto_cod
  and (
    p.importado_em < p2.importado_em
    or (p.importado_em = p2.importado_em and p.id < p2.id)
  );

-- 2) Trava: nunca mais duas linhas do mesmo produto no mesmo setor ao
--    mesmo tempo.
alter table perdas drop constraint if exists perdas_setor_produto_cod_key;
alter table perdas
  add constraint perdas_setor_produto_cod_key
  unique (setor, produto_cod);

-- Conferência: essa consulta deve voltar 0 linhas se a limpeza funcionou.
select setor, produto_cod, count(*) as vezes_repetido
from perdas
group by setor, produto_cod
having count(*) > 1;
