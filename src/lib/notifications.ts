import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase, supabaseConfigurado } from './supabase';

// Faz as notificações aparecerem mesmo com o app aberto (por padrão, o
// sistema só mostra notificação com o app em segundo plano).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Pede permissão de notificação (se ainda não tiver) e salva o token desse
// celular vinculado ao colaborador — é esse token que o banco de dados usa
// pra saber pra quem mandar o aviso de "produto vencendo".
//
// Chamado depois do login (e ao restaurar uma sessão já logada). Falha em
// silêncio de propósito: sem Supabase configurado, num emulador, ou se o
// colaborador negar a permissão, o app continua funcionando normalmente,
// só sem notificação.
export async function registrarNotificacoes(colaboradorId: string): Promise<void> {
  if (!supabaseConfigurado) return;
  if (!Device.isDevice) return;

  const permissaoAtual = await Notifications.getPermissionsAsync();
  let status = permissaoAtual.status;
  if (status !== 'granted') {
    const resposta = await Notifications.requestPermissionsAsync();
    status = resposta.status;
  }
  if (status !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const resultadoToken = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const token = resultadoToken.data;
  if (!token) return;

  await supabase
    .from('push_tokens')
    .upsert(
      { colaborador_id: colaboradorId, expo_push_token: token, atualizado_em: new Date().toISOString() },
      { onConflict: 'colaborador_id,expo_push_token' }
    );
}
