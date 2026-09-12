-- Remove a área "(sem sortimento definido)" — aquele espaço entre
-- "Bebidas destiladas" e "Ponto extra" que ficou sem categoria e que,
-- conforme confirmado, não é uma seção de verdade (rack extra/sobra).
--
-- Como rodar: SQL Editor do Supabase → New query → cola isso → Run.
-- Só remove essa área — não mexe em mais nada. (Se preferir, dá pra fazer
-- a mesma coisa clicando no "×" dessa caixa direto no Mapa da Loja do portal.)

delete from mapa_areas where nome = '(sem sortimento definido)';
