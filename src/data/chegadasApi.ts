import { supabase } from '../lib/supabase';

// Mercadoria que chegou: vem do próprio Estoque Loja (gerarChegadaDoEstoque,
// abaixo) ou do PDF da nota subido no portal, e fica em chegadas_nf /
// chegadas_itens (ver supabase/chegadas.sql).
// Aqui o app só lê e marca o que já foi para a gôndola / avisa a gerência.

export type GrupoChegada = 'falta' | 'novo' | 'baixo' | 'negativo' | 'normal';

export type NotaChegada = {
  id: string;
  numero: string;
  emitente: string | null;
  enviadoEm: string;
  totalItens: number;
};

export type ItemChegada = {
  id: string;
  chegadaId: string;
  produto: string;
  codigoBarras: string | null;
  codigoInterno: string | null;
  embalagem: string | null;
  quantidade: number | null;
  saldoLoja: number | null;
  precoVenda: number | null;
  grupo: GrupoChegada;
  setor: string | null;
  observacao: string | null;
  abastecidoEm: string | null;
  abastecidoPor: string | null;
  gerenciaAvisadaEm: string | null;
};

export const NOME_SETOR_CHEGADA: Record<string, string> = {
  acougue: 'Açougue',
  flv: 'FLV',
  frios: 'Frios',
  padaria: 'Padaria',
  mercearia: 'Mercearia',
  bebidas: 'Bebidas',
  limpeza: 'Limpeza',
  higiene: 'Higiene',
  bazar: 'Bazar',
};

function num(v: any): number | null {
  return v == null || v === '' ? null : Number(v);
}

function linhaParaItem(r: any): ItemChegada {
  return {
    id: r.id,
    chegadaId: r.chegada_id,
    produto: r.produto,
    codigoBarras: r.codigo_barras ?? null,
    codigoInterno: r.codigo_interno ?? null,
    embalagem: r.embalagem ?? null,
    quantidade: num(r.quantidade),
    saldoLoja: num(r.saldo_loja),
    precoVenda: num(r.preco_venda),
    grupo: r.grupo,
    setor: r.setor ?? null,
    observacao: r.observacao ?? null,
    abastecidoEm: r.abastecido_em ?? null,
    abastecidoPor: r.abastecido_por ?? null,
    gerenciaAvisadaEm: r.gerencia_avisada_em ?? null,
  };
}

function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Chegada pelo ESTOQUE DA LOJA (sem subir nota): cada importação do Estoque
// Loja anota em estoque_entradas o que entrou (ver supabase/estoque_entradas.sql).
// Na primeira vez que alguém abre o "Chegou hoje" depois de uma importação,
// o app monta uma "chegada" daquele dia com o que importa para a gôndola:
//   - estava em falta  (saldo era 0 e voltou a ter)
//   - produto novo     (saldo era 0 e a loja nunca tinha vendido)
//   - saldo negativo   (era negativo no sistema e entrou mercadoria)
//   - estoque baixo    (tinha menos de 5 e foi reposto)
// Fica gravada como as notas (chegadas_nf/chegadas_itens), então o ✓ de
// "já está na área de vendas" funciona igual. Número da "nota": ESTOQUE AAAA-MM-DD.
// ---------------------------------------------------------------------------
export const PREFIXO_ESTOQUE = 'ESTOQUE ';
const LIMITE_BAIXO = 5;

const SETOR_POR_CLASSE: Record<string, string> = {
  'ACOUGUE/SALGADOS/DEFUMADO': 'acougue',
  HORTIFRUTIGRANJEIROS: 'flv',
  'MARGEM GARANTIDA': 'flv',
  PERECIVEIS: 'frios',
  'PADARIA FORN/FAB PROPRIA': 'padaria',
  'MERCEARIA DOCE': 'mercearia',
  'MERCEARIA SALGADA': 'mercearia',
  CEREAIS: 'mercearia',
  'BOMBONIERE/MATINAIS': 'mercearia',
  'MERCEARIA LIQUIDA': 'bebidas',
  LIMPEZA: 'limpeza',
  'PERFUMARIA/HIG PESSOAL': 'higiene',
  BAZAR: 'bazar',
  'MARGEM GARANTIDA BAZAR': 'bazar',
};

export function chegadaEhDoEstoque(n: { numero: string }): boolean {
  return n.numero.startsWith(PREFIXO_ESTOQUE);
}

export async function gerarChegadaDoEstoque(): Promise<void> {
  const desde = new Date();
  desde.setDate(desde.getDate() - 10);
  const desdeIso = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}-${String(desde.getDate()).padStart(2, '0')}`;
  const { data: ult, error: e0 } = await supabase.from('estoque_entradas').select('data').gte('data', desdeIso).order('data', { ascending: false }).limit(1);
  if (e0 || !ult || !ult.length) return;
  const dia: string = (ult[0] as any).data;
  const numero = PREFIXO_ESTOQUE + dia;
  const { data: ja } = await supabase.from('chegadas_nf').select('id').eq('numero', numero).limit(1);
  if (ja && ja.length) return;

  // entradas do dia
  const entradas: any[] = [];
  for (let de = 0; de < 20000; de += 1000) {
    const { data, error } = await supabase
      .from('estoque_entradas')
      .select('item_id,codigo_interno,produto,tipo,qtd_antes,qtd_depois')
      .eq('data', dia)
      .order('id')
      .range(de, de + 999);
    if (error) throw error;
    entradas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const relevantes = entradas.filter((e) => e.tipo === 'apareceu' || Number(e.qtd_antes) < LIMITE_BAIXO);
  if (!relevantes.length) return;

  // preço/código de barras (Estoque Loja) e setor (classe do produto)
  const ids = relevantes.map((e) => e.item_id);
  const cods = Array.from(new Set(relevantes.map((e) => e.codigo_interno).filter(Boolean))) as string[];
  const itemPorId: Record<string, any> = {};
  const classe: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('estoque_loja_itens').select('id,codigo_barras,preco_venda,preco_custo').in('id', ids.slice(i, i + 200));
    (data ?? []).forEach((x: any) => (itemPorId[x.id] = x));
  }
  for (let i = 0; i < cods.length; i += 200) {
    const { data } = await supabase.from('produtos_classes').select('codigo_produto,classe_2_nome').in('codigo_produto', cods.slice(i, i + 200));
    (data ?? []).forEach((x: any) => (classe[x.codigo_produto] = x.classe_2_nome));
  }

  // produto novo = voltou do zero e a loja nunca tinha vendido antes desse dia
  const zerados = relevantes.filter((e) => e.tipo === 'apareceu' && Number(e.qtd_antes) === 0 && e.codigo_interno);
  const jaVendeu = new Set<string>();
  for (let i = 0; i < zerados.length; i += 10) {
    const parte = zerados.slice(i, i + 10);
    const r = await Promise.all(
      parte.map((e) => supabase.from('vendas_diarias').select('codigo_produto').eq('codigo_produto', e.codigo_interno).lt('data_venda', dia).limit(1)),
    );
    r.forEach((x, k) => {
      if (x.data && x.data.length) jaVendeu.add(parte[k].codigo_interno);
    });
  }

  const itens = relevantes.map((e, k) => {
    const antes = Number(e.qtd_antes) || 0;
    const depois = Number(e.qtd_depois) || 0;
    const it = itemPorId[e.item_id] ?? {};
    let grupo: GrupoChegada;
    let obs: string | null = null;
    if (e.tipo === 'apareceu') {
      if (antes < 0) {
        grupo = 'negativo';
        obs = 'Estava com saldo negativo no sistema';
      } else if (e.codigo_interno && !jaVendeu.has(e.codigo_interno)) {
        grupo = 'novo';
        obs = 'Primeira vez no estoque — a loja ainda não vendia esse produto';
      } else grupo = 'falta';
    } else grupo = 'baixo';
    const pv = it.preco_venda == null ? null : Number(it.preco_venda);
    if (grupo !== 'novo' && !pv) obs = (obs ? obs + '; ' : '') + 'Sem preço de venda no sistema';
    return {
      ordem: k,
      codigo_barras: it.codigo_barras ?? null,
      produto: e.produto ?? '',
      embalagem: /\bKG\b/i.test(e.produto ?? '') ? 'kg' : 'un',
      quantidade: Math.round((depois - antes) * 1000) / 1000,
      codigo_interno: e.codigo_interno,
      produto_loja: e.produto,
      saldo_loja: antes,
      preco_venda: pv,
      preco_custo: it.preco_custo == null ? null : Number(it.preco_custo),
      grupo,
      setor: SETOR_POR_CLASSE[classe[e.codigo_interno] ?? ''] ?? null,
      observacao: obs,
    };
  });

  const [a, m, d] = dia.split('-');
  const { data: cab, error: e1 } = await supabase
    .from('chegadas_nf')
    .insert({
      numero,
      emitente: `Estoque da loja (importação de ${d}/${m})`,
      data_emissao: dia,
      total_itens: itens.length,
      enviado_por: 'ULVA (estoque)',
      enviado_em: `${a}-${m}-${d}T12:00:00-03:00`,
    })
    .select('id')
    .single();
  if (e1) return; // outro celular já gerou (número repetido)
  for (let i = 0; i < itens.length; i += 200) {
    const { error } = await supabase.from('chegadas_itens').insert(itens.slice(i, i + 200).map((x) => ({ ...x, chegada_id: cab.id })));
    if (error) {
      await supabase.from('chegadas_nf').delete().eq('id', cab.id);
      throw error;
    }
  }
}

// Notas do dia mais recente que teve chegada (olhando os últimos 10 dias).
export async function buscarUltimaChegada(): Promise<{ dia: string | null; notas: NotaChegada[]; itens: ItemChegada[] }> {
  try {
    await gerarChegadaDoEstoque();
  } catch {
    // sem a chegada do estoque, mostra só as notas
  }
  const desde = new Date();
  desde.setDate(desde.getDate() - 10);
  const { data: notas, error } = await supabase
    .from('chegadas_nf')
    .select('id, numero, emitente, enviado_em, total_itens')
    .gte('enviado_em', desde.toISOString())
    .order('enviado_em', { ascending: false });
  if (error) throw error;
  if (!notas || notas.length === 0) return { dia: null, notas: [], itens: [] };
  const dia = diaLocal(notas[0].enviado_em);
  const doDia = notas.filter((n: any) => diaLocal(n.enviado_em) === dia);
  const ids = doDia.map((n: any) => n.id);
  const { data: itens, error: e2 } = await supabase
    .from('chegadas_itens')
    .select('*')
    .in('chegada_id', ids)
    .order('ordem')
    .limit(5000);
  if (e2) throw e2;
  return {
    dia,
    notas: doDia.map((n: any) => ({ id: n.id, numero: n.numero, emitente: n.emitente, enviadoEm: n.enviado_em, totalItens: n.total_itens })),
    itens: (itens ?? []).map(linhaParaItem),
  };
}

export async function marcarAbastecido(itemId: string, nome: string | null, abastecido: boolean): Promise<void> {
  const { error } = await supabase
    .from('chegadas_itens')
    .update(abastecido ? { abastecido_em: new Date().toISOString(), abastecido_por: nome } : { abastecido_em: null, abastecido_por: null })
    .eq('id', itemId);
  if (error) throw error;
}
