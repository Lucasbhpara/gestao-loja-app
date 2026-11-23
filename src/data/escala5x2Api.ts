import { supabase } from '../lib/supabase';
import { TipoEscala } from './escalaApi';

// Escala 5x2 por grupos (Loja 327) — tabelas criadas por supabase/escala_5x2.sql.
//
// Como funciona:
//  - Cada setor tem grupos (A, B, C…). Todo mundo do grupo folga junto,
//    sempre nos mesmos dias, num ciclo de 2 semanas:
//      · semana em que o grupo TRABALHA no domingo → folga em dia_1 e dia_2;
//      · semana em que o grupo FOLGA no domingo    → folga no domingo e em dia_2.
//    dia_2 vem sempre depois de dia_1, o que garante no máximo 6 dias seguidos.
//  - O revezamento de domingo é 1x1: os grupos de fase 0 folgam no domingo de
//    referência (escala_config.domingo_ref) e de 2 em 2 semanas; os de fase 1
//    folgam nos domingos do meio.
//  - Feriado com a loja FECHADA não conta como folga: vira "folga_feriado"
//    para todo mundo e, se cair no dia de folga do grupo, a folga é mudada
//    para outro dia da mesma semana. Feriado com a loja aberta que cair na
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
// Regra das folgas do grupo
// ---------------------------------------------------------------------
export function grupoFolgaDomingo(g: GrupoEscala, cfg: ConfigEscala, domingo: string): boolean {
  if (g.folgaTodoDomingo) return true;
  const semanas = Math.round(diffDias(domingo, cfg.domingoRef) / 7);
  const par = ((semanas % 2) + 2) % 2 === 0;
  return g.fase === 0 ? par : !par;
}

function diaDaSemana(domingo: string, dia: number): string {
  return somarDias(domingo, dia);
}

// Folgas do grupo numa semana (domingo → sábado), já tirando a folga de cima
// de feriado com loja fechada e, se possível, de dia de pico.
export function folgasDoGrupoNaSemana(g: GrupoEscala, cfg: ConfigEscala, domingo: string, feriados: FeriadoEscala[]): string[] {
  const fechado = new Set(feriados.filter((f) => f.tipo === 'fechada').map((f) => f.data));
  const pico = new Set(feriados.filter((f) => f.tipo === 'pico').map((f) => f.data));
  const folgaDom = grupoFolgaDomingo(g, cfg, domingo);
  const base = folgaDom ? [domingo, diaDaSemana(domingo, g.dia2)] : [diaDaSemana(domingo, g.dia1), diaDaSemana(domingo, g.dia2)];
  const escolhidas = new Set<string>();
  const ruins: string[] = [];
  for (const d of base) {
    if (fechado.has(d) || pico.has(d)) ruins.push(d);
    else escolhidas.add(d);
  }
  for (const d of ruins) {
    const ordem = [1, 2, 3, 5, 4] // seg, ter, qua, sex, qui — quinta e sexta têm mais movimento
      .map((n) => diaDaSemana(domingo, n))
      .filter((x) => !escolhidas.has(x) && !fechado.has(x) && !pico.has(x))
      // mais perto do dia original, antes de depois (protege os 6 dias seguidos)
      .sort((a, b) => Math.abs(diffDias(a, d)) - Math.abs(diffDias(b, d)) || diffDias(a, b));
    if (ordem.length) escolhidas.add(ordem[0]);
    else if (!fechado.has(d)) escolhidas.add(d); // pico sem alternativa: mantém
  }
  return [...escolhidas].sort();
}

export function folgasDoGrupoNoPeriodo(g: GrupoEscala, cfg: ConfigEscala, inicio: string, fim: string, feriados: FeriadoEscala[]): string[] {
  let dom = somarDias(inicio, -diaSemana(inicio));
  const out: string[] = [];
  while (dom <= fim) {
    for (const d of folgasDoGrupoNaSemana(g, cfg, dom, feriados)) if (d >= inicio && d <= fim) out.push(d);
    dom = somarDias(dom, 7);
  }
  return out;
}

// ---------------------------------------------------------------------
// Gerar um mês
// ---------------------------------------------------------------------
export async function gerarMes(mod: ModuloEscala, ano: number, mes: number, autor: string): Promise<{ folgas: number }> {
  const inicio = primeiroDoMes(ano, mes);
  const dias = diasDoMes(ano, mes);
  const fim = dias[dias.length - 1];
  const fechados = mod.feriados.filter((f) => f.tipo === 'fechada' && f.data >= inicio && f.data <= fim);
  let total = 0;
  for (const g of mod.grupos) {
    const folgas = folgasDoGrupoNoPeriodo(g, mod.config, inicio, fim, mod.feriados);
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
  const m = await supabase.from('escala_meses').upsert({ setor: mod.config.setor, mes: inicio, gerado_por: autor, gerado_em: new Date().toISOString() });
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
    .in('tipo', ['folga', 'folga_feriado'])
    .gte('data', desde)
    .lte('data', fim);
  if (del.error) throw del.error;
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
  semanas: { domingo: string; folgas: number; esperado: number; completa: boolean }[];
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
    let dom = somarDias(inicio, -diaSemana(inicio));
    while (dom <= fim) {
      const dd = Array.from({ length: 7 }, (_, i) => somarDias(dom, i));
      const completa = dd[0] >= inicio && dd[6] <= fim && (!v.desde || dd[0] >= v.desde);
      const folgas = dd.filter((d) => reg.get(d) === 'folga').length;
      const em5x2 = !!mod.config.inicio5x2 && dd[6] >= mod.config.inicio5x2;
      semanas.push({ domingo: dom, folgas, esperado: em5x2 ? 2 : 1, completa });
      dom = somarDias(dom, 7);
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
