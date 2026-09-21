import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';

// Checklist = rotina fixa por turno (abertura de loja, fechamento, limpeza,
// etc.). O administrador cadastra os itens uma vez (aba "Checklist" dentro
// de Ações rápidas); o colaborador marca cada item como feito ao longo do
// dia. A rotina "reseta" sozinha: cada dia novo simplesmente ainda não tem
// marcação nenhuma, então todo mundo volta a aparecer como pendente.

export interface ChecklistItem {
  id: string;
  titulo: string;
  setor: SetorKey | null; // null = aparece pra todos os setores
  ordem: number;
  ativo: boolean;
  criadoPorNome: string;
  criadoEm: string;
}

// Item já cruzado com a marcação de HOJE (se existir).
export interface ChecklistItemComStatus extends ChecklistItem {
  concluidoHoje: boolean;
  concluidoPorNome: string | null;
  concluidoEm: string | null;
}

function linhaParaItem(linha: any): ChecklistItem {
  return {
    id: linha.id,
    titulo: linha.titulo,
    setor: linha.setor,
    ordem: linha.ordem,
    ativo: linha.ativo,
    criadoPorNome: linha.criado_por_nome,
    criadoEm: linha.criado_em,
  };
}

function hojeISO(): string {
  // Data local (não UTC) no formato AAAA-MM-DD, pra bater com a coluna
  // "date" do banco e com o fuso horário real da loja.
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Busca os itens ativos de um setor (+ os gerais, setor null) já com o
// status de hoje, ordenados pela ordem definida pelo administrador.
export async function buscarChecklistDoSetor(setor: SetorKey): Promise<ChecklistItemComStatus[]> {
  const { data: itens, error: erroItens } = await supabase
    .from('checklist_itens')
    .select('*')
    .eq('ativo', true)
    .or(`setor.eq.${setor},setor.is.null`)
    .order('ordem', { ascending: true });
  if (erroItens) throw erroItens;

  const lista = (itens ?? []).map(linhaParaItem);
  if (lista.length === 0) return [];

  const { data: marcacoes, error: erroMarcacoes } = await supabase
    .from('checklist_marcacoes')
    .select('*')
    .eq('data', hojeISO())
    .in('item_id', lista.map((i) => i.id));
  if (erroMarcacoes) throw erroMarcacoes;

  const porItemId = new Map((marcacoes ?? []).map((m: any) => [m.item_id, m]));

  return lista.map((item) => {
    const marcacao = porItemId.get(item.id);
    return {
      ...item,
      concluidoHoje: !!marcacao,
      concluidoPorNome: marcacao?.concluido_por_nome ?? null,
      concluidoEm: marcacao?.concluido_em ?? null,
    };
  });
}

// Marca um item como feito hoje. Se duas pessoas do mesmo setor tocarem
// quase ao mesmo tempo, a constraint unique (item_id, data) evita duplicar
// — a segunda tentativa simplesmente falha e a tela recarrega o estado real.
export async function marcarItemFeito(itemId: string, concluidoPorNome: string): Promise<void> {
  const { error } = await supabase
    .from('checklist_marcacoes')
    .insert({ item_id: itemId, data: hojeISO(), concluido_por_nome: concluidoPorNome });
  if (error) throw error;
}

// Desmarca (apaga a marcação de hoje) — permite corrigir se alguém tocou
// sem querer.
export async function desmarcarItemFeito(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('checklist_marcacoes')
    .delete()
    .eq('item_id', itemId)
    .eq('data', hojeISO());
  if (error) throw error;
}

// --- Visão do Administrador -------------------------------------------------

export async function buscarTodosItensChecklist(): Promise<ChecklistItem[]> {
  const { data, error } = await supabase
    .from('checklist_itens')
    .select('*')
    .order('setor', { ascending: true, nullsFirst: true })
    .order('ordem', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(linhaParaItem);
}

export async function criarItemChecklist(dados: {
  titulo: string;
  setor: SetorKey | null;
  ordem: number;
  criadoPorNome: string;
}): Promise<ChecklistItem> {
  const { data, error } = await supabase
    .from('checklist_itens')
    .insert({
      titulo: dados.titulo,
      setor: dados.setor,
      ordem: dados.ordem,
      criado_por_nome: dados.criadoPorNome,
    })
    .select()
    .single();
  if (error) throw error;
  return linhaParaItem(data);
}

export async function alternarAtivoItemChecklist(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('checklist_itens').update({ ativo }).eq('id', id);
  if (error) throw error;
}

export async function removerItemChecklist(id: string): Promise<void> {
  const { error } = await supabase.from('checklist_itens').delete().eq('id', id);
  if (error) throw error;
}

// Resumo de hoje por item ativo: quantas marcações esse item já tem hoje
// (0 ou 1, já que é por item/dia — não por pessoa) — usado pelo admin pra
// ver de relance o que já foi feito na loja hoje, sem entrar setor por setor.
export async function buscarStatusHojeTodosItens(): Promise<Map<string, { concluidoPorNome: string; concluidoEm: string }>> {
  const { data, error } = await supabase.from('checklist_marcacoes').select('*').eq('data', hojeISO());
  if (error) throw error;
  const mapa = new Map<string, { concluidoPorNome: string; concluidoEm: string }>();
  (data ?? []).forEach((m: any) => {
    mapa.set(m.item_id, { concluidoPorNome: m.concluido_por_nome, concluidoEm: m.concluido_em });
  });
  return mapa;
}
