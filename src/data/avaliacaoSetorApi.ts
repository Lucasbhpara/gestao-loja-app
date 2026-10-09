import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';

// Checklist de Setor (ULVA) — avaliação diária de conformidade, feita pelo
// gerente, setor por setor, sem roteiro fixo de dia (qualquer um dos 6
// setores internos, mais a Área Externa, pode ser avaliado em qualquer
// dia). Ao finalizar, gera uma tarefa marcada como "muito importante" pro
// encarregado do setor, que só consegue concluí-la anexando uma foto (regra
// geral de tarefas, ver tarefasApi.ts).
//
// Tabelas próprias do ULVA: avaliacao_perguntas / avaliacoes_setor /
// avaliacao_respostas. Não confundir com as tabelas checklist_* do ALCATÉIA
// (outro app, mesmo projeto Supabase) nem com a rotina diária simples que
// vive nas mesmas tabelas (checklist_itens / checklist_marcacoes — sem
// foto/pontuação) — as duas hoje ficam juntas na mesma aba "Checklist" da
// Home (ver ChecklistHubScreen.tsx), mas continuam sendo ferramentas
// separadas por baixo do capô.

// 'area_externa' é o marcador especial de employees.ts (SetorKey) — não é
// setor de colaborador de verdade, existe só pra dar pra avaliar o entorno
// da loja (doca, estacionamento, fachada) aqui no Checklist de Setor. Uma
// não conformidade encontrada aqui vira tarefa sem setor de colaborador
// nenhum atrelado, então só aparece pro administrador em "Tarefas" (não
// aparece nas "Prioridades de hoje" de ninguém, já que ninguém tem esse
// setor) — ver nomeDoSetor em ChecklistSetorScreen.tsx.
export const SETORES_CHECKLIST: SetorKey[] = [
  'mercearia',
  'acougue',
  'flv',
  'frios',
  'padaria',
  'deposito',
  'area_externa',
];

export interface AvaliacaoPergunta {
  id: string;
  texto: string;
  ordem: number;
  ativo: boolean;
  // null = pergunta genérica de loja (aparece pros 6 setores internos,
  // comportamento original). Um valor específico (hoje só 'area_externa')
  // restringe a pergunta só àquele setor — ver buscarPerguntasAtivas.
  setor: SetorKey | null;
}

export type RespostaValor = 'sim' | 'nao' | 'na';

export interface AvaliacaoResposta {
  id: string;
  avaliacaoId: string;
  perguntaId: string | null;
  perguntaTexto: string;
  resposta: RespostaValor;
  justificativa: string | null;
  fotoUrl: string | null;
  respondidaEm: string;
}

export interface AvaliacaoSetor {
  id: string;
  setor: SetorKey;
  status: 'em_andamento' | 'finalizada';
  gerenteNome: string;
  iniciadaEm: string;
  finalizadaEm: string | null;
  pontosPossiveis: number | null;
  pontosRealizados: number | null;
  naoConformidades: number | null;
  aproveitamento: number | null;
  tarefaId: string | null;
  // Passos contados pelo pedômetro do celular entre iniciar e finalizar o
  // checklist (ver Pedometer em ChecklistSetorScreen.tsx) — null quando o
  // celular não tem o sensor ou quando a permissão foi negada.
  passosContados: number | null;
  // Localização capturada no momento em que o checklist foi iniciado (ver
  // expo-location em ChecklistSetorScreen.tsx) — null se a permissão foi
  // negada. localizacaoEndereco vem do reverse geocode (pode ser null mesmo
  // com lat/lng preenchidos, se o reverse geocode falhar).
  localizacaoLat: number | null;
  localizacaoLng: number | null;
  localizacaoEndereco: string | null;
}

function linhaParaPergunta(l: any): AvaliacaoPergunta {
  return { id: l.id, texto: l.texto, ordem: l.ordem, ativo: l.ativo, setor: l.setor };
}

function linhaParaAvaliacao(l: any): AvaliacaoSetor {
  return {
    id: l.id,
    setor: l.setor,
    status: l.status,
    gerenteNome: l.gerente_nome,
    iniciadaEm: l.iniciada_em,
    finalizadaEm: l.finalizada_em,
    pontosPossiveis: l.pontos_possiveis,
    pontosRealizados: l.pontos_realizados,
    naoConformidades: l.nao_conformidades,
    aproveitamento: l.aproveitamento === null ? null : Number(l.aproveitamento),
    tarefaId: l.tarefa_id,
    passosContados: l.passos_contados,
    localizacaoLat: l.localizacao_lat,
    localizacaoLng: l.localizacao_lng,
    localizacaoEndereco: l.localizacao_endereco,
  };
}

function linhaParaResposta(l: any): AvaliacaoResposta {
  return {
    id: l.id,
    avaliacaoId: l.avaliacao_id,
    perguntaId: l.pergunta_id,
    perguntaTexto: l.pergunta_texto,
    resposta: l.resposta,
    justificativa: l.justificativa,
    fotoUrl: l.foto_url,
    respondidaEm: l.respondida_em,
  };
}

// --- Perguntas (leitura pelo app; edição fica pelo portal) ------------------

// Pra 'area_externa', as perguntas são exclusivas dela (não faz sentido
// perguntar sobre câmara fria ou gôndola no estacionamento) — só entram as
// que têm `setor = 'area_externa'`. Pros 6 setores de loja, continua igual
// a antes: só as perguntas genéricas (`setor` nulo), que valem pra
// qualquer um deles.
export async function buscarPerguntasAtivas(setor: SetorKey): Promise<AvaliacaoPergunta[]> {
  let query = supabase.from('avaliacao_perguntas').select('*').eq('ativo', true);
  query = setor === 'area_externa' ? query.eq('setor', 'area_externa') : query.is('setor', null);
  const { data, error } = await query.order('ordem', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(linhaParaPergunta);
}

// --- Avaliações --------------------------------------------------------------

// Última avaliação de cada um dos 6 setores (pra mostrar "última vez em X" na
// lista de setores da tela do gerente).
export async function buscarUltimasAvaliacoesPorSetor(): Promise<Map<SetorKey, AvaliacaoSetor>> {
  const { data, error } = await supabase
    .from('avaliacoes_setor')
    .select('*')
    .eq('status', 'finalizada')
    .order('finalizada_em', { ascending: false });
  if (error) throw error;
  const mapa = new Map<SetorKey, AvaliacaoSetor>();
  (data ?? []).forEach((l: any) => {
    if (!mapa.has(l.setor)) mapa.set(l.setor, linhaParaAvaliacao(l));
  });
  return mapa;
}

// Busca uma avaliação específica pelo id — usado pra montar o PDF depois que
// o encarregado resolve as não conformidades (ver HomeColaboradorScreen.tsx),
// já que a tarefa só guarda o avaliacao_id, não os dados completos.
export async function buscarAvaliacaoPorId(id: string): Promise<AvaliacaoSetor | null> {
  const { data, error } = await supabase.from('avaliacoes_setor').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? linhaParaAvaliacao(data) : null;
}

// Uma avaliação em andamento nesse setor (pra retomar caso o app tenha
// fechado no meio do preenchimento), se existir.
export async function buscarAvaliacaoEmAndamento(setor: SetorKey): Promise<AvaliacaoSetor | null> {
  const { data, error } = await supabase
    .from('avaliacoes_setor')
    .select('*')
    .eq('setor', setor)
    .eq('status', 'em_andamento')
    .order('iniciada_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? linhaParaAvaliacao(data) : null;
}

export async function iniciarAvaliacao(setor: SetorKey, gerenteNome: string): Promise<AvaliacaoSetor> {
  const { data, error } = await supabase
    .from('avaliacoes_setor')
    .insert({ setor, gerente_nome: gerenteNome })
    .select()
    .single();
  if (error) throw error;
  return linhaParaAvaliacao(data);
}

// Salva a localização capturada no início do checklist — separado de
// iniciarAvaliacao porque pegar o GPS é assíncrono (pede permissão, espera o
// fix) e não deve travar a abertura da tela; ver ChecklistSetorScreen.tsx.
export async function salvarLocalizacaoAvaliacao(
  avaliacaoId: string,
  localizacao: { lat: number; lng: number; endereco: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('avaliacoes_setor')
    .update({
      localizacao_lat: localizacao.lat,
      localizacao_lng: localizacao.lng,
      localizacao_endereco: localizacao.endereco,
    })
    .eq('id', avaliacaoId);
  if (error) throw error;
}

export async function buscarRespostasDaAvaliacao(avaliacaoId: string): Promise<AvaliacaoResposta[]> {
  const { data, error } = await supabase
    .from('avaliacao_respostas')
    .select('*')
    .eq('avaliacao_id', avaliacaoId);
  if (error) throw error;
  return (data ?? []).map(linhaParaResposta);
}

// Salva (ou substitui) a resposta de uma pergunta — upsert por
// avaliacao_id + pergunta_id, pra não perder o progresso se o gerente sair e
// voltar no meio do checklist.
export async function salvarResposta(dados: {
  avaliacaoId: string;
  perguntaId: string;
  perguntaTexto: string;
  resposta: RespostaValor;
  justificativa: string | null;
  fotoUrl: string | null;
}): Promise<AvaliacaoResposta> {
  const { data, error } = await supabase
    .from('avaliacao_respostas')
    .upsert(
      {
        avaliacao_id: dados.avaliacaoId,
        pergunta_id: dados.perguntaId,
        pergunta_texto: dados.perguntaTexto,
        resposta: dados.resposta,
        justificativa: dados.justificativa,
        foto_url: dados.fotoUrl,
      },
      { onConflict: 'avaliacao_id,pergunta_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return linhaParaResposta(data);
}

// Finaliza a avaliação: calcula o aproveitamento (Sim=1 ponto, Não=0 ponto e
// conta como não conformidade, N/A é ignorado do cálculo) e cria uma tarefa
// de prioridade "alta" pro setor, resumindo as não conformidades encontradas.
// Só falha em criar a tarefa se não houver nenhuma não conformidade a listar
// — nesse caso não há por que gerar tarefa nenhuma.
export async function finalizarAvaliacao(dados: {
  avaliacaoId: string;
  setor: SetorKey;
  nomeSetor: string;
  gerenteNome: string;
  // Opcional — só vem preenchido quando o Pedometer conseguiu contar
  // (celular com sensor + permissão concedida).
  passosContados?: number | null;
}): Promise<AvaliacaoSetor> {
  const respostas = await buscarRespostasDaAvaliacao(dados.avaliacaoId);

  const validas = respostas.filter((r) => r.resposta !== 'na');
  const pontosPossiveis = validas.length;
  const pontosRealizados = validas.filter((r) => r.resposta === 'sim').length;
  const naoConformes = respostas.filter((r) => r.resposta === 'nao');
  const aproveitamento = pontosPossiveis > 0 ? Math.round((pontosRealizados / pontosPossiveis) * 1000) / 10 : 0;

  let tarefaId: string | null = null;
  if (naoConformes.length > 0) {
    const linhas = naoConformes
      .map((r, i) => `${i + 1}. ${r.perguntaTexto}${r.justificativa ? ` — ${r.justificativa}` : ''}`)
      .join('\n');
    const descricao =
      `Checklist de Setor finalizado por ${dados.gerenteNome}.\n` +
      `Aproveitamento: ${aproveitamento}% (${pontosRealizados}/${pontosPossiveis}).\n\n` +
      `Não conformidades encontradas:\n${linhas}`;

    const { data: tarefa, error: erroTarefa } = await supabase
      .from('tarefas')
      .insert({
        titulo: `Checklist de Setor — ${dados.nomeSetor}`,
        descricao,
        setor: dados.setor,
        criado_por_nome: dados.gerenteNome,
        prioridade: 'alta',
        avaliacao_id: dados.avaliacaoId,
        correcao_status: 'pendente',
      })
      .select()
      .single();
    if (erroTarefa) throw erroTarefa;
    tarefaId = tarefa.id;
  }

  const { data, error } = await supabase
    .from('avaliacoes_setor')
    .update({
      status: 'finalizada',
      finalizada_em: new Date().toISOString(),
      pontos_possiveis: pontosPossiveis,
      pontos_realizados: pontosRealizados,
      nao_conformidades: naoConformes.length,
      aproveitamento,
      tarefa_id: tarefaId,
      passos_contados: dados.passosContados ?? null,
    })
    .eq('id', dados.avaliacaoId)
    .select()
    .single();
  if (error) throw error;
  return linhaParaAvaliacao(data);
}

// Respostas de uma avaliação na ordem das perguntas do checklist (ordem da
// tabela avaliacao_perguntas, inclusive de perguntas desativadas depois) —
// pro PDF de avaliações antigas sair na mesma sequência em que foram feitas.
export async function buscarRespostasOrdenadas(avaliacaoId: string): Promise<AvaliacaoResposta[]> {
  const respostas = await buscarRespostasDaAvaliacao(avaliacaoId);
  const ids = respostas.map((r) => r.perguntaId).filter((id): id is string => !!id);
  if (ids.length === 0) return respostas;
  const { data, error } = await supabase.from('avaliacao_perguntas').select('id, ordem').in('id', ids);
  if (error) throw error;
  const ordem = new Map((data ?? []).map((l: any) => [l.id as string, l.ordem as number]));
  return [...respostas].sort(
    (a, b) => (ordem.get(a.perguntaId ?? '') ?? 9999) - (ordem.get(b.perguntaId ?? '') ?? 9999)
  );
}

// Checklists finalizados de todos os setores, mais recentes primeiro — lista
// "Checklists finalizados" da tela, de onde dá pra compartilhar o PDF de novo.
export async function buscarAvaliacoesFinalizadas(limite = 30): Promise<AvaliacaoSetor[]> {
  const { data, error } = await supabase
    .from('avaliacoes_setor')
    .select('*')
    .eq('status', 'finalizada')
    .order('finalizada_em', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map(linhaParaAvaliacao);
}

// Histórico de avaliações finalizadas de um setor, mais recentes primeiro —
// usado pra tela do gerente mostrar as últimas rodadas daquele setor.
export async function buscarHistoricoDoSetor(setor: SetorKey, limite = 20): Promise<AvaliacaoSetor[]> {
  const { data, error } = await supabase
    .from('avaliacoes_setor')
    .select('*')
    .eq('setor', setor)
    .eq('status', 'finalizada')
    .order('finalizada_em', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map(linhaParaAvaliacao);
}

// Mesmo padrão de upload usado em Tratativas/Ocorrências, num bucket próprio
// do ULVA (não reaproveita o "checklist-fotos" do ALCATÉIA pra não misturar
// fotos de produção das duas lojas no mesmo bucket).
export async function enviarFotoNaoConformidade(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('avaliacao-setor-fotos').upload(nomeArquivo, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('avaliacao-setor-fotos').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}
