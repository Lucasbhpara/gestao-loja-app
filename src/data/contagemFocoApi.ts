import { supabase } from '../lib/supabase';

// =============================================================================
// Contagem de itens foco nas lojas — o supervisor escolhe a lista (modelo),
// as lojas, manda o link e acompanha em tempo real.
// Tabelas: contagem_campanhas, contagem_respostas, contagem_modelos.
// RPCs: contagem_criar, contagem_resumo, contagem_listar, contagem_modelos_lista.
// Página das lojas / painel web: https://ulva.com.br/contagem/
// Também disponível no Robô Ulva (opção 8 do menu).
// =============================================================================

export const CONTAGEM_URL = 'https://ulva.com.br/contagem/';
export const linkLoja = (id: string) => `${CONTAGEM_URL}?c=${id}`;
export const linkPainel = (id: string) => `${CONTAGEM_URL}?c=${id}&p=1`;

export type ModeloContagem = { nome: string; qtd: number };
export type ContagemAberta = {
  id: string; titulo: string; criado_em: string; criado_por: string | null;
  total: number; marcados: number; lojas_iniciadas: number; total_lojas: number;
};
export type LojaResumo = { loja: string; feitos: number; rupturas: number; quem: string | null; ultima: string | null };
export type ResumoContagem = {
  id: string; titulo: string; criado_em: string; criado_por: string | null;
  total_itens: number; total_lojas: number; marcados: number; rupturas: number;
  lojas: LojaResumo[]; itens_ruptura: { cod: string; nome: string | null; lojas: number }[];
};

export async function listarModelos(): Promise<ModeloContagem[]> {
  const { data, error } = await supabase.rpc('contagem_modelos_lista');
  if (error) throw new Error(error.message);
  return (data as ModeloContagem[]) ?? [];
}

export async function listarLojas(): Promise<string[]> {
  const { data, error } = await supabase.from('system_config').select('value').eq('key', 'contagem_lojas').maybeSingle();
  if (error) throw new Error(error.message);
  const v = (data as any)?.value;
  try { return Array.isArray(v) ? v : JSON.parse(v ?? '[]'); } catch { return []; }
}

export async function listarAbertas(limite = 10): Promise<ContagemAberta[]> {
  const { data, error } = await supabase.rpc('contagem_listar', { p_limite: limite });
  if (error) throw new Error(error.message);
  return (data as ContagemAberta[]) ?? [];
}

export async function criarContagem(titulo: string, modelos: string[], lojas: string[] | null, por: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('contagem_criar', { p_titulo: titulo, p_modelos: modelos, p_lojas: lojas, p_por: por });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function resumoContagem(id: string): Promise<ResumoContagem | null> {
  const { data, error } = await supabase.rpc('contagem_resumo', { p_id: id });
  if (error) throw new Error(error.message);
  return (data as ResumoContagem) ?? null;
}

export async function encerrarContagem(id: string): Promise<void> {
  const { error } = await supabase.from('contagem_campanhas').update({ ativa: false }).eq('id', id);
  if (error) throw new Error(error.message);
}
