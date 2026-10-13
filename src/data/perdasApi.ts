import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';

// Os dados de "perdas" agora vêm de relatórios em PDF que você manda no
// chat — não existe mais registro manual pelo app. Cada linha aqui é um
// produto, já somado no período do relatório, mapeado pro setor certo.

export interface Perda {
  id: string;
  loja: string;
  periodoInicio: string; // 'AAAA-MM-DD'
  periodoFim: string; // 'AAAA-MM-DD'
  setor: SetorKey;
  sortimento: string;
  produtoCod: string;
  produto: string;
  unidade: string;
  quantidade: number;
  valorPerdido: number;
  valorVendido: number;
  pctPerda: number | null;
  importadoEm: string;
}

function linhaParaPerda(linha: any): Perda {
  return {
    id: linha.id,
    loja: linha.loja,
    periodoInicio: linha.periodo_inicio,
    periodoFim: linha.periodo_fim,
    setor: linha.setor,
    sortimento: linha.sortimento,
    produtoCod: linha.produto_cod,
    produto: linha.produto,
    unidade: linha.unidade,
    quantidade: Number(linha.quantidade),
    valorPerdido: Number(linha.valor_perdido),
    valorVendido: Number(linha.valor_vendido),
    pctPerda: linha.pct_perda === null ? null : Number(linha.pct_perda),
    importadoEm: linha.importado_em,
  };
}

// Cada importação no portal deveria substituir o produto anterior do mesmo
// setor (o banco tem uma trava de "setor + código do produto" pra isso) —
// mas essa função aqui é uma segunda linha de defesa: se por qualquer
// motivo ainda existirem duas linhas do mesmo produto no mesmo setor (ex.:
// dado importado antes dessa trava existir), o app nunca soma as duas.
// Fica só com a mais recente (maior importado_em; produto_cod desempata).
function filtrarUltimaImportacaoPorProduto(linhas: Perda[]): Perda[] {
  const maisRecentePorChave = new Map<string, Perda>();
  for (const l of linhas) {
    const chave = l.setor + '|' + l.produtoCod;
    const atual = maisRecentePorChave.get(chave);
    if (!atual || l.importadoEm > atual.importadoEm) maisRecentePorChave.set(chave, l);
  }
  const vencedoras = new Set(maisRecentePorChave.values());
  return linhas.filter((l) => vencedoras.has(l));
}

// Busca todas as perdas de todos os setores (visão do Administrador).
export async function buscarTodasPerdas(): Promise<Perda[]> {
  const { data, error } = await supabase.from('perdas').select('*').order('valor_perdido', { ascending: false });
  if (error) throw error;
  return filtrarUltimaImportacaoPorProduto((data ?? []).map(linhaParaPerda));
}

// Busca só as perdas do setor do colaborador, do período mais recente importado.
export async function buscarPerdasDoSetor(setor: SetorKey): Promise<Perda[]> {
  const { data, error } = await supabase
    .from('perdas')
    .select('*')
    .eq('setor', setor)
    .order('valor_perdido', { ascending: false });
  if (error) throw error;
  return filtrarUltimaImportacaoPorProduto((data ?? []).map(linhaParaPerda));
}

// Setor das perdas → setores do cadastro de vendas (classe 2), pra achar a
// venda do setor e calcular a quebra geral (perda ÷ venda).
export const VENDA_SETOR_PERDAS: Partial<Record<SetorKey, string[]>> = {
  flv: ['HORTIFRUTIGRANJEIROS'],
  padaria: ['PADARIA FORN/FAB PROPRIA'],
  acougue: ['ACOUGUE/SALGADOS/DEFUMADO'],
  frios: ['PERECIVEIS'],
  mercearia: ['MERCEARIA LIQUIDA', 'MERCEARIA SALGADA', 'MERCEARIA DOCE', 'CEREAIS', 'BOMBONIERE/MATINAIS', 'LIMPEZA', 'PERFUMARIA/HIG PESSOAL', 'BAZAR'],
};

export interface VendaSetores {
  porSetor: Record<string, number>;
  ate: string | null; // último dia de venda carregado
}

// Venda acumulada do mês do relatório, por setor (vendas_setor_loja é
// recalculada sozinha a cada upload de vendas). Null se não houver.
export async function buscarVendaSetores(periodoInicio: string, periodoFim: string): Promise<VendaSetores | null> {
  const mesIni = periodoInicio.slice(0, 8) + '01';
  const { data, error } = await supabase.from('vendas_setor_loja').select('setor_norm, venda').eq('periodo_inicio', mesIni);
  if (error || !data || data.length === 0) return null;
  const porSetor: Record<string, number> = {};
  (data as { setor_norm: string; venda: number }[]).forEach((l) => {
    porSetor[l.setor_norm] = (porSetor[l.setor_norm] || 0) + Number(l.venda || 0);
  });
  let ate: string | null = null;
  const u = await supabase
    .from('vendas_diarias')
    .select('data_venda')
    .gte('data_venda', mesIni)
    .lte('data_venda', periodoFim)
    .order('data_venda', { ascending: false })
    .limit(1);
  if (!u.error && u.data && u.data.length) ate = (u.data[0] as { data_venda: string }).data_venda;
  return { porSetor, ate };
}

export function vendaDoSetor(setor: SetorKey, vendas: VendaSetores | null): number | null {
  const chaves = VENDA_SETOR_PERDAS[setor];
  if (!vendas || !chaves) return null;
  const v = chaves.reduce((s, k) => s + (vendas.porSetor[k] || 0), 0);
  return v > 0 ? v : null;
}
