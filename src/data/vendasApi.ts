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

// =============================================================================
// Curva ABC + Estoque Crítico — mesma lógica do Portal Admin (por produto,
// não por categoria). Cruza `vendas_loja_itens` (planilha de vendas mais
// recente importada) com `estoque_loja_itens` (estoque atual) pra calcular
// venda média diária e "dias de estoque restante" de cada produto.
// =============================================================================

// O Supabase só devolve até 1000 linhas por consulta por padrão — como as
// duas tabelas abaixo passam disso, sem paginar a gente pegava só um pedaço
// aleatório da tabela (mesmo bug que corrigimos no Portal Admin). Isso busca
// todas as páginas até não vir mais nada.
async function buscarTodasLinhasLoja<T>(tabela: string, colunas: string): Promise<T[]> {
  const PAGINA = 1000;
  let todas: T[] = [];
  let pagina = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const inicio = pagina * PAGINA;
    const fim = inicio + PAGINA - 1;
    const { data, error } = await supabase.from(tabela).select(colunas).range(inicio, fim);
    if (error) throw error;
    todas = todas.concat((data as T[]) ?? []);
    if (!data || data.length < PAGINA) break;
    pagina++;
  }
  return todas;
}

export interface ItemVendaABC {
  produto: string;
  quantidadeVendida: number;
  valor: number;
  percentual: number;
  percentualAcumulado: number;
  classe: 'A' | 'B' | 'C' | '—';
  estoqueAtual: number | null;
  vendaMediaDiaria: number;
  diasEstoqueRestante: number | null;
}

const CORTE_ABC_A = 80;
const CORTE_ABC_B = 95;

function normalizarNomeProdutoLoja(produto: string | null | undefined): string {
  return (produto ?? '').toString().replace(/\s+/g, ' ').trim().toUpperCase();
}

// Busca a planilha de vendas por produto + o estoque atual, e monta a Curva
// ABC (classificação por % acumulado do faturamento) com o "dias de estoque
// restante" de cada item — idêntico ao que o Portal Admin calcula.
export async function buscarVendasComABC(): Promise<ItemVendaABC[]> {
  const [vendas, estoque] = await Promise.all([
    buscarTodasLinhasLoja<any>('vendas_loja_itens', '*'),
    buscarTodasLinhasLoja<any>('estoque_loja_itens', 'produto, quantidade, preco_venda, preco_custo, codigo_interno'),
  ]);

  const mapaEstoque = new Map<string, any>();
  estoque.forEach((i) => mapaEstoque.set(normalizarNomeProdutoLoja(i.produto), i));

  const linhas = vendas.map((v) => {
    const info = mapaEstoque.get(normalizarNomeProdutoLoja(v.produto)) ?? null;
    const valor = v.valor_vendido != null ? Number(v.valor_vendido) : Number(v.quantidade_vendida) * Number(info?.preco_venda ?? 0);
    const diasPeriodo = Math.max(1, Math.round((+new Date(v.periodo_fim) - +new Date(v.periodo_inicio)) / 86400000) + 1);
    const vendaMediaDiaria = Number(v.quantidade_vendida) / diasPeriodo;
    const estoqueAtual = info ? Number(info.quantidade) : null;
    const diasEstoqueRestante = estoqueAtual != null && vendaMediaDiaria > 0 ? estoqueAtual / vendaMediaDiaria : null;
    return {
      produto: v.produto as string,
      quantidadeVendida: Number(v.quantidade_vendida),
      valor,
      percentual: 0,
      percentualAcumulado: 0,
      classe: '—' as ItemVendaABC['classe'],
      estoqueAtual,
      vendaMediaDiaria,
      diasEstoqueRestante,
    };
  });

  linhas.sort((a, b) => b.valor - a.valor);
  const totalValor = linhas.reduce((soma, l) => soma + l.valor, 0);
  let acumulado = 0;
  linhas.forEach((l) => {
    l.percentual = totalValor > 0 ? (l.valor / totalValor) * 100 : 0;
    acumulado += l.percentual;
    l.percentualAcumulado = acumulado;
    l.classe = totalValor <= 0 ? '—' : acumulado <= CORTE_ABC_A ? 'A' : acumulado <= CORTE_ABC_B ? 'B' : 'C';
  });
  return linhas;
}
