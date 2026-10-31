-- ULVA · Ruptura: grupos piloto do setor Limpeza (81 subcategorias -> 20 grupos)
insert into public.ruptura_grupos (setor, nome, ordem) values
  ('LIMPEZA', 'Amaciante concentrado', 1),
  ('LIMPEZA', 'Amaciante diluído', 2),
  ('LIMPEZA', 'Sabão em pó', 3),
  ('LIMPEZA', 'Sabão líquido roupa', 4),
  ('LIMPEZA', 'Água sanitária e cloro', 5),
  ('LIMPEZA', 'Alvejante e cuidados roupa', 6),
  ('LIMPEZA', 'Detergente louça', 7),
  ('LIMPEZA', 'Desinfetante', 8),
  ('LIMPEZA', 'Essência de limpeza', 9),
  ('LIMPEZA', 'Limpador perfumado', 10),
  ('LIMPEZA', 'Multiuso', 11),
  ('LIMPEZA', 'Limpadores específicos', 12),
  ('LIMPEZA', 'Sabão barra e saponáceo', 13),
  ('LIMPEZA', 'Purificador de ar', 14),
  ('LIMPEZA', 'Sanitário', 15),
  ('LIMPEZA', 'Inseticida e repelente', 16),
  ('LIMPEZA', 'Cera, lustra-móveis e calçados', 17),
  ('LIMPEZA', 'Álcool', 18),
  ('LIMPEZA', 'Esponja e palha de aço', 19),
  ('LIMPEZA', 'Diversos limpeza', 20)
on conflict (setor, nome) do nothing;

insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'AMACIANTE CONCENTRADO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Amaciante concentrado' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'prefixo', 'AMAC.ROUPA CONC' from public.ruptura_grupos where setor='LIMPEZA' and nome='Amaciante concentrado' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'AMACIANTE DILUIDO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Amaciante diluído' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'prefixo', 'AMAC.ROUPA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Amaciante diluído' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'DET PO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sabão em pó' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LAVA ROUPA ESPECIAL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sabão em pó' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'prefixo', 'DET.PO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sabão em pó' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LAVA ROUPA LIQUIDO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sabão líquido roupa' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'prefixo', 'LAVA ROUPA LIQ' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sabão líquido roupa' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'AGUA SANITARIA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Água sanitária e cloro' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'CLORO MAIS 1L' from public.ruptura_grupos where setor='LIMPEZA' and nome='Água sanitária e cloro' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'CLORO ATE 1L' from public.ruptura_grupos where setor='LIMPEZA' and nome='Água sanitária e cloro' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'prefixo', 'AGUA SANIT' from public.ruptura_grupos where setor='LIMPEZA' and nome='Água sanitária e cloro' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'ALVEJANTE/TIRA MANCHAS ROUPA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Alvejante e cuidados roupa' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'TINTA TECIDOS' from public.ruptura_grupos where setor='LIMPEZA' and nome='Alvejante e cuidados roupa' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'PASSA ROUPA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Alvejante e cuidados roupa' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'ANIL ROUPA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Alvejante e cuidados roupa' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'TIRA FERRUGEM ROUPA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Alvejante e cuidados roupa' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'prefixo', 'ALVEJANTE' from public.ruptura_grupos where setor='LIMPEZA' and nome='Alvejante e cuidados roupa' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'DETERG LIQUIDO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Detergente louça' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LAVA LOUCA PO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Detergente louça' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LAVA LOUCA SECANTE' from public.ruptura_grupos where setor='LIMPEZA' and nome='Detergente louça' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'prefixo', 'DET.LIQ' from public.ruptura_grupos where setor='LIMPEZA' and nome='Detergente louça' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'DESINF PERF MAIS 1L' from public.ruptura_grupos where setor='LIMPEZA' and nome='Desinfetante' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'DESINF ESPECIAL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Desinfetante' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'DESINF PERF ATE 1L' from public.ruptura_grupos where setor='LIMPEZA' and nome='Desinfetante' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'DESINF PINHO MAIS 1L' from public.ruptura_grupos where setor='LIMPEZA' and nome='Desinfetante' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'DESINF PINHO ATE 1L' from public.ruptura_grupos where setor='LIMPEZA' and nome='Desinfetante' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'prefixo', 'DESINF' from public.ruptura_grupos where setor='LIMPEZA' and nome='Desinfetante' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'ESSENCIA LIMPEZA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Essência de limpeza' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPADOR PERFUMADO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpador perfumado' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPADOR MULTIUSO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Multiuso' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPADOR DESENG COZINHA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPADOR BANHEIRO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPA PISO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPA VIDRO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPA ALUMINIO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPADOR LIMPEZA PESADA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPA PEDRA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPA MAQUINA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPA TUDO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPA ESTOFADO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPA TAPETE' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIMPA BOX' from public.ruptura_grupos where setor='LIMPEZA' and nome='Limpadores específicos' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'SABAO PEDRA GLICERINADO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sabão barra e saponáceo' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'SAPONACEO CREMOSO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sabão barra e saponáceo' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'SABAO ESPECIAL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sabão barra e saponáceo' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'SABAO PASTA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sabão barra e saponáceo' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'SAPONACEO PO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sabão barra e saponáceo' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'prefixo', 'SABAO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sabão barra e saponáceo' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'PURIF AR LIQUIDO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Purificador de ar' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'PURIF AR AERO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Purificador de ar' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'EVITA MOFO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Purificador de ar' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'PURIF AR SPRAY REFIL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Purificador de ar' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'PURIF ESPECIAL APARELHO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Purificador de ar' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'PURIF AR ESPECIAL REFIL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Purificador de ar' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'PEDRA SANIT' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sanitário' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'PASTILHA SANIT ADESIVA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sanitário' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'BLOCO SANIT APARELHO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sanitário' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'GEL SANIT APARELHO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sanitário' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'PEDRA SANIT REFIL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sanitário' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'BLOCO SANIT REFIL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sanitário' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'GEL SANIT REFIL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Sanitário' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'INSET AERO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Inseticida e repelente' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'REPELENTE' from public.ruptura_grupos where setor='LIMPEZA' and nome='Inseticida e repelente' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'INSET REFIL ELET' from public.ruptura_grupos where setor='LIMPEZA' and nome='Inseticida e repelente' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'INSET APAR ELET' from public.ruptura_grupos where setor='LIMPEZA' and nome='Inseticida e repelente' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'INSET ESPECIAL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Inseticida e repelente' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'INSET GEL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Inseticida e repelente' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'INSET ESPIRAL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Inseticida e repelente' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'INSET LIQ' from public.ruptura_grupos where setor='LIMPEZA' and nome='Inseticida e repelente' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'PULVERIZADOR' from public.ruptura_grupos where setor='LIMPEZA' and nome='Inseticida e repelente' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'CERA LIQUIDA ATE 1L' from public.ruptura_grupos where setor='LIMPEZA' and nome='Cera, lustra-móveis e calçados' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'CERA LIQUIDA MAIS 1L' from public.ruptura_grupos where setor='LIMPEZA' and nome='Cera, lustra-móveis e calçados' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'CERA PASTA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Cera, lustra-móveis e calçados' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'REMOVEDOR ATE 1L' from public.ruptura_grupos where setor='LIMPEZA' and nome='Cera, lustra-móveis e calçados' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'QUEROSENE' from public.ruptura_grupos where setor='LIMPEZA' and nome='Cera, lustra-móveis e calçados' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LUSTRA MOVEIS' from public.ruptura_grupos where setor='LIMPEZA' and nome='Cera, lustra-móveis e calçados' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'OLEO MOVEIS' from public.ruptura_grupos where setor='LIMPEZA' and nome='Cera, lustra-móveis e calçados' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'POMADA CALCADOS' from public.ruptura_grupos where setor='LIMPEZA' and nome='Cera, lustra-móveis e calçados' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'LIQUIDO CALCADOS' from public.ruptura_grupos where setor='LIMPEZA' and nome='Cera, lustra-móveis e calçados' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'OLEO LUBRIF DOMEST' from public.ruptura_grupos where setor='LIMPEZA' and nome='Cera, lustra-móveis e calçados' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'ALCOOL GEL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Álcool' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'ALCOOL LIQUIDO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Álcool' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'ESPONJA ACO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Esponja e palha de aço' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'PALHA ACO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Esponja e palha de aço' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'SODA CAUSTICA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Diversos limpeza' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'DESENTUPIDOR ESPECIAL' from public.ruptura_grupos where setor='LIMPEZA' and nome='Diversos limpeza' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'SOLUCAO ACIDO MURIATICO' from public.ruptura_grupos where setor='LIMPEZA' and nome='Diversos limpeza' on conflict do nothing;
insert into public.ruptura_grupo_regras (grupo_id, tipo, valor) select id, 'classe5', 'NAFTALINA' from public.ruptura_grupos where setor='LIMPEZA' and nome='Diversos limpeza' on conflict do nothing;
