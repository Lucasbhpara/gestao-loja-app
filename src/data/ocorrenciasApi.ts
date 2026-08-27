import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';

export interface Ocorrencia {
  id: string;
  colaboradorNome: string;
  setor: SetorKey;
  texto: string;
  fotoUrl: string | null;
  status: 'aberta' | 'resolvida';
  criadoEm: string;
  resolvidaEm: string | null;
}

function linhaParaOcorrencia(l: any): Ocorrencia {
  return {
    id: l.id,
    colaboradorNome: l.colaborador_nome,
    setor: l.setor,
    texto: l.texto,
    fotoUrl: l.foto_url,
    status: l.status,
    criadoEm: l.criado_em,
    resolvidaEm: l.resolvida_em,
  };
}

// Só as ocorrências abertas por esse colaborador (pra ele acompanhar o
// próprio histórico e ver se já foi resolvida).
export async function buscarMinhasOcorrencias(colaboradorNome: string): Promise<Ocorrencia[]> {
  const { data, error } = await supabase
    .from('ocorrencias')
    .select('*')
    .eq('colaborador_nome', colaboradorNome)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaOcorrencia);
}

// Administrador vê todas, de qualquer colaborador/setor.
export async function buscarTodasOcorrencias(): Promise<Ocorrencia[]> {
  const { data, error } = await supabase.from('ocorrencias').select('*').order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaOcorrencia);
}

export async function abrirOcorrencia(dados: {
  colaboradorNome: string;
  setor: SetorKey;
  texto: string;
  fotoUrl: string | null;
}): Promise<Ocorrencia> {
  const { data, error } = await supabase
    .from('ocorrencias')
    .insert({
      colaborador_nome: dados.colaboradorNome,
      setor: dados.setor,
      texto: dados.texto,
      foto_url: dados.fotoUrl,
    })
    .select()
    .single();
  if (error) throw error;
  return linhaParaOcorrencia(data);
}

export async function marcarOcorrenciaResolvida(id: string): Promise<void> {
  const { error } = await supabase
    .from('ocorrencias')
    .update({ status: 'resolvida', resolvida_em: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Mesmo esquema de upload usado no Mural de Avisos, só que no bucket
// "ocorrencias-fotos".
export async function enviarFotoOcorrencia(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('ocorrencias-fotos').upload(nomeArquivo, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('ocorrencias-fotos').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}
