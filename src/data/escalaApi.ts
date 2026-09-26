import { supabase } from '../lib/supabase';

// Escala de Folgas + Faltas/Atestados (ULVA) — uma única tabela reúne:
//  1) as folgas importadas da planilha de escala (tipo 'folga'), preenchidas
//     em lote a partir do Excel que a gerência já usa pra montar a escala;
//  2) o período de férias/licença/INSS de cada colaborador (tipo
//     'ferias_licenca_inss'), quando a própria planilha já trouxer essa
//     informação;
//  3) faltas e atestados lançados na hora, pelo app, por gerência ou
//     encarregado (tipo 'falta' / 'atestado') — ver registrarFaltaOuAtestado.
//
// Cada colaborador só pode ter UM registro por dia (unique
// colaborador_loja_id+data lá no banco): lançar uma falta/atestado num dia
// que já tinha uma folga importada da planilha SUBSTITUI a folga por esse
// lançamento mais específico.
//
// Tabela própria do ULVA: escala_folgas. Não confundir com "planilhas_folga"
// (só guarda o arquivo enviado pelo portal) nem com nada do ALCATÉIA.

export type TipoEscala = 'folga' | 'ferias_licenca_inss' | 'falta' | 'atestado';

export interface RegistroEscala {
  id: string;
  colaboradorLojaId: string;
  data: string; // 'AAAA-MM-DD'
  tipo: TipoEscala;
  observacao: string | null;
  registradoPorNome: string | null;
  fotoUrl: string | null;
  criadoEm: string;
}

function linhaParaRegistro(l: any): RegistroEscala {
  return {
    id: l.id,
    colaboradorLojaId: l.colaborador_loja_id,
    data: l.data,
    tipo: l.tipo,
    observacao: l.observacao,
    registradoPorNome: l.registrado_por_nome,
    fotoUrl: l.foto_url,
    criadoEm: l.criado_em,
  };
}

function limitesDoMes(ano: number, mes: number): { inicio: string; fim: string } {
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return { inicio, fim };
}

// Todos os registros (folga/férias/falta/atestado) de UM colaborador dentro
// de um mês — usado na tela pra mostrar o histórico dele antes de lançar
// uma nova falta/atestado.
export async function buscarEscalaDoColaboradorNoMes(
  colaboradorLojaId: string,
  ano: number,
  mes: number
): Promise<RegistroEscala[]> {
  const { inicio, fim } = limitesDoMes(ano, mes);
  const { data, error } = await supabase
    .from('escala_folgas')
    .select('*')
    .eq('colaborador_loja_id', colaboradorLojaId)
    .gte('data', inicio)
    .lte('data', fim)
    .order('data', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(linhaParaRegistro);
}

// Todos os registros de uma lista de colaboradores (ex.: todo mundo de um
// setor) dentro de um mês, num só request — usado pra montar de uma vez o
// resumo "quantas folgas/faltas cada um teve esse mês" na listagem.
export async function buscarEscalaDeVariosNoMes(
  colaboradorLojaIds: string[],
  ano: number,
  mes: number
): Promise<RegistroEscala[]> {
  if (colaboradorLojaIds.length === 0) return [];
  const { inicio, fim } = limitesDoMes(ano, mes);
  const { data, error } = await supabase
    .from('escala_folgas')
    .select('*')
    .in('colaborador_loja_id', colaboradorLojaIds)
    .gte('data', inicio)
    .lte('data', fim);
  if (error) throw error;
  return (data ?? []).map(linhaParaRegistro);
}

// Lança (ou substitui) uma falta ou atestado. "Não, só registrar" foi a
// decisão do gerente: isso aqui NÃO cria tarefa nem alerta nenhum sozinho,
// diferente do Checklist de Setor — é só o registro mesmo, que já entra
// automaticamente na escala (marca o colaborador como indisponível naquele
// dia), pra quem olhar a escala já ver.
export async function registrarFaltaOuAtestado(dados: {
  colaboradorLojaId: string;
  data: string;
  tipo: 'falta' | 'atestado';
  observacao: string | null;
  fotoUrl: string | null;
  registradoPorNome: string;
}): Promise<RegistroEscala> {
  const { data: linha, error } = await supabase
    .from('escala_folgas')
    .upsert(
      {
        colaborador_loja_id: dados.colaboradorLojaId,
        data: dados.data,
        tipo: dados.tipo,
        observacao: dados.observacao,
        foto_url: dados.fotoUrl,
        registrado_por_nome: dados.registradoPorNome,
      },
      { onConflict: 'colaborador_loja_id,data' }
    )
    .select()
    .single();
  if (error) throw error;
  return linhaParaRegistro(linha);
}

// Corrige um lançamento feito errado (ex.: registrou o dia errado por
// engano) — remove o registro por completo, sem deixar o dia marcado como
// nada (nem folga, nem falta).
export async function removerRegistroEscala(id: string): Promise<void> {
  const { error } = await supabase.from('escala_folgas').delete().eq('id', id);
  if (error) throw error;
}

// Mesmo padrão de upload usado em Tarefas/Checklist de Setor (fetch →
// arrayBuffer → upload), num bucket próprio pra documentação de atestado.
export async function enviarFotoAtestado(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('atestado-fotos').upload(nomeArquivo, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('atestado-fotos').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}
