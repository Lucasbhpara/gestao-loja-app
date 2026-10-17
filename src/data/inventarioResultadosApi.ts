import { supabase } from '../lib/supabase';

// =============================================================================
// Resultados de inventário — resumo do resultado final por setor e período.
// A importação do PDF é feita no Portal (Indicadores › Resultados de
// inventário); aqui o app só mostra e compartilha (WhatsApp e PDF).
// Tabela: inventario_resultados (supabase/inventario_resultados.sql).
// =============================================================================

export interface ProdutoDestaque {
  codigo: string;
  produto: string;
  valor: number;
  pct?: number | null;
}

export interface ResultadoInventario {
  id: string;
  setor: string;
  loja: string | null;
  nome_loja: string | null;
  supervisor: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  venda: number;
  perda_total: number;
  perda_total_pct: number | null;
  perda_identificada: number | null;
  perda_identificada_pct: number | null;
  perda_nao_identificada: number | null;
  perda_nao_identificada_pct: number | null;
  meta_total_pct: number | null;
  meta_identificada_pct: number | null;
  meta_nao_identificada_pct: number | null;
  quebra_bruta: number;
  sobra_bruta: number;
  n_produtos: number | null;
  n_quebra: number | null;
  n_sobra: number | null;
  n_com_quebra_lancada: number | null;
  destaques: {
    maiores_quebras?: ProdutoDestaque[];
    maiores_sobras?: ProdutoDestaque[];
    vendeu_sem_estoque?: { codigo: string; produto: string; vendas: number; saldo: number }[];
  };
}

const n = (v: unknown) => (v == null ? null : Number(v));

export async function listarResultadosInventario(): Promise<ResultadoInventario[]> {
  const { data, error } = await supabase.from('inventario_resultados').select('*').order('periodo_fim', { ascending: false }).limit(300);
  if (error) {
    if (/inventario_resultados|does not exist|schema cache/i.test(error.message))
      throw new Error('A tabela dos resultados ainda não foi criada. Rode o arquivo supabase/inventario_resultados.sql no Supabase.');
    throw new Error(error.message);
  }
  return ((data ?? []) as any[]).map((x) => ({
    ...x,
    venda: Number(x.venda ?? 0),
    perda_total: Number(x.perda_total ?? 0),
    perda_total_pct: n(x.perda_total_pct),
    perda_identificada: n(x.perda_identificada),
    perda_identificada_pct: n(x.perda_identificada_pct),
    perda_nao_identificada: n(x.perda_nao_identificada),
    perda_nao_identificada_pct: n(x.perda_nao_identificada_pct),
    meta_total_pct: n(x.meta_total_pct),
    meta_identificada_pct: n(x.meta_identificada_pct),
    meta_nao_identificada_pct: n(x.meta_nao_identificada_pct),
    quebra_bruta: Number(x.quebra_bruta ?? 0),
    sobra_bruta: Number(x.sobra_bruta ?? 0),
    destaques: x.destaques ?? {},
  }));
}

// ---------- regras ----------
export const dentroDaMeta = (real: number | null, meta: number | null) => (real == null || meta == null ? null : real <= meta);

export function anteriorDoSetor(r: ResultadoInventario, todos: ResultadoInventario[]): ResultadoInventario | null {
  return todos.filter((x) => x.setor === r.setor && x.periodo_fim < r.periodo_fim).sort((a, b) => b.periodo_fim.localeCompare(a.periodo_fim))[0] ?? null;
}

// quebra e sobra grandes que se anulam no total (esconde troca de código)
export const temCompensacao = (r: ResultadoInventario) => r.quebra_bruta > 1000 && Math.abs(r.sobra_bruta) >= 0.5 * r.quebra_bruta;

export function ultimosPorSetor(todos: ResultadoInventario[]): ResultadoInventario[] {
  const setores = Array.from(new Set(todos.map((x) => x.setor))).sort();
  return setores.map((s) => todos.filter((x) => x.setor === s).sort((a, b) => b.periodo_fim.localeCompare(a.periodo_fim))[0]);
}

// ---------- formatos ----------
export const brl = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
export const dia = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const diaCurto = (iso: string) => dia(iso).slice(0, 5);
const curto = (nome: string) =>
  String(nome || '').replace(/^CARNE (BOV|SUINA)\.\s*/, '').replace(/[\s.](RESF|CONG|KG|IN NATURA)\b[\s\S]*$/, '').trim() || nome;

// ---------- texto para WhatsApp ----------
export function textoResultado(r: ResultadoInventario, todos: ResultadoInventario[]): string {
  const ant = anteriorDoSetor(r, todos);
  const ok = dentroDaMeta(r.perda_total_pct, r.meta_total_pct);
  const it = (L?: ProdutoDestaque[]) => (L ?? []).slice(0, 3).map((p) => `${curto(p.produto)} ${brl(p.valor)}`).join(' · ');
  const l = [
    `📊 *Inventário ${r.setor} — Loja ${r.loja ?? ''}${r.nome_loja ? ' ' + r.nome_loja : ''}*`,
    `Período: ${dia(r.periodo_inicio)} a ${dia(r.periodo_fim)}`,
    '',
    `*Resultado final: ${pct(r.perda_total_pct)} de perda* ${ok == null ? '' : ok ? '✅' : '❌'}${r.meta_total_pct != null ? ` (meta ${pct(r.meta_total_pct)})` : ''}`,
    `• Perda total: ${brl(r.perda_total)}`,
    `• Venda: ${brl(r.venda)}`,
    `• Perda identificada (quebra lançada): ${pct(r.perda_identificada_pct)}${r.meta_identificada_pct != null ? ` (meta ${pct(r.meta_identificada_pct)})` : ''}`,
    `• Perda não identificada: ${pct(r.perda_nao_identificada_pct)}${r.meta_nao_identificada_pct != null ? ` (meta ${pct(r.meta_nao_identificada_pct)})` : ''}`,
  ];
  if (ant) l.push('', `Inventário anterior (${diaCurto(ant.periodo_inicio)}–${diaCurto(ant.periodo_fim)}): ${pct(ant.perda_total_pct)} → agora ${pct(r.perda_total_pct)}`);
  if (temCompensacao(r))
    l.push('', `⚠️ ${brl(r.quebra_bruta)} de quebra em ${r.n_quebra} produtos compensados por ${brl(Math.abs(r.sobra_bruta))} de sobra em ${r.n_sobra} — conferir troca de código.`);
  if (r.destaques.maiores_quebras?.length) l.push('', `🔻 Maiores quebras: ${it(r.destaques.maiores_quebras)}`);
  if (r.destaques.maiores_sobras?.length) l.push(`🔺 Maiores sobras: ${it(r.destaques.maiores_sobras)}`);
  return l.join('\n');
}

// ---------- PDF de 1 página ----------
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function htmlResultado(r: ResultadoInventario, todos: ResultadoInventario[]): string {
  const ant = anteriorDoSetor(r, todos);
  const ok = dentroDaMeta(r.perda_total_pct, r.meta_total_pct);
  const cor = (k: boolean | null) => (k == null ? '#0E1B2C' : k ? '#1E8E5A' : '#C0392B');
  const card = (rot: string, real: number | null, meta: number | null, valor: number | null) =>
    `<div class="c"><div class="r">${rot}</div><div class="v" style="color:${cor(dentroDaMeta(real, meta))}">${pct(real)}</div><div class="l">meta ${pct(meta)} · ${brl(valor)}</div></div>`;
  const tab = (L: ProdutoDestaque[] | undefined, corv: string) =>
    '<table>' + (L ?? []).map((p, i) => `<tr><td class="pos">${i + 1}</td><td>${esc(p.produto)}</td><td class="n" style="color:${corv}"><b>${brl(p.valor)}</b></td></tr>`).join('') + '</table>';
  const sem = (r.destaques.vendeu_sem_estoque ?? []).slice().sort((a, b) => a.saldo - b.saldo).slice(0, 5);
  const logo =
    '<svg width="34" height="34" viewBox="0 0 160 160"><rect width="160" height="160" rx="36" fill="#0E1B2C"/><path d="M42 36 V84 A38 38 0 0 0 118 84 V36" fill="none" stroke="#F4F5F7" stroke-width="20" stroke-linecap="round"/><circle cx="80" cy="74" r="15" fill="#2F7BFF"/></svg>';
  return (
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#0E1B2C;margin:0;font-size:11px}' +
    '.topo{display:flex;align-items:center;gap:12px;border-bottom:3px solid #0E1B2C;padding-bottom:10px;margin-bottom:16px}.topo h1{font-size:20px;margin:0}.topo .s{color:#5B6577;font-size:12px;margin-top:2px}' +
    '.hero{display:flex;justify-content:space-between;align-items:center;border:1px solid #D5DBE5;border-radius:12px;padding:16px 18px;margin-bottom:12px}.hero .big{font-size:44px;font-weight:800;line-height:1}.hero .r{font-size:10.5px;color:#5B6577;text-transform:uppercase;letter-spacing:.05em;font-weight:700}' +
    '.cards{display:flex;gap:10px;margin-bottom:12px}.c{flex:1;border:1px solid #D5DBE5;border-radius:10px;padding:10px 12px}.c .r{font-size:9.5px;color:#5B6577;text-transform:uppercase;font-weight:700;letter-spacing:.04em}.c .v{font-size:20px;font-weight:800;margin-top:3px}.c .l{font-size:10px;color:#5B6577;margin-top:2px}' +
    '.alerta{background:#FDECEA;color:#B42318;border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:11.5px}' +
    'h2{font-size:12.5px;margin:12px 0 4px}.duas{display:flex;gap:16px}.duas>div{flex:1}table{width:100%;border-collapse:collapse}td{padding:4px 5px;border-bottom:1px solid #E4E8EF}.n{text-align:right;white-space:nowrap}.pos{color:#5B6577;width:16px;font-weight:700}' +
    '.rod{margin-top:16px;font-size:9.5px;color:#5B6577;border-top:1px solid #D5DBE5;padding-top:6px}' +
    '</style></head><body>' +
    `<div class="topo">${logo}<div><h1>Resultado do inventário — ${esc(r.setor)}</h1><div class="s">Loja ${esc(r.loja ?? '')} ${esc(r.nome_loja ?? '')} · ${dia(r.periodo_inicio)} a ${dia(r.periodo_fim)}${r.supervisor ? ' · Supervisor ' + esc(r.supervisor) : ''}</div></div></div>` +
    `<div class="hero"><div><div class="r">Resultado final · perda total</div><div class="big" style="color:${cor(ok)}">${pct(r.perda_total_pct)}</div><div style="margin-top:4px;color:#5B6577;">meta ${pct(r.meta_total_pct)}${ok == null ? '' : ok ? ' · dentro da meta' : ' · acima da meta'}</div></div>` +
    `<div style="text-align:right;font-size:12px;line-height:1.7;"><div>Perda total <b>${brl(r.perda_total)}</b></div><div>Venda <b>${brl(r.venda)}</b></div>${ant ? `<div>Anterior (${diaCurto(ant.periodo_inicio)}–${diaCurto(ant.periodo_fim)}): <b>${pct(ant.perda_total_pct)}</b></div>` : ''}</div></div>` +
    '<div class="cards">' +
    card('Perda identificada (quebra)', r.perda_identificada_pct, r.meta_identificada_pct, r.perda_identificada) +
    card('Perda não identificada', r.perda_nao_identificada_pct, r.meta_nao_identificada_pct, r.perda_nao_identificada) +
    `<div class="c"><div class="r">Quebra × sobra</div><div class="v" style="font-size:15px">${brl(r.quebra_bruta)}</div><div class="l">${r.n_quebra ?? '—'} produtos com quebra × ${brl(r.sobra_bruta)} em ${r.n_sobra ?? '—'} com sobra</div></div></div>` +
    (temCompensacao(r)
      ? '<div class="alerta"><b>Atenção:</b> a quebra está sendo compensada pela sobra — o resultado final esconde troca de código entre produtos. Confira os pares entre as maiores quebras e as maiores sobras.</div>'
      : '') +
    `<div class="duas"><div><h2>Maiores quebras</h2>${tab(r.destaques.maiores_quebras, '#C0392B')}</div><div><h2>Maiores sobras</h2>${tab(r.destaques.maiores_sobras, '#B7791F')}</div></div>` +
    (sem.length
      ? '<h2>Saldo negativo (vendeu mais do que tinha)</h2><table>' +
        sem.map((p, i) => `<tr><td class="pos">${i + 1}</td><td>${esc(p.produto)}</td><td class="n">vendeu ${Number(p.vendas).toLocaleString('pt-BR')} · saldo <b>${Number(p.saldo).toLocaleString('pt-BR')}</b></td></tr>`).join('') +
        '</table>'
      : '') +
    `<div class="rod">${r.n_produtos ?? '—'} produtos com divergência · quebra lançada em ${r.n_com_quebra_lancada ?? '—'} · fonte: relatório "Resultado de Inventário" · ULVA · A loja inteira na palma da mão.</div>` +
    '</body></html>'
  );
}
