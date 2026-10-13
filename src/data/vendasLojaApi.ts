import { supabase } from '../lib/supabase';

// Vendas da Loja — mesma fonte da aba do Portal Admin. Lê só o que já existe
// no banco (vendas_diarias + produtos_classes + estoque) pelas funções
// vendas_loja_dias e vendas_loja_grupos (supabase/vendas_loja.sql).

export type TipoPeriodo = 'mes' | '7d' | '30d' | 'mes_ant';
export const PERIODOS: { tipo: TipoPeriodo; rotulo: string }[] = [
  { tipo: 'mes', rotulo: 'Mês atual' },
  { tipo: '7d', rotulo: 'Últimos 7 dias' },
  { tipo: '30d', rotulo: 'Últimos 30 dias' },
  { tipo: 'mes_ant', rotulo: 'Mês anterior' },
];
export const NIVEIS = ['Setor', 'Grupo', 'Categoria', 'Subcategoria', 'Produto'];

export interface VendaDia {
  dia: string;
  venda: number;
}
export interface VendaGrupo {
  chave: string;
  nome: string;
  venda: number;
  vendaAnt: number;
  itens: number;
  margem: number | null;
}
export interface Periodo {
  ini: string;
  fim: string;
  iniA: string;
  fimA: string;
  rotulo: string;
  rotuloA: string;
}
export interface DadosVendasLoja {
  periodo: Periodo;
  ultimoDia: string;
  dias: VendaDia[];
  diasA: VendaDia[];
  grupos: VendaGrupo[];
  produtos: VendaGrupo[];
  nivel: number; // 2 = setor … 6 = produto
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
export function paraData(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const somaDias = (d: Date, n: number) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};
export function diaMes(s: string): string {
  const d = paraData(s);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function calcularPeriodo(tipo: TipoPeriodo, ultimo: string): Periodo {
  const u = paraData(ultimo);
  const y = u.getUTCFullYear();
  const m = u.getUTCMonth();
  let ini: Date, fim: Date, iniA: Date, fimA: Date, rotuloA: string;
  if (tipo === 'mes') {
    ini = new Date(Date.UTC(y, m, 1));
    fim = u;
    iniA = new Date(Date.UTC(y, m - 1, 1));
    const ultDiaAnt = new Date(Date.UTC(y, m, 0)).getUTCDate();
    fimA = new Date(Date.UTC(y, m - 1, Math.min(u.getUTCDate(), ultDiaAnt)));
    rotuloA = 'mesmos dias do mês anterior';
  } else if (tipo === 'mes_ant') {
    ini = new Date(Date.UTC(y, m - 1, 1));
    fim = new Date(Date.UTC(y, m, 0));
    iniA = new Date(Date.UTC(y, m - 2, 1));
    fimA = new Date(Date.UTC(y, m - 1, 0));
    rotuloA = 'mês retrasado';
  } else {
    const n = tipo === '7d' ? 7 : 30;
    fim = u;
    ini = somaDias(u, -(n - 1));
    fimA = somaDias(ini, -1);
    iniA = somaDias(ini, -n);
    rotuloA = `${n} dias anteriores`;
  }
  return {
    ini: iso(ini),
    fim: iso(fim),
    iniA: iso(iniA),
    fimA: iso(fimA),
    rotulo: `${diaMes(iso(ini))} a ${diaMes(iso(fim))}`,
    rotuloA,
  };
}

async function ultimoDiaComVenda(): Promise<string | null> {
  const { data, error } = await supabase.from('vendas_diarias').select('data_venda').order('data_venda', { ascending: false }).limit(1);
  if (error) throw error;
  return data && data.length ? (data[0] as { data_venda: string }).data_venda : null;
}

async function dias(ini: string, fim: string): Promise<VendaDia[]> {
  const { data, error } = await supabase.rpc('vendas_loja_dias', { p_ini: ini, p_fim: fim });
  if (error) throw error;
  return ((data as { dia: string; venda: number }[]) || []).map((d) => ({ dia: d.dia, venda: Number(d.venda) }));
}

async function grupos(p: Periodo, nivel: number, caminho: string[]): Promise<VendaGrupo[]> {
  const { data, error } = await supabase.rpc('vendas_loja_grupos', {
    p_ini: p.ini,
    p_fim: p.fim,
    p_ini_ant: p.iniA,
    p_fim_ant: p.fimA,
    p_nivel: nivel,
    p_c2: caminho[0] ?? null,
    p_c3: caminho[1] ?? null,
    p_c4: caminho[2] ?? null,
    p_c5: caminho[3] ?? null,
  });
  if (error) throw error;
  return ((data as Record<string, unknown>[]) || []).map((g) => ({
    chave: String(g.chave),
    nome: String(g.nome),
    venda: Number(g.venda),
    vendaAnt: Number(g.venda_ant),
    itens: Number(g.itens),
    margem: g.margem == null ? null : Number(g.margem),
  }));
}

let ultimoCache: string | null = null;

export async function carregarVendasLoja(tipo: TipoPeriodo, caminho: string[], forcar = false): Promise<DadosVendasLoja | null> {
  if (!ultimoCache || forcar) ultimoCache = await ultimoDiaComVenda();
  if (!ultimoCache) return null;
  const periodo = calcularPeriodo(tipo, ultimoCache);
  const nivel = Math.min(caminho.length + 2, 6);
  const [d, dA, g, prods] = await Promise.all([
    dias(periodo.ini, periodo.fim),
    dias(periodo.iniA, periodo.fimA),
    grupos(periodo, nivel, caminho),
    nivel < 6 ? grupos(periodo, 6, caminho) : Promise.resolve(null),
  ]);
  return { periodo, ultimoDia: ultimoCache, dias: d, diasA: dA, grupos: g, produtos: prods ?? g, nivel };
}

// A função ainda não foi criada no banco?
export function faltaFuncaoNoBanco(e: unknown): boolean {
  const msg = (e as { message?: string })?.message || '';
  const code = (e as { code?: string })?.code || '';
  return code === 'PGRST202' || /vendas_loja_(dias|grupos)/.test(msg);
}
