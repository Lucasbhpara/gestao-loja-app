import { supabase } from '../lib/supabase';

export interface ConferenciaItem {
  id: string;
  conferenciaId: string;
  codigoInterno: string | null;
  produto: string;
  quantidadeEsperada: number;
  quantidadeReal: number | null;
  status: 'pendente' | 'ok' | 'divergencia' | 'ruptura' | 'falta_explosivo';
  fotoUrl: string | null;
  conferidoEm: string | null;
}

export interface Conferencia {
  id: string;
  titulo: string;
  setor: string;
  // 'nf' = conferência de nota fiscal (padrão, sempre existiu). 'jornal' =
  // checklist do Jornal de Aniversário — usa OK/Ruptura/Falta Explosivo em
  // vez de OK/Divergência e pode ser reiniciada pela própria pessoa.
  tipo: 'nf' | 'jornal';
  status: 'pendente' | 'concluida';
  criadaPorNome: string;
  conferidaPorNome: string | null;
  criadoEm: string;
  concluidaEm: string | null;
  notaFiscalUrl: string | null;
}

function linhaParaConferencia(l: any): Conferencia {
  return {
    id: l.id,
    titulo: l.titulo,
    setor: l.setor,
    tipo: l.tipo === 'jornal' ? 'jornal' : 'nf',
    status: l.status,
    criadaPorNome: l.criada_por_nome,
    conferidaPorNome: l.conferida_por_nome,
    criadoEm: l.criado_em,
    concluidaEm: l.concluida_em,
    notaFiscalUrl: l.nota_fiscal_url ?? null,
  };
}

function linhaParaItem(l: any): ConferenciaItem {
  return {
    id: l.id,
    conferenciaId: l.conferencia_id,
    codigoInterno: l.codigo_interno,
    produto: l.produto,
    quantidadeEsperada: Number(l.quantidade_esperada),
    quantidadeReal: l.quantidade_real === null ? null : Number(l.quantidade_real),
    status: l.status,
    fotoUrl: l.foto_url,
    conferidoEm: l.conferido_em,
  };
}

// Cria uma conferência nova com os itens da nota fiscal, direto pelo app —
// antes só dava pra criar mandando a NF no chat pra alguém gerar o script
// SQL; agora o próprio encarregado (ou administrador) lança na hora.
export async function criarConferencia(dados: {
  titulo: string;
  setor: string;
  criadaPorNome: string;
  notaFiscalUrl: string | null;
  itens: { codigoInterno: string | null; produto: string; quantidadeEsperada: number }[];
  // 'nf' (padrão, se não informado) ou 'jornal' — ver comentário no tipo
  // Conferencia acima. A "Conferência Folheto de Oferta" usa 'jornal' pra
  // ganhar os botões OK/Ruptura/Falta Explosivo e poder ser reiniciada.
  tipo?: 'nf' | 'jornal';
}): Promise<Conferencia> {
  const { data: conf, error } = await supabase
    .from('conferencias')
    .insert({
      titulo: dados.titulo,
      setor: dados.setor,
      criada_por_nome: dados.criadaPorNome,
      nota_fiscal_url: dados.notaFiscalUrl,
      tipo: dados.tipo ?? 'nf',
    })
    .select()
    .single();
  if (error) throw error;

  if (dados.itens.length > 0) {
    const { error: erroItens } = await supabase.from('conferencia_itens').insert(
      dados.itens.map((item) => ({
        conferencia_id: conf.id,
        codigo_interno: item.codigoInterno,
        produto: item.produto,
        quantidade_esperada: item.quantidadeEsperada,
      }))
    );
    if (erroItens) throw erroItens;
  }

  return linhaParaConferencia(conf);
}

export async function buscarConferencias(setor: string): Promise<Conferencia[]> {
  const { data, error } = await supabase
    .from('conferencias')
    .select('*')
    .eq('setor', setor)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaConferencia);
}

// Administrador vê de todos os setores.
export async function buscarTodasConferencias(): Promise<Conferencia[]> {
  const { data, error } = await supabase.from('conferencias').select('*').order('criado_em', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaConferencia);
}

export async function buscarItensDaConferencia(conferenciaId: string): Promise<ConferenciaItem[]> {
  const { data, error } = await supabase
    .from('conferencia_itens')
    .select('*')
    .eq('conferencia_id', conferenciaId)
    .order('produto', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(linhaParaItem);
}

// Quando está tudo certo, a quantidade real é igual à esperada — o item já
// chega com esse valor (buscarItensDaConferencia), então é só reenviar.
export async function marcarItemOk(itemId: string, quantidadeEsperada: number): Promise<void> {
  const { error } = await supabase
    .from('conferencia_itens')
    .update({ status: 'ok', quantidade_real: quantidadeEsperada, conferido_em: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw error;
}

export async function marcarItemDivergencia(dados: {
  itemId: string;
  quantidadeReal: number;
  fotoUrl: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('conferencia_itens')
    .update({
      status: 'divergencia',
      quantidade_real: dados.quantidadeReal,
      foto_url: dados.fotoUrl,
      conferido_em: new Date().toISOString(),
    })
    .eq('id', dados.itemId);
  if (error) throw error;
}

// Só pro tipo "jornal" (checklist do Jornal de Aniversário): igual ao OK,
// mas marca "Ruptura" (produto em falta na loja) num toque só — sem
// quantidade nem foto, porque esses itens não têm nota fiscal.
export async function marcarItemRuptura(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('conferencia_itens')
    .update({ status: 'ruptura', conferido_em: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw error;
}

// Idem, mas "Falta Explosivo" (sem a etiqueta/cartaz de preço promocional no
// produto).
export async function marcarItemFaltaExplosivo(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('conferencia_itens')
    .update({ status: 'falta_explosivo', conferido_em: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw error;
}

// Salva a foto da nota fiscal (NF) que veio com a entrega, junto da
// conferência inteira (diferente das fotos de divergência, que são por
// item). Usa o mesmo bucket "conferencias-fotos".
export async function anexarNotaFiscal(conferenciaId: string, notaFiscalUrl: string): Promise<void> {
  const { error } = await supabase
    .from('conferencias')
    .update({ nota_fiscal_url: notaFiscalUrl })
    .eq('id', conferenciaId);
  if (error) throw error;
}

export async function concluirConferencia(conferenciaId: string, conferidaPorNome: string): Promise<void> {
  const { error } = await supabase
    .from('conferencias')
    .update({ status: 'concluida', conferida_por_nome: conferidaPorNome, concluida_em: new Date().toISOString() })
    .eq('id', conferenciaId);
  if (error) throw error;
}

// "Recriar conferência": em vez de gerar uma conferência nova (o que
// espalharia o histórico do Jornal em vários registros), reaproveita a
// mesma e zera o progresso — todo item volta pra "pendente" e a conferência
// volta a ficar disponível pra conferir de novo. Pensado pro tipo "jornal",
// onde a pessoa que confere pode precisar refazer sempre que for solicitado.
export async function reiniciarConferencia(conferenciaId: string): Promise<void> {
  const { error: erroItens } = await supabase
    .from('conferencia_itens')
    .update({ status: 'pendente', quantidade_real: null, foto_url: null, conferido_em: null })
    .eq('conferencia_id', conferenciaId);
  if (erroItens) throw erroItens;

  const { error } = await supabase
    .from('conferencias')
    .update({ status: 'pendente', conferida_por_nome: null, concluida_em: null })
    .eq('id', conferenciaId);
  if (error) throw error;
}

// Mesmo esquema de upload usado no Mural de Avisos, no bucket
// "conferencias-fotos".
export async function enviarFotoConferencia(uriLocal: string): Promise<string> {
  const resposta = await fetch(uriLocal);
  const arrayBuffer = await resposta.arrayBuffer();
  const nomeArquivo = `${Date.now()}_${Math.round(Math.random() * 1_000_000)}.jpg`;
  const { error } = await supabase.storage.from('conferencias-fotos').upload(nomeArquivo, arrayBuffer, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('conferencias-fotos').getPublicUrl(nomeArquivo);
  return data.publicUrl;
}
