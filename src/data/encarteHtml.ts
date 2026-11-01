// Página (WebView) que desenha o PDF do encarte com o pdf.js e devolve para
// o app onde a pessoa tocou: página, posição (0..1) e o texto do encarte em
// volta do toque (nome e preço do produto, quando o PDF tem texto).
// O app manda os marcadores dos itens já conferidos com setMarcadores([...]).
//
// Mensagens para o app (window.ReactNativeWebView.postMessage, JSON):
//   { tipo: 'pronto', paginas }            { tipo: 'erro', mensagem }
//   { tipo: 'toque', pagina, x, y, texto, preco }
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
    var lista = (textos[pagina] || []).filter(function(it){
      var cx = it.x + it.w/2, cy = it.y + it.h/2;
      return Math.abs(cx - x) < 0.18 && Math.abs(cy - y) < 0.12;
    });
    lista.sort(function(a,b){
      var da = Math.hypot(a.x + a.w/2 - x, (a.y + a.h/2 - y)*1.6), db = Math.hypot(b.x + b.w/2 - x, (b.y + b.h/2 - y)*1.6);
      return da - db;
    });
    var preco = null, palavras = [];
    lista.forEach(function(it){
      var t = it.t.trim(); if (!t) return;
      var m = t.match(/(\\d{1,3}(?:\\.\\d{3})*),(\\d{2})/);
      if (m && preco === null) { preco = m[0]; return; }
      if (/^r\\$$/i.test(t) || /^[\\d.,]+$/.test(t)) return;
      if (palavras.length < 8) palavras.push(it);
    });
    // na ordem de leitura (de cima para baixo, esquerda para direita)
    palavras.sort(function(a,b){ return Math.abs(a.y - b.y) > 0.008 ? a.y - b.y : a.x - b.x; });
    return { texto: palavras.map(function(p){ return p.t.trim(); }).join(' ').replace(/\\s+/g,' ').trim(), preco: preco };
  }

  function aoTocar(ev, pagina, el){
    var r = el.getBoundingClientRect();
    var x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    var t = document.createElement('div'); t.className = 'toque'; t.style.left = (x*100)+'%'; t.style.top = (y*100)+'%';
    el.appendChild(t); setTimeout(function(){ t.remove(); }, 900);
    var p = textoPerto(pagina, x, y);
    enviar({ tipo:'toque', pagina:pagina, x:x, y:y, texto:p.texto, preco:p.preco });
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
