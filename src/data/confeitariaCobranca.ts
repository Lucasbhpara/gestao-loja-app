import { Share } from 'react-native';
import { ConfigConf, Venda, reais, dataBr, numeroTexto, mensagemCobranca, hojeIso } from './confeitariaApi';
import { LOGO_CONFEITARIA } from './confeitariaLogo';

// "Compartilhar dívida" da ficha da cliente (Sabores da Pri): uma IMAGEM
// (desenhada no mesmo <canvas> da Vitrine, modo 'cobranca') com a logo, um
// bilhetinho carinhoso, o que ela levou (data, produto, valor), o total e o
// Pix. A mesma mensagem também pode ir como texto no WhatsApp.

export function dadosCobranca(cliente: string, itens: Venda[], cfg: ConfigConf) {
  const total = itens.reduce((a, v) => a + v.quantidade * v.precoUnitario, 0);
  const mensagem = mensagemCobranca(cliente, total, cfg)
    .split('\n')
    .filter((l) => l.trim() && !/te mando o resuminho|o Pix é:/i.test(l))
    .map((l) => l.replace(/R\$ /g, 'R$\u00A0')); // valor não quebra no meio
  return {
    modo: 'cobranca',
    marca: cfg.marca || 'Sabores da Pri',
    logo: cfg.logoUrl || LOGO_CONFEITARIA,
    contato: cfg.whatsapp,
    instagram: cfg.instagram,
    cliente,
    data: dataBr(hojeIso()),
    mensagem,
    itens: itens.map((v) => ({
      titulo: `${numeroTexto(v.quantidade, 3)}× ${v.produto}`,
      detalhe: `${dataBr(v.data)} · ${reais(v.precoUnitario)} cada`,
      valor: reais(v.quantidade * v.precoUnitario),
    })),
    total: reais(total),
    pix: cfg.pix?.trim() || '',
  };
}

// Agradecimento de pagamento (imagem). valor = quanto ela acabou de pagar (opcional).
export function dadosAgradecimento(cliente: string, valor: number | null, cfg: ConfigConf) {
  const nome = (cliente || '').trim().split(/\s+/)[0];
  const marca = cfg.marca || 'Sabores da Pri';
  return {
    modo: 'agradecimento',
    marca,
    logo: cfg.logoUrl || LOGO_CONFEITARIA,
    contato: cfg.whatsapp,
    instagram: cfg.instagram,
    titulo: nome && nome !== 'Sem' ? `Obrigada, ${nome}!` : 'Obrigada!',
    frases: [`A ${marca} agradece o seu pagamento! 💕`, 'Deus abençoe e multiplique!', 'Volte sempre! 🧁'],
    valor: valor && valor > 0 ? reais(valor) : null,
    data: dataBr(hojeIso()),
  };
}

export async function compartilharMensagem(cliente: string, itens: Venda[], cfg: ConfigConf): Promise<void> {
  const total = itens.reduce((a, v) => a + v.quantidade * v.precoUnitario, 0);
  await Share.share({ message: mensagemCobranca(cliente, total, cfg) });
}
