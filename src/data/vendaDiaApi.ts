import { supabase } from '../lib/supabase';

// Venda do dia: um dia escolhido — total, por setor e top 10 em valor/volume.
// Mesmas consultas da "Vendas da Loja" (vendas_loja_grupos). A planilha do
// Falcon só traz o VALOR vendido: o volume é estimado dividindo o valor pelo
// preço de venda atual (Estoque Loja, ou o preço do cadastro de classes).

export type SetorDia = { nome: string; venda: number; vendaAnt: number };
export type ProdutoDia = { codigo: string; nome: string; setor: string; venda: number; qtd: number | null; un: 'kg' | 'un' };
export type DadosVendaDia = {
  dia: string;
  ant: string;
  primeiro: string;
  ultimo: string;
  total: number;
  totalAnt: number;
  itens: number;
  semPreco: number;
  setores: SetorDia[];
  topValor: ProdutoDia[];
  topVolume: ProdutoDia[];
  acum: { ini: string; fim: string; antIni: string; antFim: string; total: number; totalAnt: number; dias: number };
};

const NOME_SETOR: Record<string, string> = {
  PERECIVEIS: 'Frios e Laticínios',
  'MERCEARIA LIQUIDA': 'Bebidas',
  'ACOUGUE/SALGADOS/DEFUMADO': 'Açougue',
  'BOMBONIERE/MATINAIS': 'Bomboniere e Matinais',
  'PERFUMARIA/HIG PESSOAL': 'Higiene e Perfumaria',
  'PADARIA FORN/FAB PROPRIA': 'Padaria',
  'MERCEARIA SALGADA': 'Mercearia Salgada',
  'MERCEARIA DOCE': 'Mercearia Doce',
  BAZAR: 'Bazar',
  LIMPEZA: 'Limpeza',
  CEREAIS: 'Cereais',
  HORTIFRUTIGRANJEIROS: 'Hortifrúti',
  'MARGEM GARANTIDA': 'Hortifrúti (margem garantida)',
  'MARGEM GARANTIDA BAZAR': 'Bazar (margem garantida)',
  'SEM CLASSIFICACAO': 'Sem classificação',
};
export function nomeSetorVenda(c2: string | null | undefined): string {
  if (!c2) return 'Sem classificação';
  return NOME_SETOR[c2] ?? c2.charAt(0) + c2.slice(1).toLowerCase();
}

export function somarDiasIso(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}

let limites: { primeiro: string; ultimo: string } | null = null;
export async function limitesVendas(forcar = false): Promise<{ primeiro: string; ultimo: string } | null> {
  if (limites && !forcar) return limites;
  const [u, p] = await Promise.all([
    supabase.from('vendas_diarias').select('data_venda').order('data_venda', { ascending: false }).limit(1),
    supabase.from('vendas_diarias').select('data_venda').order('data_venda', { ascending: true }).limit(1),
  ]);
  if (u.error) throw u.error;
  if (!u.data || !u.data.length) return null;
  limites = { ultimo: (u.data[0] as any).data_venda, primeiro: p.data && p.data.length ? (p.data[0] as any).data_venda : (u.data[0] as any).data_venda };
  return limites;
}

async function diasVenda(ini: string, fim: string): Promise<number[]> {
  const { data, error } = await supabase.rpc('vendas_loja_dias', { p_ini: ini, p_fim: fim });
  if (error) throw error;
  return ((data as any[]) || []).map((x) => Number(x.venda));
}

async function grupos(dia: string, ant: string, nivel: number) {
  const { data, error } = await supabase.rpc('vendas_loja_grupos', { p_ini: dia, p_fim: dia, p_ini_ant: ant, p_fim_ant: ant, p_nivel: nivel });
  if (error) throw error;
  return ((data as any[]) || []).map((g) => ({ chave: String(g.chave), nome: String(g.nome), venda: Number(g.venda), vendaAnt: Number(g.venda_ant) }));
}

export async function carregarVendaDia(dia: string | null, forcar = false): Promise<DadosVendaDia | null> {
  const lim = await limitesVendas(forcar);
  if (!lim) return null;
  let d = dia ?? lim.ultimo;
  if (d > lim.ultimo) d = lim.ultimo;
  if (d < lim.primeiro) d = lim.primeiro;
  const ant = somarDiasIso(d, -7);
  const [ay, am, ad] = d.split('-').map(Number);
  const mesIni = new Date(Date.UTC(ay, am - 1, 1)).toISOString().slice(0, 10);
  const ultAnt = new Date(Date.UTC(ay, am - 1, 0)).getUTCDate();
  const antIni = new Date(Date.UTC(ay, am - 2, 1)).toISOString().slice(0, 10);
  const antFim = new Date(Date.UTC(ay, am - 2, Math.min(ad, ultAnt))).toISOString().slice(0, 10);
  const [setores, produtos, dm, dmA] = await Promise.all([grupos(d, ant, 2), grupos(d, ant, 6), diasVenda(mesIni, d), diasVenda(antIni, antFim)]);
  const acum = { ini: mesIni, fim: d, antIni, antFim, total: dm.reduce((a, x) => a + x, 0), totalAnt: dmA.reduce((a, x) => a + x, 0), dias: dm.length };
  const vendidos = produtos.filter((p) => p.venda > 0);
  const cods = vendidos.map((p) => p.chave);
  const preco: Record<string, number> = {};
  const setorDe: Record<string, string> = {};
  for (let i = 0; i < cods.length; i += 300) {
    const parte = cods.slice(i, i + 300);
    const [r1, r2] = await Promise.all([
      supabase.from('estoque_loja_itens').select('codigo_interno,preco_venda').in('codigo_interno', parte),
      supabase.from('produtos_classes').select('codigo_produto,preco_venda,classe_2_nome').in('codigo_produto', parte),
    ]);
    ((r2.data as any[]) || []).forEach((x) => {
      if (Number(x.preco_venda) > 0) preco[x.codigo_produto] = Number(x.preco_venda);
      setorDe[x.codigo_produto] = x.classe_2_nome;
    });
    ((r1.data as any[]) || []).forEach((x) => {
      if (Number(x.preco_venda) > 0) preco[x.codigo_interno] = Number(x.preco_venda);
    });
  }
  const lista: ProdutoDia[] = vendidos.map((p) => {
    const pv = preco[p.chave];
    return {
      codigo: p.chave,
      nome: p.nome,
      setor: nomeSetorVenda(setorDe[p.chave]),
      venda: p.venda,
      qtd: pv ? p.venda / pv : null,
      un: /\bKG\b/i.test(p.nome) ? 'kg' : 'un',
    };
  });
  const setoresDia = setores
    .filter((s) => s.venda > 0)
    .map((s) => ({ nome: nomeSetorVenda(s.chave), venda: s.venda, vendaAnt: s.vendaAnt }))
    .sort((a, b) => b.venda - a.venda);
  return {
    dia: d,
    ant,
    acum,
    primeiro: lim.primeiro,
    ultimo: lim.ultimo,
    total: setores.reduce((a, s) => a + s.venda, 0),
    totalAnt: setores.reduce((a, s) => a + s.vendaAnt, 0),
    itens: lista.length,
    semPreco: lista.filter((x) => x.qtd == null).length,
    setores: setoresDia,
    topValor: [...lista].sort((a, b) => b.venda - a.venda).slice(0, 10),
    topVolume: lista.filter((x) => x.qtd != null).sort((a, b) => (b.qtd as number) - (a.qtd as number)).slice(0, 10),
  };
}

// ---------- texto ----------
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function nomeDia(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d));
  return `${DIAS[x.getUTCDay()]}, ${d} de ${MESES[m - 1]}`;
}
export function diaMesCurto(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
export function reais(n: number, casas = 2): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
export function qtdTexto(p: ProdutoDia): string {
  if (p.qtd == null) return '—';
  return p.qtd.toLocaleString('pt-BR', { maximumFractionDigits: p.un === 'kg' ? 1 : 0 }) + ' ' + p.un;
}
export function variacao(a: number, b: number): number | null {
  return b > 0 ? ((a - b) / b) * 100 : null;
}

// ---------- PDF (mesmo modelo do portal) ----------
export function htmlVendaDia(d: DadosVendaDia): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const varTxt = (a: number, b: number) => {
    const p = variacao(a, b);
    return p == null ? '—' : (p > 0 ? '+' : '') + p.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  };
  const cor = (a: number, b: number) => {
    const p = variacao(a, b);
    return p == null ? '#5B6577' : p >= 0 ? '#1E8E5A' : '#C0392B';
  };
  const linhasSetor = d.setores
    .map((s) => `<tr><td>${esc(s.nome)}</td><td class="n">${reais(s.venda)}</td><td class="n">${((s.venda / (d.total || 1)) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td><td class="n" style="color:${cor(s.venda, s.vendaAnt)}">${varTxt(s.venda, s.vendaAnt)}</td></tr>`)
    .join('');
  const top = (lista: ProdutoDia[], tipo: 'valor' | 'volume') =>
    lista
      .map(
        (p, i) =>
          `<tr><td class="pos">${i + 1}</td><td>${esc(p.nome)}<div class="sub">${esc(p.setor)}</div></td>` +
          (tipo === 'valor' ? `<td class="n"><b>${reais(p.venda)}</b></td><td class="n">${qtdTexto(p)}</td>` : `<td class="n"><b>${qtdTexto(p)}</b></td><td class="n">${reais(p.venda)}</td>`) +
          '</tr>'
      )
      .join('');
  const s0 = d.setores[0];
  const logo = '<svg width="34" height="34" viewBox="0 0 160 160"><rect width="160" height="160" rx="36" fill="#0E1B2C"/><path d="M42 36 V84 A38 38 0 0 0 118 84 V36" fill="none" stroke="#F4F5F7" stroke-width="20" stroke-linecap="round"/><circle cx="80" cy="74" r="15" fill="#2F7BFF"/></svg>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Venda do dia ${diaMesCurto(d.dia)}</title><style>
@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#0E1B2C;margin:0;font-size:10px}
.topo{display:flex;align-items:center;gap:12px;border-bottom:3px solid #0E1B2C;padding-bottom:10px;margin-bottom:14px}.topo h1{font-size:20px;margin:0}.topo .s{color:#5B6577;font-size:12px;margin-top:2px}
.cards{display:flex;gap:10px;margin-bottom:10px}.card{flex:1;border:1px solid #D5DBE5;border-radius:10px;padding:10px 12px}.card .r{font-size:10px;color:#5B6577;text-transform:uppercase;letter-spacing:.04em;font-weight:700}.card .v{font-size:19px;font-weight:800;margin-top:4px}.card .l{font-size:10px;color:#5B6577;margin-top:2px}
h2{font-size:12.5px;margin:12px 0 4px}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:9px;text-transform:uppercase;color:#5B6577;border-bottom:1.5px solid #0E1B2C;padding:4px 5px}td{padding:3px 5px;border-bottom:1px solid #E4E8EF;vertical-align:top}tr{page-break-inside:avoid}.n{text-align:right;white-space:nowrap}.pos{color:#5B6577;font-weight:700;width:22px}.sub{font-size:8.5px;color:#5B6577}
.duas{display:flex;gap:14px}.duas>div{flex:1}.rod{margin-top:14px;font-size:9px;color:#5B6577;border-top:1px solid #D5DBE5;padding-top:6px}
</style></head><body>
<div class="topo">${logo}<div><h1>Venda do dia — ${diaMesCurto(d.dia)}</h1><div class="s">${nomeDia(d.dia)} · Loja 327 · gerado em ${new Date().toLocaleString('pt-BR')}</div></div></div>
<div class="cards"><div class="card"><div class="r">Venda total</div><div class="v">${reais(d.total)}</div><div class="l" style="color:${cor(d.total, d.totalAnt)}">${varTxt(d.total, d.totalAnt)} vs ${diaMesCurto(d.ant)} (${reais(d.totalAnt)})</div></div>
<div class="card"><div class="r">Acumulado do mês</div><div class="v">${reais(d.acum.total, 0)}</div><div class="l" style="color:${cor(d.acum.total, d.acum.totalAnt)}">${varTxt(d.acum.total, d.acum.totalAnt)} vs ${diaMesCurto(d.acum.antIni)}–${diaMesCurto(d.acum.antFim)} · ${diaMesCurto(d.acum.ini)}–${diaMesCurto(d.acum.fim)}</div></div>
<div class="card"><div class="r">Produtos vendidos</div><div class="v">${d.itens.toLocaleString('pt-BR')}</div><div class="l">itens diferentes</div></div>
<div class="card"><div class="r">Setor que mais vendeu</div><div class="v" style="font-size:15px">${s0 ? esc(s0.nome) : '—'}</div><div class="l">${s0 ? reais(s0.venda) : ''}</div></div></div>
<h2>Venda por setor</h2><table><thead><tr><th>Setor</th><th class="n">Venda</th><th class="n">% do dia</th><th class="n">vs ${diaMesCurto(d.ant)}</th></tr></thead><tbody>${linhasSetor}</tbody></table>
<div class="duas"><div><h2>Top 10 em valor</h2><table><thead><tr><th></th><th>Produto</th><th class="n">Venda</th><th class="n">Volume*</th></tr></thead><tbody>${top(d.topValor, 'valor')}</tbody></table></div>
<div><h2>Top 10 em volume*</h2><table><thead><tr><th></th><th>Produto</th><th class="n">Volume*</th><th class="n">Venda</th></tr></thead><tbody>${top(d.topVolume, 'volume')}</tbody></table></div></div>
<div class="rod">* Volume aproximado: valor vendido ÷ preço de venda atual (a planilha do Falcon traz só o valor). Variação comparada com o mesmo dia da semana anterior. ULVA · A loja inteira na palma da mão.</div>
</body></html>`;
}
