import { Perda } from '../data/perdasApi';
import { SetorKey } from '../data/employees';
import { compartilharPdf, dataParaNomeArquivo } from './compartilharPdf';

// PDF de Perdas e Desperdício (botão "Compartilhar PDF" da tela de Perdas).
// - Visão "Todos": painel comparando os setores da exportação entre si
//   (valor, % das perdas da loja, % sobre a venda) + top 10 da loja.
// - Setor escolhido: resumo do setor, sortimentos e top 10 produtos por
//   volume (quantidade) e por valor de quebra.
// Layout claro (fundo branco) pra ficar bom no WhatsApp e gastar pouca tinta.

export interface ResumoSetorPdf {
  setor: SetorKey;
  nome: string;
  perdido: number;
  itens: number;
  venda: number | null;
  pctVenda: number | null;
  participacao: number;
  sortimentos: { nome: string; perdido: number; itens: number }[];
}

const AZUL = '#2F7BFF';
const NAVY = '#121B4A';

function esc(t: string): string {
  return String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function reais(v: number): string {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(v: number, casas = 1): string {
  return v.toFixed(casas).replace('.', ',') + '%';
}
function data(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
function qtd(p: Perda): string {
  const n = p.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: p.unidade === 'kg' ? 2 : 0 });
  return `${n} ${p.unidade}`;
}
function corQuebra(v: number | null): { cor: string; fundo: string } {
  if (v === null) return { cor: '#5B6478', fundo: '#EEF1F6' };
  if (v >= 3) return { cor: '#C5392F', fundo: '#FBDEDC' };
  if (v >= 1) return { cor: '#B4650E', fundo: '#FBEBD4' };
  return { cor: '#2C8F5E', fundo: '#DFF3E9' };
}

const CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, Roboto, 'Segoe UI', Arial, sans-serif; color: #1E2433; margin: 0; font-size: 11px; }
  .topo { background: ${NAVY}; color: #fff; border-radius: 14px; padding: 16px 18px; }
  .marca { font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #AFC4FF; font-weight: 700; }
  h1 { font-size: 21px; margin: 4px 0 2px; }
  .sub { color: #D5DCF0; font-size: 11px; }
  .kpis { display: flex; gap: 8px; margin-top: 12px; }
  .kpi { flex: 1; background: #F3F6FB; border-radius: 10px; padding: 10px 12px; }
  .kpi .r { font-size: 9.5px; color: #5B6478; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; }
  .kpi .v { font-size: 16px; font-weight: 800; color: ${NAVY}; margin-top: 3px; }
  h2 { font-size: 13px; color: ${NAVY}; margin: 18px 0 2px; }
  .dica { color: #7A8399; font-size: 10px; margin-bottom: 6px; }
  .linha { padding: 7px 0; border-top: 1px solid #E6EAF2; page-break-inside: avoid; }
  .lt { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .nome { font-weight: 700; font-size: 11.5px; }
  .valor { font-weight: 800; color: ${NAVY}; font-size: 12px; white-space: nowrap; }
  .barra { height: 8px; background: #EEF1F6; border-radius: 99px; overflow: hidden; margin-top: 5px; }
  .barra > div { height: 100%; background: ${AZUL}; border-radius: 99px; }
  .meta { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; color: #5B6478; font-size: 10px; }
  .chip { border-radius: 99px; padding: 2px 8px; font-weight: 800; font-size: 9.5px; }
  .duas { display: flex; gap: 12px; }
  .duas > div { flex: 1; min-width: 0; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9px; color: #7A8399; text-transform: uppercase; letter-spacing: .4px; padding: 4px 4px; border-bottom: 1px solid #D9DFEA; }
  td { padding: 5px 4px; border-bottom: 1px solid #EEF1F6; font-size: 10px; vertical-align: top; }
  td.n { text-align: right; white-space: nowrap; }
  th.n { text-align: right; }
  .pos { color: #9AA3B5; font-weight: 800; width: 14px; }
  .prod { font-weight: 600; }
  .sort { color: #9AA3B5; font-size: 8.5px; text-transform: uppercase; }
  .caixa { border: 1px solid #E6EAF2; border-radius: 12px; padding: 10px 12px; margin-top: 8px; }
  .nota { color: #7A8399; font-size: 9.5px; margin-top: 10px; }
  .rodape { margin-top: 18px; text-align: center; color: #9AA3B5; font-size: 9px; }
`;

function cabecalho(titulo: string, sub: string): string {
  return `<div class="topo"><div class="marca">ULVA · Loja 327 · Quebras e Desperdício</div><h1>${esc(titulo)}</h1><div class="sub">${esc(sub)}</div></div>`;
}

function kpis(itens: { r: string; v: string; cor?: string }[]): string {
  return `<div class="kpis">${itens
    .map((k) => `<div class="kpi"><div class="r">${esc(k.r)}</div><div class="v"${k.cor ? ` style="color:${k.cor}"` : ''}>${esc(k.v)}</div></div>`)
    .join('')}</div>`;
}

function tabelaTop(lista: Perda[], destaque: 'qtd' | 'valor', totalRef: number): string {
  if (!lista.length) return '<div class="dica">Sem produtos.</div>';
  const linhas = lista
    .map((p, i) => {
      const parte = totalRef ? (p.valorPerdido / totalRef) * 100 : 0;
      const q = `<b>${esc(qtd(p))}</b>`;
      const v = `<b>${esc(reais(p.valorPerdido))}</b>`;
      return `<tr><td class="pos">${i + 1}</td><td><div class="prod">${esc(p.produto)}</div><div class="sort">${esc(p.sortimento || '')}</div></td>
        <td class="n">${destaque === 'qtd' ? q : esc(qtd(p))}</td><td class="n">${destaque === 'valor' ? v : esc(reais(p.valorPerdido))}${
        destaque === 'valor' ? `<div class="sort">${pct(parte)} do setor</div>` : ''
      }</td></tr>`;
    })
    .join('');
  return `<table><thead><tr><th></th><th>Produto</th><th class="n">Qtd</th><th class="n">Valor</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

function rodape(): string {
  const agora = new Date();
  return `<div class="rodape">Gerado pelo ULVA em ${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })} · Criado por Lucas Alberto</div>`;
}

export function montarHtmlPerdas(dados: {
  perdas: Perda[]; // todas as perdas do período (todos os setores)
  resumoSetores: ResumoSetorPdf[];
  setor: SetorKey | null; // null = todos os setores
  notaVenda: string;
}): string {
  const { perdas, resumoSetores, setor, notaVenda } = dados;
  const p0 = perdas[0];
  const periodo = p0 ? `${data(p0.periodoInicio)} a ${data(p0.periodoFim)}` : '';

  let corpo = '';
  if (!setor) {
    const total = resumoSetores.reduce((s, r) => s + r.perdido, 0);
    const vendaTotal = resumoSetores.length && resumoSetores.every((r) => r.venda) ? resumoSetores.reduce((s, r) => s + (r.venda ?? 0), 0) : null;
    const pctLoja = vendaTotal ? (total / vendaTotal) * 100 : null;
    const maior = resumoSetores[0];
    const maiorPct = [...resumoSetores].filter((r) => r.pctVenda !== null).sort((a, b) => (b.pctVenda ?? 0) - (a.pctVenda ?? 0))[0];

    corpo += cabecalho('Painel de quebras por setor', `Período ${periodo} · ${perdas.length} produtos com quebra`);
    corpo += kpis([
      { r: 'Quebra total', v: reais(total) },
      { r: 'Venda da loja', v: vendaTotal ? reais(vendaTotal) : '—' },
      { r: 'Quebra sobre a venda', v: pctLoja !== null ? pct(pctLoja, 2) : '—', cor: pctLoja !== null ? corQuebra(pctLoja).cor : undefined },
      { r: 'Setores', v: String(resumoSetores.length) },
    ]);
    if (maior) {
      corpo += `<div class="caixa"><b>Destaques:</b> ${esc(maior.nome)} concentra ${pct(maior.participacao)} das perdas da loja (${esc(reais(maior.perdido))})${
        maiorPct && maiorPct.pctVenda !== null ? `; a maior quebra sobre a venda é de ${esc(maiorPct.nome)} (${pct(maiorPct.pctVenda, 2)})` : ''
      }.</div>`;
    }

    corpo += `<h2>Comparativo dos setores</h2><div class="dica">Barra = participação nas perdas da loja · etiqueta = quebra sobre a venda do setor</div>`;
    resumoSetores.forEach((r) => {
      const c = corQuebra(r.pctVenda);
      corpo += `<div class="linha"><div class="lt"><span class="nome">${esc(r.nome)}</span><span class="valor">${esc(reais(r.perdido))}</span></div>
        <div class="barra"><div style="width:${Math.max(2, r.participacao).toFixed(1)}%"></div></div>
        <div class="meta"><span>${pct(r.participacao)} das perdas · ${r.itens} ${r.itens === 1 ? 'produto' : 'produtos'}${
        r.venda ? ` · venda ${esc(reais(r.venda))}` : ''
      }</span>${r.pctVenda !== null ? `<span class="chip" style="color:${c.cor};background:${c.fundo}">${pct(r.pctVenda, 2)} da venda</span>` : ''}</div></div>`;
    });

    const topValor = [...perdas].sort((a, b) => b.valorPerdido - a.valorPerdido).slice(0, 10);
    const nomeDe = new Map(resumoSetores.map((r) => [r.setor, r.nome]));
    corpo += `<h2>Top 10 produtos da loja · maior valor de quebra</h2>`;
    corpo += `<table><thead><tr><th></th><th>Produto</th><th>Setor</th><th class="n">Qtd</th><th class="n">Valor</th></tr></thead><tbody>${topValor
      .map(
        (p, i) =>
          `<tr><td class="pos">${i + 1}</td><td class="prod">${esc(p.produto)}</td><td>${esc(nomeDe.get(p.setor) ?? p.setor)}</td><td class="n">${esc(
            qtd(p)
          )}</td><td class="n"><b>${esc(reais(p.valorPerdido))}</b></td></tr>`
      )
      .join('')}</tbody></table>`;
  } else {
    const r = resumoSetores.find((x) => x.setor === setor);
    const doSetor = perdas.filter((p) => p.setor === setor);
    const nome = r?.nome ?? setor;
    const perdido = r?.perdido ?? doSetor.reduce((s, p) => s + p.valorPerdido, 0);
    const posicao = resumoSetores.findIndex((x) => x.setor === setor) + 1;

    corpo += cabecalho(`Quebras · ${nome}`, `Período ${periodo} · ${doSetor.length} produtos com quebra`);
    corpo += kpis([
      { r: 'Quebra do setor', v: reais(perdido) },
      { r: 'Venda do setor', v: r?.venda ? reais(r.venda) : '—' },
      { r: 'Quebra sobre a venda', v: r?.pctVenda != null ? pct(r.pctVenda, 2) : '—', cor: r?.pctVenda != null ? corQuebra(r.pctVenda).cor : undefined },
      { r: 'Das perdas da loja', v: r ? pct(r.participacao) : '—' },
    ]);
    if (posicao > 0) {
      corpo += `<div class="caixa">${esc(nome)} é o <b>${posicao}º</b> setor em valor de quebra entre ${resumoSetores.length} setores desta exportação.</div>`;
    }

    const topQtd = [...doSetor].sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);
    const topValor = [...doSetor].sort((a, b) => b.valorPerdido - a.valorPerdido).slice(0, 10);
    corpo += `<div class="duas"><div><h2>Top 10 · maior volume</h2><div class="dica">Quantidade perdida (kg ou unidade)</div>${tabelaTop(
      topQtd,
      'qtd',
      perdido
    )}</div><div><h2>Top 10 · maior valor</h2><div class="dica">Valor da quebra em R$</div>${tabelaTop(topValor, 'valor', perdido)}</div></div>`;

    if (r && r.sortimentos.length) {
      corpo += `<h2>Por sortimento</h2>`;
      r.sortimentos.forEach((so) => {
        const parte = perdido ? (so.perdido / perdido) * 100 : 0;
        corpo += `<div class="linha"><div class="lt"><span class="nome">${esc(so.nome)}</span><span class="valor">${esc(reais(so.perdido))}</span></div>
          <div class="barra"><div style="width:${Math.max(2, parte).toFixed(1)}%"></div></div>
          <div class="meta"><span>${so.itens} ${so.itens === 1 ? 'produto' : 'produtos'} · ${pct(parte)} do setor</span></div></div>`;
      });
    }
  }

  corpo += `<div class="nota">${esc(notaVenda)}</div>`;
  corpo += rodape();
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${corpo}</body></html>`;
}

export async function compartilharPdfPerdas(dados: Parameters<typeof montarHtmlPerdas>[0]): Promise<void> {
  const html = montarHtmlPerdas(dados);
  const r = dados.setor ? dados.resumoSetores.find((x) => x.setor === dados.setor) : null;
  const base = `quebras-${r ? r.nome : 'todos-os-setores'}-${dataParaNomeArquivo(null)}`;
  await compartilharPdf(html, base, 'Compartilhar quebras');
}
