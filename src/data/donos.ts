// Quem tem acesso a todas as funções do dono (Lucas) no app.
// Lucas Alberto (7990353) e Rodrigo da Cunha (9728010).
export const MATRICULAS_DONO = ['7990353', '9728010'];

export function ehDonoMatricula(matricula: string | number | null | undefined): boolean {
  return MATRICULAS_DONO.includes(String(matricula ?? ''));
}
