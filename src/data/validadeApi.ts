import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';

export interface ProdutoCatalogo {
  codigoBarras: string;
  produto: string;
  unidade: string;
}

export interface Validade {
  id: string;
  codigoBarras: string | null;
  produto: string;
  unidade: string;
  setor: SetorKey;
  dataValidade: string; // 'AAAA-MM-DD'
  cadastradoPorNome: string;
  criadoEm: string;
}

function linhaParaValidade(linha: any): Validade {
  return {
    id: linha.id,
    codigoBarras: linha.codigo_barras,
    produto: linha.produto,
    unidade: linha.unidade,
    setor: linha.setor,
    dataValidade: linha.data_validade,
    cadastradoPorNome: linha.cadastrado_por_nome,
    criadoEm: linha.criado_em,
  };
}

// Procura o produto na base de código de barras (produtos_catalogo). Volta
// null se o código não estiver cadastrado — nesse caso o app deixa
// preencher o nome na mão mesmo assim.
export async function buscarProdutoPorCodigoBarras(codigoBarras: string): Promise<ProdutoCatalogo | null> {
  const { data, error } = await supabase
    .from('produtos_catalogo')
    .select('*')
    .eq('codigo_barras', codigoBarras)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { codigoBarras: data.codigo_barras, produto: data.produto, unidade: data.unidade };
}

// Todos os produtos com validade, de todos os setores (admin / A.P.P).
export async function buscarTodasValidades(): Promise<Validade[]> {
  const { data, error } = await supabase.from('validades').select('*').order('data_validade', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(linhaParaValidade);
}

// Os produtos do setor do colaborador, mais os marcados como "Todos"
// (visíveis em qualquer setor).
export async function buscarValidadesDoSetor(setor: SetorKey): Promise<Validade[]> {
  const { data, error } = await supabase
    .from('validades')
    .select('*')
    .or(`setor.eq.${setor},setor.eq.todos`)
    .order('data_validade', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(linhaParaValidade);
}

export async function adicionarValidade(dados: {
  codigoBarras: string | null;
  produto: string;
  unidade: string;
  setor: SetorKey;
  dataValidade: string;
  cadastradoPorNome: string;
}): Promise<Validade> {
  const { data, error } = await supabase
    .from('validades')
    .insert({
      codigo_barras: dados.codigoBarras,
      produto: dados.produto,
      unidade: dados.unidade || 'un',
      setor: dados.setor,
      data_validade: dados.dataValidade,
      cadastrado_por_nome: dados.cadastradoPorNome,
    })
    .select()
    .single();
  if (error) throw error;
  return linhaParaValidade(data);
}

// Corrige um produto já cadastrado (nome, unidade, setor ou validade) sem
// precisar remover e recadastrar do zero.
export async function atualizarValidade(dados: {
  id: string;
  produto: string;
  unidade: string;
  setor: SetorKey;
  dataValidade: string;
}): Promise<Validade> {
  const { data, error } = await supabase
    .from('validades')
    .update({
      produto: dados.produto,
      unidade: dados.unidade || 'un',
      setor: dados.setor,
      data_validade: dados.dataValidade,
    })
    .eq('id', dados.id)
    .select()
    .single();
  if (error) throw error;
  return linhaParaValidade(data);
}

export async function removerValidade(id: string): Promise<void> {
  const { error } = await supabase.from('validades').delete().eq('id', id);
  if (error) throw error;
}

// Atualiza (ou cria) o cadastro do produto na base de código de barras.
// Diferente de adicionarValidade (que só grava esse lançamento), isso
// muda o nome/unidade que aparece pra QUALQUER pessoa que escanear esse
// mesmo código de barras dali pra frente.
export async function atualizarProdutoCatalogo(dados: {
  codigoBarras: string;
  produto: string;
  unidade: string;
}): Promise<void> {
  const { error } = await supabase
    .from('produtos_catalogo')
    .upsert(
      { codigo_barras: dados.codigoBarras, produto: dados.produto, unidade: dados.unidade || 'un' },
      { onConflict: 'codigo_barras' }
    );
  if (error) throw error;
}
