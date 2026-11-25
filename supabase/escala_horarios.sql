-- Escala 5x2 · Horários do dia e Opções de escala (rascunho)
-- Já aplicado no Supabase em 25/11/2026. Pode rodar de novo sem problema.

-- Turno intermediário (I). U continua sendo "setor sem turno" (repositores etc.).
alter table escala_vagas drop constraint if exists escala_vagas_turno_check;
alter table escala_vagas add constraint escala_vagas_turno_check check (turno in ('M','I','T','U'));
alter table escala_turno_dia drop constraint if exists escala_turno_dia_turno_check;
alter table escala_turno_dia add constraint escala_turno_dia_turno_check check (turno in ('M','I','T'));

-- Horário de cada turno por setor (semana = seg a sáb; domingo = horário próprio)
create table if not exists escala_horarios (
  setor text not null,
  dia_tipo text not null default 'semana' check (dia_tipo in ('semana','domingo')),
  turno text not null check (turno in ('M','I','T','U')),
  entrada time not null,
  saida time not null,
  almoco_inicio time,               -- vazio = o portal escalona os almoços sozinho
  almoco_min int not null default 80,
  atualizado_em timestamptz default now(),
  primary key (setor, dia_tipo, turno)
);
-- Mínimo desejado de pessoas trabalhando ao mesmo tempo, por setor
create table if not exists escala_horarios_cfg (
  setor text primary key,
  minimo_semana int not null default 8,
  minimo_domingo int not null default 8
);
-- Almoço mudado à mão num dia (◀ ▶ no portal)
create table if not exists escala_almoco_dia (
  data date not null,
  colaborador_loja_id text not null,
  inicio time not null,
  registrado_por text,
  primary key (data, colaborador_loja_id)
);
-- Opções de escala (rascunho): folgas por pessoa num período, sem mexer na escala de verdade
create table if not exists escala_cenarios (
  id uuid primary key default gen_random_uuid(),
  setor text not null,
  nome text not null,
  inicio date not null,
  fim date not null,
  folgas jsonb not null default '{}'::jsonb,   -- { colaborador_loja_id: ["2026-12-21", ...] }
  observacao text,
  criado_por text,
  criado_em timestamptz default now(),
  aplicado_em timestamptz,
  aplicado_por text
);

do $$
declare t text;
begin
  foreach t in array array['escala_horarios','escala_horarios_cfg','escala_almoco_dia','escala_cenarios']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tudo', t);
    execute format('create policy %I on %I for all using (true) with check (true)', t || '_tudo', t);
  end loop;
end $$;

insert into escala_horarios (setor, dia_tipo, turno, entrada, saida, almoco_inicio, almoco_min) values
 ('frente-caixa','semana','M','07:00','17:00','12:00',80),
 ('frente-caixa','semana','I','10:00','20:00','13:00',80),
 ('frente-caixa','semana','T','11:20','21:20','14:30',80),
 ('acougue','semana','M','07:00','17:00','12:00',80),
 ('acougue','semana','T','11:20','21:20','14:30',80),
 ('frios','semana','M','07:00','17:00','12:00',80),
 ('frios','semana','T','11:20','21:20','14:30',80)
on conflict do nothing;
insert into escala_horarios_cfg (setor, minimo_semana, minimo_domingo) values
 ('frente-caixa',8,12),('acougue',2,1),('frios',2,1)
on conflict do nothing;
