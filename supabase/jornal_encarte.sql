-- Conferência no encarte (já aplicado no Supabase: migração jornal_encarte_marcacoes)
alter table public.jornal_itens add column if not exists pagina integer;
alter table public.jornal_itens add column if not exists pos_x numeric; -- 0..1 da largura da página
alter table public.jornal_itens add column if not exists pos_y numeric; -- 0..1 da altura da página
alter table public.jornal_campanhas add column if not exists jornal_oferta_id uuid references public.jornal_ofertas(id) on delete set null;

-- Conferência do jornal em lista (migração jornal_conferencia_itens)
alter table public.jornal_itens add column if not exists codigo text;
alter table public.jornal_itens add column if not exists conf_status text check (conf_status in ('ok','ruptura','falta_explosivo'));
alter table public.jornal_itens add column if not exists conf_em timestamptz;
alter table public.jornal_itens add column if not exists conf_por text;
