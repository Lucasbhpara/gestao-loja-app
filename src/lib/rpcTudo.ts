import { supabase } from './supabase';

// O Supabase devolve no máximo 1.000 linhas por consulta. Num dia a loja vende
// mais de 3.000 produtos diferentes, então busca em páginas até vir tudo.
// Para não demorar, pede várias páginas AO MESMO TEMPO (5 por rodada) em vez
// de uma depois da outra. Não repete a mesma "chave" se a ordem variar.
export async function rpcTudo<T = Record<string, unknown>>(nome: string, args: Record<string, unknown>): Promise<T[]> {
  const PAGINA = 1000;
  const POR_RODADA = 5;
  const todos: T[] = [];
  const vistos = new Set<string>();
  for (let rodada = 0; rodada < 20; rodada++) {
    const inicio = rodada * POR_RODADA * PAGINA;
    const paginas = await Promise.all(
      Array.from({ length: POR_RODADA }, (_, i) => {
        const de = inicio + i * PAGINA;
        return supabase.rpc(nome, args).range(de, de + PAGINA - 1);
      }),
    );
    let acabou = false;
    for (const { data, error } of paginas) {
      if (error) throw error;
      const parte = (data as T[]) || [];
      for (const x of parte) {
        const ch = (x as any)?.chave;
        if (ch == null) {
          todos.push(x);
          continue;
        }
        const k = String(ch);
        if (vistos.has(k)) continue;
        vistos.add(k);
        todos.push(x);
      }
      if (parte.length < PAGINA) {
        acabou = true;
        break;
      }
    }
    if (acabou) break;
  }
  return todos;
}
