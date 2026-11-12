import { ASSINATURA_ULVA } from './assinatura';

// Visual padrão dos relatórios do ULVA (o mesmo do Relatório diário): faixa
// navy no topo com o logo, rótulos de seção discretos, indicadores numa faixa
// só, fonte Inter e rodapé navy com a assinatura. Usado por Checklist, Visita
// Técnica, Visita do Supervisor e Correção.

export const PDF_VERDE = '#15803D';
export const PDF_VERMELHO = '#B42318';
export const PDF_AZUL = '#2F7BFF';

const esc = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LOGO =
  '<svg width="38" height="38" viewBox="0 0 160 160"><rect width="160" height="160" rx="32" fill="#16294A"/><path d="M42 36 V84 A38 38 0 0 0 118 84 V36" fill="none" stroke="#F4F5F7" stroke-width="20" stroke-linecap="round"/><circle cx="80" cy="74" r="15" fill="#2F7BFF"/></svg>';

const CSS_BASE = `
@page{size:A4;margin:10mm 0 12mm}@page:first{margin-top:0}
*{box-sizing:border-box}html,body{margin:0}
body{font-family:Inter,Roboto,'Helvetica Neue',Arial,sans-serif;color:#0B1220;font-size:11.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hdr{background:#0E1B2C;color:#fff;padding:18px 26px 16px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.hdr .t{font-size:10.5px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:#8FA3C4}
.hdr h1{font-size:21px;margin:3px 0 0;font-weight:700}
.hdr .d{text-align:right;font-size:11px;color:#C9D3E5;line-height:1.5}
.wrap{padding:18px 26px 8px}
.lbl{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#6B7486;font-weight:700;margin:18px 0 8px;display:flex;align-items:center;gap:8px;page-break-after:avoid}
.lbl:after{content:"";flex:1;height:1px;background:#E3E7EE}
.lbl .q{letter-spacing:.02em;text-transform:none;font-weight:600;color:#8A93A5}
.kpis{display:flex;border:1px solid #E3E7EE;border-radius:8px;margin-bottom:6px;page-break-inside:avoid}
.k{flex:1;padding:12px 14px;border-left:1px solid #E3E7EE;text-align:left}.k:first-child{border-left:0}
.k .kn{font-size:9.5px;color:#6B7486;font-weight:700}.k .kv{font-size:20px;font-weight:700;margin-top:4px}.k .ks{font-size:9.5px;color:#6B7486;margin-top:4px}
.info{font-size:11px;color:#475569;margin:0 0 12px;line-height:1.5}.info a{color:#1D4ED8}
.item{border:1px solid #E3E7EE;border-radius:8px;padding:10px 12px;margin-bottom:8px;page-break-inside:avoid}
.item.ruim{border-color:#F3B4AE;background:#FFFBFA}
.item.apagado{border-style:dashed;color:#8A93A5}
.topo{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.texto{font-size:12.5px;font-weight:600;flex:1;line-height:1.4}
.badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:4px;white-space:nowrap}
.b-sim{background:#E7F6EC;color:${PDF_VERDE}}.b-nao{background:#FEECEB;color:${PDF_VERMELHO}}.b-na{background:#EEF1F5;color:#475569}.b-azul{background:#E8F0FF;color:#1D4ED8}
.critico{font-size:8.5px;font-weight:700;color:${PDF_VERMELHO};border:1px solid ${PDF_VERMELHO};border-radius:3px;padding:1px 4px;margin-left:4px}
.det{font-size:11px;color:#475569;margin-top:6px;line-height:1.45}.det b{color:#0B1220}
.base{font-size:9.5px;color:#8A93A5;margin-top:4px}
.fotos{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.foto{width:170px;height:128px;object-fit:cover;border-radius:6px;display:block;border:1px solid #E3E7EE}
.caixa{border:1px solid #CFE0FF;background:#F5F9FF;border-radius:8px;padding:12px 14px;font-size:12px;white-space:pre-wrap;line-height:1.5;page-break-inside:avoid}
.vazio{font-size:11px;color:#6B7486;margin-top:8px}
table.plano{width:100%;border-collapse:collapse;font-size:11px;page-break-inside:auto}
table.plano th{font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#6B7486;text-align:left;padding:0 6px 6px;font-weight:700}
table.plano td{padding:7px 6px;border-top:1px solid #EEF1F5;vertical-align:top}table.plano tr{page-break-inside:avoid}
.pn{width:22px;color:#8A93A5}.pc{white-space:nowrap;text-align:center}
.classif{display:inline-block;font-size:10px;font-weight:700;border-radius:4px;padding:2px 8px;margin-left:8px;vertical-align:4px}
.ndoc{display:inline-block;margin-bottom:3px;padding:2px 8px;border:1px solid #2C4468;border-radius:4px;color:#fff;font-weight:600;letter-spacing:.06em;font-size:10.5px}
.ft{margin-top:18px;background:#0E1B2C;padding:11px 26px;font-size:10px;color:#C9D3E5;display:flex;justify-content:space-between;align-items:center;page-break-inside:avoid}
.ft b{color:#fff;font-weight:600;letter-spacing:.04em}
`;

export function kpi(rotulo: string, valor: string, cor?: string, sub?: string): string {
  return `<div class="k"><div class="kn">${esc(rotulo)}</div><div class="kv"${cor ? ` style="color:${cor}"` : ''}>${valor}</div>${sub ? `<div class="ks">${sub}</div>` : ''}</div>`;
}

export function rotulo(texto: string, qtd?: string): string {
  return `<div class="lbl">${esc(texto)}${qtd ? ` <span class="q">· ${esc(qtd)}</span>` : ''}</div>`;
}

export const corAproveitamento = (pct: number) => (pct >= 90 ? PDF_VERDE : pct >= 75 ? '#3E9B6E' : pct >= 60 ? '#B45309' : PDF_VERMELHO);

export function documentoUlva(o: { tipo: string; titulo: string; direita?: string[]; corpo: string; css?: string; tituloAba?: string; numero?: string | null }): string {
  const agora = new Date();
  const gerado = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(o.tituloAba ?? `${o.tipo} — ${o.titulo}`)}</title>
<link rel="preconnect" href="https://fonts.gstatic.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=block" rel="stylesheet">
<style>${CSS_BASE}${o.css ?? ''}</style></head><body>
<div class="hdr"><div style="display:flex;align-items:center;gap:14px">${LOGO}<div><div class="t">ULVA · ${esc(o.tipo)}</div><h1>${esc(o.titulo)}</h1></div></div>
${o.direita?.length || o.numero ? `<div class="d">${o.numero ? `<span class="ndoc">Nº ${esc(o.numero)}</span><br>` : ''}${(o.direita ?? []).join('<br>')}</div>` : ''}</div>
<div class="wrap">${o.corpo}</div>
<div class="ft"><b>${ASSINATURA_ULVA}</b><span>Gerado em ${gerado}</span></div>
</body></html>`;
}
