// Regras do Mapa dos PDVs (Frente de Caixa) — sem acesso a banco, só lógica,
// para dar para testar e reaproveitar (tela + imagem do WhatsApp).
//
//  - PDV 1 e 2: preferencial · PDV 11 e 12: até 15 volumes.
//  - Os PDVs marcados como "sempre aberto" (1 e 12) nunca ficam fechados.
//    Se um deles estiver com defeito, o substituto (2 ou 11) assume a regra.
//  - Ordem de abertura (intercalada): 1, 12, 3, 10, 5, 8, 2, 11, 4, 9, 6, 7.
//  - Manhã ocupa os PDVs na ordem; a tarde vai primeiro para os "sempre
//    aberto" (rendição: cobre o almoço e assume às 17:20), depois para os
//    PDVs vazios e depois como rendição dos outros. Quem sobra empacota.
//  - Encarregadas e embaladora não ocupam PDV.
//  - Rodízio: a ordem das operadoras muda todo dia.
import type { PdvCadastro, Turno, FuncaoVaga, DistribuicaoPdv } from '../data/escala5x2Api';

export interface PessoaDia {
  id: string; // colaborador_loja_id
  nome: string;
  turno: Turno; // turno do dia (já com o "vir de manhã")
  turnoBase: Turno;
  funcao: FuncaoVaga;
  grupo: string;
}

export type Lanes = Record<number, { m: string | null; t: string | null }>;

export interface Horario {
  a: string;
  b: string;
  rotulo: string;
  manha: boolean;
  tarde: boolean | 'w1' | 'w2';
}

export interface Almoco {
  dividido: boolean;
  qtdManha: number;
  parte1: string[];
  parte2: string[];
}

export interface Assento {
  id: string;
  papel: string;
}

const STOP = ['DE', 'DA', 'DO', 'DOS', 'DAS'];
export function nomeCurto(n: string): string {
  const w = n.trim().split(/\s+/).filter((x) => !STOP.includes(x.toUpperCase()));
  return [w[0], w[1]]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

export function rotuloPdv(p: PdvCadastro | undefined): string {
  if (!p) return '';
  return p.tipo === 'preferencial' ? 'Preferencial' : p.tipo === '15volumes' ? 'Até 15 volumes' : '';
}

// PDVs que funcionam no dia (sem chamado aberto), na ordem de abertura, com
// os "sempre aberto" (ou seus substitutos) na frente.
export function ordemDoDia(pdvs: PdvCadastro[], quebrados: Set<number>): { ordem: number[]; obrigatorios: number[] } {
  const ok = pdvs.filter((p) => !quebrados.has(p.numero)).sort((a, b) => a.ordemAbertura - b.ordemAbertura);
  const obrigatorios: number[] = [];
  for (const p of pdvs.filter((x) => x.sempreAberto).sort((a, b) => a.ordemAbertura - b.ordemAbertura)) {
    if (!quebrados.has(p.numero)) obrigatorios.push(p.numero);
    else if (p.substituto && !quebrados.has(p.substituto)) obrigatorios.push(p.substituto);
  }
  const ordem = [...obrigatorios, ...ok.map((p) => p.numero).filter((n) => !obrigatorios.includes(n))];
  return { ordem, obrigatorios };
}

const operadoras = (pessoas: PessoaDia[], t?: Turno) => pessoas.filter((p) => p.funcao === 'operadora' && (!t || p.turno === t));

export function distribuicaoAutomatica(pessoas: PessoaDia[], pdvs: PdvCadastro[], quebrados: Set<number>, indiceDia: number): Lanes {
  const { ordem, obrigatorios } = ordemDoDia(pdvs, quebrados);
  const girar = (a: PessoaDia[]) => {
    const s = [...a].sort((x, y) => x.nome.localeCompare(y.nome));
    const n = s.length;
    return n ? s.map((_, i) => s[(((i + indiceDia * 3) % n) + n) % n]) : s;
  };
  const M = girar(operadoras(pessoas, 'M'));
  const T = girar(operadoras(pessoas, 'T'));
  const L: Lanes = {};
  for (const p of pdvs) L[p.numero] = { m: null, t: null };
  M.slice(0, ordem.length).forEach((p, i) => (L[ordem[i]].m = p.id));
  let j = 0;
  for (const p of obrigatorios) if (L[p].m && j < T.length) L[p].t = T[j++].id;
  for (const p of ordem) if (!L[p].m && !L[p].t && j < T.length) L[p].t = T[j++].id;
  for (const p of ordem) if (L[p].m && !L[p].t && j < T.length) L[p].t = T[j++].id;
  return L;
}

// Junta a distribuição salva (trocas manuais) com quem está trabalhando.
// Se alguém da distribuição salva não está mais no dia (falta, atestado,
// troca de turno) ou o PDV quebrou, volta para a automática.
export function distribuicaoDoDia(
  salva: DistribuicaoPdv[] | null,
  pessoas: PessoaDia[],
  pdvs: PdvCadastro[],
  quebrados: Set<number>,
  indiceDia: number
): { lanes: Lanes; manual: boolean } {
  if (salva && salva.length) {
    const m = new Set(operadoras(pessoas, 'M').map((p) => p.id));
    const t = new Set(operadoras(pessoas, 'T').map((p) => p.id));
    const valida = salva.every(
      (l) => (!l.manha || m.has(l.manha)) && (!l.tarde || t.has(l.tarde)) && (!quebrados.has(l.pdv) || (!l.manha && !l.tarde))
    );
    if (valida) {
      const L: Lanes = {};
      for (const p of pdvs) L[p.numero] = { m: null, t: null };
      for (const l of salva) if (L[l.pdv]) L[l.pdv] = { m: l.manha, t: l.tarde };
      return { lanes: L, manual: true };
    }
  }
  return { lanes: distribuicaoAutomatica(pessoas, pdvs, quebrados, indiceDia), manual: false };
}

export function almocoDoDia(pessoas: PessoaDia[], lanes: Lanes, pdvs: PdvCadastro[], quebrados: Set<number>, limite: number): Almoco {
  const { ordem } = ordemDoDia(pdvs, quebrados);
  const qtdManha = operadoras(pessoas, 'M').length;
  const dividido = qtdManha < limite;
  const ord: string[] = [];
  for (const p of ordem) if (lanes[p]?.t && !lanes[p].m) ord.push(lanes[p].t as string);
  for (const p of ordem) if (lanes[p]?.t && lanes[p].m) ord.push(lanes[p].t as string);
  for (const p of operadoras(pessoas, 'T')) if (!ord.includes(p.id)) ord.push(p.id);
  return {
    dividido,
    qtdManha,
    parte1: dividido ? ord.filter((_, i) => i % 2 === 0) : ord,
    parte2: dividido ? ord.filter((_, i) => i % 2 === 1) : [],
  };
}

export function horariosDoDia(domingo: boolean, almoco: Almoco): Horario[] {
  if (domingo)
    return [
      { a: '07:20', b: '08:30', rotulo: 'só manhã', manha: true, tarde: false },
      { a: '08:30', b: '13:35', rotulo: 'manhã e tarde', manha: true, tarde: true },
      { a: '13:35', b: '14:45', rotulo: 'só tarde', manha: false, tarde: true },
    ];
  const h: Horario[] = [
    { a: '07:20', b: '11:30', rotulo: 'só manhã', manha: true, tarde: false },
    { a: '11:30', b: '12:00', rotulo: 'manhã e tarde', manha: true, tarde: true },
    { a: '12:00', b: '13:20', rotulo: 'manhã no almoço', manha: false, tarde: true },
    { a: '13:20', b: '14:00', rotulo: 'manhã e tarde', manha: true, tarde: true },
    { a: '14:00', b: '15:20', rotulo: almoco.dividido ? 'tarde no almoço (1ª parte)' : 'tarde no almoço', manha: true, tarde: 'w1' },
  ];
  if (almoco.dividido) h.push({ a: '15:20', b: '16:40', rotulo: 'tarde no almoço (2ª parte)', manha: true, tarde: 'w2' });
  h.push(
    { a: almoco.dividido ? '16:40' : '15:20', b: '17:20', rotulo: 'manhã e tarde', manha: true, tarde: true },
    { a: '17:20', b: '21:30', rotulo: 'só tarde', manha: false, tarde: true }
  );
  return h;
}

// Quem está em cada PDV num horário.
export function assentosNoHorario(
  pessoas: PessoaDia[],
  lanes: Lanes,
  pdvs: PdvCadastro[],
  quebrados: Set<number>,
  almoco: Almoco,
  h: Horario
): { assentos: Record<number, Assento | null>; empacotando: string[] } {
  const { ordem, obrigatorios } = ordemDoDia(pdvs, quebrados);
  const tardePresente = (id: string) =>
    h.tarde === true || (h.tarde === 'w1' && !almoco.parte1.includes(id)) || (h.tarde === 'w2' && !almoco.parte2.includes(id));
  const presentes = new Set(
    operadoras(pessoas)
      .filter((p) => (p.turno === 'M' && h.manha) || (p.turno === 'T' && h.tarde && tardePresente(p.id)))
      .map((p) => p.id)
  );
  const S: Record<number, Assento | null> = {};
  for (const p of pdvs) S[p.numero] = null;
  for (const p of ordem) if (lanes[p]?.m && presentes.has(lanes[p].m as string)) S[p] = { id: lanes[p].m as string, papel: 'manhã' };
  for (const p of ordem) if (!lanes[p]?.m && lanes[p]?.t && presentes.has(lanes[p].t as string)) S[p] = { id: lanes[p].t as string, papel: 'tarde' };
  for (const p of ordem)
    if (lanes[p]?.m && lanes[p]?.t && !S[p] && presentes.has(lanes[p].t as string))
      S[p] = { id: lanes[p].t as string, papel: h.manha ? 'cobrindo almoço' : 'assumiu às 17:20' };
  const sentadas = new Set(Object.values(S).filter(Boolean).map((x) => (x as Assento).id));
  const livres = [...presentes].filter((id) => !sentadas.has(id));
  for (const p of ordem) if (!S[p] && livres.length) S[p] = { id: livres.shift() as string, papel: 'cobrindo almoço' };
  for (const m of obrigatorios)
    if (!S[m]) {
      const de = [...ordem].reverse().find((p) => S[p] && !obrigatorios.includes(p));
      if (de) {
        S[m] = { id: (S[de] as Assento).id, papel: `veio do PDV ${de}` };
        S[de] = null;
      }
    }
  return { assentos: S, empacotando: livres };
}

// Quem empacota o dia todo: embaladora + operadoras sem PDV.
export function empacotandoNoDia(pessoas: PessoaDia[], lanes: Lanes): PessoaDia[] {
  const usadas = new Set<string>();
  Object.values(lanes).forEach((l) => {
    if (l.m) usadas.add(l.m);
    if (l.t) usadas.add(l.t);
  });
  return [...pessoas.filter((p) => p.funcao === 'embaladora'), ...operadoras(pessoas).filter((p) => !usadas.has(p.id))];
}

// Troca a pessoa de um PDV; se ela já estava em outro, as duas trocam.
export function trocarNoPdv(lanes: Lanes, pdv: number, campo: 'm' | 't', id: string | null): Lanes {
  const L: Lanes = JSON.parse(JSON.stringify(lanes));
  const antiga = L[pdv][campo];
  if (antiga === id) return L;
  if (id) {
    const outro = Object.keys(L)
      .map(Number)
      .find((p) => L[p][campo] === id);
    if (outro !== undefined) L[outro][campo] = antiga;
  }
  L[pdv][campo] = id;
  return L;
}
