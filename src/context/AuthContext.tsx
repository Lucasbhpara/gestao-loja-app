import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Employee, employeesIniciais, normalizeNome } from '../data/employees';
import { supabase, supabaseConfigurado } from '../lib/supabase';
import { registrarNotificacoes } from '../lib/notifications';

// ---------------------------------------------------------------------------
// Autenticação.
//
// Se src/config/supabaseConfig.ts estiver preenchido (SUPABASE_URL e
// SUPABASE_ANON_KEY), este Context passa a ler/gravar os colaboradores na
// tabela "colaboradores" do Supabase (banco de dados na nuvem) — assim
// todos os celulares (e o portal web) enxergam os mesmos dados em tempo
// real.
//
// Se ainda não estiver preenchido, o app continua funcionando exatamente
// como antes: tudo guardado localmente no AsyncStorage do próprio celular.
// Isso deixa o app testável mesmo antes de configurar o Supabase, e a
// migração acontece sozinha assim que as chaves forem coladas.
// ---------------------------------------------------------------------------

const STORAGE_KEY = '@gestao-loja/colaboradores';
const SESSION_KEY = '@gestao-loja/sessao';

interface AuthContextValue {
  carregando: boolean;
  usandoNuvem: boolean;
  usuarioAtual: Employee | null;
  colaboradores: Employee[];
  login: (nome: string, senha: string) => Promise<{ ok: boolean; erro?: string }>;
  logout: () => Promise<void>;
  definirNovaSenha: (novaSenha: string) => Promise<void>;
  solicitarRecuperacaoSenha: (nome: string) => Promise<{ ok: boolean; erro?: string }>;
  adicionarColaborador: (dados: Omit<Employee, 'id' | 'senhaAtual' | 'senhaDefinida'>) => Promise<void>;
  editarFuncao: (id: string, novaFuncao: string) => Promise<void>;
  removerColaborador: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Converte uma linha da tabela do Supabase (snake_case) pro formato que o
// resto do app já conhece (camelCase).
function linhaParaEmployee(linha: any): Employee {
  return {
    id: linha.id,
    nome: linha.nome,
    matricula: linha.matricula,
    funcao: linha.funcao,
    setor: linha.setor,
    isAdmin: linha.is_admin,
    senhaAtual: linha.senha_atual,
    senhaDefinida: linha.senha_definida,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [colaboradores, setColaboradores] = useState<Employee[]>(employeesIniciais);
  const [usuarioAtual, setUsuarioAtual] = useState<Employee | null>(null);

  useEffect(() => {
    (async () => {
      try {
        let lista: Employee[];

        if (supabaseConfigurado) {
          const { data, error } = await supabase.from('colaboradores').select('*').order('nome');
          if (error) throw error;
          lista = (data ?? []).map(linhaParaEmployee);
        } else {
          const salvos = await AsyncStorage.getItem(STORAGE_KEY);
          lista = salvos ? JSON.parse(salvos) : employeesIniciais;
        }
        setColaboradores(lista);

        const sessaoId = await AsyncStorage.getItem(SESSION_KEY);
        if (sessaoId) {
          const encontrado = lista.find((c) => c.id === sessaoId) ?? null;
          setUsuarioAtual(encontrado);
          if (encontrado) registrarNotificacoes(encontrado.id).catch(() => {});
        }
      } catch (e) {
        // Se o Supabase estiver configurado mas a internet falhar (ou as
        // chaves estiverem erradas), cai pro que já tiver salvo localmente
        // em vez de travar o app.
        const salvos = await AsyncStorage.getItem(STORAGE_KEY);
        setColaboradores(salvos ? JSON.parse(salvos) : employeesIniciais);
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  async function persistirColaboradores(lista: Employee[]) {
    setColaboradores(lista);
    if (!supabaseConfigurado) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
    }
    // Quando usando Supabase, cada operação (adicionar/editar/remover) já
    // grava direto na nuvem nas funções abaixo — aqui só atualizamos o
    // estado local pra tela refletir na hora.
  }

  async function login(nome: string, senha: string) {
    const alvo = colaboradores.find((c) => normalizeNome(c.nome) === normalizeNome(nome));
    if (!alvo) {
      return { ok: false, erro: 'Usuário não encontrado. Confira como seu nome está cadastrado.' };
    }
    if (alvo.senhaAtual !== senha.trim()) {
      return { ok: false, erro: 'Senha incorreta.' };
    }
    setUsuarioAtual(alvo);
    await AsyncStorage.setItem(SESSION_KEY, alvo.id);
    registrarNotificacoes(alvo.id).catch(() => {});
    return { ok: true };
  }

  async function logout() {
    setUsuarioAtual(null);
    await AsyncStorage.removeItem(SESSION_KEY);
  }

  async function definirNovaSenha(novaSenha: string) {
    if (!usuarioAtual) return;

    if (supabaseConfigurado) {
      const { error } = await supabase
        .from('colaboradores')
        .update({ senha_atual: novaSenha, senha_definida: true })
        .eq('id', usuarioAtual.id);
      if (error) throw error;
    }

    const atualizados = colaboradores.map((c) =>
      c.id === usuarioAtual.id ? { ...c, senhaAtual: novaSenha, senhaDefinida: true } : c
    );
    await persistirColaboradores(atualizados);
    setUsuarioAtual((prev) => (prev ? { ...prev, senhaAtual: novaSenha, senhaDefinida: true } : prev));
  }

  async function solicitarRecuperacaoSenha(nome: string) {
    const alvo = colaboradores.find((c) => normalizeNome(c.nome) === normalizeNome(nome));
    if (!alvo) {
      return { ok: false, erro: 'Usuário não encontrado.' };
    }
    // Sem aprovação manual do administrador ainda: a senha volta a ser a
    // matrícula (provisória) e o colaborador é obrigado a criar uma nova
    // no próximo login, igual ao primeiro acesso.
    if (supabaseConfigurado) {
      const { error } = await supabase
        .from('colaboradores')
        .update({ senha_atual: alvo.matricula, senha_definida: false })
        .eq('id', alvo.id);
      if (error) throw error;
    }

    const atualizados = colaboradores.map((c) =>
      c.id === alvo.id ? { ...c, senhaAtual: c.matricula, senhaDefinida: false } : c
    );
    await persistirColaboradores(atualizados);
    return { ok: true };
  }

  async function adicionarColaborador(dados: Omit<Employee, 'id' | 'senhaAtual' | 'senhaDefinida'>) {
    if (supabaseConfigurado) {
      const { data, error } = await supabase
        .from('colaboradores')
        .insert({
          nome: dados.nome,
          matricula: dados.matricula,
          funcao: dados.funcao,
          setor: dados.setor,
          is_admin: dados.isAdmin,
          senha_atual: dados.matricula,
          senha_definida: false,
        })
        .select()
        .single();
      if (error) throw error;
      await persistirColaboradores([...colaboradores, linhaParaEmployee(data)]);
      return;
    }

    const novo: Employee = {
      ...dados,
      id: String(Date.now()),
      senhaAtual: dados.matricula,
      senhaDefinida: false,
    };
    await persistirColaboradores([...colaboradores, novo]);
  }

  async function editarFuncao(id: string, novaFuncao: string) {
    if (supabaseConfigurado) {
      const { error } = await supabase.from('colaboradores').update({ funcao: novaFuncao }).eq('id', id);
      if (error) throw error;
    }
    const atualizados = colaboradores.map((c) => (c.id === id ? { ...c, funcao: novaFuncao } : c));
    await persistirColaboradores(atualizados);
  }

  async function removerColaborador(id: string) {
    if (supabaseConfigurado) {
      const { error } = await supabase.from('colaboradores').delete().eq('id', id);
      if (error) throw error;
    }
    await persistirColaboradores(colaboradores.filter((c) => c.id !== id));
  }

  const value = useMemo(
    () => ({
      carregando,
      usandoNuvem: supabaseConfigurado,
      usuarioAtual,
      colaboradores,
      login,
      logout,
      definirNovaSenha,
      solicitarRecuperacaoSenha,
      adicionarColaborador,
      editarFuncao,
      removerColaborador,
    }),
    [carregando, usuarioAtual, colaboradores]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa ser usado dentro de <AuthProvider>');
  return ctx;
}
