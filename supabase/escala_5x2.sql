-- =====================================================================
-- ULVA · Escala 5x2 por grupos + Mapa dos PDVs (Loja 327 · Frente de Caixa)
-- Rodar UMA vez no SQL Editor do Supabase (projeto Lucas-Gestão-SBH).
--
-- O que este arquivo faz:
--  1) cria as tabelas novas do módulo (grupos, vagas, feriados, meses
--     gerados, folgas por grupo, turno do dia, PDVs, chamados de PDV e
--     distribuição manual dos PDVs);
--  2) cadastra os 6 grupos (A a F), as 27 vagas da Frente de Caixa, os
--     feriados de 25/12 e 01/01 (loja fechada) e os 12 PDVs;
--  3) liga cada vaga ao colaborador de `colaboradores_loja` pelo nome;
--  4) grava em `escala_folgas` as folgas de 01/12/2026 a 31/01/2027
--     (6x1 por grupos até 20/12 e 5x2 a partir de 21/12), sem apagar
--     faltas, atestados nem férias já lançados.
--
-- As folgas continuam na mesma tabela `escala_folgas` de sempre, então a
-- tela "Colaboradores · Faltas e Atestados" e o Relatório diário continuam
-- funcionando como antes.
--
-- No fim, a última consulta mostra as vagas que NÃO foram ligadas a um
-- colaborador (nome diferente no cadastro). Essas podem ser ligadas pelo
-- app: Escala 5x2 → tocar na vaga → escolher o colaborador.
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists escala_config (
  setor text primary key,
  domingo_ref date not null,          -- domingo em que os grupos de fase 0 folgam
  inicio_5x2 date,                    -- a partir de quando vale o 5x2
  limite_almoco_dividido int not null default 6,
  atualizado_em timestamptz default now()
);

create table if not exists escala_grupos (
  id uuid primary key default gen_random_uuid(),
  setor text not null,
  letra text not null,
  cor text not null,                  -- cor clara (fundo da linha)
  cor_forte text not null,            -- cor da folga (X)
  fase int not null check (fase in (0, 1)),
  dia_1 int not null check (dia_1 between 1 and 5),  -- 1 = segunda … 5 = sexta
  dia_2 int not null check (dia_2 between 1 and 5),  -- 2ª folga fixa (sempre depois da 1ª)
  ideal_tarde int not null default 0,
  ideal_manha int not null default 0,
  unique (setor, letra)
);

create table if not exists escala_vagas (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references escala_grupos(id) on delete cascade,
  codigo text not null,               -- A1, A2…
  turno text not null check (turno in ('M', 'T')),
  funcao text not null default 'operadora' check (funcao in ('encarregada', 'operadora', 'embaladora')),
  colaborador_loja_id text,           -- id em colaboradores_loja (vazio = vaga aberta)
  nome_planilha text,                 -- nome que veio da planilha (referência)
  desde date,
  ordem int not null default 0,
  unique (grupo_id, codigo)
);

create table if not exists escala_feriados (
  data date primary key,
  tipo text not null check (tipo in ('fechada', 'aberta', 'pico')),
  descricao text
);

create table if not exists escala_meses (
  setor text not null,
  mes date not null,                  -- primeiro dia do mês
  gerado_em timestamptz default now(),
  gerado_por text,
  primary key (setor, mes)
);

-- Folgas de cada grupo (a "fonte" de quem entra numa vaga no meio do mês).
create table if not exists escala_grupo_folgas (
  grupo_id uuid not null references escala_grupos(id) on delete cascade,
  data date not null,
  primary key (grupo_id, data)
);

-- "Vir de manhã": troca de turno só num dia.
create table if not exists escala_turno_dia (
  data date not null,
  colaborador_loja_id text not null,
  turno text not null check (turno in ('M', 'T')),
  registrado_por text,
  primary key (data, colaborador_loja_id)
);

create table if not exists pdv_cadastro (
  numero int primary key,
  tipo text not null default 'normal' check (tipo in ('normal', 'preferencial', '15volumes')),
  ordem_abertura int not null,
  sempre_aberto boolean not null default false,
  substituto int                       -- quem assume a regra se este estiver com defeito
);

create table if not exists pdv_chamados (
  id uuid primary key default gen_random_uuid(),
  pdv int not null references pdv_cadastro(numero),
  chamado text,
  problema text,
  aberto_em date not null default current_date,
  resolvido_em date,
  registrado_por text,
  criado_em timestamptz default now()
);

-- Trocas manuais feitas pela frente de caixa (sem linha = distribuição automática).
create table if not exists pdv_distribuicao (
  data date not null,
  pdv int not null references pdv_cadastro(numero),
  manha text,                          -- colaborador_loja_id
  tarde text,
  alterado_por text,
  alterado_em timestamptz default now(),
  primary key (data, pdv)
);

-- Mesmo padrão das outras tabelas do ULVA (login próprio do app, chave anon).
do $$
declare t text;
begin
  foreach t in array array['escala_config','escala_grupos','escala_vagas','escala_feriados','escala_meses',
                           'escala_grupo_folgas','escala_turno_dia','pdv_cadastro','pdv_chamados','pdv_distribuicao']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tudo', t);
    execute format('create policy %I on %I for all using (true) with check (true)', t || '_tudo', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Dados iniciais
-- ---------------------------------------------------------------------
insert into escala_config (setor, domingo_ref, inicio_5x2, limite_almoco_dividido)
values ('frente-caixa', '2026-11-29', '2026-12-21', 6)
on conflict (setor) do update set domingo_ref = excluded.domingo_ref, inicio_5x2 = excluded.inicio_5x2;

insert into escala_feriados (data, tipo, descricao) values
  ('2026-12-25', 'fechada', 'Natal'),
  ('2027-01-01', 'fechada', 'Ano-Novo'),
  ('2026-12-23', 'pico', 'Véspera de Natal (movimento alto)'),
  ('2026-12-24', 'pico', 'Véspera de Natal'),
  ('2026-12-30', 'pico', 'Véspera de Ano-Novo (movimento alto)'),
  ('2026-12-31', 'pico', 'Véspera de Ano-Novo')
on conflict (data) do update set tipo = excluded.tipo, descricao = excluded.descricao;

insert into pdv_cadastro (numero, tipo, ordem_abertura, sempre_aberto, substituto) values
  (1, 'preferencial', 1, true, 2), (2, 'preferencial', 7, false, null),
  (3, 'normal', 3, false, null), (4, 'normal', 9, false, null), (5, 'normal', 5, false, null),
  (6, 'normal', 11, false, null), (7, 'normal', 12, false, null), (8, 'normal', 6, false, null),
  (9, 'normal', 10, false, null), (10, 'normal', 4, false, null),
  (11, '15volumes', 8, false, null), (12, '15volumes', 2, true, 11)
on conflict (numero) do update set tipo = excluded.tipo, ordem_abertura = excluded.ordem_abertura,
  sempre_aberto = excluded.sempre_aberto, substituto = excluded.substituto;

insert into escala_grupos (setor, letra, cor, cor_forte, fase, dia_1, dia_2, ideal_tarde, ideal_manha) values
  ('frente-caixa', 'A', '#DCE9F7', '#9DC3E6', 0, 1, 2, 3, 2),
  ('frente-caixa', 'B', '#E2F0D9', '#A9D18E', 0, 1, 2, 3, 2),
  ('frente-caixa', 'C', '#FFF2CC', '#FFD966', 0, 3, 5, 3, 0),
  ('frente-caixa', 'D', '#FCE4D6', '#F4B183', 1, 1, 3, 3, 2),
  ('frente-caixa', 'E', '#E8E0F0', '#C9B3E0', 1, 1, 4, 3, 2),
  ('frente-caixa', 'F', '#F8DDE8', '#EBA3C1', 1, 1, 3, 3, 1)
on conflict (setor, letra) do update set cor = excluded.cor, cor_forte = excluded.cor_forte, fase = excluded.fase,
  dia_1 = excluded.dia_1, dia_2 = excluded.dia_2, ideal_tarde = excluded.ideal_tarde, ideal_manha = excluded.ideal_manha;

-- Vagas (código, turno, função e o nome que veio da planilha)
insert into escala_vagas (grupo_id, codigo, turno, funcao, nome_planilha, ordem, desde)
select g.id, v.codigo, v.turno, v.funcao, v.nome, v.ordem, date '2026-12-01'
from (values
  ('A', 'A1', 'T', 'encarregada', 'DAYSE POLIANE DOS SANTOS', 1),
  ('A', 'A2', 'T', 'operadora', 'LUANA FRANCISCA DE OLIVEIRA', 2),
  ('A', 'A3', 'T', 'encarregada', 'STEFANI FERNANDA DAS GRAÇAS', 3),
  ('A', 'A4', 'M', 'encarregada', 'MARCELA DUARTE MIRANDA', 4),
  ('A', 'A5', 'M', 'operadora', 'NADJA JOANA DA SILVA', 5),
  ('B', 'B1', 'T', 'operadora', 'ALINE APARECIDA SILVA', 1),
  ('B', 'B2', 'T', 'operadora', 'LIDIANE DE ASSIS SILVA', 2),
  ('B', 'B3', 'T', 'operadora', 'LUCIANA DE SOUZA NUNES', 3),
  ('B', 'B4', 'M', 'operadora', 'BRUNA LUIZA ALMEIDA BARBOSA', 4),
  ('B', 'B5', 'M', 'operadora', 'CAROLINA FERREIRA', 5),
  ('C', 'C1', 'T', 'operadora', 'DALCILENE AUGUSTO DE OLIVEIRA', 1),
  ('C', 'C2', 'T', 'operadora', 'INGRID BRENDA DE SOUZA SILVA', 2),
  ('C', 'C3', 'T', 'embaladora', 'MARIA APARECIDA DE OLIVEIRA', 3),
  ('D', 'D1', 'T', 'encarregada', 'AYSLAINE ANDRE PEREIRA', 1),
  ('D', 'D2', 'T', 'operadora', 'JOSANIEL SOARES CALISTO', 2),
  ('D', 'D3', 'T', 'operadora', 'LEILA GOMES MATOSO AMARAL', 3),
  ('D', 'D4', 'M', 'operadora', 'EDILEIDE DOS SANTOS SANTANA', 4),
  ('D', 'D5', 'M', 'encarregada', 'LUZIANA', 5),
  ('E', 'E1', 'T', 'operadora', 'EMILENE MUNIZ', 1),
  ('E', 'E2', 'T', 'operadora', 'JULIA SILVA SANTOS', 2),
  ('E', 'E3', 'T', 'operadora', 'ROSIANE ALEXANDRINA SOUZA', 3),
  ('E', 'E4', 'M', 'operadora', 'MILENA TAIS VFERREIRA DA COSTA', 4),
  ('E', 'E5', 'M', 'operadora', 'VERENICE DOS SANTOS SILVA', 5),
  ('F', 'F1', 'T', 'operadora', 'ANA CLARA RODRIGUES MELO', 1),
  ('F', 'F2', 'T', 'operadora', 'FRANCISLENE VITORIA TABORDA', 2),
  ('F', 'F3', 'T', 'operadora', 'SUELI NUNES GONÇALVES', 3),
  ('F', 'F4', 'M', 'operadora', 'FABIANE PORTO SANTOS', 4)
) as v(letra, codigo, turno, funcao, nome, ordem)
join escala_grupos g on g.setor = 'frente-caixa' and g.letra = v.letra
on conflict (grupo_id, codigo) do update set turno = excluded.turno, funcao = excluded.funcao, nome_planilha = excluded.nome_planilha, ordem = excluded.ordem;

-- Liga cada vaga ao colaborador pelo nome: primeiro o nome completo, depois
-- os dois primeiros nomes (ignorando DE/DA/DOS/DAS), dando preferência a
-- quem está no setor Frente de Caixa.
update escala_vagas v
   set colaborador_loja_id = (
     select cl.id::text from colaboradores_loja cl
      where upper(trim(cl.nome)) = upper(trim(v.nome_planilha))
         or regexp_replace(regexp_replace(upper(trim(cl.nome)), '\m(DE|DA|DO|DOS|DAS)\M', '', 'g'), '\s+', ' ', 'g') like (
              select string_agg(w, ' ') from (
                select w from unnest(string_to_array(upper(trim(v.nome_planilha)), ' ')) with ordinality as t(w, i)
                 where w not in ('DE', 'DA', 'DO', 'DOS', 'DAS') and w <> '' order by i limit 2) s
            ) || '%'
      order by (upper(trim(cl.nome)) = upper(trim(v.nome_planilha))) desc, (cl.setor = 'frente-caixa') desc
      limit 1)
 where v.colaborador_loja_id is null
   and v.grupo_id in (select id from escala_grupos where setor = 'frente-caixa');

-- Folgas de cada grupo (06/12/2026 a 31/01/2027)
insert into escala_grupo_folgas (grupo_id, data)
select g.id, v.data::date from (values
('A','2026-12-07'),
('A','2026-12-13'),
('A','2026-12-16'),
('A','2026-12-21'),
('A','2026-12-22'),
('A','2026-12-27'),
('A','2026-12-29'),
('A','2027-01-04'),
('A','2027-01-05'),
('A','2027-01-10'),
('A','2027-01-12'),
('A','2027-01-18'),
('A','2027-01-19'),
('A','2027-01-24'),
('A','2027-01-26'),
('B','2026-12-07'),
('B','2026-12-08'),
('B','2026-12-13'),
('B','2026-12-15'),
('B','2026-12-21'),
('B','2026-12-24'),
('B','2026-12-27'),
('B','2026-12-29'),
('B','2027-01-04'),
('B','2027-01-05'),
('B','2027-01-10'),
('B','2027-01-12'),
('B','2027-01-18'),
('B','2027-01-19'),
('B','2027-01-24'),
('B','2027-01-26'),
('C','2026-12-08'),
('C','2026-12-09'),
('C','2026-12-13'),
('C','2026-12-15'),
('C','2026-12-21'),
('C','2026-12-22'),
('C','2026-12-27'),
('C','2026-12-29'),
('C','2027-01-06'),
('C','2027-01-08'),
('C','2027-01-10'),
('C','2027-01-15'),
('C','2027-01-20'),
('C','2027-01-22'),
('C','2027-01-24'),
('C','2027-01-29'),
('D','2026-12-06'),
('D','2026-12-09'),
('D','2026-12-14'),
('D','2026-12-17'),
('D','2026-12-20'),
('D','2026-12-23'),
('D','2026-12-28'),
('D','2026-12-30'),
('D','2027-01-03'),
('D','2027-01-06'),
('D','2027-01-11'),
('D','2027-01-13'),
('D','2027-01-17'),
('D','2027-01-20'),
('D','2027-01-25'),
('D','2027-01-27'),
('D','2027-01-31'),
('E','2026-12-06'),
('E','2026-12-10'),
('E','2026-12-16'),
('E','2026-12-20'),
('E','2026-12-22'),
('E','2026-12-28'),
('E','2026-12-31'),
('E','2027-01-03'),
('E','2027-01-07'),
('E','2027-01-11'),
('E','2027-01-14'),
('E','2027-01-17'),
('E','2027-01-21'),
('E','2027-01-25'),
('E','2027-01-28'),
('E','2027-01-31'),
('F','2026-12-06'),
('F','2026-12-11'),
('F','2026-12-14'),
('F','2026-12-20'),
('F','2026-12-24'),
('F','2026-12-28'),
('F','2026-12-31'),
('F','2027-01-03'),
('F','2027-01-06'),
('F','2027-01-11'),
('F','2027-01-13'),
('F','2027-01-17'),
('F','2027-01-20'),
('F','2027-01-25'),
('F','2027-01-27'),
('F','2027-01-31')
) as v(letra, data)
join escala_grupos g on g.setor = 'frente-caixa' and g.letra = v.letra
on conflict do nothing;

-- Folgas de cada colaborador em escala_folgas (01/12/2026 a 31/01/2027).
-- Apaga só as folgas antigas desses dias (tipo folga / folga_feriado) de quem
-- está nas vagas; faltas, atestados e férias ficam como estão.
delete from escala_folgas ef
 using escala_vagas v
 where v.colaborador_loja_id is not null
   and ef.colaborador_loja_id::text = v.colaborador_loja_id
   and ef.tipo in ('folga', 'folga_feriado')
   and ef.data between '2026-12-01' and '2027-01-31'
   and v.grupo_id in (select id from escala_grupos where setor = 'frente-caixa');

insert into escala_folgas (colaborador_loja_id, data, tipo, observacao, registrado_por_nome)
select cl.id, x.data::date, 'folga', 'Escala 5x2 por grupos', 'Escala automática'
from (values
('D5','2026-12-02'),
('D5','2026-12-06'),
('D5','2026-12-09'),
('D5','2026-12-14'),
('D5','2026-12-17'),
('D5','2026-12-20'),
('D5','2026-12-23'),
('D5','2026-12-28'),
('D5','2026-12-30'),
('D5','2027-01-03'),
('D5','2027-01-06'),
('D5','2027-01-11'),
('D5','2027-01-13'),
('D5','2027-01-17'),
('D5','2027-01-20'),
('D5','2027-01-25'),
('D5','2027-01-27'),
('D5','2027-01-31'),
('A1','2026-12-04'),
('A1','2026-12-07'),
('A1','2026-12-13'),
('A1','2026-12-16'),
('A1','2026-12-21'),
('A1','2026-12-22'),
('A1','2026-12-27'),
('A1','2026-12-29'),
('A1','2027-01-04'),
('A1','2027-01-05'),
('A1','2027-01-10'),
('A1','2027-01-12'),
('A1','2027-01-18'),
('A1','2027-01-19'),
('A1','2027-01-24'),
('A1','2027-01-26'),
('A4','2026-12-03'),
('A4','2026-12-07'),
('A4','2026-12-13'),
('A4','2026-12-16'),
('A4','2026-12-21'),
('A4','2026-12-22'),
('A4','2026-12-27'),
('A4','2026-12-29'),
('A4','2027-01-04'),
('A4','2027-01-05'),
('A4','2027-01-10'),
('A4','2027-01-12'),
('A4','2027-01-18'),
('A4','2027-01-19'),
('A4','2027-01-24'),
('A4','2027-01-26'),
('D1','2026-12-01'),
('D1','2026-12-06'),
('D1','2026-12-09'),
('D1','2026-12-14'),
('D1','2026-12-17'),
('D1','2026-12-20'),
('D1','2026-12-23'),
('D1','2026-12-28'),
('D1','2026-12-30'),
('D1','2027-01-03'),
('D1','2027-01-06'),
('D1','2027-01-11'),
('D1','2027-01-13'),
('D1','2027-01-17'),
('D1','2027-01-20'),
('D1','2027-01-25'),
('D1','2027-01-27'),
('D1','2027-01-31'),
('A3','2026-12-02'),
('A3','2026-12-07'),
('A3','2026-12-13'),
('A3','2026-12-16'),
('A3','2026-12-21'),
('A3','2026-12-22'),
('A3','2026-12-27'),
('A3','2026-12-29'),
('A3','2027-01-04'),
('A3','2027-01-05'),
('A3','2027-01-10'),
('A3','2027-01-12'),
('A3','2027-01-18'),
('A3','2027-01-19'),
('A3','2027-01-24'),
('A3','2027-01-26'),
('A2','2026-12-03'),
('A2','2026-12-07'),
('A2','2026-12-13'),
('A2','2026-12-16'),
('A2','2026-12-21'),
('A2','2026-12-22'),
('A2','2026-12-27'),
('A2','2026-12-29'),
('A2','2027-01-04'),
('A2','2027-01-05'),
('A2','2027-01-10'),
('A2','2027-01-12'),
('A2','2027-01-18'),
('A2','2027-01-19'),
('A2','2027-01-24'),
('A2','2027-01-26'),
('B2','2026-12-02'),
('B2','2026-12-07'),
('B2','2026-12-08'),
('B2','2026-12-13'),
('B2','2026-12-15'),
('B2','2026-12-21'),
('B2','2026-12-24'),
('B2','2026-12-27'),
('B2','2026-12-29'),
('B2','2027-01-04'),
('B2','2027-01-05'),
('B2','2027-01-10'),
('B2','2027-01-12'),
('B2','2027-01-18'),
('B2','2027-01-19'),
('B2','2027-01-24'),
('B2','2027-01-26'),
('F4','2026-12-01'),
('F4','2026-12-06'),
('F4','2026-12-11'),
('F4','2026-12-14'),
('F4','2026-12-20'),
('F4','2026-12-24'),
('F4','2026-12-28'),
('F4','2026-12-31'),
('F4','2027-01-03'),
('F4','2027-01-06'),
('F4','2027-01-11'),
('F4','2027-01-13'),
('F4','2027-01-17'),
('F4','2027-01-20'),
('F4','2027-01-25'),
('F4','2027-01-27'),
('F4','2027-01-31'),
('B1','2026-12-03'),
('B1','2026-12-07'),
('B1','2026-12-08'),
('B1','2026-12-13'),
('B1','2026-12-15'),
('B1','2026-12-21'),
('B1','2026-12-24'),
('B1','2026-12-27'),
('B1','2026-12-29'),
('B1','2027-01-04'),
('B1','2027-01-05'),
('B1','2027-01-10'),
('B1','2027-01-12'),
('B1','2027-01-18'),
('B1','2027-01-19'),
('B1','2027-01-24'),
('B1','2027-01-26'),
('A5','2026-12-01'),
('A5','2026-12-07'),
('A5','2026-12-13'),
('A5','2026-12-16'),
('A5','2026-12-21'),
('A5','2026-12-22'),
('A5','2026-12-27'),
('A5','2026-12-29'),
('A5','2027-01-04'),
('A5','2027-01-05'),
('A5','2027-01-10'),
('A5','2027-01-12'),
('A5','2027-01-18'),
('A5','2027-01-19'),
('A5','2027-01-24'),
('A5','2027-01-26'),
('D4','2026-12-01'),
('D4','2026-12-06'),
('D4','2026-12-09'),
('D4','2026-12-14'),
('D4','2026-12-17'),
('D4','2026-12-20'),
('D4','2026-12-23'),
('D4','2026-12-28'),
('D4','2026-12-30'),
('D4','2027-01-03'),
('D4','2027-01-06'),
('D4','2027-01-11'),
('D4','2027-01-13'),
('D4','2027-01-17'),
('D4','2027-01-20'),
('D4','2027-01-25'),
('D4','2027-01-27'),
('D4','2027-01-31'),
('E5','2026-12-03'),
('E5','2026-12-06'),
('E5','2026-12-10'),
('E5','2026-12-16'),
('E5','2026-12-20'),
('E5','2026-12-22'),
('E5','2026-12-28'),
('E5','2026-12-31'),
('E5','2027-01-03'),
('E5','2027-01-07'),
('E5','2027-01-11'),
('E5','2027-01-14'),
('E5','2027-01-17'),
('E5','2027-01-21'),
('E5','2027-01-25'),
('E5','2027-01-28'),
('E5','2027-01-31'),
('D3','2026-12-02'),
('D3','2026-12-06'),
('D3','2026-12-09'),
('D3','2026-12-14'),
('D3','2026-12-17'),
('D3','2026-12-20'),
('D3','2026-12-23'),
('D3','2026-12-28'),
('D3','2026-12-30'),
('D3','2027-01-03'),
('D3','2027-01-06'),
('D3','2027-01-11'),
('D3','2027-01-13'),
('D3','2027-01-17'),
('D3','2027-01-20'),
('D3','2027-01-25'),
('D3','2027-01-27'),
('D3','2027-01-31'),
('E4','2026-12-04'),
('E4','2026-12-06'),
('E4','2026-12-10'),
('E4','2026-12-16'),
('E4','2026-12-20'),
('E4','2026-12-22'),
('E4','2026-12-28'),
('E4','2026-12-31'),
('E4','2027-01-03'),
('E4','2027-01-07'),
('E4','2027-01-11'),
('E4','2027-01-14'),
('E4','2027-01-17'),
('E4','2027-01-21'),
('E4','2027-01-25'),
('E4','2027-01-28'),
('E4','2027-01-31'),
('B5','2026-12-02'),
('B5','2026-12-07'),
('B5','2026-12-08'),
('B5','2026-12-13'),
('B5','2026-12-15'),
('B5','2026-12-21'),
('B5','2026-12-24'),
('B5','2026-12-27'),
('B5','2026-12-29'),
('B5','2027-01-04'),
('B5','2027-01-05'),
('B5','2027-01-10'),
('B5','2027-01-12'),
('B5','2027-01-18'),
('B5','2027-01-19'),
('B5','2027-01-24'),
('B5','2027-01-26'),
('D2','2026-12-02'),
('D2','2026-12-06'),
('D2','2026-12-09'),
('D2','2026-12-14'),
('D2','2026-12-17'),
('D2','2026-12-20'),
('D2','2026-12-23'),
('D2','2026-12-28'),
('D2','2026-12-30'),
('D2','2027-01-03'),
('D2','2027-01-06'),
('D2','2027-01-11'),
('D2','2027-01-13'),
('D2','2027-01-17'),
('D2','2027-01-20'),
('D2','2027-01-25'),
('D2','2027-01-27'),
('D2','2027-01-31'),
('E1','2026-12-01'),
('E1','2026-12-06'),
('E1','2026-12-10'),
('E1','2026-12-16'),
('E1','2026-12-20'),
('E1','2026-12-22'),
('E1','2026-12-28'),
('E1','2026-12-31'),
('E1','2027-01-03'),
('E1','2027-01-07'),
('E1','2027-01-11'),
('E1','2027-01-14'),
('E1','2027-01-17'),
('E1','2027-01-21'),
('E1','2027-01-25'),
('E1','2027-01-28'),
('E1','2027-01-31'),
('B3','2026-12-02'),
('B3','2026-12-07'),
('B3','2026-12-08'),
('B3','2026-12-13'),
('B3','2026-12-15'),
('B3','2026-12-21'),
('B3','2026-12-24'),
('B3','2026-12-27'),
('B3','2026-12-29'),
('B3','2027-01-04'),
('B3','2027-01-05'),
('B3','2027-01-10'),
('B3','2027-01-12'),
('B3','2027-01-18'),
('B3','2027-01-19'),
('B3','2027-01-24'),
('B3','2027-01-26'),
('E3','2026-12-01'),
('E3','2026-12-06'),
('E3','2026-12-10'),
('E3','2026-12-16'),
('E3','2026-12-20'),
('E3','2026-12-22'),
('E3','2026-12-28'),
('E3','2026-12-31'),
('E3','2027-01-03'),
('E3','2027-01-07'),
('E3','2027-01-11'),
('E3','2027-01-14'),
('E3','2027-01-17'),
('E3','2027-01-21'),
('E3','2027-01-25'),
('E3','2027-01-28'),
('E3','2027-01-31'),
('E2','2026-12-01'),
('E2','2026-12-06'),
('E2','2026-12-10'),
('E2','2026-12-16'),
('E2','2026-12-20'),
('E2','2026-12-22'),
('E2','2026-12-28'),
('E2','2026-12-31'),
('E2','2027-01-03'),
('E2','2027-01-07'),
('E2','2027-01-11'),
('E2','2027-01-14'),
('E2','2027-01-17'),
('E2','2027-01-21'),
('E2','2027-01-25'),
('E2','2027-01-28'),
('E2','2027-01-31'),
('F3','2026-12-01'),
('F3','2026-12-06'),
('F3','2026-12-11'),
('F3','2026-12-14'),
('F3','2026-12-20'),
('F3','2026-12-24'),
('F3','2026-12-28'),
('F3','2026-12-31'),
('F3','2027-01-03'),
('F3','2027-01-06'),
('F3','2027-01-11'),
('F3','2027-01-13'),
('F3','2027-01-17'),
('F3','2027-01-20'),
('F3','2027-01-25'),
('F3','2027-01-27'),
('F3','2027-01-31'),
('C2','2026-12-03'),
('C2','2026-12-08'),
('C2','2026-12-09'),
('C2','2026-12-13'),
('C2','2026-12-15'),
('C2','2026-12-21'),
('C2','2026-12-22'),
('C2','2026-12-27'),
('C2','2026-12-29'),
('C2','2027-01-06'),
('C2','2027-01-08'),
('C2','2027-01-10'),
('C2','2027-01-15'),
('C2','2027-01-20'),
('C2','2027-01-22'),
('C2','2027-01-24'),
('C2','2027-01-29'),
('B4','2026-12-02'),
('B4','2026-12-07'),
('B4','2026-12-08'),
('B4','2026-12-13'),
('B4','2026-12-15'),
('B4','2026-12-21'),
('B4','2026-12-24'),
('B4','2026-12-27'),
('B4','2026-12-29'),
('B4','2027-01-04'),
('B4','2027-01-05'),
('B4','2027-01-10'),
('B4','2027-01-12'),
('B4','2027-01-18'),
('B4','2027-01-19'),
('B4','2027-01-24'),
('B4','2027-01-26'),
('F1','2026-12-06'),
('F1','2026-12-11'),
('F1','2026-12-14'),
('F1','2026-12-20'),
('F1','2026-12-24'),
('F1','2026-12-28'),
('F1','2026-12-31'),
('F1','2027-01-03'),
('F1','2027-01-06'),
('F1','2027-01-11'),
('F1','2027-01-13'),
('F1','2027-01-17'),
('F1','2027-01-20'),
('F1','2027-01-25'),
('F1','2027-01-27'),
('F1','2027-01-31'),
('C1','2026-12-02'),
('C1','2026-12-08'),
('C1','2026-12-09'),
('C1','2026-12-13'),
('C1','2026-12-15'),
('C1','2026-12-21'),
('C1','2026-12-22'),
('C1','2026-12-27'),
('C1','2026-12-29'),
('C1','2027-01-06'),
('C1','2027-01-08'),
('C1','2027-01-10'),
('C1','2027-01-15'),
('C1','2027-01-20'),
('C1','2027-01-22'),
('C1','2027-01-24'),
('C1','2027-01-29'),
('F2','2026-12-06'),
('F2','2026-12-11'),
('F2','2026-12-14'),
('F2','2026-12-20'),
('F2','2026-12-24'),
('F2','2026-12-28'),
('F2','2026-12-31'),
('F2','2027-01-03'),
('F2','2027-01-06'),
('F2','2027-01-11'),
('F2','2027-01-13'),
('F2','2027-01-17'),
('F2','2027-01-20'),
('F2','2027-01-25'),
('F2','2027-01-27'),
('F2','2027-01-31'),
('C3','2026-12-01'),
('C3','2026-12-08'),
('C3','2026-12-09'),
('C3','2026-12-13'),
('C3','2026-12-15'),
('C3','2026-12-21'),
('C3','2026-12-22'),
('C3','2026-12-27'),
('C3','2026-12-29'),
('C3','2027-01-06'),
('C3','2027-01-08'),
('C3','2027-01-10'),
('C3','2027-01-15'),
('C3','2027-01-20'),
('C3','2027-01-22'),
('C3','2027-01-24'),
('C3','2027-01-29')
) as x(codigo, data)
join escala_vagas v on v.codigo = x.codigo and v.grupo_id in (select id from escala_grupos where setor = 'frente-caixa')
join colaboradores_loja cl on cl.id::text = v.colaborador_loja_id
on conflict (colaborador_loja_id, data) do nothing;

-- Feriados com a loja fechada: "F" para todo mundo das vagas.
insert into escala_folgas (colaborador_loja_id, data, tipo, observacao, registrado_por_nome)
select cl.id, f.data, 'folga_feriado', f.descricao, 'Escala automática'
from escala_feriados f
cross join escala_vagas v
join colaboradores_loja cl on cl.id::text = v.colaborador_loja_id
where f.tipo = 'fechada' and f.data between '2026-12-01' and '2027-01-31'
  and v.grupo_id in (select id from escala_grupos where setor = 'frente-caixa')
on conflict (colaborador_loja_id, data) do nothing;

insert into escala_meses (setor, mes, gerado_por) values
  ('frente-caixa', '2026-12-01', 'Carga inicial'),
  ('frente-caixa', '2027-01-01', 'Carga inicial')
on conflict do nothing;

-- Conferência: vagas que ficaram sem colaborador ligado (ligar pelo app).
select g.letra as grupo, v.codigo, v.nome_planilha
  from escala_vagas v join escala_grupos g on g.id = v.grupo_id
 where v.colaborador_loja_id is null
 order by g.letra, v.ordem;
