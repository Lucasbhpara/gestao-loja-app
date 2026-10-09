import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// =============================================================================
// Validade dos documentos da loja (Visita Técnica → Geral e Documentos).
//
// Uma data de vencimento por documento por unidade (tabela
// documentos_validade). O banco manda push pro veterinário quando faltar 60,
// 30 e 15 dias e no dia do vencimento (ver
// supabase/schema_documentos_validade.sql).
//
// Funciona sem internet: a data fica salva no celular e sobe quando der
// (mesma ideia da visita offline).
// =============================================================================

export const DOCUMENTOS_VALIDADE = [
  'Alvará Sanitário',
  'Alvará de Localização',
  'Certificado IEF',
  'Declaração de Pescados',
  'Relatório de Limpeza da Caixa d’Água',
  'Manual de Boas Práticas / POP / Lista de Presença',
  'Controle de Pragas',
  'AVCB',
  'Ficha Técnica de Produtos Químicos',
  'Limpeza de Bebedouro e Caixas de Gordura',
  'ART / CREA-MG e Inmetro',
  'Croqui',
] as const;

export interface ValidadeDocumento {
  documento: string;
  dataValidade: string; // yyyy-mm-dd
  atualizadoPor: string | null;
  atualizadoEm: string | null;
  pendente?: boolean; // salvo só no celular, ainda não subiu
}

const chaveCache = (unidade: string) => `docs_validade_${unidade}`;
const CHAVE_FILA = 'docs_validade_fila_v1';

interface ItemFila {
  unidade: string;
  documento: string;
  dataValidade: string;
  por: string;
}

async function lerJson<T>(chave: string, padrao: T): Promise<T> {
  try {
    const bruto = await AsyncStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}
async function gravarJson(chave: string, valor: unknown) {
  try {
    await AsyncStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // sem armazenamento: segue só na memória
  }
}

// Sobe o que ficou salvo só no celular. Devolve quantos ainda faltam.
export async function sincronizarValidades(): Promise<number> {
  const fila = await lerJson<ItemFila[]>(CHAVE_FILA, []);
  if (!fila.length) return 0;
  const restantes: ItemFila[] = [];
  for (const item of fila) {
    const { error } = await supabase.from('documentos_validade').upsert(
      {
        unidade: item.unidade,
        documento: item.documento,
        data_validade: item.dataValidade,
        atualizado_por: item.por,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'unidade,documento' }
    );
    if (error) restantes.push(item);
  }
  await gravarJson(CHAVE_FILA, restantes);
  return restantes.length;
}

// Datas da unidade: tenta a nuvem; sem internet (ou tabela ainda não criada)
// usa o que está guardado no celular. As pendentes da fila sempre ganham.
export async function buscarValidades(unidade: string): Promise<{ lista: Map<string, ValidadeDocumento>; offline: boolean }> {
  await sincronizarValidades().catch(() => {});
  const cache = await lerJson<ValidadeDocumento[]>(chaveCache(unidade), []);
  let lista = cache;
  let offline = false;
  try {
    const { data, error } = await supabase
      .from('documentos_validade')
      .select('documento,data_validade,atualizado_por,atualizado_em')
      .eq('unidade', unidade);
    if (error) throw error;
    lista = (data ?? []).map((d: any) => ({
      documento: d.documento,
      dataValidade: d.data_validade,
      atualizadoPor: d.atualizado_por ?? null,
      atualizadoEm: d.atualizado_em ?? null,
    }));
    await gravarJson(chaveCache(unidade), lista);
  } catch {
    offline = true;
  }
  const mapa = new Map(lista.map((v) => [v.documento, v]));
  const fila = await lerJson<ItemFila[]>(CHAVE_FILA, []);
  fila
    .filter((f) => f.unidade === unidade)
    .forEach((f) =>
      mapa.set(f.documento, { documento: f.documento, dataValidade: f.dataValidade, atualizadoPor: f.por, atualizadoEm: null, pendente: true })
    );
  return { lista: mapa, offline };
}

export async function salvarValidade(unidade: string, documento: string, dataValidade: string, por: string): Promise<void> {
  const fila = (await lerJson<ItemFila[]>(CHAVE_FILA, [])).filter((f) => !(f.unidade === unidade && f.documento === documento));
  fila.push({ unidade, documento, dataValidade, por });
  await gravarJson(CHAVE_FILA, fila);
  const cache = (await lerJson<ValidadeDocumento[]>(chaveCache(unidade), [])).filter((v) => v.documento !== documento);
  cache.push({ documento, dataValidade, atualizadoPor: por, atualizadoEm: new Date().toISOString() });
  await gravarJson(chaveCache(unidade), cache);
  await sincronizarValidades().catch(() => {});
}

// --- Situação ------------------------------------------------------------------

export function diasParaVencer(dataValidade: string): number {
  const [a, m, d] = dataValidade.split('-').map(Number);
  const venc = new Date(a, m - 1, d).getTime();
  const h = new Date();
  const hoje = new Date(h.getFullYear(), h.getMonth(), h.getDate()).getTime();
  return Math.round((venc - hoje) / 86_400_000);
}

export type SituacaoDoc = 'sem_data' | 'vencido' | 'critico' | 'atencao' | 'ok';

export function situacaoDoc(v: ValidadeDocumento | undefined): SituacaoDoc {
  if (!v) return 'sem_data';
  const dias = diasParaVencer(v.dataValidade);
  if (dias < 0) return 'vencido';
  if (dias <= 15) return 'critico';
  if (dias <= 60) return 'atencao';
  return 'ok';
}

export function textoSituacao(v: ValidadeDocumento | undefined): string {
  if (!v) return 'Sem data';
  const dias = diasParaVencer(v.dataValidade);
  if (dias < 0) return `Vencido há ${-dias} dia${dias === -1 ? '' : 's'}`;
  if (dias === 0) return 'Vence hoje';
  if (dias === 1) return 'Vence amanhã';
  return `Vence em ${dias} dias`;
}

export const CORES_SITUACAO: Record<SituacaoDoc, { cor: string; fundo: string }> = {
  sem_data: { cor: '#5B6280', fundo: '#E7E9F2' },
  vencido: { cor: '#C5392F', fundo: '#FBE4E2' },
  critico: { cor: '#C5392F', fundo: '#FBE4E2' },
  atencao: { cor: '#B4650E', fundo: '#FBEBD4' },
  ok: { cor: '#2C8F5E', fundo: '#DCF2E7' },
};
