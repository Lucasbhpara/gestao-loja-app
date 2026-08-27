-- Estoque Loja — tabela de consulta ao estoque real da loja 327.
--
-- Não tem ligação automática com o sistema/PDV da loja: é alimentada por
-- importação periódica (o Lucas reenvia a planilha "Produtos_Cadastrados" /
-- exportação de estoque, e um script regenera o arquivo de import abaixo,
-- que é rodado aqui no SQL Editor). A cada nova importação a tabela é
-- zerada e recriada do zero (ver supabase/estoque_loja_import.sql), então
-- ela sempre reflete só a última planilha enviada — não um histórico.
--
-- Mostra só produtos ATIVOS com estoque real diferente de zero (é o que foi
-- combinado com o Lucas) — quem decide isso é o script de importação, essa
-- tabela em si não tem essa restrição embutida no schema.
--
-- Acesso no app: só administração/gerência (tela fica dentro da Home Admin).
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- É seguro rodar de novo (idempotente) — se a tabela já existir, não faz nada.

create table if not exists estoque_loja_itens (
  id uuid primary key default gen_random_uuid(),
  codigo_interno text not null,
  produto text not null,
  codigo_barras text,
  quantidade numeric not null default 0,
  data_planilha date not null,
  atualizado_em timestamptz not null default now()
);

create unique index if not exists estoque_loja_itens_codigo_interno_key
  on estoque_loja_itens (codigo_interno);

-- Sem índice extra pra busca por nome: com ~9 mil linhas, a busca por
-- "ilike" na tela varre a tabela inteira em bem menos de 1 segundo.
