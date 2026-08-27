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

// Busca todas as perdas de todos os setores (visão do Administrador).
export async function buscarTodasPerdas(): Promise<Perda[]> {
  const { data, error } = await supabase.from('perdas').select('*').order('valor_perdido', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaPerda);
}

// Busca só as perdas do setor do colaborador, do período mais recente importado.
export async function buscarPerdasDoSetor(setor: SetorKey): Promise<Perda[]> {
  const { data, error } = await supabase
    .from('perdas')
    .select('*')
    .eq('setor', setor)
    .order('valor_perdido', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaPerda);
}
