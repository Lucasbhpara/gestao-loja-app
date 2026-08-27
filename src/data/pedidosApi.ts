import { supabase } from '../lib/supabase';

export interface ProdutoPedido {
  id: string;
  setor: string;
  codigo: string;
  produto: string;
  embalagem: string | null;
  palete: number | null;
  estoqueCd: number | null;
  giroSemanal: number | null;
  qtdPendenteEntrega: number | null;
}

export interface Pedido {
  id: string;
  setor: string;
  encarregadoNome: string;
  criadoEm: string;
}

export interface ItemPedido {
  codigo: string;
  produto: string;
  quantidade: number;
}

function linhaParaProduto(l: any): ProdutoPedido {
  return {
    id: l.id,
    setor: l.setor,
    codigo: l.codigo,
    produto: l.produto,
    embalagem: l.embalagem,
    palete: l.palete === null ? null : Number(l.palete),
    estoqueCd: l.estoque_cd === null ? null : Number(l.estoque_cd),
    giroSemanal: l.giro_semanal === null ? null : Number(l.giro_semanal),
    qtdPendenteEntrega: l.qtd_pendente_entrega === null ? null : Number(l.qtd_pendente_entrega),
  };
}

function linhaParaPedido(l: any): Pedido {
  return { id: l.id, setor: l.setor, encarregadoNome: l.encarregado_nome, criadoEm: l.criado_em };
}

export async function buscarCatalogoPedidos(setor: string): Promise<ProdutoPedido[]> {
  const { data, error } = await supabase
    .from('pedidos_produtos')
    .select('*')
    .eq('setor', setor)
    .order('produto', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(linhaParaProduto);
}

// Cria o pedido e já grava todos os itens não-zero de uma vez (chamado só
// quando o encarregado aperta "Enviar pedido").
export async function enviarPedido(dados: {
  setor: string;
  encarregadoNome: string;
  itens: ItemPedido[];
}): Promise<Pedido> {
  const { data: pedido, error } = await supabase
    .from('pedidos')
    .insert({ setor: dados.setor, encarregado_nome: dados.encarregadoNome })
    .select()
    .single();
  if (error) throw error;

  const { error: erroItens } = await supabase.from('pedidos_itens').insert(
    dados.itens.map((i) => ({ pedido_id: pedido.id, codigo: i.codigo, produto: i.produto, quantidade: i.quantidade }))
  );
  if (erroItens) throw erroItens;

  return linhaParaPedido(pedido);
}

// Administrador (Portal Admin) acompanha o histórico de pedidos enviados.
export async function buscarPedidosEnviados(setor?: string): Promise<Pedido[]> {
  let query = supabase.from('pedidos').select('*').order('criado_em', { ascending: false });
  if (setor) query = query.eq('setor', setor);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(linhaParaPedido);
}

export async function buscarItensDoPedido(pedidoId: string): Promise<ItemPedido[]> {
  const { data, error } = await supabase.from('pedidos_itens').select('codigo, produto, quantidade').eq('pedido_id', pedidoId);
  if (error) throw error;
  return (data ?? []).map((l: any) => ({ codigo: l.codigo, produto: l.produto, quantidade: Number(l.quantidade) }));
}
