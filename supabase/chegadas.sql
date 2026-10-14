-- =====================================================================
-- ULVA · Mercadoria que chegou (conferência de chegada)
-- O portal lê o PDF da nota (DANFE), cruza cada item com o Estoque Loja
-- e grava aqui uma "foto" do estoque ANTES da entrada: se estava em falta,
-- se é produto novo, se estava baixo. O app mostra para a equipe e cada
-- um marca o que já foi para a gôndola.
-- =====================================================================

create table if not exists public.chegadas_nf (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  emitente text,
  data_emissao date,
  valor_total numeric(14,2),
  total_itens int not null default 0,
  enviado_por text,
  enviado_em timestamptz not null default now()
);
create unique index if not exists chegadas_nf_numero_unico on public.chegadas_nf (numero);
create index if not exists chegadas_nf_enviado_em on public.chegadas_nf (enviado_em desc);

create table if not exists public.chegadas_itens (
  id uuid primary key default gen_random_uuid(),
  chegada_id uuid not null references public.chegadas_nf(id) on delete cascade,
  ordem int not null default 0,
  codigo_barras text,
  produto text not null,
  embalagem text,
  quantidade numeric(12,3),
  valor_unitario numeric(12,2),
  codigo_interno text,
  produto_loja text,
  saldo_loja numeric(12,3),
  preco_venda numeric(12,2),
  preco_custo numeric(12,2),
  grupo text not null,           -- falta | novo | baixo | negativo | normal
  setor text,                    -- mercearia, bebidas, limpeza... (classe do produto)
  observacao text,
  abastecido_em timestamptz,
  abastecido_por text,
  gerencia_avisada_em timestamptz,
  gerencia_avisada_por text
);
create index if not exists chegadas_itens_chegada on public.chegadas_itens (chegada_id);

alter table public.chegadas_nf enable row level security;
alter table public.chegadas_itens enable row level security;
drop policy if exists chegadas_nf_tudo on public.chegadas_nf;
create policy chegadas_nf_tudo on public.chegadas_nf for all using (true) with check (true);
drop policy if exists chegadas_itens_tudo on public.chegadas_itens;
create policy chegadas_itens_tudo on public.chegadas_itens for all using (true) with check (true);
grant all on public.chegadas_nf, public.chegadas_itens to anon, authenticated;
