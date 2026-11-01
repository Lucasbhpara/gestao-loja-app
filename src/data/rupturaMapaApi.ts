import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AreaMapa, buscarAreasMapa } from './mapaLojaApi';

// =============================================================================
// Ruptura + Mapa da Loja.
//  • ruptura_grupo_area: em que área do mapa fica cada grupo (subsetor). É
//    perguntado na primeira coleta do grupo e vale como local padrão de
//    todos os produtos dele.
//  • produto_localizacao: onde cada produto foi bipado de verdade (a coleta
//    guarda a área marcada como "Estou em"). Vence o local do grupo.
//  • ruptura_produto_grupo: produto que estava no grupo errado e foi movido
//    para outro (ruptura_universo e ruptura_prioridade já respeitam).
// Tabelas: supabase/ruptura_mapa.sql.
// =============================================================================

const CHAVE_AREAS = 'ruptura:mapaAreas';
const CHAVE_GRUPO_AREA = 'ruptura:grupoArea';

// Áreas do mapa, com cópia no celular para a coleta funcionar sem internet.
export async function buscarAreasComCache(): Promise<AreaMapa[]> {
  try {
    const areas = await buscarAreasMapa();
    await AsyncStorage.setItem(CHAVE_AREAS, JSON.stringify(areas));
    return areas;
  } catch (e) {
    const s = await AsyncStorage.getItem(CHAVE_AREAS);
    if (s) return JSON.parse(s);
    throw e;
  }
}

// grupo_id → mapa_area_id
export async function buscarAreasDosGrupos(): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabase.from('ruptura_grupo_area').select('grupo_id, mapa_area_id');
    if (error) throw error;
    const m: Record<string, string> = {};
    (data ?? []).forEach((l: any) => { m[l.grupo_id] = l.mapa_area_id; });
    await AsyncStorage.setItem(CHAVE_GRUPO_AREA, JSON.stringify(m));
    return m;
  } catch (e) {
    const s = await AsyncStorage.getItem(CHAVE_GRUPO_AREA);
    return s ? JSON.parse(s) : {};
  }
}

export async function salvarAreaDoGrupo(grupoId: string, areaId: string, por: string): Promise<void> {
  const s = await AsyncStorage.getItem(CHAVE_GRUPO_AREA);
  const m = s ? JSON.parse(s) : {};
  m[grupoId] = areaId;
  await AsyncStorage.setItem(CHAVE_GRUPO_AREA, JSON.stringify(m));
  const { error } = await supabase.from('ruptura_grupo_area').upsert({ grupo_id: grupoId, mapa_area_id: areaId, definido_por: por, atualizado_em: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// Grava onde cada produto bipado estava (chamado ao enviar a coleta).
export async function salvarLocalizacoesDaColeta(
  itens: { codigoInterno: string; produto: string | null; areaId: string }[],
  grupoId: string,
  por: string,
): Promise<void> {
  const agora = new Date().toISOString();
  const vistos = new Map<string, any>();
  for (const it of itens) {
    vistos.set(it.codigoInterno, {
      codigo_interno: it.codigoInterno, mapa_area_id: it.areaId, produto: it.produto, grupo_id: grupoId,
      fonte: 'coleta', atualizado_por: por, atualizado_em: agora,
    });
  }
  const linhas = [...vistos.values()];
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from('produto_localizacao').upsert(linhas.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
}

export async function salvarLocalManual(codigoInterno: string, produto: string, areaId: string, grupoId: string | null, por: string): Promise<void> {
  const { error } = await supabase.from('produto_localizacao').upsert({
    codigo_interno: codigoInterno, mapa_area_id: areaId, produto, grupo_id: grupoId,
    fonte: 'manual', atualizado_por: por, atualizado_em: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

// codigo_interno → mapa_area_id (só dos produtos pedidos)
export async function buscarLocalizacoes(codigos: string[]): Promise<Record<string, string>> {
  const m: Record<string, string> = {};
  const unicos = [...new Set(codigos)];
  for (let i = 0; i < unicos.length; i += 300) {
    const { data, error } = await supabase.from('produto_localizacao').select('codigo_interno, mapa_area_id').in('codigo_interno', unicos.slice(i, i + 300));
    if (error) throw error;
    (data ?? []).forEach((l: any) => { m[l.codigo_interno] = l.mapa_area_id; });
  }
  return m;
}

export async function moverProdutoDeGrupo(codigoInterno: string, produto: string, grupoDestino: string, grupoAnterior: string, por: string): Promise<void> {
  const { error } = await supabase.from('ruptura_produto_grupo').upsert({
    codigo_interno: codigoInterno, grupo_id: grupoDestino, grupo_anterior: grupoAnterior, produto,
    movido_por: por, movido_em: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- rota ----
// Entrada da loja na planta (portas embaixo, perto do meio), em % da imagem.
export const ENTRADA = { x: 43, y: 97 };

export function centroArea(a: AreaMapa): { x: number; y: number } {
  return { x: a.posX + a.posW / 2, y: a.posY + a.posH / 2 };
}

// Distância andando pela loja (sem atravessar gôndola): soma do horizontal e
// do vertical, com o vertical pesando um pouco mais (troca de corredor).
function distancia(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + 1.15 * Math.abs(a.y - b.y);
}

// Ordem de visita das áreas saindo da entrada: vizinho mais próximo e depois
// melhora com 2-opt (desfaz cruzamentos). Para até ~40 áreas é instantâneo.
export function ordenarRota(areas: AreaMapa[]): AreaMapa[] {
  if (areas.length <= 2) {
    return [...areas].sort((p, q) => distancia(ENTRADA, centroArea(p)) - distancia(ENTRADA, centroArea(q)));
  }
  const pts = areas.map(centroArea);
  const resto = areas.map((_, i) => i);
  const ordem: number[] = [];
  let atual = ENTRADA;
  while (resto.length) {
    let melhor = 0;
    for (let i = 1; i < resto.length; i++) if (distancia(atual, pts[resto[i]]) < distancia(atual, pts[resto[melhor]])) melhor = i;
    const k = resto.splice(melhor, 1)[0];
    ordem.push(k);
    atual = pts[k];
  }
  const ponto = (i: number) => (i < 0 ? ENTRADA : pts[ordem[i]]);
  let melhorou = true;
  for (let volta = 0; melhorou && volta < 50; volta++) {
    melhorou = false;
    for (let i = 0; i < ordem.length - 1; i++) {
      for (let j = i + 1; j < ordem.length; j++) {
        const antes = distancia(ponto(i - 1), ponto(i)) + (j + 1 < ordem.length ? distancia(ponto(j), ponto(j + 1)) : 0);
        const depois = distancia(ponto(i - 1), ponto(j)) + (j + 1 < ordem.length ? distancia(ponto(i), ponto(j + 1)) : 0);
        if (depois + 0.01 < antes) {
          ordem.splice(i, j - i + 1, ...ordem.slice(i, j + 1).reverse());
          melhorou = true;
        }
      }
    }
  }
  return ordem.map((i) => areas[i]);
}
