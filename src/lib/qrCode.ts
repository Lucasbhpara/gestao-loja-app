// Gerador de QR code feito dentro do app — sem depender de site de fora.
// Baseado no algoritmo de referência "QR Code generator library" de
// Project Nayuki (licença MIT). Só o modo byte (UTF-8), que serve para links.
//
// gerarQr(texto) devolve uma matriz quadrada de booleanos (true = quadrado
// preto). Para desenhar: qrSvg(texto) (string SVG, usada no PDF) ou a
// matriz direto em <View>s (no app).

type Nivel = 'L' | 'M' | 'Q' | 'H';
const ORDEM_NIVEL: Record<Nivel, number> = { L: 0, M: 1, Q: 2, H: 3 };
const BITS_FORMATO: Record<Nivel, number> = { L: 1, M: 0, Q: 3, H: 2 };

const ECC_POR_BLOCO: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_BLOCOS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

function modulosDeDados(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
function codewordsDeDados(ver: number, nivel: Nivel): number {
  const e = ORDEM_NIVEL[nivel];
  return Math.floor(modulosDeDados(ver) / 8) - ECC_POR_BLOCO[e][ver] * NUM_BLOCOS[e][ver];
}

function utf8(texto: string): number[] {
  const s = unescape(encodeURIComponent(texto));
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  return out;
}

// --- Reed-Solomon em GF(256), polinômio 0x11D
function multGF(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}
function divisorRS(grau: number): number[] {
  const r: number[] = new Array(grau).fill(0);
  r[grau - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = multGF(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = multGF(raiz, 0x02);
  }
  return r;
}
function restoRS(dados: number[], divisor: number[]): number[] {
  const r: number[] = divisor.map(() => 0);
  for (const b of dados) {
    const fator = b ^ (r.shift() as number);
    r.push(0);
    divisor.forEach((c, i) => (r[i] ^= multGF(c, fator)));
  }
  return r;
}

export function gerarQr(texto: string, nivel: Nivel = 'M'): boolean[][] {
  const bytes = utf8(texto);
  // escolhe a menor versão que cabe
  let ver = 1;
  let bitsUsados = 0;
  for (; ; ver++) {
    if (ver > 40) throw new Error('Texto grande demais para QR code');
    const bitsContagem = ver <= 9 ? 8 : 16;
    bitsUsados = 4 + bitsContagem + bytes.length * 8;
    if (bitsUsados <= codewordsDeDados(ver, nivel) * 8) break;
  }
  const tam = ver * 4 + 17;

  // --- monta os bits de dados
  const bits: number[] = [];
  const poe = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  poe(0x4, 4);
  poe(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => poe(b, 8));
  const capacidade = codewordsDeDados(ver, nivel) * 8;
  poe(0, Math.min(4, capacidade - bits.length));
  poe(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacidade; pad ^= 0xec ^ 0x11) poe(pad, 8);
  const dados: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dados.push(b);
  }

  // --- correção de erro e intercalação
  const e = ORDEM_NIVEL[nivel];
  const nBlocos = NUM_BLOCOS[e][ver];
  const eccLen = ECC_POR_BLOCO[e][ver];
  const totalCw = Math.floor(modulosDeDados(ver) / 8);
  const nCurtos = nBlocos - (totalCw % nBlocos);
  const lenCurto = Math.floor(totalCw / nBlocos);
  const div = divisorRS(eccLen);
  const blocos: number[][] = [];
  for (let i = 0, k = 0; i < nBlocos; i++) {
    const d = dados.slice(k, k + lenCurto - eccLen + (i < nCurtos ? 0 : 1));
    k += d.length;
    const ecc = restoRS(d, div);
    if (i < nCurtos) d.push(0);
    blocos.push(d.concat(ecc));
  }
  const final: number[] = [];
  for (let i = 0; i < blocos[0].length; i++) {
    blocos.forEach((b, j) => {
      if (i !== lenCurto - eccLen || j >= nCurtos) final.push(b[i]);
    });
  }

  // --- matriz
  const m: boolean[][] = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const fixo: boolean[][] = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const set = (x: number, y: number, v: boolean) => {
    m[y][x] = v;
    fixo[y][x] = true;
  };
  for (let i = 0; i < tam; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (x: number, y: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < tam && yy >= 0 && yy < tam) set(xx, yy, d !== 2 && d !== 4);
      }
  };
  finder(3, 3);
  finder(tam - 4, 3);
  finder(3, tam - 4);
  // alinhamento
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2;
    const passo = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const pos = [6];
    for (let p = tam - 7; pos.length < n; p -= passo) pos.splice(1, 0, p);
    pos.forEach((a, i) =>
      pos.forEach((b, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
  }
  const desenharFormato = (mascara: number) => {
    const d = (BITS_FORMATO[nivel] << 3) | mascara;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    const bit = (i: number) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(tam - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, tam - 15 + i, bit(i));
    set(8, tam - 8, true);
  };
  desenharFormato(0); // reserva as áreas
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) {
      const v = ((b >>> i) & 1) !== 0;
      const a = tam - 11 + (i % 3), c = Math.floor(i / 3);
      set(a, c, v);
      set(c, a, v);
    }
  }
  // dados em zigue-zague
  let i = 0;
  for (let dir = tam - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5;
    for (let vert = 0; vert < tam; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = dir - j;
        const subindo = ((dir + 1) & 2) === 0;
        const y = subindo ? tam - 1 - vert : vert;
        if (!fixo[y][x] && i < final.length * 8) {
          m[y][x] = ((final[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i++;
        }
      }
    }
  }

  const aplicarMascara = (k: number) => {
    for (let y = 0; y < tam; y++)
      for (let x = 0; x < tam; x++) {
        if (fixo[y][x]) continue;
        let inv: boolean;
        switch (k) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (inv) m[y][x] = !m[y][x];
      }
  };
  const penalidade = (): number => {
    let p = 0;
    const linha = (get: (a: number, b: number) => boolean) => {
      for (let a = 0; a < tam; a++) {
        let run = 0, cor = false;
        const hist: number[] = [];
        for (let b = 0; b < tam; b++) {
          const v = get(a, b);
          if (b === 0 || v !== cor) {
            if (run >= 5) p += 3 + (run - 5);
            if (b > 0) hist.push(run);
            run = 1; cor = v;
          } else run++;
        }
        if (run >= 5) p += 3 + (run - 5);
        // padrão 1:1:3:1:1 (aproximação simples)
        const s = Array.from({ length: tam }, (_, b) => (get(a, b) ? '1' : '0')).join('');
        const re = /(?=10111010000|00001011101)/g;
        p += (s.match(re) || []).length * 40;
        void hist;
      }
    };
    linha((a, b) => m[a][b]);
    linha((a, b) => m[b][a]);
    for (let y = 0; y < tam - 1; y++)
      for (let x = 0; x < tam - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
      }
    let pretos = 0;
    m.forEach((r) => r.forEach((v) => v && pretos++));
    const total = tam * tam;
    p += (Math.ceil(Math.abs(pretos * 20 - total * 10) / total) - 1) * 10;
    return p;
  };
  let melhor = 0, menor = Infinity;
  for (let k = 0; k < 8; k++) {
    aplicarMascara(k);
    desenharFormato(k);
    const pen = penalidade();
    if (pen < menor) { menor = pen; melhor = k; }
    aplicarMascara(k);
  }
  aplicarMascara(melhor);
  desenharFormato(melhor);
  return m;
}

// SVG do QR (com margem branca de 4 módulos), para usar no HTML do PDF.
export function qrSvg(texto: string, tamanhoPx = 160): string {
  const m = gerarQr(texto);
  const n = m.length, borda = 4, total = n + borda * 2;
  let caminho = '';
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (m[y][x]) caminho += `M${x + borda},${y + borda}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanhoPx}" height="${tamanhoPx}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${caminho}" fill="#000"/></svg>`;
}
