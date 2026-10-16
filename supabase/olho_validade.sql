-- =====================================================================
-- ULVA · De olho na validade
-- Cliente encontrou produto vencido: a loja registra a ocorrência com os
-- dados do cupom fiscal (lidos do QR Code), o produto, a retirada do
-- restante da área de venda, fotos e as assinaturas de quem registrou,
-- do gerente e do responsável do setor. Depois de salva, não muda.
-- (Copiado do Prevenção SBH e adaptado ao ULVA.)
-- =====================================================================

create table if not exists public.olho_validade (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  registrado_por_matricula text,
  registrado_por_nome text,

  -- cupom fiscal (NFC-e)
  cupom_chave text,
  cupom_url text,
  cupom_numero text,
  cupom_serie text,
  cupom_cnpj text,
  cupom_emissao timestamptz,
  cupom_total numeric(12,2),

  -- produto vencido
  produto_descricao text not null,
  produto_codigo text,
  setor text not null,
  valor_unitario numeric(12,2),
  data_validade date,

  -- perguntas
  restante_retirado boolean not null,
  qtd_encontrada numeric(12,3) not null default 0,
  valor_retirado numeric(12,2) not null default 0,
  estava_na_blitz boolean not null,
  observacao text,

  fotos text[] not null default '{}',
  assinaturas jsonb not null default '[]',  -- [{papel, nome, tracos, largura, altura, assinada_em}]

  constraint olho_validade_tem_foto check (cardinality(fotos) >= 1),
  constraint olho_validade_tem_assinaturas check (jsonb_array_length(assinaturas) >= 3)
);
create index if not exists olho_validade_criado_em on public.olho_validade (criado_em desc);

alter table public.olho_validade enable row level security;
drop policy if exists olho_validade_ler on public.olho_validade;
create policy olho_validade_ler on public.olho_validade for select using (true);
drop policy if exists olho_validade_inserir on public.olho_validade;
create policy olho_validade_inserir on public.olho_validade for insert with check (true);
grant select, insert on public.olho_validade to anon, authenticated;

-- Fotos (bucket público, igual aos outros do ULVA)
insert into storage.buckets (id, name, public)
values ('olho-validade-fotos', 'olho-validade-fotos', true)
on conflict (id) do nothing;
drop policy if exists olho_validade_fotos_ler on storage.objects;
create policy olho_validade_fotos_ler on storage.objects for select using (bucket_id = 'olho-validade-fotos');
drop policy if exists olho_validade_fotos_enviar on storage.objects;
create policy olho_validade_fotos_enviar on storage.objects for insert with check (bucket_id = 'olho-validade-fotos');
drop policy if exists olho_validade_fotos_atualizar on storage.objects;
create policy olho_validade_fotos_atualizar on storage.objects for update using (bucket_id = 'olho-validade-fotos');

select 'olho_validade pronta' as ok;
