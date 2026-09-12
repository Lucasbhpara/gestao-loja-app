import { supabase } from '../lib/supabase';

// Pontas e Pontos Extras — o que está montado em cada ponta de gôndola da
// loja agora (produtos com foto e/ou nome, até 4 por ponta). Diferente do
// Mapa da Loja (que mostra ONDE cada ponta fica), aqui é só O QUE tem nela.
// Só administradores criam/editam — pelo portal ou direto no app tirando
// foto na loja. Os demais colaboradores só consultam.

export const MAX_PRODUTOS_POR_PONTA = 4;

export interface PontaExtra {
  id: string;
  nome: string;
  local: string | null;
  ordem: number;
}

export interface ProdutoPonta {
  id: string;
  pontaId: string;
  nome: string | null;
  fotoUrl: string | null;
  ordem: number;
}

function linhaParaPonta(l: any): PontaExtra {
  return { id: l.id, nome: l.nome, local: l.local, ordem: l.ordem };
}

function linhaParaProduto(l: any): ProdutoPonta {
  return { id: l.id, pontaId: l.ponta_id, nome: l.nome, fotoUrl: l.foto_url, ordem: l.ordem };
}

export async function buscarPontas(): Promise<PontaExtra[]> {
  const { data, error } = await supabase.from('pontas_extras').select('*').order('ordem');
  if (error) throw error;
  return (data ?? []).map(linhaParaPonta);
}

export async function buscarProdutosDaPonta(pontaId: string): Promise<ProdutoPonta[]> {
  const { data, error } = await supabase
    .from('pontas_produtos')
    .select('*')
    .eq('ponta_id', pontaId)
    .order('ordem');
  if (error) throw error;
  return (data ?? []).map(linhaParaProduto);
}

// Busca todos os produtos de todas as pontas de uma vez (usado pra montar a
// lista inteira sem precisar de uma consulta por ponta).
export async function buscarTodosProdutos(): Promise<ProdutoPonta[]> {
  const { data, error } = await supabase.from('pontas_produtos').select('*').order('ordem');
  if (error) throw error;
  return (data ?? []).map(linhaParaProduto);
}

export async function criarPonta(dados: { nome: string; local: string | null; ordem: number }): Promise<PontaExtra> {
  const { data, error } = await supabase
    .from('pontas_extras')
    .insert({ nome: dados.nome, local: dados.local, ordem: dados.ordem })
    .select()
    .single();
  if (error) throw error;
  return linhaParaPonta(data);
}

export async function editarPonta(id: string, dados: { nome: string; local: string | null }): Promise<void> {
  const { error } = await supabase
    .from('pontas_extras')
    .update({ nome: dados.nome, local: dados.local })
    .eq('id', id);
  if (error) throw error;
}

export async function removerPonta(id: string): Promise<void> {
  const { error } = await supabase.from('pontas_extras').delete().eq('id', id);
  if (error) throw error;
}

export async function criarProduto(pontaId: string, ordem: number): Promise<ProdutoPonta> {
  const { data, error } = await supabase
    .from('pontas_produtos')
    .insert({ ponta_id: pontaId, nome: null, foto_url: null, ordem })
    .select()
    .single();
  if (error) throw error;
  return linhaParaProduto(data);
}

export async function editarProduto(id: string, dados: { nome: string | null; fotoUrl?: string | null }): Promise<void> {
  const payload: Record<string, any> = { nome: dados.nome };
  if (dados.fotoUrl !== undefined) payload.foto_url = dados.fotoUrl;
  const { error } = await supabase.from('pontas_produtos').update(payload).eq('id', id);
  if (error) throw error;
}

export async function removerProduto(id: string): Promise<void> {
  const { error } = await supabase.from('pontas_produtos').delete().eq('id', id);
  if (error) throw error;
}

// Envia a foto pro Storage do Supabase (bucket "pontas-fotos") e devolve o
// link público, pronto pra salvar no produto. Usado pelo app (foto tirada
// na loja com a câmera do celular).
export async function enviarFotoProdutoPonta(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('pontas-fotos').upload(nomeArquivo, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('pontas-fotos').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}
