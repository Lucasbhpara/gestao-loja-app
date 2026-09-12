import { supabase } from '../lib/supabase';

// Jornal de Ofertas: o encarte de promoções da loja, em PDF. O administrador
// sobe um PDF novo pelo portal sempre que muda — o app (e o portal) sempre
// mostram o mais recente. Aqui no app é só consulta, numa bolha flutuante
// (ver src/components/JornalOfertasFlutuante.tsx).

export interface JornalOferta {
  id: string;
  arquivoUrl: string;
  nomeArquivo: string | null;
  enviadoEm: string;
}

function linhaParaJornal(l: any): JornalOferta {
  return { id: l.id, arquivoUrl: l.arquivo_url, nomeArquivo: l.nome_arquivo, enviadoEm: l.enviado_em };
}

export async function buscarJornalAtual(): Promise<JornalOferta | null> {
  const { data, error } = await supabase
    .from('jornal_ofertas')
    .select('*')
    .order('enviado_em', { ascending: false })
    .limit(1);
  if (error) throw error;
  const linha = (data ?? [])[0];
  return linha ? linhaParaJornal(linha) : null;
}
