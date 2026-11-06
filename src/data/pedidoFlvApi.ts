import { supabase } from '../lib/supabase';
import { enviarPedido } from './pedidosApi';

// =============================================================================
// Sugestão de pedido do FLV
//
// Calendário: pedido segunda, quarta e sexta; entrega terça, quinta e sábado.
// Cada entrega cobre do dia da entrega até a PRÓXIMA entrega (incluindo ela,
// como folga contra ruptura):
//   pedido seg → entrega ter → cobre ter, qua, qui
//   pedido qua → entrega qui → cobre qui, sex, sáb
//   pedido sex → entrega sáb → cobre sáb, dom, seg, ter
//
// Base de venda: para cada dia coberto, o MESMO dia da semana na MESMA
// semana do mês anterior (1ª quinta de novembro → 1ª quinta de outubro).
// Se esse dia foi feriado, usa o mesmo dia da semana anterior.
//
// Conta, por produto:
//   venda base (kg ou un) × (1 + margem de quebra)
//   − estoque contado na câmara (caixas × kg/un por caixa; caixa aberta = 0)
//   → convertido para caixas e arredondado para cima.
//
// O volume vendido é aproximado: valor vendido ÷ preço de venda atual (a
// planilha do Falcon só traz o valor), igual à "Venda do dia".
// =============================================================================

export const SETOR_FLV = 'flv';
export const MARGEM_PADRAO = 4;
const CHAVE_MARGEM = 'flv_margem_quebra';

const DIAS_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// ---------- datas (sempre 'AAAA-MM-DD', calculadas em UTC) ----------
function paraData(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}
function paraIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function somarDias(iso: string, n: number): string {
  const d = paraData(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return paraIso(d);
}
export function diaSemana(iso: string): number {
  return paraData(iso).getUTCDay();
}
export function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dataCurta(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${DIAS_CURTO[diaSemana(iso)]} ${d}/${m}`;
}

// Domingo de Páscoa (algoritmo de Meeus/Butcher).
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const cacheFeriados = new Map<number, Set<string>>();
// Feriados nacionais + Carnaval, Sexta-feira Santa e Corpus Christi.
export function feriadosDoAno(ano: number): Set<string> {
  const pronto = cacheFeriados.get(ano);
  if (pronto) return pronto;
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map((md) => `${ano}-${md}`);
  const p = paraIso(pascoa(ano));
  const moveis = [-48, -47, -2, 60].map((n) => somarDias(p, n));
  const s = new Set([...fixos, ...moveis]);
  cacheFeriados.set(ano, s);
  return s;
}
export function ehFeriado(iso: string): boolean {
  return feriadosDoAno(Number(iso.slice(0, 4))).has(iso);
}

// Mesmo dia da semana, mesma semana (1ª, 2ª, ...) do mês anterior. Se o mês
// anterior não tiver a 5ª ocorrência, usa a última. Feriado → semana antes.
export function diaBaseMesAnterior(iso: string): { base: string; trocouFeriado: boolean } {
  const d = paraData(iso);
  const semana = Math.ceil(d.getUTCDate() / 7); // 1..5
  const ds = d.getUTCDay();
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth() - 1; // mês anterior (Date.UTC ajusta janeiro → dezembro)
  const primeiro = new Date(Date.UTC(ano, mes, 1));
  const desloc = (ds - primeiro.getUTCDay() + 7) % 7;
  let alvo = new Date(Date.UTC(ano, mes, 1 + desloc + (semana - 1) * 7));
  if (alvo.getUTCMonth() !== primeiro.getUTCMonth()) alvo = new Date(Date.UTC(ano, mes, 1 + desloc + (semana - 2) * 7));
  let base = paraIso(alvo);
  let trocouFeriado = false;
  while (ehFeriado(base)) {
    base = somarDias(base, -7);
    trocouFeriado = true;
  }
  return { base, trocouFeriado };
}

// ---------- calendário de pedidos ----------
export const DIAS_PEDIDO = [1, 3, 5]; // seg, qua, sex

export interface JanelaPedido {
  pedido: string;
  entrega: string;
  proximaEntrega: string;
  dias: { dia: string; base: string; trocouFeriado: boolean }[];
}

export function janelaDoPedido(pedido: string): JanelaPedido {
  const entrega = somarDias(pedido, 1);
  const dsEntrega = diaSemana(entrega); // 2 ter, 4 qui, 6 sáb
  const ate = dsEntrega === 6 ? 3 : 2;
  const proximaEntrega = somarDias(entrega, ate);
  const dias: JanelaPedido['dias'] = [];
  for (let i = 0; i <= ate; i++) {
    const dia = somarDias(entrega, i);
    dias.push({ dia, ...diaBaseMesAnterior(dia) });
  }
  return { pedido, entrega, proximaEntrega, dias };
}

// Próximos dias de pedido a partir de hoje (inclui hoje se for seg/qua/sex).
export function proximosPedidos(qtd = 3, a_partir = hojeIso()): string[] {
  const lista: string[] = [];
  let d = a_partir;
  while (lista.length < qtd) {
    if (DIAS_PEDIDO.includes(diaSemana(d))) lista.push(d);
    d = somarDias(d, 1);
  }
  return lista;
}

// ---------- dados ----------
export interface ConversaoFlv {
  codigo: string;
  produto: string;
  controla: 'KG' | 'UN';
  embalagem: string | null;
  kgPorEmb: number | null;
  unPorEmb: number | null;
}

export interface ItemSugestao {
  codigo: string;
  produto: string;
  unidade: 'kg' | 'un';
  embalagem: string | null;
  fator: number | null; // kg ou un por caixa (null = sem conversão)
  preco: number | null;
  vendaBase: number; // kg/un vendidos nos dias-base
  vendaPorDia: number[]; // na mesma ordem de janela.dias
  necessidade: number; // vendaBase × (1 + margem)
  contagem: number; // o que foi contado na câmara (caixas, ou kg/un sem conversão)
  estoque: number; // contagem convertida em kg/un
  falta: number; // necessidade − estoque (≥ 0)
  sugestao: number; // caixas (ou kg/un quando não tem conversão)
}

export interface BaseSugestao {
  janela: JanelaPedido;
  margem: number;
  conversao: ConversaoFlv[];
  precos: Record<string, number>;
  valores: Record<string, number[]>; // R$ vendido por dia-base, na ordem de janela.dias
  contagem: Record<string, number>;
  ultimaVendaCarregada: string | null;
  diasBaseSemDados: string[];
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function buscarConversao(): Promise<ConversaoFlv[]> {
  const { data, error } = await supabase.from('flv_conversao').select('*').order('produto', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    codigo: String(l.codigo),
    produto: l.produto,
    controla: l.controla === 'UN' ? 'UN' : 'KG',
    embalagem: l.embalagem,
    kgPorEmb: num(l.kg_por_emb),
    unPorEmb: num(l.un_por_emb),
  }));
}

export async function buscarMargem(): Promise<number> {
  const { data } = await supabase.from('system_config').select('value').eq('key', CHAVE_MARGEM).maybeSingle();
  const n = num(data?.value);
  return n === null ? MARGEM_PADRAO : n;
}

export async function salvarMargem(margem: number): Promise<void> {
  const { error } = await supabase
    .from('system_config')
    .upsert({ key: CHAVE_MARGEM, value: String(margem), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function buscarContagem(dataPedido: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('flv_contagem_camara').select('codigo, caixas').eq('data_pedido', dataPedido);
  if (error) throw error;
  const r: Record<string, number> = {};
  (data ?? []).forEach((l: any) => (r[String(l.codigo)] = Number(l.caixas)));
  return r;
}

export async function salvarContagem(dataPedido: string, codigo: string, caixas: number | null, contadoPor: string): Promise<void> {
  if (caixas === null) {
    const { error } = await supabase.from('flv_contagem_camara').delete().eq('data_pedido', dataPedido).eq('codigo', codigo);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('flv_contagem_camara')
    .upsert({ data_pedido: dataPedido, codigo, caixas, contado_por: contadoPor, atualizado_em: new Date().toISOString() }, { onConflict: 'data_pedido,codigo' });
  if (error) throw error;
}

async function precosAtuais(codigos: string[]): Promise<Record<string, number>> {
  const preco: Record<string, number> = {};
  const [r1, r2] = await Promise.all([
    supabase.from('produtos_classes').select('codigo_produto, preco_venda').in('codigo_produto', codigos),
    supabase.from('estoque_loja_itens').select('codigo_interno, preco_venda').in('codigo_interno', codigos),
  ]);
  ((r1.data as any[]) || []).forEach((x) => {
    if (Number(x.preco_venda) > 0) preco[String(x.codigo_produto)] = Number(x.preco_venda);
  });
  // Estoque Loja é o preço mais recente: tem prioridade.
  ((r2.data as any[]) || []).forEach((x) => {
    if (Number(x.preco_venda) > 0) preco[String(x.codigo_interno)] = Number(x.preco_venda);
  });
  return preco;
}

// Venda em R$ por produto e por dia, só dos dias-base.
async function vendasDosDias(codigos: string[], dias: string[]): Promise<Record<string, Record<string, number>>> {
  const r: Record<string, Record<string, number>> = {};
  const { data, error } = await supabase
    .from('vendas_diarias')
    .select('codigo_produto, data_venda, venda_valor')
    .in('codigo_produto', codigos)
    .in('data_venda', dias)
    .range(0, 4999);
  if (error) throw error;
  ((data as any[]) || []).forEach((l) => {
    const c = String(l.codigo_produto);
    (r[c] ??= {})[l.data_venda] = (r[c]?.[l.data_venda] ?? 0) + Number(l.venda_valor);
  });
  return r;
}

async function ultimaVenda(): Promise<string | null> {
  const { data } = await supabase.from('vendas_diarias').select('data_venda').order('data_venda', { ascending: false }).limit(1);
  return data && data.length ? (data[0] as any).data_venda : null;
}

export function fatorDe(c: ConversaoFlv): number | null {
  const f = c.controla === 'KG' ? c.kgPorEmb : c.unPorEmb;
  return f && f > 0 ? f : null;
}

// Conta pura (sem banco) — separada para dar pra conferir à mão.
export function calcularItem(
  c: ConversaoFlv,
  preco: number | null,
  vendaValorPorDia: number[],
  margem: number,
  contagem: number,
): ItemSugestao {
  const fator = fatorDe(c);
  const unidade = c.controla === 'KG' ? 'kg' : 'un';
  const vendaPorDia = vendaValorPorDia.map((v) => (preco ? v / preco : 0));
  const vendaBase = vendaPorDia.reduce((a, b) => a + b, 0);
  const necessidade = vendaBase * (1 + margem / 100);
  const estoque = fator ? contagem * fator : contagem;
  const falta = Math.max(0, necessidade - estoque);
  const eps = 1e-9;
  const sugestao = falta <= eps ? 0 : fator ? Math.ceil(falta / fator - eps) : Math.ceil(falta - eps);
  return { codigo: c.codigo, produto: c.produto, unidade, embalagem: c.embalagem, fator, preco, vendaBase, vendaPorDia, necessidade, contagem, estoque, falta, sugestao };
}

export async function carregarBaseSugestao(dataPedido: string): Promise<BaseSugestao> {
  const janela = janelaDoPedido(dataPedido);
  const [conversao, margem, contagem, ultima] = await Promise.all([buscarConversao(), buscarMargem(), buscarContagem(dataPedido), ultimaVenda()]);
  const codigos = conversao.map((c) => c.codigo);
  const diasBase = Array.from(new Set(janela.dias.map((d) => d.base)));
  const [precos, vendas] = codigos.length
    ? await Promise.all([precosAtuais(codigos), vendasDosDias(codigos, diasBase)])
    : [{}, {}] as [Record<string, number>, Record<string, Record<string, number>>];
  const valores: Record<string, number[]> = {};
  codigos.forEach((c) => (valores[c] = janela.dias.map((d) => vendas[c]?.[d.base] ?? 0)));
  const diasBaseSemDados = diasBase.filter((d) => !ultima || d > ultima);
  return { janela, margem, conversao, precos, valores, contagem, ultimaVendaCarregada: ultima, diasBaseSemDados };
}

export function calcularSugestao(b: BaseSugestao, margem: number, contagem: Record<string, number>): ItemSugestao[] {
  return b.conversao.map((c) => calcularItem(c, b.precos[c.codigo] ?? null, b.valores[c.codigo] ?? [], margem, contagem[c.codigo] ?? 0));
}

// ---------- saída ----------
export function rotuloSugestao(i: ItemSugestao, qtd = i.sugestao): string {
  if (i.fator) return `${qtd} cx`;
  return `${qtd} ${i.unidade}`;
}

const fmt = (n: number, casas = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

export function textoPedido(janela: JanelaPedido, itens: { item: ItemSugestao; qtd: number }[]): string {
  const linhas = itens
    .filter((x) => x.qtd > 0)
    .sort((a, b) => a.item.produto.localeCompare(b.item.produto))
    .map((x) => `• ${x.item.codigo} ${x.item.produto}: *${rotuloSugestao(x.item, x.qtd)}*${x.item.fator && x.item.embalagem ? ` (${x.item.embalagem})` : ''}`);
  return (
    `*Pedido FLV — ${dataCurta(janela.pedido)}*\n` +
    `Entrega ${dataCurta(janela.entrega)} · cobre até ${dataCurta(janela.proximaEntrega)}\n\n` +
    linhas.join('\n') +
    `\n\n${linhas.length} itens · ULVA`
  );
}

export async function enviarPedidoFlv(janela: JanelaPedido, itens: { item: ItemSugestao; qtd: number }[], nome: string) {
  const lista = itens
    .filter((x) => x.qtd > 0)
    .map((x) => ({
      codigo: x.item.codigo,
      produto: `${x.item.produto} (${x.item.fator ? `cx${x.item.embalagem ? ' · ' + x.item.embalagem : ''}` : x.item.unidade}) · entrega ${dataCurta(janela.entrega)}`,
      quantidade: x.qtd,
    }));
  return enviarPedido({ setor: SETOR_FLV, encarregadoNome: nome, itens: lista });
}

// Manda o pedido para a fila da extensão do Chrome, que digita no formulário
// MG CEASA do Portal 360 (tabela pedido_cd_solicitacoes, formulario = 'MG CEASA').
// Vai a quantidade já decidida aqui (caixas). Item sem conversão para caixa fica de fora.
export async function enviarFlvParaPortal(janela: JanelaPedido, itens: { item: ItemSugestao; qtd: number }[], nome: string) {
  const comCaixa = itens.filter((x) => x.qtd > 0 && x.item.fator);
  const semCaixa = itens.filter((x) => x.qtd > 0 && !x.item.fator);
  if (!comCaixa.length) return { enviados: 0, semCaixa: semCaixa.length };
  const { error } = await supabase.from('pedido_cd_solicitacoes').insert({
    formulario: 'MG CEASA',
    grupos: `FLV · pedido ${dataCurta(janela.pedido)} (entrega ${dataCurta(janela.entrega)})`,
    criado_por: nome,
    itens: comCaixa.map((x) => ({ codigo: x.item.codigo, produto: x.item.produto, qtd: x.qtd })),
  });
  if (error) throw new Error(error.message);
  return { enviados: comCaixa.length, semCaixa: semCaixa.length };
}

export { fmt as formatarNumero };
