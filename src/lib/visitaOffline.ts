import AsyncStorage from '@react-native-async-storage/async-storage';
import { rodandoNaWeb } from './plataforma';
import {
  RespostaVisita,
  SetorVisita,
  VisitaPergunta,
  VisitaTecnica,
  buscarRespostasDaVisita,
  buscarTodasPerguntasAtivas,
  buscarVisitaEmAndamentoRemota,
  buscarVisitaPorId,
  enviarFotoVisita,
  finalizarVisita,
  gravarCabecalhoVisita,
  gravarRespostaVisita,
  statusRemotoDaVisita,
} from '../data/visitaTecnicaApi';

// =============================================================================
// Visita Técnica — modo offline.
//
// O veterinário entra em câmaras frias e depósitos sem sinal, então TUDO da
// visita é gravado primeiro no próprio celular (AsyncStorage + fotos numa
// pasta do app) e enviado pro Supabase quando tiver internet:
//
//   - as perguntas de todos os setores ficam guardadas no celular (cache),
//     atualizadas sempre que der;
//   - a visita ganha um id gerado no celular, então pode ser criada,
//     respondida e até FINALIZADA sem internet;
//   - sincronizar() envia: cabeçalho da visita → fotos → respostas → e, se
//     a visita já foi finalizada no celular, chama finalizarVisita (que
//     calcula a nota e cria a tarefa) — uma vez só;
//   - roda sozinho a cada 30s, quando o app volta pra frente e logo depois
//     de cada resposta; também tem o botão "Enviar agora".
//
// O estado é "o que está no celular": se a mesma pergunta for respondida
// duas vezes, vale a última (a nuvem recebe um upsert, nunca duplica).
// =============================================================================

const CHAVE = '@ulva/visita-tecnica-offline-v2';

export const MAX_FOTOS = 5;

// Uma foto da resposta: `local` enquanto só existe no celular, `url`
// depois de enviada pra nuvem.
export interface FotoLocal {
  id: string;
  local: string | null;
  url: string | null;
}

export interface RespostaLocal {
  perguntaId: string;
  perguntaTexto: string;
  critico: boolean;
  resposta: RespostaVisita;
  justificativa: string | null;
  fotos: FotoLocal[];
  respondidaEm: string;
  pendente: boolean; // precisa ser (re)enviada
}

export interface VisitaLocal {
  id: string;
  setor: SetorVisita;
  unidade: string;
  veterinarioNome: string;
  veterinarioMatricula: string | null;
  iniciadaEm: string;
  status: 'em_andamento' | 'finalizada';
  finalizadaEm: string | null;
  passos: number | null;
  localizacaoLat: number | null;
  localizacaoLng: number | null;
  localizacaoEndereco: string | null;
  consideracoes: string;
  respostas: Record<string, RespostaLocal>;
  cabecalhoPendente: boolean;
  // Resultado calculado no celular ao finalizar (pra mostrar a nota mesmo
  // sem internet) e, depois de sincronizar, o resultado oficial da nuvem.
  resultadoLocal: { aproveitamento: number; naoConformidades: number; criticos: number; naoAvaliadas: number } | null;
  resultadoNuvem: VisitaTecnica | null;
  ultimoErro: string | null;
}

interface Estado {
  visitas: Record<string, VisitaLocal>;
  perguntas: VisitaPergunta[];
  perguntasAtualizadasEm: string | null;
}

let estado: Estado = { visitas: {}, perguntas: [], perguntasAtualizadasEm: null };
let carregado = false;
let carregando: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

// --- utilidades --------------------------------------------------------------

export function gerarId(): string {
  // UUID v4 (formato aceito pela coluna uuid do Postgres).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function avisar() {
  ouvintes.forEach((f) => {
    try {
      f();
    } catch {
      // ignora
    }
  });
}

let gravacaoAgendada: ReturnType<typeof setTimeout> | null = null;
function persistir() {
  avisar();
  if (gravacaoAgendada) clearTimeout(gravacaoAgendada);
  gravacaoAgendada = setTimeout(() => {
    AsyncStorage.setItem(CHAVE, JSON.stringify(estado)).catch(() => {});
  }, 250);
}

async function persistirAgora() {
  if (gravacaoAgendada) clearTimeout(gravacaoAgendada);
  await AsyncStorage.setItem(CHAVE, JSON.stringify(estado)).catch(() => {});
}

export async function carregarOffline(): Promise<void> {
  if (carregado) return;
  if (!carregando) {
    carregando = (async () => {
      try {
        const bruto = await AsyncStorage.getItem(CHAVE);
        if (bruto) estado = { ...estado, ...JSON.parse(bruto) };
      } catch {
        // celular sem nada salvo / dado corrompido — começa limpo
      }
      carregado = true;
      avisar();
    })();
  }
  await carregando;
}

export function assinar(f: () => void): () => void {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

// --- perguntas (cache) -------------------------------------------------------

export async function atualizarPerguntas(): Promise<boolean> {
  try {
    const lista = await buscarTodasPerguntasAtivas();
    if (lista.length > 0) {
      estado.perguntas = lista;
      estado.perguntasAtualizadasEm = new Date().toISOString();
      persistir();
    }
    return true;
  } catch {
    return false; // sem internet — segue com o que já está guardado
  }
}

export function perguntasDoSetor(setor: SetorVisita): VisitaPergunta[] {
  return estado.perguntas.filter((p) => p.setor === setor).sort((a, b) => a.ordem - b.ordem);
}

export function temPerguntasGuardadas(): boolean {
  return estado.perguntas.length > 0;
}

// --- leitura das visitas locais ---------------------------------------------

export function visitaLocal(id: string): VisitaLocal | null {
  return estado.visitas[id] ?? null;
}

export function visitaEmAndamentoLocal(setor: SetorVisita, unidade: string): VisitaLocal | null {
  const lista = Object.values(estado.visitas)
    .filter((v) => v.setor === setor && v.unidade === unidade && v.status === 'em_andamento')
    .sort((a, b) => (a.iniciadaEm < b.iniciadaEm ? 1 : -1));
  return lista[0] ?? null;
}

// Finalizadas no celular que ainda não chegaram na nuvem.
export function finalizadasPendentes(unidade?: string): VisitaLocal[] {
  return Object.values(estado.visitas)
    .filter((v) => v.status === 'finalizada' && !v.resultadoNuvem && (!unidade || v.unidade === unidade))
    .sort((a, b) => ((a.finalizadaEm ?? '') < (b.finalizadaEm ?? '') ? 1 : -1));
}

function visitaTemPendencia(v: VisitaLocal): boolean {
  if (v.cabecalhoPendente) return true;
  if (Object.values(v.respostas).some((r) => r.pendente)) return true;
  return v.status === 'finalizada' && !v.resultadoNuvem;
}

// Quantas visitas ainda têm algo pra enviar (mostra no aviso da tela).
export function contarPendentes(): number {
  return Object.values(estado.visitas).filter(visitaTemPendencia).length;
}

export function ultimoErroSincronizacao(): string | null {
  const comErro = Object.values(estado.visitas).find((v) => v.ultimoErro && visitaTemPendencia(v));
  return comErro?.ultimoErro ?? null;
}

// --- gravação local ----------------------------------------------------------

export function criarVisitaLocal(dados: {
  setor: SetorVisita;
  unidade: string;
  veterinarioNome: string;
  veterinarioMatricula: string | null;
  localizacao: { lat: number; lng: number; endereco: string | null } | null;
}): VisitaLocal {
  const v: VisitaLocal = {
    id: gerarId(),
    setor: dados.setor,
    unidade: dados.unidade,
    veterinarioNome: dados.veterinarioNome,
    veterinarioMatricula: dados.veterinarioMatricula,
    iniciadaEm: new Date().toISOString(),
    status: 'em_andamento',
    finalizadaEm: null,
    passos: null,
    localizacaoLat: dados.localizacao?.lat ?? null,
    localizacaoLng: dados.localizacao?.lng ?? null,
    localizacaoEndereco: dados.localizacao?.endereco ?? null,
    consideracoes: '',
    respostas: {},
    cabecalhoPendente: true,
    resultadoLocal: null,
    resultadoNuvem: null,
    ultimoErro: null,
  };
  estado.visitas[v.id] = v;
  persistir();
  return v;
}

// Traz pro celular uma visita em andamento que só existe na nuvem (ex.:
// começada em outro aparelho), com as respostas já dadas.
export async function importarVisitaRemota(setor: SetorVisita, unidade: string): Promise<VisitaLocal | null> {
  const remota = await buscarVisitaEmAndamentoRemota(setor, unidade);
  if (!remota) return null;
  if (estado.visitas[remota.id]) return estado.visitas[remota.id];
  const respostas = await buscarRespostasDaVisita(remota.id);
  const v: VisitaLocal = {
    id: remota.id,
    setor: remota.setor,
    unidade,
    veterinarioNome: remota.veterinarioNome,
    veterinarioMatricula: remota.veterinarioMatricula,
    iniciadaEm: remota.iniciadaEm,
    status: 'em_andamento',
    finalizadaEm: null,
    passos: remota.passosContados,
    localizacaoLat: remota.localizacaoLat,
    localizacaoLng: remota.localizacaoLng,
    localizacaoEndereco: remota.localizacaoEndereco,
    consideracoes: remota.consideracoesFinais ?? '',
    respostas: {},
    cabecalhoPendente: false,
    resultadoLocal: null,
    resultadoNuvem: null,
    ultimoErro: null,
  };
  respostas.forEach((r) => {
    if (!r.perguntaId) return;
    v.respostas[r.perguntaId] = {
      perguntaId: r.perguntaId,
      perguntaTexto: r.perguntaTexto,
      critico: r.critico,
      resposta: r.resposta,
      justificativa: r.justificativa,
      fotos: r.fotosUrls.map((url) => ({ id: gerarId(), local: null, url })),
      respondidaEm: r.respondidaEm,
      pendente: false,
    };
  });
  estado.visitas[v.id] = v;
  persistir();
  return v;
}

function mudarResposta(visitaId: string, pergunta: VisitaPergunta, mudar: (r: RespostaLocal | null) => RespostaLocal) {
  const v = estado.visitas[visitaId];
  if (!v) return;
  const nova = mudar(v.respostas[pergunta.id] ?? null);
  v.respostas = { ...v.respostas, [pergunta.id]: { ...nova, pendente: true, respondidaEm: new Date().toISOString() } };
  estado.visitas[visitaId] = { ...v };
  persistir();
}

export function responderLocal(visitaId: string, pergunta: VisitaPergunta, valor: RespostaVisita) {
  mudarResposta(visitaId, pergunta, (atual) => ({
    perguntaId: pergunta.id,
    perguntaTexto: pergunta.texto,
    critico: pergunta.critico,
    resposta: valor,
    // N/A não guarda foto nem observação; Sim mantém a foto (evidência).
    justificativa: valor === 'nao' ? atual?.justificativa ?? null : null,
    fotos: valor === 'na' ? [] : atual?.fotos ?? [],
    respondidaEm: '',
    pendente: true,
  }));
}

export function justificarLocal(visitaId: string, pergunta: VisitaPergunta, texto: string) {
  const atual = estado.visitas[visitaId]?.respostas[pergunta.id];
  if (!atual || atual.resposta !== 'nao') return;
  if ((atual.justificativa ?? '') === texto) return;
  mudarResposta(visitaId, pergunta, (r) => ({ ...(r as RespostaLocal), justificativa: texto || null }));
}

// Adiciona uma foto à resposta (até MAX_FOTOS). Copia pra uma pasta do app
// (o cache da câmera pode ser limpo pelo Android antes de dar tempo de enviar).
export async function adicionarFotoLocal(visitaId: string, pergunta: VisitaPergunta, uriTemporaria: string) {
  const atual = estado.visitas[visitaId]?.respostas[pergunta.id];
  if (!atual || atual.resposta === 'na' || atual.fotos.length >= MAX_FOTOS) return;
  let uri = uriTemporaria;
  if (!rodandoNaWeb) {
    try {
      const FileSystem = await import('expo-file-system/legacy');
      const pasta = `${FileSystem.documentDirectory}visita-fotos/`;
      await FileSystem.makeDirectoryAsync(pasta, { intermediates: true }).catch(() => {});
      const destino = `${pasta}${gerarId()}.jpg`;
      await FileSystem.copyAsync({ from: uriTemporaria, to: destino });
      uri = destino;
    } catch {
      // se não der pra copiar, usa a original mesmo
    }
  }
  mudarResposta(visitaId, pergunta, (r) => ({
    ...(r as RespostaLocal),
    fotos: [...(r as RespostaLocal).fotos, { id: gerarId(), local: uri, url: null }],
  }));
}

export function removerFotoLocal(visitaId: string, pergunta: VisitaPergunta, fotoId: string) {
  const atual = estado.visitas[visitaId]?.respostas[pergunta.id];
  const foto = atual?.fotos.find((f) => f.id === fotoId);
  if (!atual || !foto) return;
  mudarResposta(visitaId, pergunta, (r) => ({ ...(r as RespostaLocal), fotos: (r as RespostaLocal).fotos.filter((f) => f.id !== fotoId) }));
  if (foto.local) apagarArquivo(foto.local);
}

export function consideracoesLocal(visitaId: string, texto: string) {
  const v = estado.visitas[visitaId];
  if (!v || v.consideracoes === texto) return;
  estado.visitas[visitaId] = { ...v, consideracoes: texto, cabecalhoPendente: true };
  persistir();
}

export function passosLocal(visitaId: string, passos: number | null) {
  const v = estado.visitas[visitaId];
  if (!v || passos == null) return;
  // Sem persistir a cada passo (seria gravação demais) — vai junto na
  // próxima gravação normal e no finalizar.
  v.passos = passos;
}

export async function finalizarLocal(visitaId: string, perguntas: VisitaPergunta[]) {
  const v = estado.visitas[visitaId];
  if (!v) return;
  const respostas = perguntas.map((p) => v.respostas[p.id]).filter(Boolean) as RespostaLocal[];
  const validas = respostas.filter((r) => r.resposta !== 'na');
  const sim = validas.filter((r) => r.resposta === 'sim').length;
  const nao = respostas.filter((r) => r.resposta === 'nao');
  estado.visitas[visitaId] = {
    ...v,
    status: 'finalizada',
    finalizadaEm: new Date().toISOString(),
    cabecalhoPendente: true,
    resultadoLocal: {
      aproveitamento: validas.length ? Math.round((sim / validas.length) * 1000) / 10 : 0,
      naoConformidades: nao.length,
      criticos: nao.filter((r) => r.critico).length,
      naoAvaliadas: perguntas.length - respostas.length,
    },
  };
  avisar();
  await persistirAgora();
}

// Descarta uma visita em andamento que ainda não tem nenhuma resposta (ex.:
// abriu o setor errado) — não precisa ir pra nuvem.
export function descartarSeVazia(visitaId: string) {
  const v = estado.visitas[visitaId];
  if (v && v.status === 'em_andamento' && Object.keys(v.respostas).length === 0 && v.cabecalhoPendente && !v.consideracoes) {
    delete estado.visitas[visitaId];
    persistir();
  }
}

// --- sincronização -----------------------------------------------------------

// Depois de cada resposta, tenta enviar em alguns segundos (agrupando várias
// respostas seguidas num envio só). Sem internet, só falha em silêncio e
// fica pra próxima tentativa.
let envioAgendado: ReturnType<typeof setTimeout> | null = null;
export function sincronizarEmBreve() {
  if (envioAgendado) clearTimeout(envioAgendado);
  envioAgendado = setTimeout(() => {
    sincronizar().catch(() => {});
  }, 4000);
}

let sincronizando: Promise<{ ok: boolean; pendentes: number }> | null = null;

export function sincronizar(): Promise<{ ok: boolean; pendentes: number }> {
  if (!sincronizando) {
    sincronizando = (async () => {
      await carregarOffline();
      let ok = true;
      const ids = Object.keys(estado.visitas);
      for (const id of ids) {
        const v = estado.visitas[id];
        if (!v || !visitaTemPendencia(v)) continue;
        try {
          await sincronizarVisita(id);
          estado.visitas[id] = { ...estado.visitas[id], ultimoErro: null };
        } catch (e: any) {
          ok = false;
          if (estado.visitas[id]) estado.visitas[id] = { ...estado.visitas[id], ultimoErro: e?.message ?? 'Falha ao enviar' };
        }
        persistir();
      }
      limparAntigas();
      await persistirAgora();
      avisar();
      return { ok, pendentes: contarPendentes() };
    })().finally(() => {
      sincronizando = null;
    });
  }
  return sincronizando;
}

async function sincronizarVisita(id: string) {
  let v = estado.visitas[id];

  // 1) Já foi finalizada na nuvem (ex.: o app fechou logo depois)? Então
  //    não regrava nada — só busca o resultado oficial.
  const statusNuvem = await statusRemotoDaVisita(id);
  if (statusNuvem === 'finalizada') {
    const oficial = await buscarVisitaPorId(id);
    const respostas: Record<string, RespostaLocal> = {};
    Object.values(v.respostas).forEach((r) => (respostas[r.perguntaId] = { ...r, pendente: false }));
    estado.visitas[id] = { ...v, respostas, cabecalhoPendente: false, resultadoNuvem: oficial };
    return;
  }

  // 2) Cabeçalho (cria a visita na nuvem com o mesmo id do celular).
  if (v.cabecalhoPendente || statusNuvem === null) {
    await gravarCabecalhoVisita({
      id: v.id,
      setor: v.setor,
      unidade: v.unidade,
      veterinarioNome: v.veterinarioNome,
      veterinarioMatricula: v.veterinarioMatricula,
      iniciadaEm: v.iniciadaEm,
      localizacaoLat: v.localizacaoLat,
      localizacaoLng: v.localizacaoLng,
      localizacaoEndereco: v.localizacaoEndereco,
      consideracoesFinais: v.consideracoes || null,
    });
    v = estado.visitas[id];
    estado.visitas[id] = { ...v, cabecalhoPendente: false };
    persistir();
  }

  // 3) Respostas: primeiro sobe as fotos que estão só no celular (uma a
  //    uma, guardando a url de cada), depois grava a resposta com a lista.
  for (const pid of Object.keys(estado.visitas[id].respostas)) {
    const r = estado.visitas[id].respostas[pid];
    if (!r.pendente) continue;
    for (const f of r.fotos) {
      if (!f.local || f.url) continue;
      const url = await enviarFotoVisita(f.local);
      const atual = estado.visitas[id].respostas[pid];
      if (!atual) break;
      atual.fotos = atual.fotos.map((x) => (x.id === f.id ? { ...x, url, local: null } : x));
      estado.visitas[id] = { ...estado.visitas[id] };
      persistir();
      apagarArquivo(f.local);
    }
    const agora = estado.visitas[id].respostas[pid];
    if (!agora || agora.fotos.some((f) => !f.url)) continue; // foto nova no meio — próxima rodada
    await gravarRespostaVisita({
      visitaId: id,
      perguntaId: agora.perguntaId,
      perguntaTexto: agora.perguntaTexto,
      critico: agora.critico,
      resposta: agora.resposta,
      justificativa: agora.justificativa,
      fotosUrls: agora.fotos.map((f) => f.url as string),
      respondidaEm: agora.respondidaEm,
    });
    const depois = estado.visitas[id].respostas[pid];
    // Se a pessoa mudou a resposta enquanto enviava, continua pendente.
    if (depois && depois.respondidaEm === agora.respondidaEm) {
      estado.visitas[id].respostas = { ...estado.visitas[id].respostas, [pid]: { ...depois, pendente: false } };
      estado.visitas[id] = { ...estado.visitas[id] };
      persistir();
    }
  }

  // 4) Finalização (uma vez só — o passo 1 garante isso nas próximas).
  v = estado.visitas[id];
  if (v.status === 'finalizada' && !v.resultadoNuvem) {
    if (Object.values(v.respostas).some((r) => r.pendente)) return; // tenta de novo depois
    const ordem = perguntasDoSetor(v.setor).map((p) => p.id);
    const oficial = await finalizarVisita({
      visitaId: id,
      setor: v.setor,
      unidade: v.unidade,
      veterinarioNome: v.veterinarioNome,
      passosContados: v.passos,
      finalizadaEm: v.finalizadaEm ?? undefined,
      consideracoesFinais: v.consideracoes || null,
      perguntasNaoAvaliadas: v.resultadoLocal?.naoAvaliadas ?? 0,
      ordemPerguntas: ordem,
    });
    estado.visitas[id] = { ...estado.visitas[id], resultadoNuvem: oficial };
  }
}

function apagarArquivo(uri: string) {
  if (rodandoNaWeb || !uri.startsWith('file:')) return;
  import('expo-file-system/legacy')
    .then((FileSystem) => FileSystem.deleteAsync(uri, { idempotent: true }))
    .catch(() => {});
}

// Visitas finalizadas e já enviadas ficam no celular por 3 dias (pra
// aparecerem na lista mesmo sem internet) e depois são apagadas daqui — a
// cópia oficial está na nuvem.
function limparAntigas() {
  const limite = Date.now() - 3 * 86400000;
  Object.values(estado.visitas).forEach((v) => {
    if (v.resultadoNuvem && v.finalizadaEm && new Date(v.finalizadaEm).getTime() < limite) {
      delete estado.visitas[v.id];
    }
  });
}
