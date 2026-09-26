import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';

export type PrioridadeTarefa = 'normal' | 'alta';

export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  setor: SetorKey | null; // null = tarefa pra todos os setores
  criadoPorNome: string;
  prazo: string | null; // formato 'AAAA-MM-DD'
  concluida: boolean;
  concluidaPorNome: string | null;
  concluidaEm: string | null;
  fotoUrl: string | null;
  prioridade: PrioridadeTarefa;
  avaliacaoId: string | null;
  criadoEm: string;
}

function linhaParaTarefa(linha: any): Tarefa {
  return {
    id: linha.id,
    titulo: linha.titulo,
    descricao: linha.descricao,
    setor: linha.setor,
    criadoPorNome: linha.criado_por_nome,
    prazo: linha.prazo,
    concluida: linha.concluida,
    concluidaPorNome: linha.concluida_por_nome,
    concluidaEm: linha.concluida_em,
    fotoUrl: linha.foto_url,
    prioridade: linha.prioridade ?? 'normal',
    avaliacaoId: linha.avaliacao_id,
    criadoEm: linha.criado_em,
  };
}

// Busca todas as tarefas (visão do Administrador).
export async function buscarTodasTarefas(): Promise<Tarefa[]> {
  const { data, error } = await supabase.from('tarefas').select('*').order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaTarefa);
}

// Busca as tarefas relevantes pra um setor específico: as dele + as gerais
// (setor null), só as ainda não concluídas, mais recentes primeiro.
export async function buscarTarefasDoSetor(setor: SetorKey): Promise<Tarefa[]> {
  const { data, error } = await supabase
    .from('tarefas')
    .select('*')
    .eq('concluida', false)
    .or(`setor.eq.${setor},setor.is.null`)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaTarefa);
}

export async function criarTarefa(dados: {
  titulo: string;
  descricao: string;
  setor: SetorKey | null;
  prazo: string | null;
  criadoPorNome: string;
  prioridade?: PrioridadeTarefa;
}): Promise<Tarefa> {
  const { data, error } = await supabase
    .from('tarefas')
    .insert({
      titulo: dados.titulo,
      descricao: dados.descricao || null,
      setor: dados.setor,
      prazo: dados.prazo,
      criado_por_nome: dados.criadoPorNome,
      prioridade: dados.prioridade ?? 'normal',
    })
    .select()
    .single();
  if (error) throw error;
  return linhaParaTarefa(data);
}

// A partir de agora, toda tarefa (independente de ter vindo do Checklist de
// Setor ou de ter sido criada manualmente) só pode ser concluída com uma foto
// anexada — por isso fotoUrl é obrigatório aqui, não mais opcional.
export async function concluirTarefa(id: string, concluidaPorNome: string, fotoUrl: string): Promise<void> {
  if (!fotoUrl) throw new Error('É obrigatório enviar uma foto para concluir a tarefa.');
  const { error } = await supabase
    .from('tarefas')
    .update({
      concluida: true,
      concluida_por_nome: concluidaPorNome,
      concluida_em: new Date().toISOString(),
      foto_url: fotoUrl,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function removerTarefa(id: string): Promise<void> {
  const { error } = await supabase.from('tarefas').delete().eq('id', id);
  if (error) throw error;
}

// Mesmo padrão de upload usado nas demais fotos do app — bucket próprio pra
// fotos de conclusão de tarefa.
export async function enviarFotoTarefa(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('tarefas-fotos').upload(nomeArquivo, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('tarefas-fotos').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}
