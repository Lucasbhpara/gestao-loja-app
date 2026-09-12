-- PASSO 2: só roda isso DEPOIS de rodar e olhar o diagnóstico (passo 1).
-- Isso apaga as linhas duplicadas (mesma loja + período + código do
-- produto), mantendo só a mais recente de cada grupo, e depois garante que
-- a trava de duplicidade existe pra isso não acontecer de novo.

-- 2a) Apaga as duplicatas, mantendo a linha mais recente (maior importado_em)
-- de cada grupo loja+periodo_inicio+periodo_fim+produto_cod.
with duplicadas as (
  select id,
         row_number() over (
           partition by loja, periodo_inicio, periodo_fim, produto_cod
           order by importado_em desc, id desc
         ) as posicao
  from perdas
)
delete from perdas
where id in (select id from duplicadas where posicao > 1);

-- 2b) Garante a trava de duplicidade (só cria se ainda não existir) — sem
-- isso, uma reimportação futura do mesmo relatório volta a duplicar.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.perdas'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (loja, periodo_inicio, periodo_fim, produto_cod)'
  ) then
    alter table perdas
      add constraint perdas_loja_periodo_produto_key
      unique (loja, periodo_inicio, periodo_fim, produto_cod);
  end if;
end $$;

-- 2c) Confirma que não sobrou nenhuma duplicata.
select loja, periodo_inicio, periodo_fim, produto_cod, count(*) as vezes
from perdas
group by loja, periodo_inicio, periodo_fim, produto_cod
having count(*) > 1;
