import { supabase } from '../lib/supabase';
import { Tarefa } from './tarefasApi';

// =============================================================================
// Correção de checklist (Visita Técnica e Checklist de Setor).
//
// Fluxo:
//   1. Checklist finalizado com "Não" → tarefa pro encarregado do setor
//      (correcao_status = 'pendente').
//   2. O encarregado abre a tarefa e faz a CORREÇÃO: vê só os "Não", com a
//      observação e as fotos de quem apontou, e marca cada um como
//      "Corrigido" (com foto do depois) ou "Não foi possível" (com motivo).
//      Ao enviar → 'enviada'.
//   3. Quem fez o checklist (veterinário/gerente — qualquer um com acesso
//      àquele checklist) APROVA ou DEVOLVE cada item. Se algum voltar →
//      'devolvida' (o encarregado refaz só os devolvidos); se tudo for
//      aprovado → 'aprovada' e a tarefa é concluída.
//
// Tabela: correcao_itens (um item por "Não" da tarefa) + colunas
// correcao_* em tarefas. Fotos no bucket 'correcao-fotos'.
// =============================================================================

export type OrigemCorrecao = 'visita' | 'avaliacao';
export type StatusItemCorrecao = 'pendente' | 'corrigido' | 'nao_possivel';
export type AprovacaoItem = 'aprovado' | 'devolvido';

export interface ItemCorrecao {
  respostaId: string;
  perguntaTexto: string;
  critico: boolean;
  // O que foi apontado no checklist (antes)
  observacaoOriginal: string | null;
  fotosAntes: string[];
  // O que o encarregado fez (depois)
  status: StatusItemCorrecao;
  comentario: string | null;
  fotosDepois: string[];
  respondidoPor: string | null;
  respondidoEm: string | null;
  // Avaliação de quem fez o checklist
  aprovacao: AprovacaoItem | null;
  aprovacaoObs: string | null;
}

export interface Correcao {
  tarefa: Tarefa;
  origem: OrigemCorrecao;
  checklistId: string;
  titulo: string; // ex.: "Visita Técnica — Açougue"
  feitoPor: string; // quem fez o checklist
  feitoEm: string | null;
  itens: ItemCorrecao[];
}

export function origemDaTarefa(t: Pick<Tarefa, 'avaliacaoId' | 'visitaTecnicaId'>): { origem: OrigemCorrecao; checklistId: string } | null {
  if (t.visitaTecnicaId) return { origem: 'visita', checklistId: t.visitaTecnicaId };
  if (t.avaliacaoId) return { origem: 'avaliacao', checklistId: t.avaliacaoId };
  return null;
}

export async function carregarCorrecao(tarefa: Tarefa): Promise<Correcao> {
  const o = origemDaTarefa(tarefa);
  if (!o) throw new Error('Essa tarefa não veio de um checklist.');

  const tabelaResp = o.origem === 'visita' ? 'visita_tecnica_respostas' : 'avaliacao_respostas';
  const colChecklist = o.origem === 'visita' ? 'visita_id' : 'avaliacao_id';
  const tabelaCab = o.origem === 'visita' ? 'visitas_tecnicas' : 'avaliacoes_setor';

  const [{ data: cab, error: e1 }, { data: respostas, error: e2 }, { data: itens, error: e3 }] = await Promise.all([
    supabase.from(tabelaCab).select('*').eq('id', o.checklistId).maybeSingle(),
    supabase.from(tabelaResp).select('*').eq(colChecklist, o.checklistId).eq('resposta', 'nao'),
    supabase.from('correcao_itens').select('*').eq('tarefa_id', tarefa.id),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  const porResposta = new Map((itens ?? []).map((i: any) => [i.resposta_id, i]));
  const lista: ItemCorrecao[] = (respostas ?? [])
    .sort((a: any, b: any) => (a.respondida_em < b.respondida_em ? -1 : 1))
    .map((r: any) => {
      const i: any = porResposta.get(r.id);
      const fotosAntes: string[] =
        Array.isArray(r.fotos_urls) && r.fotos_urls.length ? r.fotos_urls : r.foto_url ? [r.foto_url] : [];
      return {
        respostaId: r.id,
        perguntaTexto: r.pergunta_texto,
        critico: !!r.critico,
        observacaoOriginal: r.justificativa ?? null,
        fotosAntes,
        status: (i?.status as StatusItemCorrecao) ?? 'pendente',
        comentario: i?.comentario ?? null,
        fotosDepois: i?.fotos_urls ?? [],
        respondidoPor: i?.respondido_por ?? null,
        respondidoEm: i?.respondido_em ?? null,
        aprovacao: i?.aprovacao ?? null,
        aprovacaoObs: i?.aprovacao_obs ?? null,
      };
    });
  // Críticos primeiro.
  lista.sort((a, b) => Number(b.critico) - Number(a.critico));

  return {
    tarefa,
    origem: o.origem,
    checklistId: o.checklistId,
    titulo: tarefa.titulo,
    feitoPor: o.origem === 'visita' ? cab?.veterinario_nome ?? tarefa.criadoPorNome : cab?.gerente_nome ?? tarefa.criadoPorNome,
    feitoEm: cab?.finalizada_em ?? null,
    itens: lista,
  };
}

// Grava o que o encarregado fez num item (upsert — pode mudar de ideia até
// enviar). Ao refazer um item devolvido, limpa a avaliação anterior.
export async function salvarItemCorrecao(
  c: Correcao,
  item: ItemCorrecao,
  dados: { status: StatusItemCorrecao; comentario: string | null; fotosDepois: string[]; por: string }
): Promise<void> {
  const { error } = await supabase.from('correcao_itens').upsert(
    {
      tarefa_id: c.tarefa.id,
      origem: c.origem,
      checklist_id: c.checklistId,
      resposta_id: item.respostaId,
      pergunta_texto: item.perguntaTexto,
      critico: item.critico,
      status: dados.status,
      comentario: dados.comentario,
      fotos_urls: dados.fotosDepois,
      respondido_por: dados.por,
      respondido_em: new Date().toISOString(),
      aprovacao: null,
      aprovacao_obs: item.aprovacao === 'devolvido' ? item.aprovacaoObs : null,
    },
    { onConflict: 'tarefa_id,resposta_id' }
  );
  if (error) throw error;
}

// O item está pronto pra ser enviado?
export function itemCompleto(i: Pick<ItemCorrecao, 'status' | 'comentario' | 'fotosDepois' | 'aprovacao'>): boolean {
  if (i.aprovacao === 'aprovado') return true;
  // Devolvido: precisa ser mexido de novo (salvar limpa a devolução).
  if (i.aprovacao === 'devolvido') return false;
  if (i.status === 'corrigido') return i.fotosDepois.length > 0;
  if (i.status === 'nao_possivel') return !!(i.comentario ?? '').trim();
  return false;
}

export async function enviarCorrecao(c: Correcao, por: string): Promise<void> {
  if (!c.itens.every(itemCompleto)) throw new Error('Ainda tem item sem tratar.');
  const { error } = await supabase
    .from('tarefas')
    .update({ correcao_status: 'enviada', correcao_enviada_por: por, correcao_enviada_em: new Date().toISOString() })
    .eq('id', c.tarefa.id);
  if (error) throw error;
}

// Correções esperando aprovação (de uma origem só).
export async function buscarCorrecoesParaAprovar(origem: OrigemCorrecao): Promise<Tarefa[]> {
  const { buscarTodasTarefas } = await import('./tarefasApi');
  const todas = await buscarTodasTarefas();
  return todas.filter(
    (t) =>
      !t.concluida &&
      t.correcaoStatus === 'enviada' &&
      (origem === 'visita' ? !!t.visitaTecnicaId : !!t.avaliacaoId && !t.visitaTecnicaId)
  );
}

// Decisão de quem fez o checklist. Item já aprovado numa rodada anterior
// continua aprovado. Algum devolvido → volta pro encarregado; tudo aprovado
// → tarefa concluída (no nome de quem fez a correção, com a 1ª foto do depois).
export async function avaliarCorrecao(
  c: Correcao,
  decisoes: Record<string, { aprovacao: AprovacaoItem; obs: string | null }>,
  por: string
): Promise<'aprovada' | 'devolvida'> {
  for (const item of c.itens) {
    const d = decisoes[item.respostaId];
    if (!d || item.aprovacao === 'aprovado') continue;
    const { error } = await supabase
      .from('correcao_itens')
      .update({ aprovacao: d.aprovacao, aprovacao_obs: d.obs })
      .eq('tarefa_id', c.tarefa.id)
      .eq('resposta_id', item.respostaId);
    if (error) throw error;
  }

  const algumDevolvido = c.itens.some((i) => i.aprovacao !== 'aprovado' && decisoes[i.respostaId]?.aprovacao === 'devolvido');
  const agora = new Date().toISOString();
  if (algumDevolvido) {
    const { error } = await supabase
      .from('tarefas')
      .update({
        correcao_status: 'devolvida',
        correcao_avaliada_por: por,
        correcao_avaliada_em: agora,
        correcao_rodada: (c.tarefa.correcaoRodada ?? 1) + 1,
      })
      .eq('id', c.tarefa.id);
    if (error) throw error;
    return 'devolvida';
  }

  const primeiraFoto = c.itens.flatMap((i) => i.fotosDepois)[0] ?? null;
  const { error } = await supabase
    .from('tarefas')
    .update({
      correcao_status: 'aprovada',
      correcao_avaliada_por: por,
      correcao_avaliada_em: agora,
      concluida: true,
      concluida_por_nome: c.tarefa.correcaoEnviadaPor ?? por,
      concluida_em: agora,
      foto_url: primeiraFoto,
    })
    .eq('id', c.tarefa.id);
  if (error) throw error;
  return 'aprovada';
}

export async function enviarFotoCorrecao(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('correcao-fotos').upload(nomeArquivo, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('correcao-fotos').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}
