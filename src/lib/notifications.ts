import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase, supabaseConfigurado } from './supabase';

// Notificação push funciona diferente em navegador (precisa de uma
// configuração à parte, tipo Web Push) — por enquanto a versão web só não
// usa essa parte, sem quebrar nada. No app instalado continua normal.
if (Platform.OS !== 'web') {
  // Faz as notificações aparecerem mesmo com o app aberto (por padrão, o
  // sistema só mostra notificação com o app em segundo plano).
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// DIAGNÓSTICO TEMPORÁRIO — grava cada etapa numa tabela
// (diag_push_notificacoes) pra dar pra ver de fora, sem acesso ao celular,
// exatamente onde o registro do token está parando. Não muda nenhum
// comportamento pro colaborador, só deixa um rastro. Remover depois que o
// problema de notificação for resolvido.
async function logDiagnostico(colaboradorId: string, etapa: string, detalhe?: string) {
  try {
    await supabase.from('diag_push_notificacoes').insert({
      colaborador_id: colaboradorId,
      etapa,
      detalhe: detalhe ?? null,
    });
  } catch {
    // Se nem o log falhar der certo, não tem o que fazer — segue o jogo.
  }
}

// Pede permissão de notificação (se ainda não tiver) e salva o token desse
// celular vinculado ao colaborador — é esse token que o banco de dados usa
// pra saber pra quem mandar o aviso de "produto vencendo".
//
// Chamado depois do login (e ao restaurar uma sessão já logada). Falha em
// silêncio de propósito pro colaborador (sem Supabase configurado, num
// emulador, ou se ele negar a permissão, o app continua funcionando
// normalmente, só sem notificação) — mas grava cada etapa em
// diag_push_notificacoes (ver logDiagnostico acima) pra dar pra investigar
// de fora enquanto o problema de "notificação não chega" não for resolvido.
export async function registrarNotificacoes(colaboradorId: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await logDiagnostico(colaboradorId, 'parou_web');
      return;
    }
    if (!supabaseConfigurado) {
      await logDiagnostico(colaboradorId, 'parou_supabase_nao_configurado');
      return;
    }
    if (!Device.isDevice) {
      await logDiagnostico(colaboradorId, 'parou_nao_e_dispositivo_fisico');
      return;
    }

    await logDiagnostico(colaboradorId, 'inicio', `plataforma=${Platform.OS}`);

    const permissaoAtual = await Notifications.getPermissionsAsync();
    let status = permissaoAtual.status;
    await logDiagnostico(colaboradorId, 'permissao_atual', status);
    if (status !== 'granted') {
      const resposta = await Notifications.requestPermissionsAsync();
      status = resposta.status;
      await logDiagnostico(colaboradorId, 'permissao_pedida', status);
    }
    if (status !== 'granted') {
      await logDiagnostico(colaboradorId, 'parou_permissao_negada', status);
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    await logDiagnostico(colaboradorId, 'project_id', projectId ?? '(vazio)');

    let token: string | null = null;
    try {
      const resultadoToken = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      token = resultadoToken.data;
      await logDiagnostico(colaboradorId, 'token_obtido', token ? `${token.slice(0, 25)}...` : '(vazio)');
    } catch (erroToken: any) {
      await logDiagnostico(
        colaboradorId,
        'ERRO_ao_obter_token',
        String(erroToken?.message ?? erroToken)
      );
      return;
    }
    if (!token) {
      await logDiagnostico(colaboradorId, 'parou_token_vazio');
      return;
    }

    const { error: erroUpsert } = await supabase
      .from('push_tokens')
      .upsert(
        { colaborador_id: colaboradorId, expo_push_token: token, atualizado_em: new Date().toISOString() },
        { onConflict: 'colaborador_id,expo_push_token' }
      );
    if (erroUpsert) {
      await logDiagnostico(colaboradorId, 'ERRO_ao_salvar_no_banco', erroUpsert.message);
      return;
    }

    await logDiagnostico(colaboradorId, 'sucesso_token_salvo');
  } catch (erroGeral: any) {
    await logDiagnostico(colaboradorId, 'ERRO_GERAL_inesperado', String(erroGeral?.message ?? erroGeral));
  }
}
