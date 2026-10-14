import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// ULVA 2.0 (ferramentas agrupadas em Rotina / Comercial / Resultados / Estoque).
// Enquanto não for liberado, só quem está nesta lista vê a versão nova.
// A liberação para todos é a chave 'ulva2_liberado' na tabela system_config
// (o próprio Lucas liga pelo app — botão "Liberar ULVA 2.0 para todos").
export const MATRICULAS_TESTE_ULVA2 = ['7990353'];

const CHAVE = 'ulva2_liberado';
const CACHE_LIBERADO = 'ulva2:liberado';
const CACHE_PREFERENCIA = 'ulva2:usarVersaoAntiga';

export function podeTestarUlva2(matricula: string | null | undefined): boolean {
  return MATRICULAS_TESTE_ULVA2.includes(String(matricula ?? ''));
}

export async function ulva2LiberadoEmCache(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CACHE_LIBERADO)) === 'true';
  } catch {
    return false;
  }
}

export async function buscarUlva2Liberado(): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('system_config').select('value').eq('key', CHAVE).maybeSingle();
    if (error) throw error;
    const liberado = String(data?.value ?? 'false') === 'true';
    AsyncStorage.setItem(CACHE_LIBERADO, liberado ? 'true' : 'false').catch(() => {});
    return liberado;
  } catch {
    return ulva2LiberadoEmCache();
  }
}

export async function definirUlva2Liberado(liberado: boolean): Promise<void> {
  const { error } = await supabase
    .from('system_config')
    .upsert({ key: CHAVE, value: liberado ? 'true' : 'false', updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
  await AsyncStorage.setItem(CACHE_LIBERADO, liberado ? 'true' : 'false').catch(() => {});
}

// Só para quem está testando: alternar entre a versão nova e a antiga.
export async function usarVersaoAntiga(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CACHE_PREFERENCIA)) === 'true';
  } catch {
    return false;
  }
}

export async function definirUsarVersaoAntiga(v: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFERENCIA, v ? 'true' : 'false');
  } catch {}
}
