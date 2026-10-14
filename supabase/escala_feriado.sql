-- =====================================================================
-- ULVA · Escala: folga de feriado + histórico de faltas
-- 1) novo tipo 'folga_feriado' (marcado com "F" na planilha de escala)
-- 2) registrado_em: quando a falta/atestado foi lançada (o criado_em não
--    serve, porque lançar uma falta num dia de folga reaproveita a linha)
-- =====================================================================

alter table public.escala_folgas drop constraint if exists escala_folgas_tipo_check;
alter table public.escala_folgas add constraint escala_folgas_tipo_check
  check (tipo in ('folga', 'folga_feriado', 'ferias_licenca_inss', 'falta', 'atestado'));

alter table public.escala_folgas add column if not exists registrado_em timestamptz;

-- Faltas e atestados que já existem: usa a data de criação como melhor palpite.
update public.escala_folgas
   set registrado_em = criado_em
 where registrado_em is null and tipo in ('falta', 'atestado');
