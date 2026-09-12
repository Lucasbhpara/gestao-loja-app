-- Mapa da Loja 327 — carga inicial das áreas, com posição (x/y/largura/altura em
-- % da imagem) já calculada em cima do croqui real da loja que o Lucas enviou.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
-- Pode rodar de novo sem problema — ele apaga as áreas existentes antes de
-- recriar (se você já subiu fotos numa área, elas somem junto: 'on delete
-- cascade' em mapa_fotos — só rode de novo se quiser mesmo recomeçar).
--
-- Depois de rodar: abre o portal → Mapa da Loja. Cada botão já aparece na
-- posição certa em cima do desenho da loja. Se algum botão ficar um pouco
-- fora do lugar, dá pra arrastar e ajustar direto ali no editor do portal.
--
-- ATENÇÃO: como você já rodou esse seed e já ajustou posições/tamanhos
-- direto no portal, NÃO rode esse arquivo de novo agora — ele apaga tudo
-- e recria do zero, perdendo os ajustes que você já fez. Esse arquivo fica
-- só de referência/histórico.

delete from mapa_areas;

insert into mapa_areas (nome, tipo, pos_x, pos_y, pos_w, pos_h, cor, ordem) values
('Pets', 'setor', 5.653, 0.746, 17.986, 8.201, '#2C3F8C', 0),
('Inseticida / Bazar cama, mesa e banho', 'corredor', 13.361, 16.004, 4.162, 20.527, '#6B4FA0', 1),
('Limpeza piso', 'corredor', 20.915, 16.054, 4.111, 20.577, '#1D8A8A', 2),
('Limpeza cozinha', 'corredor', 28.417, 16.054, 4.162, 20.527, '#4C6EF5', 3),
('Limpeza lavanderia', 'corredor', 35.92, 16.103, 4.162, 20.527, '#9C6ADE', 4),
('Perfumaria descartável', 'corredor', 43.474, 16.004, 4.214, 20.626, '#3F6B52', 5),
('Perfumaria infantil', 'corredor', 51.233, 16.054, 4.111, 20.527, '#B4650E', 6),
('Perfumaria higiene', 'corredor', 58.53, 16.004, 4.214, 20.527, '#2FA36B', 7),
('Perfumaria beleza', 'corredor', 67.009, 16.004, 4.214, 20.527, '#D6455D', 8),
('Bebidas destiladas', 'corredor', 74.717, 15.954, 4.162, 20.577, '#4E8CA6', 9),
('Ponto extra', 'ponto-extra', 90.031, 16.849, 3.032, 20.179, '#6B4FA0', 11),
('Farináceo leve', 'corredor', 13.464, 42.247, 4.214, 20.427, '#1D8A8A', 12),
('Massas / Instantâneo', 'corredor', 21.069, 42.247, 4.111, 20.427, '#4C6EF5', 13),
('Conservas / Atomatados / Tempero', 'corredor', 28.571, 42.247, 4.162, 20.427, '#9C6ADE', 14),
('Conservas fastfood', 'corredor', 36.023, 42.296, 4.162, 20.378, '#3F6B52', 15),
('Bazar utilidades', 'corredor', 43.577, 42.197, 4.162, 20.427, '#B4650E', 16),
('Bomboniere', 'corredor', 51.285, 42.197, 4.162, 20.427, '#2FA36B', 17),
('Sobremesa', 'corredor', 58.633, 42.197, 4.214, 20.378, '#D6455D', 18),
('Biscoito', 'corredor', 67.163, 42.097, 4.214, 20.477, '#4E8CA6', 19),
('Energético / Salgadinho', 'corredor', 74.769, 42.097, 4.265, 20.527, '#2C3F8C', 20),
('Suco', 'corredor', 82.22, 42.247, 4.214, 20.477, '#6B4FA0', 21),
('Água mineral / Refrigerante', 'corredor', 89.928, 42.197, 4.265, 20.527, '#1D8A8A', 22),
('Ponto extra', 'ponto-extra', 6.423, 42.843, 2.98, 19.93, '#4C6EF5', 23),
('FLV', 'setor', 8.684, 68.29, 12.641, 22.416, '#9C6ADE', 24),
('Ilhas congelado', 'setor', 24.872, 68.34, 35.612, 21.769, '#3F6B52', 25),
('Light / Diet', 'corredor', 66.136, 68.29, 3.392, 18.588, '#B4650E', 26),
('Café / Chá / Rosquinha / Biscoito de polvilho', 'corredor', 73.69, 68.241, 3.443, 18.588, '#2FA36B', 27),
('Matinais', 'corredor', 81.089, 68.241, 2.364, 19.284, '#D6455D', 28),
('Leite / Leites especiais', 'corredor', 83.453, 68.241, 2.364, 19.284, '#4E8CA6', 29),
('Vassouras / Festa', 'setor', 0.257, 31.312, 2.826, 20.875, '#2C3F8C', 30),
('Farináceos pesado / Açúcar / Óleo', 'setor', 0.257, 52.187, 2.826, 20.875, '#6B4FA0', 31),
('Refrigerante PET / Cervejas', 'setor', 97.02, 19.881, 2.98, 37.276, '#1D8A8A', 32),
('Geladeira', 'setor', 97.379, 2.982, 2.364, 7.952, '#4C6EF5', 33);
