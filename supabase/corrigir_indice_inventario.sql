-- Correção isolada: como o script inteiro roda como um bloco só, o erro de
-- "política já existe" no fim do arquivo desfez também a correção do
-- índice lá no começo. Rodando só isso aqui (sem o resto do script), a
-- correção fica valendo de verdade.

drop index if exists inventario_itens_sortimento_codigo_interno_idx;
create unique index if not exists inventario_itens_sortimento_codigo_interno_idx
  on inventario_itens (sortimento, codigo_interno);
