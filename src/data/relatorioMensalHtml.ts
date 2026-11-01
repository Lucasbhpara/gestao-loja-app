// Relatório mensal — cálculo e HTML (tela do app + PDF para o WhatsApp).
//
// Este arquivo não importa nada: é o MESMO código usado no portal
// (ulva-site/ulva/index.html, bloco "Relatório mensal — gerador"), só que
// lá ele vai convertido para JavaScript. Se mudar algo aqui, leve para lá.
//
// Entrada (DadosRelatorioMensal) = o que o relatorioMensalApi.ts busca:
//  • arq: o que foi subido no portal para o mês (metas, pdv, hora, pagamento)
//  • setores / produtos: RPC vendas_loja_grupos (nível 2 e 6)
//  • perdas: tabela perdas do mês
//  • escala: escala_folgas do mês e do mês seguinte (turnover)
//  • colabs: colaboradores_loja

export type DadosRelatorioMensal = {
  mes: string; // 'AAAA-MM'
  prox: string;
  arq: Record<string, { dados: any; arquivo?: string | null } | undefined>;
  setores: any[];
  produtos: any[];
  perdas: any[];
  escala: any[];
  colabs: any[];
  salario: number;
};

export const RMX_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const RMX_SETOR_CLASSE: Record<string, string> = {
  'PERECIVEIS': 'Frios e Laticínios', 'MERCEARIA LIQUIDA': 'Bebidas', 'ACOUGUE/SALGADOS/DEFUMADO': 'Açougue',
  'BOMBONIERE/MATINAIS': 'Bomboniere e Matinais', 'PERFUMARIA/HIG PESSOAL': 'Higiene e Perfumaria', 'PADARIA FORN/FAB PROPRIA': 'Padaria',
  'MERCEARIA SALGADA': 'Mercearia Salgada', 'MERCEARIA DOCE': 'Mercearia Doce', 'BAZAR': 'Bazar', 'LIMPEZA': 'Limpeza', 'CEREAIS': 'Cereais',
  'HORTIFRUTIGRANJEIROS': 'Hortifrúti', 'MARGEM GARANTIDA': 'Hortifrúti (margem garantida)', 'MARGEM GARANTIDA BAZAR': 'Bazar (margem garantida)',
  'SEM CLASSIFICACAO': 'Sem classificação',
};
const RMX_SETOR_EQUIPE: Record<string, string> = {
  gerencia: 'Gerência', cpd: 'CPD', acougue: 'Açougue', frios: 'Frios', padaria: 'Padaria', flv: 'FLV', mercearia: 'Mercearia',
  'frente-caixa': 'Frente de Caixa', deposito: 'Depósito', prevencao: 'Prevenção', promotores: 'Promotores',
};
// setor da perda → classes de venda (quebra % = perda ÷ venda dessas classes)
const RMX_VENDA_SETOR_PERDAS: Record<string, string[]> = {
  flv: ['HORTIFRUTIGRANJEIROS'],
  padaria: ['PADARIA FORN/FAB PROPRIA'],
  acougue: ['ACOUGUE/SALGADOS/DEFUMADO'],
  frios: ['PERECIVEIS'],
  mercearia: ['MERCEARIA LIQUIDA', 'MERCEARIA SALGADA', 'MERCEARIA DOCE', 'CEREAIS', 'BOMBONIERE/MATINAIS', 'LIMPEZA', 'PERFUMARIA/HIG PESSOAL', 'BAZAR'],
};
const RMX_PAGAMENTO: Record<string, string> = {
  'DINHEIRO': 'Dinheiro', 'CARTAO CREDITO': 'Cartão de crédito', 'CARTAO DEBITO': 'Cartão de débito',
  'CARTEIRA DIGITAL': 'Carteira digital (Pix)', 'CARTAO MESA': 'Cartão Mesa', 'PRESENCA PREMIADA': 'Presença Premiada',
};

export function rmxNomeClasse(c: string): string { return RMX_SETOR_CLASSE[c] || (c ? c.charAt(0) + c.slice(1).toLowerCase() : 'Sem classificação'); }
export function rmxNomeSetor(k: string): string { return RMX_SETOR_EQUIPE[k] || k || 'Sem setor'; }
export function rmxNomePagamento(n: string): string { return RMX_PAGAMENTO[n] || (n ? n.charAt(0) + n.slice(1).toLowerCase() : '—'); }
export function rmxMesTexto(m: string): string { const p = m.split('-').map(Number); return RMX_MESES[p[1] - 1] + ' de ' + p[0]; }
export function rmxMesTitulo(m: string): string { const t = rmxMesTexto(m); return t.charAt(0).toUpperCase() + t.slice(1); }
export function rmxMesSoma(m: string, n: number): string { const p = m.split('-').map(Number); const d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
export function rmxIni(m: string): string { return m + '-01'; }
export function rmxFim(m: string): string { const p = m.split('-').map(Number); return m + '-' + String(new Date(Date.UTC(p[0], p[1], 0)).getUTCDate()).padStart(2, '0'); }
function rmxDiasMes(m: string): number { const p = m.split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate(); }
function rmxVar(a: number, b: number): number | null { return b > 0 ? ((a - b) / b) * 100 : null; }
function rmxEsc(s: any): string { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]); }
function rmxNum(n: any, casas?: number): string { return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 0 }); }
function rmxPct(n: any, casas?: number): string { return n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas == null ? 1 : casas, maximumFractionDigits: casas == null ? 1 : casas }) + '%'; }
function rmxBRL(n: any, casas?: number): string { return 'R$ ' + rmxNum(n, casas); }
function rmxCurto(n: any): string {
  n = Number(n || 0);
  if (Math.abs(n) >= 1e6) return 'R$ ' + (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
  if (Math.abs(n) >= 1e3) return 'R$ ' + (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
  return rmxBRL(n);
}

// ---------- cálculos ----------
export function rmxEquipe(d: DadosRelatorioMensal) {
  const fimM = rmxFim(d.mes);
  const noMes = new Set<string>(), noProx = new Set<string>();
  let faltas = 0, atestados = 0;
  d.escala.forEach((r) => {
    if (!r.colaborador_loja_id) return;
    if (r.data <= fimM) {
      noMes.add(r.colaborador_loja_id);
      if (r.tipo === 'falta') faltas++;
      if (r.tipo === 'atestado') atestados++;
    } else noProx.add(r.colaborador_loja_id);
  });
  const porId: Record<string, any> = {};
  d.colabs.forEach((c) => { porId[c.id] = c; });
  const temProx = noProx.size > 0;
  const saiu = temProx ? Array.from(noMes).filter((id) => !noProx.has(id)).map((id) => porId[id]).filter(Boolean) : [];
  const entrou = temProx ? Array.from(noProx).filter((id) => !noMes.has(id)).map((id) => porId[id]).filter(Boolean) : [];
  const inicio = noMes.size, fim = temProx ? noProx.size : null;
  const media = temProx && fim != null ? (inicio + fim) / 2 : inicio;
  const turnover = temProx && media ? (((entrou.length + saiu.length) / 2) / media) * 100 : null;
  const desligamento = temProx && media ? (saiu.length / media) * 100 : null;
  const confirmados = saiu.filter((c) => c.ativo === false).length;
  const ordenar = (a: any, b: any) => rmxNomeSetor(a.setor).localeCompare(rmxNomeSetor(b.setor)) || String(a.nome).localeCompare(String(b.nome));
  saiu.sort(ordenar); entrou.sort(ordenar);
  const saidasSetor: Record<string, number> = {};
  saiu.forEach((c) => { const n = rmxNomeSetor(c.setor); saidasSetor[n] = (saidasSetor[n] || 0) + 1; });
  return { temProx, inicio, fim, media, saiu, entrou, turnover, desligamento, confirmados, faltas, atestados, saidasSetor };
}

export function rmxCalcular(d: DadosRelatorioMensal) {
  const g = (t: string) => (d.arq[t] ? (d.arq[t] as any).dados : null);
  const metas = g('metas'), pdv = g('pdv'), hora = g('hora'), pag = g('pagamento');
  const vendaUlva = d.setores.reduce((a, s) => a + Number(s.venda || 0), 0);
  const vendaUlvaAnt = d.setores.reduce((a, s) => a + Number(s.venda_ant || 0), 0);
  const pagTotal = pag ? pag.formas.reduce((a: number, f: any) => a + Number(f.total), 0) : 0;
  const venda = metas ? metas.total.venda : (pagTotal || vendaUlva);
  const meta = metas ? metas.total.meta : null;
  const clientes = hora ? hora.horas.reduce((a: number, h: any) => a + Number(h.clientes), 0) : (pdv ? pdv.pdvs.reduce((a: number, p: any) => a + Number(p.clientes), 0) : null);
  const ticket = clientes ? (pagTotal || venda) / clientes : null;
  const perdaTotal = d.perdas.reduce((a, p) => a + Number(p.valor_perdido || 0), 0);
  const vendaPorClasse: Record<string, number> = {};
  d.setores.forEach((s) => { vendaPorClasse[s.chave] = Number(s.venda || 0); });
  const porSetorPerda: Record<string, any> = {};
  d.perdas.forEach((p) => {
    const k = p.setor || 'outros';
    const s = porSetorPerda[k] = porSetorPerda[k] || { setor: k, perda: 0, itens: 0 };
    s.perda += Number(p.valor_perdido || 0); s.itens++;
  });
  const quebraSetores = Object.keys(porSetorPerda).map((k) => {
    const s = porSetorPerda[k];
    const vendaSetor = (RMX_VENDA_SETOR_PERDAS[s.setor] || []).reduce((a, c) => a + (vendaPorClasse[c] || 0), 0);
    return Object.assign(s, { nome: rmxNomeSetor(s.setor), venda: vendaSetor, pct: vendaSetor > 0 ? (s.perda / vendaSetor) * 100 : null });
  }).sort((a, b) => b.perda - a.perda);
  const porProd: Record<string, any> = {};
  d.perdas.forEach((p) => {
    const k = p.produto_cod || p.produto;
    const x = porProd[k] = porProd[k] || { produto: p.produto, setor: p.setor, perda: 0, qtd: 0, un: p.unidade };
    x.perda += Number(p.valor_perdido || 0); x.qtd += Number(p.quantidade || 0);
  });
  const topPerdas = Object.keys(porProd).map((k) => porProd[k]).sort((a, b) => b.perda - a.perda).slice(0, 10);
  const vendidos = d.produtos.filter((p) => Number(p.venda) > 0).sort((a, b) => Number(b.venda) - Number(a.venda));
  const totalProdutos = d.produtos.reduce((a, p) => a + Number(p.venda || 0), 0);
  return { metas, pdv, hora, pag, venda, meta, vendaUlva, vendaUlvaAnt, clientes, ticket, pagTotal, perdaTotal, quebraSetores, topPerdas,
    topProdutos: vendidos.slice(0, 15), totalProdutos, equipe: rmxEquipe(d) };
}

// ---------- HTML (tela do app e PDF) ----------
const RMX_LOGO = '<svg width="34" height="34" viewBox="0 0 160 160"><rect width="160" height="160" rx="36" fill="#0E1B2C"/><path d="M42 36 V84 A38 38 0 0 0 118 84 V36" fill="none" stroke="#F4F5F7" stroke-width="20" stroke-linecap="round"/><circle cx="80" cy="74" r="15" fill="#2F7BFF"/></svg>';

function rmxSeloMeta(p: number | null): string {
  if (p == null) return '';
  return p >= 100 ? '<span class="st bom">✓ ' + rmxPct(p) + '</span>' : '<span class="st ' + (p >= 95 ? 'at' : 'ruim') + '">▼ ' + rmxPct(p) + '</span>';
}
function rmxSeloQuebra(p: number | null): string {
  if (p == null) return '';
  const c = p >= 3 ? 'ruim' : p >= 1 ? 'at' : 'bom';
  return '<span class="st ' + c + '">' + (c === 'bom' ? '✓ ' : '▲ ') + rmxPct(p, 2) + '</span>';
}
function rmxLinha(nome: string, sub: string, pct: number, valor: string, valorSub: string, extra?: string, fraca?: boolean): string {
  return '<div class="ln"><div class="ln-t"><div class="nm">' + nome + (sub ? '<small>' + sub + '</small>' : '') + '</div>' +
    '<div class="vl">' + valor + (valorSub ? '<small>' + valorSub + '</small>' : '') + '</div></div>' +
    '<div class="tr"><div class="br' + (fraca ? ' fr' : '') + '" style="width:' + Math.max(0.5, Math.min(100, pct)).toFixed(1) + '%"></div>' + (extra || '') + '</div></div>';
}

export function rmxDocumentoHtml(d: DadosRelatorioMensal, opcoes?: { paraPdf?: boolean; loja?: string }): string {
  const c = rmxCalcular(d), e = c.equipe;
  const paraPdf = !!(opcoes && opcoes.paraPdf);
  const loja = (opcoes && opcoes.loja) || 'Loja 327 · Itatiaiuçu';
  const mesNome = RMX_MESES[Number(d.mes.slice(5)) - 1], proxNome = RMX_MESES[Number(d.prox.slice(5)) - 1];
  const vazio = (t: string) => '<div class="vz">' + t + '</div>';
  const card = (titulo: string, sub: string, corpo: string) => '<section class="cd"><h2>' + titulo + '</h2>' + (sub ? '<div class="sb">' + sub + '</div>' : '') + corpo + '</section>';
  const dica = (t: string) => '<div class="in">' + t + '</div>';

  // KPIs
  const ating = c.meta ? (c.venda / c.meta) * 100 : null;
  const varMes = rmxVar(c.vendaUlva, c.vendaUlvaAnt);
  const k = (r: string, v: string, l: string) => '<div class="kp"><div class="r">' + r + '</div><div class="v">' + v + '</div><div class="l">' + l + '</div></div>';
  const kpis = '<div class="kps">' +
    k('Venda do mês', rmxCurto(c.venda), varMes != null ? '<b class="' + (varMes >= 0 ? 'up' : 'dn') + '">' + (varMes >= 0 ? '▲ +' : '▼ ') + rmxPct(varMes) + '</b> vs mês anterior' : rmxBRL(c.venda)) +
    k('Meta', ating != null ? rmxPct(ating) : '—', c.meta ? (c.venda >= c.meta ? '<span class="st bom">✓ Batida</span> +' + rmxBRL(c.venda - c.meta) : '<span class="st ' + ((ating || 0) >= 95 ? 'at' : 'ruim') + '">▼ Abaixo</span> faltaram ' + rmxBRL(c.meta - c.venda)) : 'sem PDF de metas') +
    k('Clientes', c.clientes ? rmxNum(c.clientes) : '—', c.clientes ? rmxNum(c.clientes / rmxDiasMes(d.mes)) + ' por dia, em média' : 'sem venda por hora') +
    k('Ticket médio', c.ticket ? rmxBRL(c.ticket, 2) : '—', 'venda ÷ clientes') +
    k('Quebras', d.perdas.length ? rmxCurto(c.perdaTotal) : '—', d.perdas.length && c.vendaUlva ? rmxPct((c.perdaTotal / c.vendaUlva) * 100, 2) + ' da venda' : 'sem quebras no mês') +
    k('Turnover', e.turnover != null ? rmxPct(e.turnover) : '—', e.temProx ? e.entrou.length + ' entradas · ' + e.saiu.length + ' saídas' : 'falta a escala de ' + proxNome) +
  '</div>';

  // Meta × realizado
  let blocoMetas: string;
  if (!c.metas) blocoMetas = card('Meta × realizado por setor', '', vazio('Suba o PDF “Meta Venda Loja” do mês no portal (Relatório mensal → Subir arquivos do mês).'));
  else {
    const margem: Record<string, number | null> = {};
    d.setores.forEach((s) => { margem[s.chave] = s.margem != null ? Number(s.margem) : null; });
    const linhas = c.metas.setores.filter((s: any) => s.meta > 0 || s.venda > 0).map((s: any) => Object.assign({}, s, { pct: s.meta > 0 ? (s.venda / s.meta) * 100 : null }))
      .sort((a: any, b: any) => b.venda - a.venda);
    const max = Math.max.apply(null, linhas.map((s: any) => Math.max(s.venda, s.meta)).concat([1]));
    const bateram = linhas.filter((s: any) => s.pct != null && s.pct >= 100);
    const corpo = linhas.map((s: any) => {
      const mr = margem[s.nome];
      return rmxLinha(rmxEsc(rmxNomeClasse(s.nome)), mr != null && s.margem_obj > 0 ? 'margem ' + rmxPct(mr) + ' · obj. ' + rmxPct(s.margem_obj, 0) : '',
        (s.venda / max) * 100, '<b>' + rmxBRL(s.venda) + '</b> ' + rmxSeloMeta(s.pct),
        s.meta > 0 ? 'meta ' + rmxBRL(s.meta) + ' · ' + (s.venda >= s.meta ? '+' : '−') + rmxBRL(Math.abs(s.venda - s.meta)) : '',
        s.meta > 0 ? '<div class="mk" style="left:' + ((s.meta / max) * 100).toFixed(1) + '%"></div>' : '', s.pct != null && s.pct < 100);
    }).join('');
    const melhores = bateram.slice().sort((a: any, b: any) => (b.venda - b.meta) - (a.venda - a.meta)).slice(0, 2);
    const piores = linhas.filter((s: any) => s.pct != null && s.pct < 100).sort((a: any, b: any) => (a.venda - a.meta) - (b.venda - b.meta)).slice(0, 2);
    const txt = (melhores.length ? 'Mais acima da meta: ' + melhores.map((s: any) => '<b>' + rmxEsc(rmxNomeClasse(s.nome)) + '</b> (+' + rmxBRL(s.venda - s.meta) + ')').join(' e ') + '. ' : '') +
      (piores.length ? 'Mais abaixo: ' + piores.map((s: any) => '<b>' + rmxEsc(rmxNomeClasse(s.nome)) + '</b> (−' + rmxBRL(s.meta - s.venda) + ')').join(' e ') + '.' : '');
    blocoMetas = card('Meta × realizado por setor', bateram.length + ' de ' + linhas.filter((s: any) => s.meta > 0).length + ' setores bateram a meta. Barra = venda · tracinho = meta · barra clara = abaixo.', corpo + (txt ? dica(txt) : ''));
  }

  // Hora
  let blocoHora: string;
  if (!c.hora) blocoHora = card('Vendas por hora', '', vazio('Suba a planilha de venda por hora no portal.'));
  else {
    const horas = c.hora.horas.filter((h: any) => Number(h.total) > 1000 || Number(h.clientes) > 20);
    const max = Math.max.apply(null, horas.map((h: any) => Number(h.total)).concat([1]));
    const pico = horas.reduce((a: any, h: any) => (Number(h.total) > Number(a.total) ? h : a), horas[0]);
    const picoCli = horas.reduce((a: any, h: any) => (Number(h.clientes) > Number(a.clientes) ? h : a), horas[0]);
    const meio = horas.filter((h: any) => h.hora >= '10:00' && h.hora <= '17:00');
    const vale = meio.length ? meio.reduce((a: any, h: any) => (Number(h.total) < Number(a.total) ? h : a), meio[0]) : null;
    const corpo = horas.map((h: any) => {
      const t = Number(h.total), cl = Number(h.clientes);
      return '<div class="hr' + (h === pico ? ' pk' : '') + '"><span class="hh">' + String(h.hora).slice(0, 2) + 'h</span><div class="tr"><div class="br" style="width:' + ((t / max) * 100).toFixed(1) + '%"></div></div>' +
        '<span class="hv"><b>' + rmxCurto(t) + '</b><small>' + rmxNum(cl) + ' cli · ' + rmxBRL(cl ? t / cl : 0, 0) + '</small></span></div>';
    }).join('');
    blocoHora = card('Vendas por hora', 'Soma do mês em cada faixa de horário, com clientes e ticket.', corpo +
      dica('Pico às <b>' + String(pico.hora).slice(0, 2) + 'h</b>' + (picoCli !== pico ? '; mais clientes às <b>' + String(picoCli.hora).slice(0, 2) + 'h</b>' : ' (também o maior fluxo de clientes)') + '.' +
        (vale ? ' Vale do dia às <b>' + String(vale.hora).slice(0, 2) + 'h</b> — bom para reposição e intervalos.' : '')));
  }

  // Pagamento
  let blocoPag: string;
  if (!c.pag) blocoPag = card('Formas de pagamento', '', vazio('Suba a planilha de venda por finalizadora no portal.'));
  else {
    const total = c.pagTotal || 1;
    const formas = c.pag.formas.slice().sort((a: any, b: any) => b.total - a.total);
    const max = formas.length ? formas[0].total : 1;
    const corpo = formas.map((f: any) => rmxLinha(rmxEsc(rmxNomePagamento(f.nome)), rmxNum(f.qtd) + ' pagamentos · média ' + rmxBRL(f.qtd ? f.total / f.qtd : 0, 2),
      (f.total / max) * 100, '<b>' + rmxPct((f.total / total) * 100) + '</b>', rmxBRL(f.total))).join('');
    const cartao = formas.filter((f: any) => /CARTAO (CREDITO|DEBITO)/.test(f.nome)).reduce((a: number, f: any) => a + f.total, 0);
    blocoPag = card('Formas de pagamento', 'Participação no valor recebido.', corpo +
      dica('<b>' + rmxEsc(rmxNomePagamento(formas[0].nome)) + '</b> lidera com ' + rmxPct((formas[0].total / total) * 100) + '. Crédito + débito: <b>' + rmxPct((cartao / total) * 100) + '</b>.'));
  }

  // PDV
  let blocoPdv: string;
  if (!c.pdv) blocoPdv = card('Venda por PDV', '', vazio('Suba a planilha de venda por PDV no portal.'));
  else {
    const lista = c.pdv.pdvs.slice().sort((a: any, b: any) => b.total - a.total);
    const max = lista.length ? lista[0].total : 1;
    const tv = lista.reduce((a: number, p: any) => a + p.total, 0), tc = lista.reduce((a: number, p: any) => a + p.clientes, 0);
    const tg = tc ? tv / tc : 0;
    const linhas = lista.map((p: any, i: number) => {
      const tk = p.clientes ? p.total / p.clientes : 0;
      return '<tr><td class="ps">' + (i + 1) + '</td><td><b>PDV ' + p.pdv + '</b><div class="mi"><div style="width:' + ((p.total / max) * 100).toFixed(1) + '%"></div></div></td>' +
        '<td class="n"><b>' + rmxBRL(p.total) + '</b><small>' + rmxPct((p.total / tv) * 100) + '</small></td><td class="n">' + rmxNum(p.clientes) + '</td>' +
        '<td class="n">' + rmxBRL(tk, 2) + (tk < tg * 0.7 ? '<small>compra rápida</small>' : '') + '</td></tr>';
    }).join('');
    const maisCli = lista.slice().sort((a: any, b: any) => b.clientes - a.clientes)[0];
    blocoPdv = card('Venda por PDV', 'Ranking dos caixas. Ticket bem abaixo da média = caixa rápido/preferencial.',
      '<table><thead><tr><th></th><th>Caixa</th><th class="n">Venda</th><th class="n">Clientes</th><th class="n">Ticket</th></tr></thead><tbody>' + linhas + '</tbody></table>' +
      dica('Maior venda: <b>PDV ' + lista[0].pdv + '</b>. Mais clientes: <b>PDV ' + maisCli.pdv + '</b> (' + rmxNum(maisCli.clientes) + '). Menor movimento: <b>PDV ' + lista[lista.length - 1].pdv + '</b>.'));
  }

  // Produtos
  let blocoProd: string;
  if (!c.topProdutos.length) blocoProd = card('Produtos mais vendidos', '', vazio('Sem vendas do mês no ULVA (Importar vendas do Falcon).'));
  else {
    const max = Number(c.topProdutos[0].venda);
    const soma = c.topProdutos.reduce((a: number, p: any) => a + Number(p.venda), 0);
    const linhas = c.topProdutos.map((p: any, i: number) => {
      const v = rmxVar(Number(p.venda), Number(p.venda_ant));
      return '<tr><td class="ps">' + (i + 1) + '</td><td><b>' + rmxEsc(p.nome) + '</b><small>cód. ' + rmxEsc(p.chave) + (p.margem != null ? ' · margem ' + rmxPct(Number(p.margem)) : '') + '</small><div class="mi"><div style="width:' + ((Number(p.venda) / max) * 100).toFixed(1) + '%"></div></div></td>' +
        '<td class="n"><b>' + rmxBRL(p.venda) + '</b><small class="' + (v == null ? '' : v >= 0 ? 'up' : 'dn') + '">' + (v == null ? 'novo' : (v >= 0 ? '▲ +' : '▼ ') + rmxPct(v)) + '</small></td></tr>';
    }).join('');
    blocoProd = card('Produtos mais vendidos', 'Top 15 em valor, com variação contra o mês anterior. Somam ' + rmxPct(c.totalProdutos ? (soma / c.totalProdutos) * 100 : null) + ' da venda.',
      '<table><thead><tr><th></th><th>Produto</th><th class="n">Venda</th></tr></thead><tbody>' + linhas + '</tbody></table>');
  }

  // Quebras
  let blocoQuebra: string;
  if (!d.perdas.length) blocoQuebra = card('Quebras do mês', '', vazio('Ainda não há perdas importadas para este mês.'));
  else {
    const max = c.quebraSetores.length ? c.quebraSetores[0].perda : 1;
    const setores = c.quebraSetores.map((s: any) => rmxLinha(rmxEsc(s.nome), s.itens + ' produtos', (s.perda / max) * 100, '<b>' + rmxBRL(s.perda) + '</b> ' + rmxSeloQuebra(s.pct), s.venda ? 'sobre ' + rmxBRL(s.venda) + ' vendidos' : '')).join('');
    const prods = c.topPerdas.map((p: any, i: number) => '<tr><td class="ps">' + (i + 1) + '</td><td><b>' + rmxEsc(p.produto) + '</b><small>' + rmxEsc(rmxNomeSetor(p.setor)) + ' · ' + rmxNum(p.qtd, p.un && /kg/i.test(p.un) ? 1 : 0) + ' ' + rmxEsc(String(p.un || '').toLowerCase()) + '</small></td><td class="n"><b>' + rmxBRL(p.perda, 2) + '</b></td></tr>').join('');
    const pior = c.quebraSetores[0];
    blocoQuebra = card('Quebras do mês', 'Total de ' + rmxBRL(c.perdaTotal, 2) + '. Selo = quebra % (verde até 1%, laranja até 3%, vermelho acima).', setores +
      dica('<b>' + rmxEsc(pior.nome) + '</b> concentra ' + rmxPct(c.perdaTotal ? (pior.perda / c.perdaTotal) * 100 : null) + ' da quebra da loja.') +
      '<h3>Produtos que mais perderam</h3><table><tbody>' + prods + '</tbody></table>');
  }

  // Equipe
  let blocoEquipe: string;
  if (!e.inicio) blocoEquipe = card('Equipe e turnover', '', vazio('Não há escala de folgas deste mês no ULVA.'));
  else {
    const sal = d.salario;
    const q = (r: string, v: string, l: string) => '<div class="eq"><div class="r">' + r + '</div><div class="v">' + v + '</div><div class="l">' + l + '</div></div>';
    const dias = e.faltas + e.atestados;
    const quadro = e.fim != null ? e.fim : e.inicio;
    const nomes = (arr: any[]) => arr.map((x) => rmxEsc(x.nome) + ' <span>(' + rmxEsc(rmxNomeSetor(x.setor)) + ')</span>').join(', ');
    const porSetor = Object.keys(e.saidasSetor).map((n) => [n, e.saidasSetor[n]] as [string, number]).sort((a, b) => b[1] - a[1]);
    blocoEquipe = card('Equipe e turnover', 'Escala de folgas/DSR de ' + mesNome + ' comparada com a de ' + proxNome + ': quem sai da escala conta como saída; quem aparece só em ' + proxNome + ', como entrada.',
      '<div class="eqs">' +
        q('Escala de ' + mesNome, rmxNum(e.inicio), 'colaboradores') +
        (e.temProx ? q('Escala de ' + proxNome, rmxNum(e.fim), ((e.fim as number) - e.inicio >= 0 ? '+' : '') + ((e.fim as number) - e.inicio) + ' no quadro') +
          q('Entradas', rmxNum(e.entrou.length), 'novos na escala') + q('Saídas', rmxNum(e.saiu.length), e.confirmados + ' inativos no cadastro') +
          q('Turnover', rmxPct(e.turnover), '(entradas + saídas) ÷ 2 ÷ quadro médio') + q('Desligamento', rmxPct(e.desligamento), 'saídas ÷ quadro médio') : q('Turnover', '—', 'falta a escala de ' + proxNome)) +
        q('Folha estimada', rmxCurto(quadro * sal), quadro + ' × ' + rmxBRL(sal)) +
        (e.temProx ? q('Custo do turnover', rmxCurto(e.saiu.length * sal), '≈ 1 salário por desligamento') : '') +
        q('Faltas · atestados', rmxNum(e.faltas) + ' · ' + rmxNum(e.atestados), dias + ' dias ≈ ' + rmxBRL((dias * sal) / 30)) +
      '</div>' +
      (porSetor.length ? dica('Saídas por setor: ' + porSetor.map((x) => '<b>' + rmxEsc(x[0]) + '</b> ' + x[1]).join(' · ') + '.') : '') +
      (e.saiu.length ? '<p class="nm-l"><b>Saíram:</b> ' + nomes(e.saiu) + '</p>' : '') +
      (e.entrou.length ? '<p class="nm-l"><b>Entraram:</b> ' + nomes(e.entrou) + '</p>' : ''));
  }

  const css = `
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;color:#0E1B2C;background:${paraPdf ? '#fff' : '#F3F5F8'};font-size:13px;-webkit-text-size-adjust:100%}
.pg{max-width:880px;margin:0 auto;padding:${paraPdf ? '0' : '14px 12px 40px'}}
.tp{display:flex;align-items:center;gap:12px;border-bottom:3px solid #0E1B2C;padding-bottom:10px;margin-bottom:14px}
.tp h1{font-size:19px;margin:0;line-height:1.15}.tp .s{color:#5B6577;font-size:11.5px;margin-top:3px}
.kps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}
@media (min-width:600px){.kps{grid-template-columns:repeat(3,minmax(0,1fr))}}
.kp,.cd{background:#fff;border:1px solid #DDE3EC;border-radius:12px}
.kp{padding:10px 12px}.kp .r{font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7D8898}
.kp .v{font-size:21px;font-weight:800;margin:4px 0 3px;white-space:nowrap}.kp .l{font-size:10.5px;color:#4F5B6B;line-height:1.35}
.cd{padding:12px 13px;margin-bottom:12px}.cd h2{break-after:avoid;page-break-after:avoid}.ln,.hr,tr,.eq,.kp,.in,.nm-l{break-inside:avoid;page-break-inside:avoid}
.duas{display:grid;grid-template-columns:minmax(0,1fr);gap:0 12px}@media (min-width:700px){.duas{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}
.cd h2{font-size:15px;margin:0 0 2px}.cd h3{font-size:12.5px;margin:12px 0 2px}.sb{font-size:11px;color:#4F5B6B;margin-bottom:8px;line-height:1.4}
.ln{padding:6px 0;border-bottom:1px solid #EEF1F5}.ln:last-of-type{border-bottom:0}
.ln-t{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:4px}
.nm{font-weight:700;font-size:12.5px;line-height:1.25}.nm small,.vl small,td small{display:block;font-weight:500;font-size:10px;color:#7D8898;margin-top:1px}
.vl{text-align:right;white-space:nowrap;font-size:12.5px}
.tr{position:relative;height:8px;background:#EEF2F7;border-radius:4px}.br{height:100%;background:#2F7BFF;border-radius:4px}.br.fr{background:#9DBFFF}
.mk{position:absolute;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:#0E1B2C;border-radius:1px}
.st{display:inline-block;font-size:10px;font-weight:800;padding:1px 6px;border-radius:999px;white-space:nowrap}
.st.bom{background:#E3F5EC;color:#1E8E5A}.st.at{background:#FFF1DB;color:#A86200}.st.ruim{background:#FDE8E6;color:#D23C33}
.up{color:#1E8E5A!important;font-weight:800}.dn{color:#D23C33!important;font-weight:800}
.in{background:#E8F0FF;border-radius:9px;padding:8px 10px;font-size:11.5px;line-height:1.45;margin-top:8px}
.vz{font-size:12px;color:#7D8898;padding:6px 0}
.hr{display:grid;grid-template-columns:30px 1fr 112px;gap:8px;align-items:center;padding:3px 0}
.hr .hh{font-size:11px;color:#7D8898;font-weight:700}.hr .hv{text-align:right;font-size:11.5px;white-space:nowrap}.hr .hv small{display:block;font-size:9.5px;color:#7D8898}
.hr .br{background:#9DBFFF}.hr.pk .br{background:#2F7BFF}.hr.pk .hh{color:#0E1B2C}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#7D8898;padding:4px 5px;border-bottom:1px solid #DDE3EC}
td{padding:6px 5px;border-bottom:1px solid #EEF1F5;font-size:12px;vertical-align:top}tr:last-child td{border-bottom:0}
.n{text-align:right;white-space:nowrap}.ps{color:#7D8898;font-weight:800;width:20px}
.mi{height:4px;background:#EEF2F7;border-radius:2px;margin-top:4px}.mi div{height:100%;background:#2F7BFF;border-radius:2px}
.eqs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}@media (min-width:600px){.eqs{grid-template-columns:repeat(3,minmax(0,1fr))}}
.eq{background:#F7F9FC;border:1px solid #DDE3EC;border-radius:9px;padding:8px 10px}.eq .r{font-size:9.5px;font-weight:800;color:#7D8898;text-transform:uppercase;letter-spacing:.05em}
.eq .v{font-size:18px;font-weight:800;margin-top:2px}.eq .l{font-size:10px;color:#4F5B6B;margin-top:1px}
.nm-l{font-size:11.5px;line-height:1.55;margin:8px 0 0}.nm-l span{color:#7D8898}
.rd{font-size:9.5px;color:#7D8898;border-top:1px solid #DDE3EC;padding-top:6px;margin-top:4px;line-height:1.45}
@page{size:A4;margin:9mm}
@media print{body{background:#fff}.pg{padding:0}.duas{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.kps{grid-template-columns:repeat(3,minmax(0,1fr))}.eqs{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Relatório mensal — ' + rmxMesTitulo(d.mes) + '</title><style>' + css + '</style></head><body><div class="pg">' +
    '<div class="tp">' + RMX_LOGO + '<div><h1>Relatório mensal — ' + rmxMesTitulo(d.mes) + '</h1><div class="s">' + rmxEsc(loja) + ' · gerado em ' + new Date().toLocaleString('pt-BR') + '</div></div></div>' +
    kpis + blocoMetas + '<div class="duas">' + blocoHora + blocoPag + '</div><div class="duas">' + blocoPdv + blocoProd + '</div>' + blocoQuebra + blocoEquipe +
    '<div class="rd">Venda, meta e % por setor: PDF “Meta Venda Loja”. Clientes e ticket: venda por hora (1 cupom = 1 cliente). Produtos, margem e comparação com o mês anterior: vendas do Falcon no ULVA. Quebra % = perda do setor ÷ venda do setor. Custos de equipe estimados com salário médio de ' + rmxBRL(d.salario) + '.</div>' +
    '</div></body></html>';
}
