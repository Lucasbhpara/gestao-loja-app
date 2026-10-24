import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';

// Visita Supervisor — quando o supervisor vem à loja, ele (ou a gerência)
// registra o que ele orientou mudar, por setor (gaveta): descrição + até 2
// fotos. Cada item pode virar tarefa para o encarregado do setor; a tarefa
// leva as fotos (tarefas.fotos_referencia) e o vínculo com a visita
// (tarefas.visita_supervisor_id). Ver supabase/visita_supervisor.sql.

export type SetorVisitaSup = 'deposito' | 'mercearia' | 'frente-caixa' | 'acougue' | 'frios' | 'padaria' | 'area_externa';

export const SETORES_VISITA_SUP: { key: SetorVisitaSup; nome: string; icone: string }[] = [
  { key: 'deposito', nome: 'Depósito', icone: 'archive' },
  { key: 'mercearia', nome: 'Mercearia', icone: 'shopping-cart' },
  { key: 'frente-caixa', nome: 'Frente de Caixa', icone: 'credit-card' },
  { key: 'acougue', nome: 'Açougue', icone: 'scissors' },
  { key: 'frios', nome: 'Frios', icone: 'thermometer' },
  { key: 'padaria', nome: 'Padaria', icone: 'coffee' },
  { key: 'area_externa', nome: 'Área Externa', icone: 'sun' },
];
export const nomeSetorSup = (k: string) => SETORES_VISITA_SUP.find((s) => s.key === k)?.nome ?? k;

// Quem é "Supervisor": colaborador (não administrador) cuja função contém
// "supervisor" (sem acento, sem diferenciar maiúscula) — cadastrado pela
// aba Equipe do Portal, como os outros.
export function ehSupervisor(funcao: string | null | undefined): boolean {
  if (!funcao) return false;
  return funcao
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .includes('supervisor');
}

export interface VisitaSupervisor {
  id: string;
  supervisorNome: string;
  registradaPorNome: string;
  registradaPorMatricula: string | null;
  status: 'em_andamento' | 'finalizada';
  observacoes: string | null;
  iniciadaEm: string;
  finalizadaEm: string | null;
}

export interface ItemVisitaSup {
  id: string;
  visitaId: string;
  setor: SetorVisitaSup;
  descricao: string;
  fotos: string[];
  virarTarefa: boolean;
  prioridade: 'normal' | 'alta';
  prazo: string | null;
  tarefaId: string | null;
  criadoPorNome: string | null;
  criadoEm: string;
}

const visitaDoBanco = (l: any): VisitaSupervisor => ({
  id: l.id,
  supervisorNome: l.supervisor_nome,
  registradaPorNome: l.registrada_por_nome,
  registradaPorMatricula: l.registrada_por_matricula,
  status: l.status,
  observacoes: l.observacoes,
  iniciadaEm: l.iniciada_em,
  finalizadaEm: l.finalizada_em,
});
const itemDoBanco = (l: any): ItemVisitaSup => ({
  id: l.id,
  visitaId: l.visita_id,
  setor: l.setor,
  descricao: l.descricao,
  fotos: l.fotos ?? [],
  virarTarefa: !!l.virar_tarefa,
  prioridade: l.prioridade ?? 'normal',
  prazo: l.prazo,
  tarefaId: l.tarefa_id,
  criadoPorNome: l.criado_por_nome,
  criadoEm: l.criado_em,
});

export async function listarVisitasSup(limite = 40): Promise<VisitaSupervisor[]> {
  const { data, error } = await supabase.from('visitas_supervisor').select('*').order('iniciada_em', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []).map(visitaDoBanco);
}

export async function buscarVisitaSup(id: string): Promise<VisitaSupervisor | null> {
  const { data, error } = await supabase.from('visitas_supervisor').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? visitaDoBanco(data) : null;
}

export async function iniciarVisitaSup(d: { supervisorNome: string; registradaPorNome: string; registradaPorMatricula: string | null }): Promise<VisitaSupervisor> {
  const { data, error } = await supabase
    .from('visitas_supervisor')
    .insert({ supervisor_nome: d.supervisorNome.trim(), registrada_por_nome: d.registradaPorNome, registrada_por_matricula: d.registradaPorMatricula })
    .select()
    .single();
  if (error) throw error;
  return visitaDoBanco(data);
}

export async function finalizarVisitaSup(id: string, observacoes: string): Promise<void> {
  const { error } = await supabase
    .from('visitas_supervisor')
    .update({ status: 'finalizada', finalizada_em: new Date().toISOString(), observacoes: observacoes.trim() || null })
    .eq('id', id);
  if (error) throw error;
}

export async function reabrirVisitaSup(id: string): Promise<void> {
  const { error } = await supabase.from('visitas_supervisor').update({ status: 'em_andamento', finalizada_em: null }).eq('id', id);
  if (error) throw error;
}

export async function excluirVisitaSup(id: string): Promise<void> {
  // Tarefas ainda abertas que vieram dessa visita saem junto; as concluídas ficam no histórico.
  await supabase.from('tarefas').delete().eq('visita_supervisor_id', id).eq('concluida', false);
  const { error } = await supabase.from('visitas_supervisor').delete().eq('id', id);
  if (error) throw error;
}

export async function listarItensSup(visitaId: string): Promise<ItemVisitaSup[]> {
  const { data, error } = await supabase.from('visita_supervisor_itens').select('*').eq('visita_id', visitaId).order('criado_em');
  if (error) throw error;
  return (data ?? []).map(itemDoBanco);
}

// Quantos itens cada visita tem (para a lista)
export async function contarItensSup(ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const { data } = await supabase.from('visita_supervisor_itens').select('visita_id').in('visita_id', ids);
  const r: Record<string, number> = {};
  (data ?? []).forEach((l: any) => (r[l.visita_id] = (r[l.visita_id] ?? 0) + 1));
  return r;
}

// Setor da tarefa: Área Externa não tem encarregado (fica com a gerência/admin, igual ao Checklist).
const setorDaTarefa = (s: SetorVisitaSup): SetorKey => s as SetorKey;

// Cria/atualiza/remove a tarefa do item conforme "virar tarefa".
async function sincronizarTarefa(item: ItemVisitaSup, visita: VisitaSupervisor, autor: string): Promise<string | null> {
  const titulo = `Visita do supervisor · ${nomeSetorSup(item.setor)}`;
  const descricao = `${item.descricao}\n\nOrientação de ${visita.supervisorNome} na visita de ${new Date(visita.iniciadaEm).toLocaleDateString('pt-BR')}.`;
  if (!item.virarTarefa) {
    if (item.tarefaId) await supabase.from('tarefas').delete().eq('id', item.tarefaId).eq('concluida', false);
    return null;
  }
  const linha = {
    titulo,
    descricao,
    setor: setorDaTarefa(item.setor),
    prazo: item.prazo,
    prioridade: item.prioridade,
    fotos_referencia: item.fotos,
    visita_supervisor_id: visita.id,
  };
  if (item.tarefaId) {
    const { data } = await supabase.from('tarefas').update(linha).eq('id', item.tarefaId).eq('concluida', false).select('id');
    if (data && data.length) return item.tarefaId;
    const { data: ja } = await supabase.from('tarefas').select('id').eq('id', item.tarefaId).limit(1);
    if (ja && ja.length) return item.tarefaId; // já concluída: não mexe
  }
  const { data, error } = await supabase
    .from('tarefas')
    .insert({ ...linha, criado_por_nome: autor })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function salvarItemSup(
  visita: VisitaSupervisor,
  item: Omit<ItemVisitaSup, 'id' | 'criadoEm' | 'tarefaId' | 'visitaId'> & { id?: string; tarefaId?: string | null },
  autor: string,
): Promise<ItemVisitaSup> {
  const linha = {
    visita_id: visita.id,
    setor: item.setor,
    descricao: item.descricao.trim(),
    fotos: item.fotos.slice(0, 2),
    virar_tarefa: item.virarTarefa,
    prioridade: item.prioridade,
    prazo: item.prazo,
  };
  let salvo: ItemVisitaSup;
  if (item.id) {
    const { data, error } = await supabase.from('visita_supervisor_itens').update(linha).eq('id', item.id).select().single();
    if (error) throw error;
    salvo = itemDoBanco(data);
  } else {
    const { data, error } = await supabase
      .from('visita_supervisor_itens')
      .insert({ ...linha, criado_por_nome: autor })
      .select()
      .single();
    if (error) throw error;
    salvo = itemDoBanco(data);
  }
  const tarefaId = await sincronizarTarefa(salvo, visita, autor);
  if (tarefaId !== salvo.tarefaId) {
    await supabase.from('visita_supervisor_itens').update({ tarefa_id: tarefaId }).eq('id', salvo.id);
    salvo = { ...salvo, tarefaId };
  }
  return salvo;
}

export async function excluirItemSup(item: ItemVisitaSup): Promise<void> {
  if (item.tarefaId) await supabase.from('tarefas').delete().eq('id', item.tarefaId).eq('concluida', false);
  const { error } = await supabase.from('visita_supervisor_itens').delete().eq('id', item.id);
  if (error) throw error;
}

export async function enviarFotoSup(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nome = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('visita-supervisor-fotos').upload(nome, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return supabase.storage.from('visita-supervisor-fotos').getPublicUrl(nome).data.publicUrl;
}
