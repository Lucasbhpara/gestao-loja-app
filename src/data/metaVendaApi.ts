import { supabase } from '../lib/supabase';
import { somarDiasIso } from './vendaDiaApi';

// Meta de venda da loja (Venda do dia).
// Fica na tabela system_config, uma chave por mês: 'meta_venda_AAAA-MM'.
// O valor é um JSON com:
//   base_ate               — último dia que veio do relatório "Meta Venda Loja"
//   meta_acumulada_base    — meta somada do dia 1 até base_ate
//   venda_acumulada_base   — venda oficial somada do dia 1 até base_ate
//   diarias                — { 'AAAA-MM-DD': meta do dia } dos dias seguintes
//   diarias_anteriores     — (opcional) metas dos dias até base_ate, só para
//                            mostrar se o dia bateu; não somam na meta do mês
// A venda dos dias depois de base_ate vem das vendas subidas no ULVA.

type ConfigMeta = {
  base_ate: string;
  meta_acumulada_base: number;
  venda_acumulada_base: number;
  diarias: Record<string, number>;
  diarias_anteriores?: Record<string, number>;
};

export type ResumoMeta = {
  dia: string;
  metaDia: number | null;
  vendaDia: number;
  pctDia: number | null; // venda ÷ meta do dia × 100
  temMes: boolean; // false em dias antes de base_ate (só a meta do dia)
  metaMes: number;
  vendaMes: number; // acumulada até o dia escolhido
  pctMes: number;
  faltaMes: number; // quanto falta para a meta do mês (0 se já bateu)
  metaAteDia: number; // meta acumulada só até o dia escolhido
  pctAteDia: number;
  diasRestantes: number; // dias com meta depois do dia escolhido
  precisaPorDia: number | null; // falta do mês ÷ dias restantes
};

const cache: Record<string, ConfigMeta | null> = {};

async function configDoMes(mes: string, forcar = false): Promise<ConfigMeta | null> {
  if (!forcar && mes in cache) return cache[mes];
  const { data, error } = await supabase.from('system_config').select('value').eq('key', `meta_venda_${mes}`).maybeSingle();
  if (error) throw error;
  let cfg: ConfigMeta | null = null;
  try {
    cfg = data?.value ? (JSON.parse(data.value) as ConfigMeta) : null;
  } catch {
    cfg = null;
  }
  cache[mes] = cfg;
  return cfg;
}

export async function carregarResumoMeta(dia: string, vendaDia: number, forcar = false): Promise<ResumoMeta | null> {
  const cfg = await configDoMes(dia.slice(0, 7), forcar);
  if (!cfg) return null;
  const metaDiaDe = (d: string) => {
    const v = cfg.diarias[d] ?? cfg.diarias_anteriores?.[d];
    return v != null ? Number(v) : null;
  };
  if (dia < cfg.base_ate) {
    const md = metaDiaDe(dia);
    if (md == null) return null;
    return {
      dia,
      metaDia: md,
      vendaDia,
      pctDia: (vendaDia / md) * 100,
      temMes: false,
      metaMes: 0,
      vendaMes: 0,
      pctMes: 0,
      faltaMes: 0,
      metaAteDia: 0,
      pctAteDia: 0,
      diasRestantes: 0,
      precisaPorDia: null,
    };
  }
  const metaMes = cfg.meta_acumulada_base + Object.values(cfg.diarias).reduce((a, x) => a + Number(x), 0);
  let vendaDepois = 0;
  if (dia > cfg.base_ate) {
    const { data, error } = await supabase.rpc('vendas_loja_dias', { p_ini: somarDiasIso(cfg.base_ate, 1), p_fim: dia });
    if (error) throw error;
    vendaDepois = ((data as any[]) || []).reduce((a, x) => a + Number(x.venda), 0);
  }
  const vendaMes = cfg.venda_acumulada_base + vendaDepois;
  const metaAteDia =
    cfg.meta_acumulada_base +
    Object.entries(cfg.diarias)
      .filter(([d]) => d <= dia)
      .reduce((a, [, v]) => a + Number(v), 0);
  const restantes = Object.keys(cfg.diarias).filter((d) => d > dia).length;
  const faltaMes = Math.max(0, metaMes - vendaMes);
  const metaDia = metaDiaDe(dia);
  return {
    dia,
    metaDia,
    vendaDia,
    pctDia: metaDia ? (vendaDia / metaDia) * 100 : null,
    temMes: true,
    metaMes,
    vendaMes,
    pctMes: (vendaMes / metaMes) * 100,
    faltaMes,
    metaAteDia,
    pctAteDia: (vendaMes / metaAteDia) * 100,
    diasRestantes: restantes,
    precisaPorDia: restantes > 0 && faltaMes > 0 ? faltaMes / restantes : null,
  };
}

export function pctTexto(p: number): string {
  return p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}
