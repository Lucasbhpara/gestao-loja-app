import { supabase } from '../lib/supabase';
import { carregarVendaDia, DadosVendaDia, somarDiasIso, nomeDia, diaMesCurto, reais } from './vendaDiaApi';
import { carregarResumoMeta, ResumoMeta } from './metaVendaApi';

// =============================================================================
// Relatório diário (só do Lucas): abre pela notificação depois que as vendas
// sobem e vira um PDF para mandar no WhatsApp.
//   • Venda do dia anterior (total e por setor)
//   • Meta do dia e do mês
//   • Colaboradores de folga/falta/atestado HOJE, por setor
//   • Quebra por setor (valor e % sobre a venda) — o relatório de perdas é
//     importado acumulado do mês, então mostramos o acumulado até a data dele
// =============================================================================

export type PessoaFora = { nome: string; tipo: string };
export type SetorFolga = { setor: string; pessoas: PessoaFora[] };
export type SetorQuebra = { setor: string; perdido: number; vendido: number; pct: number | null };

export type RelatorioDiario = {
  diaVenda: string;
  diaFolgas: string;
  venda: DadosVendaDia;
  meta: ResumoMeta | null;
  folgas: SetorFolga[];
  totalFora: number;
  quebras: { ini: string; fim: string; setores: SetorQuebra[]; perdido: number; vendido: number } | null;
};

const NOME_SETOR: Record<string, string> = {
  gerencia: 'Gerência',
  cpd: 'CPD',
  acougue: 'Açougue',
  frios: 'Frios',
  padaria: 'Padaria',
  flv: 'FLV',
  mercearia: 'Mercearia',
  'frente-caixa': 'Frente de Caixa',
  deposito: 'Depósito',
  prevencao: 'Prevenção',
  promotores: 'Promotores',
};
export const nomeSetor = (s: string) => NOME_SETOR[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');

const TIPO: Record<string, string> = {
  folga: 'folga',
  folga_feriado: 'folga feriado',
  ferias: 'férias',
  falta: 'falta',
  atestado: 'atestado',
};
export const nomeTipo = (t: string) => TIPO[t] ?? t;

export function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function folgasDoDia(dia: string): Promise<SetorFolga[]> {
  const { data, error } = await supabase
    .from('escala_folgas')
    .select('tipo, colaboradores_loja(nome, setor, ativo)')
    .eq('data', dia);
  if (error) throw error;
  const mapa = new Map<string, PessoaFora[]>();
  ((data as any[]) || []).forEach((r) => {
    const c = Array.isArray(r.colaboradores_loja) ? r.colaboradores_loja[0] : r.colaboradores_loja;
    if (!c || c.ativo === false) return;
    const lista = mapa.get(c.setor) ?? [];
    lista.push({ nome: c.nome, tipo: r.tipo });
    mapa.set(c.setor, lista);
  });
  return [...mapa.entries()]
    .map(([setor, pessoas]) => ({ setor, pessoas: pessoas.sort((a, b) => a.nome.localeCompare(b.nome)) }))
    .sort((a, b) => nomeSetor(a.setor).localeCompare(nomeSetor(b.setor)));
}

async function quebrasPorSetor(): Promise<RelatorioDiario['quebras']> {
  const { data: ult, error: e1 } = await supabase.from('perdas').select('periodo_inicio,periodo_fim').order('periodo_fim', { ascending: false }).limit(1);
  if (e1) throw e1;
  if (!ult || !ult.length) return null;
  const { periodo_inicio: ini, periodo_fim: fim } = ult[0] as any;
  const linhas: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from('perdas')
      .select('setor,valor_perdido,valor_vendido')
      .eq('periodo_inicio', ini)
      .eq('periodo_fim', fim)
      .range(de, de + 999);
    if (error) throw error;
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const mapa = new Map<string, { perdido: number; vendido: number }>();
  linhas.forEach((l) => {
    const s = mapa.get(l.setor) ?? { perdido: 0, vendido: 0 };
    s.perdido += Number(l.valor_perdido) || 0;
    s.vendido += Number(l.valor_vendido) || 0;
    mapa.set(l.setor, s);
  });
  const setores = [...mapa.entries()]
    .map(([setor, v]) => ({ setor, perdido: v.perdido, vendido: v.vendido, pct: v.vendido > 0 ? (v.perdido / v.vendido) * 100 : null }))
    .sort((a, b) => b.perdido - a.perdido);
  return {
    ini,
    fim,
    setores,
    perdido: setores.reduce((a, s) => a + s.perdido, 0),
    vendido: setores.reduce((a, s) => a + s.vendido, 0),
  };
}

// diaVenda: dia das vendas (padrão: o último dia com venda subida).
export async function carregarRelatorioDiario(diaVenda: string | null, forcar = false): Promise<RelatorioDiario | null> {
  const venda = await carregarVendaDia(diaVenda, forcar);
  if (!venda) return null;
  const diaFolgas = somarDiasIso(venda.dia, 1);
  const [meta, folgas, quebras] = await Promise.all([
    carregarResumoMeta(venda.dia, venda.total, forcar).catch(() => null),
    folgasDoDia(diaFolgas).catch(() => [] as SetorFolga[]),
    quebrasPorSetor().catch(() => null),
  ]);
  return {
    diaVenda: venda.dia,
    diaFolgas,
    venda,
    meta,
    folgas,
    totalFora: folgas.reduce((a, s) => a + s.pessoas.length, 0),
    quebras,
  };
}

const pct = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function htmlRelatorioDiario(r: RelatorioDiario): string {
  const v = r.venda;
  const m = r.meta;
  const barra = (p: number) =>
    `<div class="trilho"><div style="width:${Math.min(100, Math.max(0, p))}%;background:${p >= 100 ? '#1E8E5A' : '#E8710A'}"></div></div>`;
  const varSemana = v.totalAnt > 0 ? ((v.total - v.totalAnt) / v.totalAnt) * 100 : null;

  const cardMetaDia =
    m && m.metaDia != null && m.pctDia != null
      ? `<div class="card"><div class="r">Meta do dia</div><div class="v" style="color:${m.pctDia >= 100 ? '#1E8E5A' : '#C0392B'}">${pct(m.pctDia)}</div>${barra(m.pctDia)}
         <div class="l">${reais(m.vendaDia, 0)} de ${reais(m.metaDia, 0)} · ${m.pctDia >= 100 ? '<b style="color:#1E8E5A">bateu (+' + reais(m.vendaDia - m.metaDia, 0) + ')</b>' : '<b style="color:#C0392B">faltou ' + reais(m.metaDia - m.vendaDia, 0) + '</b>'}</div></div>`
      : `<div class="card"><div class="r">Meta do dia</div><div class="v" style="font-size:15px">sem meta cadastrada</div></div>`;
  const cardMetaMes =
    m && m.temMes
      ? `<div class="card"><div class="r">Meta do mês</div><div class="v">${pct(m.pctMes)}</div>${barra(m.pctMes)}
         <div class="l">${reais(m.vendaMes, 0)} de ${reais(m.metaMes, 0)}${m.faltaMes > 0 ? ' · falta ' + reais(m.faltaMes, 0) + (m.precisaPorDia != null ? ` (${reais(m.precisaPorDia, 0)}/dia em ${m.diasRestantes} dias)` : '') : ' · meta batida!'}</div></div>`
      : '';

  const setoresVenda = v.setores
    .map((s) => {
      const p = s.vendaAnt > 0 ? ((s.venda - s.vendaAnt) / s.vendaAnt) * 100 : null;
      return `<tr><td>${esc(s.nome)}</td><td class="n">${reais(s.venda)}</td><td class="n">${pct((s.venda / (v.total || 1)) * 100)}</td><td class="n" style="color:${p == null ? '#5B6577' : p >= 0 ? '#1E8E5A' : '#C0392B'}">${p == null ? '—' : (p > 0 ? '+' : '') + pct(p)}</td></tr>`;
    })
    .join('');

  const folgas = r.folgas.length
    ? r.folgas
        .map(
          (s) =>
            `<tr><td style="width:28%"><b>${esc(nomeSetor(s.setor))}</b> <span class="sub">(${s.pessoas.length})</span></td><td>${s.pessoas
              .map((p) => `${esc(p.nome)}${p.tipo !== 'folga' ? ` <span class="tag ${p.tipo === 'falta' || p.tipo === 'atestado' ? 'red' : ''}">${esc(nomeTipo(p.tipo))}</span>` : ''}`)
              .join(', ')}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="2" class="sub">Ninguém de folga, falta ou atestado lançado para ${diaMesCurto(r.diaFolgas)}.</td></tr>`;

  const q = r.quebras;
  const quebras = q
    ? q.setores
        .map(
          (s) =>
            `<tr><td>${esc(nomeSetor(s.setor))}</td><td class="n">${reais(s.perdido)}</td><td class="n">${reais(s.vendido, 0)}</td><td class="n" style="color:${(s.pct ?? 0) > 3 ? '#C0392B' : '#0E1B2C'}"><b>${s.pct == null ? '—' : pct(s.pct)}</b></td></tr>`,
        )
        .join('') +
      `<tr class="tot"><td>Total</td><td class="n">${reais(q.perdido)}</td><td class="n">${reais(q.vendido, 0)}</td><td class="n">${q.vendido > 0 ? pct((q.perdido / q.vendido) * 100) : '—'}</td></tr>`
    : '<tr><td colspan="4" class="sub">Nenhum relatório de perdas importado.</td></tr>';

  const logo =
    '<svg width="34" height="34" viewBox="0 0 160 160"><rect width="160" height="160" rx="36" fill="#0E1B2C"/><path d="M42 36 V84 A38 38 0 0 0 118 84 V36" fill="none" stroke="#F4F5F7" stroke-width="20" stroke-linecap="round"/><circle cx="80" cy="74" r="15" fill="#2F7BFF"/></svg>';

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório diário ${diaMesCurto(r.diaVenda)}</title><style>
@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#0E1B2C;margin:0;font-size:10.5px}
.topo{display:flex;align-items:center;gap:12px;border-bottom:3px solid #0E1B2C;padding-bottom:10px;margin-bottom:12px}.topo h1{font-size:20px;margin:0}.topo .s{color:#5B6577;font-size:12px;margin-top:2px}
.cards{display:flex;gap:10px;margin-bottom:10px}.card{flex:1;border:1px solid #D5DBE5;border-radius:10px;padding:10px 12px}.card .r{font-size:10px;color:#5B6577;text-transform:uppercase;letter-spacing:.04em;font-weight:700}.card .v{font-size:20px;font-weight:800;margin-top:4px}.card .l{font-size:10px;color:#5B6577;margin-top:4px}
.trilho{height:7px;background:#EEF1F6;border-radius:4px;margin-top:6px;overflow:hidden}.trilho div{height:100%}
h2{font-size:13px;margin:14px 0 5px}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:9px;text-transform:uppercase;color:#5B6577;border-bottom:1.5px solid #0E1B2C;padding:4px 5px}td{padding:4px 5px;border-bottom:1px solid #E4E8EF;vertical-align:top}tr{page-break-inside:avoid}.n{text-align:right;white-space:nowrap}.sub{color:#5B6577;font-size:9.5px}
.tot td{font-weight:800;border-top:1.5px solid #0E1B2C}.tag{font-size:8.5px;background:#EEF1F6;color:#5B6577;border-radius:8px;padding:1px 5px}.tag.red{background:#FBDEDC;color:#C0392B}
.rod{margin-top:14px;font-size:9px;color:#5B6577;border-top:1px solid #D5DBE5;padding-top:6px;display:flex;justify-content:space-between}
</style></head><body>
<div class="topo">${logo}<div><h1>Relatório diário — ${diaMesCurto(r.diaVenda)}</h1><div class="s">${nomeDia(r.diaVenda)} · Loja 327 · gerado em ${new Date().toLocaleString('pt-BR')}</div></div></div>
<div class="cards">
<div class="card"><div class="r">Venda do dia</div><div class="v">${reais(v.total)}</div><div class="l" style="color:${varSemana == null ? '#5B6577' : varSemana >= 0 ? '#1E8E5A' : '#C0392B'}">${varSemana == null ? '' : (varSemana > 0 ? '+' : '') + pct(varSemana) + ' '}vs ${diaMesCurto(v.ant)} (${reais(v.totalAnt, 0)})</div></div>
${cardMetaDia}${cardMetaMes}</div>
<h2>Venda por setor</h2>
<table><thead><tr><th>Setor</th><th class="n">Venda</th><th class="n">% do dia</th><th class="n">vs ${diaMesCurto(v.ant)}</th></tr></thead><tbody>${setoresVenda}</tbody></table>
<h2>Fora hoje (${diaMesCurto(r.diaFolgas)}) — ${r.totalFora} ${r.totalFora === 1 ? 'colaborador' : 'colaboradores'}</h2>
<table><tbody>${folgas}</tbody></table>
<h2>Quebra por setor${q ? ` — acumulado de ${diaMesCurto(q.ini)} a ${diaMesCurto(q.fim)}` : ''}</h2>
<table><thead><tr><th>Setor</th><th class="n">Quebra</th><th class="n">Venda do setor</th><th class="n">% quebra</th></tr></thead><tbody>${quebras}</tbody></table>
<div class="rod"><span>ULVA · Relatório diário (uso da gerência)</span><span>by Lucas Alberto</span></div>
</body></html>`;
}
