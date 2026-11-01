import { supabase } from '../lib/supabase';
import { buscarAreasProdutos } from './rupturaMapaApi';

// Busca produto: acha pelo nome, código interno ou código de barras e abre a
// ficha (estoque, preço, dias de estoque, dias sem venda e onde fica no mapa).
// Funções no banco: supabase/busca_produto.sql (produto_buscar, produto_info).

export interface ProdutoLista {
  codigoInterno: string | null;
  codigoBarras: string | null;
  produto: string;
  quantidade: number | null;
  precoVenda: number | null;
}

export interface FichaProduto {
  codigoInterno: string;
  produto: string;
  eans: string[];
  quantidade: number | null;
  precoVenda: number | null;
  dataEstoque: string | null;
  dataRefVendas: string | null; // última data de venda importada na loja
  ultimaVenda: string | null;
  venda30d: number; // R$
  diasComVenda30d: number;
  areaId: string | null;
  areaFonte: 'coleta' | 'manual' | null;
  grupoId: string | null;
  grupoNome: string | null;
  grupoSetor: string | null;
  grupoAreaId: string | null;
  subAreaId: string | null; // área do sub-sortimento (classe 4)
  classe: string | null;
  estoqueCd: number | null;
  // calculados
  diasSemVenda: number | null;
  vendaDiaUn: number | null; // unidades por dia (aprox.: valor ÷ preço atual)
  diasEstoque: number | null;
}

const num = (v: any) => (v == null ? null : Number(v));

export async function buscarProdutos(termo: string): Promise<ProdutoLista[]> {
  const t = termo.trim();
  if (!t) return [];
  const { data, error } = await supabase.rpc('produto_buscar', { p_termo: t });
  if (error) throw new Error(error.message);
  return (data ?? []).map((l: any) => ({
    codigoInterno: l.codigo_interno || null,
    codigoBarras: l.codigo_barras || null,
    produto: l.produto ?? '',
    quantidade: num(l.quantidade),
    precoVenda: num(l.preco_venda),
  }));
}

function diasEntre(de: string, ate: string): number {
  const a = new Date(de + 'T00:00:00Z').getTime(), b = new Date(ate + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export async function buscarFicha(codigoInterno: string): Promise<FichaProduto | null> {
  const [{ data, error }, areas] = await Promise.all([
    supabase.rpc('produto_info', { p_codigo: codigoInterno }),
    buscarAreasProdutos([codigoInterno]).catch(() => ({} as Record<string, { areaId: string; fonte: string }>)),
  ]);
  if (error) throw new Error(error.message);
  const a = areas[codigoInterno];
  const l = (data ?? [])[0];
  if (!l) return null;
  const qtd = num(l.quantidade), preco = num(l.preco_venda), v30 = Number(l.venda_30d || 0);
  const ref = l.data_ref_vendas as string | null;
  const vendaDiaUn = preco && preco > 0 ? v30 / preco / 30 : null;
  return {
    codigoInterno: l.codigo_interno,
    produto: l.produto ?? '',
    eans: l.eans ?? [],
    quantidade: qtd,
    precoVenda: preco,
    dataEstoque: l.data_estoque,
    dataRefVendas: ref,
    ultimaVenda: l.ultima_venda,
    venda30d: v30,
    diasComVenda30d: l.dias_com_venda_30d ?? 0,
    areaId: l.area_id,
    areaFonte: l.area_fonte,
    grupoId: l.grupo_id,
    grupoNome: l.grupo_nome,
    grupoSetor: l.grupo_setor,
    grupoAreaId: l.grupo_area_id,
    subAreaId: a && (a.fonte === 'subsortimento' || a.fonte === 'sub_coleta') ? a.areaId : null,
    classe: l.classe_5 ?? l.classe_2 ?? null,
    estoqueCd: num(l.estoque_cd),
    diasSemVenda: ref && l.ultima_venda ? diasEntre(l.ultima_venda, ref) : null,
    vendaDiaUn,
    diasEstoque: qtd != null && vendaDiaUn && vendaDiaUn > 0 ? Math.max(0, qtd) / vendaDiaUn : null,
  };
}
