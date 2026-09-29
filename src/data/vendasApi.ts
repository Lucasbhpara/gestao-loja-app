import { supabase } from '../lib/supabase';

// Vendas por categoria (setor de vendas — ex.: "MERCEARIA SALGADA",
// "HORTIFRUTIGRANJEIROS"), mês a mês. Vem da tabela `vendas_setor_loja`,
// que já existe no banco (montada a partir das planilhas de vendas que você
// manda — mesmo processo do Perdas & Quebras). Essa categoria é diferente do
// "setor" de colaborador (SetorKey) usado no resto do app: aqui é a
// categoria de produto usada no relatório de vendas da loja.
//
// Pra lançar um mês novo: manda a planilha de vendas no chat, do mesmo jeito
// que já faz com os relatórios de Perdas — a tabela é atualizada por um
// script de importação, não por um formulário no app.

export interface VendaSetor {
  id: string;
  setor: string; // categoria, como vem na planilha (ex.: "BAZAR")
  venda: number;
  quantidade: number;
  meta: number | null;
  atingimentoMetas: number | null; // razão (1 = 100% da meta), não porcentagem
  periodoInicio: string; // 'AAAA-MM-DD'
  periodoFim: string; // 'AAAA-MM-DD'
  mesRef: string; // 'AAAA-MM'
}

function linhaParaVendaSetor(linha: any): VendaSetor {
  return {
    id: linha.id,
    setor: linha.setor,
    venda: Number(linha.venda),
    quantidade: Number(linha.quantidade),
    meta: linha.meta === null ? null : Number(linha.meta),
    atingimentoMetas: linha.atingimento_metas === null ? null : Number(linha.atingimento_metas),
    periodoInicio: linha.periodo_inicio,
    periodoFim: linha.periodo_fim,
    mesRef: linha.mes_ref,
  };
}

// Busca todas as vendas por categoria de todos os meses.
export async function buscarVendasSetorLoja(): Promise<VendaSetor[]> {
  const { data, error } = await supabase.from('vendas_setor_loja').select('*').order('mes_ref', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaVendaSetor);
}

export interface VendasDoMes {
  mesRef: string; // 'AAAA-MM'
  periodoInicio: string;
  periodoFim: string;
  porSetor: { setor: string; venda: number; meta: number | null; atingimentoMetas: number | null }[];
  totalVenda: number;
  totalMeta: number;
}

// Agrupa por mês, já recortado pros últimos `qtdMeses` meses que têm dado
// (não necessariamente os últimos 5 meses do calendário).
export function agruparVendasPorMes(vendas: VendaSetor[], qtdMeses = 5): VendasDoMes[] {
  const porMes = new Map<string, VendaSetor[]>();
  for (const v of vendas) {
    if (!porMes.has(v.mesRef)) porMes.set(v.mesRef, []);
    porMes.get(v.mesRef)!.push(v);
  }
  const meses = Array.from(porMes.keys()).sort((a, b) => (a < b ? 1 : -1)); // mais recente primeiro
  return meses.slice(0, qtdMeses).map((mesRef) => {
    const linhas = porMes.get(mesRef)!;
    return {
      mesRef,
      periodoInicio: linhas[0]?.periodoInicio ?? '',
      periodoFim: linhas[0]?.periodoFim ?? '',
      porSetor: linhas
        .map((l) => ({ setor: l.setor, venda: l.venda, meta: l.meta, atingimentoMetas: l.atingimentoMetas }))
        .sort((a, b) => b.venda - a.venda),
      totalVenda: linhas.reduce((s, l) => s + l.venda, 0),
      totalMeta: linhas.reduce((s, l) => s + (l.meta ?? 0), 0),
    };
  });
}
