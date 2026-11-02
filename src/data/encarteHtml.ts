// Página (WebView) que desenha o PDF do encarte com o pdf.js e devolve para
// o app onde a pessoa tocou: página, posição (0..1) e o texto do encarte em
// volta do toque (nome e preço do produto, quando o PDF tem texto).
// O app manda os marcadores dos itens já conferidos com setMarcadores([...]).
//
// Mensagens para o app (window.ReactNativeWebView.postMessage, JSON):
//   { tipo: 'pronto', paginas }            { tipo: 'erro', mensagem }
//   { tipo: 'toque', pagina, x, y, texto, preco, codigo }  (codigo = código interno impresso no encarte, se houver)
//   { tipo: 'item', id }                   (tocou num marcador)

export function htmlEncarte(urlPdf: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
<style>
  html,body{margin:0;padding:0;background:#E9EDF3;font-family:sans-serif;-webkit-tap-highlight-color:transparent}
  #pgs{padding:8px}
  .pg{position:relative;margin:0 auto 10px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18)}
  .pg canvas{width:100%;display:block}
  .mk{position:absolute;transform:translate(-50%,-50%);min-width:26px;height:26px;padding:0 6px;box-sizing:border-box;border-radius:13px;border:2px solid #fff;
      color:#fff;font:800 12px sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.35)}
  .toque{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border:3px solid #2F7BFF;border-radius:50%;pointer-events:none;animation:p 0.9s ease-out forwards}
  @keyframes p{from{transform:scale(.4);opacity:1}to{transform:scale(1.4);opacity:0}}
  #msg{padding:40px 20px;text-align:center;color:#5B6280;font-size:14px}
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head><body><div id="msg">Abrindo o encarte…</div><div id="pgs"></div>
<script>
(function(){
  var URL_PDF = ${JSON.stringify(urlPdf)};
  var textos = {}; // pagina -> [{t, x, y, w, h}] em 0..1
  var marcadores = [];
  function enviar(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
  var COR = { ok:'#178553', zerado:'#C0352B', vai_faltar:'#C0352B', baixo:'#B4650E', sem_produto:'#7D8898' };

  window.setMarcadores = function(lista){ marcadores = lista || []; desenhar(); };
  function desenhar(){
    document.querySelectorAll('.mk').forEach(function(e){ e.remove(); });
    marcadores.forEach(function(m){
      var pg = document.getElementById('pg' + m.pagina); if (!pg) return;
      var d = document.createElement('div');
      d.className = 'mk'; d.style.left = (m.x*100)+'%'; d.style.top = (m.y*100)+'%';
      d.style.background = COR[m.situacao] || '#2F7BFF';
      d.textContent = m.produtos > 0 ? String(m.produtos) : '+';
      d.addEventListener('click', function(ev){ ev.stopPropagation(); enviar({ tipo:'item', id:m.id }); });
      pg.appendChild(d);
    });
  }

  function textoPerto(pagina, x, y){
    var todos = textos[pagina] || [];
    var cx = function(it){ return it.x + it.w/2; }, cy = function(it){ return it.y + it.h/2; };
    var ehPreco = function(t){ return /(\\d{1,3}(?:\\.\\d{3})*),(\\d{2})/.test(t); };
    var ehCodigo = function(t){ return /^\\d{5,7}$/.test(t.trim()); };
    var ehLixo = function(t){ t = t.trim(); return !t || /^r\\$$/i.test(t) || /^[\\d.,]+$/.test(t) || /^(de|por):?$/i.test(t); };
    var dist = function(it){ return Math.hypot(cx(it) - x, (cy(it) - y) * 1.6); };
    var perto = todos.filter(function(it){ return Math.abs(cx(it) - x) < 0.18 && Math.abs(cy(it) - y) < 0.12; }).sort(function(a,b){ return dist(a) - dist(b); });
    // Encarte em tabela (como o Varejo MG): cada produto tem o código interno
    // impresso. Ele vira a âncora: nome = linhas logo acima dele na mesma coluna.
    var cod = null;
    for (var k = 0; k < perto.length; k++) if (ehCodigo(perto[k].t)) { cod = perto[k]; break; }
    var blocoNome, blocoPreco;
    if (cod) {
      var kx = cx(cod), ky = cy(cod);
      blocoNome = todos.filter(function(it){ return Math.abs(cx(it) - kx) < 0.1 && cy(it) < ky && cy(it) > ky - 0.09; });
      // preço fica à direita do código, na mesma célula
      blocoPreco = todos.filter(function(it){ var d = cx(it) - kx; return d > -0.02 && d < 0.16 && cy(it) < ky + 0.005 && cy(it) > ky - 0.09; });
    } else {
      blocoNome = perto.filter(function(it){ return Math.abs(cx(it) - x) < 0.17; });
      blocoPreco = perto;
    }
    var preco = null, precoH = 0;
    blocoPreco.forEach(function(it){
      var m = it.t.match(/(\\d{1,3}(?:\\.\\d{3})*),(\\d{2})/);
      if (m && it.h > precoH * 1.05) { preco = m[0]; precoH = it.h; } // a maior letra = preço "POR"
    });
    var vistos = {}, palavras = [];
    blocoNome.forEach(function(it){
      var t = it.t.trim();
      if (ehLixo(t) || ehPreco(t) || ehCodigo(t) || vistos[t]) return;
      vistos[t] = 1; palavras.push(it);
    });
    palavras = palavras.sort(function(a,b){ return dist(a) - dist(b); }).slice(0, 8);
    palavras.sort(function(a,b){ return Math.abs(a.y - b.y) > 0.008 ? a.y - b.y : a.x - b.x; });
    return { texto: palavras.map(function(p){ return p.t.trim(); }).join(' ').replace(/\\s+/g,' ').trim(), preco: preco, codigo: cod ? cod.t.trim() : null };
  }

  function aoTocar(ev, pagina, el){
    var r = el.getBoundingClientRect();
    var x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    var t = document.createElement('div'); t.className = 'toque'; t.style.left = (x*100)+'%'; t.style.top = (y*100)+'%';
    el.appendChild(t); setTimeout(function(){ t.remove(); }, 900);
    var p = textoPerto(pagina, x, y);
    enviar({ tipo:'toque', pagina:pagina, x:x, y:y, texto:p.texto, preco:p.preco, codigo:p.codigo });
  }

  if (!window.pdfjsLib) { document.getElementById('msg').textContent = 'Sem internet para abrir o encarte.'; enviar({ tipo:'erro', mensagem:'pdf.js não carregou' }); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  pdfjsLib.getDocument(URL_PDF).promise.then(function(pdf){
    document.getElementById('msg').remove();
    var largura = Math.max(300, window.innerWidth - 16);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var cadeia = Promise.resolve();
    for (var n = 1; n <= pdf.numPages; n++) (function(n){
      cadeia = cadeia.then(function(){ return pdf.getPage(n); }).then(function(page){
        var base = page.getViewport({ scale: 1 });
        var vp = page.getViewport({ scale: largura / base.width });
        var div = document.createElement('div'); div.className = 'pg'; div.id = 'pg' + n; div.style.width = largura + 'px';
        var cv = document.createElement('canvas'); cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr);
        div.appendChild(cv); document.getElementById('pgs').appendChild(div);
        div.addEventListener('click', function(ev){ aoTocar(ev, n, div); });
        var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
        return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function(){ return page.getTextContent(); }).then(function(tc){
          textos[n] = tc.items.map(function(it){
            var tx = pdfjsLib.Util.transform(vp.transform, it.transform);
            var h = Math.hypot(tx[2], tx[3]);
            return { t: it.str, x: tx[4] / vp.width, y: (tx[5] - h) / vp.height, w: (it.width * vp.scale) / vp.width, h: h / vp.height };
          }).filter(function(it){ return it.t && it.t.trim(); });
          if (n === 1) enviar({ tipo:'pronto', paginas: pdf.numPages });
          desenhar();
        });
      });
    })(n);
    return cadeia;
  }).catch(function(e){
    var m = document.getElementById('msg'); if (m) m.textContent = 'Não consegui abrir o encarte.';
    enviar({ tipo:'erro', mensagem: String(e && e.message || e) });
  });
})();
</script></body></html>`;
}

// Página escondida que só lê o texto (com posição) de todas as páginas do PDF
// e devolve { tipo: 'textos', paginas: [[{ t, x, y, w, h }]] } — usado para
// montar a lista de itens da conferência (ver jornalLeituraPdf.ts).
export function htmlLerTextos(urlPdf: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script></head><body><script>
(function(){
  function enviar(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
  if (!window.pdfjsLib) { enviar({ tipo:'erro', mensagem:'Sem internet para ler o jornal' }); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  pdfjsLib.getDocument(${JSON.stringify(urlPdf)}).promise.then(function(pdf){
    var paginas = [], cadeia = Promise.resolve();
    for (var n = 1; n <= pdf.numPages; n++) (function(n){
      cadeia = cadeia.then(function(){ return pdf.getPage(n); }).then(function(page){
        var vp = page.getViewport({ scale: 1.5 });
        return page.getTextContent().then(function(tc){
          paginas[n-1] = tc.items.filter(function(it){ return it.str && it.str.trim(); }).map(function(it){
            var tx = pdfjsLib.Util.transform(vp.transform, it.transform);
            var h = Math.hypot(tx[2], tx[3]);
            return { t: it.str, x: tx[4] / vp.width, y: (tx[5] - h) / vp.height, w: (it.width * vp.scale) / vp.width, h: h / vp.height };
          });
        });
      });
    })(n);
    return cadeia.then(function(){ enviar({ tipo:'textos', paginas: paginas }); });
  }).catch(function(e){ enviar({ tipo:'erro', mensagem: String(e && e.message || e) }); });
})();
</script></body></html>`;
}
