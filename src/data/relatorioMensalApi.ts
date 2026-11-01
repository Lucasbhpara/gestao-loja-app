import { supabase } from '../lib/supabase';
import { rpcTudo } from '../lib/rpcTudo';
import { DadosRelatorioMensal, rmxFim, rmxIni, rmxMesSoma } from './relatorioMensalHtml';

// Relatório mensal: busca o mesmo que a aba do portal. Os arquivos do mês
// (PDF de metas e planilhas do Falcon de PDV, hora e pagamento) são subidos
// no portal e ficam em relatorio_mensal_dados; o resto vem do que o ULVA já
// tem (vendas, perdas e escala de folgas).

async function todasLinhas(montar: () => any): Promise<any[]> {
  const PAGINA = 1000;
  const todas: any[] = [];
  for (let de = 0; de < 50000; de += PAGINA) {
    const { data, error } = await montar().range(de, de + PAGINA - 1);
    if (error) throw error;
    todas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return todas;
}

// Último mês com arquivos subidos; se não houver nenhum, o mês passado.
export async function mesMaisRecente(): Promise<string> {
  const { data } = await supabase.from('relatorio_mensal_dados').select('mes_ref').neq('tipo', 'config').order('mes_ref', { ascending: false }).limit(1);
  if (data && data.length) return data[0].mes_ref as string;
  const hoje = new Date();
  return rmxMesSoma(hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0'), -1);
}

export async function carregarRelatorioMensal(mes: string): Promise<DadosRelatorioMensal> {
  const ini = rmxIni(mes), fim = rmxFim(mes);
  const ant = rmxMesSoma(mes, -1), prox = rmxMesSoma(mes, 1);
  const argsVendas = { p_ini: ini, p_fim: fim, p_ini_ant: rmxIni(ant), p_fim_ant: rmxFim(ant) };
  const [arquivos, setores, produtos, perdas, escala, colabs, config] = await Promise.all([
    supabase.from('relatorio_mensal_dados').select('tipo,dados,arquivo').eq('mes_ref', mes).then((r) => {
      if (r.error) throw r.error;
      return r.data || [];
    }),
    rpcTudo('vendas_loja_grupos', { ...argsVendas, p_nivel: 2 }).catch(() => []),
    rpcTudo('vendas_loja_grupos', { ...argsVendas, p_nivel: 6 }).catch(() => []),
    todasLinhas(() => supabase.from('perdas').select('setor,produto_cod,produto,unidade,quantidade,valor_perdido,valor_vendido').gte('periodo_inicio', ini).lte('periodo_fim', fim)).catch(() => []),
    todasLinhas(() => supabase.from('escala_folgas').select('colaborador_loja_id,data,tipo').gte('data', ini).lte('data', rmxFim(prox))).catch(() => []),
    supabase.from('colaboradores_loja').select('id,nome,cargo,setor,ativo').then((r) => r.data || []),
    supabase.from('relatorio_mensal_dados').select('mes_ref,dados').eq('tipo', 'config').lte('mes_ref', mes).order('mes_ref', { ascending: false }).limit(1).then((r) => r.data || []),
  ]);
  const arq: DadosRelatorioMensal['arq'] = {};
  (arquivos as any[]).forEach((a) => {
    arq[a.tipo] = { dados: a.dados, arquivo: a.arquivo };
  });
  const salario = Number(((config as any[])[0]?.dados?.salario_medio) || 1900);
  return { mes, prox, arq, setores: setores as any[], produtos: produtos as any[], perdas, escala, colabs: colabs as any[], salario };
}
