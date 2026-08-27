import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';

export interface Aviso {
  id: string;
  titulo: string;
  mensagem: string;
  urgente: boolean;
  setor: SetorKey | null;
  fotoUrl: string | null;
  criadoPorNome: string;
  criadoEm: string;
}

export interface Visualizacao {
  colaboradorNome: string;
  visualizadoEm: string;
}

function linhaParaAviso(l: any): Aviso {
  return {
    id: l.id,
    titulo: l.titulo,
    mensagem: l.mensagem,
    urgente: l.urgente,
    setor: l.setor,
    fotoUrl: l.foto_url,
    criadoPorNome: l.criado_por_nome,
    criadoEm: l.criado_em,
  };
}

// Administrador vê todos os avisos, de qualquer setor.
export async function buscarTodosAvisos(): Promise<Aviso[]> {
  const { data, error } = await supabase.from('avisos').select('*').order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaAviso);
}

// Colaborador vê só os avisos gerais (setor null) e os do próprio setor.
export async function buscarAvisosDoSetor(setor: SetorKey): Promise<Aviso[]> {
  const { data, error } = await supabase
    .from('avisos')
    .select('*')
    .or(`setor.is.null,setor.eq.${setor}`)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaAviso);
}

export async function publicarAviso(dados: {
  titulo: string;
  mensagem: string;
  urgente: boolean;
  setor: SetorKey | null;
  fotoUrl: string | null;
  criadoPorNome: string;
}): Promise<Aviso> {
  const { data, error } = await supabase
    .from('avisos')
    .insert({
      titulo: dados.titulo,
      mensagem: dados.mensagem,
      urgente: dados.urgente,
      setor: dados.setor,
      foto_url: dados.fotoUrl,
      criado_por_nome: dados.criadoPorNome,
    })
    .select()
    .single();
  if (error) throw error;
  return linhaParaAviso(data);
}

export async function removerAviso(id: string): Promise<void> {
  const { error } = await supabase.from('avisos').delete().eq('id', id);
  if (error) throw error;
}

// Envia a foto pro Storage do Supabase (bucket "avisos-fotos") e devolve o
// link público, já pronto pra salvar no aviso.
export async function enviarFotoAviso(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('avisos-fotos').upload(nomeArquivo, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('avisos-fotos').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

// Registra que esse colaborador abriu o Mural (visto pelo administrador em
// "quem visualizou"). Chamado sozinho pelo app, sem o colaborador precisar
// fazer nada — repetir não duplica, só atualiza a data.
export async function marcarVisualizado(avisoId: string, colaboradorNome: string): Promise<void> {
  const { error } = await supabase.from('avisos_visualizacoes').upsert(
    { aviso_id: avisoId, colaborador_nome: colaboradorNome, visualizado_em: new Date().toISOString() },
    { onConflict: 'aviso_id,colaborador_nome' }
  );
  if (error) throw error;
}

export async function buscarVisualizacoes(avisoId: string): Promise<Visualizacao[]> {
  const { data, error } = await supabase
    .from('avisos_visualizacoes')
    .select('colaborador_nome, visualizado_em')
    .eq('aviso_id', avisoId)
    .order('visualizado_em', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((l: any) => ({ colaboradorNome: l.colaborador_nome, visualizadoEm: l.visualizado_em }));
}
