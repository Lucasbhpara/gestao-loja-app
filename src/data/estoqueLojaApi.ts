import { supabase } from '../lib/supabase';

export interface ItemEstoqueLoja {
  id: string;
  codigoInterno: string;
  produto: string;
  codigoBarras: string | null;
  quantidade: number;
  dataPlanilha: string;
}

function linhaParaItem(l: any): ItemEstoqueLoja {
  return {
    id: l.id,
    codigoInterno: l.codigo_interno,
    produto: l.produto,
    codigoBarras: l.codigo_barras,
    quantidade: Number(l.quantidade),
    dataPlanilha: l.data_planilha,
  };
}

// Busca por código interno, código de barras ou nome do produto. Sem termo,
// não busca nada — a tela mostra "digite pra buscar" (a tabela tem ~9 mil
// itens, listar tudo de cara não ajuda em nada).
export async function buscarEstoqueLoja(termo: string): Promise<ItemEstoqueLoja[]> {
  const termoLimpo = termo.trim();
  if (!termoLimpo) return [];
  const padrao = `%${termoLimpo}%`;
  const { data, error } = await supabase
    .from('estoque_loja_itens')
    .select('*')
    .or(`codigo_interno.ilike.${padrao},codigo_barras.ilike.${padrao},produto.ilike.${padrao}`)
    .order('produto')
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(linhaParaItem);
}

// Data da planilha mais recente importada, pra mostrar "estoque de dd/mm"
// no topo da tela. Todas as linhas têm a mesma data (é sempre uma
// substituição total da tabela), então basta pegar de qualquer uma.
export async function buscarDataEstoqueLoja(): Promise<string | null> {
  const { data, error } = await supabase
    .from('estoque_loja_itens')
    .select('data_planilha')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.data_planilha ?? null;
}
