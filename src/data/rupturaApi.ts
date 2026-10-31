import AsyncStorage from '@react-native-async-storage/async-storage';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { rodandoNaWeb } from '../lib/plataforma';
import { criarTarefa } from './tarefasApi';
import { SetorKey } from './employees';

// =============================================================================
// Controle de Ruptura.
//
// O gerente escolhe um grupo de gôndola (ex.: "Amaciante concentrado") e bipa
// tudo o que está na área de venda. O que não foi bipado é cruzado com o
// Estoque Loja, as vendas diárias e o Formulário de Pedido do CD:
//   ok · parado (na gôndola, sem venda) · ruptura (pedir) · repor (tem saldo)
//   suspeito (tem saldo, não está na gôndola e não vende) · cd_sem (o CD está
//   zerado) · nunca_veio (o CD tem e a loja nunca recebeu).
// A lista do grupo vem pronta do banco (função ruptura_universo); a coleta fica
// salva no celular até finalizar. Tabelas em supabase/ruptura.sql.
// =============================================================================

export interface GrupoRuptura {
  id: string;
  setor: string;
  nome: string;
  ordem: number;
  diasSemVenda: number;
  ultimaColeta: { data: string; total: number; ruptura: number } | null;
}

export interface ItemUniverso {
  codigoInterno: string;
  produto: string;
  eans: string[];
  saldo: number | null;
  ultimaVenda: string | null; // AAAA-MM-DD
  noCd: boolean;
  estoqueCd: number | null;
  cdZeradoDesde: string | null;
  importacoesZerado: number;
  lojaTrabalha: boolean;
  descontinuado: boolean;
  motivoDescontinuado: string | null;
}

export type Situacao = 'ok' | 'parado' | 'ruptura' | 'repor' | 'suspeito' | 'cd_sem' | 'nunca_veio' | 'nao_cadastrado';

export const SITUACOES: Record<Situacao, { emoji: string; titulo: string; dica: string; cor: string; fundo: string }> = {
  ruptura: { emoji: '🔴', titulo: 'Ruptura', dica: 'Estoque zerado e fora da gôndola — fazer pedido', cor: '#C0352B', fundo: '#FDECEA' },
  cd_sem: { emoji: '🟠', titulo: 'CD sem estoque', dica: 'Falta na loja e o CD está zerado — pedir não resolve', cor: '#B4650E', fundo: '#FFF1E0' },
  suspeito: { emoji: '🟣', titulo: 'Estoque suspeito', dica: 'Tem saldo, não está na gôndola e não vende — conferir depósito ou ajustar', cor: '#7A3FC4', fundo: '#F1E9FB' },
  repor: { emoji: '🟡', titulo: 'Falta repor', dica: 'Tem saldo e vende — está no depósito, abastecer', cor: '#9A7A00', fundo: '#FFF8D6' },
  nunca_veio: { emoji: '🔵', titulo: 'Nunca veio', dica: 'O CD tem e a loja nunca recebeu — incluir no pedido', cor: '#2F7BFF', fundo: '#E3EDFF' },
  parado: { emoji: '🟤', titulo: 'Parado na gôndola', dica: 'Está exposto mas sem venda — ver preço, etiqueta, validade, posição', cor: '#8A5A2B', fundo: '#F6ECE2' },
  nao_cadastrado: { emoji: '⚪', titulo: 'Bipado fora do grupo', dica: 'Código não é deste grupo ou não está cadastrado', cor: '#5B6280', fundo: '#EEF0F5' },
  ok: { emoji: '✅', titulo: 'OK', dica: 'Na gôndola e vendendo', cor: '#178553', fundo: '#DFF3E8' },
};

// Ordem em que as situações aparecem no resultado e na planilha.
export const ORDEM_SITUACOES: Situacao[] = ['ruptura', 'cd_sem', 'suspeito', 'repor', 'nunca_veio', 'parado', 'nao_cadastrado', 'ok'];

export const MOTIVOS_DESCONTINUADO = ['Saiu do mix', 'Não trabalhamos esse item', 'Erro do formulário do CD', 'Outro'];

export interface ResultadoItem {
  codigoInterno: string | null;
  codigoBarras: string | null;
  produto: string;
  situacao: Situacao;
  saldo: number | null;
  ultimaVenda: string | null;
  estoqueCd: number | null;
  provavelDescontinuado: boolean;
  diasSemVenda: number | null;
}

export interface ColetaLocal {
  id: string;
  grupoId: string;
  grupoNome: string;
  setor: string;
  iniciadaEm: string;
  // EAN lido -> código interno (null = não é do grupo)
  lidos: { ean: string; codigoInterno: string | null; produto: string | null; em: string }[];
}

const CHAVE_COLETA = 'ruptura:coletaAtual';
const CHAVE_UNIVERSO = (g: string) => `ruptura:universo:${g}`;

export function gerarId(): string {
  // uuid v4 simples (sem depender de crypto no celular)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const soDigitos = (s: string) => s.replace(/\D/g, '');
// EAN com ou sem zeros à esquerda é o mesmo código (UPC-A x EAN-13).
export const normalizarEan = (s: string) => soDigitos(s).replace(/^0+/, '');

// ---------------------------------------------------------------- leitura ----

export async function buscarGrupos(): Promise<GrupoRuptura[]> {
  const { data, error } = await supabase
    .from('ruptura_grupos')
    .select('id, setor, nome, ordem, dias_sem_venda')
    .eq('ativo', true)
    .order('setor')
    .order('ordem');
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((g: any) => g.id);
  const ultimas: Record<string, GrupoRuptura['ultimaColeta']> = {};
  if (ids.length) {
    const { data: col } = await supabase
      .from('ruptura_coletas')
      .select('grupo_id, finalizada_em, total_itens, total_ruptura')
      .in('grupo_id', ids)
      .not('finalizada_em', 'is', null)
      .order('finalizada_em', { ascending: false })
      .limit(500);
    for (const c of col ?? []) {
      if (!ultimas[c.grupo_id]) ultimas[c.grupo_id] = { data: c.finalizada_em, total: c.total_itens, ruptura: c.total_ruptura };
    }
  }
  return (data ?? []).map((g: any) => ({
    id: g.id,
    setor: g.setor,
    nome: g.nome,
    ordem: g.ordem,
    diasSemVenda: g.dias_sem_venda ?? 10,
    ultimaColeta: ultimas[g.id] ?? null,
  }));
}

function mapUniverso(r: any): ItemUniverso {
  return {
    codigoInterno: String(r.codigo_interno),
    produto: r.produto ?? '',
    eans: (r.eans ?? []).map((e: string) => String(e)),
    saldo: r.saldo == null ? null : Number(r.saldo),
    ultimaVenda: r.ultima_venda ?? null,
    noCd: !!r.no_cd,
    estoqueCd: r.estoque_cd == null ? null : Number(r.estoque_cd),
    cdZeradoDesde: r.cd_zerado_desde ?? null,
    importacoesZerado: r.importacoes_zerado ?? 0,
    // Vendeu na loja = a loja trabalha, mesmo sem linha no Estoque Loja.
    lojaTrabalha: !!r.loja_trabalha || !!r.ultima_venda,
    descontinuado: !!r.descontinuado,
    motivoDescontinuado: r.motivo_descontinuado ?? null,
  };
}

// Baixa a lista do grupo e guarda no celular (a coleta funciona sem internet
// depois que a lista foi baixada uma vez).
export async function baixarUniverso(grupoId: string): Promise<{ itens: ItemUniverso[]; dataVendas: string | null; offline: boolean }> {
  try {
    const [{ data, error }, { data: v }] = await Promise.all([
      supabase.rpc('ruptura_universo', { p_grupo: grupoId }),
      supabase.from('vendas_diarias').select('data_venda').order('data_venda', { ascending: false }).limit(1),
    ]);
    if (error) throw new Error(error.message);
    const itens = (data ?? []).map(mapUniverso);
    const dataVendas = v?.[0]?.data_venda ?? null;
    await AsyncStorage.setItem(CHAVE_UNIVERSO(grupoId), JSON.stringify({ itens, dataVendas, em: new Date().toISOString() }));
    return { itens, dataVendas, offline: false };
  } catch (e) {
    const salvo = await AsyncStorage.getItem(CHAVE_UNIVERSO(grupoId));
    if (salvo) {
      const s = JSON.parse(salvo);
      return { itens: s.itens, dataVendas: s.dataVendas, offline: true };
    }
    throw e;
  }
}

export async function buscarProdutoPorEan(ean: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('produtos_catalogo').select('produto').eq('codigo_barras', ean).limit(1);
    return data?.[0]?.produto ?? null;
  } catch {
    return null;
  }
}

// --------------------------------------------------------- coleta local ----

export async function carregarColetaAtual(): Promise<ColetaLocal | null> {
  const s = await AsyncStorage.getItem(CHAVE_COLETA);
  return s ? JSON.parse(s) : null;
}
export async function salvarColetaAtual(c: ColetaLocal | null): Promise<void> {
  if (c) await AsyncStorage.setItem(CHAVE_COLETA, JSON.stringify(c));
  else await AsyncStorage.removeItem(CHAVE_COLETA);
}

export function mapaEans(itens: ItemUniverso[]): Map<string, ItemUniverso> {
  const m = new Map<string, ItemUniverso>();
  for (const it of itens) for (const e of it.eans) m.set(normalizarEan(e), it);
  return m;
}

// ------------------------------------------------------------- cruzamento ----

const DIA = 86400000;
export function diasDesde(data: string | null, referencia: string | null): number | null {
  if (!data) return null;
  const ref = referencia ? new Date(referencia + 'T12:00:00') : new Date();
  return Math.max(0, Math.round((ref.getTime() - new Date(data + 'T12:00:00').getTime()) / DIA));
}

export function calcularResultado(
  coleta: ColetaLocal,
  itens: ItemUniverso[],
  diasLimite: number,
  dataVendas: string | null,
): { resultado: ResultadoItem[]; voltaram: ItemUniverso[]; esperados: number; coletados: number } {
  const lidosCod = new Map<string, string>(); // código interno -> EAN lido
  for (const l of coleta.lidos) if (l.codigoInterno && !lidosCod.has(l.codigoInterno)) lidosCod.set(l.codigoInterno, l.ean);

  const resultado: ResultadoItem[] = [];
  const voltaram: ItemUniverso[] = [];
  let esperados = 0;

  for (const it of itens) {
    const dias = diasDesde(it.ultimaVenda, dataVendas);
    const semVenda = dias == null || dias > diasLimite;
    const bipado = lidosCod.has(it.codigoInterno);

    if (it.descontinuado) {
      // Marcado como descontinuado mas voltou a vender ou está na gôndola: avisar.
      if (bipado || (dias != null && dias <= diasLimite)) voltaram.push(it);
      continue;
    }
    if (it.lojaTrabalha) esperados++;

    let situacao: Situacao;
    const saldo = it.saldo ?? 0;
    const cdZerado = it.noCd && (it.estoqueCd ?? 0) <= 0;
    if (bipado) {
      situacao = semVenda && it.lojaTrabalha ? 'parado' : 'ok';
    } else if (!it.lojaTrabalha) {
      situacao = 'nunca_veio';
    } else if (saldo <= 0) {
      situacao = cdZerado ? 'cd_sem' : 'ruptura';
    } else {
      situacao = semVenda ? 'suspeito' : 'repor';
    }
    // Zerado no CD há mais de 30 dias e sem venda há mais de 60: serve tanto
    // para quem sobe o formulário todo dia quanto uma vez por mês.
    const diasCdZerado = diasDesde(it.cdZeradoDesde, null);
    const provavelDescontinuado = diasCdZerado != null && diasCdZerado > 30 && (dias == null || dias > 60);
    resultado.push({
      codigoInterno: it.codigoInterno,
      codigoBarras: lidosCod.get(it.codigoInterno) ?? it.eans.find((e) => e.length === 13 || e.length === 8) ?? it.eans[0] ?? null,
      produto: it.produto,
      situacao,
      saldo: it.saldo,
      ultimaVenda: it.ultimaVenda,
      estoqueCd: it.estoqueCd,
      provavelDescontinuado,
      diasSemVenda: dias,
    });
  }

  // Bipados que não são do grupo
  const vistos = new Set<string>();
  for (const l of coleta.lidos) {
    if (l.codigoInterno || vistos.has(l.ean)) continue;
    vistos.add(l.ean);
    resultado.push({
      codigoInterno: null,
      codigoBarras: l.ean,
      produto: l.produto ?? '(não encontrado no cadastro)',
      situacao: 'nao_cadastrado',
      saldo: null,
      ultimaVenda: null,
      estoqueCd: null,
      provavelDescontinuado: false,
      diasSemVenda: null,
    });
  }

  resultado.sort((a, b) => ORDEM_SITUACOES.indexOf(a.situacao) - ORDEM_SITUACOES.indexOf(b.situacao) || a.produto.localeCompare(b.produto));
  return { resultado, voltaram, esperados, coletados: lidosCod.size };
}

const EH_RUPTURA: Situacao[] = ['ruptura', 'cd_sem', 'suspeito', 'repor'];
export const contaRuptura = (r: ResultadoItem[]) => r.filter((x) => EH_RUPTURA.includes(x.situacao)).length;

// ------------------------------------------------------------ gravação ----

export async function enviarColeta(
  coleta: ColetaLocal,
  resultado: ResultadoItem[],
  esperados: number,
  coletados: number,
  feitaPor: string,
): Promise<void> {
  const resumo: Record<string, number> = {};
  for (const r of resultado) resumo[r.situacao] = (resumo[r.situacao] ?? 0) + 1;
  const { error } = await supabase.from('ruptura_coletas').upsert({
    id: coleta.id,
    grupo_id: coleta.grupoId,
    grupo_nome: coleta.grupoNome,
    setor: coleta.setor,
    feita_por: feitaPor,
    iniciada_em: coleta.iniciadaEm,
    finalizada_em: new Date().toISOString(),
    total_itens: esperados,
    total_coletados: coletados,
    total_ruptura: contaRuptura(resultado),
    resumo,
  });
  if (error) throw new Error(error.message);
  await supabase.from('ruptura_coleta_itens').delete().eq('coleta_id', coleta.id);
  const linhas = resultado.map((r) => ({
    coleta_id: coleta.id,
    codigo_interno: r.codigoInterno,
    codigo_barras: r.codigoBarras,
    produto: r.produto,
    situacao: r.situacao,
    saldo: r.saldo,
    ultima_venda: r.ultimaVenda,
    estoque_cd: r.estoqueCd,
  }));
  for (let i = 0; i < linhas.length; i += 500) {
    const { error: e2 } = await supabase.from('ruptura_coleta_itens').insert(linhas.slice(i, i + 500));
    if (e2) throw new Error(e2.message);
  }
}

export async function marcarDescontinuado(codigoInterno: string, produto: string, motivo: string, marcadoPor: string): Promise<void> {
  const { error } = await supabase
    .from('ruptura_descontinuados')
    .upsert({ codigo_interno: codigoInterno, produto, motivo, marcado_por: marcadoPor, marcado_em: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function reativar(codigoInterno: string): Promise<void> {
  const { error } = await supabase.from('ruptura_descontinuados').delete().eq('codigo_interno', codigoInterno);
  if (error) throw new Error(error.message);
}

export interface Descontinuado {
  codigoInterno: string;
  produto: string | null;
  motivo: string;
  marcadoPor: string | null;
  marcadoEm: string;
}
export async function buscarDescontinuados(): Promise<Descontinuado[]> {
  const { data, error } = await supabase.from('ruptura_descontinuados').select('*').order('marcado_em', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d: any) => ({
    codigoInterno: d.codigo_interno,
    produto: d.produto,
    motivo: d.motivo,
    marcadoPor: d.marcado_por,
    marcadoEm: d.marcado_em,
  }));
}

// ------------------------------------------------------------ planilha ----

const dataBR = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');

export async function compartilharResultado(coleta: { grupoNome: string }, resultado: ResultadoItem[], soRuptura: boolean): Promise<void> {
  const linhas = resultado
    .filter((r) => !soRuptura || r.situacao !== 'ok')
    .map((r) => ({
      Situação: SITUACOES[r.situacao].titulo,
      'Código interno': r.codigoInterno ?? '',
      'Código de barras': r.codigoBarras ?? '',
      Produto: r.produto,
      'Saldo loja': r.saldo ?? '',
      'Última venda': dataBR(r.ultimaVenda),
      'Estoque CD': r.estoqueCd ?? '',
      Observação: r.provavelDescontinuado ? 'Provável descontinuado' : '',
    }));
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 15 }, { wch: 44 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 22 }];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, ws, 'Ruptura');
  const dia = new Date().toISOString().slice(0, 10).split('-').reverse().join('-');
  await compartilharLivro(livro, `Ruptura ${coleta.grupoNome} ${dia}.xlsx`, 'Enviar ruptura');
}

// ------------------------------------------------------------ histórico ----

export interface ColetaSalva {
  id: string;
  grupoNome: string;
  setor: string | null;
  feitaPor: string | null;
  finalizadaEm: string;
  totalItens: number;
  totalColetados: number;
  totalRuptura: number;
  resumo: Record<string, number>;
}

export interface ItemSalvo {
  coletaId: string;
  codigoInterno: string | null;
  codigoBarras: string | null;
  produto: string;
  situacao: Situacao;
  saldo: number | null;
  ultimaVenda: string | null;
  estoqueCd: number | null;
}

export async function buscarHistorico(limite = 60): Promise<ColetaSalva[]> {
  const { data, error } = await supabase
    .from('ruptura_coletas')
    .select('id, grupo_nome, setor, feita_por, finalizada_em, total_itens, total_coletados, total_ruptura, resumo')
    .not('finalizada_em', 'is', null)
    .order('finalizada_em', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []).map((c: any) => ({
    id: c.id,
    grupoNome: c.grupo_nome,
    setor: c.setor,
    feitaPor: c.feita_por,
    finalizadaEm: c.finalizada_em,
    totalItens: c.total_itens,
    totalColetados: c.total_coletados,
    totalRuptura: c.total_ruptura,
    resumo: c.resumo ?? {},
  }));
}

export async function buscarItensColetas(ids: string[]): Promise<ItemSalvo[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('ruptura_coleta_itens')
    .select('coleta_id, codigo_interno, codigo_barras, produto, situacao, saldo, ultima_venda, estoque_cd')
    .in('coleta_id', ids)
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((i: any) => ({
    coletaId: i.coleta_id,
    codigoInterno: i.codigo_interno,
    codigoBarras: i.codigo_barras,
    produto: i.produto ?? '',
    situacao: i.situacao,
    saldo: i.saldo == null ? null : Number(i.saldo),
    ultimaVenda: i.ultima_venda,
    estoqueCd: i.estoque_cd == null ? null : Number(i.estoque_cd),
  }));
}

// Transforma itens salvos no formato do resultado (para reaproveitar a planilha).
export function itensSalvosComoResultado(itens: ItemSalvo[]): ResultadoItem[] {
  return itens
    .map((i) => ({
      codigoInterno: i.codigoInterno,
      codigoBarras: i.codigoBarras,
      produto: i.produto,
      situacao: i.situacao,
      saldo: i.saldo,
      ultimaVenda: i.ultimaVenda,
      estoqueCd: i.estoqueCd,
      provavelDescontinuado: false,
      diasSemVenda: null,
    }))
    .sort((a, b) => ORDEM_SITUACOES.indexOf(a.situacao) - ORDEM_SITUACOES.indexOf(b.situacao) || a.produto.localeCompare(b.produto));
}

// ------------------------------------------------------ planilha de pedido ----
// Junta uma ou mais coletas numa lista para lançar no pedido do CD:
//  aba "Pedido"          → ruptura + nunca veio (o CD tem, a loja precisa pedir)
//  aba "CD sem estoque"  → para cobrar o comprador
//  aba "Fora do CD"      → ruptura de item que não está no formulário (fornecedor direto ou fora de linha)
export async function compartilharPedido(coletas: { id: string; grupoNome: string }[], itens: ItemSalvo[]): Promise<{ pedido: number; cdSem: number; foraCd: number }> {
  const nomeGrupo = new Map(coletas.map((c) => [c.id, c.grupoNome]));
  const vistos = new Set<string>();
  const pedido: ItemSalvo[] = [];
  const cdSem: ItemSalvo[] = [];
  const foraCd: ItemSalvo[] = [];
  for (const i of itens) {
    if (!i.codigoInterno || vistos.has(i.codigoInterno)) continue;
    if (i.situacao === 'ruptura' || i.situacao === 'nunca_veio') {
      // Sem estoque_cd = o item não está no formulário do CD (entrega direta ou fora de linha)
      (i.estoqueCd == null ? foraCd : pedido).push(i);
      vistos.add(i.codigoInterno);
    } else if (i.situacao === 'cd_sem') { cdSem.push(i); vistos.add(i.codigoInterno); }
  }
  // Embalagem de compra vem do formulário do CD
  const cods = [...pedido, ...cdSem].map((i) => i.codigoInterno as string);
  const emb = new Map<string, string>();
  for (let k = 0; k < cods.length; k += 300) {
    const { data } = await supabase.from('mix_cd_itens').select('codigo_interno, embalagem').in('codigo_interno', cods.slice(k, k + 300));
    for (const m of data ?? []) emb.set(m.codigo_interno, m.embalagem ?? '');
  }
  const ordena = (a: ItemSalvo, b: ItemSalvo) =>
    (nomeGrupo.get(a.coletaId) ?? '').localeCompare(nomeGrupo.get(b.coletaId) ?? '') || a.produto.localeCompare(b.produto);
  const linha = (i: ItemSalvo) => ({
    Grupo: nomeGrupo.get(i.coletaId) ?? '',
    'Código interno': i.codigoInterno ?? '',
    Produto: i.produto,
    Embalagem: emb.get(i.codigoInterno ?? '') ?? '',
    'Estoque CD': i.estoqueCd ?? '',
    Motivo: i.situacao === 'nunca_veio' ? 'Nunca veio para a loja' : i.situacao === 'cd_sem' ? 'CD sem estoque' : i.estoqueCd == null ? 'Não está no formulário do CD' : 'Ruptura',
  });
  const cols = [{ wch: 24 }, { wch: 13 }, { wch: 44 }, { wch: 11 }, { wch: 11 }, { wch: 22 }];
  const livro = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(pedido.sort(ordena).map(linha));
  ws1['!cols'] = cols;
  XLSX.utils.book_append_sheet(livro, ws1, 'Pedido');
  if (cdSem.length) {
    const ws2 = XLSX.utils.json_to_sheet(cdSem.sort(ordena).map(linha));
    ws2['!cols'] = cols;
    XLSX.utils.book_append_sheet(livro, ws2, 'CD sem estoque');
  }
  if (foraCd.length) {
    const ws3 = XLSX.utils.json_to_sheet(foraCd.sort(ordena).map(linha));
    ws3['!cols'] = cols;
    XLSX.utils.book_append_sheet(livro, ws3, 'Fora do CD');
  }
  const dia = new Date().toISOString().slice(0, 10).split('-').reverse().join('-');
  const titulo = coletas.length === 1 ? coletas[0].grupoNome : `${coletas.length} grupos`;
  await compartilharLivro(livro, `Pedido ruptura ${titulo} ${dia}.xlsx`, 'Enviar lista de pedido');
  return { pedido: pedido.length, cdSem: cdSem.length, foraCd: foraCd.length };
}

async function compartilharLivro(livro: XLSX.WorkBook, nomeArquivo: string, titulo: string): Promise<void> {
  const nome = nomeArquivo.replace(/[\\/:*?"<>|]/g, '');
  if (rodandoNaWeb) {
    XLSX.writeFile(livro, nome, { bookType: 'xlsx' });
    return;
  }
  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');
  const base64 = XLSX.write(livro, { type: 'base64', bookType: 'xlsx' }) as string;
  const caminho = `${FileSystem.cacheDirectory}${nome}`;
  await FileSystem.writeAsStringAsync(caminho, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) throw new Error(`Não consegui abrir a tela de compartilhar. O arquivo ficou em: ${caminho}`);
  await Sharing.shareAsync(caminho, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: titulo,
    UTI: 'com.microsoft.excel.xlsx',
  });
}

// ---------------------------------------------------- tarefa de reposição ----
// "Falta repor" (tem saldo e vende) e "Estoque suspeito" (tem saldo e não
// vende) viram uma tarefa para o setor: abastecer a gôndola com o que está no
// depósito; o que não for achado no depósito é avisado para ajustar o estoque.
export const SITUACOES_TAREFA: Situacao[] = ['repor', 'suspeito'];

export async function criarTarefaReposicao(
  grupoNome: string,
  itens: { codigoInterno: string | null; produto: string; situacao: Situacao; saldo: number | null }[],
  setor: SetorKey,
  criadoPorNome: string,
): Promise<number> {
  const repor = itens.filter((i) => i.situacao === 'repor' && i.codigoInterno);
  const suspeito = itens.filter((i) => i.situacao === 'suspeito' && i.codigoInterno);
  const total = repor.length + suspeito.length;
  if (!total) return 0;
  const linha = (i: { codigoInterno: string | null; produto: string; saldo: number | null }) =>
    `• ${i.codigoInterno} – ${i.produto}${i.saldo != null ? ` (sistema: ${i.saldo})` : ''}`;
  const partes: string[] = [];
  if (repor.length) partes.push(`REPOR NA GÔNDOLA (estão no depósito):\n${repor.map(linha).join('\n')}`);
  if (suspeito.length)
    partes.push(
      `PROCURAR NO DEPÓSITO (sistema mostra saldo, mas não vende há dias):\n${suspeito.map(linha).join('\n')}\n` +
        'Se não encontrar, avise a gerência para ajustar o estoque.',
    );
  partes.push('Ao concluir, tire foto da gôndola abastecida.');
  const hoje = new Date();
  const prazo = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  await criarTarefa({
    titulo: `Repor gôndola: ${grupoNome} (${total} ${total === 1 ? 'item' : 'itens'})`,
    descricao: partes.join('\n\n'),
    setor,
    prazo,
    criadoPorNome,
    prioridade: 'alta',
  });
  return total;
}
