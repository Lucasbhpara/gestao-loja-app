import { supabase } from '../lib/supabase';

export type Sortimento = 'flv' | 'acougue' | 'padaria' | 'uso_consumo' | 'bebidas';

export const SORTIMENTOS_INVENTARIO: { key: Sortimento; nome: string; descricao: string }[] = [
  { key: 'flv', nome: 'FLV', descricao: 'Frutas, legumes e verduras' },
  { key: 'acougue', nome: 'Açougue', descricao: 'Bovinos, suínos e aves' },
  { key: 'padaria', nome: 'Padaria', descricao: 'Pães industrializados' },
  { key: 'uso_consumo', nome: 'Uso e Consumo', descricao: 'Sacolas, bobinas plásticas e filme PVC' },
  { key: 'bebidas', nome: 'Bebidas', descricao: 'Bebidas destiladas' },
];

export interface ItemCatalogoInventario {
  id: string;
  sortimento: Sortimento;
  codigoInterno: string | null;
  codigoBarras: string | null;
  produto: string;
  unidade: string;
}

export interface ContagemInventario {
  id: string;
  itemId: string;
  sortimento: Sortimento;
  pessoaNome: string;
  area: 'venda' | 'deposito';
  codigoInterno: string | null;
  codigoBarras: string | null;
  produto: string;
  unidade: string;
  quantidade: number;
  atualizadoEm: string;
}

function linhaParaItem(l: any): ItemCatalogoInventario {
  return {
    id: l.id,
    sortimento: l.sortimento,
    codigoInterno: l.codigo_interno,
    codigoBarras: l.codigo_barras,
    produto: l.produto,
    unidade: l.unidade,
  };
}

function linhaParaContagem(l: any): ContagemInventario {
  return {
    id: l.id,
    itemId: l.item_id,
    sortimento: l.sortimento,
    pessoaNome: l.pessoa_nome,
    area: l.area,
    codigoInterno: l.codigo_interno,
    codigoBarras: l.codigo_barras,
    produto: l.produto,
    unidade: l.unidade,
    quantidade: Number(l.quantidade),
    atualizadoEm: l.atualizado_em,
  };
}

// Busca por código interno, código de barras ou nome (o que bater primeiro).
export async function buscarItensCatalogo(sortimento: Sortimento, termo: string): Promise<ItemCatalogoInventario[]> {
  const termoLimpo = termo.trim();
  if (!termoLimpo) return [];
  const padrao = `%${termoLimpo}%`;
  const { data, error } = await supabase
    .from('inventario_itens')
    .select('*')
    .eq('sortimento', sortimento)
    .or(`codigo_interno.ilike.${padrao},codigo_barras.ilike.${padrao},produto.ilike.${padrao}`)
    .order('produto')
    .limit(25);
  if (error) throw error;
  return (data ?? []).map(linhaParaItem);
}

export async function buscarItemPorCodigoBarras(
  sortimento: Sortimento,
  codigoBarras: string
): Promise<ItemCatalogoInventario | null> {
  const { data, error } = await supabase
    .from('inventario_itens')
    .select('*')
    .eq('sortimento', sortimento)
    .eq('codigo_barras', codigoBarras.trim())
    .maybeSingle();
  if (error) throw error;
  return data ? linhaParaItem(data) : null;
}

export async function cadastrarItemCatalogo(dados: {
  sortimento: Sortimento;
  codigoInterno: string | null;
  codigoBarras: string | null;
  produto: string;
  unidade: string;
}): Promise<ItemCatalogoInventario> {
  const { data, error } = await supabase
    .from('inventario_itens')
    .insert({
      sortimento: dados.sortimento,
      codigo_interno: dados.codigoInterno,
      codigo_barras: dados.codigoBarras,
      produto: dados.produto,
      unidade: dados.unidade,
    })
    .select()
    .single();
  if (error) throw error;
  return linhaParaItem(data);
}

export async function buscarContagemDaPessoa(
  sortimento: Sortimento,
  pessoaNome: string
): Promise<{ venda: ContagemInventario[]; deposito: ContagemInventario[] }> {
  const { data, error } = await supabase
    .from('inventario_contagens')
    .select('*')
    .eq('sortimento', sortimento)
    .eq('pessoa_nome', pessoaNome)
    .order('produto');
  if (error) throw error;
  const todos = (data ?? []).map(linhaParaContagem);
  return {
    venda: todos.filter((c) => c.area === 'venda'),
    deposito: todos.filter((c) => c.area === 'deposito'),
  };
}

// Lança (ou soma, se o item já tinha contagem nessa área) uma quantidade.
export async function lancarContagem(dados: {
  sortimento: Sortimento;
  pessoaNome: string;
  area: 'venda' | 'deposito';
  item: ItemCatalogoInventario;
  quantidadeAtual: number;
  quantidadeSomar: number;
}): Promise<ContagemInventario> {
  const { data, error } = await supabase
    .from('inventario_contagens')
    .upsert(
      {
        sortimento: dados.sortimento,
        pessoa_nome: dados.pessoaNome,
        area: dados.area,
        item_id: dados.item.id,
        codigo_interno: dados.item.codigoInterno,
        codigo_barras: dados.item.codigoBarras,
        produto: dados.item.produto,
        unidade: dados.item.unidade,
        quantidade: dados.quantidadeAtual + dados.quantidadeSomar,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'sortimento,pessoa_nome,area,item_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return linhaParaContagem(data);
}

export async function buscarPessoasQueContaram(sortimento: Sortimento): Promise<string[]> {
  const { data, error } = await supabase.from('inventario_contagens').select('pessoa_nome').eq('sortimento', sortimento);
  if (error) throw error;
  const nomes = new Set((data ?? []).map((l: any) => l.pessoa_nome as string));
  return Array.from(nomes).sort();
}

// Nomes usados recentemente, em qualquer sortimento — pra sugerir na tela
// inicial sem precisar digitar de novo.
export async function buscarPessoasRecentes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('inventario_contagens')
    .select('pessoa_nome, atualizado_em')
    .order('atualizado_em', { ascending: false })
    .limit(100);
  if (error) throw error;
  const vistos = new Set<string>();
  const nomes: string[] = [];
  for (const l of data ?? []) {
    if (!vistos.has(l.pessoa_nome)) {
      vistos.add(l.pessoa_nome);
      nomes.push(l.pessoa_nome);
    }
    if (nomes.length >= 8) break;
  }
  return nomes;
}

export async function buscarComparacao(sortimento: Sortimento): Promise<{
  pessoas: string[];
  itens: { item: ItemCatalogoInventario; totaisPorPessoa: Record<string, number> }[];
}> {
  const { data, error } = await supabase.from('inventario_contagens').select('*').eq('sortimento', sortimento);
  if (error) throw error;
  const linhas = (data ?? []).map(linhaParaContagem);
  const pessoas = Array.from(new Set(linhas.map((l) => l.pessoaNome))).sort();

  const porItem = new Map<string, { item: ItemCatalogoInventario; totaisPorPessoa: Record<string, number> }>();
  for (const linha of linhas) {
    if (!porItem.has(linha.itemId)) {
      porItem.set(linha.itemId, {
        item: {
          id: linha.itemId,
          sortimento: linha.sortimento,
          codigoInterno: linha.codigoInterno,
          codigoBarras: linha.codigoBarras,
          produto: linha.produto,
          unidade: linha.unidade,
        },
        totaisPorPessoa: {},
      });
    }
    const entrada = porItem.get(linha.itemId)!;
    entrada.totaisPorPessoa[linha.pessoaNome] = (entrada.totaisPorPessoa[linha.pessoaNome] ?? 0) + linha.quantidade;
  }

  const itens = Array.from(porItem.values()).sort((a, b) => a.item.produto.localeCompare(b.item.produto));
  return { pessoas, itens };
}
