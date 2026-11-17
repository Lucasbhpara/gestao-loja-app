// Quem tem acesso a todas as funções do dono (Lucas) no app.
// Lucas Alberto (7990353), Rodrigo da Cunha (9728010) e Marcela (9728646).
export const MATRICULAS_DONO = ['7990353', '9728010', '9728646'];

export function ehDonoMatricula(matricula: string | number | null | undefined): boolean {
  return MATRICULAS_DONO.includes(String(matricula ?? ''));
}
