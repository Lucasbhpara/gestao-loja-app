import AsyncStorage from '@react-native-async-storage/async-storage';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { rodandoNaWeb } from '../lib/plataforma';

// =============================================================================
// Pesquisa de preço (concorrentes) — só administradores.
//
// No concorrente: escolhe o concorrente, bipa o código de barras (o app acha
// o produto no Estoque Loja) ou digita o nome e escolhe um similar, e anota o
// preço dele. O preço da loja vem do Estoque Loja, ninguém digita.
// Tudo fica salvo no celular enquanto a pesquisa está aberta (funciona sem
// internet); ao finalizar, sobe pro banco e gera a planilha pronta pra mandar
// por e-mail. Tabelas: concorrentes, pesquisas_preco, pesquisa_preco_itens
// (supabase/pesquisa_preco.sql).
// =============================================================================

export interface Concorrente {
  id: string;
  nome: string;
  cidade: string | null;
}

export interface ProdutoLoja {
  codigoInterno: string;
  codigoBarras: string | null;
  produto: string;
  precoVenda: number | null;
  setor: string | null;
}

export interface ItemPesquisa {
  id: string;
  produtoConcorrente: string;
  codigoBarras: string | null;
  precoConcorrente: number;
  codigoInterno: string | null;
  produtoLoja: string | null;
  precoLoja: number | null;
  setor: string | null;
  similar: boolean;
  fotoLocal: string | null;
  fotoUrl: string | null;
  observacao: string | null;
  criadoEm: string;
}

export interface PesquisaLocal {
  id: string;
  concorrenteId: string | null;
  concorrenteNome: string;
  feitaPorNome: string;
  iniciadaEm: string;
  lat: number | null;
  lng: number | null;
  itens: ItemPesquisa[];
  finalizada: boolean; // finalizada no celular, esperando internet pra subir
}

export interface PesquisaEnviada {
  id: string;
  concorrenteNome: string;
  feitaPorNome: string | null;
  iniciadaEm: string;
  enviadaEm: string;
  totalItens: number;
}

const CHAVE_ATUAL = '@ulva/pesquisa-preco-atual';
const CHAVE_PENDENTES = '@ulva/pesquisa-preco-pendentes';
const CHAVE_CATALOGO = '@ulva/pesquisa-preco-catalogo';

export function gerarId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// --- concorrentes -------------------------------------------------------------

export async function buscarConcorrentes(): Promise<Concorrente[]> {
  const { data, error } = await supabase.from('concorrentes').select('id, nome, cidade').eq('ativo', true).order('nome');
  if (error) throw error;
  return (data ?? []) as Concorrente[];
}

export async function criarConcorrente(nome: string, cidade: string | null): Promise<Concorrente> {
  const { data, error } = await supabase.from('concorrentes').insert({ nome: nome.trim(), cidade: cidade?.trim() || null }).select('id, nome, cidade').single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error('Esse concorrente já está cadastrado.');
    throw error;
  }
  return data as Concorrente;
}

// --- catálogo da loja (cópia no celular, pra funcionar sem internet) -----------

let catalogoMemoria: { produtos: ProdutoLoja[]; baixadoEm: string } | null = null;

export async function carregarCatalogoGuardado(): Promise<{ produtos: ProdutoLoja[]; baixadoEm: string } | null> {
  if (catalogoMemoria) return catalogoMemoria;
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_CATALOGO);
    if (bruto) catalogoMemoria = JSON.parse(bruto);
  } catch {
    catalogoMemoria = null;
  }
  return catalogoMemoria;
}

async function buscarTudo<T>(tabela: string, colunas: string): Promise<T[]> {
  const todos: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from(tabela).select(colunas).range(de, de + 999);
    if (error) throw error;
    todos.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return todos;
}

// Baixa o Estoque Loja (código, código de barras, nome, preço) e o setor de
// cada produto. Uns 10 mil itens — leva poucos segundos com internet.
export async function baixarCatalogo(): Promise<{ produtos: ProdutoLoja[]; baixadoEm: string }> {
  const [estoque, classes] = await Promise.all([
    buscarTudo<{ codigo_interno: string; codigo_barras: string | null; produto: string; preco_venda: number | null }>(
      'estoque_loja_itens',
      'codigo_interno, codigo_barras, produto, preco_venda'
    ),
    buscarTudo<{ codigo_produto: string; classe_2_nome: string | null }>('produtos_classes', 'codigo_produto, classe_2_nome'),
  ]);
  const setorPor = new Map(classes.map((c) => [String(c.codigo_produto), c.classe_2_nome]));
  const produtos: ProdutoLoja[] = estoque
    .filter((e) => e.codigo_interno && e.produto)
    .map((e) => ({
      codigoInterno: String(e.codigo_interno),
      codigoBarras: e.codigo_barras ? String(e.codigo_barras) : null,
      produto: e.produto,
      precoVenda: e.preco_venda == null ? null : Number(e.preco_venda),
      setor: setorPor.get(String(e.codigo_interno)) ?? null,
    }));
  catalogoMemoria = { produtos, baixadoEm: new Date().toISOString() };
  AsyncStorage.setItem(CHAVE_CATALOGO, JSON.stringify(catalogoMemoria)).catch(() => {});
  return catalogoMemoria;
}

const somenteDigitos = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');

export function acharPorCodigoBarras(produtos: ProdutoLoja[], codigo: string): ProdutoLoja | null {
  const alvo = somenteDigitos(codigo);
  if (!alvo) return null;
  return (
    produtos.find((p) => p.codigoBarras && somenteDigitos(p.codigoBarras) === alvo) ??
    produtos.find((p) => somenteDigitos(p.codigoInterno) === alvo) ??
    null
  );
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

// Busca por partes do nome em qualquer ordem ("arroz 5kg tio" acha "ARROZ TIO JOAO 5KG").
export function buscarPorNome(produtos: ProdutoLoja[], termo: string, limite = 30): ProdutoLoja[] {
  const partes = normalizar(termo).split(/\s+/).filter(Boolean);
  if (!partes.length) return [];
  const achados: ProdutoLoja[] = [];
  for (const p of produtos) {
    const nome = normalizar(p.produto);
    if (partes.every((x) => nome.includes(x) || p.codigoInterno === x)) {
      achados.push(p);
      if (achados.length >= limite) break;
    }
  }
  return achados;
}

// --- pesquisa em andamento (no celular) ---------------------------------------

export async function carregarPesquisaAtual(): Promise<PesquisaLocal | null> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_ATUAL);
    return bruto ? (JSON.parse(bruto) as PesquisaLocal) : null;
  } catch {
    return null;
  }
}

export async function salvarPesquisaAtual(p: PesquisaLocal | null): Promise<void> {
  if (p) await AsyncStorage.setItem(CHAVE_ATUAL, JSON.stringify(p)).catch(() => {});
  else await AsyncStorage.removeItem(CHAVE_ATUAL).catch(() => {});
}

export async function carregarPendentes(): Promise<PesquisaLocal[]> {
  try {
    const bruto = await AsyncStorage.getItem(CHAVE_PENDENTES);
    return bruto ? (JSON.parse(bruto) as PesquisaLocal[]) : [];
  } catch {
    return [];
  }
}

async function salvarPendentes(lista: PesquisaLocal[]): Promise<void> {
  await AsyncStorage.setItem(CHAVE_PENDENTES, JSON.stringify(lista)).catch(() => {});
}

export async function guardarComoPendente(p: PesquisaLocal): Promise<void> {
  const lista = (await carregarPendentes()).filter((x) => x.id !== p.id);
  lista.push({ ...p, finalizada: true });
  await salvarPendentes(lista);
}

async function enviarFoto(uri: string): Promise<string> {
  const resposta = await fetch(uri);
  const buffer = await resposta.arrayBuffer();
  const nome = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('pesquisa-preco-fotos').upload(nome, buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return supabase.storage.from('pesquisa-preco-fotos').getPublicUrl(nome).data.publicUrl;
}

// Sobe uma pesquisa finalizada (fotos → cabeçalho → itens). Se já tinha
// subido antes (o app fechou no meio), substitui os itens.
export async function enviarPesquisa(p: PesquisaLocal): Promise<void> {
  const itens = [...p.itens];
  for (const it of itens) {
    if (it.fotoLocal && !it.fotoUrl) {
      try {
        it.fotoUrl = await enviarFoto(it.fotoLocal);
      } catch {
        // foto é opcional — segue sem ela
      }
    }
  }
  const { error: e1 } = await supabase.from('pesquisas_preco').upsert({
    id: p.id,
    concorrente_id: p.concorrenteId,
    concorrente_nome: p.concorrenteNome,
    feita_por_nome: p.feitaPorNome,
    iniciada_em: p.iniciadaEm,
    enviada_em: new Date().toISOString(),
    localizacao_lat: p.lat,
    localizacao_lng: p.lng,
    total_itens: itens.length,
  });
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('pesquisa_preco_itens').delete().eq('pesquisa_id', p.id);
  if (e2) throw e2;
  if (itens.length) {
    const { error: e3 } = await supabase.from('pesquisa_preco_itens').insert(
      itens.map((it, i) => ({
        pesquisa_id: p.id,
        ordem: i + 1,
        produto_concorrente: it.produtoConcorrente,
        codigo_barras: it.codigoBarras,
        preco_concorrente: it.precoConcorrente,
        codigo_interno: it.codigoInterno,
        produto_loja: it.produtoLoja,
        preco_loja: it.precoLoja,
        eh_similar: it.similar,
        foto_url: it.fotoUrl,
        observacao: it.observacao,
        criado_em: it.criadoEm,
      }))
    );
    if (e3) throw e3;
  }
  await salvarPendentes((await carregarPendentes()).filter((x) => x.id !== p.id));
}

export async function enviarPendentes(): Promise<{ enviadas: number; faltam: number }> {
  const lista = await carregarPendentes();
  let enviadas = 0;
  for (const p of lista) {
    try {
      await enviarPesquisa(p);
      enviadas += 1;
    } catch {
      // sem internet — fica pra depois
    }
  }
  return { enviadas, faltam: lista.length - enviadas };
}

// --- histórico (banco) ----------------------------------------------------------

export async function buscarPesquisasEnviadas(limite = 30): Promise<PesquisaEnviada[]> {
  const { data, error } = await supabase
    .from('pesquisas_preco')
    .select('id, concorrente_nome, feita_por_nome, iniciada_em, enviada_em, total_itens')
    .order('iniciada_em', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id,
    concorrenteNome: l.concorrente_nome,
    feitaPorNome: l.feita_por_nome,
    iniciadaEm: l.iniciada_em,
    enviadaEm: l.enviada_em,
    totalItens: l.total_itens,
  }));
}

export async function buscarPesquisaCompleta(id: string): Promise<PesquisaLocal> {
  const [{ data: cab, error: e1 }, { data: linhas, error: e2 }] = await Promise.all([
    supabase.from('pesquisas_preco').select('*').eq('id', id).single(),
    supabase.from('pesquisa_preco_itens').select('*').eq('pesquisa_id', id).order('ordem'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const catalogo = await carregarCatalogoGuardado();
  const setorPor = new Map((catalogo?.produtos ?? []).map((p) => [p.codigoInterno, p.setor]));
  return {
    id: cab.id,
    concorrenteId: cab.concorrente_id,
    concorrenteNome: cab.concorrente_nome,
    feitaPorNome: cab.feita_por_nome ?? '',
    iniciadaEm: cab.iniciada_em,
    lat: cab.localizacao_lat,
    lng: cab.localizacao_lng,
    finalizada: true,
    itens: (linhas ?? []).map((l: any) => ({
      id: l.id,
      produtoConcorrente: l.produto_concorrente,
      codigoBarras: l.codigo_barras,
      precoConcorrente: Number(l.preco_concorrente),
      codigoInterno: l.codigo_interno,
      produtoLoja: l.produto_loja,
      precoLoja: l.preco_loja == null ? null : Number(l.preco_loja),
      setor: l.codigo_interno ? setorPor.get(l.codigo_interno) ?? null : null,
      similar: !!l.eh_similar,
      fotoLocal: null,
      fotoUrl: l.foto_url,
      observacao: l.observacao,
      criadoEm: l.criado_em,
    })),
  };
}

export async function excluirPesquisa(id: string): Promise<void> {
  const { error } = await supabase.from('pesquisas_preco').delete().eq('id', id);
  if (error) throw error;
}

// --- comparação e planilha ---------------------------------------------------------

export type Situacao = 'mais_caro' | 'mais_barato' | 'igual' | 'sem_produto';

// Diferença do ponto de vista da LOJA: positivo = a loja está mais cara.
export function comparar(it: ItemPesquisa): { situacao: Situacao; difReais: number | null; difPct: number | null } {
  if (it.precoLoja == null || it.precoLoja <= 0) return { situacao: 'sem_produto', difReais: null, difPct: null };
  const difReais = Math.round((it.precoLoja - it.precoConcorrente) * 100) / 100;
  const difPct = it.precoConcorrente > 0 ? Math.round((difReais / it.precoConcorrente) * 1000) / 10 : null;
  const situacao: Situacao = Math.abs(difReais) < 0.005 ? 'igual' : difReais > 0 ? 'mais_caro' : 'mais_barato';
  return { situacao, difReais, difPct };
}

export const TEXTO_SITUACAO: Record<Situacao, string> = {
  mais_caro: 'Loja mais cara',
  mais_barato: 'Loja mais barata',
  igual: 'Mesmo preço',
  sem_produto: 'Não temos',
};

function dataBR(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

export function resumoPesquisa(itens: ItemPesquisa[]) {
  const comp = itens.map(comparar);
  const conta = (s: Situacao) => comp.filter((c) => c.situacao === s).length;
  const comPreco = itens.filter((it) => it.precoLoja != null && it.precoLoja > 0);
  const somaLoja = comPreco.reduce((s, it) => s + (it.precoLoja ?? 0), 0);
  const somaConc = comPreco.reduce((s, it) => s + it.precoConcorrente, 0);
  return {
    maisCaro: conta('mais_caro'),
    maisBarato: conta('mais_barato'),
    igual: conta('igual'),
    semProduto: conta('sem_produto'),
    // Cesta: soma dos mesmos itens nos dois lados (só onde a loja tem produto).
    cestaLoja: Math.round(somaLoja * 100) / 100,
    cestaConcorrente: Math.round(somaConc * 100) / 100,
    cestaPct: somaConc > 0 ? Math.round(((somaLoja - somaConc) / somaConc) * 1000) / 10 : null,
  };
}

export function montarPlanilha(p: PesquisaLocal): XLSX.WorkBook {
  const r = resumoPesquisa(p.itens);
  const cab = [
    ['Pesquisa de preço — Supermercados BH · Loja 327'],
    ['Concorrente', p.concorrenteNome],
    ['Data', dataBR(p.iniciadaEm)],
    ['Feita por', p.feitaPorNome],
    ['Itens pesquisados', p.itens.length],
    [],
  ];
  const titulos = ['Setor', 'Produto no concorrente', 'Cód. barras', 'Preço concorrente', 'Produto da loja', 'Cód. interno', 'Preço loja', 'Diferença R$ (loja − concorrente)', 'Diferença %', 'Situação', 'Similar', 'Observação'];
  const linhas = [...p.itens]
    .sort((a, b) => (a.setor ?? 'ZZ').localeCompare(b.setor ?? 'ZZ') || a.produtoConcorrente.localeCompare(b.produtoConcorrente))
    .map((it) => {
      const c = comparar(it);
      return [
        it.setor ?? '',
        it.produtoConcorrente,
        it.codigoBarras ?? '',
        it.precoConcorrente,
        it.produtoLoja ?? '',
        it.codigoInterno ?? '',
        it.precoLoja ?? '',
        c.difReais ?? '',
        c.difPct == null ? '' : c.difPct / 100,
        TEXTO_SITUACAO[c.situacao],
        it.similar ? 'Sim' : 'Não',
        it.observacao ?? '',
      ];
    });
  const aba = XLSX.utils.aoa_to_sheet([...cab, titulos, ...linhas]);
  aba['!cols'] = [14, 34, 15, 12, 34, 11, 11, 14, 11, 16, 8, 24].map((w) => ({ wch: w }));
  const primeira = cab.length + 1;
  for (let i = 0; i < linhas.length; i++) {
    const n = primeira + i + 1;
    for (const col of ['D', 'G', 'H']) if (aba[`${col}${n}`] && typeof aba[`${col}${n}`].v === 'number') aba[`${col}${n}`].z = 'R$ #,##0.00';
    if (aba[`I${n}`] && typeof aba[`I${n}`].v === 'number') aba[`I${n}`].z = '0.0%';
  }

  const res = [
    ['Resumo da pesquisa'],
    ['Concorrente', p.concorrenteNome],
    ['Data', dataBR(p.iniciadaEm)],
    [],
    ['Loja mais cara', r.maisCaro],
    ['Loja mais barata', r.maisBarato],
    ['Mesmo preço', r.igual],
    ['Não temos o produto', r.semProduto],
    [],
    ['Cesta (itens que temos) — loja', r.cestaLoja],
    ['Cesta (itens que temos) — concorrente', r.cestaConcorrente],
    ['Diferença da cesta', r.cestaPct == null ? '' : r.cestaPct / 100],
  ];
  const abaRes = XLSX.utils.aoa_to_sheet(res);
  abaRes['!cols'] = [{ wch: 38 }, { wch: 22 }];
  for (const c of ['B10', 'B11']) if (abaRes[c]) abaRes[c].z = 'R$ #,##0.00';
  if (abaRes.B12 && typeof abaRes.B12.v === 'number') abaRes.B12.z = '0.0%';

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, abaRes, 'Resumo');
  XLSX.utils.book_append_sheet(livro, aba, 'Pesquisa');
  return livro;
}

export function nomeArquivoPesquisa(p: PesquisaLocal): string {
  const conc = normalizar(p.concorrenteNome).replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `pesquisa-preco-${conc || 'concorrente'}-${dataBR(p.iniciadaEm).replace(/\//g, '-')}.xlsx`;
}

export async function compartilharPlanilha(p: PesquisaLocal): Promise<void> {
  const livro = montarPlanilha(p);
  const nome = nomeArquivoPesquisa(p);
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
    dialogTitle: 'Enviar pesquisa de preço',
    UTI: 'com.microsoft.excel.xlsx',
  });
}
