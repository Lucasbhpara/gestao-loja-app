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
  quem: string | null;
};
export type ContextoRelatorio = {
  numero: string | null;
  anterior: { pct: number; data: string; numero: string | null } | null;
  plano: LinhaPlano[] | null; // null = não se aplica
};

const esc = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export function formatarNumero(prefixo: string, numero: number | null | undefined, iso: string | null | undefined): string | null {
  if (numero == null) return null;
  const ano = (iso ?? new Date().toISOString()).slice(0, 4);
  return `${prefixo}-${ano}-${String(numero).padStart(4, '0')}`;
}

async function planoDaTarefa(tarefaId: string | null, responsavel: string, naoConformes: { texto: string; critico: boolean }[]): Promise<LinhaPlano[]> {
  let prazo: string | null = null;
  let itens: any[] = [];
  if (tarefaId) {
    const [t, c] = await Promise.all([
      supabase.from('tarefas').select('prazo, concluida').eq('id', tarefaId).maybeSingle(),
      supabase.from('correcao_itens').select('pergunta_texto, critico, status, aprovacao, respondido_por').eq('tarefa_id', tarefaId).order('criado_em'),
    ]);
    prazo = (t.data as any)?.prazo ?? null;
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
    }));
  }
  return naoConformes.map((n) => ({ item: n.texto, critico: n.critico, responsavel, prazo, status: 'pendente', quem: null }));
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

export async function contextoVisitaTecnica(
  v: { id: string; setor: string; unidade?: string | null; finalizadaEm?: string | null; tarefaId?: string | null },
  nomeSetor: string,
  naoConformes: { texto: string; critico: boolean }[],
): Promise<ContextoRelatorio> {
  try {
    const { data: eu } = await supabase.from('visitas_tecnicas').select('numero, iniciada_em, finalizada_em, tarefa_id').eq('id', v.id).maybeSingle();
    const ref = (eu as any)?.finalizada_em ?? v.finalizadaEm ?? new Date().toISOString();
    let q = supabase.from('visitas_tecnicas').select('aproveitamento, finalizada_em, numero').eq('setor', v.setor).eq('status', 'finalizada').lt('finalizada_em', ref);
    if (v.unidade) q = q.eq('unidade', v.unidade);
    const { data: ant } = await q.order('finalizada_em', { ascending: false }).limit(1);
    const a = (ant as any[])?.[0];
    return {
      numero: formatarNumero('VT', (eu as any)?.numero, (eu as any)?.finalizada_em ?? (eu as any)?.iniciada_em),
      anterior: a && a.aproveitamento != null ? { pct: Number(a.aproveitamento), data: a.finalizada_em, numero: formatarNumero('VT', a.numero, a.finalizada_em) } : null,
      plano: await planoDaTarefa((eu as any)?.tarefa_id ?? v.tarefaId ?? null, nomeSetor === 'Geral' ? 'Gerência' : `Encarregado · ${nomeSetor}`, naoConformes),
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
      return `<tr><td class="pn">${i + 1}</td><td>${esc(l.item)}${l.critico ? ' <span class="critico">CRÍTICO</span>' : ''}</td><td>${esc(l.responsavel)}</td><td class="pc">${l.prazo ? dataBr(l.prazo) : '—'}</td><td class="pc"><span class="badge ${cls}">${txt}</span></td></tr>`;
    })
    .join('');
  const feitos = p.filter((l) => l.status === 'aprovado').length;
  return `${rotulo('Plano de ação', `${feitos} de ${p.length} concluídos`)}
<table class="plano"><thead><tr><th class="pn">#</th><th>Não conformidade</th><th>Responsável</th><th class="pc">Prazo</th><th class="pc">Status</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

