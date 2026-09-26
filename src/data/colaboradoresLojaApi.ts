import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';

// Colaboradores "de chão de loja" — não têm login no app, são o time de
// cada encarregado/liderança (que sim tem login, na tabela `colaboradores`).
// Usado pela gaveta que abre na aba Equipe do portal e na aba Colaboradores
// do app, mostrando quem trabalha em cada setor.
export interface ColaboradorLoja {
  id: string;
  nome: string;
  matricula: string | null;
  cargo: string | null;
  setor: SetorKey;
  admissao: string | null; // 'AAAA-MM-DD'
  ativo: boolean;
}

function linhaParaColaboradorLoja(l: any): ColaboradorLoja {
  return {
    id: l.id,
    nome: l.nome,
    matricula: l.matricula,
    cargo: l.cargo,
    setor: l.setor,
    admissao: l.admissao,
    ativo: l.ativo ?? true,
  };
}

export async function buscarColaboradoresLoja(): Promise<ColaboradorLoja[]> {
  const { data, error } = await supabase.from('colaboradores_loja').select('*').order('nome');
  if (error) throw error;
  return (data ?? []).map(linhaParaColaboradorLoja);
}

export async function buscarColaboradoresLojaDoSetor(setor: SetorKey): Promise<ColaboradorLoja[]> {
  const { data, error } = await supabase
    .from('colaboradores_loja')
    .select('*')
    .eq('setor', setor)
    .order('nome');
  if (error) throw error;
  return (data ?? []).map(linhaParaColaboradorLoja);
}

// Corrige nome/matrícula/cargo, ou transfere o colaborador pra outro setor
// (outra "função"/gaveta) — é a mesma edição disponível no portal.
export async function atualizarColaboradorLoja(dados: {
  id: string;
  nome: string;
  matricula: string;
  cargo: string;
  setor: SetorKey;
}): Promise<ColaboradorLoja> {
  const { data, error } = await supabase
    .from('colaboradores_loja')
    .update({
      nome: dados.nome,
      matricula: dados.matricula,
      cargo: dados.cargo,
      setor: dados.setor,
    })
    .eq('id', dados.id)
    .select()
    .single();
  if (error) throw error;
  return linhaParaColaboradorLoja(data);
}

export async function removerColaboradorLoja(id: string): Promise<void> {
  const { error } = await supabase.from('colaboradores_loja').delete().eq('id', id);
  if (error) throw error;
}
