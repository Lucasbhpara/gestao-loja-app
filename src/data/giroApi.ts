import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import PAI_FILHO from './paiFilho.json';

// =============================================================================
// Giro de Produtos — quais produtos estão sem venda ou parados.
//
// Fonte (já no banco):
//   - giro_produtos (view): por produto, setor/subsetor/categoria/subcategoria
//     (classes do Falcon), dias com venda, última venda, venda no período.
//     Calculada a partir de vendas_diarias (venda em R$ por produto por dia).
//   - estoque_loja_itens: estoque atual da loja 327 (o mesmo do "Estoque Loja",
//     que é atualizado pelo Portal → "Atualizar estoque (planilha)") e o custo.
//     Produto que não está lá = estoque zero.
//
// "Dias parado" conta a partir do ÚLTIMO dia de venda carregado no banco
// (não de hoje), pra não inflar quando a carga das vendas atrasa.
//
// Produtos "ocultos": insumos/embalagens que não são vendidos direto (pão
// congelado, carne em peça, sacola...). Os setores que nunca são de venda já
// vêm ocultos; o resto o usuário oculta à mão — por enquanto salvo só neste
// aparelho (AsyncStorage).
// =============================================================================

export interface ProdutoGiro {
  codigo: string;
  nome: string;
  setor: string;
  subsetor: string;
  categoria: string;
  subcategoria: string;
  estoque: number;
  estoqueSistema: number; // como veio do Estoque Loja, antes do ajuste pai/filho
  custoMedio: number;
  custoEstoque: number; // estoque (positivo) × custo médio
  diasComVenda: number;
  ultimaVenda: string | null; // yyyy-mm-dd
  diasParado: number | null; // null = sem nenhuma venda no período
  vendaPeriodo: number;
  ocultoPorSetor: boolean;
  ajustePaiFilho?: string; // texto curto quando o estoque foi corrigido pela regra pai/filho // setor/subcategoria que nunca é de venda (insumo, embalagem)
}

export interface BaseGiro {
  produtos: ProdutoGiro[];
  periodoInicio: string | null;
  periodoFim: string | null;
  estoqueData: string | null; // data da planilha do Estoque Loja
  carregadoEm: number;
}

export const SETORES_FORA_DE_VENDA = [
  'NI',
  'EMBALAGENS',
  'EMBALAGEM/GARRAFEIRA/GF',
  'MANUTENCAO',
  'ALMOX/RH/MANUT/EPI/ARTES',
  'DIVERSOS',
];

// Subcategorias de insumo (não vendidas direto ao cliente).
export const SUBCATEGORIAS_FORA_DE_VENDA = ['MATERIA PRIMA PRODUCAO'];

const PAGINA = 1000;
let cache: BaseGiro | null = null;

async function buscarTudo<T>(tabela: string, colunas: string, ordem: string): Promise<T[]> {
  const { count, error } = await supabase.from(tabela).select(ordem, { count: 'exact', head: true });
  if (error) throw error;
  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / PAGINA));
  const partes = await Promise.all(
    Array.from({ length: paginas }, (_, i) =>
      supabase
        .from(tabela)
        .select(colunas)
        .order(ordem, { ascending: true })
        .range(i * PAGINA, i * PAGINA + PAGINA - 1)
        .then(({ data, error: e }) => {
          if (e) throw e;
          return (data ?? []) as T[];
        })
    )
  );
  return partes.flat();
}

const limpa = (s: string | null | undefined, padrao: string) => {
  const t = (s ?? '').trim();
  return t || padrao;
};

function diasEntre(de: string, ate: string): number {
  const a = new Date(de + 'T12:00:00').getTime();
  const b = new Date(ate + 'T12:00:00').getTime();
  return Math.round((b - a) / 86_400_000);
}

export async function carregarBaseGiro(forcar = false): Promise<BaseGiro> {
  if (!forcar && cache && Date.now() - cache.carregadoEm < 10 * 60_000) return cache;

  const [giro, estoqueLoja, periodo] = await Promise.all([
    buscarTudo<any>(
      'giro_produtos',
      'codigo_produto,nome_produto,setor,subsetor,categoria,subcategoria,custo_medio,dias_com_venda,ultima_venda,venda_total_periodo',
      'codigo_produto'
    ),
    buscarTudo<any>('estoque_loja_itens', 'codigo_interno,quantidade,preco_custo,data_planilha', 'id'),
    Promise.all([
      supabase.from('vendas_diarias').select('data_venda').order('data_venda', { ascending: true }).limit(1),
      supabase.from('vendas_diarias').select('data_venda').order('data_venda', { ascending: false }).limit(1),
    ]),
  ]);

  const periodoInicio: string | null = periodo[0].data?.[0]?.data_venda ?? null;
  const periodoFim: string | null = periodo[1].data?.[0]?.data_venda ?? null;
  const estoquePorCodigo = new Map<string, { qtd: number; custo: number | null }>();
  let estoqueData: string | null = null;
  for (const e of estoqueLoja) {
    const cod = String(e.codigo_interno ?? '').trim();
    if (!cod) continue;
    if (e.data_planilha && (!estoqueData || e.data_planilha > estoqueData)) estoqueData = e.data_planilha;
    if (!estoquePorCodigo.has(cod)) {
      estoquePorCodigo.set(cod, { qtd: Number(e.quantidade ?? 0), custo: e.preco_custo != null ? Number(e.preco_custo) : null });
    }
  }

  // Códigos pai e filho (aprovados na planilha de correção de 09/10): o pai é
  // o código que entra na nota e o filho o que é vendido. Enquanto o acerto não
  // é lançado no sistema da loja, o Giro "transfere" do pai para o filho o que
  // falta para zerar o negativo do filho (1 un filho = fator un do pai).
  const estoqueOriginal = new Map<string, number>([...estoquePorCodigo.entries()].map(([k, v]) => [k, v.qtd]));
  const ajustes = new Map<string, string>();
  for (const [pai, filho, fator] of PAI_FILHO as [string, string, number][]) {
    const ep = estoquePorCodigo.get(pai);
    const ef = estoquePorCodigo.get(filho);
    if (!ep || !ef || ef.qtd >= 0 || ep.qtd <= 0 || !(fator > 0)) continue;
    const lanca = Math.min(-ef.qtd, ep.qtd / fator);
    ef.qtd += lanca;
    ep.qtd -= lanca * fator;
    ajustes.set(pai, 'estoque ajustado pelos códigos filhos');
    ajustes.set(filho, 'estoque ajustado pelo código pai');
  }

  const produtos: ProdutoGiro[] = giro.map((g) => {
    const el = estoquePorCodigo.get(g.codigo_produto);
    const estoque = el?.qtd ?? 0;
    const custoMedio = el?.custo && el.custo > 0 ? el.custo : Number(g.custo_medio ?? 0);
    const setor = limpa(g.setor, 'SEM SETOR');
    const subcategoria = limpa(g.subcategoria, 'SEM SUBCATEGORIA');
    const ultimaVenda: string | null = g.ultima_venda ?? null;
    return {
      codigo: g.codigo_produto,
      nome: g.nome_produto ?? g.codigo_produto,
      setor,
      subsetor: limpa(g.subsetor, 'SEM SUBSETOR'),
      categoria: limpa(g.categoria, 'SEM CATEGORIA'),
      subcategoria,
      estoque,
      estoqueSistema: estoqueOriginal.get(g.codigo_produto) ?? 0,
      custoMedio,
      custoEstoque: Math.max(estoque, 0) * custoMedio,
      diasComVenda: Number(g.dias_com_venda ?? 0),
      ultimaVenda,
      diasParado: ultimaVenda && periodoFim ? diasEntre(ultimaVenda, periodoFim) : null,
      vendaPeriodo: Number(g.venda_total_periodo ?? 0),
      ocultoPorSetor: SETORES_FORA_DE_VENDA.includes(setor) || SUBCATEGORIAS_FORA_DE_VENDA.includes(subcategoria),
    };
  });

  // O pai "vende" através dos filhos: herda a última venda deles.
  const porCodigo = new Map(produtos.map((p) => [p.codigo, p]));
  for (const [pai, filho] of PAI_FILHO as [string, string, number][]) {
    const p = porCodigo.get(pai);
    const f = porCodigo.get(filho);
    if (!p || !f) continue;
    if (f.ultimaVenda && (!p.ultimaVenda || f.ultimaVenda > p.ultimaVenda)) {
      p.ultimaVenda = f.ultimaVenda;
      p.diasParado = periodoFim ? diasEntre(f.ultimaVenda, periodoFim) : null;
    }
    p.diasComVenda = Math.max(p.diasComVenda, f.diasComVenda);
  }
  for (const p of produtos) {
    const a = ajustes.get(p.codigo);
    if (a) p.ajustePaiFilho = a;
  }

  cache = { produtos, periodoInicio, periodoFim, estoqueData, carregadoEm: Date.now() };
  return cache;
}

// --- Filtros e agrupamento ---------------------------------------------------

export type NivelGiro = 'setor' | 'subsetor' | 'categoria' | 'subcategoria';
export const NIVEIS: NivelGiro[] = ['setor', 'subsetor', 'categoria', 'subcategoria'];
export const ROTULO_NIVEL: Record<NivelGiro, string> = {
  setor: 'Setor',
  subsetor: 'Subsetor',
  categoria: 'Categoria',
  subcategoria: 'Subcategoria',
};

export interface FiltroGiro {
  caminho: string[]; // valores escolhidos, na ordem dos NIVEIS
  soComEstoque: boolean;
  dias: number; // faixa: 7/14/30 = "até N dias sem venda" (1..N); 31 = "mais de 30" (inclui sem venda)
  mostrarOcultos: boolean;
  ocultos: Set<string>;
  busca?: string;
}

export const ehSemVenda = (p: ProdutoGiro) => p.ultimaVenda === null;
// Faixas de dias sem venda: 7, 14 e 30 = "até N dias" (de 1 a N); FAIXA_MAIS_30
// = mais de 30 dias, junto com quem não vendeu nenhuma vez no período.
export const FAIXA_MAIS_30 = 31;
export const FAIXAS: { valor: number; rotulo: string }[] = [
  { valor: 7, rotulo: 'Até 7 dias' },
  { valor: 14, rotulo: 'Até 14 dias' },
  { valor: 30, rotulo: 'Até 30 dias' },
  { valor: FAIXA_MAIS_30, rotulo: 'Mais de 30' },
];
export const rotuloFaixa = (dias: number) =>
  dias >= FAIXA_MAIS_30 ? 'mais de 30 dias sem venda' : `até ${dias} dias sem venda`;
export const ehParado = (p: ProdutoGiro, dias: number) =>
  p.diasParado !== null && (dias >= FAIXA_MAIS_30 ? p.diasParado > 30 : p.diasParado >= 1 && p.diasParado <= dias);
export const ehProblema = (p: ProdutoGiro, dias: number) => (dias >= FAIXA_MAIS_30 && ehSemVenda(p)) || ehParado(p, dias);

export function filtrar(base: ProdutoGiro[], f: FiltroGiro): ProdutoGiro[] {
  const busca = (f.busca ?? '').trim().toUpperCase();
  return base.filter((p) => {
    if (!f.mostrarOcultos && (p.ocultoPorSetor || f.ocultos.has(p.codigo))) return false;
    if (f.soComEstoque && !(p.estoque > 0)) return false;
    for (let i = 0; i < f.caminho.length; i++) if (p[NIVEIS[i]] !== f.caminho[i]) return false;
    if (busca && !p.nome.toUpperCase().includes(busca) && !p.codigo.includes(busca)) return false;
    return true;
  });
}

export interface ResumoGiro {
  grupo: string;
  produtos: number;
  semVenda: number;
  parados: number;
  custoParado: number;
  venda: number;
}

export function resumir(lista: ProdutoGiro[], dias: number, grupo = 'TOTAL'): ResumoGiro {
  const r: ResumoGiro = { grupo, produtos: 0, semVenda: 0, parados: 0, custoParado: 0, venda: 0 };
  for (const p of lista) {
    r.produtos++;
    r.venda += p.vendaPeriodo;
    if (ehSemVenda(p)) {
      if (dias >= FAIXA_MAIS_30) r.semVenda++;
    } else if (ehParado(p, dias)) r.parados++;
    if (ehProblema(p, dias)) r.custoParado += p.custoEstoque;
  }
  return r;
}

export function agrupar(lista: ProdutoGiro[], nivel: NivelGiro, dias: number): ResumoGiro[] {
  const mapa = new Map<string, ProdutoGiro[]>();
  for (const p of lista) {
    const k = p[nivel];
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k)!.push(p);
  }
  return [...mapa.entries()]
    .map(([k, ps]) => resumir(ps, dias, k))
    .sort((a, b) => b.semVenda + b.parados - (a.semVenda + a.parados) || b.custoParado - a.custoParado);
}

// Sem venda primeiro (maior custo parado antes), depois os mais parados.
export function ordenarProblemas(lista: ProdutoGiro[], dias: number): ProdutoGiro[] {
  return lista
    .filter((p) => ehProblema(p, dias))
    .sort((a, b) => {
      const da = a.diasParado ?? Number.POSITIVE_INFINITY;
      const db = b.diasParado ?? Number.POSITIVE_INFINITY;
      if (da !== db) return db - da;
      return b.custoEstoque - a.custoEstoque;
    });
}

// Dias sem venda: número exato pra quem vendeu no período; "31+" (o período
// todo) pra quem não vendeu nenhuma vez.
export function diasSemVendaTexto(p: ProdutoGiro, base: Pick<BaseGiro, 'periodoInicio' | 'periodoFim'> | null): string {
  if (p.diasParado !== null) return String(p.diasParado);
  if (!base?.periodoInicio || !base.periodoFim) return '—';
  return `${diasEntre(base.periodoInicio, base.periodoFim) + 1}+`;
}

// Lista da tela inicial: só sem venda/parados, por quantidade em estoque
// (maior primeiro, ou menor primeiro se "crescente"); empate → mais parado.
export function ordenarPorEstoque(lista: ProdutoGiro[], dias: number, crescente: boolean): ProdutoGiro[] {
  const dp = (p: ProdutoGiro) => p.diasParado ?? Number.POSITIVE_INFINITY;
  return lista
    .filter((p) => ehProblema(p, dias))
    .sort((a, b) => (crescente ? a.estoque - b.estoque : b.estoque - a.estoque) || dp(b) - dp(a));
}

// Opções de um nível do filtro (com quantos produtos problemáticos cada uma tem).
export function opcoesDoNivel(lista: ProdutoGiro[], nivel: NivelGiro, dias: number): { valor: string; qtd: number }[] {
  const mapa = new Map<string, number>();
  for (const p of lista) if (ehProblema(p, dias)) mapa.set(p[nivel], (mapa.get(p[nivel]) ?? 0) + 1);
  return [...mapa.entries()].map(([valor, qtd]) => ({ valor, qtd })).sort((a, b) => b.qtd - a.qtd);
}

// --- Ocultos (por aparelho) ----------------------------------------------------

const CHAVE_OCULTOS = 'giro_ocultos_v1';

export async function lerOcultos(): Promise<Set<string>> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_OCULTOS);
    return new Set(bruto ? (JSON.parse(bruto) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function salvarOcultos(s: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_OCULTOS, JSON.stringify([...s]));
  } catch {
    // sem armazenamento: vale só enquanto o app está aberto
  }
}

// --- Formatação -----------------------------------------------------------------

export const formatarReais = (n: number) =>
  'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// Versão curta pra cartões estreitos: R$ 1,84 mi / R$ 216 mil / R$ 9.850.
export function formatarReaisCurto(n: number): string {
  if (Math.abs(n) >= 1_000_000) return 'R$ ' + (n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
  if (Math.abs(n) >= 100_000) return 'R$ ' + Math.round(n / 1000).toLocaleString('pt-BR') + ' mil';
  return formatarReais(n);
}

export const formatarDataCurta = (iso: string | null) => {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export const formatarEstoque = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// Nome do setor do Falcon em formato de título ("MERCEARIA LIQUIDA" → "Mercearia Liquida").
export function nomeBonito(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s|\/)/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join('');
}
