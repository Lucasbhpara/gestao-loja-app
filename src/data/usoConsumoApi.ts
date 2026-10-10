import { supabase } from '../lib/supabase';
import { setores } from './employees';

// =============================================================================
// Uso e Consumo — material de uso interno (embalagens, limpeza, EPI,
// utensílios, gás...). Qualquer colaborador registra uma retirada (quem,
// setor, quantidade); o administrador faz as contagens. O saldo de cada item
// é a última contagem menos as retiradas feitas depois dela (view
// uso_consumo_saldo — supabase/schema_uso_consumo.sql). O Portal usa as
// mesmas tabelas.
// =============================================================================

export const CATEGORIAS_USO_CONSUMO = ['Embalagens', 'Limpeza e higiene', 'EPI e descartáveis', 'Utensílios', 'Gás e manutenção', 'Outros'];
export const UNIDADES_USO_CONSUMO = ['UN', 'CAIXA', 'PACOTE', 'FARDO', 'ROLO', 'GALÃO', 'PAR', 'KG', 'LITRO'];

// Setores que retiram material: os da loja + Limpeza.
export const SETORES_RETIRADA: string[] = [
  ...setores.filter((s) => s.key !== 'promotores').map((s) => s.nome),
  'Limpeza',
];

export interface ItemUsoConsumo {
  id: string;
  codigo: string | null;
  nome: string;
  unidade: string;
  categoria: string;
  custo: number | null;
  estoqueMinimo: number | null;
  ativo: boolean;
  ultimaContagem: number | null;
  contadoEm: string | null;
  contadoPor: string | null;
  saldo: number | null;
  retirado30d: number;
}

export interface RetiradaUsoConsumo {
  id: string;
  itemId: string;
  itemNome: string;
  unidade: string;
  custo: number | null;
  quantidade: number;
  setor: string;
  retiradoPor: string | null;
  matricula: string | null;
  observacao: string | null;
  criadoEm: string;
}

const num = (v: any): number | null => (v == null ? null : Number(v));

export async function buscarItensUsoConsumo(incluirInativos = false): Promise<ItemUsoConsumo[]> {
  let q = supabase.from('uso_consumo_saldo').select('*').order('nome');
  if (!incluirInativos) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id,
    codigo: l.codigo ?? null,
    nome: l.nome,
    unidade: l.unidade,
    categoria: l.categoria,
    custo: num(l.custo),
    estoqueMinimo: num(l.estoque_minimo),
    ativo: l.ativo,
    ultimaContagem: num(l.ultima_contagem),
    contadoEm: l.contado_em ?? null,
    contadoPor: l.contado_por ?? null,
    saldo: num(l.saldo),
    retirado30d: Number(l.retirado_30d ?? 0),
  }));
}

export async function buscarRetiradas(opcoes: { desde?: string; setor?: string; limite?: number } = {}): Promise<RetiradaUsoConsumo[]> {
  let q = supabase
    .from('uso_consumo_retiradas')
    .select('*, item:uso_consumo_itens(nome, unidade, custo)')
    .order('criado_em', { ascending: false })
    .limit(opcoes.limite ?? 300);
  if (opcoes.desde) q = q.gte('criado_em', opcoes.desde);
  if (opcoes.setor) q = q.eq('setor', opcoes.setor);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id,
    itemId: l.item_id,
    itemNome: l.item?.nome ?? '(item excluído)',
    unidade: l.item?.unidade ?? '',
    custo: num(l.item?.custo),
    quantidade: Number(l.quantidade),
    setor: l.setor,
    retiradoPor: l.retirado_por ?? null,
    matricula: l.matricula ?? null,
    observacao: l.observacao ?? null,
    criadoEm: l.criado_em,
  }));
}

export async function registrarRetirada(d: {
  itemId: string;
  quantidade: number;
  setor: string;
  retiradoPor: string;
  matricula: string | null;
  observacao: string | null;
}): Promise<void> {
  const { error } = await supabase.from('uso_consumo_retiradas').insert({
    item_id: d.itemId,
    quantidade: d.quantidade,
    setor: d.setor,
    retirado_por: d.retiradoPor,
    matricula: d.matricula,
    observacao: d.observacao,
  });
  if (error) throw error;
}

export async function excluirRetirada(id: string): Promise<void> {
  const { error } = await supabase.from('uso_consumo_retiradas').delete().eq('id', id);
  if (error) throw error;
}

export async function registrarContagem(itemId: string, quantidade: number, contadoPor: string): Promise<void> {
  const { error } = await supabase.from('uso_consumo_contagens').insert({ item_id: itemId, quantidade, contado_por: contadoPor });
  if (error) throw error;
}

export async function salvarItem(d: {
  id?: string;
  codigo: string | null;
  nome: string;
  unidade: string;
  categoria: string;
  custo: number | null;
  estoqueMinimo: number | null;
  ativo?: boolean;
  por: string;
}): Promise<string> {
  const linha: any = {
    codigo: d.codigo || null,
    nome: d.nome.trim().toUpperCase(),
    unidade: d.unidade,
    categoria: d.categoria,
    custo: d.custo,
    estoque_minimo: d.estoqueMinimo,
  };
  if (d.ativo !== undefined) linha.ativo = d.ativo;
  if (d.id) {
    const { error } = await supabase.from('uso_consumo_itens').update(linha).eq('id', d.id);
    if (error) throw error;
    return d.id;
  }
  const { data, error } = await supabase
    .from('uso_consumo_itens')
    .insert({ ...linha, criado_por: d.por })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

// Situação do saldo, pra pintar o card.
export function situacaoSaldo(i: ItemUsoConsumo): 'sem_contagem' | 'zerado' | 'baixo' | 'ok' {
  if (i.saldo === null) return 'sem_contagem';
  if (i.saldo <= 0) return 'zerado';
  if (i.estoqueMinimo != null && i.saldo <= i.estoqueMinimo) return 'baixo';
  return 'ok';
}

export function formatarQtd(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Nome do setor do colaborador (key → nome), pra já vir marcado na retirada.
export function nomeSetorPadrao(setorKey: string | undefined | null): string {
  return setores.find((s) => s.key === setorKey)?.nome ?? SETORES_RETIRADA[0];
}
