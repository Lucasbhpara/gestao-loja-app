import { supabase } from '../lib/supabase';

// Mapa da Loja — planta real da loja (a imagem vem embutida no app, veja
// assets/mapa-loja-planta.png) com um botão invisível em cima de cada
// corredor/setor/ponto extra, posicionado em % da imagem (funciona em
// qualquer tamanho de tela). A edição (criar área, subir foto) é feita só
// no portal — aqui no app é só leitura, pra qualquer colaborador consultar
// onde cada produto fica.

export type TipoAreaMapa = 'corredor' | 'setor' | 'ponto-extra' | 'ponta-gondola';

export interface AreaMapa {
  id: string;
  nome: string;
  tipo: TipoAreaMapa;
  posX: number; // % da largura da imagem (0-100)
  posY: number; // % da altura da imagem (0-100)
  posW: number; // % da largura da imagem que a área ocupa
  posH: number; // % da altura da imagem que a área ocupa
  cor: string;
}

export interface FotoMapa {
  id: string;
  areaId: string;
  fotoUrl: string;
  ordem: number;
}

function linhaParaArea(l: any): AreaMapa {
  return {
    id: l.id,
    nome: l.nome,
    tipo: l.tipo,
    posX: Number(l.pos_x),
    posY: Number(l.pos_y),
    posW: Number(l.pos_w),
    posH: Number(l.pos_h),
    cor: l.cor,
  };
}

function linhaParaFoto(l: any): FotoMapa {
  return { id: l.id, areaId: l.area_id, fotoUrl: l.foto_url, ordem: l.ordem };
}

export async function buscarAreasMapa(): Promise<AreaMapa[]> {
  const { data, error } = await supabase.from('mapa_areas').select('*').order('ordem');
  if (error) throw error;
  return (data ?? []).map(linhaParaArea);
}

export async function buscarFotosDaArea(areaId: string): Promise<FotoMapa[]> {
  const { data, error } = await supabase.from('mapa_fotos').select('*').eq('area_id', areaId).order('ordem');
  if (error) throw error;
  return (data ?? []).map(linhaParaFoto);
}
