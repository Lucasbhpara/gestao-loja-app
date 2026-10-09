import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';

// Visita Técnica (ULVA) — checklist do Técnico Veterinário / Responsável
// Técnico, baseado no Manual de Boas Práticas e POPs da rede (Loja 296,
// rev. 12.26). É a "terceira via" de verificação, ao lado do Checklist de
// Setor do gerente e do checklist do APP/Auditor (ALCATÉIA).
//
// Diferenças em relação ao Checklist de Setor (avaliacaoSetorApi.ts):
//   - cada setor tem as SUAS perguntas (coluna `setor` sempre preenchida),
//     em vez de um grupo genérico que vale pra todos;
//   - existe o "setor" especial 'geral' (documentos da loja, caixa d'água,
//     dedetização, ASO…), que não tem encarregado — a tarefa gerada vai sem
//     setor (aparece pro administrador);
//   - pergunta pode exigir foto mesmo quando a resposta é "Sim" (evidência
//     da visita: termômetro, câmara etc.) — `fotoObrigatoria`;
//   - pergunta pode ser "crítica" (temperatura, validade, contaminação
//     cruzada, pragas). "Não" em item crítico deixa a tarefa como
//     prioridade alta e aparece destacado no resumo.
//
// Tabelas próprias: visita_tecnica_perguntas / visitas_tecnicas /
// visita_tecnica_respostas. Fotos no bucket 'visita-tecnica-fotos'.

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
// "Médico Veterinário") ou "responsável técnico". Comparação sem acento e
// sem diferenciar maiúscula, pra não depender de como a função foi digitada.
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
  };
}

// --- Perguntas ---------------------------------------------------------------

// incluirInativas = true é pro PDF de visitas antigas: uma pergunta
// desativada depois da visita ainda precisa aparecer no relatório dela.
export async function buscarPerguntasDoSetor(setor: SetorVisita, incluirInativas = false): Promise<VisitaPergunta[]> {
  let query = supabase.from('visita_tecnica_perguntas').select('*').eq('setor', setor);
  if (!incluirInativas) query = query.eq('ativo', true);
  const { data, error } = await query.order('ordem', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(linhaParaPergunta);
}

// --- Visitas -----------------------------------------------------------------

export async function buscarUltimasVisitasPorSetor(): Promise<Map<SetorVisita, VisitaTecnica>> {
  const { data, error } = await supabase
    .from('visitas_tecnicas')
    .select('*')
    .eq('status', 'finalizada')
    .order('finalizada_em', { ascending: false })
    .limit(200);
  if (error) throw error;
  const mapa = new Map<SetorVisita, VisitaTecnica>();
  (data ?? []).forEach((l: any) => {
    if (!mapa.has(l.setor)) mapa.set(l.setor, linhaParaVisita(l));
  });
  return mapa;
}

// Visitas já finalizadas (todos os setores), mais recentes primeiro — lista
// "Visitas finalizadas" da tela, de onde dá pra compartilhar o PDF de novo.
export async function buscarVisitasFinalizadas(limite = 30): Promise<VisitaTecnica[]> {
  const { data, error } = await supabase
    .from('visitas_tecnicas')
    .select('*')
    .eq('status', 'finalizada')
    .order('finalizada_em', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map(linhaParaVisita);
}

// Resumo pro painel da tela inicial: quantas perguntas (e críticas) cada
// setor tem, e o progresso das visitas em andamento (respondidas / total).
export interface ResumoSetorVisita {
  perguntas: number;
  criticas: number;
  emAndamento: { visitaId: string; respondidas: number; iniciadaEm: string } | null;
}

export async function buscarResumoSetores(): Promise<Map<SetorVisita, ResumoSetorVisita>> {
  const [{ data: perguntas, error: e1 }, { data: abertas, error: e2 }] = await Promise.all([
    supabase.from('visita_tecnica_perguntas').select('setor, critico').eq('ativo', true),
    supabase.from('visitas_tecnicas').select('id, setor, iniciada_em').eq('status', 'em_andamento').order('iniciada_em', { ascending: false }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const mapa = new Map<SetorVisita, ResumoSetorVisita>();
  SETORES_VISITA.forEach((s) => mapa.set(s.key, { perguntas: 0, criticas: 0, emAndamento: null }));
  (perguntas ?? []).forEach((p: any) => {
    const r = mapa.get(p.setor);
    if (!r) return;
    r.perguntas++;
    if (p.critico) r.criticas++;
  });

  // Mesma regra da tela: vale a visita em andamento mais recente do setor.
  const maisRecentes = new Map<string, any>();
  (abertas ?? []).forEach((v: any) => {
    if (!maisRecentes.has(v.setor)) maisRecentes.set(v.setor, v);
  });
  const ids = Array.from(maisRecentes.values()).map((v) => v.id);
  const contagem = new Map<string, number>();
  if (ids.length > 0) {
    const { data: resp, error: e3 } = await supabase.from('visita_tecnica_respostas').select('visita_id').in('visita_id', ids);
    if (e3) throw e3;
    (resp ?? []).forEach((r: any) => contagem.set(r.visita_id, (contagem.get(r.visita_id) ?? 0) + 1));
  }
  maisRecentes.forEach((v, setor) => {
    const r = mapa.get(setor as SetorVisita);
    if (r) r.emAndamento = { visitaId: v.id, respondidas: contagem.get(v.id) ?? 0, iniciadaEm: v.iniciada_em };
  });
  return mapa;
}

export async function buscarVisitaPorId(id: string): Promise<VisitaTecnica | null> {
  const { data, error } = await supabase.from('visitas_tecnicas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? linhaParaVisita(data) : null;
}

export async function buscarVisitaEmAndamento(setor: SetorVisita): Promise<VisitaTecnica | null> {
  const { data, error } = await supabase
    .from('visitas_tecnicas')
    .select('*')
    .eq('setor', setor)
    .eq('status', 'em_andamento')
    .order('iniciada_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? linhaParaVisita(data) : null;
}

export async function iniciarVisita(setor: SetorVisita, nome: string, matricula: string | null): Promise<VisitaTecnica> {
  const { data, error } = await supabase
    .from('visitas_tecnicas')
    .insert({ setor, veterinario_nome: nome, veterinario_matricula: matricula })
    .select()
    .single();
  if (error) throw error;
  return linhaParaVisita(data);
}

export async function salvarLocalizacaoVisita(
  visitaId: string,
  localizacao: { lat: number; lng: number; endereco: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('visitas_tecnicas')
    .update({
      localizacao_lat: localizacao.lat,
      localizacao_lng: localizacao.lng,
      localizacao_endereco: localizacao.endereco,
    })
    .eq('id', visitaId);
  if (error) throw error;
}

export async function buscarRespostasDaVisita(visitaId: string): Promise<VisitaResposta[]> {
  const { data, error } = await supabase.from('visita_tecnica_respostas').select('*').eq('visita_id', visitaId);
  if (error) throw error;
  return (data ?? []).map(linhaParaResposta);
}

// Upsert por visita + pergunta, pra não perder o progresso se o app fechar.
export async function salvarRespostaVisita(dados: {
  visitaId: string;
  pergunta: VisitaPergunta;
  resposta: RespostaVisita;
  justificativa: string | null;
  fotoUrl: string | null;
}): Promise<VisitaResposta> {
  const { data, error } = await supabase
    .from('visita_tecnica_respostas')
    .upsert(
      {
        visita_id: dados.visitaId,
        pergunta_id: dados.pergunta.id,
        pergunta_texto: dados.pergunta.texto,
        critico: dados.pergunta.critico,
        resposta: dados.resposta,
        justificativa: dados.justificativa,
        foto_url: dados.fotoUrl,
        respondida_em: new Date().toISOString(),
      },
      { onConflict: 'visita_id,pergunta_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return linhaParaResposta(data);
}

// Finaliza a visita: Sim = 1 ponto, Não = 0 (não conformidade), N/A fica fora
// do cálculo. Se houver "Não", cria UMA tarefa pro encarregado do setor
// (setor 'geral' → tarefa sem setor, só pro administrador), com prioridade
// alta quando algum item crítico foi reprovado. A tarefa só pode ser
// concluída com foto (regra geral de tarefasApi.ts).
export async function finalizarVisita(dados: {
  visitaId: string;
  setor: SetorVisita;
  veterinarioNome: string;
  passosContados?: number | null;
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
  if (naoConformes.length > 0) {
    const linhas = naoConformes
      .map((r, i) => `${i + 1}. ${r.critico ? '[CRÍTICO] ' : ''}${r.perguntaTexto}${r.justificativa ? ` — ${r.justificativa}` : ''}`)
      .join('\n');
    const descricao =
      `Visita Técnica (veterinário) finalizada por ${dados.veterinarioNome}.\n` +
      `Aproveitamento: ${aproveitamento}% (${pontosRealizados}/${pontosPossiveis}).` +
      (criticos.length ? `\nItens críticos reprovados: ${criticos.length}.` : '') +
      `\n\nNão conformidades encontradas:\n${linhas}`;

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
      finalizada_em: new Date().toISOString(),
      pontos_possiveis: pontosPossiveis,
      pontos_realizados: pontosRealizados,
      nao_conformidades: naoConformes.length,
      criticos_nao_conformes: criticos.length,
      aproveitamento,
      tarefa_id: tarefaId,
      passos_contados: dados.passosContados ?? null,
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
