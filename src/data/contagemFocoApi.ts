import { supabase } from '../lib/supabase';

// =============================================================================
// Contagem de itens foco nas lojas — o supervisor escolhe a lista (modelo),
// as lojas, manda o link e acompanha em tempo real.
// Tabelas: contagem_campanhas, contagem_respostas, contagem_modelos.
// RPCs: contagem_criar, contagem_resumo, contagem_listar, contagem_modelos_lista.
// Página das lojas / painel web: https://ulva.com.br/contagem/
// Também disponível no Robô Ulva (opção 8 do menu).
// =============================================================================

export const CONTAGEM_URL = 'https://ulva.com.br/contagem/';
export const linkLoja = (id: string) => `${CONTAGEM_URL}?c=${id}`;
export const linkPainel = (id: string) => `${CONTAGEM_URL}?c=${id}&p=1`;

export type ModeloContagem = { nome: string; qtd: number };
export type ContagemAberta = {
  id: string; titulo: string; criado_em: string; criado_por: string | null;
  total: number; marcados: number; lojas_iniciadas: number; total_lojas: number;
};
export type LojaResumo = { loja: string; feitos: number; rupturas: number; quem: string | null; ultima: string | null };
export type ResumoContagem = {
  id: string; titulo: string; criado_em: string; criado_por: string | null;
  total_itens: number; total_lojas: number; marcados: number; rupturas: number;
  lojas: LojaResumo[]; itens_ruptura: { cod: string; nome: string | null; lojas: number }[];
};

export async function listarModelos(): Promise<ModeloContagem[]> {
  const { data, error } = await supabase.rpc('contagem_modelos_lista');
  if (error) throw new Error(error.message);
  return (data as ModeloContagem[]) ?? [];
}

export async function listarLojas(): Promise<string[]> {
  const { data, error } = await supabase.from('system_config').select('value').eq('key', 'contagem_lojas').maybeSingle();
  if (error) throw new Error(error.message);
  const v = (data as any)?.value;
  try { return Array.isArray(v) ? v : JSON.parse(v ?? '[]'); } catch { return []; }
}

export async function listarAbertas(limite = 10): Promise<ContagemAberta[]> {
  const { data, error } = await supabase.rpc('contagem_listar', { p_limite: limite });
  if (error) throw new Error(error.message);
  return (data as ContagemAberta[]) ?? [];
}

export async function criarContagem(titulo: string, modelos: string[], lojas: string[] | null, por: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('contagem_criar', { p_titulo: titulo, p_modelos: modelos, p_lojas: lojas, p_por: por });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function resumoContagem(id: string): Promise<ResumoContagem | null> {
  const { data, error } = await supabase.rpc('contagem_resumo', { p_id: id });
  if (error) throw new Error(error.message);
  return (data as ResumoContagem) ?? null;
}

export async function encerrarContagem(id: string): Promise<void> {
  const { error } = await supabase.from('contagem_campanhas').update({ ativa: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

export type StatusItem = 'tem' | 'baixo' | 'ruptura' | null;
export type ItemLoja = { cod: string; nome: string; status: StatusItem; qtd: number | null; obs: string | null; por: string | null };

// Itens da contagem + todas as respostas (para o detalhe por loja e o compartilhar).
export async function respostasContagem(id: string): Promise<{ itens: { cod: string; nome: string }[]; respostas: any[] }> {
  const { data: c, error: e1 } = await supabase.from('contagem_campanhas').select('itens').eq('id', id).maybeSingle();
  if (e1) throw new Error(e1.message);
  // O Supabase devolve no máximo 1000 linhas por vez: busca em páginas.
  const respostas: any[] = [];
  for (let de = 0; de < 50000; de += 1000) {
    const { data: r, error: e2 } = await supabase.from('contagem_respostas')
      .select('loja,item_cod,status,qtd,obs,respondido_por').eq('campanha_id', id)
      .order('loja').order('item_cod').range(de, de + 999);
    if (e2) throw new Error(e2.message);
    respostas.push(...((r as any[]) ?? []));
    if (!r || r.length < 1000) break;
  }
  return { itens: ((c as any)?.itens ?? []) as { cod: string; nome: string }[], respostas };
}

export function itensDaLoja(dados: { itens: { cod: string; nome: string }[]; respostas: any[] }, loja: string): ItemLoja[] {
  const mapa = new Map<string, any>();
  dados.respostas.filter((x) => x.loja === loja).forEach((x) => mapa.set(String(x.item_cod), x));
  return dados.itens.map((i) => {
    const x = mapa.get(String(i.cod));
    return { cod: String(i.cod), nome: i.nome || String(i.cod), status: (x?.status ?? null) as StatusItem, qtd: x?.qtd ?? null, obs: x?.obs ?? null, por: x?.respondido_por ?? null };
  });
}

const rotulo = (i: ItemLoja) => `${i.cod} – ${i.nome}${i.qtd != null ? ` (${i.qtd})` : ''}`;

// Texto para WhatsApp com o resultado de UMA loja.
export function textoLoja(titulo: string, loja: string, itens: ItemLoja[]): string {
  const rup = itens.filter((i) => i.status === 'ruptura');
  const pouco = itens.filter((i) => i.status === 'baixo');
  const falta = itens.filter((i) => !i.status);
  const l = [`📋 *${titulo}*`, `🏪 *${loja}* · ${itens.length - falta.length}/${itens.length} itens conferidos`, ''];
  l.push(`🔴 *Ruptura (${rup.length})*`); rup.forEach((i) => l.push(`• ${rotulo(i)}`));
  if (pouco.length) { l.push('', `🟡 *Pouco (${pouco.length})*`); pouco.forEach((i) => l.push(`• ${rotulo(i)}`)); }
  if (falta.length) { l.push('', `⚪ *Não conferidos (${falta.length})*`); falta.slice(0, 60).forEach((i) => l.push(`• ${rotulo(i)}`)); if (falta.length > 60) l.push(`… e mais ${falta.length - 60}`); }
  return l.join('\n');
}

// Texto para WhatsApp com as rupturas de TODAS as lojas.
export function textoRupturasGeral(titulo: string, lojas: string[], dados: { itens: { cod: string; nome: string }[]; respostas: any[] }): string {
  const l = [`📋 *${titulo}* — rupturas por loja`, ''];
  let total = 0;
  lojas.forEach((loja) => {
    const its = itensDaLoja(dados, loja);
    const rup = its.filter((i) => i.status === 'ruptura');
    const conf = its.filter((i) => i.status).length;
    if (!conf) { l.push(`🏪 *${loja}* — ainda não conferiu`, ''); return; }
    total += rup.length;
    l.push(`🏪 *${loja}* — ${rup.length ? `🔴 ${rup.length} ruptura${rup.length > 1 ? 's' : ''}` : '✅ sem ruptura'} (${conf}/${its.length} conferidos)`);
    rup.forEach((i) => l.push(`• ${rotulo(i)}`));
    l.push('');
  });
  l.push(`Total de rupturas: *${total}*`);
  return l.join('\n');
}
