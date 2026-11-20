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
}

export async function listarItensFoco(): Promise<ItemFoco[]> {
  const { data, error } = await supabase
    .from('itens_foco')
    .select('id, codigo, produto, responsavel, lista, obs, ordem, conf_status, conf_por, conf_em')
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
  }));
}

export async function marcarItemFoco(id: string, status: StatusFoco | null, por: string): Promise<void> {
  const { error } = await supabase
    .from('itens_foco')
    .update({ conf_status: status, conf_por: status ? por : null, conf_em: status ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Zera só o OK/Ruptura (a lista continua).
export async function reiniciarItensFoco(): Promise<void> {
  const { error } = await supabase.from('itens_foco').update({ conf_status: null, conf_por: null, conf_em: null }).not('conf_status', 'is', null);
  if (error) throw new Error(error.message);
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
