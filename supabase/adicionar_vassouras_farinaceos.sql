-- Recoloca as duas áreas que foram removidas: "Vassouras / Festa" e
-- "Farináceos pesado / Açúcar / Óleo". Volta na MESMA posição de antes
-- (parede esquerda) — como aquele local pode não ser o certo de verdade,
-- depois de rodar é só arrastar cada caixa pro lugar certo direto no
-- portal (Mapa da Loja → arrasta a área), igual você já fez com a Pets.
--
-- Como rodar: SQL Editor do Supabase → New query → cola isso → Run.
-- Só adiciona essas duas de volta — não mexe em mais nada.

insert into mapa_areas (nome, tipo, pos_x, pos_y, pos_w, pos_h, cor, ordem) values
('Vassouras / Festa', 'setor', 0.257, 31.312, 2.826, 20.875, '#2C3F8C', 30),
('Farináceos pesado / Açúcar / Óleo', 'setor', 0.257, 52.187, 2.826, 20.875, '#6B4FA0', 31);
