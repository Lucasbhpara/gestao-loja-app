import { supabase, supabaseConfigurado } from './supabase';
import { Employee } from '../data/employees';

// Registra um acesso (login) do colaborador — é isso que alimenta a página
// "Acessos" do portal, onde o administrador acompanha quem abriu o app e
// quantas vezes por dia.
//
// Só grava quando o Supabase está configurado (sem isso não tem onde
// consultar depois) e falha em silêncio: um problema aqui nunca pode
// impedir o colaborador de entrar no app.
export async function registrarAcesso(colaborador: Employee): Promise<void> {
  if (!supabaseConfigurado) return;
  try {
    await supabase.from('log_acessos').insert({
      colaborador_id: colaborador.id,
      nome: colaborador.nome,
      funcao: colaborador.funcao,
      setor: colaborador.setor,
    });
  } catch {
    // silencioso, de propósito — ver comentário acima
  }
}
