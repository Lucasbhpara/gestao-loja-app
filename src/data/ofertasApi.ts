import { supabase } from '../lib/supabase';
import { carregarBaseGiro } from './giroApi';
import { LOGO_RESERVA } from './logoReserva';

// =============================================================================
// Ofertas para o grupo de WhatsApp (supabase/schema_ofertas_whatsapp.sql).
//
// O app monta a oferta (produto, de/por, validade, foto), gera a imagem do
// card e abre o WhatsApp pra pessoa escolher o grupo — o WhatsApp não deixa
// sistema nenhum postar sozinho em grupo. As sugestões vêm do Giro (produto
// parado com estoque) e da Validade (vencendo). Depois do envio, o app compara
// a venda do produto antes e depois (vendas_diarias).
//
// Trava: colaborador sugere → gerente valida → quem dispara (Marcela S.)
// recebe o aviso e envia no grupo. Os avisos saem do próprio banco (trigger
// ofertas_avisar_mudanca no schema_ofertas_whatsapp.sql).
// =============================================================================

export type OrigemOferta = 'manual' | 'giro' | 'estoque_alto' | 'validade' | 'jornal';
export type StatusOferta = 'pendente' | 'aprovada' | 'reprovada';

// Quem dispara as ofertas aprovadas no grupo (mesma lista do banco:
// ofertas_disparadores()). Hoje: Marcela S.
export const DISPARADORES_OFERTAS = ['9734844'];
export const podeDisparar = (u: { matricula?: string | number | null; isAdmin?: boolean } | null) =>
  !!u && (!!u.isAdmin || DISPARADORES_OFERTAS.includes(String(u.matricula ?? '')));

// Setores das sugestões: o nome que aparece no app, os setores do cadastro
// de produtos (giro) que entram nele e os setores do app (Validade).
export interface SetorOferta {
  chave: string;
  nome: string;
  giro: string[];
  app: string[];
}
export const SETORES_OFERTA: SetorOferta[] = [
  { chave: 'acougue', nome: 'Açougue', giro: ['ACOUGUE/SALGADOS/DEFUMADO'], app: ['acougue'] },
  { chave: 'flv', nome: 'FLV', giro: ['HORTIFRUTIGRANJEIROS', 'MARGEM GARANTIDA'], app: ['flv'] },
  { chave: 'frios', nome: 'Frios e Laticínios', giro: ['PERECIVEIS'], app: ['frios'] },
  { chave: 'padaria', nome: 'Padaria', giro: ['PADARIA FORN/FAB PROPRIA'], app: ['padaria'] },
  { chave: 'mercearia', nome: 'Mercearia', giro: ['MERCEARIA DOCE', 'MERCEARIA SALGADA', 'CEREAIS', 'BOMBONIERE/MATINAIS'], app: ['mercearia', 'deposito'] },
  { chave: 'bebidas', nome: 'Bebidas', giro: ['MERCEARIA LIQUIDA'], app: [] },
  { chave: 'limpeza', nome: 'Limpeza', giro: ['LIMPEZA'], app: [] },
  { chave: 'higiene', nome: 'Higiene e Perfumaria', giro: ['PERFUMARIA/HIG PESSOAL'], app: [] },
  { chave: 'bazar', nome: 'Bazar', giro: ['BAZAR', 'MARGEM GARANTIDA BAZAR'], app: [] },
];
export const nomeSetorOferta = (chave: string | null | undefined) => SETORES_OFERTA.find((s) => s.chave === chave)?.nome ?? null;
// Setor do colaborador → setor das sugestões (null = loja toda)
export function setorOfertaDoUsuario(setorApp: string | null | undefined): string | null {
  return SETORES_OFERTA.find((s) => s.app.includes(setorApp ?? ''))?.chave ?? null;
}
function setorDoGiro(setorGiro: string): string | null {
  return SETORES_OFERTA.find((s) => s.giro.includes(setorGiro))?.chave ?? null;
}

export interface Oferta {
  id: string;
  codigo: string | null;
  codigoBarras: string | null;
  produto: string;
  unidadeVenda: string;
  precoDe: number | null;
  precoPor: number;
  inicio: string;
  fim: string | null;
  origem: OrigemOferta;
  setor: string | null;
  observacao: string | null;
  status: StatusOferta;
  aprovadaPor: string | null;
  aprovadaEm: string | null;
  motivoReprovacao: string | null;
  agendadaPara: string | null;
  enviadaEm: string | null;
  enviadaPor: string | null;
  criadoPor: string | null;
  matricula: string | null;
  criadoEm: string;
}

export interface ProdutoBusca {
  codigo: string | null;
  codigoBarras: string | null;
  produto: string;
  preco: number | null;
  custo: number | null;
  estoque: number | null;
}

export interface Sugestao extends ProdutoBusca {
  origem: 'giro' | 'estoque_alto' | 'validade';
  setor: string | null;
  motivo: string;
  precoSugerido: number | null;
  peso: number; // pra ordenar (R$ parado ou urgência)
}

const num = (v: any): number | null => (v == null || v === '' ? null : Number(v));

function linhaParaOferta(l: any): Oferta {
  return {
    id: l.id,
    codigo: l.codigo ?? null,
    codigoBarras: l.codigo_barras ?? null,
    produto: l.produto,
    unidadeVenda: l.unidade_venda ?? 'un',
    precoDe: num(l.preco_de),
    precoPor: Number(l.preco_por),
    inicio: l.inicio,
    fim: l.fim ?? null,
    origem: l.origem,
    setor: l.setor ?? null,
    observacao: l.observacao ?? null,
    status: (l.status ?? 'pendente') as StatusOferta,
    aprovadaPor: l.aprovada_por ?? null,
    aprovadaEm: l.aprovada_em ?? null,
    motivoReprovacao: l.motivo_reprovacao ?? null,
    agendadaPara: l.agendada_para ?? null,
    enviadaEm: l.enviada_em ?? null,
    enviadaPor: l.enviada_por ?? null,
    criadoPor: l.criado_por ?? null,
    matricula: l.matricula ?? null,
    criadoEm: l.criado_em,
  };
}

export const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const somarDias = (iso: string, dias: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const dataBrCurta = (iso: string | null) => (iso ? iso.slice(5, 10).split('-').reverse().join('/') : '');
export const reais = (v: number | null) =>
  v == null ? '—' : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Ofertas ativas: sem data de fim ou ainda dentro da validade.
export const ofertaAtiva = (o: Oferta) => !o.fim || o.fim >= hojeIso();

// --- Produtos ----------------------------------------------------------------

export async function buscarProdutosParaOferta(termo: string): Promise<ProdutoBusca[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const padrao = `%${t}%`;
  const { data, error } = await supabase
    .from('estoque_loja_itens')
    .select('codigo_interno, codigo_barras, produto, preco_venda, preco_custo, quantidade')
    .or(`codigo_interno.ilike.${padrao},codigo_barras.ilike.${padrao},produto.ilike.${padrao}`)
    .order('produto')
    .limit(40);
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    codigo: l.codigo_interno ?? null,
    codigoBarras: l.codigo_barras ?? null,
    produto: l.produto,
    preco: num(l.preco_venda),
    custo: num(l.preco_custo),
    estoque: num(l.quantidade),
  }));
}

// --- Fotos -------------------------------------------------------------------

export async function buscarFotos(codigos: string[]): Promise<Record<string, string>> {
  const lista = [...new Set(codigos.filter(Boolean))];
  if (!lista.length) return {};
  const { data, error } = await supabase.from('produto_fotos').select('codigo, foto_url, atualizado_em').in('codigo', lista);
  if (error) throw error;
  const m: Record<string, string> = {};
  // ?v= força o celular a não usar a foto antiga em cache quando ela é trocada
  (data ?? []).forEach((l: any) => (m[l.codigo] = `${l.foto_url}?v=${new Date(l.atualizado_em).getTime()}`));
  return m;
}

// Open Food Facts: base pública e gratuita de produtos por código de barras.
export async function procurarFotoNaInternet(codigoBarras: string | null): Promise<string | null> {
  const ean = (codigoBarras ?? '').replace(/\D/g, '');
  if (ean.length < 8) return null;
  for (const base of ['https://world.openfoodfacts.org', 'https://br.openfoodfacts.org']) {
    try {
      const r = await fetch(`${base}/api/v2/product/${ean}.json?fields=image_front_url,image_url`, {
        headers: { 'User-Agent': 'ULVA-GestaoLoja/1.0 (loja 327)' },
      });
      if (!r.ok) continue;
      const j = await r.json();
      const url = j?.product?.image_front_url || j?.product?.image_url;
      if (url) return url;
    } catch {
      // sem internet ou base fora do ar: tenta a próxima / cai pra câmera
    }
  }
  return null;
}

async function enviarArquivoFoto(codigo: string, conteudo: ArrayBuffer, contentType: string): Promise<string> {
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const nome = `${codigo}.${ext}`;
  const { error } = await supabase.storage.from('produtos-fotos').upload(nome, conteudo, { contentType, upsert: true });
  if (error) throw error;
  return supabase.storage.from('produtos-fotos').getPublicUrl(nome).data.publicUrl;
}

// Salva a foto (da câmera/galeria = uri local; da internet = url) no produto.
export async function salvarFotoProduto(d: {
  codigo: string;
  codigoBarras: string | null;
  origem: 'camera' | 'galeria' | 'internet';
  uriOuUrl: string;
  por: string;
}): Promise<string> {
  const resp = await fetch(d.uriOuUrl);
  if (!resp.ok && d.origem === 'internet') throw new Error('Não consegui baixar a foto da internet.');
  const tipo = resp.headers.get('content-type') || 'image/jpeg';
  const url = await enviarArquivoFoto(d.codigo, await resp.arrayBuffer(), tipo.startsWith('image/') ? tipo : 'image/jpeg');
  const { error } = await supabase.from('produto_fotos').upsert({
    codigo: d.codigo,
    codigo_barras: d.codigoBarras,
    foto_url: url,
    origem: d.origem,
    atualizado_por: d.por,
    atualizado_em: new Date().toISOString(),
  });
  if (error) throw error;
  return `${url}?v=${Date.now()}`;
}

// --- Ofertas -----------------------------------------------------------------

export async function listarOfertas(): Promise<Oferta[]> {
  const desde = somarDias(hojeIso(), -60);
  const { data, error } = await supabase
    .from('ofertas')
    .select('*')
    .gte('criado_em', desde)
    .order('criado_em', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map(linhaParaOferta);
}

export async function salvarOferta(
  d: Partial<Oferta> & { produto: string; precoPor: number },
  por: { nome: string; matricula: string | null; gerente: boolean },
): Promise<Oferta> {
  const linha: any = {
    codigo: d.codigo ?? null,
    codigo_barras: d.codigoBarras ?? null,
    produto: d.produto.trim(),
    unidade_venda: d.unidadeVenda ?? 'un',
    preco_de: d.precoDe ?? null,
    preco_por: d.precoPor,
    inicio: d.inicio ?? hojeIso(),
    fim: d.fim ?? null,
    origem: d.origem ?? 'manual',
    setor: d.setor ?? null,
    observacao: d.observacao ?? null,
    agendada_para: d.agendadaPara ?? null,
    avisado_em: null,
    motivo_reprovacao: null,
  };
  // Gerente: já entra aprovada (avisa quem dispara). Colaborador: vai pra validação.
  if (por.gerente) {
    linha.status = 'aprovada';
    if (d.status !== 'aprovada') {
      linha.aprovada_por = por.nome;
      linha.aprovada_em = new Date().toISOString();
    }
  } else {
    linha.status = 'pendente';
  }
  if (d.id) {
    const { data, error } = await supabase.from('ofertas').update(linha).eq('id', d.id).select('*').single();
    if (error) throw error;
    return linhaParaOferta(data);
  }
  const { data, error } = await supabase
    .from('ofertas')
    .insert({ ...linha, criado_por: por.nome, matricula: por.matricula })
    .select('*')
    .single();
  if (error) throw error;
  return linhaParaOferta(data);
}

export async function aprovarOfertas(ids: string[], por: string): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from('ofertas')
    .update({ status: 'aprovada', aprovada_por: por, aprovada_em: new Date().toISOString(), motivo_reprovacao: null })
    .in('id', ids);
  if (error) throw error;
}

export async function reprovarOferta(id: string, motivo: string, por: string): Promise<void> {
  const { error } = await supabase
    .from('ofertas')
    .update({ status: 'reprovada', aprovada_por: por, aprovada_em: new Date().toISOString(), motivo_reprovacao: motivo.trim() || null })
    .eq('id', id);
  if (error) throw error;
}

export async function excluirOferta(id: string): Promise<void> {
  const { error } = await supabase.from('ofertas').delete().eq('id', id);
  if (error) throw error;
}

export async function marcarOfertasEnviadas(ids: string[], por: string): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from('ofertas')
    .update({ enviada_em: new Date().toISOString(), enviada_por: por })
    .in('id', ids)
    .is('enviada_em', null);
  if (error) throw error;
}

// --- Sugestões ---------------------------------------------------------------
//
// Três listas, sempre filtráveis por setor:
//   * Parados ........ estoque e 14+ dias sem venda (giro), maior valor parado primeiro
//   * Estoque alto ... vende, mas o estoque cobre mais de 45 dias de venda
//   * Vencendo ....... cadastrados na Validade, vencem em até 10 dias

// Preço sugerido: X% abaixo do preço atual, sem passar de 5% acima do custo.
export function precoSugerido(preco: number | null, custo: number | null, desconto = 0.15): number | null {
  if (!preco) return null;
  let p = preco * (1 - desconto);
  if (custo && p < custo * 1.05) p = custo * 1.05;
  if (p >= preco) return null;
  return Math.floor(p * 10) / 10 + 0.09; // termina em ,x9
}

async function precosPorCodigo(codigos: string[]): Promise<Record<string, any>> {
  const m: Record<string, any> = {};
  for (let i = 0; i < codigos.length; i += 200) {
    const { data, error } = await supabase
      .from('estoque_loja_itens')
      .select('codigo_interno, codigo_barras, produto, preco_venda, preco_custo, quantidade')
      .in('codigo_interno', codigos.slice(i, i + 200));
    if (error) throw error;
    (data ?? []).forEach((l: any) => (m[l.codigo_interno] = l));
  }
  return m;
}

const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export type TipoSugestao = 'giro' | 'estoque_alto' | 'validade';

export async function sugestoesDoGiro(setor: string | null, limite = 40): Promise<Sugestao[]> {
  const base = await carregarBaseGiro(false);
  const parados = base.produtos
    .filter((p) => !p.ocultoPorSetor && p.estoque > 0 && (p.diasParado === null || p.diasParado >= 14))
    .filter((p) => !setor || setorDoGiro(p.setor) === setor)
    .sort((a, b) => b.custoEstoque - a.custoEstoque)
    .slice(0, limite * 2);
  const precos = await precosPorCodigo(parados.map((p) => p.codigo));
  const lista: Sugestao[] = [];
  for (const p of parados) {
    const e = precos[p.codigo];
    const preco = num(e?.preco_venda);
    if (!preco) continue; // sem preço de venda não dá pra montar oferta
    const custo = num(e?.preco_custo) ?? p.custoMedio ?? null;
    lista.push({
      origem: 'giro',
      setor: setorDoGiro(p.setor),
      codigo: p.codigo,
      codigoBarras: e?.codigo_barras ?? null,
      produto: e?.produto ?? p.nome,
      preco,
      custo,
      estoque: p.estoque,
      precoSugerido: precoSugerido(preco, custo),
      motivo: (p.diasParado === null ? 'Sem venda no período' : `${p.diasParado} dias sem venda`) + ` · ${fmtQtd(p.estoque)} em estoque · ${reais(p.custoEstoque)} parados`,
      peso: p.custoEstoque,
    });
    if (lista.length >= limite) break;
  }
  return lista;
}

export async function sugestoesEstoqueAlto(setor: string | null, limite = 40): Promise<Sugestao[]> {
  const base = await carregarBaseGiro(false);
  const dias =
    base.periodoInicio && base.periodoFim
      ? Math.max(1, Math.round((new Date(base.periodoFim + 'T12:00:00').getTime() - new Date(base.periodoInicio + 'T12:00:00').getTime()) / 86400000) + 1)
      : 30;
  const candidatos = base.produtos
    .filter((p) => !p.ocultoPorSetor && p.estoque > 0 && p.vendaPeriodo > 0 && p.diasParado !== null && p.diasParado < 14)
    .filter((p) => !setor || setorDoGiro(p.setor) === setor)
    .map((p) => {
      // venda em R$ → custo/dia aproximado (margem média de 25%) pra comparar com o estoque a custo
      const custoDia = (p.vendaPeriodo * 0.75) / dias;
      return { p, cobertura: custoDia > 0 ? p.custoEstoque / custoDia : 0 };
    })
    .filter((x) => x.cobertura > 45 && x.p.custoEstoque >= 100)
    .sort((a, b) => b.p.custoEstoque - a.p.custoEstoque)
    .slice(0, limite * 2);
  const precos = await precosPorCodigo(candidatos.map((x) => x.p.codigo));
  const lista: Sugestao[] = [];
  for (const { p, cobertura } of candidatos) {
    const e = precos[p.codigo];
    const preco = num(e?.preco_venda);
    if (!preco) continue;
    const custo = num(e?.preco_custo) ?? p.custoMedio ?? null;
    lista.push({
      origem: 'estoque_alto',
      setor: setorDoGiro(p.setor),
      codigo: p.codigo,
      codigoBarras: e?.codigo_barras ?? null,
      produto: e?.produto ?? p.nome,
      preco,
      custo,
      estoque: p.estoque,
      precoSugerido: precoSugerido(preco, custo, 0.1),
      motivo: `Estoque para ~${Math.round(cobertura)} dias de venda · ${fmtQtd(p.estoque)} em estoque · ${reais(p.custoEstoque)}`,
      peso: p.custoEstoque,
    });
    if (lista.length >= limite) break;
  }
  return lista;
}

export async function sugestoesDaValidade(setor: string | null, dias = 10): Promise<Sugestao[]> {
  const hoje = hojeIso();
  let q = supabase
    .from('validades')
    .select('codigo_barras, produto, data_validade, quantidade, setor')
    .gte('data_validade', hoje)
    .lte('data_validade', somarDias(hoje, dias))
    .order('data_validade');
  const s = SETORES_OFERTA.find((x) => x.chave === setor);
  if (s) {
    if (!s.app.length) return [];
    q = q.in('setor', s.app);
  }
  const { data, error } = await q;
  if (error) throw error;
  const linhas = data ?? [];
  const eans = [...new Set(linhas.map((l: any) => l.codigo_barras).filter(Boolean))];
  const porEan: Record<string, any> = {};
  for (let i = 0; i < eans.length; i += 200) {
    const { data: est } = await supabase
      .from('estoque_loja_itens')
      .select('codigo_interno, codigo_barras, produto, preco_venda, preco_custo, quantidade')
      .in('codigo_barras', eans.slice(i, i + 200));
    (est ?? []).forEach((l: any) => (porEan[l.codigo_barras] = l));
  }
  const vistos = new Set<string>();
  const lista: Sugestao[] = [];
  for (const v of linhas as any[]) {
    const chave = v.codigo_barras || v.produto;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const e = porEan[v.codigo_barras];
    const preco = num(e?.preco_venda);
    const custo = num(e?.preco_custo);
    const diasRest = Math.round((new Date(v.data_validade + 'T12:00:00').getTime() - new Date(hoje + 'T12:00:00').getTime()) / 86400000);
    lista.push({
      origem: 'validade',
      setor: setorOfertaDoUsuario(v.setor),
      codigo: e?.codigo_interno ?? null,
      codigoBarras: v.codigo_barras ?? null,
      produto: e?.produto ?? v.produto,
      preco,
      custo,
      estoque: num(e?.quantidade),
      // Mais perto de vencer = desconto maior
      precoSugerido: precoSugerido(preco, custo, diasRest <= 3 ? 0.3 : 0.2),
      motivo:
        `Vence ${diasRest === 0 ? 'hoje' : diasRest === 1 ? 'amanhã' : `em ${diasRest} dias`} (${dataBr(v.data_validade)})` +
        (v.quantidade ? ` · ${Number(v.quantidade).toLocaleString('pt-BR')} un. na validade` : ''),
      peso: 100 - diasRest,
    });
  }
  return lista;
}

export function buscarSugestoes(tipo: TipoSugestao, setor: string | null): Promise<Sugestao[]> {
  return tipo === 'giro' ? sugestoesDoGiro(setor) : tipo === 'estoque_alto' ? sugestoesEstoqueAlto(setor) : sugestoesDaValidade(setor);
}

// --- Resultado (venda antes × depois) -----------------------------------------

export interface ResultadoOferta {
  mediaAntes: number; // R$/dia nos 14 dias antes do envio
  mediaDepois: number; // R$/dia do envio até o fim da oferta (ou último dia com venda importada)
  diasDepois: number;
  variacaoPct: number | null;
  ultimaData: string | null;
}

export async function resultadoDaOferta(o: Oferta): Promise<ResultadoOferta | null> {
  if (!o.codigo || !o.enviadaEm) return null;
  const envio = o.enviadaEm.slice(0, 10);
  const antesIni = somarDias(envio, -14);
  const { data: ult } = await supabase.from('vendas_diarias').select('data_venda').order('data_venda', { ascending: false }).limit(1);
  const ultimaData: string | null = ult?.[0]?.data_venda ?? null;
  if (!ultimaData || ultimaData < envio) return { mediaAntes: 0, mediaDepois: 0, diasDepois: 0, variacaoPct: null, ultimaData };
  const fim = o.fim && o.fim < ultimaData ? o.fim : ultimaData;
  const { data, error } = await supabase
    .from('vendas_diarias')
    .select('data_venda, venda_valor')
    .eq('codigo_produto', o.codigo)
    .gte('data_venda', antesIni)
    .lte('data_venda', fim);
  if (error) throw error;
  let antes = 0;
  let depois = 0;
  (data ?? []).forEach((l: any) => {
    if (l.data_venda < envio) antes += Number(l.venda_valor || 0);
    else depois += Number(l.venda_valor || 0);
  });
  const diasDepois = Math.max(1, Math.round((new Date(fim + 'T12:00:00').getTime() - new Date(envio + 'T12:00:00').getTime()) / 86400000) + 1);
  const mediaAntes = antes / 14;
  const mediaDepois = depois / diasDepois;
  return {
    mediaAntes,
    mediaDepois,
    diasDepois,
    variacaoPct: mediaAntes > 0 ? ((mediaDepois - mediaAntes) / mediaAntes) * 100 : null,
    ultimaData,
  };
}

// --- Agenda --------------------------------------------------------------------

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export interface AgendaOferta {
  id: string;
  diaSemana: number;
  hora: string; // HH:MM
  titulo: string;
  setor: string | null;
  ativo: boolean;
}

export async function listarAgenda(): Promise<AgendaOferta[]> {
  const { data, error } = await supabase.from('ofertas_agenda').select('*').order('dia_semana').order('hora');
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id,
    diaSemana: l.dia_semana,
    hora: String(l.hora).slice(0, 5),
    titulo: l.titulo,
    setor: l.setor ?? null,
    ativo: l.ativo,
  }));
}

export async function salvarAgenda(a: Partial<AgendaOferta> & { diaSemana: number; hora: string; titulo: string }, por: string): Promise<void> {
  const linha = { dia_semana: a.diaSemana, hora: a.hora, titulo: a.titulo.trim(), setor: a.setor ?? null, ativo: a.ativo ?? true };
  const { error } = a.id
    ? await supabase.from('ofertas_agenda').update(linha).eq('id', a.id)
    : await supabase.from('ofertas_agenda').insert({ ...linha, criado_por: por });
  if (error) throw error;
}

export async function excluirAgenda(id: string): Promise<void> {
  const { error } = await supabase.from('ofertas_agenda').delete().eq('id', id);
  if (error) throw error;
}

// --- Texto do WhatsApp ---------------------------------------------------------

const rotuloUnidade = (u: string) => (u === 'kg' ? '/kg' : u === 'un' ? '' : `/${u}`);

export function textoWhatsApp(ofertas: Oferta[], titulo = 'OFERTAS DO DIA'): string {
  const linhas = ofertas.map((o) => {
    const de = o.precoDe && o.precoDe > o.precoPor ? `~${reais(o.precoDe)}~ ` : '';
    return `✅ *${o.produto}*\n${de}*${reais(o.precoPor)}${rotuloUnidade(o.unidadeVenda)}*`;
  });
  const fins = ofertas.map((o) => o.fim).filter(Boolean).sort() as string[];
  const validade = fins.length ? `\n📅 Válido até ${dataBr(fins[0])} ou enquanto durarem os estoques.` : '\n📅 Enquanto durarem os estoques.';
  return `🔥 *${titulo}* 🔥\n\n${linhas.join('\n\n')}\n${validade}\n📍 ${RODAPE_LOJA}`;
}

// --- Logo da loja no card ---------------------------------------------------------
// O logo em boa resolução é enviado pelo Portal e fica em produto_fotos com o
// código especial abaixo. Sem ele, usa o recorte da arte de exemplo.
export const CODIGO_LOGO = '__logo__';
export async function buscarLogo(): Promise<string> {
  try {
    const f = await buscarFotos([CODIGO_LOGO]);
    return f[CODIGO_LOGO] || LOGO_RESERVA;
  } catch {
    return LOGO_RESERVA;
  }
}

export const RODAPE_LOJA = 'Loja 327 · Itatiaiuçu';
export function textoValidadeCard(ofertas: Pick<Oferta, 'fim'>[]): string {
  const fins = ofertas.map((o) => o.fim).filter(Boolean).sort() as string[];
  return (fins.length ? `Válido até ${dataBr(fins[0])} ou enquanto durarem os estoques` : 'Ofertas válidas enquanto durarem os estoques') + ` · ${RODAPE_LOJA}`;
}
