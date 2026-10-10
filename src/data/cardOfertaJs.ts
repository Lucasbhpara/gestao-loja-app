// =============================================================================
// Desenho do card de oferta (imagem pro WhatsApp), em <canvas>, no padrão da
// arte da loja: fundo azul-claro, selo "Ofertas Exclusivas Minas Gerais" no
// canto, logo no outro, nome do produto em azul e o preço grande em vermelho.
//
// O MESMO código roda no app (dentro de uma WebView — ver OfertasScreen) e no
// Portal (copiado pra dentro do portal-admin.html). Por isso é uma string de
// JavaScript puro, sem React.
//
//   desenharCardOferta(canvas, {
//     modo: 'unico' | 'lamina',
//     titulo,            // só na lâmina (ex.: "OFERTAS DA SEMANA")
//     validade,          // texto do rodapé (ex.: "Válido até 12/10 ...")
//     logo,              // url ou data:url do logo
//     ofertas: [{ produto, precoDe, precoPor, unidade, foto }],
//   }) -> Promise<void>
//
// Cores e textos fixos ficam em CARD_TEMA.
// =============================================================================

export const CARD_FONTES_CSS = 'https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,600;0,800;0,900;1,800;1,900&display=block';

export const CARD_OFERTA_JS = String.raw`
var CARD_TEMA = {
  azulTexto: '#0A1A6D',
  azulSelo: '#143B86',
  vermelho: '#FF0026',
  fundoTopo: '#D5E6F6',
  fundoMeio: '#F4F8FD',
  fundoBaixo: '#E1EDF8',
  selo: ['Ofertas', 'Exclusivas', 'Minas Gerais'],
  fonte: 'Archivo, "Arial Black", Arial, sans-serif',
};

function cardCarregarImagem(src) {
  return new Promise(function (ok) {
    if (!src) return ok(null);
    var img = new Image();
    if (!/^data:/.test(src)) img.crossOrigin = 'anonymous';
    img.onload = function () { ok(img); };
    img.onerror = function () { ok(null); };
    img.src = src;
  });
}

function cardFontesProntas() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  var pesos = ['italic 900 100px Archivo', '900 40px Archivo', '800 40px Archivo', '600 30px Archivo'];
  return Promise.race([
    Promise.all(pesos.map(function (p) { return document.fonts.load(p); })),
    new Promise(function (ok) { setTimeout(ok, 2500); }),
  ]).catch(function () {});
}

function cardRet(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function cardQuebrar(ctx, texto, larguraMax) {
  var palavras = String(texto || '').split(/\s+/);
  var linhas = [], atual = '';
  for (var i = 0; i < palavras.length; i++) {
    var teste = atual ? atual + ' ' + palavras[i] : palavras[i];
    if (ctx.measureText(teste).width > larguraMax && atual) { linhas.push(atual); atual = palavras[i]; }
    else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

// Maior fonte (entre tamMax e tamMin) em que o texto cabe em maxLinhas.
function cardAjustar(ctx, texto, larguraMax, maxLinhas, tamMax, tamMin, estilo) {
  for (var t = tamMax; t >= tamMin; t -= 2) {
    ctx.font = estilo + ' ' + t + 'px ' + CARD_TEMA.fonte;
    var l = cardQuebrar(ctx, texto, larguraMax);
    if (l.length <= maxLinhas) return { linhas: l, tam: t };
  }
  ctx.font = estilo + ' ' + tamMin + 'px ' + CARD_TEMA.fonte;
  var ls = cardQuebrar(ctx, texto, larguraMax).slice(0, maxLinhas);
  ls[ls.length - 1] = ls[ls.length - 1] + '…';
  return { linhas: ls, tam: tamMin };
}

function cardUnidadeTexto(u) {
  u = String(u || 'un').toLowerCase();
  if (u === 'kg') return 'O QUILO';
  if (u === 'un') return 'CADA';
  if (u === 'pct') return 'O PACOTE';
  if (u === 'cx') return 'A CAIXA';
  if (u === 'bdj') return 'A BANDEJA';
  if (u === 'dz') return 'A DÚZIA';
  return u.toUpperCase();
}

// Fundo azul-claro com brilho no centro e nuvens claras embaixo.
function cardFundo(ctx, W, H) {
  var t = CARD_TEMA;
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, t.fundoTopo); g.addColorStop(0.45, t.fundoMeio); g.addColorStop(1, t.fundoBaixo);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  var r = ctx.createRadialGradient(W / 2, H * 0.5, 40, W / 2, H * 0.5, W * 0.62);
  r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.75)';
  [[W * 0.08, H * 0.93, 110], [W * 0.2, H * 0.97, 90], [W * 0.9, H * 0.95, 120], [W * 0.78, H * 0.99, 80]].forEach(function (c) {
    ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

// Selo azul no canto superior esquerdo.
function cardSelo(ctx, x, w, h) {
  var t = CARD_TEMA;
  ctx.save();
  ctx.shadowColor = 'rgba(10,26,109,.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  ctx.fillStyle = t.azulSelo; cardRet(ctx, x, -30, w, h + 30, 22); ctx.fill();
  ctx.restore();
  // triângulo (símbolo de Minas) estilizado
  var cx = x + w / 2, ty = h * 0.12, ts = w * 0.2;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.moveTo(cx, ty); ctx.lineTo(cx + ts * 0.62, ty + ts); ctx.lineTo(cx - ts * 0.62, ty + ts); ctx.closePath(); ctx.fill();
  ctx.fillStyle = t.vermelho;
  ctx.beginPath(); ctx.moveTo(cx, ty + ts * 0.3); ctx.lineTo(cx + ts * 0.36, ty + ts * 0.88); ctx.lineTo(cx - ts * 0.36, ty + ts * 0.88); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  var tam = Math.round(w * 0.135), y = ty + ts + tam * 1.45;
  t.selo.forEach(function (linha, i) {
    ctx.font = (i === t.selo.length - 1 ? '800 ' : '600 ') + tam + 'px ' + t.fonte;
    var fit = cardAjustar(ctx, linha, w - 24, 1, tam, 10, i === t.selo.length - 1 ? '800' : '600');
    ctx.fillText(fit.linhas[0], cx, y + i * tam * 1.18);
  });
}

function cardLogo(ctx, img, xDir, y, wMax, hMax) {
  if (!img) return;
  var r = Math.min(wMax / img.width, hMax / img.height);
  var w = img.width * r, h = img.height * r;
  ctx.drawImage(img, xDir - w, y, w, h);
}

// Foto do produto. "multiply" faz o fundo branco das fotos sumir no fundo claro.
function cardFoto(ctx, img, x, y, w, h, nome, multiplicar) {
  if (img) {
    var r = Math.min(w / img.width, h / img.height);
    var iw = img.width * r, ih = img.height * r;
    ctx.save();
    if (multiplicar) ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    ctx.restore();
    return;
  }
  var raio = Math.min(w, h) * 0.34;
  ctx.fillStyle = 'rgba(20,59,134,0.08)';
  ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, raio, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = CARD_TEMA.azulSelo; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 ' + Math.round(raio) + 'px ' + CARD_TEMA.fonte;
  ctx.fillText(String(nome || '?').trim().charAt(0).toUpperCase(), x + w / 2, y + h / 2 + raio * 0.05);
}

// Preço no estilo da arte: "R$" pequeno embaixo à esquerda, número grande em
// vermelho itálico, unidade em azul embaixo à direita. cx = centro; base = linha
// de base do número; tam = altura do número.
function cardPreco(ctx, cx, base, precoPor, unidade, tam) {
  var t = CARD_TEMA;
  var valor = Number(precoPor || 0).toFixed(2).replace('.', ',');
  var tRs = tam * 0.2, tUn = tam * 0.15;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.font = 'italic 900 ' + tam + 'px ' + t.fonte;
  var wNum = ctx.measureText(valor).width;
  ctx.font = '900 ' + tRs + 'px ' + t.fonte;
  var wRs = ctx.measureText('R$').width;
  var un = cardUnidadeTexto(unidade);
  ctx.font = '900 ' + tUn + 'px ' + t.fonte;
  var wUn = ctx.measureText(un).width;
  var gap = tam * 0.05;
  var x0 = cx - (wRs + gap + wNum) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(120,0,20,0.25)'; ctx.shadowBlur = tam * 0.06; ctx.shadowOffsetY = tam * 0.025;
  ctx.fillStyle = t.vermelho;
  ctx.font = '900 ' + tRs + 'px ' + t.fonte; ctx.fillText('R$', x0, base);
  ctx.font = 'italic 900 ' + tam + 'px ' + t.fonte; ctx.fillText(valor, x0 + wRs + gap, base);
  ctx.restore();
  ctx.fillStyle = t.azulTexto; ctx.font = '900 ' + tUn + 'px ' + t.fonte; ctx.textAlign = 'right';
  ctx.fillText(un, x0 + wRs + gap + wNum - tam * 0.04, base + tUn * 1.4);
  return { esquerda: x0, direita: x0 + wRs + gap + wNum };
}

function cardPrecoDe(ctx, cx, y, precoDe, precoPor, tam) {
  if (!precoDe || Number(precoDe) <= Number(precoPor)) return;
  var txt = 'DE R$ ' + Number(precoDe).toFixed(2).replace('.', ',');
  ctx.font = '800 ' + tam + 'px ' + CARD_TEMA.fonte;
  ctx.fillStyle = CARD_TEMA.azulTexto; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(txt, cx, y);
  var w = ctx.measureText(txt).width;
  ctx.strokeStyle = CARD_TEMA.vermelho; ctx.lineWidth = Math.max(3, tam / 8);
  ctx.beginPath(); ctx.moveTo(cx - w / 2 - 4, y - tam * 0.32); ctx.lineTo(cx + w / 2 + 4, y - tam * 0.32); ctx.stroke();
}

function cardRodape(ctx, W, H, texto) {
  if (!texto) return;
  ctx.fillStyle = CARD_TEMA.azulTexto; ctx.globalAlpha = 0.75;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  var f = cardAjustar(ctx, texto, W - 100, 1, 24, 16, '600');
  ctx.fillText(f.linhas[0], W / 2, H - 22);
  ctx.globalAlpha = 1;
}

function desenharCardOferta(canvas, dados) {
  var lamina = dados.modo === 'lamina' && (dados.ofertas || []).length > 1;
  var W = 1080, H = lamina ? 1350 : 1080;
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext('2d');
  var ofertas = (dados.ofertas || []).slice(0, 6);
  var multiplicar = dados.multiplicar !== false;
  return cardFontesProntas().then(function () {
    return Promise.all([cardCarregarImagem(dados.logo)].concat(ofertas.map(function (o) { return cardCarregarImagem(o.foto); })));
  }).then(function (imgs) {
    var logo = imgs[0], fotos = imgs.slice(1);
    var t = CARD_TEMA;
    cardFundo(ctx, W, H);

    if (!lamina) {
      var o = ofertas[0] || { produto: '', precoPor: 0 };
      cardSelo(ctx, 60, 230, 260);
      cardLogo(ctx, logo, W - 60, 70, 280, 170);
      // nome do produto
      ctx.fillStyle = t.azulTexto; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      var nome = cardAjustar(ctx, String(o.produto).toUpperCase(), 640, 2, 46, 30, '800');
      var yN = 300;
      nome.linhas.forEach(function (l, i) { ctx.fillText(l, W / 2, yN + nome.tam * (i + 1) * 1.12); });
      var fotoTopo = yN + nome.tam * nome.linhas.length * 1.12 + 30;
      var temDe = o.precoDe && Number(o.precoDe) > Number(o.precoPor);
      var baseNum = H - 118;
      var tamNum = 250;
      var fotoBaixo = baseNum - tamNum * 0.78 - (temDe ? 60 : 20);
      cardFoto(ctx, fotos[0], 150, fotoTopo, W - 300, fotoBaixo - fotoTopo, o.produto, multiplicar);
      if (temDe) cardPrecoDe(ctx, W / 2, baseNum - tamNum * 0.78 - 14, o.precoDe, o.precoPor, 40);
      // número encolhe se o valor for comprido (ex.: 1.299,90)
      ctx.font = 'italic 900 ' + tamNum + 'px ' + t.fonte;
      var wTeste = ctx.measureText(Number(o.precoPor || 0).toFixed(2).replace('.', ',')).width;
      if (wTeste > W - 260) tamNum = Math.floor(tamNum * (W - 260) / wTeste);
      cardPreco(ctx, W / 2, baseNum, o.precoPor, o.unidade, tamNum);
    } else {
      cardSelo(ctx, 50, 190, 215);
      cardLogo(ctx, logo, W - 50, 50, 230, 140);
      ctx.fillStyle = t.azulTexto; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      var tit = cardAjustar(ctx, String(dados.titulo || 'OFERTAS').toUpperCase(), 520, 2, 56, 30, '900');
      tit.linhas.forEach(function (l, i) { ctx.fillText(l, W / 2, 90 + tit.tam * (i + 1) * 1.05); });
      var n = ofertas.length, cols = 2, rows = Math.ceil(n / cols);
      var mx = 50, gap = 24, areaTop = 250, areaH = H - areaTop - 70;
      var cw = (W - mx * 2 - gap) / cols, ch = (areaH - gap * (rows - 1)) / rows;
      ofertas.forEach(function (o, i) {
        var c = i % cols, r = Math.floor(i / cols);
        var x = mx + c * (cw + gap), y = areaTop + r * (ch + gap);
        if (n % 2 === 1 && i === n - 1) x = (W - cw) / 2;
        ctx.save(); ctx.shadowColor = 'rgba(10,26,109,.18)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 6;
        ctx.fillStyle = '#FFFFFF'; cardRet(ctx, x, y, cw, ch, 28); ctx.fill(); ctx.restore();
        var tamNum = Math.min(118, ch * 0.3);
        ctx.font = 'italic 900 ' + tamNum + 'px ' + t.fonte;
        var wT = ctx.measureText(Number(o.precoPor || 0).toFixed(2).replace('.', ',')).width;
        if (wT > cw - 110) tamNum = Math.floor(tamNum * (cw - 110) / wT);
        var nomeTam = Math.max(20, Math.min(28, ch * 0.07));
        ctx.fillStyle = t.azulTexto; ctx.textAlign = 'center';
        var nm = cardAjustar(ctx, String(o.produto).toUpperCase(), cw - 40, 2, nomeTam, 16, '800');
        var baseNum = y + ch - 46;
        var nomeBase = baseNum - tamNum * 0.8 - 14;
        var temDe = o.precoDe && Number(o.precoDe) > Number(o.precoPor);
        if (temDe) nomeBase -= 40;
        var nomeTopo = nomeBase - nm.tam * nm.linhas.length * 1.12;
        nm.linhas.forEach(function (l, k) { ctx.fillText(l, x + cw / 2, nomeTopo + nm.tam * (k + 1) * 1.12); });
        if (temDe) cardPrecoDe(ctx, x + cw / 2, baseNum - tamNum * 0.86 - 12, o.precoDe, o.precoPor, 22);
        cardFoto(ctx, fotos[i], x + 24, y + 18, cw - 48, nomeTopo - y - 26, o.produto, false);
        cardPreco(ctx, x + cw / 2, baseNum, o.precoPor, o.unidade, tamNum);
      });
    }
    cardRodape(ctx, W, H, dados.validade);
  });
}
`;

// Página usada dentro da WebView do app: recebe os dados, desenha e devolve
// o PNG em base64 pela ponte da WebView.
export const CARD_OFERTA_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${CARD_FONTES_CSS}">
<style>html,body{margin:0;background:transparent;}canvas{width:100%;height:auto;display:block;border-radius:10px;}</style></head>
<body><canvas id="c"></canvas><script>${CARD_OFERTA_JS}
function avisar(m){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
window.gerarCard = function (dados, exportar) {
  var c = document.getElementById('c');
  desenharCardOferta(c, dados).then(function () {
    if (exportar) {
      try { avisar({ tipo: 'png', base64: c.toDataURL('image/jpeg', 0.92).split(',')[1] }); }
      catch (e) { avisar({ tipo: 'erro', mensagem: String(e && e.message || e) }); }
    } else avisar({ tipo: 'pronto', altura: c.height, largura: c.width });
  });
  return true;
};
avisar({ tipo: 'carregado' });
</script></body></html>`;
