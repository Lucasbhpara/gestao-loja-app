import { supabase } from './supabase';
import { PDF_VERDE, PDF_VERMELHO, rotulo } from './layoutPdf';

// Informações "de controle" dos relatórios (Checklist, Visita Técnica e
// Visita do Supervisor): número do documento, comparação com a avaliação
// anterior do mesmo setor e plano de ação das não conformidades.

export type LinhaPlano = {
  item: string;
  critico: boolean;
  responsavel: string;
  prazo: string | null; // AAAA-MM-DD
  status: 'pendente' | 'corrigido' | 'nao_possivel' | 'aprovado' | 'devolvido';
  quem: string | null; // quem resolveu (encarregado)
  quando: string | null; // quando resolveu (ISO)
  comentario: string | null; // o que foi feito
  respostaId: string | null; // liga o item à resposta/apontamento da visita
  conferidoPor: string | null; // quem conferiu (aprovou/devolveu)
  conferidoEm: string | null;
};
export type ContextoRelatorio = {
  numero: string | null;
  anterior: { pct: number; data: string; numero: string | null } | null;
  plano: LinhaPlano[] | null; // null = não se aplica
};

const esc = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
// Data e hora no fuso do celular: "18/11/2026 às 14:32".
export const dataHoraBr = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

// Texto curto da conferência de um item: quem resolveu, quando, o que fez
// e quem conferiu. Vazio se ninguém mexeu ainda.
export function htmlResolucao(l: LinhaPlano): string {
  if (!l.quem && !l.quando && !l.comentario) return '';
  const partes: string[] = [];
  if (l.quem || l.quando) partes.push(`<b>Resolvido por:</b> ${esc(l.quem ?? '—')}${l.quando ? ` em ${dataHoraBr(l.quando)}` : ''}`);
  if (l.comentario) partes.push(`<b>O que foi feito:</b> ${esc(l.comentario)}`);
  if (l.conferidoPor) partes.push(`<b>Conferido por:</b> ${esc(l.conferidoPor)}${l.conferidoEm ? ` em ${dataHoraBr(l.conferidoEm)}` : ''}`);
  return `<div class="det" style="margin-top:4px">${partes.join('<br/>')}</div>`;
}

export function formatarNumero(prefixo: string, numero: number | null | undefined, iso: string | null | undefined): string | null {
  if (numero == null) return null;
  const ano = (iso ?? new Date().toISOString()).slice(0, 4);
  return `${prefixo}-${ano}-${String(numero).padStart(4, '0')}`;
}

async function planoDaTarefa(tarefaId: string | null, responsavel: string, naoConformes: { texto: string; critico: boolean }[]): Promise<LinhaPlano[]> {
  let prazo: string | null = null;
  let conferidoPor: string | null = null;
  let conferidoEm: string | null = null;
  let itens: any[] = [];
  if (tarefaId) {
    const [t, c] = await Promise.all([
      supabase.from('tarefas').select('prazo, concluida, correcao_avaliada_por, correcao_avaliada_em').eq('id', tarefaId).maybeSingle(),
      supabase
        .from('correcao_itens')
        .select('pergunta_texto, critico, status, aprovacao, respondido_por, respondido_em, comentario, resposta_id')
        .eq('tarefa_id', tarefaId)
        .order('criado_em'),
    ]);
    prazo = (t.data as any)?.prazo ?? null;
    conferidoPor = (t.data as any)?.correcao_avaliada_por ?? null;
    conferidoEm = (t.data as any)?.correcao_avaliada_em ?? null;
    itens = (c.data as any[]) ?? [];
  }
  if (itens.length) {
    return itens.map((i) => ({
      item: i.pergunta_texto,
      critico: !!i.critico,
      responsavel,
      prazo,
      status: i.aprovacao === 'aprovado' ? 'aprovado' : i.aprovacao === 'devolvido' ? 'devolvido' : i.status === 'corrigido' ? 'corrigido' : i.status === 'nao_possivel' ? 'nao_possivel' : 'pendente',
      quem: i.respondido_por ?? null,
      quando: i.respondido_em ?? null,
      comentario: i.comentario ?? null,
      respostaId: i.resposta_id ?? null,
      conferidoPor: i.aprovacao ? conferidoPor : null,
      conferidoEm: i.aprovacao ? conferidoEm : null,
    }));
  }
  return naoConformes.map((n) => ({
    item: n.texto,
    critico: n.critico,
    responsavel,
    prazo,
    status: 'pendente',
    quem: null,
    quando: null,
    comentario: null,
    respostaId: null,
    conferidoPor: null,
    conferidoEm: null,
  }));
}

export async function contextoChecklist(
  av: { id: string; setor: string; finalizadaEm?: string | null; tarefaId?: string | null },
  nomeSetor: string,
  naoConformes: { texto: string; critico: boolean }[],
): Promise<ContextoRelatorio> {
  try {
    const { data: eu } = await supabase.from('avaliacoes_setor').select('numero, iniciada_em, finalizada_em, tarefa_id').eq('id', av.id).maybeSingle();
    const ref = (eu as any)?.finalizada_em ?? av.finalizadaEm ?? new Date().toISOString();
    const { data: ant } = await supabase
      .from('avaliacoes_setor')
      .select('aproveitamento, finalizada_em, numero')
      .eq('setor', av.setor).eq('status', 'finalizada').lt('finalizada_em', ref)
      .order('finalizada_em', { ascending: false }).limit(1);
    const a = (ant as any[])?.[0];
    return {
      numero: formatarNumero('CK', (eu as any)?.numero, (eu as any)?.finalizada_em ?? (eu as any)?.iniciada_em),
      anterior: a && a.aproveitamento != null ? { pct: Number(a.aproveitamento), data: a.finalizada_em, numero: formatarNumero('CK', a.numero, a.finalizada_em) } : null,
      plano: await planoDaTarefa((eu as any)?.tarefa_id ?? av.tarefaId ?? null, `Encarregado · ${nomeSetor}`, naoConformes),
    };
  } catch {
    return { numero: null, anterior: null, plano: null };
  }
}

// Lojas sem o app: a correção chega pelo link da visita (vt_correcao_loja).
async function planoPeloLink(visitaId: string, responsavel: string, naoConformes: { texto: string; critico: boolean; respostaId?: string }[]): Promise<LinhaPlano[]> {
  const { data } = await supabase.from('vt_correcao_loja').select('*').eq('visita_id', visitaId);
  const porResp = new Map(((data as any[]) ?? []).map((c) => [c.resposta_id, c]));
  return naoConformes.map((n) => {
    const c: any = n.respostaId ? porResp.get(n.respostaId) : null;
    return {
      item: n.texto,
      critico: n.critico,
      responsavel,
      prazo: null,
      status: !c ? 'pendente' : c.avaliacao === 'aprovado' ? 'aprovado' : c.avaliacao === 'devolvido' ? 'devolvido' : c.status === 'nao_possivel' ? 'nao_possivel' : 'corrigido',
      quem: c?.respondido_por ?? null,
      quando: c?.respondido_em ?? null,
      comentario: c?.comentario ?? null,
      respostaId: n.respostaId ?? null,
      conferidoPor: c?.avaliado_por ?? null,
      conferidoEm: c?.avaliado_em ?? null,
    } as LinhaPlano;
  });
}

export async function contextoVisitaTecnica(
  v: { id: string; setor: string; unidade?: string | null; finalizadaEm?: string | null; tarefaId?: string | null; modelo?: string | null },
  nomeSetor: string,
  naoConformes: { texto: string; critico: boolean; respostaId?: string }[],
): Promise<ContextoRelatorio> {
  try {
    const { data: eu } = await supabase.from('visitas_tecnicas').select('numero, iniciada_em, finalizada_em, tarefa_id').eq('id', v.id).maybeSingle();
    const ref = (eu as any)?.finalizada_em ?? v.finalizadaEm ?? new Date().toISOString();
    let q = supabase.from('visitas_tecnicas').select('aproveitamento, finalizada_em, numero').eq('setor', v.setor).eq('status', 'finalizada').not('aproveitamento', 'is', null).eq('modelo', v.modelo ?? 'perguntas').lt('finalizada_em', ref);
    if (v.unidade) q = q.eq('unidade', v.unidade);
    const { data: ant } = await q.order('finalizada_em', { ascending: false }).limit(1);
    const a = (ant as any[])?.[0];
    return {
      numero: formatarNumero('VT', (eu as any)?.numero, (eu as any)?.finalizada_em ?? (eu as any)?.iniciada_em),
      anterior: a && a.aproveitamento != null ? { pct: Number(a.aproveitamento), data: a.finalizada_em, numero: formatarNumero('VT', a.numero, a.finalizada_em) } : null,
      plano: ((eu as any)?.tarefa_id ?? v.tarefaId)
        ? await planoDaTarefa((eu as any)?.tarefa_id ?? v.tarefaId ?? null, nomeSetor === 'Geral' ? 'Gerência' : `Encarregado · ${nomeSetor}`, naoConformes)
        : await planoPeloLink(v.id, nomeSetor === 'Geral' ? 'Gerência' : `Encarregado · ${nomeSetor}`, naoConformes),
    };
  } catch {
    return { numero: null, anterior: null, plano: null };
  }
}

export async function numeroVisitaSupervisor(id: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('visitas_supervisor').select('numero, iniciada_em').eq('id', id).maybeSingle();
    return formatarNumero('VS', (data as any)?.numero, (data as any)?.iniciada_em);
  } catch {
    return null;
  }
}

// "▲ 6 pts vs 28/10" para colocar embaixo do aproveitamento.
export function textoComparacao(pct: number, ctx: ContextoRelatorio | null | undefined): string {
  const a = ctx?.anterior;
  if (!a) return 'primeira avaliação do setor';
  const d = Math.round((pct - a.pct) * 10) / 10;
  const cor = d > 0 ? PDF_VERDE : d < 0 ? PDF_VERMELHO : '#6B7486';
  const s = d > 0 ? '▲' : d < 0 ? '▼' : '=';
  return `<span style="color:${cor};font-weight:600">${s} ${Math.abs(d).toLocaleString('pt-BR')} pts</span> vs ${dataBr(a.data)} (${a.pct}%)`;
}

export function classificacao(pct: number): { texto: string; cor: string; fundo: string } {
  if (pct >= 90) return { texto: 'Ótimo', cor: PDF_VERDE, fundo: '#E7F6EC' };
  if (pct >= 75) return { texto: 'Bom', cor: '#2F7A4F', fundo: '#EEF7F1' };
  if (pct >= 60) return { texto: 'Regular', cor: '#B45309', fundo: '#FFF6E5' };
  return { texto: 'Crítico', cor: PDF_VERMELHO, fundo: '#FEECEB' };
}

const STATUS: Record<LinhaPlano['status'], [string, string]> = {
  pendente: ['Pendente', 'b-nao'],
  corrigido: ['Corrigido · aguardando', 'b-azul'],
  nao_possivel: ['Não foi possível', 'b-na'],
  aprovado: ['Concluído', 'b-sim'],
  devolvido: ['Devolvido', 'b-nao'],
};

export function htmlPlanoAcao(ctx: ContextoRelatorio | null | undefined): string {
  const p = ctx?.plano;
  if (!p || !p.length) return '';
  const linhas = p
    .map((l, i) => {
      const [txt, cls] = STATUS[l.status];
      const quem = l.quem || l.quando ? `${esc(l.quem ?? '—')}${l.quando ? `<div class="base">${dataHoraBr(l.quando)}</div>` : ''}` : '—';
      return `<tr><td class="pn">${i + 1}</td><td>${esc(l.item)}${l.critico ? ' <span class="critico">CRÍTICO</span>' : ''}${
        l.comentario ? `<div class="base">O que foi feito: ${esc(l.comentario)}</div>` : ''
      }</td><td>${esc(l.responsavel)}</td><td class="pc">${l.prazo ? dataBr(l.prazo) : '—'}</td><td>${quem}</td><td class="pc"><span class="badge ${cls}">${txt}</span></td></tr>`;
    })
    .join('');
  const feitos = p.filter((l) => l.status === 'aprovado').length;
  const conf = p.find((l) => l.conferidoPor);
  return `${rotulo('Plano de ação', `${feitos} de ${p.length} concluídos`)}
<table class="plano"><thead><tr><th class="pn">#</th><th>Não conformidade</th><th>Responsável</th><th class="pc">Prazo</th><th>Resolvido por / quando</th><th class="pc">Status</th></tr></thead><tbody>${linhas}</tbody></table>${
    conf ? `<div class="base" style="margin-top:6px">Correções conferidas por ${esc(conf.conferidoPor!)}${conf.conferidoEm ? ` em ${dataHoraBr(conf.conferidoEm)}` : ''}.</div>` : ''
  }`;
}

