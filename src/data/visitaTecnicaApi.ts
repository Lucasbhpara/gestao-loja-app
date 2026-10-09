import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';

// Visita Técnica (ULVA) — checklist do Técnico Veterinário / Responsável
// Técnico, baseado no Manual de Boas Práticas e POPs da rede (Loja 296,
// rev. 12.26). É a "terceira via" de verificação, ao lado do Checklist de
// Setor do gerente e do checklist do APP/Auditor (ALCATÉIA).
//
// Este arquivo é só a parte "nuvem" (Supabase). O app trabalha primeiro no
// próprio celular (src/lib/visitaOffline.ts) — o veterinário entra em
// câmaras frias sem sinal — e sincroniza com as funções daqui quando tem
// internet.
//
// Regras principais:
//   - cada setor tem as SUAS perguntas; 'geral' = documentos da loja etc.;
//   - toda visita é de uma UNIDADE (número da loja visitada, perguntado
//     logo depois do vídeo de abertura);
//   - pergunta pode exigir foto e pode ser "crítica";
//   - ao finalizar, os "Não" viram UMA tarefa pro encarregado do setor —
//     SÓ quando a unidade visitada é a própria loja do ULVA
//     (UNIDADE_DA_LOJA). Em outras unidades a visita fica registrada (PDF,
//     Portal), mas não gera tarefa pra equipe da 327.
//
// Tabelas: visita_tecnica_perguntas / visitas_tecnicas /
// visita_tecnica_respostas. Fotos no bucket 'visita-tecnica-fotos'.

export const UNIDADE_DA_LOJA = '327';

export type SetorVisita = 'acougue' | 'frios' | 'padaria' | 'deposito' | 'mercearia' | 'flv' | 'geral';

export const SETORES_VISITA: { key: SetorVisita; nome: string }[] = [
  { key: 'acougue', nome: 'Açougue' },
  { key: 'frios', nome: 'Frios' },
  { key: 'padaria', nome: 'Padaria' },
  { key: 'flv', nome: 'Hortifrúti (FLV)' },
  { key: 'deposito', nome: 'Depósito' },
  { key: 'mercearia', nome: 'Mercearia' },
  { key: 'geral', nome: 'Geral e Documentos' },
];

export function nomeDoSetorVisita(key: SetorVisita): string {
  return SETORES_VISITA.find((s) => s.key === key)?.nome ?? key;
}

// Quem é "Técnico Veterinário" no ULVA: colaborador comum, cadastrado pelo
// portal, cuja função contém "veterin" (ex.: "Técnico Veterinário",
// "Médico Veterinário") ou "responsável técnico". Sem acento e sem
// diferenciar maiúscula, pra não depender de como a função foi digitada.
export function ehTecnicoVeterinario(funcao: string | null | undefined): boolean {
  if (!funcao) return false;
  const f = funcao
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return f.includes('veterin') || f.includes('responsavel tecnico');
}

export interface VisitaPergunta {
  id: string;
  setor: SetorVisita;
  ordem: number;
  grupo: string | null;
  texto: string;
  fotoObrigatoria: boolean;
  critico: boolean;
  baseManual: string | null;
  comoVerificar: string | null;
  ativo: boolean;
}

export type RespostaVisita = 'sim' | 'nao' | 'na';

export interface VisitaResposta {
  id: string;
  visitaId: string;
  perguntaId: string | null;
  perguntaTexto: string;
  critico: boolean;
  resposta: RespostaVisita;
  justificativa: string | null;
  fotoUrl: string | null;
  respondidaEm: string;
}

export interface VisitaTecnica {
  id: string;
  setor: SetorVisita;
  unidade: string | null;
  status: 'em_andamento' | 'finalizada';
  veterinarioNome: string;
  veterinarioMatricula: string | null;
  iniciadaEm: string;
  finalizadaEm: string | null;
  pontosPossiveis: number | null;
  pontosRealizados: number | null;
  naoConformidades: number | null;
  criticosNaoConformes: number | null;
  aproveitamento: number | null;
  tarefaId: string | null;
  passosContados: number | null;
  localizacaoLat: number | null;
  localizacaoLng: number | null;
  localizacaoEndereco: string | null;
  consideracoesFinais: string | null;
  // Perguntas que ficaram sem resposta quando a visita foi finalizada antes
  // de terminar ("Não avaliada" — fora da nota).
  perguntasNaoAvaliadas: number | null;
}

function linhaParaPergunta(l: any): VisitaPergunta {
  return {
    id: l.id,
    setor: l.setor,
    ordem: l.ordem,
    grupo: l.grupo,
    texto: l.texto,
    fotoObrigatoria: l.foto_obrigatoria,
    critico: l.critico,
    baseManual: l.base_manual,
    comoVerificar: l.como_verificar,
    ativo: l.ativo,
  };
}

function linhaParaResposta(l: any): VisitaResposta {
  return {
    id: l.id,
    visitaId: l.visita_id,
    perguntaId: l.pergunta_id,
    perguntaTexto: l.pergunta_texto,
    critico: l.critico,
    resposta: l.resposta,
    justificativa: l.justificativa,
    fotoUrl: l.foto_url,
    respondidaEm: l.respondida_em,
  };
}

function linhaParaVisita(l: any): VisitaTecnica {
  return {
    id: l.id,
    setor: l.setor,
    unidade: l.unidade ?? null,
    status: l.status,
    veterinarioNome: l.veterinario_nome,
    veterinarioMatricula: l.veterinario_matricula,
    iniciadaEm: l.iniciada_em,
    finalizadaEm: l.finalizada_em,
    pontosPossiveis: l.pontos_possiveis,
    pontosRealizados: l.pontos_realizados,
    naoConformidades: l.nao_conformidades,
    criticosNaoConformes: l.criticos_nao_conformes,
    aproveitamento: l.aproveitamento === null ? null : Number(l.aproveitamento),
    tarefaId: l.tarefa_id,
    passosContados: l.passos_contados,
    localizacaoLat: l.localizacao_lat,
    localizacaoLng: l.localizacao_lng,
    localizacaoEndereco: l.localizacao_endereco,
    consideracoesFinais: l.consideracoes_finais ?? null,
    perguntasNaoAvaliadas: l.perguntas_nao_avaliadas ?? null,
  };
}

// --- Perguntas ---------------------------------------------------------------

// Todas as perguntas ativas de uma vez — o app guarda no celular (cache)
// pra conseguir abrir qualquer setor mesmo sem internet.
export async function buscarTodasPerguntasAtivas(): Promise<VisitaPergunta[]> {
  const { data, error } = await supabase
    .from('visita_tecnica_perguntas')
    .select('*')
    .eq('ativo', true)
    .order('setor')
    .order('ordem', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(linhaParaPergunta);
}

// incluirInativas = true é pro PDF de visitas antigas: uma pergunta
// desativada depois da visita ainda precisa aparecer no relatório dela.
export async function buscarPerguntasDoSetor(setor: SetorVisita, incluirInativas = false): Promise<VisitaPergunta[]> {
  let query = supabase.from('visita_tecnica_perguntas').select('*').eq('setor', setor);
  if (!incluirInativas) query = query.eq('ativo', true);
  const { data, error } = await query.order('ordem', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(linhaParaPergunta);
}

// --- Visitas (leitura) -------------------------------------------------------

// Última visita finalizada de cada setor NAQUELA unidade.
export async function buscarUltimasVisitasPorSetor(unidade: string): Promise<Map<SetorVisita, VisitaTecnica>> {
  const { data, error } = await supabase
    .from('visitas_tecnicas')
    .select('*')
    .eq('status', 'finalizada')
    .eq('unidade', unidade)
    .order('finalizada_em', { ascending: false })
    .limit(200);
  if (error) throw error;
  const mapa = new Map<SetorVisita, VisitaTecnica>();
  (data ?? []).forEach((l: any) => {
    if (!mapa.has(l.setor)) mapa.set(l.setor, linhaParaVisita(l));
  });
  return mapa;
}

// Visitas finalizadas, mais recentes primeiro (de uma unidade, ou todas).
export async function buscarVisitasFinalizadas(unidade: string | null, limite = 30): Promise<VisitaTecnica[]> {
  let query = supabase.from('visitas_tecnicas').select('*').eq('status', 'finalizada');
  if (unidade) query = query.eq('unidade', unidade);
  const { data, error } = await query.order('finalizada_em', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []).map(linhaParaVisita);
}

export async function buscarVisitaPorId(id: string): Promise<VisitaTecnica | null> {
  const { data, error } = await supabase.from('visitas_tecnicas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? linhaParaVisita(data) : null;
}

// Visita em andamento desse setor/unidade que esteja só na nuvem (ex.:
// começada em outro celular) — o app traz pro celular pra continuar.
export async function buscarVisitaEmAndamentoRemota(setor: SetorVisita, unidade: string): Promise<VisitaTecnica | null> {
  const { data, error } = await supabase
    .from('visitas_tecnicas')
    .select('*')
    .eq('setor', setor)
    .eq('unidade', unidade)
    .eq('status', 'em_andamento')
    .order('iniciada_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? linhaParaVisita(data) : null;
}

export async function buscarRespostasDaVisita(visitaId: string): Promise<VisitaResposta[]> {
  const { data, error } = await supabase.from('visita_tecnica_respostas').select('*').eq('visita_id', visitaId);
  if (error) throw error;
  return (data ?? []).map(linhaParaResposta);
}

// --- Visitas (gravação — chamadas pela sincronização) ------------------------

// Cria/atualiza o cabeçalho da visita com o id gerado no celular. Sempre
// grava como 'em_andamento': quem marca 'finalizada' é finalizarVisita, que
// também gera a tarefa — a sincronização confere antes se a visita já não
// foi finalizada na nuvem, pra nunca "desfinalizar" nem duplicar tarefa.
export async function gravarCabecalhoVisita(v: {
  id: string;
  setor: SetorVisita;
  unidade: string;
  veterinarioNome: string;
  veterinarioMatricula: string | null;
  iniciadaEm: string;
  localizacaoLat: number | null;
  localizacaoLng: number | null;
  localizacaoEndereco: string | null;
  consideracoesFinais: string | null;
}): Promise<void> {
  const { error } = await supabase.from('visitas_tecnicas').upsert(
    {
      id: v.id,
      setor: v.setor,
      unidade: v.unidade,
      status: 'em_andamento',
      veterinario_nome: v.veterinarioNome,
      veterinario_matricula: v.veterinarioMatricula,
      iniciada_em: v.iniciadaEm,
      localizacao_lat: v.localizacaoLat,
      localizacao_lng: v.localizacaoLng,
      localizacao_endereco: v.localizacaoEndereco,
      consideracoes_finais: v.consideracoesFinais,
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

export async function statusRemotoDaVisita(id: string): Promise<'em_andamento' | 'finalizada' | null> {
  const { data, error } = await supabase.from('visitas_tecnicas').select('status').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? (data.status as any) : null;
}

// Upsert por visita + pergunta (não duplica se for reenviada).
export async function gravarRespostaVisita(dados: {
  visitaId: string;
  perguntaId: string;
  perguntaTexto: string;
  critico: boolean;
  resposta: RespostaVisita;
  justificativa: string | null;
  fotoUrl: string | null;
  respondidaEm: string;
}): Promise<void> {
  const { error } = await supabase.from('visita_tecnica_respostas').upsert(
    {
      visita_id: dados.visitaId,
      pergunta_id: dados.perguntaId,
      pergunta_texto: dados.perguntaTexto,
      critico: dados.critico,
      resposta: dados.resposta,
      justificativa: dados.justificativa,
      foto_url: dados.fotoUrl,
      respondida_em: dados.respondidaEm,
    },
    { onConflict: 'visita_id,pergunta_id' }
  );
  if (error) throw error;
}

// Finaliza a visita na nuvem: Sim = 1 ponto, Não = 0 (não conformidade),
// N/A fica fora do cálculo. Se houver "Não" e a unidade for a própria loja
// (UNIDADE_DA_LOJA), cria UMA tarefa pro encarregado do setor (setor
// 'geral' → tarefa sem setor, só pro administrador), com prioridade alta
// quando algum item crítico foi reprovado.
export async function finalizarVisita(dados: {
  visitaId: string;
  setor: SetorVisita;
  unidade: string | null;
  veterinarioNome: string;
  passosContados?: number | null;
  finalizadaEm?: string;
  consideracoesFinais?: string | null;
  perguntasNaoAvaliadas?: number | null;
  // Ordem das perguntas na tela, pra lista de não conformidades da tarefa
  // sair na mesma sequência do checklist.
  ordemPerguntas?: string[];
}): Promise<VisitaTecnica> {
  const respostas = await buscarRespostasDaVisita(dados.visitaId);
  if (dados.ordemPerguntas) {
    const pos = new Map(dados.ordemPerguntas.map((id, i) => [id, i]));
    respostas.sort((a, b) => (pos.get(a.perguntaId ?? '') ?? 999) - (pos.get(b.perguntaId ?? '') ?? 999));
  }

  const validas = respostas.filter((r) => r.resposta !== 'na');
  const pontosPossiveis = validas.length;
  const pontosRealizados = validas.filter((r) => r.resposta === 'sim').length;
  const naoConformes = respostas.filter((r) => r.resposta === 'nao');
  const criticos = naoConformes.filter((r) => r.critico);
  const aproveitamento = pontosPossiveis > 0 ? Math.round((pontosRealizados / pontosPossiveis) * 1000) / 10 : 0;
  const nomeSetor = nomeDoSetorVisita(dados.setor);

  let tarefaId: string | null = null;
  if (naoConformes.length > 0 && dados.unidade === UNIDADE_DA_LOJA) {
    const linhas = naoConformes
      .map((r, i) => `${i + 1}. ${r.critico ? '[CRÍTICO] ' : ''}${r.perguntaTexto}${r.justificativa ? ` — ${r.justificativa}` : ''}`)
      .join('\n');
    const descricao =
      `Visita Técnica (veterinário) finalizada por ${dados.veterinarioNome}.\n` +
      `Aproveitamento: ${aproveitamento}% (${pontosRealizados}/${pontosPossiveis}).` +
      (criticos.length ? `\nItens críticos reprovados: ${criticos.length}.` : '') +
      `\n\nNão conformidades encontradas:\n${linhas}` +
      (dados.perguntasNaoAvaliadas ? `\n\nPerguntas não avaliadas nesta visita: ${dados.perguntasNaoAvaliadas}.` : '') +
      (dados.consideracoesFinais ? `\n\nConsiderações finais: ${dados.consideracoesFinais}` : '');

    const { data: tarefa, error: erroTarefa } = await supabase
      .from('tarefas')
      .insert({
        titulo: `Visita Técnica — ${nomeSetor}`,
        descricao,
        setor: dados.setor === 'geral' ? null : (dados.setor as SetorKey),
        criado_por_nome: dados.veterinarioNome,
        prioridade: criticos.length > 0 ? 'alta' : 'normal',
        visita_tecnica_id: dados.visitaId,
      })
      .select()
      .single();
    if (erroTarefa) throw erroTarefa;
    tarefaId = tarefa.id;
  }

  const { data, error } = await supabase
    .from('visitas_tecnicas')
    .update({
      status: 'finalizada',
      finalizada_em: dados.finalizadaEm ?? new Date().toISOString(),
      pontos_possiveis: pontosPossiveis,
      pontos_realizados: pontosRealizados,
      nao_conformidades: naoConformes.length,
      criticos_nao_conformes: criticos.length,
      aproveitamento,
      tarefa_id: tarefaId,
      passos_contados: dados.passosContados ?? null,
      consideracoes_finais: dados.consideracoesFinais ?? null,
      perguntas_nao_avaliadas: dados.perguntasNaoAvaliadas ?? 0,
    })
    .eq('id', dados.visitaId)
    .select()
    .single();
  if (error) throw error;
  return linhaParaVisita(data);
}

export async function enviarFotoVisita(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('visita-tecnica-fotos').upload(nomeArquivo, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('visita-tecnica-fotos').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}
