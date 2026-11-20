import { supabase } from '../lib/supabase';

// =============================================================================
// Itens Foco — lista do supervisor (Marcos Campideli) com os produtos que cada
// representante/promotor cobra na loja. Conferência igual à do folheto
// (OK / Ruptura), rota no mapa da loja e relatório de disponibilidade no CD.
// Tabela: itens_foco (supabase/itens_foco.sql). Estoque CD: mix_cd_itens
// (formulário do CD importado na Ruptura). Estoque loja: estoque_loja_itens.
// =============================================================================

export type StatusFoco = 'ok' | 'ruptura';

export interface ItemFoco {
  id: string;
  codigo: string | null;
  produto: string;
  responsavel: string;
  lista: string | null;
  obs: string | null;
  ordem: number;
  confStatus: StatusFoco | null;
  confPor: string | null;
  confEm: string | null;
  pedidoSolicitacaoId: string | null;
  pedidoEm: string | null;
}

export async function listarItensFoco(): Promise<ItemFoco[]> {
  const { data, error } = await supabase
    .from('itens_foco')
    .select('*')
    .eq('ativo', true)
    .order('ordem');
  if (error) {
    if (/itens_foco/.test(error.message)) throw new Error('A tabela dos Itens Foco ainda não existe. Rode supabase/itens_foco.sql no SQL Editor do Supabase.');
    throw new Error(error.message);
  }
  return (data ?? []).map((l: any) => ({
    id: l.id,
    codigo: l.codigo ?? null,
    produto: l.produto,
    responsavel: l.responsavel,
    lista: l.lista ?? null,
    obs: l.obs ?? null,
    ordem: l.ordem ?? 0,
    confStatus: l.conf_status ?? null,
    confPor: l.conf_por ?? null,
    confEm: l.conf_em ?? null,
    pedidoSolicitacaoId: l.pedido_solicitacao_id ?? null,
    pedidoEm: l.pedido_em ?? null,
  }));
}

export async function marcarItemFoco(id: string, status: StatusFoco | null, por: string): Promise<void> {
  const { error } = await supabase
    .from('itens_foco')
    .update({ conf_status: status, conf_por: status ? por : null, conf_em: status ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Zera o OK/Ruptura e o vínculo com o pedido (a lista continua). Quem chama
// guarda antes a conferência no histórico (salvarConferenciaFoco).
export async function reiniciarItensFoco(): Promise<void> {
  const { error } = await supabase
    .from('itens_foco')
    .update({ conf_status: null, conf_por: null, conf_em: null, pedido_solicitacao_id: null, pedido_em: null })
    .or('conf_status.not.is.null,pedido_solicitacao_id.not.is.null');
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------- histórico ----
export interface ConferenciaFoco {
  id: string;
  criadoEm: string;
  por: string | null;
  responsavel: string | null; // null = todos
  total: number;
  ok: number;
  ruptura: number;
  pendentes: number;
  itens: { codigo: string | null; produto: string; responsavel: string; status: StatusFoco | null }[];
  pedidoSolicitacaoId: string | null;
}

export async function salvarConferenciaFoco(lista: ItemFoco[], responsavel: string | null, por: string): Promise<void> {
  const ok = lista.filter((i) => i.confStatus === 'ok').length;
  const ruptura = lista.filter((i) => i.confStatus === 'ruptura').length;
  const pedidos = lista.map((i) => i.pedidoSolicitacaoId).filter(Boolean) as string[];
  const { error } = await supabase.from('itens_foco_conferencias').insert({
    por: por || null,
    responsavel,
    total: lista.length,
    ok,
    ruptura,
    pendentes: lista.length - ok - ruptura,
    itens: lista.map((i) => ({ codigo: i.codigo, produto: i.produto, responsavel: i.responsavel, status: i.confStatus })),
    pedido_solicitacao_id: pedidos.length ? pedidos[pedidos.length - 1] : null,
  });
  if (error) {
    if (/itens_foco_conferencias/.test(error.message)) throw new Error('Falta criar o histórico: rode supabase/itens_foco_historico.sql no SQL Editor do Supabase.');
    throw new Error(error.message);
  }
}

export async function listarConferenciasFoco(): Promise<ConferenciaFoco[]> {
  const { data, error } = await supabase.from('itens_foco_conferencias').select('*').order('criado_em', { ascending: false }).limit(60);
  if (error) {
    if (/itens_foco_conferencias/.test(error.message)) throw new Error('Falta criar o histórico: rode supabase/itens_foco_historico.sql no SQL Editor do Supabase.');
    throw new Error(error.message);
  }
  return (data ?? []).map((l: any) => ({
    id: l.id,
    criadoEm: l.criado_em,
    por: l.por ?? null,
    responsavel: l.responsavel ?? null,
    total: l.total ?? 0,
    ok: l.ok ?? 0,
    ruptura: l.ruptura ?? 0,
    pendentes: l.pendentes ?? 0,
    itens: Array.isArray(l.itens) ? l.itens : [],
    pedidoSolicitacaoId: l.pedido_solicitacao_id ?? null,
  }));
}

// ------------------------------------------- Pedido CD (Assistente ULVA) ----
// Grava uma solicitação na mesma fila das Tratativas/Cortes
// (pedido_cd_solicitacoes). O Assistente ULVA (extensão do Chrome) digita no
// formulário MG SECOS do Portal 360 e, quando termina, o banco avisa no
// celular de quem enviou. Só vai o que o CD tem.
export interface SolicitacaoPedido {
  id: string;
  status: 'pendente' | 'processando' | 'pronto' | 'parou' | 'erro' | 'cancelada';
  criadoEm: string;
  concluidoEm: string | null;
  digitados: number;
}

export async function enviarFocoAoPedidoCD(lista: ItemFoco[], responsavel: string | null, por: string): Promise<{ enviados: number; solicitacaoId: string }> {
  const vai = lista.filter((i) => i.codigo);
  if (!vai.length) throw new Error('Nenhum item com código para pedir.');
  const { data, error } = await supabase
    .from('pedido_cd_solicitacoes')
    .insert({
      itens: vai.map((i) => ({ codigo: i.codigo, produto: i.produto, grupo_nome: 'Itens Foco', item_foco_id: i.id })),
      grupos: responsavel ? `Itens Foco · ${responsavel}` : 'Itens Foco',
      criado_por: por || null,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  const id = (data as any).id as string;
  const { error: e2 } = await supabase
    .from('itens_foco')
    .update({ pedido_solicitacao_id: id, pedido_em: new Date().toISOString() })
    .in('id', vai.map((i) => i.id));
  if (e2) {
    if (/pedido_solicitacao_id/.test(e2.message)) throw new Error('O pedido foi para a fila, mas falta rodar supabase/itens_foco_historico.sql para o ULVA lembrar dele.');
    throw new Error(e2.message);
  }
  return { enviados: vai.length, solicitacaoId: id };
}

export async function buscarSolicitacoes(ids: string[]): Promise<Record<string, SolicitacaoPedido>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  const { data, error } = await supabase
    .from('pedido_cd_solicitacoes')
    .select('id, status, criado_em, concluido_em, resultado')
    .in('id', unicos);
  if (error) throw new Error(error.message);
  const out: Record<string, SolicitacaoPedido> = {};
  (data ?? []).forEach((l: any) => {
    const r = l.resultado ?? {};
    out[l.id] = {
      id: l.id,
      status: l.status,
      criadoEm: l.criado_em,
      concluidoEm: l.concluido_em ?? null,
      digitados: (Array.isArray(r.ok) ? r.ok.length : 0) + (Array.isArray(r.ja) ? r.ja.length : 0),
    };
  });
  return out;
}

// Rodapé dos relatórios: "Pedido realizado no dia … às …".
export function rodapePedido(s: SolicitacaoPedido | null | undefined): string {
  if (!s) return '';
  const dh = (iso: string) => {
    const d = new Date(iso);
    return {
      dia: d.toLocaleDateString('pt-BR'),
      hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
  };
  if ((s.status === 'pronto' || s.status === 'parou') && s.concluidoEm) {
    const { dia, hora } = dh(s.concluidoEm);
    return `🛒 Pedido realizado no dia ${dia} às ${hora}\nRealizado pelo Assistente ULVA`;
  }
  if (s.status === 'pendente' || s.status === 'processando') {
    const { dia, hora } = dh(s.criadoEm);
    return `🛒 Pedido enviado ao Assistente ULVA no dia ${dia} às ${hora} (aguardando digitar no Portal 360)`;
  }
  if (s.status === 'erro') return '⚠️ O Assistente ULVA não conseguiu concluir o pedido. Veja em Pedidos CD.';
  return '';
}

// ------------------------------------------------ disponibilidade ----
// cd_tem: CD com estoque · cd_zerado: está no formulário, mas zerado ·
// fora_cd: não está no formulário do CD (entrega direta / fora de linha) ·
// sem_codigo: veio sem código na lista, não dá para consultar.
export type SituacaoCd = 'cd_tem' | 'cd_zerado' | 'fora_cd' | 'sem_codigo';

export interface Disponibilidade {
  estoqueLoja: number | null;
  estoqueCd: number | null;
  embalagem: string | null;
  noFormulario: boolean;
  zeradoDesde: string | null;
  situacao: SituacaoCd;
}

export interface ResultadoDisponibilidade {
  porCodigo: Record<string, Disponibilidade>;
  cdAtualizadoEm: string | null;   // quando o formulário do CD foi importado
  lojaAtualizadaEm: string | null; // data da planilha de estoque da loja
}

export async function buscarDisponibilidade(codigos: string[]): Promise<ResultadoDisponibilidade> {
  const unicos = [...new Set(codigos.filter(Boolean))];
  const cd = new Map<string, any>();
  const loja = new Map<string, any>();
  let cdEm: string | null = null;
  let lojaEm: string | null = null;
  for (let i = 0; i < unicos.length; i += 200) {
    const parte = unicos.slice(i, i + 200);
    const [a, b] = await Promise.all([
      supabase.from('mix_cd_itens').select('codigo_interno, estoque_cd, embalagem, no_formulario, zerado_desde, importado_em').in('codigo_interno', parte),
      supabase.from('estoque_loja_itens').select('codigo_interno, quantidade, data_planilha').in('codigo_interno', parte),
    ]);
    if (a.error) throw new Error(a.error.message);
    if (b.error) throw new Error(b.error.message);
    (a.data ?? []).forEach((l: any) => {
      cd.set(String(l.codigo_interno), l);
      if (l.importado_em && (!cdEm || l.importado_em > cdEm)) cdEm = l.importado_em;
    });
    (b.data ?? []).forEach((l: any) => {
      loja.set(String(l.codigo_interno), l);
      if (l.data_planilha && (!lojaEm || l.data_planilha > lojaEm)) lojaEm = l.data_planilha;
    });
  }
  const porCodigo: Record<string, Disponibilidade> = {};
  for (const c of unicos) {
    const x = cd.get(c);
    const y = loja.get(c);
    const estoqueCd = x?.estoque_cd == null ? null : Number(x.estoque_cd);
    // item que saiu do último formulário conta como fora do CD
    const noFormulario = !!x && x.no_formulario !== false;
    porCodigo[c] = {
      estoqueLoja: y?.quantidade == null ? null : Number(y.quantidade),
      estoqueCd,
      embalagem: x?.embalagem ?? null,
      noFormulario,
      zeradoDesde: x?.zerado_desde ?? null,
      situacao: !noFormulario ? 'fora_cd' : (estoqueCd ?? 0) > 0 ? 'cd_tem' : 'cd_zerado',
    };
  }
  return { porCodigo, cdAtualizadoEm: cdEm, lojaAtualizadaEm: lojaEm };
}

export function disponibilidadeDe(item: ItemFoco, r: ResultadoDisponibilidade | null): Disponibilidade | null {
  if (!item.codigo) return { estoqueLoja: null, estoqueCd: null, embalagem: null, noFormulario: false, zeradoDesde: null, situacao: 'sem_codigo' };
  return r?.porCodigo[item.codigo] ?? null;
}
