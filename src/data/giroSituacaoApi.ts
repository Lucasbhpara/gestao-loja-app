import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';
import { criarTarefa } from './tarefasApi';

// =============================================================================
// Situação do produto na loja (gaveta do Giro de Produtos).
//
// Botões: Área de venda · Depósito · Sem preço · Mal exposto.
// "Depósito", "Sem preço" e "Mal exposto" geram na hora uma TAREFA para o
// encarregado do setor do produto. A situação é a própria tarefa aberta:
// enquanto ela não for concluída o botão aparece marcado; quando o
// encarregado conclui (com foto), o produto volta ao normal sozinho.
// Desmarcar o botão apaga a tarefa (se ainda não foi concluída).
// "Área de venda" confirma que o produto está exposto e tira o "Depósito".
//
// Cada tarefa leva no fim da descrição uma referência "giro:<flag>:<código>"
// para o app saber de qual produto/botão ela é — não precisa de tabela nova.
// =============================================================================

export type FlagGiro = 'deposito' | 'sem_preco' | 'mal_exposto';

export const FLAGS_GIRO: Record<FlagGiro, { rotulo: string; titulo: string; icone: string; o_que_fazer: string }> = {
  deposito: {
    rotulo: 'Depósito',
    titulo: 'Levar para a área de venda',
    icone: 'package',
    o_que_fazer: 'O produto está só no depósito: abastecer a área de venda.',
  },
  sem_preco: {
    rotulo: 'Sem preço',
    titulo: 'Colocar preço',
    icone: 'tag',
    o_que_fazer: 'O produto está sem preço na gôndola: colocar a etiqueta de preço.',
  },
  mal_exposto: {
    rotulo: 'Mal exposto',
    titulo: 'Melhorar a exposição',
    icone: 'eye-off',
    o_que_fazer: 'O produto está mal exposto: organizar frente, alinhamento e espaço na gôndola.',
  },
};

// Setor do Giro (classe do cadastro) → setor do encarregado.
export function setorDoProduto(setorGiro: string): SetorKey {
  const s = (setorGiro || '').toUpperCase();
  if (s.includes('ACOUGUE')) return 'acougue';
  if (s.includes('PADARIA')) return 'padaria';
  if (s.includes('PERECIVEIS')) return 'frios';
  if (s.includes('HORTI') || s === 'MARGEM GARANTIDA') return 'flv';
  return 'mercearia';
}

export const NOME_SETOR_TAREFA: Partial<Record<SetorKey, string>> = {
  acougue: 'Açougue',
  padaria: 'Padaria',
  frios: 'Frios',
  flv: 'FLV',
  mercearia: 'Mercearia',
};

const MARCA = /giro:(deposito|sem_preco|mal_exposto):([^\s]+)/;

export type SituacaoProduto = Partial<Record<FlagGiro, string>>; // flag → id da tarefa aberta

export async function listarSituacoes(): Promise<Map<string, SituacaoProduto>> {
  const { data, error } = await supabase
    .from('tarefas')
    .select('id,descricao')
    .eq('concluida', false)
    .ilike('descricao', '%giro:%');
  if (error) throw error;
  const mapa = new Map<string, SituacaoProduto>();
  ((data as any[]) || []).forEach((t) => {
    const m = MARCA.exec(t.descricao ?? '');
    if (!m) return;
    const flag = m[1] as FlagGiro;
    const codigo = m[2];
    mapa.set(codigo, { ...(mapa.get(codigo) ?? {}), [flag]: t.id });
  });
  return mapa;
}

export async function ligarFlag(
  flag: FlagGiro,
  produto: { codigo: string; nome: string; setor: string; estoque: number },
  barras: string[],
  por: string,
): Promise<string> {
  const info = FLAGS_GIRO[flag];
  const linhas = [
    info.o_que_fazer,
    `Produto: ${produto.nome}`,
    `Código: ${produto.codigo}${barras.length ? ` · EAN: ${barras.join(', ')}` : ''}`,
    `Estoque no sistema: ${produto.estoque.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`,
    `Marcado no Giro de Produtos por ${por}.`,
    `ref giro:${flag}:${produto.codigo}`,
  ];
  const t = await criarTarefa({
    titulo: `${info.titulo}: ${produto.nome}`,
    descricao: linhas.join('\n'),
    setor: setorDoProduto(produto.setor),
    prazo: null,
    criadoPorNome: por,
    prioridade: 'normal',
  });
  return t.id;
}

export async function desligarFlag(tarefaId: string): Promise<void> {
  const { error } = await supabase.from('tarefas').delete().eq('id', tarefaId).eq('concluida', false);
  if (error) throw error;
}
