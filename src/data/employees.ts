// Base inicial de colaboradores e setores da unidade.
//
// IMPORTANTE: isto é uma base MOCK (em memória) para o app funcionar e ser
// testável agora, sem depender de um servidor. O login funciona: nome do
// colaborador = usuário, matrícula = senha provisória do primeiro acesso.
// Quando o backend real (Supabase) for conectado, esta lista deixa de ser a
// fonte da verdade — os dados passam a vir do banco de dados na nuvem, e o
// cadastro/edição de colaboradores passa a ser feito pela tela "Equipe" do
// Portal Admin, não editando este arquivo.

export type SetorKey =
  | 'gerencia'
  | 'cpd'
  | 'acougue'
  | 'frios'
  | 'padaria'
  | 'flv'
  | 'mercearia'
  | 'frente-caixa'
  | 'deposito'
  | 'prevencao'
  | 'promotores'
  // Marcador especial (não é um setor de colaborador de verdade — não entra
  // na lista `setores` abaixo). Usado só pra marcar um PRODUTO como visível
  // em todas as abas de setor de uma vez (ex.: Validade), pra não precisar
  // cadastrar o mesmo item várias vezes.
  | 'todos';

export interface Setor {
  key: SetorKey;
  nome: string;
}

export const setores: Setor[] = [
  { key: 'gerencia', nome: 'Gerência' },
  { key: 'cpd', nome: 'CPD' },
  { key: 'acougue', nome: 'Açougue' },
  { key: 'frios', nome: 'Frios' },
  { key: 'padaria', nome: 'Padaria' },
  { key: 'flv', nome: 'FLV' },
  { key: 'mercearia', nome: 'Mercearia' },
  { key: 'frente-caixa', nome: 'Frente de Caixa' },
  { key: 'deposito', nome: 'Depósito' },
  { key: 'prevencao', nome: 'Prevenção' },
  { key: 'promotores', nome: 'Promotores' },
];

export interface Employee {
  id: string;
  nome: string;
  matricula: string;
  funcao: string;
  setor: SetorKey;
  isAdmin: boolean;
  /** Senha atual. Começa igual à matrícula até o colaborador trocar no primeiro acesso. */
  senhaAtual: string;
  /** false = ainda não trocou a senha provisória (matrícula) por uma própria. */
  senhaDefinida: boolean;
}

export const employeesIniciais: Employee[] = [
  { id: '1', nome: 'Dayse', matricula: '9728572', funcao: 'Frente de Caixa', setor: 'frente-caixa', isAdmin: false, senhaAtual: '9728572', senhaDefinida: false },
  { id: '2', nome: 'Marcela', matricula: '9728646', funcao: 'Frente de Caixa', setor: 'frente-caixa', isAdmin: false, senhaAtual: '9728646', senhaDefinida: false },
  { id: '3', nome: 'Rosilene', matricula: '9728648', funcao: 'Aux. Administrativo', setor: 'cpd', isAdmin: false, senhaAtual: '9728648', senhaDefinida: false },
  { id: '4', nome: 'Luziana', matricula: '9728649', funcao: 'Frente de Caixa', setor: 'frente-caixa', isAdmin: false, senhaAtual: '9728649', senhaDefinida: false },
  { id: '5', nome: 'Arthur', matricula: '9728651', funcao: 'Aux. Administrativo', setor: 'cpd', isAdmin: false, senhaAtual: '9728651', senhaDefinida: false },
  { id: '6', nome: 'Marcela S.', matricula: '9734844', funcao: 'Aux. Administrativo', setor: 'cpd', isAdmin: false, senhaAtual: '9734844', senhaDefinida: false },
  { id: '7', nome: 'Carlos', matricula: '9728565', funcao: 'Enc. Loja', setor: 'mercearia', isAdmin: false, senhaAtual: '9728565', senhaDefinida: false },
  { id: '8', nome: 'Alisson', matricula: '9728566', funcao: 'Enc. Loja', setor: 'deposito', isAdmin: false, senhaAtual: '9728566', senhaDefinida: false },
  { id: '9', nome: 'Geraldo', matricula: '9728511', funcao: 'Enc. Açougue', setor: 'acougue', isAdmin: false, senhaAtual: '9728511', senhaDefinida: false },
  { id: '10', nome: 'Reni', matricula: '9727940', funcao: 'Enc. Frios', setor: 'frios', isAdmin: false, senhaAtual: '9727940', senhaDefinida: false },
  { id: '11', nome: 'Claudiane', matricula: '9729163', funcao: 'A.P.P', setor: 'prevencao', isAdmin: false, senhaAtual: '9729163', senhaDefinida: false },
  { id: '12', nome: 'Taynara', matricula: '9728792', funcao: 'Padeira', setor: 'padaria', isAdmin: false, senhaAtual: '9728792', senhaDefinida: false },
  { id: '13', nome: 'Rodrigo da Cunha', matricula: '9728010', funcao: 'Gerente/ADM', setor: 'gerencia', isAdmin: true, senhaAtual: '9728010', senhaDefinida: false },
  { id: '14', nome: 'Lucas Alberto', matricula: '7990353', funcao: 'Gerente/Criador', setor: 'gerencia', isAdmin: true, senhaAtual: '7990353', senhaDefinida: false },
  { id: '15', nome: 'Matheus', matricula: '9728714', funcao: 'Enc. FLV', setor: 'flv', isAdmin: false, senhaAtual: '9728714', senhaDefinida: false },
];

export function normalizeNome(nome: string): string {
  return nome.trim().toLowerCase();
}
