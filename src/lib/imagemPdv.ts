import { rodandoNaWeb } from './plataforma';

// Imagem (JPEG) do plano do dia dos PDVs, para mandar no WhatsApp.
// Não mostra faltas, atestados nem horário de almoço (informação delicada).
//
// O desenho é feito num <canvas> por este script. No navegador ele roda
// direto; no celular roda dentro de um WebView escondido (ver
// components/GeradorImagemPdv.tsx), que devolve a imagem em base64.

export interface DadosImagemPdv {
  titulo: string; // "Caixas de segunda, 21/12"
  subtitulo: string; // "Loja 327 · frente de caixa"
  encManha: string;
  encTarde: string;
  rotuloManha: string; // "MANHÃ 07:20 – 17:20"
  rotuloTarde: string;
  linhas: { n: number; tag: string; obrigatorio: boolean; manha: string; tarde: string; quebrado: string | null }[];
  empacotando: string;
  rodape: string;
}

// Corpo de uma função (canvas, dados) → string dataURL JPEG.
export const SCRIPT_DESENHO = `
var W = 1080, c = canvas, x = c.getContext('2d');
c.width = W; c.height = 2200;
function F(w, s, d) { x.font = w + ' ' + s + 'px ' + (d ? 'Arial Black, Arial, sans-serif' : 'Arial, sans-serif'); }
x.fillStyle = '#F3F5F8'; x.fillRect(0, 0, W, 2200);
x.fillStyle = '#0E1B2C'; x.fillRect(0, 0, W, 160);
x.fillStyle = '#ffffff'; F('bold', 46, 1); x.fillText(dados.titulo, 50, 78);
F('normal', 28); x.fillStyle = '#c9d4e2'; x.fillText(dados.subtitulo, 50, 125);
var y = 205;
x.fillStyle = '#0E1B2C'; F('bold', 26); x.fillText('Encarregadas — manhã: ' + dados.encManha, 50, y); y += 38;
x.fillText('Encarregadas — tarde: ' + dados.encTarde, 50, y); y += 40;
x.fillStyle = '#5b6878'; F('bold', 21); x.fillText('PDV', 58, y + 20); x.fillText(dados.rotuloManha, 200, y + 20); x.fillText(dados.rotuloTarde, 630, y + 20); y += 36;
for (var i = 0; i < dados.linhas.length; i++) {
  var l = dados.linhas[i];
  x.fillStyle = '#ffffff'; x.fillRect(40, y, W - 80, 76);
  if (l.quebrado) {
    x.fillStyle = '#fdf0ef'; x.fillRect(190, y, W - 230, 76);
    x.fillStyle = '#D23C33'; F('bold', 40, 1); x.fillText(String(l.n), 58, y + 52);
    F('bold', 28); x.fillText(l.quebrado, 210, y + 50);
  } else {
    x.fillStyle = '#fff4d6'; x.fillRect(190, y, 420, 76);
    x.fillStyle = '#e6eefc'; x.fillRect(620, y, W - 660, 76);
    x.fillStyle = l.obrigatorio ? '#2F7BFF' : '#0E1B2C'; F('bold', 38, 1); x.fillText(String(l.n), 58, y + (l.tag ? 42 : 52));
    x.fillStyle = '#2F7BFF'; F('bold', 13); x.fillText(l.tag, 58, y + 66);
    x.fillStyle = l.manha ? '#0E1B2C' : '#9aa8b8'; F(l.manha ? 'bold' : 'normal', 30); x.fillText(l.manha || '—', 210, y + 50);
    x.fillStyle = l.tarde ? '#0E1B2C' : '#9aa8b8'; F(l.tarde ? 'bold' : 'normal', 30); x.fillText(l.tarde || '—', 640, y + 50);
  }
  y += 82;
}
y += 30; x.fillStyle = '#0E1B2C';
function quebra(t, b) {
  F(b ? 'bold' : 'normal', 26); var ws = t.split(' '), linha = '';
  for (var k = 0; k < ws.length; k++) { if (x.measureText(linha + ws[k]).width > W - 100) { x.fillText(linha, 50, y); y += 34; linha = ''; } linha += ws[k] + ' '; }
  x.fillText(linha, 50, y); y += 42;
}
if (dados.empacotando) quebra('Empacotando: ' + dados.empacotando, 1);
quebra('Na tarde de um caixa com manhã: assume o caixa às 17:20.', 0);
y += 10; x.fillStyle = '#5b6878'; F('normal', 20); x.fillText(dados.rodape, 50, y);
var o = document.createElement('canvas'); o.width = W; o.height = y + 40; o.getContext('2d').drawImage(c, 0, 0);
return o.toDataURL('image/jpeg', 0.92);
`;

export function htmlGerador(dados: DadosImagemPdv): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><canvas id="c"></canvas><script>
  (function(){ try {
    var canvas = document.getElementById('c'); var dados = ${JSON.stringify(dados)};
    var url = (function(canvas, dados){ ${SCRIPT_DESENHO} })(canvas, dados);
    window.ReactNativeWebView.postMessage(url);
  } catch (e) { window.ReactNativeWebView.postMessage('ERRO:' + e.message); } })();
  </script></body></html>`;
}

// Só no navegador: desenha direto e devolve o dataURL.
export function gerarImagemNaWeb(dados: DadosImagemPdv): string {
  const canvas = document.createElement('canvas');
  // eslint-disable-next-line no-new-func
  const desenhar = new Function('canvas', 'dados', SCRIPT_DESENHO) as (c: HTMLCanvasElement, d: DadosImagemPdv) => string;
  return desenhar(canvas, dados);
}

function nomeArquivo(base: string): string {
  return (
    base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pdvs'
  );
}

// Recebe o dataURL e abre a tela de compartilhar (WhatsApp…). No navegador,
// baixa o arquivo.
export async function compartilharImagem(dataUrl: string, nomeBase: string): Promise<void> {
  const nome = `${nomeArquivo(nomeBase)}.jpg`;
  if (rodandoNaWeb) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }
  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');
  const caminho = `${FileSystem.cacheDirectory}${nome}`;
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  await FileSystem.writeAsStringAsync(caminho, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Não consegui abrir a tela de compartilhar neste celular.');
  await Sharing.shareAsync(caminho, { mimeType: 'image/jpeg', dialogTitle: 'Mandar mapa dos PDVs' });
}
