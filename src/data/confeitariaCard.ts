// =============================================================================
// Imagem da vitrine da Confeitaria (para mandar no WhatsApp), desenhada em
// <canvas> dentro de uma WebView — o mesmo esquema do card de ofertas da loja,
// mas com a logo e as cores da marca dela.
//   gerarCard({ modo: 'produto' | 'cardapio', marca, logo, contato, titulo,
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
  var p = String(texto || '').split(/\s+/), out = [], l = '';
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
function desenhar(c, d) {
  var W = 1080, H = 1350; c.width = W; c.height = H;
  var ctx = c.getContext('2d');
  return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { return img(d.logo); }).then(function (logo) {
    fundo(ctx, W, H);
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
