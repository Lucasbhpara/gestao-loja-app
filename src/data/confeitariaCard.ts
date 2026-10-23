// =============================================================================
// Imagem da vitrine da Confeitaria (para mandar no WhatsApp), desenhada em
// <canvas> dentro de uma WebView — o mesmo esquema do card de ofertas da loja,
// mas com a logo e as cores da marca dela.
//   gerarCard({ modo: 'produto' | 'cardapio' | 'cobranca', marca, logo, contato, titulo,
//               produtos: [{ nome, sabor, preco, foto, descricao }] }, exportar)
// =============================================================================

export const CARD_CONF_FONTES = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;1,700&family=Quicksand:wght@500;600;700&display=block';

const JS = String.raw`
var T = {
  fundo1: '#FFF6F1', fundo2: '#FBE3EA', rosa: '#D9668A', rosaEsc: '#A9445F', chocolate: '#5A3440',
  creme: '#FFFDFB', bolinha: 'rgba(217,102,138,0.10)', ouro: '#D9A441',
  titulo: '"Playfair Display", Georgia, serif', texto: 'Quicksand, "Trebuchet MS", Arial, sans-serif'
};
function img(src) {
  return new Promise(function (ok) {
    if (!src) return ok(null);
    var i = new Image();
    if (!/^data:/.test(src)) i.crossOrigin = 'anonymous';
    i.onload = function () { ok(i); }; i.onerror = function () { ok(null); };
    i.src = src;
  });
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function cobrir(ctx, im, x, y, w, h) {
  var s = Math.max(w / im.width, h / im.height), iw = im.width * s, ih = im.height * s;
  ctx.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
function linhas(ctx, texto, larg, max) {
  var p = String(texto || '').split(/[ \t\n]+/), out = [], l = '';
  p.forEach(function (w) { var t = l ? l + ' ' + w : w; if (ctx.measureText(t).width > larg && l) { out.push(l); l = w; } else l = t; });
  if (l) out.push(l);
  if (out.length > max) { out = out.slice(0, max); out[max - 1] = out[max - 1].replace(/\s*\S*$/, '') + '…'; }
  return out;
}
function preco(v) { return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ','); }
function fundo(ctx, W, H) {
  var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, T.fundo1); g.addColorStop(1, T.fundo2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = T.bolinha;
  [[80, 90, 70], [W - 60, 160, 110], [W - 140, H - 120, 80], [60, H - 260, 50], [W / 2 + 300, 60, 30]].forEach(function (b) { ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, Math.PI * 2); ctx.fill(); });
  // bolinhas pequenas (granulado)
  var cores = ['#F2B5C6', '#F7D9A8', '#C9E7D6', '#E6C3E9'];
  for (var i = 0; i < 26; i++) { ctx.fillStyle = cores[i % 4]; ctx.beginPath(); ctx.arc((i * 137) % W, (i * 241) % 150 + (i % 2 ? H - 150 : 0), 6, 0, Math.PI * 2); ctx.fill(); }
}
function cabecalho(ctx, W, d, y, logo) {
  if (logo) {
    var r = 96; ctx.save(); ctx.beginPath(); ctx.arc(W / 2, y + r, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(169,68,95,0.25)'; ctx.shadowBlur = 24; ctx.fill(); ctx.shadowBlur = 0; ctx.clip();
    var s = Math.min((r * 2 - 16) / logo.width, (r * 2 - 16) / logo.height);
    ctx.drawImage(logo, W / 2 - logo.width * s / 2, y + r - logo.height * s / 2, logo.width * s, logo.height * s); ctx.restore();
    return y + r * 2 + 18;
  }
  ctx.fillStyle = T.rosaEsc; ctx.font = 'italic 800 64px ' + T.titulo; ctx.textAlign = 'center';
  ctx.fillText(d.marca || '', W / 2, y + 60);
  return y + 90;
}
function rodape(ctx, W, H, d) {
  ctx.fillStyle = T.rosa; rr(ctx, 60, H - 110, W - 120, 72, 36); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 32px ' + T.texto;
  var t = [d.contato ? ('Encomendas: ' + d.contato) : 'Faça sua encomenda!', d.instagram ? ('@' + String(d.instagram).replace(/^@/, '')) : ''].filter(Boolean).join('   •   ');
  ctx.fillText(t, W / 2, H - 62);
}
function produto(ctx, W, H, d, logo) {
  var p = d.produtos[0] || {};
  return img(p.foto).then(function (foto) {
    var y = cabecalho(ctx, W, d, 40, logo);
    var fx = 90, fw = W - 180, fh = 640;
    ctx.save(); ctx.shadowColor = 'rgba(90,52,64,0.22)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#fff'; rr(ctx, fx - 14, y - 14, fw + 28, fh + 28, 46); ctx.fill(); ctx.restore();
    ctx.save(); rr(ctx, fx, y, fw, fh, 36); ctx.clip();
    if (foto) cobrir(ctx, foto, fx, y, fw, fh); else { ctx.fillStyle = '#FCE9EF'; ctx.fillRect(fx, y, fw, fh); ctx.fillStyle = T.rosa; ctx.font = '160px serif'; ctx.textAlign = 'center'; ctx.fillText('🧁', W / 2, y + fh / 2 + 55); }
    ctx.restore();
    var yt = y + fh + 92;
    ctx.textAlign = 'center'; ctx.fillStyle = T.chocolate; ctx.font = '800 64px ' + T.titulo;
    var ls = linhas(ctx, p.nome, W - 160, 2); ls.forEach(function (l, k) { ctx.fillText(l, W / 2, yt + k * 70); }); yt += (ls.length - 1) * 70;
    if (p.sabor) { ctx.font = '600 36px ' + T.texto; ctx.fillStyle = T.rosaEsc; linhas(ctx, p.sabor, W - 200, 1).forEach(function (l) { ctx.fillText(l, W / 2, yt + 54); }); yt += 54; }
    if (p.preco) {
      ctx.font = '800 72px ' + T.titulo; var tw = ctx.measureText(preco(p.preco)).width + 90;
      ctx.fillStyle = T.ouro; rr(ctx, W / 2 - tw / 2, yt + 28, tw, 104, 52); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(preco(p.preco), W / 2, yt + 104);
    }
    rodape(ctx, W, H, d);
  });
}
function cardapio(ctx, W, H, d, logo) {
  var y = cabecalho(ctx, W, d, 36, logo);
  ctx.textAlign = 'center'; ctx.fillStyle = T.rosaEsc; ctx.font = 'italic 800 76px ' + T.titulo;
  ctx.fillText(d.titulo || 'Cardápio', W / 2, y + 66); y += 110;
  var lista = d.produtos.slice(0, 14), livre = H - y - 170, alt = Math.min(108, livre / Math.max(1, lista.length));
  y += Math.max(0, (livre - alt * lista.length - 30) / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.82)'; rr(ctx, 60, y - 10, W - 120, alt * lista.length + 30, 36); ctx.fill();
  lista.forEach(function (p, k) {
    var yy = y + k * alt + alt * 0.62;
    ctx.textAlign = 'left'; ctx.fillStyle = T.chocolate; ctx.font = '700 ' + Math.round(alt * 0.36) + 'px ' + T.texto;
    var nome = p.nome + (p.sabor ? ' · ' + p.sabor : '');
    var ls = linhas(ctx, nome, W - 440, 1); ctx.fillText(ls[0], 100, yy);
    ctx.textAlign = 'right'; ctx.fillStyle = T.rosaEsc; ctx.font = '800 ' + Math.round(alt * 0.4) + 'px ' + T.titulo;
    ctx.fillText(p.preco ? preco(p.preco) : '', W - 100, yy);
    if (k < lista.length - 1) { ctx.strokeStyle = 'rgba(217,102,138,0.25)'; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(100, yy + alt * 0.36); ctx.lineTo(W - 100, yy + alt * 0.36); ctx.stroke(); ctx.setLineDash([]); }
  });
  rodape(ctx, W, H, d);
  return Promise.resolve();
}
// Cobrança (ficha da cliente): altura cresce com a quantidade de itens.
function medirCobranca(d) {
  var m = document.createElement('canvas').getContext('2d'), W = 1080;
  m.font = '500 34px ' + T.texto;
  var hb = 60; (d.mensagem || []).forEach(function (p) { hb += linhas(m, p, W - 200, 6).length * 48 + 16; });
  m.font = '700 34px ' + T.texto;
  var hi = 20; (d.itens || []).forEach(function (i) { hi += linhas(m, i.titulo, W - 460, 2).length * 42 + 52; });
  return 30 + 176 + 140 + hb + 50 + 40 + hi + 30 + 150 + (d.pix ? 134 : 0) + 150;
}
function cobranca(ctx, W, H, d, logo) {
  var y = 30;
  if (logo) {
    var r = 78; ctx.save(); ctx.beginPath(); ctx.arc(W / 2, y + r, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(169,68,95,0.25)'; ctx.shadowBlur = 20; ctx.fill(); ctx.shadowBlur = 0; ctx.clip();
    var sc = Math.min((r * 2 - 14) / logo.width, (r * 2 - 14) / logo.height);
    ctx.drawImage(logo, W / 2 - logo.width * sc / 2, y + r - logo.height * sc / 2, logo.width * sc, logo.height * sc); ctx.restore();
    y += r * 2 + 20;
  }
  ctx.textAlign = 'center'; ctx.fillStyle = T.chocolate; ctx.font = 'italic 800 58px ' + T.titulo; ctx.fillText(d.marca || '', W / 2, y + 52);
  ctx.fillStyle = T.rosaEsc; ctx.font = '700 30px ' + T.texto; ctx.fillText('Resuminho de ' + (d.cliente || '') + '  ·  ' + (d.data || ''), W / 2, y + 100);
  y += 140;
  // bilhete
  ctx.font = '500 34px ' + T.texto;
  var blocos = (d.mensagem || []).map(function (p) { return linhas(ctx, p, W - 200, 6); });
  var hb = 60; blocos.forEach(function (b) { hb += b.length * 48 + 16; });
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; rr(ctx, 60, y, W - 120, hb, 36); ctx.fill();
  ctx.strokeStyle = 'rgba(217,102,138,0.45)'; ctx.setLineDash([10, 10]); ctx.lineWidth = 2; rr(ctx, 60, y, W - 120, hb, 36); ctx.stroke(); ctx.setLineDash([]);
  ctx.textAlign = 'left'; ctx.fillStyle = T.chocolate; var yb = y + 62;
  blocos.forEach(function (b) { b.forEach(function (l) { ctx.fillText(l, 100, yb); yb += 48; }); yb += 16; });
  y += hb + 50;
  // itens
  ctx.fillStyle = T.chocolate; ctx.font = '800 42px ' + T.titulo; ctx.fillText('O que ficou em aberto', 70, y + 10); y += 40;
  ctx.font = '700 34px ' + T.texto;
  var alts = (d.itens || []).map(function (i) { return linhas(ctx, i.titulo, W - 460, 2); });
  var hi = 20; alts.forEach(function (a) { hi += a.length * 42 + 52; });
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; rr(ctx, 60, y, W - 120, hi, 32); ctx.fill();
  var yi = y + 20;
  (d.itens || []).forEach(function (i, k) {
    var ls = alts[k];
    ctx.textAlign = 'left'; ctx.fillStyle = T.chocolate; ctx.font = '700 34px ' + T.texto;
    ls.forEach(function (l, j) { ctx.fillText(l, 100, yi + 42 + j * 42); });
    ctx.fillStyle = '#9B8088'; ctx.font = '600 26px ' + T.texto; ctx.fillText(i.detalhe, 100, yi + ls.length * 42 + 34);
    ctx.textAlign = 'right'; ctx.fillStyle = T.chocolate; ctx.font = '800 38px ' + T.texto; ctx.fillText(i.valor, W - 100, yi + 44);
    yi += ls.length * 42 + 52;
    if (k < d.itens.length - 1) { ctx.strokeStyle = 'rgba(217,102,138,0.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(100, yi - 4); ctx.lineTo(W - 100, yi - 4); ctx.stroke(); }
  });
  y += hi + 30;
  // total
  ctx.fillStyle = T.rosa; rr(ctx, 60, y, W - 120, 120, 40); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '700 34px ' + T.texto; ctx.fillText('Total em aberto', 110, y + 72);
  ctx.textAlign = 'right'; ctx.font = '800 62px ' + T.titulo; ctx.fillText(d.total || '', W - 110, y + 82);
  y += 150;
  if (d.pix) {
    ctx.fillStyle = '#E2F3EA'; rr(ctx, 60, y - 10, W - 120, 124, 32); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#2F7A55'; ctx.font = '700 26px ' + T.texto; ctx.fillText('PIX', W / 2, y + 30);
    ctx.font = '800 30px ' + T.texto; linhas(ctx, d.pix, W - 180, 2).slice(0, 2).forEach(function (l, j) { ctx.fillText(l, W / 2, y + 72 + j * 36); });
  }
  rodape(ctx, W, H, d);
  return Promise.resolve();
}
// Agradecimento de pagamento: 1080×1350, logo grande, "Obrigada, Fulana!" e a frase da marca.
function agradecimento(ctx, W, H, d, logo) {
  var y = d.valor ? 100 : 150;
  if (logo) {
    var r = 120; ctx.save(); ctx.beginPath(); ctx.arc(W / 2, y + r, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(169,68,95,0.25)'; ctx.shadowBlur = 28; ctx.fill(); ctx.shadowBlur = 0; ctx.clip();
    var sc = Math.min((r * 2 - 18) / logo.width, (r * 2 - 18) / logo.height);
    ctx.drawImage(logo, W / 2 - logo.width * sc / 2, y + r - logo.height * sc / 2, logo.width * sc, logo.height * sc); ctx.restore();
    y += r * 2 + 40;
  }
  ctx.textAlign = 'center'; ctx.fillStyle = T.rosaEsc; ctx.font = 'italic 800 92px ' + T.titulo;
  linhas(ctx, d.titulo || 'Obrigada!', W - 140, 2).forEach(function (l, k) { ctx.fillText(l, W / 2, y + 90 + k * 100); y += k ? 100 : 0; });
  y += 150;
  var frases = d.frases || [];
  ctx.font = '700 46px ' + T.texto;
  var blocos = frases.map(function (f) { return linhas(ctx, f, W - 260, 3); });
  var hb = 70; blocos.forEach(function (b) { hb += b.length * 62 + 26; });
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; rr(ctx, 80, y, W - 160, hb, 44); ctx.fill();
  ctx.strokeStyle = 'rgba(217,102,138,0.45)'; ctx.setLineDash([12, 12]); ctx.lineWidth = 3; rr(ctx, 80, y, W - 160, hb, 44); ctx.stroke(); ctx.setLineDash([]);
  var yb = y + 86;
  blocos.forEach(function (b, k) {
    ctx.fillStyle = k === 1 ? T.rosaEsc : T.chocolate; ctx.font = (k === 1 ? 'italic 800 50px ' + T.titulo : '700 46px ' + T.texto);
    b.forEach(function (l) { ctx.fillText(l, W / 2, yb); yb += 62; }); yb += 26;
  });
  y += hb + 60;
  if (d.valor) {
    ctx.font = '800 38px ' + T.texto; var t = '✓ Pagamento recebido · ' + d.valor + (d.data ? ' · ' + d.data : '');
    var tw = Math.min(W - 160, ctx.measureText(t).width + 80);
    ctx.fillStyle = '#E2F3EA'; rr(ctx, W / 2 - tw / 2, y, tw, 84, 42); ctx.fill();
    ctx.fillStyle = '#2F7A55'; ctx.fillText(t, W / 2, y + 56);
  }
  rodape(ctx, W, H, d);
  return Promise.resolve();
}
function desenhar(c, d) {
  var W = 1080, H = 1350, ctx;
  return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { return img(d.logo); }).then(function (logo) {
    if (d.modo === 'cobranca') H = medirCobranca(d);
    c.width = W; c.height = H; ctx = c.getContext('2d');
    fundo(ctx, W, H);
    if (d.modo === 'cobranca') return cobranca(ctx, W, H, d, logo);
    if (d.modo === 'agradecimento') return agradecimento(ctx, W, H, d, logo);
    return d.modo === 'cardapio' ? cardapio(ctx, W, H, d, logo) : produto(ctx, W, H, d, logo);
  });
}
`;

export const CARD_CONF_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${CARD_CONF_FONTES}">
<style>html,body{margin:0;background:transparent;}canvas{width:100%;height:auto;display:block;border-radius:12px;}</style></head>
<body><canvas id="c"></canvas><script>${JS}
function avisar(m){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
window.gerarCard = function (d, exportar) {
  var c = document.getElementById('c');
  desenhar(c, d).then(function () {
    if (exportar) {
      try { avisar({ tipo: 'imagem', base64: c.toDataURL('image/jpeg', 0.92).split(',')[1] }); }
      catch (e) { avisar({ tipo: 'erro', mensagem: String(e && e.message || e) }); }
    } else avisar({ tipo: 'pronto' });
  }).catch(function (e) { avisar({ tipo: 'erro', mensagem: String(e && e.message || e) }); });
  return true;
};
avisar({ tipo: 'carregado' });
</script></body></html>`;
