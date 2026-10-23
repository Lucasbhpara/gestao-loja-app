import { Share } from 'react-native';
import { ConfigConf, Venda, reais, dataBr, numeroTexto, mensagemCobranca, hojeIso } from './confeitariaApi';
import { LOGO_CONFEITARIA } from './confeitariaLogo';
import { compartilharPdf } from '../lib/compartilharPdf';

// "Compartilhar dívida" da ficha da cliente (Sabores da Pri): um PDF delicado
// com a logo, um bilhetinho, o que ela levou (data, produto, valor) e o total.
// A mesma mensagem também pode ir como texto no WhatsApp.

const esc = (t: string) =>
  String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function montarHtmlCobranca(cliente: string, itens: Venda[], cfg: ConfigConf): string {
  const total = itens.reduce((a, v) => a + v.quantidade * v.precoUnitario, 0);
  const msg = mensagemCobranca(cliente, total, cfg)
    .split('\n')
    .filter((l) => !/resuminho em PDF|o Pix é:/i.test(l))
    .map((l) => (l ? esc(l) : ''))
    .join('<br>');
  const logo = cfg.logoUrl || LOGO_CONFEITARIA;
  const linhas = itens
    .map(
      (v) => `<tr><td>${esc(dataBr(v.data))}</td><td>${esc(v.produto)}</td><td class="n">${esc(numeroTexto(v.quantidade, 3))}</td><td class="n">${esc(
        reais(v.precoUnitario)
      )}</td><td class="n"><b>${esc(reais(v.quantidade * v.precoUnitario))}</b></td></tr>`
    )
    .join('');
  const contatos = [cfg.whatsapp && `WhatsApp ${cfg.whatsapp}`, cfg.instagram && cfg.instagram].filter(Boolean).join(' · ');
  const hoje = dataBr(hojeIso());
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: -apple-system, Roboto, 'Segoe UI', Arial, sans-serif; color: #4A3036; font-size: 12px; }
  .topo { background: #FCE8EE; border-radius: 22px; padding: 18px 20px; display: flex; align-items: center; gap: 16px; }
  .topo img { width: 92px; height: 92px; border-radius: 50%; border: 3px solid #fff; object-fit: cover; }
  .marca { font-family: Georgia, 'Times New Roman', serif; font-size: 26px; font-weight: 700; color: #5A3440; }
  .sub { color: #A9445F; font-weight: 700; font-size: 12px; margin-top: 2px; }
  .bilhete { margin-top: 16px; background: #FFF7F3; border: 1px dashed #E9B8C7; border-radius: 18px; padding: 16px 18px; line-height: 1.6; font-size: 13px; }
  h2 { font-family: Georgia, serif; color: #5A3440; font-size: 17px; margin: 20px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; letter-spacing: .5px; text-transform: uppercase; color: #9B8088; padding: 6px 6px; border-bottom: 1.5px solid #F4D3DD; }
  td { padding: 8px 6px; border-bottom: 1px solid #F8E4EA; font-size: 12px; }
  .n { text-align: right; white-space: nowrap; }
  .total { margin-top: 14px; background: #D9668A; color: #fff; border-radius: 16px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; }
  .total .r { font-size: 13px; font-weight: 700; }
  .total .v { font-size: 24px; font-weight: 800; }
  .pix { margin-top: 10px; background: #E2F3EA; color: #2F7A55; border-radius: 14px; padding: 10px 14px; font-weight: 700; }
  .rodape { margin-top: 22px; text-align: center; color: #9B8088; font-size: 10.5px; line-height: 1.6; }
  </style></head><body>
  <div class="topo"><img src="${logo}"><div><div class="marca">${esc(cfg.marca || 'Sabores da Pri')}</div><div class="sub">Resuminho de ${esc(cliente)} · ${esc(hoje)}</div></div></div>
  <div class="bilhete">${msg}</div>
  <h2>O que ficou em aberto</h2>
  <table><thead><tr><th>Data</th><th>Produto</th><th class="n">Qtd</th><th class="n">Unid.</th><th class="n">Valor</th></tr></thead><tbody>${linhas}</tbody></table>
  <div class="total"><span class="r">Total em aberto</span><span class="v">${esc(reais(total))}</span></div>
  ${cfg.pix?.trim() ? `<div class="pix">Pix: ${esc(cfg.pix.trim())}</div>` : ''}
  <div class="rodape">${contatos ? esc(contatos) + '<br>' : ''}Feito com amor 💕 ${esc(cfg.marca || 'Sabores da Pri')}</div>
  </body></html>`;
}

export async function compartilharDivida(cliente: string, itens: Venda[], cfg: ConfigConf): Promise<void> {
  await compartilharPdf(montarHtmlCobranca(cliente, itens, cfg), `${cfg.marca || 'sabores-da-pri'}-${cliente}`, 'Compartilhar com a cliente');
}

export async function compartilharMensagem(cliente: string, itens: Venda[], cfg: ConfigConf): Promise<void> {
  const total = itens.reduce((a, v) => a + v.quantidade * v.precoUnitario, 0);
  await Share.share({ message: mensagemCobranca(cliente, total, cfg) });
}
