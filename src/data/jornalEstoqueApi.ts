import { supabase } from '../lib/supabase';

// =============================================================================
// Estoque do Jornal (supabase/schema_jornal_estoque.sql). O jornal é importado
// no Portal (Ofertas → Estoque do Jornal), que liga cada item a todos os
// produtos do estoque. Aqui no app: ver a situação, confirmar sugestões,
// tirar ou adicionar produtos e definir o alerta mínimo.
// =============================================================================

export type SituacaoJornal = 'zerado' | 'vai_faltar' | 'baixo' | 'sem_produto' | 'ok';

export interface CampanhaJornal {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
}

export interface ItemJornal {
  id: string;
  campanhaId: string;
  ordem: number;
  descricao: string;
  preco: number | null;
  estoqueMinimo: number | null;
  produtos: number;
  produtosZerados: number;
  estoque: number;
  sugestoes: number;
  vendaDiaUn: number | null;
  diasRestantes: number;
  diasCobertura: number | null;
  necessarioAteFim: number | null;
  situacao: SituacaoJornal;
  vendasAte: string | null;
}

export interface ProdutoLigado {
  id: string;
  itemId: string;
  codigo: string | null;
  produto: string;
  origem: 'auto' | 'manual' | 'sugestao';
  estoque: number | null;
}

const num = (v: any): number | null => (v == null ? null : Number(v));

export async function listarCampanhas(): Promise<CampanhaJornal[]> {
  const { data, error } = await supabase.from('jornal_campanhas').select('id, titulo, inicio, fim').order('inicio', { ascending: false }).limit(20);
  if (error) throw error;
  return data ?? [];
}

export function campanhaAtual(lista: CampanhaJornal[]): CampanhaJornal | null {
  const d = new Date();
  const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return lista.find((c) => c.inicio <= hoje && c.fim >= hoje) ?? lista[0] ?? null;
}

export async function listarItens(campanhaId: string): Promise<ItemJornal[]> {
  const { data, error } = await supabase.from('jornal_itens_status').select('*').eq('campanha_id', campanhaId).order('ordem');
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id,
    campanhaId: l.campanha_id,
    ordem: l.ordem,
    descricao: l.descricao,
    preco: num(l.preco),
    estoqueMinimo: num(l.estoque_minimo),
    produtos: Number(l.produtos ?? 0),
    produtosZerados: Number(l.produtos_zerados ?? 0),
    estoque: Number(l.estoque ?? 0),
    sugestoes: Number(l.sugestoes ?? 0),
    vendaDiaUn: num(l.venda_dia_un),
    diasRestantes: Number(l.dias_restantes ?? 0),
    diasCobertura: num(l.dias_cobertura),
    necessarioAteFim: num(l.necessario_ate_fim),
    situacao: l.situacao,
    vendasAte: l.vendas_ate ?? null,
  }));
}

export async function produtosDoItem(itemId: string): Promise<ProdutoLigado[]> {
  const { data, error } = await supabase.from('jornal_item_produtos').select('*').eq('item_id', itemId).order('produto');
  if (error) throw error;
  const links = data ?? [];
  const codigos = links.map((l: any) => l.codigo).filter(Boolean);
  const semCodigo = links.filter((l: any) => !l.codigo).map((l: any) => l.produto);
  const estoque: Record<string, number> = {};
  if (codigos.length) {
    const { data: es } = await supabase.from('estoque_loja_itens').select('codigo_interno, quantidade').in('codigo_interno', codigos);
    (es ?? []).forEach((e: any) => {
      if (!(e.codigo_interno in estoque)) estoque[e.codigo_interno] = Number(e.quantidade);
    });
  }
  if (semCodigo.length) {
    const { data: es } = await supabase.from('estoque_loja_itens').select('produto, quantidade').in('produto', semCodigo);
    (es ?? []).forEach((e: any) => (estoque['nome:' + e.produto] = Number(e.quantidade)));
  }
  return links.map((l: any) => ({
    id: l.id,
    itemId: l.item_id,
    codigo: l.codigo ?? null,
    produto: l.produto,
    origem: l.origem,
    estoque: estoque[l.codigo ?? 'nome:' + l.produto] ?? null,
  }));
}

export async function confirmarProduto(id: string, por: string): Promise<void> {
  const { error } = await supabase.from('jornal_item_produtos').update({ origem: 'manual', criado_por: por }).eq('id', id);
  if (error) throw error;
}

export async function removerProduto(id: string): Promise<void> {
  const { error } = await supabase.from('jornal_item_produtos').delete().eq('id', id);
  if (error) throw error;
}

export async function ligarProduto(itemId: string, p: { codigo: string | null; produto: string }, por: string): Promise<void> {
  const { error } = await supabase
    .from('jornal_item_produtos')
    .upsert({ item_id: itemId, codigo: p.codigo, produto: p.produto, origem: 'manual', criado_por: por }, { onConflict: 'item_id,produto' });
  if (error) throw error;
}

export async function salvarMinimo(itemId: string, minimo: number | null): Promise<void> {
  const { error } = await supabase.from('jornal_itens').update({ estoque_minimo: minimo }).eq('id', itemId);
  if (error) throw error;
}

export async function buscarNoEstoque(termo: string): Promise<{ codigo: string | null; produto: string; quantidade: number }[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const p = `%${t}%`;
  const { data, error } = await supabase
    .from('estoque_loja_itens')
    .select('codigo_interno, produto, quantidade')
    .or(`codigo_interno.ilike.${p},codigo_barras.ilike.${p},produto.ilike.${p}`)
    .order('produto')
    .limit(25);
  if (error) throw error;
  return (data ?? []).map((l: any) => ({ codigo: l.codigo_interno ?? null, produto: l.produto, quantidade: Number(l.quantidade ?? 0) }));
}

export const ehAlerta = (i: ItemJornal) => i.situacao === 'zerado' || i.situacao === 'vai_faltar' || i.situacao === 'baixo';
export const qtdBr = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
