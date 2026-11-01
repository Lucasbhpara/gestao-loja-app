-- Conferência no encarte (já aplicado no Supabase: migração jornal_encarte_marcacoes)
alter table public.jornal_itens add column if not exists pagina integer;
alter table public.jornal_itens add column if not exists pos_x numeric; -- 0..1 da largura da página
alter table public.jornal_itens add column if not exists pos_y numeric; -- 0..1 da altura da página
alter table public.jornal_campanhas add column if not exists jornal_oferta_id uuid references public.jornal_ofertas(id) on delete set null;
