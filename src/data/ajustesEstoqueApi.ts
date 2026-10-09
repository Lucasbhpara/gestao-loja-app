import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { rodandoNaWeb } from '../lib/plataforma';

// =============================================================================
// Ajustes de estoque (a partir do Giro de Produtos).
//
// Quem olha um produto sem giro conta o que existe de verdade e registra a
// quantidade. O ajuste fica "pendente" até ser exportado em Excel para a
// diretoria avaliar — aí vira "enviado". Tabela: ajustes_estoque
// (supabase/schema_ajustes_estoque.sql). O mesmo Excel é gerado no Portal.
// =============================================================================

export const MOTIVOS_AJUSTE = [
  'Contagem física',
  'Vendido por outro código (pai/filho)',
  'Avaria/perda não lançada',
  'Entrada (nota) errada',
  'Embalagem/unidade errada',
  'Outro',
] as const;

export interface AjusteEstoque {
  id: string;
  codigoProduto: string;
  produto: string;
  setor: string | null;
  subcategoria: string | null;
  estoqueSistema: number;
  quantidadeContada: number;
  custo: number | null;
  motivo: string | null;
  observacao: string | null;
  status: 'pendente' | 'enviado';
  lote: string | null;
  criadoPor: string | null;
  criadoEm: string;
}

function linhaParaAjuste(l: any): AjusteEstoque {
  return {
    id: l.id,
    codigoProduto: l.codigo_produto,
    produto: l.produto,
    setor: l.setor ?? null,
    subcategoria: l.subcategoria ?? null,
    estoqueSistema: Number(l.estoque_sistema ?? 0),
    quantidadeContada: Number(l.quantidade_contada ?? 0),
    custo: l.custo != null ? Number(l.custo) : null,
    motivo: l.motivo ?? null,
    observacao: l.observacao ?? null,
    status: l.status,
    lote: l.lote ?? null,
    criadoPor: l.criado_por ?? null,
    criadoEm: l.criado_em,
  };
}

export const diferencaAjuste = (a: Pick<AjusteEstoque, 'estoqueSistema' | 'quantidadeContada'>) =>
  a.quantidadeContada - a.estoqueSistema;
export const valorAjuste = (a: AjusteEstoque) => diferencaAjuste(a) * (a.custo ?? 0);

export async function buscarAjustesPendentes(): Promise<AjusteEstoque[]> {
  const { data, error } = await supabase
    .from('ajustes_estoque')
    .select('*')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaAjuste);
}

// Um ajuste pendente por produto: se já existe, atualiza; senão, cria.
export async function salvarAjuste(dados: {
  codigoProduto: string;
  produto: string;
  setor: string | null;
  subcategoria: string | null;
  estoqueSistema: number;
  quantidadeContada: number;
  custo: number | null;
  motivo: string | null;
  observacao: string | null;
  por: string;
}): Promise<void> {
  const linha = {
    codigo_produto: dados.codigoProduto,
    produto: dados.produto,
    setor: dados.setor,
    subcategoria: dados.subcategoria,
    estoque_sistema: dados.estoqueSistema,
    quantidade_contada: dados.quantidadeContada,
    custo: dados.custo,
    motivo: dados.motivo,
    observacao: dados.observacao,
    criado_por: dados.por,
    atualizado_em: new Date().toISOString(),
  };
  const { data: existente, error: e1 } = await supabase
    .from('ajustes_estoque')
    .select('id')
    .eq('codigo_produto', dados.codigoProduto)
    .eq('status', 'pendente')
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;
  const { error } = existente
    ? await supabase.from('ajustes_estoque').update(linha).eq('id', existente.id)
    : await supabase.from('ajustes_estoque').insert(linha);
  if (error) throw error;
}

export async function excluirAjuste(id: string): Promise<void> {
  const { error } = await supabase.from('ajustes_estoque').delete().eq('id', id);
  if (error) throw error;
}

export async function marcarAjustesEnviados(ids: string[]): Promise<void> {
  const agora = new Date();
  const lote = agora.toLocaleDateString('pt-BR');
  const { error } = await supabase
    .from('ajustes_estoque')
    .update({ status: 'enviado', lote, enviado_em: agora.toISOString() })
    .in('id', ids);
  if (error) throw error;
}

// --- Excel para a diretoria --------------------------------------------------

export function montarLivroAjustes(ajustes: AjusteEstoque[], responsavel: string): XLSX.WorkBook {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const cab = [
    'Data', 'Código', 'Produto', 'Setor', 'Subcategoria', 'Estoque no sistema', 'Quantidade contada',
    'Diferença (contado − sistema)', 'Custo unitário (R$)', 'Valor da diferença (R$)', 'Motivo', 'Observação', 'Responsável',
  ];
  const linhas: any[][] = [cab];
  ajustes.forEach((a, i) => {
    const r = i + 2;
    linhas.push([
      new Date(a.criadoEm).toLocaleDateString('pt-BR'),
      a.codigoProduto,
      a.produto,
      a.setor ?? '',
      a.subcategoria ?? '',
      a.estoqueSistema,
      a.quantidadeContada,
      { f: `G${r}-F${r}`, t: 'n' },
      a.custo ?? 0,
      { f: `H${r}*I${r}`, t: 'n' },
      a.motivo ?? '',
      a.observacao ?? '',
      a.criadoPor ?? '',
    ]);
  });
  const ult = ajustes.length + 1;
  linhas.push([]);
  linhas.push(['', '', 'TOTAL', '', '', '', '', '', '', { f: `SUM(J2:J${ult})`, t: 'n' }]);
  linhas.push(['', '', 'Sobra (diferença positiva)', '', '', '', '', '', '', { f: `SUMIF(J2:J${ult},">0")`, t: 'n' }]);
  linhas.push(['', '', 'Falta (diferença negativa)', '', '', '', '', '', '', { f: `SUMIF(J2:J${ult},"<0")`, t: 'n' }]);
  const aba = XLSX.utils.aoa_to_sheet(linhas);
  aba['!cols'] = [10, 9, 42, 22, 26, 14, 14, 16, 14, 18, 30, 36, 18].map((wch) => ({ wch }));
  aba['!autofilter'] = { ref: `A1:M${ult}` };

  // Resumo por setor
  const setores = [...new Set(ajustes.map((a) => a.setor ?? '(sem setor)'))].sort();
  const res: any[][] = [
    ['Ajuste de estoque — Loja 327'],
    [`Gerado em ${hoje} por ${responsavel}`],
    [],
    ['Setor', 'Itens', 'Valor da diferença (R$)', 'Sobra (R$)', 'Falta (R$)'],
  ];
  setores.forEach((s, i) => {
    const r = i + 5;
    res.push([
      s,
      { f: `COUNTIF(Ajustes!D2:D${ult},A${r})`, t: 'n' },
      { f: `SUMIF(Ajustes!D2:D${ult},A${r},Ajustes!J2:J${ult})`, t: 'n' },
      { f: `SUMIFS(Ajustes!J2:J${ult},Ajustes!D2:D${ult},A${r},Ajustes!J2:J${ult},">0")`, t: 'n' },
      { f: `SUMIFS(Ajustes!J2:J${ult},Ajustes!D2:D${ult},A${r},Ajustes!J2:J${ult},"<0")`, t: 'n' },
    ]);
  });
  const fimR = setores.length + 4;
  res.push([
    'TOTAL',
    { f: `SUM(B5:B${fimR})`, t: 'n' },
    { f: `SUM(C5:C${fimR})`, t: 'n' },
    { f: `SUM(D5:D${fimR})`, t: 'n' },
    { f: `SUM(E5:E${fimR})`, t: 'n' },
  ]);
  const abaRes = XLSX.utils.aoa_to_sheet(res);
  abaRes['!cols'] = [30, 8, 22, 16, 16].map((wch) => ({ wch }));
  // Para o setor sem nome bater com o COUNTIF, as linhas sem setor recebem o mesmo rótulo.
  ajustes.forEach((a, i) => {
    if (!a.setor) aba[`D${i + 2}`] = { t: 's', v: '(sem setor)' };
  });

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, abaRes, 'Resumo');
  XLSX.utils.book_append_sheet(livro, aba, 'Ajustes');
  return livro;
}

export async function compartilharAjustesXlsx(ajustes: AjusteEstoque[], responsavel: string): Promise<void> {
  const livro = montarLivroAjustes(ajustes, responsavel);
  const data = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  const nome = `ajuste-estoque-loja327-${data}.xlsx`;
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
    dialogTitle: 'Enviar ajuste de estoque',
    UTI: 'com.microsoft.excel.xlsx',
  });
}
