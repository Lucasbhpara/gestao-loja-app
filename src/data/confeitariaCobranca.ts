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
    .filter((l, i, arr) => l.trim() || (i > 0 && arr[i - 1].trim())) // sem linhas em branco seguidas
    .map((l) => (l.trim() ? `<p>${esc(l).replace(/R\$ /g, 'R$&nbsp;')}</p>` : ''))
    .join('');
  const logo = cfg.logoUrl || LOGO_CONFEITARIA;
  const linhas = itens
    .map(
      (v) => `<div class="item"><div class="it"><div class="prod">${esc(numeroTexto(v.quantidade, 3))}× ${esc(v.produto)}</div><div class="det">${esc(
        dataBr(v.data)
      )} · ${esc(reais(v.precoUnitario))} cada</div></div><div class="val">${esc(reais(v.quantidade * v.precoUnitario))}</div></div>`
    )
    .join('');
  const contatos = [cfg.whatsapp && `WhatsApp ${cfg.whatsapp}`, cfg.instagram && cfg.instagram].filter(Boolean).join(' · ');
  const hoje = dataBr(hojeIso());
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: 105mm 186mm; margin: 6mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: -apple-system, Roboto, 'Segoe UI', Arial, sans-serif; color: #4A3036; font-size: 12px; }
  .topo { background: #FCE8EE; border-radius: 18px; padding: 12px; display: flex; align-items: center; gap: 12px; }
  .topo img { width: 64px; height: 64px; border-radius: 50%; border: 3px solid #fff; object-fit: cover; }
  .marca { font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: 700; color: #5A3440; }
  .sub { color: #A9445F; font-weight: 700; font-size: 10.5px; margin-top: 2px; }
  .bilhete { margin-top: 10px; background: #FFF7F3; border: 1px dashed #E9B8C7; border-radius: 16px; padding: 10px 12px; font-size: 12.5px; line-height: 1.45; }
  .bilhete p { margin: 0 0 6px; } .bilhete p:last-child { margin: 0; }
  h2 { font-family: Georgia, serif; color: #5A3440; font-size: 14px; margin: 12px 0 4px; }
  .item { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid #F4D3DD; page-break-inside: avoid; }
  .prod { font-weight: 700; font-size: 12.5px; }
  .det { color: #9B8088; font-size: 10.5px; margin-top: 1px; }
  .val { font-weight: 800; color: #5A3440; font-size: 13px; white-space: nowrap; }
  .total { margin-top: 10px; background: #D9668A; color: #fff; border-radius: 14px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; }
  .total .r { font-size: 12px; font-weight: 700; }
  .total .v { font-size: 21px; font-weight: 800; }
  .pix { margin-top: 8px; background: #E2F3EA; color: #2F7A55; border-radius: 12px; padding: 8px 12px; font-size: 11.5px; line-height: 1.4; }
  .pix b { font-size: 13px; }
  .rodape { margin-top: 12px; text-align: center; color: #9B8088; font-size: 10px; line-height: 1.5; }
  </style></head><body>
  <div class="topo"><img src="${logo}"><div><div class="marca">${esc(cfg.marca || 'Sabores da Pri')}</div><div class="sub">Resuminho de ${esc(cliente)}<br>${esc(hoje)}</div></div></div>
  <div class="bilhete">${msg}</div>
  <h2>O que ficou em aberto</h2>
  ${linhas}
  <div class="total"><span class="r">Total em aberto</span><span class="v">${esc(reais(total))}</span></div>
  ${cfg.pix?.trim() ? `<div class="pix">Pix<br><b>${esc(cfg.pix.trim())}</b></div>` : ''}
  <div class="rodape">${contatos ? esc(contatos) + '<br>' : ''}Feito com amor 💕 ${esc(cfg.marca || 'Sabores da Pri')}</div>
  </body></html>`;
}

export async function compartilharDivida(cliente: string, itens: Venda[], cfg: ConfigConf): Promise<void> {
  // Página do tamanho de uma tela de celular (105 × 186 mm), pra ler sem zoom no WhatsApp.
  await compartilharPdf(montarHtmlCobranca(cliente, itens, cfg), `${cfg.marca || 'sabores-da-pri'}-${cliente}`, 'Compartilhar com a cliente', { width: 298, height: 527 });
}

export async function compartilharMensagem(cliente: string, itens: Venda[], cfg: ConfigConf): Promise<void> {
  const total = itens.reduce((a, v) => a + v.quantidade * v.precoUnitario, 0);
  await Share.share({ message: mensagemCobranca(cliente, total, cfg) });
}
