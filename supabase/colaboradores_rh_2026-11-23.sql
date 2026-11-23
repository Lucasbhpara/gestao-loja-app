-- =====================================================================
-- ULVA · Atualiza o cadastro de colaboradores com o relatório do RH
-- (HRCL021 · Colaboradores por Cargo · 23/11/2026 · 111 pessoas)
-- e coloca as 8 operadoras novas na Escala 5x2 da Frente de Caixa.
-- Rodar UMA vez no SQL Editor do Supabase (projeto Lucas-Gestão-SBH).
--
-- 1) Quem já está cadastrado (achado pela matrícula ou pelo nome) recebe
--    nome completo, matrícula, cargo e admissão do RH. O setor (gaveta)
--    de quem já existe NÃO muda.
-- 2) Quem não está cadastrado entra, já no setor da função.
--    Gerentes (Lucas e Rodrigo) ficam de fora: já têm login no app.
-- 3) As 8 operadoras novas entram em vagas novas dos grupos e ganham as
--    folgas do grupo de 01/12/2026 a 31/01/2027 (+ feriados 25/12 e 01/01).
-- 4) A última consulta lista quem está no app e NÃO está no relatório do
--    RH (possível desligamento). Nada é apagado: veja a lista e, se for o
--    caso, desative pela tela de Colaboradores.
-- =====================================================================

create temp table rh_import (matricula text, nome text, cargo text, admissao date, setor text);
insert into rh_import (matricula, nome, cargo, admissao, setor) values
  ('9728430', 'NADJA JOANA DA SILVA', 'Operador(A) De Caixa', '2026-04-23', 'frente-caixa'),
  ('9728433', 'AYSLAINE ANDRE PEREIRA', 'Operador(A) De Caixa', '2026-04-23', 'frente-caixa'),
  ('9728436', 'VERENICE DOS SANTOS SILVA', 'Operador(A) De Caixa', '2026-04-23', 'frente-caixa'),
  ('9728439', 'EDILEIDE DOS SANTOS SANTANA', 'Operador(A) De Caixa', '2026-04-23', 'frente-caixa'),
  ('9728469', 'FABIANE PORTO SANTOS', 'Operador(A) De Caixa', '2026-04-23', 'frente-caixa'),
  ('9728579', 'STEFANI FERNANDA DAS GRACAS SOUSA', 'Operador(A) De Caixa', '2026-04-23', 'frente-caixa'),
  ('9728643', 'LEILA GOMES MATOSO AMARAL', 'Operador(A) De Caixa', '2026-04-23', 'frente-caixa'),
  ('9728644', 'EMILENE MUNIZ DA SILVA PINHEIRO', 'Operador(A) De Caixa', '2026-04-23', 'frente-caixa'),
  ('9728705', 'MILENA TAIS FERREIRA DA C DE OLIVEIRA', 'Operador(A) De Caixa', '2026-04-27', 'frente-caixa'),
  ('9734842', 'LUCIANA DE SOUZA NUNES', 'Operador(A) De Caixa', '2026-07-02', 'frente-caixa'),
  ('9734844', 'MARCELA SILVA ROCHA', 'Operador(A) De Caixa', '2026-07-02', 'frente-caixa'),
  ('9734929', 'JOSANIEL SOARES CALISTO', 'Operador(A) De Caixa', '2026-07-03', 'frente-caixa'),
  ('9735169', 'ROSIANE ALEXANDRINA SOUZA DE JESUS', 'Operador(A) De Caixa', '2026-07-06', 'frente-caixa'),
  ('9735305', 'SUELI NUNES GONCALVES', 'Operador(A) De Caixa', '2026-07-07', 'frente-caixa'),
  ('9735984', 'CAROLINA FERREIRA DA SILVA', 'Operador(A) De Caixa', '2026-07-13', 'frente-caixa'),
  ('9738901', 'LUANA FRANCISCA DE OLIVEIRA', 'Operador(A) De Caixa', '2026-08-05', 'frente-caixa'),
  ('9739561', 'LIDIANE DE ASSIS SILVA DOS SANTOS', 'Operador(A) De Caixa', '2026-08-11', 'frente-caixa'),
  ('9740124', 'ALINE APARECIDA SILVA DE LIMA', 'Operador(A) De Caixa', '2026-08-14', 'frente-caixa'),
  ('9742669', 'JULIA SILVA SANTOS', 'Operador(A) De Caixa', '2026-09-03', 'frente-caixa'),
  ('9743104', 'INGRID BRENDA DE SOUZA SILVA', 'Operador(A) De Caixa', '2026-09-10', 'frente-caixa'),
  ('9743257', 'BRUNA LUIZA ALMEIDA BARBOSA', 'Operador(A) De Caixa', '2026-09-11', 'frente-caixa'),
  ('9744072', 'ANA CLARA RODRIGUES MELO DA SILVA', 'Operador(A) De Caixa', '2026-09-18', 'frente-caixa'),
  ('9746086', 'DALCILENE AUGUSTO DE OLIVEIRA', 'Operador(A) De Caixa', '2026-10-07', 'frente-caixa'),
  ('9746156', 'FRANCISLENE VITORIA TABORDA COELHO', 'Operador(A) De Caixa', '2026-10-07', 'frente-caixa'),
  ('9748954', 'REJANE APARECIDA DIAS DE LIMA', 'Operador(A) De Caixa', '2026-11-04', 'frente-caixa'),
  ('9749791', 'LAISA CAROLINE ALVES DE OLIVEIRA', 'Operador(A) De Caixa', '2026-11-10', 'frente-caixa'),
  ('9749792', 'AMANDA DAS NEVES FREITAS', 'Operador(A) De Caixa', '2026-11-10', 'frente-caixa'),
  ('9750025', 'MOISES AUGUSTO DE ANDRADE BATISTA', 'Operador(A) De Caixa', '2026-11-11', 'frente-caixa'),
  ('9750835', 'VANESSA LORRANY AMORIM SANTOS', 'Operador(A) De Caixa', '2026-11-17', 'frente-caixa'),
  ('9751019', 'FLAVIA DOS SANTOS DE JESUS', 'Operador(A) De Caixa', '2026-11-18', 'frente-caixa'),
  ('9751651', 'FERNANDA MARA LIMA FREITAS', 'Operador(A) De Caixa', '2026-11-23', 'frente-caixa'),
  ('9728217', 'JOSIMAR QUEIROZ LOURENCO', 'Repositor (A)', '2026-04-17', 'mercearia'),
  ('9728218', 'MATHEUS VENTURA DE SOUSA', 'Repositor (A)', '2026-04-17', 'mercearia'),
  ('9728219', 'VITOR NEVES BRAGANCA', 'Repositor (A)', '2026-04-17', 'flv'),
  ('9728562', 'RUBENS URIAS PINTO', 'Repositor (A)', '2026-04-22', 'mercearia'),
  ('9728563', 'GUILHERME HENRIQUE DA ROCHA COSTA', 'Repositor (A)', '2026-04-22', 'mercearia'),
  ('9728564', 'CARLOS EDUARDO DE MELO NASCIMENTO', 'Repositor (A)', '2026-04-22', 'deposito'),
  ('9728739', 'GUILHERME AUGUSTO DE SOUSA QUEIROZ', 'Repositor (A)', '2026-04-28', 'mercearia'),
  ('9728765', 'YASMIM MONALIZA SANTANA DOS SANTOS', 'Repositor (A)', '2026-04-28', 'flv'),
  ('9728767', 'HENRIQUE AMARILDO MARTINS DOS SANTOS', 'Repositor (A)', '2026-04-28', 'mercearia'),
  ('9728768', 'ROSANI APARECIDA DE ALMEIDA', 'Repositor (A)', '2026-04-28', 'mercearia'),
  ('9728770', 'VANIEZER DE LYRA LONTRA MARTINS', 'Repositor (A)', '2026-04-28', 'mercearia'),
  ('9734930', 'GERALDO MENDES DOS SANTOS', 'Repositor (A)', '2026-07-03', 'mercearia'),
  ('9734931', 'CLAUDIRENE LUCIA IZIDORO', 'Repositor (A)', '2026-07-03', 'flv'),
  ('9738799', 'PEDRO HENRIQUE PAULINO LEITE', 'Repositor (A)', '2026-08-04', 'mercearia'),
  ('9741016', 'TABITHA NAIARA SANTOS FERREIRA', 'Repositor (A)', '2026-08-21', 'mercearia'),
  ('9742224', 'JOSE WILLIAN DO NASCIMENTON CARVALHO', 'Repositor (A)', '2026-09-01', 'deposito'),
  ('9745431', 'GUILHERME HENRIQUE RODRIGUES DA SILVA', 'Repositor (A)', '2026-10-01', 'mercearia'),
  ('9745682', 'RAFAEL AUGUSTO RODRIGUES DA SILVA', 'Repositor (A)', '2026-10-02', 'mercearia'),
  ('9746024', 'JULIANA APARECIDA DAS FLORES', 'Repositor (A)', '2026-10-06', 'mercearia'),
  ('9750296', 'WESLEY WILSON DA CRUZ', 'Auxiliar De Depósito', '2026-11-12', 'deposito'),
  ('9750610', 'FILIPE RANIEL DA SILVA', 'Auxiliar De Depósito', '2026-11-16', 'deposito'),
  ('9728510', 'DELIENE SANTOS CALDEIRA', 'Açougueiro(A)', '2026-04-23', 'acougue'),
  ('9728513', 'FABIO MIGUEL DE AQUINO', 'Açougueiro(A)', '2026-04-23', 'acougue'),
  ('9728514', 'WEBERT JUNIOR DA SILVA', 'Açougueiro(A)', '2026-04-23', 'acougue'),
  ('9728517', 'DIULHA DOS SANTOS GONCALVES', 'Açougueiro(A)', '2026-04-23', 'acougue'),
  ('9728974', 'TAINARA APARECIDA PEREIRA', 'Açougueiro(A)', '2026-05-04', 'acougue'),
  ('9738735', 'CLAUDEMIRA ROSA DE RESENDE SOARES', 'Açougueiro(A)', '2026-08-04', 'acougue'),
  ('9743494', 'JOSE CLEITON DE LIMA SILVA', 'Açougueiro(A)', '2026-09-14', 'acougue'),
  ('9728651', 'ARTHUR HENRIQUE ARUJO MACHADO', 'Auxiliar Administrativo', '2026-04-23', 'gerencia'),
  ('9738902', 'ANA PAULA NATALIA DOS SANTOS', 'Balconista De Açougue', '2026-08-05', 'padaria'),
  ('9746155', 'ISABELLY CRISTINE SILVA SAO JOSE', 'Balconista De Açougue', '2026-10-07', 'acougue'),
  ('9746637', 'JOAO BATISTA GOMES FILHO', 'Balconista De Açougue', '2026-10-14', 'acougue'),
  ('9749641', 'IAGO SAMUEL PINHO SILVA', 'Balconista De Açougue', '2026-11-09', 'acougue'),
  ('9751020', 'CARLOS EDURADO ANDRADE FERREIRA', 'Balconista De Açougue', '2026-11-18', 'acougue'),
  ('9722056', 'DOUGLAS DE MACEDO DO NASCIMENTO', 'Fiscal De Loja', '2026-02-20', 'prevencao'),
  ('9728568', 'SILVANEIDE SANTOS DA SILVA', 'Fiscal De Loja', '2026-04-22', 'prevencao'),
  ('9728569', 'RUTE CEZARIA ROSA', 'Fiscal De Loja', '2026-04-22', 'prevencao'),
  ('9728645', 'NAIANE SOUZA GOMES', 'Fiscal De Loja', '2026-04-23', 'prevencao'),
  ('9728795', 'MARIA APARECIDA VIEIRA NEVES', 'Fiscal De Loja', '2026-04-24', 'prevencao'),
  ('9734843', 'EMERSON FRANCO DA SILVA', 'Fiscal De Loja', '2026-07-02', 'prevencao'),
  ('9743103', 'FLAVIA MARTINS DA SILVA CAMARGOS', 'Fiscal De Loja', '2026-09-10', 'prevencao'),
  ('9751358', 'ELTON CARLOS DE ABREU', 'Fiscal De Loja', '2026-11-19', 'prevencao'),
  ('9728566', 'ALISSON FELIPE DE SOUZA', 'Encarregado De Depósito', '2026-04-22', 'deposito'),
  ('9728794', 'ARIJANE PAULO DOS SANTOS DE LIMA', 'Auxiliar De Padaria', '2026-04-24', 'padaria'),
  ('9738576', 'VALERIA APARECIDA FERREIRA', 'Auxiliar De Padaria', '2026-08-03', 'padaria'),
  ('9745192', 'LUCIENE APARECIDA DE LIMA', 'Auxiliar De Padaria', '2026-10-01', 'padaria'),
  ('9722057', 'JOANIR TEOFILO DE ALMEIDA', 'Vigia', '2026-02-20', 'gerencia'),
  ('9728714', 'MATHEUS FELIPE RIEBIRO RODRIGUES', 'Encarregado(A) De Hortifruti', '2026-04-28', 'flv'),
  ('9727940', 'RENI GONCALVES SANTOS', 'Encarregado(A) De Frios', '2026-04-14', 'frios'),
  ('9728581', 'JULIA MARIA RODRIGUES GONCALVES', 'Atendente De Frios', '2026-04-23', 'frios'),
  ('9728796', 'IRANI FIALHO', 'Atendente De Frios', '2026-04-24', 'frios'),
  ('9728799', 'ANA CECILIA DE SOUSA SILVA', 'Atendente De Frios', '2026-04-24', 'frios'),
  ('9742670', 'EDUARDA DA SILVA FERNANDES', 'Atendente De Frios', '2026-09-03', 'frios'),
  ('9751174', 'ANGELA APARECIDA DA SILVA', 'Atendente De Frios', '2026-11-18', 'frios'),
  ('9751175', 'ANA KAROLINA LUCAS FERNANDES', 'Atendente De Frios', '2026-11-18', 'frios'),
  ('9728511', 'GERALDO MACHADO', 'Encarregado(A) De Açougue', '2026-04-23', 'acougue'),
  ('9728565', 'CARLOS GABRIEL DA SILVA', 'Encarregado(A) De Loja', '2026-04-22', 'gerencia'),
  ('9727941', 'MARIA EDNA FERNANDES GONCALVES', 'Faxineiro(A)', '2026-04-14', 'gerencia'),
  ('9727944', 'JUNAINA FERNANDES RIBEIRO', 'Faxineiro(A)', '2026-04-14', 'gerencia'),
  ('9740893', 'LAURA DOS SANTOS', 'Faxineiro(A)', '2026-08-20', 'gerencia'),
  ('9728648', 'ROSILENE MARIA DE SOUSA', 'Operador(A) De Micro', '2026-04-23', 'cpd'),
  ('9728572', 'DAYSE POLIANE DOS SANTOS', 'Frente De Caixa', '2026-04-23', 'frente-caixa'),
  ('9728646', 'MARCELA DUARTE MIRANDA', 'Frente De Caixa', '2026-04-23', 'frente-caixa'),
  ('9728649', 'LUZIANA RODRIGUES MIRANDA DA SILVA', 'Frente De Caixa', '2026-04-23', 'frente-caixa'),
  ('9728709', 'JOSE MARIA GONCALVES', 'Orientador De Traf. P/ Estacionamento', '2026-04-28', 'gerencia'),
  ('9728710', 'MICAEL JOSE FERREIRA DA COSTA', 'Auxiliar De Loja', '2026-04-28', 'mercearia'),
  ('9728711', 'QUEREM HAPUQUE ALVES MOTA', 'Auxiliar De Loja', '2026-04-28', 'mercearia'),
  ('9728712', 'MARIA APARECIDA DE OLIVEIRA', 'Auxiliar De Loja', '2026-04-28', 'frente-caixa'),
  ('9728734', 'JOAO GABRIEL ALVES HACHIBA', 'Auxiliar De Loja', '2026-04-28', 'mercearia'),
  ('9728735', 'SIMON HENRIQUE SEVERINO DE FREITAS', 'Auxiliar De Loja', '2026-04-28', 'flv'),
  ('9728762', 'VITORIA GOMES DE SOUZA', 'Auxiliar De Loja', '2026-04-28', 'mercearia'),
  ('9735304', 'CARINA AGUIAR DOS SANTOS', 'Auxiliar De Loja', '2026-07-07', 'mercearia'),
  ('9743101', 'LIVIA GABRIELE ALVES DE LIMA', 'Auxiliar De Loja', '2026-09-10', 'mercearia'),
  ('9746236', 'ANDERSON MONTEIRO GOMES', 'Auxiliar De Loja', '2026-10-08', 'mercearia'),
  ('9749793', 'EMANUELLY ANDRADE SILVA', 'Auxiliar De Loja', '2026-11-10', 'mercearia'),
  ('9750035', 'EVELLYN APARECIDA ROSA D BOSCO', 'Auxiliar De Loja', '2026-11-11', 'mercearia'),
  ('9751359', 'BIANCA DE SOUZA BARROS SILVA', 'Auxiliar De Loja', '2026-11-19', 'mercearia'),
  ('9729163', 'CLAUDIANE SOUZA NASCIMENTO', 'Agente Prevenção De Perdas', '2026-05-04', 'prevencao');

-- chave de comparação: dois primeiros nomes, sem DE/DA/DO/DOS/DAS e sem acento
create or replace function pg_temp.chave(t text) returns text language sql immutable as $$
  select string_agg(w, ' ') from (
    select w from unnest(string_to_array(regexp_replace(upper(translate(trim(t),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '\s+', ' ', 'g'), ' ')) with ordinality as x(w, i)
     where w not in ('DE', 'DA', 'DO', 'DOS', 'DAS') and w <> '' order by i limit 2) s
$$;

-- 1a) pela matrícula
update colaboradores_loja cl
   set nome = r.nome, cargo = r.cargo, admissao = r.admissao, ativo = true
  from rh_import r
 where cl.matricula = r.matricula;

-- 1b) pelo nome (quem ainda não tem matrícula do RH), só quando o nome é único dos dois lados
update colaboradores_loja cl
   set nome = r.nome, matricula = r.matricula, cargo = r.cargo, admissao = r.admissao, ativo = true
  from rh_import r
 where (cl.matricula is null or cl.matricula not in (select matricula from rh_import))
   and pg_temp.chave(cl.nome) = pg_temp.chave(r.nome)
   and not exists (select 1 from colaboradores_loja x where x.matricula = r.matricula)
   and (select count(*) from rh_import r2 where pg_temp.chave(r2.nome) = pg_temp.chave(r.nome)) = 1
   and (select count(*) from colaboradores_loja c2 where pg_temp.chave(c2.nome) = pg_temp.chave(cl.nome)
          and (c2.matricula is null or c2.matricula not in (select matricula from rh_import))) = 1;

-- 2) quem falta
insert into colaboradores_loja (nome, matricula, cargo, setor, admissao, ativo)
select r.nome, r.matricula, r.cargo, r.setor, r.admissao, true
  from rh_import r
 where not exists (select 1 from colaboradores_loja cl where cl.matricula = r.matricula);

-- 3) operadoras novas nas vagas da escala (grupo, turno e 1ª folga de 01–05/12)
create temp table novas_vagas (matricula text, letra text, turno text, folga_inicio date);
insert into novas_vagas values
  ('9734844', 'C', 'M', '2026-12-02'),
  ('9748954', 'A', 'M', '2026-12-03'),
  ('9749792', 'A', 'T', '2026-12-04'),
  ('9749791', 'D', 'M', '2026-12-01'),
  ('9750025', 'A', 'T', '2026-12-04'),
  ('9750835', 'C', 'M', '2026-12-02'),
  ('9751019', 'A', 'T', '2026-12-01'),
  ('9751651', 'D', 'M', '2026-12-04');

insert into escala_vagas (grupo_id, codigo, turno, funcao, colaborador_loja_id, nome_planilha, desde, ordem)
select g.id,
       g.letra || (100 + row_number() over (partition by g.letra order by n.matricula))::text,
       n.turno, 'operadora', cl.id::text, cl.nome, date '2026-12-01',
       100 + row_number() over (partition by g.letra order by n.matricula)
  from novas_vagas n
  join escala_grupos g on g.setor = 'frente-caixa' and g.letra = n.letra
  join colaboradores_loja cl on cl.matricula = n.matricula
 where not exists (select 1 from escala_vagas v where v.colaborador_loja_id = cl.id::text);

insert into escala_folgas (colaborador_loja_id, data, tipo, observacao, registrado_por_nome)
select cl.id, f.data, 'folga', 'Escala 5x2 por grupos', 'Escala automática'
  from novas_vagas n
  join colaboradores_loja cl on cl.matricula = n.matricula
  join escala_grupos g on g.setor = 'frente-caixa' and g.letra = n.letra
  join escala_grupo_folgas f on f.grupo_id = g.id
 where f.data between '2026-12-01' and '2027-01-31'
union all
select cl.id, n.folga_inicio, 'folga', 'Escala 5x2 por grupos', 'Escala automática'
  from novas_vagas n join colaboradores_loja cl on cl.matricula = n.matricula
union all
select cl.id, fe.data, 'folga_feriado', fe.descricao, 'Escala automática'
  from novas_vagas n join colaboradores_loja cl on cl.matricula = n.matricula
  cross join escala_feriados fe
 where fe.tipo = 'fechada' and fe.data between '2026-12-01' and '2027-01-31'
on conflict (colaborador_loja_id, data) do nothing;

-- Os códigos das vagas novas ficam A101, A102… Para deixar A6, A7…, pode
-- renomear pela tela Escala 5x2 depois; não muda nada nas folgas.

-- 4) conferência
select 'no app, fora do RH (conferir se saiu)' as situacao, cl.nome, cl.matricula, cl.setor
  from colaboradores_loja cl
 where cl.ativo is not false
   and (cl.matricula is null or cl.matricula not in (select matricula from rh_import))
union all
select 'operadora nova na escala', cl.nome, cl.matricula, g.letra || ' · ' || v.turno
  from escala_vagas v join escala_grupos g on g.id = v.grupo_id
  join colaboradores_loja cl on cl.id::text = v.colaborador_loja_id
 where cl.matricula in (select matricula from novas_vagas)
 order by 1, 2;
