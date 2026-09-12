-- OPCIONAL: apaga TODAS as áreas do Mapa da Loja de uma vez.
--
-- Use isso só se quiser começar do zero pra desenhar as áreas em cima da
-- planta nova (as posições antigas foram calculadas pra outra imagem e não
-- vão bater com a planta nova). Se preferir, também dá pra ir apagando uma
-- por uma direto no portal, clicando no "×" de cada área.
--
-- ATENÇÃO: isso apaga TODAS as áreas e as fotos delas (cascade). Não tem
-- como desfazer. Só rode se tiver certeza.
--
-- Como rodar: SQL Editor do Supabase → New query → cola isso → Run.

delete from mapa_areas;
