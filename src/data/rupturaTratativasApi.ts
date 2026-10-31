import { supabase } from '../lib/supabase';
import { SetorKey } from './employees';
import { concluirTarefa, criarTarefa } from './tarefasApi';
import { salvarAjuste } from './ajustesEstoqueApi';
import { ResultadoItem, Situacao, marcarDescontinuado } from './rupturaApi';

// =============================================================================
// Tratativas da Ruptura.
//
// Cada produto que sai de uma coleta com problema vira uma tratativa e só
// fecha quando o problema foi resolvido:
//   ruptura / nunca_veio → gerência marca "Pedido feito"; fecha sozinha quando
//                          o produto volta a ter saldo no Estoque Loja.
//   cd_sem               → "Cobrado o comprador"; quando o CD volta a ter
//                          estoque ela vira "ruptura" (pode pedir).
//   repor / suspeito     → vai para o encarregado (tarefa) com os botões
//                          "Na área de venda" (foto) / "Não achei" e volta
//                          para a gerência validar (aprovar, devolver ou
//                          ajustar estoque).
//   parado               → encarregado resolve (sem preço, mal exposto,
//                          validade) com foto; gerência valida.
// Status: aberta → encarregado → validacao → resolvida.
// Tabela: supabase/ruptura_tratativas.sql.
// =============================================================================

export type StatusTratativa = 'aberta' | 'encarregado' | 'validacao' | 'resolvida';

export type AcaoTratativa =
  | 'pedido_feito' | 'cobrado' | 'descontinuado'
  | 'enviado' | 'na_area' | 'nao_achei' | 'nao_resolvido'
  | 'aprovado' | 'devolvido' | 'ajustado' | 'resolvido_manual'
  | 'auto_estoque' | 'auto_cd'
  | 'sem_preco' | 'mal_exposto' | 'validade';

export const ROTULO_ACAO: Record<AcaoTratativa, string> = {
  pedido_feito: 'Pedido feito',
  cobrado: 'Comprador cobrado',
  descontinuado: 'Descontinuado',
  enviado: 'Enviado ao encarregado',
  na_area: 'Na área de venda',
  nao_achei: 'Não achei',
  nao_resolvido: 'Não consegui resolver',
  aprovado: 'Aprovado',
  devolvido: 'Devolvido ao encarregado',
  ajustado: 'Estoque ajustado',
  resolvido_manual: 'Resolvido pela gerência',
  auto_estoque: 'Chegou: voltou a ter estoque na loja',
  auto_cd: 'O CD voltou a ter estoque',
  sem_preco: 'Colocar preço',
  mal_exposto: 'Melhorar exposição',
  validade: 'Conferir validade',
};

// O que o encarregado precisa fazer, por tipo de envio.
export const PEDIDO_ENCARREGADO: Partial<Record<AcaoTratativa | Situacao, string>> = {
  repor: 'Levar do depósito para a gôndola',
  suspeito: 'Procurar no depósito e abastecer',
  sem_preco: 'Colocar a etiqueta de preço',
  mal_exposto: 'Organizar a exposição na gôndola',
  validade: 'Conferir a validade e retirar o vencido',
};

export interface RegistroHistorico {
  em: string;
  por: string;
  acao: AcaoTratativa;
  obs?: string | null;
  foto?: string | null;
}

export interface Tratativa {
  id: string;
  codigoInterno: string;
  produto: string;
  grupoId: string | null;
  grupoNome: string | null;
  setor: string | null;
  situacao: Situacao;
  status: StatusTratativa;
  acao: AcaoTratativa | null;
  setorTarefa: string | null;
  tarefaId: string | null;
  fotoUrl: string | null;
  obs: string | null;
  saldo: number | null;
  estoqueCd: number | null;
  abertaEm: string;
  atualizadaEm: string;
  respondidaPor: string | null;
  resolvidaEm: string | null;
  historico: RegistroHistorico[];
}

const SITUACOES_TRATATIVA: Situacao[] = ['ruptura', 'nunca_veio', 'cd_sem', 'repor', 'suspeito', 'parado'];

function mapa(l: any): Tratativa {
  return {
    id: l.id,
    codigoInterno: l.codigo_interno,
    produto: l.produto ?? '',
    grupoId: l.grupo_id,
    grupoNome: l.grupo_nome,
    setor: l.setor,
    situacao: l.situacao,
    status: l.status,
    acao: l.acao,
    setorTarefa: l.setor_tarefa,
    tarefaId: l.tarefa_id,
    fotoUrl: l.foto_url,
    obs: l.obs,
    saldo: l.saldo == null ? null : Number(l.saldo),
    estoqueCd: l.estoque_cd == null ? null : Number(l.estoque_cd),
    abertaEm: l.aberta_em,
    atualizadaEm: l.atualizada_em,
    respondidaPor: l.respondida_por,
    resolvidaEm: l.resolvida_em,
    historico: l.historico ?? [],
  };
}

const agora = () => new Date().toISOString();
const reg = (por: string, acao: AcaoTratativa, obs?: string | null, foto?: string | null): RegistroHistorico => ({ em: agora(), por, acao, obs: obs ?? null, foto: foto ?? null });

async function atualizar(t: Tratativa, campos: Record<string, any>, registro: RegistroHistorico): Promise<void> {
  const { error } = await supabase
    .from('ruptura_tratativas')
    .update({ ...campos, atualizada_em: agora(), historico: [...t.historico, registro] })
    .eq('id', t.id);
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------------- abertura ----

// Chamado ao salvar uma coleta: abre (ou atualiza) uma tratativa para cada
// produto com problema. Produto que apareceu OK na coleta fecha a tratativa
// aberta dele (estava na gôndola).
export async function abrirTratativasDaColeta(
  coleta: { id: string; grupoId: string; grupoNome: string; setor: string },
  resultado: ResultadoItem[],
  por: string,
): Promise<{ abertas: number; fechadas: number }> {
  const comCodigo = resultado.filter((r) => r.codigoInterno);
  const cods = comCodigo.map((r) => r.codigoInterno as string);
  const existentes = new Map<string, Tratativa>();
  for (let i = 0; i < cods.length; i += 300) {
    const { data, error } = await supabase
      .from('ruptura_tratativas')
      .select('*')
      .in('codigo_interno', cods.slice(i, i + 300))
      .neq('status', 'resolvida');
    if (error) throw new Error(error.message);
    for (const l of data ?? []) existentes.set(l.codigo_interno, mapa(l));
  }
  let abertas = 0;
  let fechadas = 0;
  const novas: any[] = [];
  for (const r of comCodigo) {
    const t = existentes.get(r.codigoInterno as string);
    if (r.situacao === 'ok') {
      // Estava na gôndola: o que estava aberto para ele se resolveu.
      if (t && ['ruptura', 'nunca_veio', 'cd_sem', 'repor', 'suspeito'].includes(t.situacao)) {
        await atualizar(t, { status: 'resolvida', acao: 'na_area', resolvida_em: agora(), resolvida_por: por, saldo: r.saldo }, reg(por, 'na_area', 'Encontrado na gôndola em nova coleta'));
        fechadas++;
      }
      continue;
    }
    if (!SITUACOES_TRATATIVA.includes(r.situacao)) continue;
    if (t) {
      // Já tem tratativa aberta: só atualiza a situação se ela ainda não foi para o encarregado.
      if (t.status === 'aberta' && t.situacao !== r.situacao) {
        await atualizar(t, { situacao: r.situacao, saldo: r.saldo, estoque_cd: r.estoqueCd, coleta_id: coleta.id }, reg(por, 'resolvido_manual', `Nova coleta: ${r.situacao}`));
      }
      continue;
    }
    novas.push({
      codigo_interno: r.codigoInterno,
      produto: r.produto,
      grupo_id: coleta.grupoId,
      grupo_nome: coleta.grupoNome,
      setor: coleta.setor,
      situacao: r.situacao,
      saldo: r.saldo,
      estoque_cd: r.estoqueCd,
      coleta_id: coleta.id,
      aberta_por: por,
    });
  }
  for (let i = 0; i < novas.length; i += 300) {
    const { error } = await supabase.from('ruptura_tratativas').insert(novas.slice(i, i + 300));
    if (error) throw new Error(error.message);
  }
  abertas = novas.length;
  return { abertas, fechadas };
}

// --------------------------------------------------------------- leitura ----

export async function buscarTratativas(filtro: { status?: StatusTratativa[]; setorTarefa?: string; resolvidasDias?: number }): Promise<Tratativa[]> {
  let q = supabase.from('ruptura_tratativas').select('*').order('aberta_em', { ascending: true }).limit(2000);
  if (filtro.status) q = q.in('status', filtro.status);
  if (filtro.setorTarefa) q = q.eq('setor_tarefa', filtro.setorTarefa);
  if (filtro.resolvidasDias) q = q.gte('resolvida_em', new Date(Date.now() - filtro.resolvidasDias * 86400000).toISOString());
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapa);
}

export async function contarPendentesEncarregado(setor: string): Promise<number> {
  const { count } = await supabase
    .from('ruptura_tratativas')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'encarregado')
    .eq('setor_tarefa', setor);
  return count ?? 0;
}

// ----------------------------------------------------- fechamento automático ----
// Usa o último Estoque Loja e o último formulário do CD.
export async function verificarAutomatico(por = 'Automático'): Promise<{ chegaram: number; cdVoltou: number }> {
  const abertas = await buscarTratativas({ status: ['aberta'] });
  const alvo = abertas.filter((t) => ['ruptura', 'nunca_veio', 'cd_sem'].includes(t.situacao));
  if (!alvo.length) return { chegaram: 0, cdVoltou: 0 };
  const cods = [...new Set(alvo.map((t) => t.codigoInterno))];
  const saldo = new Map<string, { q: number; em: string }>();
  const cd = new Map<string, number>();
  for (let i = 0; i < cods.length; i += 300) {
    const parte = cods.slice(i, i + 300);
    const [{ data: e }, { data: m }] = await Promise.all([
      supabase.from('estoque_loja_itens').select('codigo_interno, quantidade, atualizado_em').in('codigo_interno', parte),
      supabase.from('mix_cd_itens').select('codigo_interno, estoque_cd, no_formulario').in('codigo_interno', parte),
    ]);
    for (const l of e ?? []) {
      const atual = saldo.get(String(l.codigo_interno));
      if (!atual || l.atualizado_em > atual.em) saldo.set(String(l.codigo_interno), { q: Number(l.quantidade) || 0, em: l.atualizado_em });
    }
    for (const l of m ?? []) if (l.no_formulario) cd.set(l.codigo_interno, Number(l.estoque_cd) || 0);
  }
  let chegaram = 0;
  let cdVoltou = 0;
  for (const t of alvo) {
    const s = saldo.get(t.codigoInterno);
    // Só conta estoque que foi atualizado depois que a tratativa abriu.
    if (s && s.q > 0 && s.em > t.abertaEm && t.situacao !== 'cd_sem') {
      await atualizar(t, { status: 'resolvida', acao: 'auto_estoque', resolvida_em: agora(), resolvida_por: por, saldo: s.q }, reg(por, 'auto_estoque', `Saldo na loja: ${s.q}`));
      chegaram++;
    } else if (t.situacao === 'cd_sem' && (cd.get(t.codigoInterno) ?? 0) > 0) {
      await atualizar(t, { situacao: 'ruptura', acao: 'auto_cd', estoque_cd: cd.get(t.codigoInterno) }, reg(por, 'auto_cd', `Estoque no CD: ${cd.get(t.codigoInterno)}`));
      cdVoltou++;
    }
  }
  return { chegaram, cdVoltou };
}

// --------------------------------------------------------- ações gerência ----

export async function marcarAcaoGerencia(t: Tratativa, acao: 'pedido_feito' | 'cobrado', por: string): Promise<void> {
  await atualizar(t, { acao }, reg(por, acao));
}

export async function resolverManual(t: Tratativa, por: string, obs?: string): Promise<void> {
  await atualizar(t, { status: 'resolvida', acao: 'resolvido_manual', resolvida_em: agora(), resolvida_por: por }, reg(por, 'resolvido_manual', obs));
}

export async function descontinuar(t: Tratativa, motivo: string, por: string): Promise<void> {
  await marcarDescontinuado(t.codigoInterno, t.produto, motivo, por);
  await atualizar(t, { status: 'resolvida', acao: 'descontinuado', resolvida_em: agora(), resolvida_por: por }, reg(por, 'descontinuado', motivo));
}

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Manda um lote de tratativas para o encarregado: cria UMA tarefa no setor
// (aviso e prazo) e coloca as tratativas no status "encarregado".
export async function enviarAoEncarregado(
  lista: Tratativa[],
  setor: SetorKey,
  pedido: AcaoTratativa | null,
  por: string,
): Promise<void> {
  if (!lista.length) return;
  const grupos = [...new Set(lista.map((t) => t.grupoNome).filter(Boolean))];
  const titulo = `Ruptura: ${lista.length} ${lista.length === 1 ? 'produto' : 'produtos'}${grupos.length === 1 ? ` · ${grupos[0]}` : ''}`;
  const linhas = lista.map((t) => {
    const oque = (pedido && PEDIDO_ENCARREGADO[pedido]) || PEDIDO_ENCARREGADO[t.situacao] || '';
    return `• ${t.codigoInterno} – ${t.produto}${oque ? ` → ${oque}` : ''}`;
  });
  const tarefa = await criarTarefa({
    titulo,
    descricao:
      `${linhas.join('\n')}\n\nResponda item por item no app: Estoque › Ruptura (tratativas). ` +
      'Para cada produto, toque em “Na área de venda” (com foto) ou “Não achei”. A tarefa fecha sozinha quando todos forem respondidos.',
    setor,
    prazo: hojeISO(),
    criadoPorNome: por,
    prioridade: 'alta',
  });
  for (const t of lista) {
    await atualizar(
      t,
      { status: 'encarregado', setor_tarefa: setor, tarefa_id: tarefa.id, acao: pedido ?? 'enviado', foto_url: null, obs: null },
      reg(por, pedido ?? 'enviado', `Setor: ${setor}`),
    );
  }
}

export async function validar(t: Tratativa, decisao: 'aprovado' | 'devolvido', por: string, obs?: string): Promise<void> {
  if (decisao === 'aprovado') {
    await atualizar(t, { status: 'resolvida', acao: 'aprovado', resolvida_em: agora(), resolvida_por: por }, reg(por, 'aprovado', obs));
  } else {
    await atualizar(t, { status: 'encarregado', acao: 'devolvido', obs: obs ?? null }, reg(por, 'devolvido', obs));
  }
}

// "Não achei" validado: registra o ajuste de estoque (vai para a lista de
// Ajustes do Giro, igual ao ajuste feito por lá) e fecha a tratativa.
export async function ajustarEstoqueEFechar(t: Tratativa, quantidadeContada: number, por: string): Promise<void> {
  const { data } = await supabase
    .from('estoque_loja_itens')
    .select('quantidade, preco_custo, atualizado_em')
    .eq('codigo_interno', t.codigoInterno)
    .order('atualizado_em', { ascending: false })
    .limit(1);
  const linha = data?.[0];
  await salvarAjuste({
    codigoProduto: t.codigoInterno,
    produto: t.produto,
    setor: t.setor,
    subcategoria: t.grupoNome,
    estoqueSistema: Number(linha?.quantidade ?? t.saldo ?? 0),
    quantidadeContada,
    custo: linha?.preco_custo == null ? null : Number(linha.preco_custo),
    motivo: 'Contagem física',
    observacao: 'Ruptura: encarregado não achou o produto',
    por,
  });
  await atualizar(
    t,
    { status: 'resolvida', acao: 'ajustado', resolvida_em: agora(), resolvida_por: por },
    reg(por, 'ajustado', `Contado: ${quantidadeContada} · sistema: ${linha?.quantidade ?? t.saldo ?? '?'}`),
  );
}

// ------------------------------------------------------- ações encarregado ----

export async function responderEncarregado(
  t: Tratativa,
  resposta: 'na_area' | 'nao_achei' | 'nao_resolvido',
  por: string,
  fotoUrl: string | null,
  obs?: string,
): Promise<void> {
  await atualizar(
    t,
    { status: 'validacao', acao: resposta, foto_url: fotoUrl, obs: obs ?? null, respondida_por: por },
    reg(por, resposta, obs, fotoUrl),
  );
  // Todos os itens da mesma tarefa respondidos → conclui a tarefa.
  if (t.tarefaId) {
    const { count } = await supabase
      .from('ruptura_tratativas')
      .select('id', { count: 'exact', head: true })
      .eq('tarefa_id', t.tarefaId)
      .eq('status', 'encarregado');
    if ((count ?? 0) === 0) {
      let foto = fotoUrl;
      if (!foto) {
        const { data } = await supabase.from('ruptura_tratativas').select('foto_url').eq('tarefa_id', t.tarefaId).not('foto_url', 'is', null).limit(1);
        foto = data?.[0]?.foto_url ?? null;
      }
      try {
        await concluirTarefa(t.tarefaId, por, foto ?? '');
      } catch {
        // tarefa já concluída ou apagada: segue
      }
    }
  }
}
