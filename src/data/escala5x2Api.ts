import { supabase } from '../lib/supabase';
import { TipoEscala } from './escalaApi';

// Escala 5x2 por grupos (Loja 327) — tabelas criadas por supabase/escala_5x2.sql.
//
// Como funciona:
//  - Cada setor tem grupos (A, B, C…). Todo mundo do grupo folga junto,
//    sempre nos mesmos dias, num ciclo de 2 semanas. A semana vai de SEGUNDA a DOMINGO:
//      · 5x2, semana em que o grupo TRABALHA no domingo → folga em dia_1 e dia_2;
//      · 5x2, semana em que o grupo FOLGA no domingo    → folga em dia_2 e no domingo;
//      · 6x1 (antes de escala_config.inicio_5x2): dia_2 toda semana + o domingo de folga.
//    dia_2 vem sempre depois de dia_1, o que garante no máximo 6 dias seguidos.
//  - O revezamento de domingo é 1x1: os grupos de fase 0 folgam no domingo de
//    referência (escala_config.domingo_ref) e de 2 em 2 semanas; os de fase 1
//    folgam nos domingos do meio.
//  - Feriado com a loja FECHADA não conta como folga: vira "folga_feriado"
//    para todo mundo e, se cair no dia de folga do grupo (ou num dia de pico),
//    a folga vai para o dia da mesma semana com menos gente de folga no setor,
//    sem passar de 6 dias seguidos. Feriado com a loja aberta que cair na
//    folga do grupo vale como folga normal.
//  - As folgas continuam sendo gravadas em `escala_folgas` (a mesma tabela da
//    tela Colaboradores · Faltas e Atestados), uma linha por colaborador e dia.
//    Faltas, atestados e férias nunca são apagados pela geração.

export type Turno = 'M' | 'T' | 'U'; // U = setor sem turno definido
export type FuncaoVaga = 'encarregada' | 'operadora' | 'embaladora' | 'colaborador';

export interface ConfigEscala {
  setor: string;
  domingoRef: string; // 'AAAA-MM-DD'
  inicio5x2: string | null;
  limiteAlmoco: number;
}

export interface GrupoEscala {
  id: string;
  setor: string;
  letra: string;
  cor: string;
  corForte: string;
  fase: 0 | 1;
  dia1: number; // 1 = segunda … 6 = sábado
  dia2: number;
  folgaTodoDomingo: boolean; // ex.: faxina da manhã, que nunca trabalha no domingo
  idealTarde: number;
  idealManha: number;
}

export interface VagaEscala {
  id: string;
  grupoId: string;
  codigo: string;
  turno: Turno;
  funcao: FuncaoVaga;
  colaboradorLojaId: string | null;
  nomePlanilha: string | null;
  desde: string | null;
  ordem: number;
}

export interface FeriadoEscala {
  data: string;
  tipo: 'fechada' | 'aberta' | 'pico';
  descricao: string | null;
}

export interface ModuloEscala {
  config: ConfigEscala;
  grupos: GrupoEscala[];
  vagas: VagaEscala[];
  feriados: FeriadoEscala[];
  mesesGerados: string[]; // 'AAAA-MM-01'
}

export interface RegistroDia {
  colaboradorLojaId: string;
  data: string;
  tipo: TipoEscala;
  id: string;
  observacao: string | null;
}

export const SETOR_CAIXA = 'frente-caixa';
export const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const LETRA_DIA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Horários da Frente de Caixa (loja 07:30–20:30; domingo 07:30–14:00).
// A tarde de domingo entra 08:30 para cumprir as 11h de interjornada depois
// de sair 21:30 no sábado.
export const HORARIOS = {
  manha: '07:20 – 17:20',
  tarde: '11:30 – 21:30',
  domingoManha: '07:20 – 13:35',
  domingoTarde: '08:30 – 14:45',
};

// ---------------------------------------------------------------------
// Datas (sempre 'AAAA-MM-DD', sem fuso: nada de toISOString)
// ---------------------------------------------------------------------
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function paraData(s: string): Date {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
}
export function somarDias(s: string, n: number): string {
  const d = paraData(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function diaSemana(s: string): number {
  return paraData(s).getDay();
}
export function hoje(): string {
  return iso(new Date());
}
export function diasDoMes(ano: number, mes: number): string[] {
  const n = new Date(ano, mes, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${ano}-${String(mes).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
}
export function primeiroDoMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}
function diffDias(a: string, b: string): number {
  return Math.round((paraData(a).getTime() - paraData(b).getTime()) / 86400000);
}
export function ddmm(s: string): string {
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
}

// ---------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------
export async function carregarModulo(setor = SETOR_CAIXA): Promise<ModuloEscala> {
  const [cfg, grp, fer, mes] = await Promise.all([
    supabase.from('escala_config').select('*').eq('setor', setor).maybeSingle(),
    supabase.from('escala_grupos').select('*').eq('setor', setor).order('letra'),
    supabase.from('escala_feriados').select('*').order('data'),
    supabase.from('escala_meses').select('mes').eq('setor', setor),
  ]);
  for (const r of [cfg, grp, fer, mes]) if (r.error) throw r.error;
  if (!cfg.data) throw new Error('A escala ainda não foi configurada. Rode o arquivo supabase/escala_5x2.sql no Supabase.');
  const grupos: GrupoEscala[] = (grp.data ?? []).map((g: any) => ({
    id: g.id,
    setor: g.setor,
    letra: g.letra,
    cor: g.cor,
    corForte: g.cor_forte,
    fase: g.fase,
    dia1: g.dia_1,
    dia2: g.dia_2,
    folgaTodoDomingo: !!g.folga_todo_domingo,
    idealTarde: g.ideal_tarde,
    idealManha: g.ideal_manha,
  }));
  const ids = grupos.map((g) => g.id);
  const vag = ids.length
    ? await supabase.from('escala_vagas').select('*').in('grupo_id', ids).order('ordem')
    : { data: [], error: null };
  if (vag.error) throw vag.error;
  return {
    config: {
      setor,
      domingoRef: cfg.data.domingo_ref,
      inicio5x2: cfg.data.inicio_5x2,
      limiteAlmoco: cfg.data.limite_almoco_dividido ?? 6,
    },
    grupos,
    vagas: (vag.data ?? []).map((v: any) => ({
      id: v.id,
      grupoId: v.grupo_id,
      codigo: v.codigo,
      turno: v.turno,
      funcao: v.funcao,
      colaboradorLojaId: v.colaborador_loja_id,
      nomePlanilha: v.nome_planilha,
      desde: v.desde,
      ordem: v.ordem ?? 0,
    })),
    feriados: (fer.data ?? []).map((f: any) => ({ data: f.data, tipo: f.tipo, descricao: f.descricao })),
    mesesGerados: (mes.data ?? []).map((m: any) => m.mes),
  };
}

// Todos os registros de escala_folgas (folga, feriado, férias, falta,
// atestado) de uma lista de colaboradores entre duas datas.
export async function buscarRegistros(ids: string[], inicio: string, fim: string): Promise<RegistroDia[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('escala_folgas')
    .select('id, colaborador_loja_id, data, tipo, observacao')
    .in('colaborador_loja_id', ids)
    .gte('data', inicio)
    .lte('data', fim);
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id,
    colaboradorLojaId: String(l.colaborador_loja_id),
    data: l.data,
    tipo: l.tipo,
    observacao: l.observacao,
  }));
}

// ---------------------------------------------------------------------
// Regra das folgas do grupo (semana de SEGUNDA a DOMINGO)
// ---------------------------------------------------------------------
export function grupoFolgaDomingo(g: GrupoEscala, cfg: ConfigEscala, domingo: string): boolean {
  if (g.folgaTodoDomingo) return true;
  const semanas = Math.round(diffDias(domingo, cfg.domingoRef) / 7);
  const par = ((semanas % 2) + 2) % 2 === 0;
  return g.fase === 0 ? par : !par;
}

// Segunda-feira da semana (seg → dom) de uma data.
export function segundaDaSemana(s: string): string {
  const w = diaSemana(s);
  return somarDias(s, w === 0 ? -6 : 1 - w);
}

// Antes de inicio_5x2 a escala é 6x1; sem inicio_5x2, é sempre 5x2.
export function semanaEm5x2(cfg: ConfigEscala, segunda: string): boolean {
  return !cfg.inicio5x2 || segunda >= segundaDaSemana(cfg.inicio5x2);
}

// Folgas "de regra" do grupo numa semana (segunda → domingo), sem feriados:
//   6x1 · semana que folga domingo → dia_2 + domingo · semana que trabalha domingo → dia_2
//   5x2 · semana que folga domingo → dia_2 + domingo · semana que trabalha domingo → dia_1 + dia_2
// dia_2 toda semana (e dia_1 antes dele) garante no máximo 6 dias seguidos.
export function folgasBaseDaSemana(g: GrupoEscala, cfg: ConfigEscala, segunda: string): string[] {
  const dom = somarDias(segunda, 6);
  const dia = (n: number) => somarDias(segunda, n - 1);
  const x = semanaEm5x2(cfg, segunda);
  if (g.folgaTodoDomingo) return x ? [dia(g.dia2), dom] : [dom];
  const fd = grupoFolgaDomingo(g, cfg, dom);
  if (x) return fd ? [dia(g.dia2), dom] : [dia(g.dia1), dia(g.dia2)];
  return fd ? [dia(g.dia2), dom] : [dia(g.dia2)];
}

function maiorSequencia(ultimo: string, descansos: string[], proximo: string): number {
  const set = new Set(descansos);
  let seq = 0;
  let maior = 0;
  for (let d = somarDias(ultimo, 1); d < proximo; d = somarDias(d, 1)) {
    if (set.has(d)) seq = 0;
    else {
      seq += 1;
      if (seq > maior) maior = seq;
    }
  }
  return maior;
}

// Folgas de todos os grupos do setor numa semana. A folga que cai em feriado com a loja
// fechada, em dia de pico ou encostada em outra folga (X seguido de X — a folga de feriado
// não conta) vai para o dia da semana com menos gente de folga (pico pesa 30% a mais),
// sem folga encostada em folga e sem ninguém passar de 6 dias seguidos.
// `pesos` = pessoas por grupo. Mesma regra do Portal (e5SemanaSetor).
export function folgasDoSetorNaSemana(
  grupos: GrupoEscala[],
  cfg: ConfigEscala,
  segunda: string,
  feriados: FeriadoEscala[],
  pesos: Map<string, number> = new Map(),
  prof = 0
): Map<string, string[]> {
  const fechado = new Set(feriados.filter((f) => f.tipo === 'fechada').map((f) => f.data));
  const pico = new Set(feriados.filter((f) => f.tipo === 'pico').map((f) => f.data));
  const peso = (g: GrupoEscala) => pesos.get(g.id) || 1;
  const out = new Map<string, string[]>();
  const deslocar = new Map<GrupoEscala, string[]>();
  const fim = somarDias(segunda, 6);
  const antes = prof < 4 ? folgasDoSetorNaSemana(grupos, cfg, somarDias(segunda, -7), feriados, pesos, prof + 1) : null;
  const ultimoX = (g: GrupoEscala): string | null =>
    (antes ? antes.get(g.id)! : folgasBaseDaSemana(g, cfg, somarDias(segunda, -7)).filter((x) => !fechado.has(x))).slice().sort().pop() || null;
  for (const g of grupos) {
    const base = folgasBaseDaSemana(g, cfg, segunda).slice().sort();
    const ruim = new Set(base.filter((d) => fechado.has(d) || pico.has(d)));
    const bons = base.filter((d) => !ruim.has(d));
    const ult = ultimoX(g);
    for (const d of bons) {
      if (diaSemana(d) === 0) continue; // o domingo 1x1 não sai do lugar
      const colada =
        (ult !== null && somarDias(ult, 1) === d) ||
        bons.some((x) => x !== d && Math.abs(diffDias(x, d)) === 1 && (diaSemana(x) === 0 || x > d));
      if (colada) ruim.add(d);
    }
    out.set(g.id, base.filter((d) => !ruim.has(d)));
    if (ruim.size) deslocar.set(g, [...ruim].sort());
  }
  if (!deslocar.size) return out;
  const dias = [1, 2, 3, 4, 5, 6].map((n) => somarDias(segunda, n - 1)).filter((d) => !fechado.has(d));
  const carga: Record<string, number> = {};
  dias.forEach((d) => {
    carga[d] = 0;
  });
  for (const g of grupos) out.get(g.id)!.forEach((d) => { if (d in carga) carga[d] += peso(g); });
  const fechSem = [...fechado].filter((d) => d >= segunda && d <= fim);
  const combos = (lista: string[], k: number): string[][] => {
    if (k === 0) return [[]];
    const r: string[][] = [];
    lista.forEach((x, i) => combos(lista.slice(i + 1), k - 1).forEach((c) => r.push([x, ...c])));
    return r;
  };
  const ordem = [...deslocar.keys()].sort((a, b) => peso(b) - peso(a) || a.letra.localeCompare(b.letra));
  for (const g of ordem) {
    const tem = out.get(g.id)!;
    const origem = deslocar.get(g)!;
    const ant = antes ? antes.get(g.id)! : folgasBaseDaSemana(g, cfg, somarDias(segunda, -7));
    const ultimo = [...ant, ...[...fechado].filter((x) => x < segunda && x >= somarDias(segunda, -7))].sort().pop() || somarDias(segunda, -1);
    const ult = ultimoX(g);
    const baseProx = folgasBaseDaSemana(g, cfg, somarDias(segunda, 7));
    const proxX = baseProx.filter((x) => !fechado.has(x) && !pico.has(x)).sort()[0] || null;
    const prox =
      [...baseProx.filter((x) => !fechado.has(x)), ...[...fechado].filter((x) => x > fim && x <= somarDias(segunda, 13))].sort()[0] ||
      somarDias(segunda, 13);
    const sabado = origem.some((d) => diaSemana(d) === 6);
    const livres = dias.filter((c) => !tem.includes(c) && (diaSemana(c) !== 6 || sabado));
    const k = Math.min(origem.length, livres.length);
    let melhor: { combo: string[]; nivel: number; nota: number } | null = null;
    for (const combo of combos(livres, k)) {
      const todos = [...tem, ...combo].sort();
      const seq = maiorSequencia(ultimo, [...todos, ...fechSem], prox);
      const encosta =
        todos.some((x, i) => i > 0 && diffDias(x, todos[i - 1]) === 1) ||
        (ult !== null && todos.includes(somarDias(ult, 1))) ||
        (proxX !== null && todos.includes(somarDias(proxX, -1)));
      const nivel = seq > 6 ? 2 : encosta ? 1 : 0;
      const nota = combo.reduce((s, c, i) => s + carga[c] * (pico.has(c) ? 1.3 : 1) + Math.abs(diffDias(c, origem[i] || origem[0])) * 0.01, 0);
      if (!melhor || nivel < melhor.nivel || (nivel === melhor.nivel && nota < melhor.nota)) melhor = { combo, nivel, nota };
    }
    if (!melhor) continue;
    for (const c of melhor.combo) {
      tem.push(c);
      carga[c] += peso(g);
    }
    tem.sort();
  }
  return out;
}

export function folgasDoSetorNoPeriodo(
  grupos: GrupoEscala[],
  cfg: ConfigEscala,
  inicio: string,
  fim: string,
  feriados: FeriadoEscala[],
  pesos: Map<string, number> = new Map()
): Map<string, string[]> {
  const out = new Map<string, string[]>(grupos.map((g) => [g.id, []]));
  for (let seg = segundaDaSemana(inicio); seg <= fim; seg = somarDias(seg, 7)) {
    const s = folgasDoSetorNaSemana(grupos, cfg, seg, feriados, pesos);
    for (const g of grupos) s.get(g.id)!.forEach((d) => { if (d >= inicio && d <= fim) out.get(g.id)!.push(d); });
  }
  return out;
}

// Pessoas (vagas ocupadas) por grupo — usado para equilibrar as folgas mudadas.
export function pesosDosGrupos(mod: ModuloEscala): Map<string, number> {
  const m = new Map<string, number>();
  mod.vagas.forEach((v) => {
    if (v.colaboradorLojaId) m.set(v.grupoId, (m.get(v.grupoId) || 0) + 1);
  });
  return m;
}

export function folgasDoGrupoNoPeriodo(mod: ModuloEscala, grupoId: string, inicio: string, fim: string): string[] {
  return folgasDoSetorNoPeriodo(mod.grupos, mod.config, inicio, fim, mod.feriados, pesosDosGrupos(mod)).get(grupoId) || [];
}

// ---------------------------------------------------------------------
// Gerar um mês
// ---------------------------------------------------------------------
export async function gerarMes(mod: ModuloEscala, ano: number, mes: number, autor: string): Promise<{ folgas: number }> {
  const primeiro = primeiroDoMes(ano, mes);
  const dias = diasDoMes(ano, mes);
  const fim = dias[dias.length - 1];
  // o período 6x1 (antes do início do 5x2) foi montado à parte e não é refeito aqui (igual ao portal)
  const inicio = mod.config.inicio5x2 && mod.config.inicio5x2 > primeiro ? mod.config.inicio5x2 : primeiro;
  if (inicio > fim) throw new Error('Este mês é todo do período 6x1, que já está montado. Ajuste as folgas tocando nos dias.');
  const fechados = mod.feriados.filter((f) => f.tipo === 'fechada' && f.data >= inicio && f.data <= fim);
  let total = 0;
  const doSetor = folgasDoSetorNoPeriodo(mod.grupos, mod.config, inicio, fim, mod.feriados, pesosDosGrupos(mod));
  for (const g of mod.grupos) {
    const folgas = doSetor.get(g.id) || [];
    let r = await supabase.from('escala_grupo_folgas').delete().eq('grupo_id', g.id).gte('data', inicio).lte('data', fim);
    if (r.error) throw r.error;
    if (folgas.length) {
      r = await supabase.from('escala_grupo_folgas').insert(folgas.map((data) => ({ grupo_id: g.id, data })));
      if (r.error) throw r.error;
    }
    for (const v of mod.vagas.filter((x) => x.grupoId === g.id && x.colaboradorLojaId)) {
      const desde = v.desde && v.desde > inicio ? v.desde : inicio;
      total += await gravarFolgasDoColaborador(v.colaboradorLojaId as string, folgas, fechados, desde, fim, autor);
    }
  }
  const m = await supabase.from('escala_meses').upsert({ setor: mod.config.setor, mes: primeiro, gerado_por: autor, gerado_em: new Date().toISOString() });
  if (m.error) throw m.error;
  return { folgas: total };
}

// Troca as folgas (tipo folga / folga_feriado) do colaborador entre `desde`
// e `fim` pelas do grupo. Faltas, atestados e férias não são tocados.
async function gravarFolgasDoColaborador(
  colaboradorId: string,
  folgasGrupo: string[],
  fechados: FeriadoEscala[],
  desde: string,
  fim: string,
  autor: string
): Promise<number> {
  const del = await supabase
    .from('escala_folgas')
    .delete()
    .eq('colaborador_loja_id', colaboradorId)
    .eq('tipo', 'folga')
    .gte('data', desde)
    .lte('data', fim);
  if (del.error) throw del.error;
  // folga de feriado (F) lançada à mão fica; só refaz a dos dias de loja fechada
  const datasFechadas = fechados.filter((f) => f.data >= desde && f.data <= fim).map((f) => f.data);
  if (datasFechadas.length) {
    const delF = await supabase
      .from('escala_folgas')
      .delete()
      .eq('colaborador_loja_id', colaboradorId)
      .eq('tipo', 'folga_feriado')
      .in('data', datasFechadas);
    if (delF.error) throw delF.error;
  }
  const linhas = [
    ...folgasGrupo
      .filter((d) => d >= desde && d <= fim)
      .map((data) => ({ colaborador_loja_id: colaboradorId, data, tipo: 'folga', observacao: 'Escala 5x2 por grupos', registrado_por_nome: autor })),
    ...fechados
      .filter((f) => f.data >= desde && f.data <= fim)
      .map((f) => ({ colaborador_loja_id: colaboradorId, data: f.data, tipo: 'folga_feriado', observacao: f.descricao, registrado_por_nome: autor })),
  ];
  if (!linhas.length) return 0;
  const ins = await supabase.from('escala_folgas').upsert(linhas, { onConflict: 'colaborador_loja_id,data', ignoreDuplicates: true });
  if (ins.error) throw ins.error;
  return linhas.length;
}

// ---------------------------------------------------------------------
// Vagas: entrada e saída de colaborador
// ---------------------------------------------------------------------
export interface SugestaoVaga {
  grupo: GrupoEscala;
  vaga: VagaEscala | null; // null = criar vaga nova no grupo
  codigo: string;
  motivo: string;
}

export function sugerirVaga(mod: ModuloEscala, turno: Turno): SugestaoVaga | null {
  if (!mod.grupos.length) return null;
  const vazias = mod.vagas
    .filter((v) => !v.colaboradorLojaId && v.turno === turno)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  if (vazias.length) {
    const v = vazias[0];
    const g = mod.grupos.find((x) => x.id === v.grupoId)!;
    return { grupo: g, vaga: v, codigo: v.codigo, motivo: `O grupo ${g.letra} está com uma vaga ${turno === 'M' ? 'da manhã' : 'da tarde'} aberta.` };
  }
  // Sem vaga aberta: grupo com maior falta em relação ao quadro ideal;
  // empate → o grupo com menos gente nesse turno.
  const conta = (g: GrupoEscala) => mod.vagas.filter((v) => v.grupoId === g.id && v.turno === turno && v.colaboradorLojaId).length;
  const ideal = (g: GrupoEscala) => (turno === 'M' ? g.idealManha : g.idealTarde);
  const ord = [...mod.grupos].sort((a, b) => ideal(b) - conta(b) - (ideal(a) - conta(a)) || conta(a) - conta(b) || a.letra.localeCompare(b.letra));
  const g = ord[0];
  const n = mod.vagas.filter((v) => v.grupoId === g.id).length + 1;
  const falta = ideal(g) - conta(g);
  return {
    grupo: g,
    vaga: null,
    codigo: `${g.letra}${n}`,
    motivo: falta > 0 ? `O grupo ${g.letra} está com ${falta} a menos ${turno === 'M' ? 'na manhã' : 'na tarde'}.` : `Todos os grupos estão completos; o ${g.letra} é o que tem menos gente ${turno === 'M' ? 'na manhã' : 'na tarde'}.`,
  };
}

// Coloca um colaborador numa vaga a partir de `desde`, já com as folgas do
// grupo nos meses que já foram gerados.
export async function ocuparVaga(
  mod: ModuloEscala,
  dados: { vaga: VagaEscala | null; grupo: GrupoEscala; codigo: string; turno: Turno; funcao: FuncaoVaga; colaboradorLojaId: string; desde: string },
  autor: string
): Promise<void> {
  // Se a pessoa já estava em outra vaga, libera a outra antes.
  const antiga = mod.vagas.find((v) => v.colaboradorLojaId === dados.colaboradorLojaId && v.id !== dados.vaga?.id);
  if (antiga) {
    const r = await supabase.from('escala_vagas').update({ colaborador_loja_id: null }).eq('id', antiga.id);
    if (r.error) throw r.error;
  }
  if (dados.vaga) {
    const r = await supabase
      .from('escala_vagas')
      .update({ colaborador_loja_id: dados.colaboradorLojaId, turno: dados.turno, funcao: dados.funcao, desde: dados.desde })
      .eq('id', dados.vaga.id);
    if (r.error) throw r.error;
  } else {
    const r = await supabase.from('escala_vagas').insert({
      grupo_id: dados.grupo.id,
      codigo: dados.codigo,
      turno: dados.turno,
      funcao: dados.funcao,
      colaborador_loja_id: dados.colaboradorLojaId,
      desde: dados.desde,
      ordem: mod.vagas.filter((v) => v.grupoId === dados.grupo.id).length + 1,
    });
    if (r.error) throw r.error;
  }
  // Folgas do grupo nos meses já gerados, a partir de `desde`.
  const gerados = [...mod.mesesGerados].sort();
  if (!gerados.length) return;
  const ultimo = gerados[gerados.length - 1];
  const [a, m] = ultimo.split('-').map(Number);
  const fim = diasDoMes(a, m).slice(-1)[0];
  if (dados.desde > fim) return;
  const { data, error } = await supabase
    .from('escala_grupo_folgas')
    .select('data')
    .eq('grupo_id', dados.grupo.id)
    .gte('data', dados.desde)
    .lte('data', fim);
  if (error) throw error;
  const fechados = mod.feriados.filter((f) => f.tipo === 'fechada');
  await gravarFolgasDoColaborador(dados.colaboradorLojaId, (data ?? []).map((x: any) => x.data), fechados, dados.desde, fim, autor);
}

// Tira o colaborador da vaga (saída da empresa ou troca de setor): a vaga
// fica aberta e as folgas dele a partir de `desde` são apagadas.
export async function liberarVaga(vaga: VagaEscala, desde: string): Promise<void> {
  if (vaga.colaboradorLojaId) {
    const del = await supabase
      .from('escala_folgas')
      .delete()
      .eq('colaborador_loja_id', vaga.colaboradorLojaId)
      .in('tipo', ['folga', 'folga_feriado'])
      .gte('data', desde);
    if (del.error) throw del.error;
  }
  const r = await supabase.from('escala_vagas').update({ colaborador_loja_id: null, desde: null }).eq('id', vaga.id);
  if (r.error) throw r.error;
}

export async function atualizarVaga(vagaId: string, campos: { turno?: Turno; funcao?: FuncaoVaga }): Promise<void> {
  const r = await supabase.from('escala_vagas').update(campos).eq('id', vagaId);
  if (r.error) throw r.error;
}

export async function salvarFeriado(f: FeriadoEscala): Promise<void> {
  const r = await supabase.from('escala_feriados').upsert({ data: f.data, tipo: f.tipo, descricao: f.descricao });
  if (r.error) throw r.error;
}

export async function removerFeriado(data: string): Promise<void> {
  const r = await supabase.from('escala_feriados').delete().eq('data', data);
  if (r.error) throw r.error;
}

// ---------------------------------------------------------------------
// Conferência
// ---------------------------------------------------------------------
export interface ConferenciaPessoa {
  vaga: VagaEscala;
  semanas: { segunda: string; folgas: number; esperado: number; completa: boolean }[];
  maiorSequencia: number;
  domingosFolga: number;
  ok: boolean;
}

// `registros` deve trazer pelo menos 7 dias antes do mês, para conferir a
// sequência de dias trabalhados na virada.
export function conferirMes(mod: ModuloEscala, ano: number, mes: number, registros: RegistroDia[]): ConferenciaPessoa[] {
  const dias = diasDoMes(ano, mes);
  const inicio = dias[0];
  const fim = dias[dias.length - 1];
  const porPessoa = new Map<string, Map<string, TipoEscala>>();
  for (const r of registros) {
    if (!porPessoa.has(r.colaboradorLojaId)) porPessoa.set(r.colaboradorLojaId, new Map());
    porPessoa.get(r.colaboradorLojaId)!.set(r.data, r.tipo);
  }
  const fechado = new Set(mod.feriados.filter((f) => f.tipo === 'fechada').map((f) => f.data));
  const out: ConferenciaPessoa[] = [];
  for (const v of mod.vagas) {
    if (!v.colaboradorLojaId) continue;
    const reg = porPessoa.get(v.colaboradorLojaId) ?? new Map<string, TipoEscala>();
    const semanas: ConferenciaPessoa['semanas'] = [];
    const g = mod.grupos.find((x) => x.id === v.grupoId);
    // semana de segunda a domingo
    for (let seg = segundaDaSemana(inicio); seg <= fim; seg = somarDias(seg, 7)) {
      const dd = Array.from({ length: 7 }, (_, i) => somarDias(seg, i));
      const completa = dd[0] >= inicio && dd[6] <= fim && (!v.desde || dd[0] >= v.desde);
      const folgas = dd.filter((d) => reg.get(d) === 'folga').length;
      const esperado = semanaEm5x2(mod.config, seg) ? 2 : g && !g.folgaTodoDomingo && grupoFolgaDomingo(g, mod.config, dd[6]) ? 2 : 1;
      semanas.push({ segunda: seg, folgas, esperado, completa });
    }
    let seq = 0;
    let maior = 0;
    for (let d = somarDias(inicio, -7); d <= fim; d = somarDias(d, 1)) {
      if (reg.has(d) || fechado.has(d)) seq = 0;
      else {
        seq += 1;
        if (d >= inicio) maior = Math.max(maior, seq);
      }
    }
    const domingosFolga = dias.filter((d) => diaSemana(d) === 0 && reg.get(d) === 'folga').length;
    const ok = maior <= 6 && semanas.every((s) => !s.completa || s.folgas >= s.esperado);
    out.push({ vaga: v, semanas, maiorSequencia: maior, domingosFolga, ok });
  }
  return out;
}

// ---------------------------------------------------------------------
// PDVs
// ---------------------------------------------------------------------
export interface PdvCadastro {
  numero: number;
  tipo: 'normal' | 'preferencial' | '15volumes';
  ordemAbertura: number;
  sempreAberto: boolean;
  substituto: number | null;
}

export interface ChamadoPdv {
  id: string;
  pdv: number;
  chamado: string | null;
  problema: string | null;
  abertoEm: string;
  resolvidoEm: string | null;
}

export interface DistribuicaoPdv {
  pdv: number;
  manha: string | null;
  tarde: string | null;
}

export async function carregarPdvs(): Promise<{ pdvs: PdvCadastro[]; chamados: ChamadoPdv[] }> {
  const [p, c] = await Promise.all([
    supabase.from('pdv_cadastro').select('*').order('numero'),
    supabase.from('pdv_chamados').select('*').order('aberto_em', { ascending: false }),
  ]);
  if (p.error) throw p.error;
  if (c.error) throw c.error;
  return {
    pdvs: (p.data ?? []).map((x: any) => ({
      numero: x.numero,
      tipo: x.tipo,
      ordemAbertura: x.ordem_abertura,
      sempreAberto: x.sempre_aberto,
      substituto: x.substituto,
    })),
    chamados: (c.data ?? []).map((x: any) => ({
      id: x.id,
      pdv: x.pdv,
      chamado: x.chamado,
      problema: x.problema,
      abertoEm: x.aberto_em,
      resolvidoEm: x.resolvido_em,
    })),
  };
}

export function chamadoAbertoNoDia(chamados: ChamadoPdv[], pdv: number, data: string): ChamadoPdv | null {
  return chamados.find((c) => c.pdv === pdv && c.abertoEm <= data && (!c.resolvidoEm || c.resolvidoEm > data)) ?? null;
}

export async function abrirChamado(pdv: number, chamado: string, problema: string, data: string, autor: string): Promise<void> {
  const r = await supabase.from('pdv_chamados').insert({ pdv, chamado: chamado || null, problema: problema || null, aberto_em: data, registrado_por: autor });
  if (r.error) throw r.error;
}

export async function atualizarChamado(id: string, chamado: string, problema: string): Promise<void> {
  const r = await supabase.from('pdv_chamados').update({ chamado: chamado || null, problema: problema || null }).eq('id', id);
  if (r.error) throw r.error;
}

export async function resolverChamado(id: string, data: string): Promise<void> {
  const r = await supabase.from('pdv_chamados').update({ resolvido_em: data }).eq('id', id);
  if (r.error) throw r.error;
}

export async function buscarDistribuicao(data: string): Promise<DistribuicaoPdv[] | null> {
  const { data: linhas, error } = await supabase.from('pdv_distribuicao').select('*').eq('data', data);
  if (error) throw error;
  if (!linhas || !linhas.length) return null;
  return linhas.map((l: any) => ({ pdv: l.pdv, manha: l.manha, tarde: l.tarde }));
}

export async function salvarDistribuicao(data: string, lanes: DistribuicaoPdv[], autor: string): Promise<void> {
  const r = await supabase.from('pdv_distribuicao').upsert(
    lanes.map((l) => ({ data, pdv: l.pdv, manha: l.manha, tarde: l.tarde, alterado_por: autor, alterado_em: new Date().toISOString() }))
  );
  if (r.error) throw r.error;
}

export async function limparDistribuicao(data: string): Promise<void> {
  const r = await supabase.from('pdv_distribuicao').delete().eq('data', data);
  if (r.error) throw r.error;
}

export async function buscarTurnosDoDia(data: string): Promise<Map<string, Turno>> {
  const { data: linhas, error } = await supabase.from('escala_turno_dia').select('*').eq('data', data);
  if (error) throw error;
  return new Map((linhas ?? []).map((l: any) => [String(l.colaborador_loja_id), l.turno as Turno]));
}

export async function definirTurnoDoDia(data: string, colaboradorLojaId: string, turno: Turno | null, autor: string): Promise<void> {
  if (!turno) {
    const r = await supabase.from('escala_turno_dia').delete().eq('data', data).eq('colaborador_loja_id', colaboradorLojaId);
    if (r.error) throw r.error;
    return;
  }
  const r = await supabase.from('escala_turno_dia').upsert({ data, colaborador_loja_id: colaboradorLojaId, turno, registrado_por: autor });
  if (r.error) throw r.error;
}
