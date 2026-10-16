import { supabase } from '../lib/supabase';

// "De olho na validade" (copiado do Prevenção SBH): cliente encontrou produto
// vencido e a loja registra a ocorrência — cupom, caixa, um ou mais produtos
// (validade, lote, foto, retirada da área de venda, blitz), "Por que
// aconteceu?", folha de cancelamento do caixa e 3 assinaturas. Versão leve:
// sem consulta ao site da Fazenda; os dados do cupom saem só do QR Code.

export type PapelOlho = 'registrou' | 'gerente' | 'responsavel_setor';

export interface AssinaturaDesenho {
  tracos: string; // caminho SVG: "M10 20 L12 22 ..."
  largura: number;
  altura: number;
}

export interface AssinaturaOlho extends AssinaturaDesenho {
  papel: PapelOlho;
  nome: string;
  assinada_em: string;
}

export interface CupomQr {
  url: string | null;
  chave: string | null;
  cnpj: string | null;
  numero: string | null;
  serie: string | null;
  emissao: string | null; // ISO, quando vem no QR (emissão em contingência)
  total: number | null; // idem
  anoMes: string | null; // AAAA-MM, sempre sai da chave
}

// Um produto vencido dentro da ocorrência (um cupom pode ter vários).
export interface ItemOlho {
  descricao: string;
  codigo: string | null;
  setor: string;
  valor_unitario: number | null;
  data_validade: string | null; // AAAA-MM-DD
  lote: string | null;
  qtd_encontrada: number;
  valor_retirado: number;
  restante_retirado: boolean;
  estava_na_blitz: boolean;
  fotos: string[]; // urls (na gravação: uris locais)
}

export interface OcorrenciaOlho {
  id: string;
  criado_em: string;
  registrado_por_nome: string | null;
  cupom_chave: string | null;
  cupom_numero: string | null;
  cupom_serie: string | null;
  cupom_emissao: string | null;
  cupom_total: number | null;
  caixa_numero: string | null;
  itens: ItemOlho[];
  qtd_itens: number;
  valor_total: number;
  setores: string[];
  motivo: string;
  teve_cancelamento: boolean;
  folha_cancelamento_fotos: string[];
  assinaturas: AssinaturaOlho[];
}

export const SETORES_OLHO = ['Mercearia', 'Bebidas', 'Frios e laticínios', 'Açougue', 'Padaria', 'FLV', 'Limpeza', 'Higiene', 'Bazar', 'Outros'];

// Caixas da frente de loja (o "Outro" deixa digitar um número fora da lista).
export const CAIXAS_OLHO = Array.from({ length: 12 }, (_, i) => String(i + 1));

export const PAPEIS_OLHO: { papel: PapelOlho; titulo: string }[] = [
  { papel: 'registrou', titulo: 'Quem registrou' },
  { papel: 'gerente', titulo: 'Gerente da loja' },
  { papel: 'responsavel_setor', titulo: 'Responsável do setor' },
];

// ---------------------------------------------------------------- cupom (QR)
function chaveDoTexto(texto: string): string | null {
  const t = texto.replace(/\s/g, '');
  const p = t.match(/[?&]p=([^&]+)/i);
  const base = p ? decodeURIComponent(p[1]) : t;
  const m = base.match(/\d{44}/);
  return m ? m[0] : null;
}

// O QR Code da NFC-e traz a chave de acesso (44 dígitos): dela saem CNPJ,
// série, número e mês. Na emissão em contingência o QR também traz o dia e
// o valor total; quando vierem, aproveitamos.
export function cupomDoQr(textoQr: string): CupomQr {
  const texto = textoQr.trim();
  const chave = chaveDoTexto(texto);
  const url = /^https?:\/\//i.test(texto) ? texto : null;
  const c: CupomQr = { url, chave, cnpj: null, numero: null, serie: null, emissao: null, total: null, anoMes: null };
  if (!chave) return c;
  c.cnpj = chave.slice(6, 20);
  c.serie = String(Number(chave.slice(22, 25)));
  c.numero = String(Number(chave.slice(25, 34)));
  c.anoMes = `20${chave.slice(2, 4)}-${chave.slice(4, 6)}`;
  const p = texto.match(/[?&]p=([^&]+)/i);
  if (p) {
    const partes = decodeURIComponent(p[1]).split('|');
    // contingência: chave|versão|ambiente|dia|valor|digest|idCSC|hash
    if (partes.length >= 8) {
      const dia = partes[3];
      const valor = Number((partes[4] || '').replace(',', '.'));
      if (/^\d{1,2}$/.test(dia)) c.emissao = `${c.anoMes}-${dia.padStart(2, '0')}T12:00:00`;
      if (!isNaN(valor) && valor > 0) c.total = valor;
    }
  }
  return c;
}

export const cnpjFormatado = (c: string | null) =>
  c && c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c ?? '';

// --------------------------------------------------------- produto (estoque)
export interface ProdutoEstoque {
  descricao: string;
  codigo: string;
  precoVenda: number | null;
  setor: string | null;
}

// Classe 2 do produto (cadastro da rede) → setor da ocorrência
function setorDaClasse(classe: string | null | undefined): string | null {
  const c = (classe ?? '').toUpperCase();
  if (!c) return null;
  if (c.includes('ACOUGUE')) return 'Açougue';
  if (c.includes('PADARIA')) return 'Padaria';
  if (c.includes('HORTIFRUTI')) return 'FLV';
  if (c.includes('PERECIVEIS')) return 'Frios e laticínios';
  if (c.includes('LIQUIDA')) return 'Bebidas';
  if (c.includes('LIMPEZA')) return 'Limpeza';
  if (c.includes('PERFUMARIA') || c.includes('HIG')) return 'Higiene';
  if (c.includes('BAZAR')) return 'Bazar';
  if (c.includes('MERCEARIA') || c.includes('CEREAIS') || c.includes('BOMBONIERE')) return 'Mercearia';
  return null;
}

// Procura o código de barras lido no Estoque Loja (preço oficial da loja).
export async function buscarProdutoPorCodigo(codigo: string): Promise<ProdutoEstoque | null> {
  const c = codigo.replace(/\D/g, '');
  if (!c) return null;
  const variantes = Array.from(new Set([c, c.replace(/^0+/, ''), c.padStart(13, '0')]));
  const { data, error } = await supabase
    .from('estoque_loja_itens')
    .select('codigo_interno, produto, codigo_barras, preco_venda')
    .in('codigo_barras', variantes)
    .limit(1);
  if (error || !data?.length) return null;
  const l: any = data[0];
  let setor: string | null = null;
  try {
    const { data: cl } = await supabase.from('produtos_classes').select('classe_2_nome').eq('codigo_produto', l.codigo_interno).limit(1);
    setor = setorDaClasse((cl?.[0] as any)?.classe_2_nome);
  } catch {
    // sem setor, o colaborador escolhe
  }
  return {
    descricao: l.produto,
    codigo: l.codigo_barras ?? c,
    precoVenda: l.preco_venda == null ? null : Number(l.preco_venda),
    setor,
  };
}

// --------------------------------------------------------------- leitura
const CAMPOS =
  'id, criado_em, registrado_por_nome, cupom_chave, cupom_numero, cupom_serie, cupom_emissao, cupom_total, caixa_numero, itens, qtd_itens, valor_total, setores, motivo, teve_cancelamento, folha_cancelamento_fotos, assinaturas';

const num = (v: unknown) => (v == null ? null : Number(v));

function itemDoBanco(i: any): ItemOlho {
  return {
    descricao: String(i?.descricao ?? ''),
    codigo: i?.codigo ?? null,
    setor: String(i?.setor ?? ''),
    valor_unitario: num(i?.valor_unitario),
    data_validade: i?.data_validade ?? null,
    lote: i?.lote ?? null,
    qtd_encontrada: Number(i?.qtd_encontrada ?? 0),
    valor_retirado: Number(i?.valor_retirado ?? 0),
    restante_retirado: !!i?.restante_retirado,
    estava_na_blitz: !!i?.estava_na_blitz,
    fotos: Array.isArray(i?.fotos) ? i.fotos : [],
  };
}

export async function listarOcorrenciasOlho(dias = 180): Promise<OcorrenciaOlho[]> {
  const { data, error } = await supabase
    .from('olho_validade')
    .select(CAMPOS)
    .gte('criado_em', new Date(Date.now() - dias * 86400000).toISOString())
    .order('criado_em', { ascending: false })
    .limit(500);
  if (error) {
    if (/olho_validade/.test(error.message)) throw new Error('A tabela do "De olho na validade" ainda não foi criada no banco.');
    throw new Error(error.message);
  }
  return ((data ?? []) as any[]).map((o) => ({
    ...o,
    cupom_total: num(o.cupom_total),
    itens: Array.isArray(o.itens) ? o.itens.map(itemDoBanco) : [],
    qtd_itens: Number(o.qtd_itens ?? 0),
    valor_total: Number(o.valor_total ?? 0),
    setores: o.setores ?? [],
    folha_cancelamento_fotos: o.folha_cancelamento_fotos ?? [],
    assinaturas: o.assinaturas ?? [],
  }));
}

// --------------------------------------------------------------- gravação
async function enviarFoto(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  // upsert desligado: depois de enviada, a foto não pode ser trocada
  const { error } = await supabase.storage.from('olho-validade-fotos').upload(nomeArquivo, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from('olho-validade-fotos').getPublicUrl(nomeArquivo).data.publicUrl;
}

export interface NovaOcorrenciaOlho {
  matricula: string;
  nome: string;
  cupom: CupomQr | null;
  caixa: string | null;
  itens: ItemOlho[]; // fotos = uris locais
  motivo: string;
  teveCancelamento: boolean;
  folhaCancelamento: string[]; // uris locais
  assinaturas: AssinaturaOlho[];
}

export async function salvarOcorrenciaOlho(o: NovaOcorrenciaOlho): Promise<void> {
  // Envia as fotos primeiro; o registro só é gravado quando todas subiram.
  const itens: ItemOlho[] = [];
  for (const i of o.itens) {
    const fotos: string[] = [];
    for (const f of i.fotos) fotos.push(await enviarFoto(f));
    itens.push({ ...i, descricao: i.descricao.trim(), lote: i.lote?.trim() || null, fotos });
  }
  const folha: string[] = [];
  if (o.teveCancelamento) for (const f of o.folhaCancelamento) folha.push(await enviarFoto(f));

  const valorTotal = Math.round(itens.reduce((a, i) => a + (i.valor_retirado || 0), 0) * 100) / 100;
  const setores = Array.from(new Set(itens.map((i) => i.setor).filter(Boolean)));

  const { error } = await supabase.from('olho_validade').insert({
    registrado_por_matricula: o.matricula,
    registrado_por_nome: o.nome,
    cupom_chave: o.cupom?.chave ?? null,
    cupom_url: o.cupom?.url ?? null,
    cupom_numero: o.cupom?.numero ?? null,
    cupom_serie: o.cupom?.serie ?? null,
    cupom_cnpj: o.cupom?.cnpj ?? null,
    cupom_emissao: o.cupom?.emissao ?? null,
    cupom_total: o.cupom?.total ?? null,
    caixa_numero: o.caixa,
    itens,
    qtd_itens: itens.length,
    valor_total: valorTotal,
    setores,
    motivo: o.motivo.trim(),
    teve_cancelamento: o.teveCancelamento,
    folha_cancelamento_fotos: folha,
    assinaturas: o.assinaturas,
  });
  if (error) throw new Error(error.message);
}

// --------------------------------------------------------------- formatos
export function reais(n: number | null | undefined) {
  if (n == null || isNaN(n)) return '—';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

// Aceita "8,79", "8.79", "1.234,50" e "1234"
export function numeroDigitado(t: string): number | null {
  let x = t.replace(/[^\d,.]/g, '');
  if (!x) return null;
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(x)) x = x.replace(/\./g, '');
  const n = Number(x);
  return isNaN(n) ? null : n;
}
