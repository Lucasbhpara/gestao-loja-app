import { supabase } from './supabase';

// O Supabase devolve no máximo 1.000 linhas por consulta. Num dia a loja vende
// mais de 3.000 produtos diferentes, então busca em páginas até vir tudo
// (sem repetir a mesma "chave" caso a ordem mude entre uma página e outra).
export async function rpcTudo<T = Record<string, unknown>>(nome: string, args: Record<string, unknown>): Promise<T[]> {
  const PAGINA = 1000;
  const todos: T[] = [];
  const vistos = new Set<string>();
  for (let de = 0; de < 100000; de += PAGINA) {
    const { data, error } = await supabase.rpc(nome, args).range(de, de + PAGINA - 1);
    if (error) throw error;
    const parte = ((data as T[]) || []);
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
    if (parte.length < PAGINA) break;
  }
  return todos;
}
