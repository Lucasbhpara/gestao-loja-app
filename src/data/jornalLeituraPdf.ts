// Lê os itens do Jornal de Ofertas a partir do texto do PDF (posições vindas
// do pdf.js, em 0..1 da página). Feito para o encarte em tabela do Varejo MG:
// cada célula tem o nome (2–3 linhas), "DE:" com o preço antigo, "POR:" com o
// preço de oferta (a letra maior) e, embaixo, o código interno.
// Âncora = cada "POR:". Se o PDF não tiver "POR:", usa o código interno.

export type TextoPdf = { t: string; x: number; y: number; w: number; h: number }; // y = topo da letra
export type ItemLido = { pagina: number; descricao: string; preco: number | null; codigo: string | null; x: number; y: number };

const cx = (i: TextoPdf) => i.x + i.w / 2;
const cy = (i: TextoPdf) => i.y + i.h / 2;
const RE_PRECO = /(\d{1,3}(?:\.\d{3})*),(\d{2})/;
// o texto inteiro é um preço ("7,98", "R$ 12,70") — "GF. 2,25L" não conta
const ehPreco = (t: string) => /^\s*(r\$\s*)?\d{1,3}(\.\d{3})*,\d{2}\s*$/i.test(t);
const ehCodigo = (t: string) => /^\d{5,7}$/.test(t.trim());
const ehPor = (t: string) => /^por:?$/i.test(t.trim());
const ehLixo = (t: string) => {
  const s = t.trim();
  return !s || /^r\$$/i.test(s) || /^[\d.,]+$/.test(s) || /^(de|por):?$/i.test(s) || /^\d+\s*itens$/i.test(s);
};
const precoNum = (t: string) => {
  const m = t.match(RE_PRECO);
  return m ? Number(m[0].replace(/\./g, '').replace(',', '.')) : null;
};
function mediana(v: number[], padrao: number): number {
  const s = v.filter((x) => x > 0.02).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : padrao;
}
function juntar(linhas: TextoPdf[]): string {
  const vistos = new Set<string>();
  return linhas
    .filter((i) => {
      const t = i.t.trim();
      if (ehLixo(t) || ehPreco(t) || ehCodigo(t) || vistos.has(t)) return false;
      vistos.add(t);
      return true;
    })
    .sort((a, b) => (Math.abs(a.y - b.y) > 0.006 ? a.y - b.y : a.x - b.x))
    .map((i) => i.t.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lerPagina(itens: TextoPdf[], pagina: number): ItemLido[] {
  const pors = itens.filter((i) => ehPor(i.t));
  const saida: ItemLido[] = [];
  if (pors.length) {
    // linhas da tabela (POR na mesma altura) → largura e altura das células
    const linhas: TextoPdf[][] = [];
    [...pors].sort((a, b) => a.y - b.y).forEach((p) => {
      const l = linhas.find((g) => Math.abs(g[0].y - p.y) < 0.01);
      l ? l.push(p) : linhas.push([p]);
    });
    linhas.forEach((l) => l.sort((a, b) => a.x - b.x));
    const larg = mediana(linhas.flatMap((l) => l.slice(1).map((p, k) => p.x - l[k].x)), 0.22);
    const alt = mediana(linhas.slice(1).map((l, k) => l[0].y - linhas[k][0].y), 0.1);
    for (const p of pors) {
      const x1 = p.x - 0.012, x2 = p.x + larg - 0.012;
      const dentro = (i: TextoPdf) => cx(i) > x1 && cx(i) < x2;
      const nome = itens.filter((i) => dentro(i) && cy(i) < cy(p) - 0.006 && cy(i) > cy(p) - alt * 0.82);
      let preco: number | null = null, h = 0;
      itens.filter((i) => dentro(i) && Math.abs(cy(i) - cy(p)) < 0.014 && ehPreco(i.t)).forEach((i) => {
        if (i.h > h * 1.05) { preco = precoNum(i.t); h = i.h; }
      });
      const cod = itens
        .filter((i) => dentro(i) && cy(i) > cy(p) && cy(i) < cy(p) + alt * 0.4 && ehCodigo(i.t))
        .sort((a, b) => a.y - b.y)[0];
      const descricao = juntar(nome);
      if (descricao || cod) saida.push({ pagina, descricao, preco, codigo: cod ? cod.t.trim() : null, x: Math.min(1, p.x + larg / 2), y: Math.max(0, cy(p) - alt * 0.35) });
    }
    return saida;
  }
  // sem "POR:" — usa o código interno como âncora
  for (const k of itens.filter((i) => ehCodigo(i.t))) {
    const kx = cx(k), ky = cy(k);
    const nome = itens.filter((i) => Math.abs(cx(i) - kx) < 0.1 && cy(i) < ky && cy(i) > ky - 0.09);
    let preco: number | null = null, h = 0;
    itens.filter((i) => { const d = cx(i) - kx; return d > -0.02 && d < 0.16 && cy(i) < ky + 0.005 && cy(i) > ky - 0.09 && ehPreco(i.t); }).forEach((i) => {
      if (i.h > h * 1.05) { preco = precoNum(i.t); h = i.h; }
    });
    saida.push({ pagina, descricao: juntar(nome), preco, codigo: k.t.trim(), x: kx, y: ky - 0.04 });
  }
  return saida;
}

export function lerItensDoJornal(paginas: TextoPdf[][]): ItemLido[] {
  const todos = paginas.flatMap((p, i) => lerPagina(p, i + 1));
  // sem repetidos (mesmo código, ou mesmo nome + preço)
  const vistos = new Set<string>();
  return todos.filter((i) => {
    const k = i.codigo ? 'c' + i.codigo : 'n' + i.descricao.toUpperCase() + '|' + i.preco;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}
