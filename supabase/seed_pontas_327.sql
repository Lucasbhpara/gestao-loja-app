-- Cadastra as 44 pontas da unidade 327, numeradas de 1 a 44.
--
-- Pré-requisito: já ter rodado supabase/schema_pontas_extras.sql (cria as
-- tabelas pontas_extras e pontas_produtos). Se ainda não rodou, roda esse
-- primeiro.
--
-- Como rodar: SQL Editor do Supabase → New query → cola tudo isso → Run.
--
-- Cada ponta sai sem local definido (coluna "local" fica em branco) — dá
-- pra completar depois, uma por uma, direto no portal (lápis ✎ no card da
-- ponta) se quiser marcar o corredor/posição de cada uma.
--
-- ATENÇÃO: se rodar de novo, cria as 44 de novo (duplicadas). Só rode uma
-- vez. Se precisar recomeçar do zero, apaga antes com:
--   delete from pontas_extras;

insert into pontas_extras (nome, local, ordem) values
('Ponta 1', null, 0),
('Ponta 2', null, 1),
('Ponta 3', null, 2),
('Ponta 4', null, 3),
('Ponta 5', null, 4),
('Ponta 6', null, 5),
('Ponta 7', null, 6),
('Ponta 8', null, 7),
('Ponta 9', null, 8),
('Ponta 10', null, 9),
('Ponta 11', null, 10),
('Ponta 12', null, 11),
('Ponta 13', null, 12),
('Ponta 14', null, 13),
('Ponta 15', null, 14),
('Ponta 16', null, 15),
('Ponta 17', null, 16),
('Ponta 18', null, 17),
('Ponta 19', null, 18),
('Ponta 20', null, 19),
('Ponta 21', null, 20),
('Ponta 22', null, 21),
('Ponta 23', null, 22),
('Ponta 24', null, 23),
('Ponta 25', null, 24),
('Ponta 26', null, 25),
('Ponta 27', null, 26),
('Ponta 28', null, 27),
('Ponta 29', null, 28),
('Ponta 30', null, 29),
('Ponta 31', null, 30),
('Ponta 32', null, 31),
('Ponta 33', null, 32),
('Ponta 34', null, 33),
('Ponta 35', null, 34),
('Ponta 36', null, 35),
('Ponta 37', null, 36),
('Ponta 38', null, 37),
('Ponta 39', null, 38),
('Ponta 40', null, 39),
('Ponta 41', null, 40),
('Ponta 42', null, 41),
('Ponta 43', null, 42),
('Ponta 44', null, 43);
