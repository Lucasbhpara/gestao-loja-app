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
  const mesma = await supabase.from('jornal_campanhas').select(sel).eq('inicio', p.inicio).is('jornal_oferta_id', null).limit(1);
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

// Cria os itens lidos do PDF que ainda não existem na campanha e já liga o
// produto do código impresso no encarte. Devolve quantos itens novos entraram.
export async function criarItensLidos(campanhaId: string, lidos: ItemLido[], existentes: ItemEncarte[], por: string): Promise<number> {
  const codigos = new Set(existentes.map((e) => e.codigo).filter(Boolean) as string[]);
  const nomes = new Set(existentes.map((e) => normal(e.descricao)));
  const novos = lidos.filter((l) => (l.codigo ? !codigos.has(l.codigo) : true) && !nomes.has(normal(l.descricao)) && (l.descricao || l.codigo));
  if (!novos.length) return 0;
  let ordem = existentes.reduce((m, e) => Math.max(m, e.ordem), 0);
  const linhas = novos.map((l) => ({
    campanha_id: campanhaId, ordem: ++ordem, descricao: l.descricao || `Código ${l.codigo}`, preco: l.preco,
    codigo: l.codigo, pagina: l.pagina, pos_x: l.x, pos_y: l.y,
  }));
  const criados: { id: string; codigo: string | null }[] = [];
  for (let i = 0; i < linhas.length; i += 200) {
    const { data, error } = await supabase.from('jornal_itens').insert(linhas.slice(i, i + 200)).select('id, codigo');
    if (error) throw new Error(error.message);
    criados.push(...((data ?? []) as any));
  }
  // produto do código: nome como está no Estoque Loja
  const comCodigo = criados.filter((c) => c.codigo);
  if (comCodigo.length) {
    const { data: est } = await supabase.from('estoque_loja_itens').select('codigo_interno, produto').in('codigo_interno', comCodigo.map((c) => c.codigo));
    const nome = new Map((est ?? []).map((e: any) => [String(e.codigo_interno), e.produto as string]));
    const links = comCodigo.filter((c) => nome.has(c.codigo!)).map((c) => ({ item_id: c.id, codigo: c.codigo, produto: nome.get(c.codigo!)!, origem: 'auto', criado_por: por }));
    if (links.length) {
      const { error } = await supabase.from('jornal_item_produtos').upsert(links, { onConflict: 'item_id,produto' });
      if (error) throw new Error(error.message);
    }
  }
  return criados.length;
}

export async function marcarConferencia(itemId: string, status: StatusConferencia | null, por: string): Promise<void> {
  const { error } = await supabase
    .from('jornal_itens')
    .update({ conf_status: status, conf_por: status ? por : null, conf_em: status ? new Date().toISOString() : null })
    .eq('id', itemId);
  if (error) throw new Error(error.message);
}

// Zera só o OK/Ruptura/Falta Explosivo (os produtos ligados continuam).
export async function reiniciarConferenciaJornal(campanhaId: string): Promise<void> {
  const { error } = await supabase.from('jornal_itens').update({ conf_status: null, conf_por: null, conf_em: null }).eq('campanha_id', campanhaId);
  if (error) throw new Error(error.message);
}
