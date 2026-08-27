-- Tabela de Perdas & Quebras — terceira parte do banco de dados.
--
-- IMPORTANTE (atualizado): essa tabela não é mais preenchida por registro
-- manual no app. Ela guarda os dados extraídos do relatório de perdas em
-- PDF que você manda no chat — a cada novo relatório, você roda um script
-- de importação (gerado sob medida pra aquele relatório) que insere/atualiza
-- as linhas aqui. Rodar este arquivo abaixo apaga a tabela antiga (se você
-- já tinha rodado a versão de registro manual) e recria do zero, já no
-- formato novo.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- (mesmo processo dos outros arquivos supabase/schema*.sql que você já rodou)

drop table if exists perdas;

create table perdas (
  id uuid primary key default gen_random_uuid(),
  loja text not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  setor text not null,           -- mapeado automaticamente a partir do sortimento
  sortimento text not null,      -- categoria do produto, como vem no relatório
  produto_cod text not null,     -- código do produto no relatório
  produto text not null,
  unidade text not null default 'un',
  quantidade numeric not null,       -- soma da quantidade perdida no período
  valor_perdido numeric not null,    -- soma do valor perdido (R$) no período
  valor_vendido numeric not null default 0, -- total vendido do produto no período (base do % de perda)
  pct_perda numeric,                 -- valor_perdido / valor_vendido * 100 (pode passar de 100%)
  importado_em timestamptz not null default now(),
  unique (loja, periodo_inicio, periodo_fim, produto_cod)
);

alter table perdas enable row level security;

create policy "Permitir leitura para todos"
  on perdas for select
  using (true);

create policy "Permitir escrita para todos"
  on perdas for all
  using (true)
  with check (true);
