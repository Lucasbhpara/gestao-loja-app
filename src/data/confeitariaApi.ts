import { supabase } from '../lib/supabase';

// =============================================================================
// Confeitaria — aba exclusiva de quem tem setor = 'confeitaria' no cadastro.
// Tabelas conf_* (ver supabase/confeitaria.sql). Nada aqui mistura com a loja.
// =============================================================================

export const SETOR_CONFEITARIA = 'confeitaria';

// ------------------------------------------------------------------ tipos
export type ItemFicha = {
  id?: string;
  grupo: string;
  nome: string;
  qtdTexto: string;
  embalagemTexto: string;
  precoEmbalagem: number | null;
  custo: number; // quanto esse item custa na receita inteira
  opcional: boolean;
};

export type Produto = {
  id: string;
  nome: string;
  sabor: string;
  categoria: string;
  rendimento: number;
  tamanho: string;
  montagem: string;
  precoVenda: number | null;
  fotoUrl: string | null;
  descricao: string;
  ativo: boolean;
  ordem: number;
  atualizadoEm: string;
  itens: ItemFicha[];
};

export type Compra = {
  id: string;
  data: string;
  item: string;
  categoria: string | null;
  quantidade: number | null;
  unidade: string | null;
  valorTotal: number;
  fornecedor: string | null;
  observacao: string | null;
  cupomChave: string | null;
};

export type Venda = {
  id: string;
  data: string;
  cliente: string | null;
  produtoId: string | null;
  produto: string;
  quantidade: number;
  precoUnitario: number;
  formaPagamento: string | null;
  recebido: boolean;
  observacao: string | null;
};

export type Producao = {
  id: string;
  data: string;
  produtoId: string | null;
  produto: string;
  quantidade: number;
  custoUnitario: number | null;
  observacao: string | null;
};

export type Investimento = {
  id: string;
  data: string;
  item: string;
  categoria: string | null;
  quantidade: number | null;
  valorTotal: number;
  formaPagamento: string | null;
  observacao: string | null;
};

export type ConfigConf = {
  marca: string;
  logoUrl: string | null;
  whatsapp: string;
  instagram: string;
  margem: number; // 0.6 = 60%
  clientes: string[];
  fornecedores: string[];
  formas: string[];
  categoriasCompra: string[];
};

export const GRUPOS_FICHA = ['Massa', 'Recheio', 'Calda', 'Cobertura', 'Embalagem', 'Adicionais'];
export const CATEGORIAS_PRODUTO = ['Doces', 'Salgados', 'Bolos', 'Base / recheio'];

// ------------------------------------------------------------- números
export const n = (v: any): number | null => (v == null || v === '' ? null : Number(v));
export function reais(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return 'R$ —';
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function numeroDigitado(t: string): number | null {
  const s = (t || '').trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (!s) return null;
  const v = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return isNaN(v) ? null : v;
}
export const numeroTexto = (v: number | null | undefined, casas = 2) =>
  v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
export function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const dataBr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const normalizar = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// ---------------------------------------------- quantidades e custo do item
// "1 xicara (130g)" → 130 g · "2 kg" → 2000 g · "400 ml" → 400 ml · "3 und" → 3 un
export function medida(texto: string | null | undefined): { valor: number; base: 'g' | 'ml' | 'un' } | null {
  if (!texto) return null;
  const t = normalizar(texto).replace(',', '.');
  const parenteses = t.match(/\(([\d.]+)\s*(kg|g|grs?|gramas?|ml|l|lt|litros?)\)/);
  const m = parenteses ?? t.match(/^([\d.]+)\s*(kg|g|grs?|gramas?|ml|l|lt|litros?|und|unid|un|unidades?|cx|caixas?|pct|fls)?\b/);
  if (!m) return null;
  const v = Number(m[1]);
  if (!isFinite(v) || v <= 0) return null;
  const u = m[2] ?? 'un';
  if (u === 'kg') return { valor: v * 1000, base: 'g' };
  if (/^(g|grs?|gramas?)$/.test(u)) return { valor: v, base: 'g' };
  if (u === 'ml') return { valor: v, base: 'ml' };
  if (/^(l|lt|litros?)$/.test(u)) return { valor: v * 1000, base: 'ml' };
  return { valor: v, base: 'un' };
}

// Custo do item a partir de "quanto usa", "embalagem" e "preço da embalagem".
// Devolve null quando não dá pra calcular (aí vale o custo digitado).
export function custoCalculado(qtdTexto: string, embalagemTexto: string, precoEmbalagem: number | null): number | null {
  if (precoEmbalagem == null) return null;
  const u = medida(qtdTexto);
  const e = medida(embalagemTexto);
  if (!u || !e || u.base !== e.base) return null;
  return Math.round((precoEmbalagem / e.valor) * u.valor * 10000) / 10000;
}

export function custoTotal(p: Pick<Produto, 'itens'>): number {
  return p.itens.filter((i) => !i.opcional).reduce((a, i) => a + (Number(i.custo) || 0), 0);
}
export function custoUnidade(p: Pick<Produto, 'itens' | 'rendimento'>): number {
  return p.rendimento > 0 ? custoTotal(p) / p.rendimento : custoTotal(p);
}
export function margemDe(p: Pick<Produto, 'itens' | 'rendimento' | 'precoVenda'>): number | null {
  if (!p.precoVenda) return null;
  return (p.precoVenda - custoUnidade(p)) / p.precoVenda;
}
export function precoSugerido(p: Pick<Produto, 'itens' | 'rendimento'>, margem: number): number {
  const c = custoUnidade(p);
  return margem < 1 ? Math.ceil((c / (1 - margem)) * 2) / 2 : c; // arredonda pra R$ 0,50
}
export const nomeCompleto = (p: Pick<Produto, 'nome' | 'sabor'>) => (p.sabor ? `${p.nome} · ${p.sabor}` : p.nome);

// ------------------------------------------------------------------ fotos
export async function enviarFotoConf(uriLocal: string, pasta: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `${pasta}/${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('confeitaria-fotos').upload(nomeArquivo, arrayBuffer, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return supabase.storage.from('confeitaria-fotos').getPublicUrl(nomeArquivo).data.publicUrl;
}

// ----------------------------------------------------------------- ajustes
const CONFIG_PADRAO: ConfigConf = {
  marca: 'Sabores da Pri',
  logoUrl: null,
  whatsapp: '',
  instagram: '',
  margem: 0.6,
  clientes: [],
  fornecedores: [],
  formas: ['Pix', 'Dinheiro', 'Cartão de Débito', 'Cartão de Crédito', 'Prazo'],
  categoriasCompra: ['Insumos', 'Embalagens', 'Periféricos', 'Marketing', 'Outros'],
};
const CHAVES: Record<keyof ConfigConf, string> = {
  marca: 'marca',
  logoUrl: 'logo_url',
  whatsapp: 'whatsapp',
  instagram: 'instagram',
  margem: 'margem',
  clientes: 'clientes',
  fornecedores: 'fornecedores',
  formas: 'formas',
  categoriasCompra: 'categorias_compra',
};

export async function carregarConfig(): Promise<ConfigConf> {
  const { data, error } = await supabase.from('conf_config').select('chave,valor');
  if (error) throw error;
  const c: any = { ...CONFIG_PADRAO };
  (data ?? []).forEach((l: any) => {
    const k = (Object.keys(CHAVES) as (keyof ConfigConf)[]).find((x) => CHAVES[x] === l.chave);
    if (k && l.valor != null) c[k] = l.valor;
  });
  c.margem = Number(c.margem) || 0.6;
  return c;
}

export async function salvarConfig(parte: Partial<ConfigConf>): Promise<void> {
  const linhas = (Object.keys(parte) as (keyof ConfigConf)[]).map((k) => ({ chave: CHAVES[k], valor: parte[k] as any, atualizado_em: new Date().toISOString() }));
  if (!linhas.length) return;
  const { error } = await supabase.from('conf_config').upsert(linhas, { onConflict: 'chave' });
  if (error) throw error;
}

// Guarda um nome novo (cliente/fornecedor) na lista, sem repetir
export async function lembrarNaLista(cfg: ConfigConf, lista: 'clientes' | 'fornecedores', nome: string | null): Promise<ConfigConf> {
  const v = (nome || '').trim();
  if (!v || cfg[lista].some((x) => normalizar(x) === normalizar(v))) return cfg;
  const nova = [...cfg[lista], v].sort((a, b) => a.localeCompare(b));
  await salvarConfig({ [lista]: nova } as any).catch(() => {});
  return { ...cfg, [lista]: nova };
}

// ---------------------------------------------------------------- produtos
function produtoDoBanco(p: any, itens: any[]): Produto {
  return {
    id: p.id,
    nome: p.nome ?? '',
    sabor: p.sabor ?? '',
    categoria: p.categoria ?? 'Doces',
    rendimento: Number(p.rendimento) || 1,
    tamanho: p.tamanho ?? '',
    montagem: p.montagem ?? '',
    precoVenda: n(p.preco_venda),
    fotoUrl: p.foto_url ?? null,
    descricao: p.descricao ?? '',
    ativo: p.ativo !== false,
    ordem: Number(p.ordem) || 0,
    atualizadoEm: p.atualizado_em,
    itens: itens
      .filter((i) => i.produto_id === p.id)
      .sort((a, b) => a.ordem - b.ordem)
      .map((i) => ({
        id: i.id,
        grupo: i.grupo ?? 'Massa',
        nome: i.nome ?? '',
        qtdTexto: i.qtd_texto ?? '',
        embalagemTexto: i.embalagem_texto ?? '',
        precoEmbalagem: n(i.preco_embalagem),
        custo: Number(i.custo) || 0,
        opcional: !!i.opcional,
      })),
  };
}

async function tudo(tabela: string, colunas: string, ordem?: { col: string; asc: boolean }): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; de < 50000; de += 1000) {
    let q = supabase.from(tabela).select(colunas);
    if (ordem) q = q.order(ordem.col, { ascending: ordem.asc });
    const { data, error } = await q.order('id').range(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function listarProdutos(): Promise<Produto[]> {
  const [ps, its] = await Promise.all([
    tudo('conf_produtos', '*', { col: 'ordem', asc: true }),
    tudo('conf_produto_itens', '*'),
  ]);
  return ps.map((p) => produtoDoBanco(p, its));
}

export async function salvarProduto(p: Omit<Produto, 'id' | 'atualizadoEm'> & { id?: string }): Promise<string> {
  const linha = {
    nome: p.nome.trim(),
    sabor: p.sabor.trim() || null,
    categoria: p.categoria,
    rendimento: p.rendimento > 0 ? p.rendimento : 1,
    tamanho: p.tamanho.trim() || null,
    montagem: p.montagem.trim() || null,
    preco_venda: p.precoVenda,
    foto_url: p.fotoUrl,
    descricao: p.descricao.trim() || null,
    ativo: p.ativo,
    ordem: p.ordem,
    atualizado_em: new Date().toISOString(),
  };
  let id = p.id;
  if (id) {
    const { error } = await supabase.from('conf_produtos').update(linha).eq('id', id);
    if (error) throw error;
    const { error: e2 } = await supabase.from('conf_produto_itens').delete().eq('produto_id', id);
    if (e2) throw e2;
  } else {
    const { data, error } = await supabase.from('conf_produtos').insert(linha).select('id').single();
    if (error) throw error;
    id = data.id as string;
  }
  if (p.itens.length) {
    const { error } = await supabase.from('conf_produto_itens').insert(
      p.itens.map((i, k) => ({
        produto_id: id,
        grupo: i.grupo,
        nome: i.nome.trim(),
        qtd_texto: i.qtdTexto.trim() || null,
        embalagem_texto: i.embalagemTexto.trim() || null,
        preco_embalagem: i.precoEmbalagem,
        custo: Math.round((Number(i.custo) || 0) * 10000) / 10000,
        opcional: i.opcional,
        ordem: k,
      })),
    );
    if (error) throw error;
  }
  return id!;
}

export async function excluirProduto(id: string): Promise<void> {
  const { error } = await supabase.from('conf_produtos').delete().eq('id', id);
  if (error) throw error;
}

export async function atualizarFotoProduto(id: string, fotoUrl: string | null): Promise<void> {
  const { error } = await supabase.from('conf_produtos').update({ foto_url: fotoUrl }).eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------- insumos
// "Insumo" = cada ingrediente/embalagem que aparece nas fichas, agrupado pelo
// nome. Mudar o preço da embalagem aqui atualiza todas as fichas que usam esse
// item, mantendo a mesma quantidade usada (o custo muda na mesma proporção).
export type Insumo = { chave: string; nome: string; embalagemTexto: string; precoEmbalagem: number | null; usos: { produto: Produto; item: ItemFicha }[] };

export function insumosDasFichas(produtos: Produto[]): Insumo[] {
  const m = new Map<string, Insumo>();
  for (const p of produtos)
    for (const i of p.itens) {
      if (/^adicionais$/i.test(i.grupo) || /m[aã]o de obra/i.test(i.nome)) continue;
      const chave = normalizar(i.nome).replace(/\s*-\s*op[cç][aã]o \d+/, '');
      let ins = m.get(chave);
      if (!ins) {
        ins = { chave, nome: i.nome.trim(), embalagemTexto: i.embalagemTexto, precoEmbalagem: i.precoEmbalagem, usos: [] };
        m.set(chave, ins);
      }
      if (ins.precoEmbalagem == null && i.precoEmbalagem != null) {
        ins.precoEmbalagem = i.precoEmbalagem;
        ins.embalagemTexto = i.embalagemTexto;
      }
      ins.usos.push({ produto: p, item: i });
    }
  return Array.from(m.values()).sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function atualizarPrecoInsumo(ins: Insumo, novoPreco: number, novaEmbalagem?: string): Promise<number> {
  let alterados = 0;
  for (const { item } of ins.usos) {
    if (!item.id) continue;
    const emb = novaEmbalagem?.trim() || item.embalagemTexto;
    let custo = custoCalculado(item.qtdTexto, emb, novoPreco);
    if (custo == null) {
      const antigo = item.precoEmbalagem;
      custo = antigo && antigo > 0 && (!novaEmbalagem || novaEmbalagem.trim() === item.embalagemTexto) ? (item.custo * novoPreco) / antigo : item.custo;
    }
    const { error } = await supabase
      .from('conf_produto_itens')
      .update({ preco_embalagem: novoPreco, embalagem_texto: emb || null, custo: Math.round(custo * 10000) / 10000 })
      .eq('id', item.id);
    if (error) throw error;
    alterados++;
  }
  const ids = Array.from(new Set(ins.usos.map((u) => u.produto.id)));
  if (ids.length) await supabase.from('conf_produtos').update({ atualizado_em: new Date().toISOString() }).in('id', ids);
  return alterados;
}

// ---------------------------------------------------------------- compras
const compraDoBanco = (c: any): Compra => ({
  id: c.id,
  data: c.data,
  item: c.item,
  categoria: c.categoria,
  quantidade: n(c.quantidade),
  unidade: c.unidade,
  valorTotal: Number(c.valor_total) || 0,
  fornecedor: c.fornecedor,
  observacao: c.observacao,
  cupomChave: c.cupom_chave,
});
export async function listarCompras(): Promise<Compra[]> {
  return (await tudo('conf_compras', '*', { col: 'data', asc: false })).map(compraDoBanco);
}
export type NovaCompra = Omit<Compra, 'id'>;
const compraParaBanco = (c: NovaCompra) => ({
  data: c.data,
  item: c.item.trim(),
  categoria: c.categoria,
  quantidade: c.quantidade,
  unidade: c.unidade,
  valor_total: Math.round(c.valorTotal * 100) / 100,
  fornecedor: c.fornecedor?.trim() || null,
  observacao: c.observacao?.trim() || null,
  cupom_chave: c.cupomChave,
});
export async function inserirCompras(lista: NovaCompra[]): Promise<void> {
  if (!lista.length) return;
  const { error } = await supabase.from('conf_compras').insert(lista.map(compraParaBanco));
  if (error) throw error;
}
export async function atualizarCompra(id: string, c: NovaCompra): Promise<void> {
  const { error } = await supabase.from('conf_compras').update(compraParaBanco(c)).eq('id', id);
  if (error) throw error;
}
export async function excluirCompra(id: string): Promise<void> {
  const { error } = await supabase.from('conf_compras').delete().eq('id', id);
  if (error) throw error;
}
export async function cupomJaLancado(chave: string): Promise<boolean> {
  const { data } = await supabase.from('conf_compras').select('id').eq('cupom_chave', chave).limit(1);
  return !!(data && data.length);
}

// ----------------------------------------------------------------- vendas
const vendaDoBanco = (v: any): Venda => ({
  id: v.id,
  data: v.data,
  cliente: v.cliente,
  produtoId: v.produto_id,
  produto: v.produto,
  quantidade: Number(v.quantidade) || 0,
  precoUnitario: Number(v.preco_unitario) || 0,
  formaPagamento: v.forma_pagamento,
  recebido: !!v.recebido,
  observacao: v.observacao,
});
export async function listarVendas(): Promise<Venda[]> {
  return (await tudo('conf_vendas', '*', { col: 'data', asc: false })).map(vendaDoBanco);
}
export type NovaVenda = Omit<Venda, 'id'>;
const vendaParaBanco = (v: NovaVenda) => ({
  data: v.data,
  cliente: v.cliente?.trim() || null,
  produto_id: v.produtoId,
  produto: v.produto.trim(),
  quantidade: v.quantidade,
  preco_unitario: v.precoUnitario,
  forma_pagamento: v.formaPagamento,
  recebido: v.recebido,
  observacao: v.observacao?.trim() || null,
});
export async function inserirVendas(lista: NovaVenda[]): Promise<void> {
  if (!lista.length) return;
  const { error } = await supabase.from('conf_vendas').insert(lista.map(vendaParaBanco));
  if (error) throw error;
}
export async function atualizarVenda(id: string, v: NovaVenda): Promise<void> {
  const { error } = await supabase.from('conf_vendas').update(vendaParaBanco(v)).eq('id', id);
  if (error) throw error;
}
export async function marcarRecebido(id: string, recebido: boolean): Promise<void> {
  const { error } = await supabase.from('conf_vendas').update({ recebido }).eq('id', id);
  if (error) throw error;
}
export async function excluirVenda(id: string): Promise<void> {
  const { error } = await supabase.from('conf_vendas').delete().eq('id', id);
  if (error) throw error;
}

// --------------------------------------------------------------- produção
const producaoDoBanco = (p: any): Producao => ({
  id: p.id,
  data: p.data,
  produtoId: p.produto_id,
  produto: p.produto,
  quantidade: Number(p.quantidade) || 0,
  custoUnitario: n(p.custo_unitario),
  observacao: p.observacao,
});
export async function listarProducao(): Promise<Producao[]> {
  return (await tudo('conf_producao', '*', { col: 'data', asc: false })).map(producaoDoBanco);
}
export type NovaProducao = Omit<Producao, 'id'>;
const producaoParaBanco = (p: NovaProducao) => ({
  data: p.data,
  produto_id: p.produtoId,
  produto: p.produto.trim(),
  quantidade: p.quantidade,
  custo_unitario: p.custoUnitario,
  observacao: p.observacao?.trim() || null,
});
export async function inserirProducao(p: NovaProducao): Promise<void> {
  const { error } = await supabase.from('conf_producao').insert(producaoParaBanco(p));
  if (error) throw error;
}
export async function atualizarProducao(id: string, p: NovaProducao): Promise<void> {
  const { error } = await supabase.from('conf_producao').update(producaoParaBanco(p)).eq('id', id);
  if (error) throw error;
}
export async function excluirProducao(id: string): Promise<void> {
  const { error } = await supabase.from('conf_producao').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------- investimentos
const investDoBanco = (i: any): Investimento => ({
  id: i.id,
  data: i.data,
  item: i.item,
  categoria: i.categoria,
  quantidade: n(i.quantidade),
  valorTotal: Number(i.valor_total) || 0,
  formaPagamento: i.forma_pagamento,
  observacao: i.observacao,
});
export async function listarInvestimentos(): Promise<Investimento[]> {
  return (await tudo('conf_investimentos', '*', { col: 'data', asc: false })).map(investDoBanco);
}
export type NovoInvestimento = Omit<Investimento, 'id'>;
const investParaBanco = (i: NovoInvestimento) => ({
  data: i.data,
  item: i.item.trim(),
  categoria: i.categoria,
  quantidade: i.quantidade,
  valor_total: i.valorTotal,
  forma_pagamento: i.formaPagamento,
  observacao: i.observacao?.trim() || null,
});
export async function inserirInvestimento(i: NovoInvestimento): Promise<void> {
  const { error } = await supabase.from('conf_investimentos').insert(investParaBanco(i));
  if (error) throw error;
}
export async function atualizarInvestimento(id: string, i: NovoInvestimento): Promise<void> {
  const { error } = await supabase.from('conf_investimentos').update(investParaBanco(i)).eq('id', id);
  if (error) throw error;
}
export async function excluirInvestimento(id: string): Promise<void> {
  const { error } = await supabase.from('conf_investimentos').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------- painel
export type Resumo = {
  vendidoMes: number;
  recebidoMes: number;
  aReceber: number;
  comprasMes: number;
  custoProduzidoMes: number;
  lucroEstimadoMes: number;
  vendidoTotal: number;
  comprasTotal: number;
  investidoTotal: number;
  saldoGeral: number;
  topProdutos: { produto: string; qtd: number; valor: number }[];
  clientesDevendo: { cliente: string; valor: number }[];
};

export function montarResumo(
  vendas: Venda[],
  compras: Compra[],
  producao: Producao[],
  invest: Investimento[],
  mes = hojeIso().slice(0, 7),
): Resumo {
  const doMes = <T extends { data: string }>(l: T[]) => l.filter((x) => x.data?.slice(0, 7) === mes);
  const total = (v: Venda) => v.quantidade * v.precoUnitario;
  const vm = doMes(vendas);
  const vendidoMes = vm.reduce((a, v) => a + total(v), 0);
  const recebidoMes = vm.filter((v) => v.recebido).reduce((a, v) => a + total(v), 0);
  const aReceber = vendas.filter((v) => !v.recebido).reduce((a, v) => a + total(v), 0);
  const comprasMes = doMes(compras).reduce((a, c) => a + c.valorTotal, 0);
  const custoProduzidoMes = doMes(producao).reduce((a, p) => a + p.quantidade * (p.custoUnitario ?? 0), 0);
  const vendidoTotal = vendas.reduce((a, v) => a + total(v), 0);
  const comprasTotal = compras.reduce((a, c) => a + c.valorTotal, 0);
  const investidoTotal = invest.reduce((a, i) => a + i.valorTotal, 0);
  const porProduto = new Map<string, { produto: string; qtd: number; valor: number }>();
  vm.forEach((v) => {
    const k = v.produto;
    const r = porProduto.get(k) ?? { produto: k, qtd: 0, valor: 0 };
    r.qtd += v.quantidade;
    r.valor += total(v);
    porProduto.set(k, r);
  });
  const devendo = new Map<string, number>();
  vendas
    .filter((v) => !v.recebido)
    .forEach((v) => devendo.set(v.cliente || 'Sem nome', (devendo.get(v.cliente || 'Sem nome') ?? 0) + total(v)));
  return {
    vendidoMes,
    recebidoMes,
    aReceber,
    comprasMes,
    custoProduzidoMes,
    lucroEstimadoMes: vendidoMes - custoProduzidoMes,
    vendidoTotal,
    comprasTotal,
    investidoTotal,
    saldoGeral: vendidoTotal - comprasTotal - investidoTotal,
    topProdutos: Array.from(porProduto.values()).sort((a, b) => b.valor - a.valor).slice(0, 5),
    clientesDevendo: Array.from(devendo.entries())
      .map(([cliente, valor]) => ({ cliente, valor }))
      .sort((a, b) => b.valor - a.valor),
  };
}

// ------------------------------------------------------- cupom fiscal (NFC-e)
// O QR Code do cupom abre a página da Fazenda com os itens. O app abre essa
// página escondida, copia o texto de cada linha da tabela (JS injetado) e
// separa nome, quantidade, unidade e valor. Funciona com o layout nacional
// (Qtde.: / UN: / Vl. Total) e com o de Minas (Qtde total de ítens / Valor total R$).
export const JS_LER_NFCE = `
(function () {
  function txt(el) { return (el && (el.innerText || el.textContent) || '').replace(/\\s+/g, ' ').trim(); }
  try {
    var linhas = [];
    document.querySelectorAll('tr').forEach(function (tr) { if (tr.querySelector('tr')) return; var t = txt(tr); if (t) linhas.push(t); });
    if (!linhas.length) document.querySelectorAll('li, .item, div[id^="Item"]').forEach(function (el) { var t = txt(el); if (t && /Qtde/i.test(t)) linhas.push(t); });
    var corpo = txt(document.body).slice(0, 30000);
    var emit = txt(document.querySelector('#u20, .txtTopo, #conteudo .txtCenter, h4, strong'));
    window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'nfce', linhas: linhas, corpo: corpo, emitente: emit, url: location.href }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ tipo: 'erro', mensagem: String(e && e.message || e) }));
  }
})();
true;
`;

export type ItemCupom = { nome: string; quantidade: number; unidade: string; valorTotal: number };

function numBr(s: string | undefined): number | null {
  if (!s) return null;
  // "1.234,56" (BR) · "2.0000" (ponto decimal, layout de MG)
  const v = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return isNaN(v) ? null : v;
}

export function lerItensCupom(linhas: string[], corpo: string): { itens: ItemCupom[]; emitente: string | null; data: string | null; total: number | null } {
  const itens: ItemCupom[] = [];
  for (const l of linhas) {
    const qtd = l.match(/Qtde\.?(?:\s*total\s*de\s*[íi]tens)?\s*:?\s*([\d.,]+)/i);
    const tot = l.match(/(?:Vl\.?\s*Total|Valor\s*total\s*R\$|Valor\s*total)\s*:?\s*(?:R\$\s*)?([\d.]*\d,\d{2})/i);
    if (!qtd || !tot) continue;
    let nome = l.split(/\(C[óo]d(?:igo)?\.?\s*:|Qtde/i)[0].trim();
    nome = nome.replace(/^\d+\s+/, '').trim();
    if (!nome) continue;
    const un = l.match(/\bUN\s*:\s*([A-Za-z]{1,4})/i);
    const item = { nome, quantidade: numBr(qtd[1]) ?? 1, unidade: (un?.[1] ?? 'UN').toUpperCase(), valorTotal: numBr(tot[1]) ?? 0 };
    itens.push(item);
  }
  const data = corpo.match(/Emiss[ãa]o\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i) ?? corpo.match(/(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}/);
  const total = corpo.match(/Valor\s+a\s+pagar\s*R?\$?\s*:?\s*([\d.]*\d,\d{2})/i) ?? corpo.match(/Valor\s+total\s+R?\$?\s*:?\s*([\d.]*\d,\d{2})(?![\s\S]*Valor\s+total)/i);
  const emitente = corpo.match(/^\s*([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .&\-/]{3,60}?)\s+CNPJ/m)?.[1]?.trim() ?? null;
  return { itens, emitente, data: data ? `${data[3]}-${data[2]}-${data[1]}` : null, total: total ? numBr(total[1]) : null };
}

// Categoria sugerida pelo nome do item do cupom
export function categoriaSugerida(nome: string): string {
  const t = normalizar(nome);
  if (/pote|embalag|tampa|saco|saquinho|bandeja|forma|caixa|etiqueta|fita|papel|guardanapo|colher|garfo|filme|disco/.test(t)) return 'Embalagens';
  return 'Insumos';
}
