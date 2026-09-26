import { supabase } from '../lib/supabase';
import { Validade } from './validadeApi';
import { diasRestantes } from '../lib/validadeUtils';

// Réplica do sistema de tratativas do ALCATÉIA (validade_multiloja_tratativas
// / validade_multiloja_tratativa_registros), adaptada pro ULVA: loja única,
// sem loja_numero, e referenciando a tabela `validades` já existente aqui em
// vez de uma tabela de itens separada por loja.
//
// Fluxo: ao cadastrar/editar um produto na Validade com quantidade alta e
// vencimento próximo, uma tratativa é aberta sozinha (verificarEIniciarTratativa).
// A partir daí, quem acompanha faz um lançamento por dia (quantidade, preço,
// foto — obrigatória a partir do 3º dia em aberto) até encerrar como
// "sucesso" (resolvido, ex.: baixou o preço e vendeu tudo) ou "perda"
// (sobrou e virou quebra/perda).

export const PRAZO_TRATATIVA_DIAS = 20;
export const QUANTIDADE_ALERTA_TRATATIVA = 12;
export const DIAS_PARA_FOTO_OBRIGATORIA = 3;

export interface Tratativa {
  id: string;
  validadeId: string | null;
  codigoBarras: string | null;
  produto: string;
  unidade: string;
  setor: string | null;
  dataValidade: string;
  quantidadeInicial: number;
  quantidadeAtual: number;
  precoInicial: number | null;
  precoAtual: number | null;
  status: 'aberta' | 'sucesso' | 'perda';
  quantidadePerdida: number | null;
  abertaEm: string;
  encerradaEm: string | null;
  criadoPorNome: string | null;
}

export interface TratativaRegistro {
  id: string;
  tratativaId: string;
  data: string;
  quantidade: number;
  preco: number;
  pessoaNome: string | null;
  fotoUrl: string | null;
  anotacoes: string | null;
  criadoEm: string;
}

function linhaParaTratativa(l: any): Tratativa {
  return {
    id: l.id,
    validadeId: l.validade_id,
    codigoBarras: l.codigo_barras,
    produto: l.produto,
    unidade: l.unidade,
    setor: l.setor,
    dataValidade: l.data_validade,
    quantidadeInicial: Number(l.quantidade_inicial),
    quantidadeAtual: Number(l.quantidade_atual),
    precoInicial: l.preco_inicial === null ? null : Number(l.preco_inicial),
    precoAtual: l.preco_atual === null ? null : Number(l.preco_atual),
    status: l.status,
    quantidadePerdida: l.quantidade_perdida === null ? null : Number(l.quantidade_perdida),
    abertaEm: l.aberta_em,
    encerradaEm: l.encerrada_em,
    criadoPorNome: l.criado_por_nome,
  };
}

function linhaParaRegistro(l: any): TratativaRegistro {
  return {
    id: l.id,
    tratativaId: l.tratativa_id,
    data: l.data,
    quantidade: Number(l.quantidade),
    preco: Number(l.preco),
    pessoaNome: l.pessoa_nome,
    fotoUrl: l.foto_url,
    anotacoes: l.anotacoes,
    criadoEm: l.criado_em,
  };
}

// Mesmo critério do ALCATÉIA: quantidade alta (>12) e vencimento próximo
// (≤20 dias) — sinal de que o produto corre risco de virar perda se ninguém
// tratar antes (baixar o preço, remanejar, etc.).
export function atingeAlertaTratativa(quantidade: number, dataValidadeIso: string): boolean {
  return quantidade > QUANTIDADE_ALERTA_TRATATIVA && diasRestantes(dataValidadeIso) <= PRAZO_TRATATIVA_DIAS;
}

export function diasEmAberto(abertaEm: string, encerradaEm?: string | null): number {
  const fim = encerradaEm ? new Date(encerradaEm) : new Date();
  const inicio = new Date(abertaEm);
  return Math.max(0, Math.floor((fim.getTime() - inicio.getTime()) / 86400000));
}

export function fotoObrigatoria(abertaEm: string): boolean {
  return diasEmAberto(abertaEm) >= DIAS_PARA_FOTO_OBRIGATORIA;
}

// Chamada depois de salvar um produto na Validade (novo ou editado). Só abre
// tratativa se: bater o critério de alerta E ainda não existir uma tratativa
// aberta pra esse mesmo item — pra não duplicar a cada vez que a pessoa edita
// o mesmo produto.
export async function verificarEIniciarTratativa(
  item: Validade,
  criadoPorNome: string
): Promise<Tratativa | null> {
  if (!atingeAlertaTratativa(item.quantidade, item.dataValidade)) return null;

  const { data: existente, error: erroExistente } = await supabase
    .from('tratativas')
    .select('id')
    .eq('validade_id', item.id)
    .eq('status', 'aberta')
    .maybeSingle();
  if (erroExistente) throw erroExistente;
  if (existente) return null;

  const { data, error } = await supabase
    .from('tratativas')
    .insert({
      validade_id: item.id,
      codigo_barras: item.codigoBarras,
      produto: item.produto,
      unidade: item.unidade,
      setor: item.setor,
      data_validade: item.dataValidade,
      quantidade_inicial: item.quantidade,
      quantidade_atual: item.quantidade,
      criado_por_nome: criadoPorNome,
    })
    .select()
    .single();
  if (error) throw error;
  return linhaParaTratativa(data);
}

export async function buscarTratativasAbertas(): Promise<Tratativa[]> {
  const { data, error } = await supabase
    .from('tratativas')
    .select('*')
    .eq('status', 'aberta')
    .order('aberta_em', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(linhaParaTratativa);
}

// Últimas encerradas (sucesso/perda), pra quem quiser conferir o histórico —
// limitado aos últimos 60 dias pra não pesar a lista.
export async function buscarTratativasEncerradas(): Promise<Tratativa[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - 60);
  const { data, error } = await supabase
    .from('tratativas')
    .select('*')
    .neq('status', 'aberta')
    .gte('encerrada_em', desde.toISOString())
    .order('encerrada_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaTratativa);
}

export async function buscarRegistrosDaTratativa(tratativaId: string): Promise<TratativaRegistro[]> {
  const { data, error } = await supabase
    .from('tratativa_registros')
    .select('*')
    .eq('tratativa_id', tratativaId)
    .order('data', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaRegistro);
}

// Um lançamento por dia — se a pessoa já lançou hoje, o segundo lançamento
// substitui o primeiro (upsert por tratativa_id + data).
export async function registrarAtualizacaoDiaria(dados: {
  tratativaId: string;
  quantidade: number;
  preco: number;
  pessoaNome: string;
  fotoUrl: string | null;
  anotacoes: string | null;
}): Promise<TratativaRegistro> {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('tratativa_registros')
    .upsert(
      {
        tratativa_id: dados.tratativaId,
        data: hoje,
        quantidade: dados.quantidade,
        preco: dados.preco,
        pessoa_nome: dados.pessoaNome,
        foto_url: dados.fotoUrl,
        anotacoes: dados.anotacoes,
      },
      { onConflict: 'tratativa_id,data' }
    )
    .select()
    .single();
  if (error) throw error;

  const { error: erroAtualizar } = await supabase
    .from('tratativas')
    .update({
      quantidade_atual: dados.quantidade,
      preco_atual: dados.preco,
    })
    .eq('id', dados.tratativaId);
  if (erroAtualizar) throw erroAtualizar;

  // Se essa tratativa ainda não tinha preço inicial (foi aberta automática,
  // sem preço), registra o primeiro preço informado como o inicial também.
  await supabase
    .from('tratativas')
    .update({ preco_inicial: dados.preco })
    .eq('id', dados.tratativaId)
    .is('preco_inicial', null);

  return linhaParaRegistro(data);
}

export async function encerrarTratativa(dados: {
  tratativaId: string;
  status: 'sucesso' | 'perda';
  quantidadePerdida?: number;
}): Promise<Tratativa> {
  const { data, error } = await supabase
    .from('tratativas')
    .update({
      status: dados.status,
      quantidade_perdida: dados.status === 'perda' ? dados.quantidadePerdida ?? 0 : 0,
      encerrada_em: new Date().toISOString(),
    })
    .eq('id', dados.tratativaId)
    .select()
    .single();
  if (error) throw error;
  return linhaParaTratativa(data);
}

// Mesmo esquema de upload usado em Ocorrências/Conferências, no bucket
// compartilhado "tratativa-fotos" (já existe, criado pro ALCATÉIA) — prefixo
// "ulva/" só pra separar visualmente os arquivos das duas lojas no bucket.
export async function enviarFotoTratativa(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `ulva/${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('tratativa-fotos').upload(nomeArquivo, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('tratativa-fotos').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}
