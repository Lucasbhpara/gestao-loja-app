import { ASSINATURA_ULVA } from '../lib/assinatura';
import { supabase } from '../lib/supabase';
import { carregarVendaDia, DadosVendaDia, somarDiasIso, nomeDia, diaMesCurto, reais, limitesVendas } from './vendaDiaApi';
import { carregarResumoMeta, ResumoMeta, metaDoDia } from './metaVendaApi';

// =============================================================================
// Relatório diário (só do Lucas): abre pela notificação depois que as vendas
// sobem e vira um PDF para mandar no WhatsApp. É o relatório de HOJE:
//   • ONTEM: venda (total e por setor), se bateu a meta de ontem, mês
//   • HOJE: meta de hoje (e quanto precisa por dia para o mês)
//   • Colaboradores de folga/falta/atestado HOJE, por setor
//   • Quebra por setor (valor e % sobre a venda) — o relatório de perdas é
//     importado acumulado do mês, então mostramos o acumulado até a data dele
// =============================================================================

export type PessoaFora = { nome: string; tipo: string };
export type SetorFolga = { setor: string; pessoas: PessoaFora[] };
export type SetorQuebra = { setor: string; perdido: number; vendido: number; pct: number | null };

export type RelatorioDiario = {
  diaVenda: string;
  diaFolgas: string; // = hoje (dia seguinte ao da venda)
  venda: DadosVendaDia;
  meta: ResumoMeta | null; // meta de ONTEM (dia da venda) e do mês
  metaHoje: number | null;
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
  // Sempre confere o último dia com venda (o app pode estar aberto desde ontem).
  await limitesVendas(true).catch(() => null);
  const venda = await carregarVendaDia(diaVenda, forcar);
  if (!venda) return null;
  const diaFolgas = somarDiasIso(venda.dia, 1);
  const [meta, metaHoje, folgas, quebras] = await Promise.all([
    carregarResumoMeta(venda.dia, venda.total, forcar).catch(() => null),
    metaDoDia(diaFolgas, forcar).catch(() => null),
    folgasDoDia(diaFolgas).catch(() => [] as SetorFolga[]),
    quebrasPorSetor().catch(() => null),
  ]);
  return {
    diaVenda: venda.dia,
    diaFolgas,
    venda,
    meta,
    metaHoje,
    folgas,
    totalFora: folgas.reduce((a, s) => a + s.pessoas.length, 0),
    quebras,
  };
}

const pct = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// Visual "painel": faixa navy no topo, 4 indicadores de ontem, venda e quebra
// por setor à esquerda, meta de hoje e quem está fora à direita. A página tem
// a altura do conteúdo (alturaRelatorioDiario) para ler bem no WhatsApp.
const VERDE = '#15803D';
const VERMELHO = '#B42318';
const AZUL = '#2F7BFF';
const curtoDia = (iso: string) => {
  const t = nomeDia(iso); // "quarta-feira, 11 de novembro"
  return t.split(',')[0].replace('-feira', '').toLowerCase();
};
const seta = (p: number | null) =>
  p == null ? '<span style="color:#8A93A5">—</span>' : `<span style="color:${p >= 0 ? VERDE : VERMELHO}">${p >= 0 ? '▲' : '▼'} ${pct(Math.abs(p))}</span>`;
const barra = (p: number, cor = AZUL) => `<div class="bar"><i style="width:${Math.min(100, Math.max(0, p))}%;background:${cor}"></i></div>`;
const milhar = (n: number) => reais(n, 0);
const curtoReais = (n: number) => (Math.abs(n) >= 1e6 ? 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi' : Math.abs(n) >= 1e4 ? 'R$ ' + Math.round(n / 1e3).toLocaleString('pt-BR') + ' mil' : reais(n, 0));

export function htmlRelatorioDiario(r: RelatorioDiario): string {
  const v = r.venda;
  const m = r.meta;
  const q = r.quebras;
  const varSemana = v.totalAnt > 0 ? ((v.total - v.totalAnt) / v.totalAnt) * 100 : null;
  const diaV = curtoDia(r.diaVenda);
  const diaH = curtoDia(r.diaFolgas);

  const kVenda = `<div class="k"><div class="kn">Venda</div><div class="v">${milhar(v.total)}</div><div class="s">${seta(varSemana)} vs ${curtoDia(v.ant)} ${diaMesCurto(v.ant)} (${milhar(v.totalAnt)})</div></div>`;
  const kMetaDia =
    m && m.metaDia != null && m.pctDia != null
      ? `<div class="k"><div class="kn">Meta do dia</div><div class="v" style="color:${m.pctDia >= 100 ? VERDE : VERMELHO}">${pct(m.pctDia)}</div>${barra(m.pctDia, m.pctDia >= 100 ? VERDE : '#E8710A')}<div class="s">${m.pctDia >= 100 ? '+' + milhar(m.vendaDia - m.metaDia) + ' sobre ' : 'faltou ' + milhar(m.metaDia - m.vendaDia) + ' de '}${milhar(m.metaDia)}</div></div>`
      : `<div class="k"><div class="kn">Meta do dia</div><div class="v" style="font-size:13px;color:#6B7486">sem meta</div></div>`;
  const kMes =
    m && m.temMes
      ? `<div class="k"><div class="kn">Mês até ontem</div><div class="v">${pct(m.pctMes)}</div>${barra(m.pctMes, m.pctMes >= 100 ? VERDE : AZUL)}<div class="s">${curtoReais(m.vendaMes)} de ${curtoReais(m.metaMes)}</div></div>`
      : `<div class="k"><div class="kn">Mês até ontem</div><div class="v" style="font-size:13px;color:#6B7486">sem meta do mês</div></div>`;
  const pq = q && q.vendido > 0 ? (q.perdido / q.vendido) * 100 : null;
  const kQuebra = q
    ? `<div class="k"><div class="kn">Quebra do mês</div><div class="v" style="color:${(pq ?? 0) > 3 ? VERMELHO : '#0B1220'}">${pq == null ? '—' : pct(pq)}</div><div class="s">${milhar(q.perdido)} · ${diaMesCurto(q.ini)} a ${diaMesCurto(q.fim)}</div></div>`
    : `<div class="k"><div class="kn">Quebra do mês</div><div class="v" style="font-size:13px;color:#6B7486">sem relatório</div></div>`;

  const linhasVenda =
    v.setores
      .map((s) => {
        const part = (s.venda / (v.total || 1)) * 100;
        const p = s.vendaAnt > 0 ? ((s.venda - s.vendaAnt) / s.vendaAnt) * 100 : null;
        return `<tr><td>${esc(s.nome)}</td><td class="n">${milhar(s.venda)}</td><td class="n">${Math.round(part)}%<span class="mini"><i style="width:${Math.min(100, part)}%"></i></span></td><td class="n">${seta(p)}</td></tr>`;
      })
      .join('') + `<tr class="tot"><td>Total</td><td class="n">${milhar(v.total)}</td><td class="n">100%</td><td class="n">${seta(varSemana)}</td></tr>`;

  const linhasQuebra = q
    ? q.setores
        .map((s) => `<tr><td>${esc(nomeSetor(s.setor))}</td><td class="n">${milhar(s.perdido)}</td><td class="n">${milhar(s.vendido)}</td><td class="n" style="color:${(s.pct ?? 0) > 3 ? VERMELHO : '#0B1220'}"><b>${s.pct == null ? '—' : pct(s.pct)}</b></td></tr>`)
        .join('') + `<tr class="tot"><td>Total</td><td class="n">${milhar(q.perdido)}</td><td class="n">${milhar(q.vendido)}</td><td class="n">${pq == null ? '—' : pct(pq)}</td></tr>`
    : '<tr><td colspan="4" class="vazio">Nenhum relatório de perdas importado.</td></tr>';

  const mh = r.metaHoje;
  const fechar =
    m && m.temMes && m.faltaMes > 0 && m.precisaPorDia != null
      ? `<div class="s">Para fechar o mês<br><b>${milhar(m.precisaPorDia)}/dia</b><br>nos ${m.diasRestantes} dias restantes</div>`
      : m && m.temMes && m.faltaMes <= 0
        ? `<div class="s"><b style="color:${VERDE}">Meta do mês<br>já batida!</b></div>`
        : '';
  const caixaHoje = `<div class="hoje"><div><div class="hn">Meta de hoje</div><div class="hv">${mh != null ? milhar(mh) : '<span style="font-size:13px;color:#6B7486">sem meta</span>'}</div></div>${fechar}</div>`;

  const tag = (t: string) => (t === 'folga' ? '' : ` <span class="tag ${t === 'falta' || t === 'atestado' ? 'tr' : 'tg'}">${esc(nomeTipo(t))}</span>`);
  const fora = r.folgas.length
    ? r.folgas.map((s) => `<div class="p"><b>${esc(nomeSetor(s.setor))}</b><span>${s.pessoas.map((p) => esc(p.nome) + tag(p.tipo)).join(', ')}</span></div>`).join('')
    : '<div class="vazio">Ninguém de folga, falta ou atestado lançado para hoje.</div>';

  const logo =
    '<svg width="38" height="38" viewBox="0 0 160 160"><rect width="160" height="160" rx="32" fill="#16294A"/><path d="M42 36 V84 A38 38 0 0 0 118 84 V36" fill="none" stroke="#F4F5F7" stroke-width="20" stroke-linecap="round"/><circle cx="80" cy="74" r="15" fill="#2F7BFF"/></svg>';
  const t0 = nomeDia(r.diaFolgas).replace('-feira', '');
  const tituloHoje = t0.charAt(0).toUpperCase() + t0.slice(1);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório diário ${diaMesCurto(r.diaFolgas)}</title><style>
@page{margin:0}*{box-sizing:border-box}html,body{margin:0}body{font-family:Arial,Helvetica,sans-serif;color:#0B1220;font-size:11px;width:794px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hdr{background:#0E1B2C;color:#fff;padding:18px 26px 16px;display:flex;align-items:center;justify-content:space-between}
.hdr .t{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#8FA3C4}.hdr h1{font-size:21px;margin:3px 0 0;font-weight:700}
.hdr .d{text-align:right;font-size:11px;color:#C9D3E5;line-height:1.5}
.wrap{padding:18px 26px 6px}
.lbl{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#6B7486;font-weight:700;margin:0 0 8px;display:flex;align-items:center;gap:8px}
.lbl:after{content:"";flex:1;height:1px;background:#E3E7EE}
.kpis{display:flex;border:1px solid #E3E7EE;border-radius:8px;margin-bottom:18px}
.k{flex:1;padding:12px 14px;border-left:1px solid #E3E7EE;text-align:left}.k:first-child{border-left:0;flex:1.25}
.k .kn{font-size:9.5px;color:#6B7486;font-weight:700}.k .v{font-size:20px;font-weight:700;margin-top:4px}
.k .s{font-size:9.5px;color:#6B7486;margin-top:4px}
.bar{height:4px;background:#EEF1F5;border-radius:2px;margin-top:7px}.bar i{display:block;height:4px;border-radius:2px}
.cols{display:flex;gap:22px}.esq{flex:1.35}.dir{flex:1}
table{width:100%;border-collapse:collapse}th{font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#6B7486;text-align:left;padding:0 6px 6px;font-weight:700}
td{padding:6px;border-top:1px solid #EEF1F5}.n{text-align:right;white-space:nowrap}.tot td{border-top:1.5px solid #0B1220;font-weight:700}
.mini{display:inline-block;width:46px;height:4px;background:#EEF1F5;border-radius:2px;vertical-align:middle;margin-left:6px}.mini i{display:block;height:4px;background:${AZUL};border-radius:2px}
.hoje{border:1px solid #CFE0FF;background:#F5F9FF;border-radius:8px;padding:12px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}
.hn{font-size:9.5px;color:#3A4A66;font-weight:700}.hv{font-size:20px;font-weight:700;margin-top:2px}.hoje .s{font-size:10px;color:#3A4A66;text-align:right;line-height:1.5}.hoje .s b{font-size:12px;color:#0B1220}
.p{display:flex;gap:8px;padding:6px 0;border-top:1px solid #EEF1F5;page-break-inside:avoid}.p b{width:96px;flex:none}.p span{color:#334155;line-height:1.45}
.tag{font-size:8.5px;font-weight:700;border-radius:3px;padding:1px 5px}.tr{background:#FEECEB;color:${VERMELHO}}.tg{background:#EEF1F5;color:#475569}
.vazio{color:#6B7486;font-size:10px;padding:6px 0}tr{page-break-inside:avoid}
.ft{margin:14px 26px 0;border-top:1px solid #E3E7EE;padding:8px 0 14px;font-size:9px;color:#8A93A5;display:flex;justify-content:space-between}
</style></head><body>
<div class="hdr"><div style="display:flex;align-items:center;gap:14px">${logo}<div><div class="t">ULVA · Relatório diário</div><h1>${esc(tituloHoje)}</h1></div></div>
<div class="d">Loja 327 · Itatiaiuçu<br>Vendas de ${diaV}, ${diaMesCurto(r.diaVenda)}</div></div>
<div class="wrap">
<div class="lbl">Ontem · ${diaV}, ${diaMesCurto(r.diaVenda)}</div>
<div class="kpis">${kVenda}${kMetaDia}${kMes}${kQuebra}</div>
<div class="cols"><div class="esq">
<div class="lbl">Venda por setor</div>
<table><thead><tr><th>Setor</th><th class="n">Venda</th><th class="n">Part.</th><th class="n">vs ${diaMesCurto(v.ant)}</th></tr></thead><tbody>${linhasVenda}</tbody></table>
<div class="lbl" style="margin-top:18px">Quebra por setor${q ? ` · ${diaMesCurto(q.ini)} a ${diaMesCurto(q.fim)}` : ''}</div>
<table><thead><tr><th>Setor</th><th class="n">Quebra</th><th class="n">Venda</th><th class="n">% quebra</th></tr></thead><tbody>${linhasQuebra}</tbody></table>
</div><div class="dir">
<div class="lbl">Hoje · ${diaH}, ${diaMesCurto(r.diaFolgas)}</div>
${caixaHoje}
<div class="lbl">Fora hoje · ${r.totalFora} ${r.totalFora === 1 ? 'colaborador' : 'colaboradores'}</div>
${fora}
</div></div></div>
<div class="ft"><span>${ASSINATURA_ULVA}</span><span>Gerado em ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
</body></html>`;
}

// Altura da página (em pontos, 1px = 0,75pt) para o PDF ter o tamanho do
// conteúdo. Estimativa generosa: melhor sobrar um pouco que quebrar página.
export function alturaRelatorioDiario(r: RelatorioDiario): number {
  const linha = 25;
  const esq = 30 + linha * (r.venda.setores.length + 2) + 40 + linha * ((r.quebras?.setores.length ?? 0) + 2);
  const nomes = r.folgas.reduce((t, s) => t + Math.max(1, Math.ceil(s.pessoas.map((p) => p.nome).join(', ').length / 28)), 0);
  const dir = 30 + 95 + 30 + Math.max(1, nomes) * 21 + r.folgas.length * 8;
  const px = 82 + 30 + 100 + 18 + Math.max(esq, dir) + 60;
  return Math.ceil(px * 0.75) + 12;
}
