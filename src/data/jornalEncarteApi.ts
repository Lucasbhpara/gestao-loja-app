import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { JornalOferta } from './jornalOfertasApi';
import { CampanhaJornal, SituacaoJornal } from './jornalEstoqueApi';
import { ItemLido } from './jornalLeituraPdf';

// =============================================================================
// Conferência no encarte: o PDF do Jornal de Ofertas aparece do jeito que é,
// e ao tocar num produto abre a gaveta para dizer quais produtos da loja são
// ele (várias fragrâncias/sabores de uma vez). Tudo fica gravado nos itens da
// campanha do jornal (jornal_itens + jornal_item_produtos), então vale para o
// período inteiro e alimenta o Estoque do Jornal.
// Colunas novas: jornal_itens.pagina/pos_x/pos_y e jornal_campanhas.jornal_oferta_id
// (supabase/jornal_encarte.sql).
// =============================================================================

export type StatusConferencia = 'ok' | 'ruptura' | 'falta_explosivo';

export interface ItemEncarte {
  id: string;
  codigo: string | null;
  confStatus: StatusConferencia | null;
  confPor: string | null;
  confEm: string | null;
  ordem: number;
  descricao: string;
  preco: number | null;
  pagina: number | null;
  posX: number | null;
  posY: number | null;
  produtos: number;
  estoque: number;
  situacao: SituacaoJornal;
}

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// "Ofertas - Varejo MG 1ª quinzena de Novembro.pdf" → 01/11 a 15/11
export function periodoDoNome(nome: string | null, enviadoEm: string): { inicio: string; fim: string; titulo: string } {
  const base = (nome ?? 'Jornal de Ofertas').replace(/\.pdf$/i, '').replace(/\(\d+\)/g, '').replace(/^ofertas\s*-\s*/i, '').replace(/\s+-\s+loja$/i, '').trim();
  const env = new Date(enviadoEm);
  const m = semAcento(base.toLowerCase()).match(/([12])\s*[ªaº°o]?\s*quinzena\s*de\s*([a-z]+)/);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (m) {
    const mes = MESES.indexOf(m[2]);
    if (mes >= 0) {
      let ano = env.getFullYear();
      if (mes < env.getMonth() - 6) ano++; // jornal de janeiro enviado em dezembro
      const ini = new Date(ano, mes, m[1] === '1' ? 1 : 16);
      const fim = m[1] === '1' ? new Date(ano, mes, 15) : new Date(ano, mes + 1, 0);
      return { inicio: iso(ini), fim: iso(fim), titulo: base };
    }
  }
  const fim = new Date(env.getTime() + 14 * 86400000);
  return { inicio: iso(env), fim: iso(fim), titulo: base };
}

// Campanha (período) do PDF: já ligada, ou a do mesmo período (importada pela
// planilha no portal), ou cria uma nova.
export async function campanhaDoJornal(j: JornalOferta, por: string): Promise<CampanhaJornal> {
  const sel = 'id, titulo, inicio, fim';
  const ligada = await supabase.from('jornal_campanhas').select(sel).eq('jornal_oferta_id', j.id).limit(1);
  if (ligada.error) throw new Error(ligada.error.message);
  if (ligada.data?.length) return ligada.data[0] as CampanhaJornal;
  const p = periodoDoNome(j.nomeArquivo, j.enviadoEm);
  const mesma = await supabase.from('jornal_campanhas').select(sel).eq('inicio', p.inicio).eq('tipo', 'folheto').is('jornal_oferta_id', null).limit(1);
  if (mesma.data?.length) {
    await supabase.from('jornal_campanhas').update({ jornal_oferta_id: j.id }).eq('id', mesma.data[0].id);
    return mesma.data[0] as CampanhaJornal;
  }
  const nova = await supabase
    .from('jornal_campanhas')
    .insert({ titulo: p.titulo, inicio: p.inicio, fim: p.fim, arquivo_nome: j.nomeArquivo, criado_por: por, jornal_oferta_id: j.id })
    .select(sel)
    .single();
  if (nova.error) throw new Error(nova.error.message);
  return nova.data as CampanhaJornal;
}

export async function listarItensEncarte(campanhaId: string): Promise<ItemEncarte[]> {
  const [itens, status] = await Promise.all([
    supabase.from('jornal_itens').select('id, ordem, descricao, preco, pagina, pos_x, pos_y, codigo, conf_status, conf_por, conf_em').eq('campanha_id', campanhaId).order('ordem'),
    supabase.from('jornal_itens_status').select('id, produtos, estoque, situacao').eq('campanha_id', campanhaId),
  ]);
  if (itens.error) throw new Error(itens.error.message);
  const st = new Map((status.data ?? []).map((s: any) => [s.id, s]));
  return (itens.data ?? []).map((l: any) => {
    const s: any = st.get(l.id) ?? {};
    return {
      id: l.id, codigo: l.codigo ?? null, confStatus: l.conf_status ?? null, confPor: l.conf_por ?? null, confEm: l.conf_em ?? null,
      ordem: l.ordem, descricao: l.descricao, preco: l.preco == null ? null : Number(l.preco),
      pagina: l.pagina, posX: l.pos_x == null ? null : Number(l.pos_x), posY: l.pos_y == null ? null : Number(l.pos_y),
      produtos: Number(s.produtos ?? 0), estoque: Number(s.estoque ?? 0), situacao: (s.situacao ?? 'sem_produto') as SituacaoJornal,
    };
  });
}

export async function criarItemEncarte(
  campanhaId: string,
  d: { descricao: string; preco: number | null; pagina: number; x: number; y: number },
): Promise<string> {
  const { data: ult } = await supabase.from('jornal_itens').select('ordem').eq('campanha_id', campanhaId).order('ordem', { ascending: false }).limit(1);
  const ordem = (ult?.[0]?.ordem ?? 0) + 1;
  const { data, error } = await supabase
    .from('jornal_itens')
    .insert({ campanha_id: campanhaId, ordem, descricao: d.descricao, preco: d.preco, pagina: d.pagina, pos_x: d.x, pos_y: d.y })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function atualizarItemEncarte(
  itemId: string,
  d: { descricao?: string; preco?: number | null; pagina?: number | null; x?: number | null; y?: number | null },
): Promise<void> {
  const linha: any = {};
  if (d.descricao !== undefined) linha.descricao = d.descricao;
  if (d.preco !== undefined) linha.preco = d.preco;
  if (d.pagina !== undefined) linha.pagina = d.pagina;
  if (d.x !== undefined) linha.pos_x = d.x;
  if (d.y !== undefined) linha.pos_y = d.y;
  const { error } = await supabase.from('jornal_itens').update(linha).eq('id', itemId);
  if (error) throw new Error(error.message);
}

export async function ligarVarios(itemId: string, produtos: { codigo: string | null; produto: string }[], por: string): Promise<void> {
  if (!produtos.length) return;
  const linhas = produtos.map((p) => ({ item_id: itemId, codigo: p.codigo, produto: p.produto, origem: 'manual', criado_por: por }));
  const { error } = await supabase.from('jornal_item_produtos').upsert(linhas, { onConflict: 'item_id,produto' });
  if (error) throw new Error(error.message);
}

// Itens do jornal parecidos com o texto tocado no encarte (para reaproveitar
// o que veio da planilha em vez de criar outro).
export function itensParecidos(texto: string, itens: ItemEncarte[], limite = 4): ItemEncarte[] {
  const pal = (s: string) => new Set(semAcento(s.toUpperCase()).split(/[^A-Z0-9]+/).filter((w) => w.length >= 3));
  const alvo = pal(texto);
  if (!alvo.size) return [];
  return itens
    .map((i) => {
      const p = pal(i.descricao);
      let n = 0;
      p.forEach((w) => { if (alvo.has(w)) n++; });
      return { i, n: n / Math.max(1, Math.min(p.size, alvo.size)) };
    })
    .filter((x) => x.n >= 0.34)
    .sort((a, b) => b.n - a.n)
    .slice(0, limite)
    .map((x) => x.i);
}

// ------------------------------------------------- conferência em lista ----
const normal = (s: string) => semAcento(s.toUpperCase()).replace(/[^A-Z0-9]+/g, ' ').trim();

// Junta o que foi lido do PDF com os itens da campanha:
//  • item que já existe (mesmo código, ou mesma página e posição) → corrige o
//    nome se o novo for mais completo (célula cortada na virada da página) e
//    completa o código se faltava;
//  • item novo → cria;
//  • em ambos, liga o produto do código impresso.
// Sempre lê os itens do banco na hora (não confia na lista da tela) para não
// duplicar se duas leituras rodarem juntas.
export async function criarItensLidos(campanhaId: string, lidos: ItemLido[], _existentes: ItemEncarte[], por: string): Promise<{ novos: number; corrigidos: number }> {
  const { data: atual, error: e0 } = await supabase.from('jornal_itens').select('id, ordem, descricao, codigo, pagina, pos_x, pos_y').eq('campanha_id', campanhaId);
  if (e0) throw new Error(e0.message);
  const existentes = (atual ?? []) as any[];
  const usados = new Set<string>();
  const acharExistente = (l: ItemLido) =>
    existentes.find((e) => !usados.has(e.id) && l.codigo && e.codigo === l.codigo) ??
    existentes.find((e) => !usados.has(e.id) && e.pagina === l.pagina && e.pos_x != null && Math.abs(Number(e.pos_x) - l.x) < 0.03 && Math.abs(Number(e.pos_y) - l.y) < 0.03) ??
    existentes.find((e) => !usados.has(e.id) && normal(e.descricao) === normal(l.descricao) && !!l.descricao);
  const novos: ItemLido[] = [];
  const paraLigar: { id: string; codigo: string }[] = [];
  let corrigidos = 0;
  for (const l of lidos) {
    if (!l.descricao && !l.codigo) continue;
    const e = acharExistente(l);
    if (!e) { novos.push(l); continue; }
    usados.add(e.id);
    const upd: any = {};
    const nomeVelho = normal(e.descricao), nomeNovo = normal(l.descricao);
    if (nomeNovo && nomeNovo !== nomeVelho && nomeNovo.length > nomeVelho.length && nomeNovo.includes(nomeVelho)) upd.descricao = l.descricao;
    if (!e.codigo && l.codigo) upd.codigo = l.codigo;
    if (e.pagina == null) { upd.pagina = l.pagina; upd.pos_x = l.x; upd.pos_y = l.y; }
    if (Object.keys(upd).length) {
      const { error } = await supabase.from('jornal_itens').update(upd).eq('id', e.id);
      if (error) throw new Error(error.message);
      if (upd.descricao || upd.codigo) corrigidos++;
    }
    if (l.codigo) paraLigar.push({ id: e.id, codigo: l.codigo });
    (l.outrosCodigos ?? []).forEach((c) => paraLigar.push({ id: e.id, codigo: c }));
  }
  let ordem = existentes.reduce((m, e) => Math.max(m, e.ordem ?? 0), 0);
  const linhas = novos.map((l) => ({
    campanha_id: campanhaId, ordem: ++ordem, descricao: l.descricao || `Código ${l.codigo}`, preco: l.preco,
    codigo: l.codigo, pagina: l.pagina, pos_x: l.x, pos_y: l.y,
  }));
  for (let i = 0; i < linhas.length; i += 200) {
    const { data, error } = await supabase.from('jornal_itens').insert(linhas.slice(i, i + 200)).select('id, codigo');
    if (error) throw new Error(error.message);
    (data ?? []).forEach((c: any, k: number) => {
      if (c.codigo) paraLigar.push({ id: c.id, codigo: c.codigo });
      (novos[i + k]?.outrosCodigos ?? []).forEach((o) => paraLigar.push({ id: c.id, codigo: o }));
    });
  }
  // produto do código: nome como está no Estoque Loja
  if (paraLigar.length) {
    const { data: est } = await supabase.from('estoque_loja_itens').select('codigo_interno, produto').in('codigo_interno', [...new Set(paraLigar.map((c) => c.codigo))]);
    const nome = new Map((est ?? []).map((e: any) => [String(e.codigo_interno), e.produto as string]));
    const links = paraLigar.filter((c) => nome.has(c.codigo)).map((c) => ({ item_id: c.id, codigo: c.codigo, produto: nome.get(c.codigo)!, origem: 'auto', criado_por: por }));
    for (let i = 0; i < links.length; i += 300) {
      const { error } = await supabase.from('jornal_item_produtos').upsert(links.slice(i, i + 300), { onConflict: 'item_id,produto', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
  }
  return { novos: linhas.length, corrigidos };
}

// Itens repetidos na campanha (mesmo nome e preço): fica o primeiro (de
// preferência o que tem lugar no PDF), os produtos dos outros passam para ele
// e os repetidos saem. Devolve quantos foram juntados.
export async function juntarRepetidos(campanhaId: string): Promise<number> {
  const { data, error } = await supabase.from('jornal_itens').select('id, ordem, descricao, preco, pagina, conf_status, conf_por, conf_em').eq('campanha_id', campanhaId).order('ordem');
  if (error) throw new Error(error.message);
  const grupos = new Map<string, any[]>();
  (data ?? []).forEach((i: any) => {
    const k = normal(i.descricao) + '|' + (i.preco == null ? '' : Number(i.preco).toFixed(2));
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  });
  let juntados = 0;
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue;
    const fica = lista.find((i) => i.pagina != null) ?? lista[0];
    const saem = lista.filter((i) => i.id !== fica.id);
    const { data: links } = await supabase.from('jornal_item_produtos').select('codigo, produto, origem, criado_por').in('item_id', saem.map((i) => i.id));
    if (links?.length) {
      const { error: e1 } = await supabase.from('jornal_item_produtos').upsert(
        links.map((l: any) => ({ item_id: fica.id, codigo: l.codigo, produto: l.produto, origem: l.origem, criado_por: l.criado_por })),
        { onConflict: 'item_id,produto', ignoreDuplicates: true },
      );
      if (e1) throw new Error(e1.message);
    }
    const comStatus = !fica.conf_status ? saem.find((i) => i.conf_status) : null;
    if (comStatus) await supabase.from('jornal_itens').update({ conf_status: comStatus.conf_status, conf_por: comStatus.conf_por, conf_em: comStatus.conf_em }).eq('id', fica.id);
    const { error: e2 } = await supabase.from('jornal_itens').delete().in('id', saem.map((i) => i.id));
    if (e2) throw new Error(e2.message);
    juntados += saem.length;
  }
  return juntados;
}

export async function marcarConferencia(itemId: string, status: StatusConferencia | null, por: string, em?: string): Promise<void> {
  const { error } = await supabase
    .from('jornal_itens')
    .update({ conf_status: status, conf_por: status ? por : null, conf_em: status ? em ?? new Date().toISOString() : null })
    .eq('id', itemId);
  if (error) throw new Error(error.message);
}

// ------------------------------------------- conferência sem internet ----
// Marcação que não conseguiu chegar ao servidor (sem sinal) fica numa fila no
// celular e é enviada sozinha quando a internet volta. Vale a última marcação
// de cada item; guarda a hora em que foi feita na loja.
export type MarcacaoPendente = { itemId: string; status: StatusConferencia | null; por: string; em: string };
const CHAVE_FILA = 'conf_jornal_fila_v1';

export const ehErroDeRede = (e: any) =>
  /fetch failed|network|failed to connect|connectexception|timeout|timed out|unable to resolve|internet|aborted/i.test(String(e?.message ?? e ?? ''));

export async function lerFilaConferencia(): Promise<MarcacaoPendente[]> {
  try { return JSON.parse((await AsyncStorage.getItem(CHAVE_FILA)) ?? '[]'); } catch { return []; }
}
async function gravarFila(f: MarcacaoPendente[]) {
  await AsyncStorage.setItem(CHAVE_FILA, JSON.stringify(f));
}

// Tenta salvar; sem internet, guarda na fila. Devolve true se ficou na fila.
export async function marcarConferenciaOuGuardar(itemId: string, status: StatusConferencia | null, por: string): Promise<boolean> {
  const em = new Date().toISOString();
  const fila = await lerFilaConferencia();
  // se já tem coisa na fila deste item, a nova marcação entra depois dela
  if (!fila.some((m) => m.itemId === itemId)) {
    try {
      await marcarConferencia(itemId, status, por, em);
      return false;
    } catch (e) {
      if (!ehErroDeRede(e)) throw e;
    }
  }
  await gravarFila([...fila.filter((m) => m.itemId !== itemId), { itemId, status, por, em }]);
  return true;
}

// Envia o que está na fila. Devolve quantas ainda ficaram (sem internet).
export async function enviarFilaConferencia(): Promise<number> {
  const fila = await lerFilaConferencia();
  if (!fila.length) return 0;
  const resto: MarcacaoPendente[] = [];
  for (const m of fila) {
    try {
      await marcarConferencia(m.itemId, m.status, m.por, m.em);
    } catch (e) {
      if (ehErroDeRede(e)) resto.push(m); // continua sem sinal
      // outro erro (item apagado etc.): descarta para não travar a fila
    }
  }
  // pode ter entrado marcação nova enquanto enviava
  const agora = await lerFilaConferencia();
  const enviados = new Set(fila.filter((m) => !resto.includes(m)).map((m) => m.itemId + m.em));
  const final = agora.filter((m) => !enviados.has(m.itemId + m.em));
  await gravarFila(final);
  return final.length;
}

// Põe por cima da lista do servidor o que ainda está na fila do celular.
export function aplicarFila(itens: ItemEncarte[], fila: MarcacaoPendente[]): ItemEncarte[] {
  if (!fila.length) return itens;
  const m = new Map(fila.map((f) => [f.itemId, f]));
  return itens.map((i) => {
    const f = m.get(i.id);
    return f ? { ...i, confStatus: f.status, confPor: f.status ? f.por : null, confEm: f.status ? f.em : null } : i;
  });
}

// Última lista aberta, para conseguir abrir a conferência sem internet.
const CHAVE_CACHE = 'conf_jornal_cache_v1';
export type CacheConferencia = { jornal: JornalOferta | null; campanha: CampanhaJornal; itens: ItemEncarte[] };
export async function guardarCacheConferencia(c: CacheConferencia) {
  try { await AsyncStorage.setItem(CHAVE_CACHE + ':' + c.campanha.id, JSON.stringify(c)); if ((c.campanha.tipo ?? 'folheto') === 'folheto') await AsyncStorage.setItem(CHAVE_CACHE, c.campanha.id); } catch {}
}
export async function lerCacheConferencia(campanhaId?: string): Promise<CacheConferencia | null> {
  try {
    const id = campanhaId ?? (await AsyncStorage.getItem(CHAVE_CACHE));
    if (!id) return null;
    const s = await AsyncStorage.getItem(CHAVE_CACHE + ':' + id);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// Zera só o OK/Ruptura/Falta Explosivo (os produtos ligados continuam).
export async function reiniciarConferenciaJornal(campanhaId: string): Promise<void> {
  const { error } = await supabase.from('jornal_itens').update({ conf_status: null, conf_por: null, conf_em: null }).eq('campanha_id', campanhaId);
  if (error) throw new Error(error.message);
}

// Códigos dos produtos ligados a cada item (para montar a rota no mapa).
export async function codigosDosItens(ids: string[]): Promise<Record<string, string[]>> {
  const r: Record<string, string[]> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from('jornal_item_produtos').select('item_id, codigo').in('item_id', ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    (data ?? []).forEach((l: any) => { if (l.codigo) (r[l.item_id] = r[l.item_id] ?? []).push(String(l.codigo)); });
  }
  return r;
}

// ------------------------------------------------ Ofertas de TV -------
// Campanha tipo 'tv': vale 7 dias, itens cadastrados à mão. Usa as mesmas
// tabelas do folheto, então a conferência, a rota, o relatório e o Estoque do
// Jornal funcionam igual.
export const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const brDia = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');

export async function listarCampanhasTv(): Promise<CampanhaJornal[]> {
  const { data, error } = await supabase.from('jornal_campanhas').select('id, titulo, inicio, fim, tipo').eq('tipo', 'tv').order('inicio', { ascending: false }).limit(12);
  if (error) throw new Error(error.message);
  return (data ?? []) as CampanhaJornal[];
}

export async function criarCampanhaTv(inicio: string, fim: string, por: string): Promise<CampanhaJornal> {
  const { data, error } = await supabase
    .from('jornal_campanhas')
    .insert({ titulo: `Ofertas de TV ${brDia(inicio)} a ${brDia(fim)}`, inicio, fim, tipo: 'tv', criado_por: por })
    .select('id, titulo, inicio, fim, tipo')
    .single();
  if (error) throw new Error(error.message);
  return data as CampanhaJornal;
}

// Apaga a oferta de TV com os itens e os produtos ligados (cascata no banco).
export async function excluirCampanhaTv(id: string): Promise<void> {
  const { error } = await supabase.from('jornal_campanhas').delete().eq('id', id).eq('tipo', 'tv');
  if (error) throw new Error(error.message);
}

export async function criarItemManual(campanhaId: string, descricao: string, preco: number | null): Promise<string> {
  const { data: ult } = await supabase.from('jornal_itens').select('ordem').eq('campanha_id', campanhaId).order('ordem', { ascending: false }).limit(1);
  const { data, error } = await supabase
    .from('jornal_itens')
    .insert({ campanha_id: campanhaId, ordem: (ult?.[0]?.ordem ?? 0) + 1, descricao, preco })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function excluirItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('jornal_itens').delete().eq('id', itemId);
  if (error) throw new Error(error.message);
}
