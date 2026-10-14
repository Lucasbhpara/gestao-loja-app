import { supabase } from '../lib/supabase';

// Mercadoria que chegou: o portal sobe o PDF da nota, cruza com o Estoque
// Loja e grava em chegadas_nf / chegadas_itens (ver supabase/chegadas.sql).
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

// Notas do dia mais recente que teve chegada (olhando os últimos 10 dias).
export async function buscarUltimaChegada(): Promise<{ dia: string | null; notas: NotaChegada[]; itens: ItemChegada[] }> {
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
