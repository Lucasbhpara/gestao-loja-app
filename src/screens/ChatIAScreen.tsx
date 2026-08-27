import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from '../config/aiConfig';

interface Mensagem {
  id: string;
  papel: 'usuario' | 'ia';
  texto: string;
}

const SYSTEM_PROMPT =
  'Você é um assistente dentro do app "Gestão de Loja", conversando com o Lucas, ' +
  'que está desenvolvendo esse app aos poucos. Responda em português do Brasil, ' +
  'de forma direta, curta e prática — ele está usando isso pelo celular para tirar ' +
  'dúvidas rápidas sobre o projeto, programação, ou qualquer outro assunto.';

export default function ChatIAScreen({ onVoltar }: { onVoltar: () => void }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const listRef = useRef<FlatList>(null);

  const chaveConfigurada = ANTHROPIC_API_KEY.trim().length > 0;

  async function enviar() {
    const pergunta = texto.trim();
    if (!pergunta || enviando) return;

    if (!chaveConfigurada) {
      setMensagens((prev) => [
        ...prev,
        { id: String(Date.now()), papel: 'usuario', texto: pergunta },
        {
          id: String(Date.now() + 1),
          papel: 'ia',
          texto:
            'Ainda falta configurar a chave da API pra eu funcionar aqui dentro. ' +
            'Abra o arquivo src/config/aiConfig.ts e siga as instruções no topo dele.',
        },
      ]);
      setTexto('');
      return;
    }

    const novaMensagemUsuario: Mensagem = { id: String(Date.now()), papel: 'usuario', texto: pergunta };
    const historico = [...mensagens, novaMensagemUsuario];
    setMensagens(historico);
    setTexto('');
    setEnviando(true);

    try {
      const resposta = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: historico.map((m) => ({
            role: m.papel === 'usuario' ? 'user' : 'assistant',
            content: m.texto,
          })),
        }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        const motivo = dados?.error?.message ?? `Erro ${resposta.status}`;
        throw new Error(motivo);
      }

      const textoResposta: string = dados?.content?.[0]?.text ?? '(resposta vazia)';
      setMensagens((prev) => [...prev, { id: String(Date.now() + 1), papel: 'ia', texto: textoResposta }]);
    } catch (erro: any) {
      setMensagens((prev) => [
        ...prev,
        {
          id: String(Date.now() + 2),
          papel: 'ia',
          texto: `Não consegui responder agora (${erro?.message ?? 'erro desconhecido'}). Verifique sua internet e se a chave em aiConfig.ts está correta.`,
        },
      ]);
    } finally {
      setEnviando(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Falar com a IA</Text>
        <View style={{ width: 56 }} />
      </View>

      {!chaveConfigurada && (
        <View style={styles.avisoBox}>
          <Text style={styles.avisoTexto}>
            Chave da API ainda não configurada. Veja as instruções em src/config/aiConfig.ts.
          </Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 8 }}
        data={mensagens}
        keyExtractor={(m) => m.id}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>
              Essa é sua aba particular pra tirar dúvidas rápidas sobre o projeto (ou qualquer outra coisa),
              direto pelo celular. Escreva algo abaixo pra começar.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.bolha,
              item.papel === 'usuario' ? styles.bolhaUsuario : styles.bolhaIA,
            ]}
          >
            <Text style={item.papel === 'usuario' ? styles.bolhaTextoUsuario : styles.bolhaTextoIA}>
              {item.texto}
            </Text>
          </View>
        )}
      />

      {enviando && (
        <View style={styles.carregando}>
          <ActivityIndicator color={colors.navy700} size="small" />
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Escreva sua dúvida..."
          placeholderTextColor={colors.gray400}
          value={texto}
          onChangeText={setTexto}
          multiline
        />
        <TouchableOpacity
          style={[styles.enviarBtn, (!texto.trim() || enviando) && styles.enviarBtnDesabilitado]}
          onPress={enviar}
          disabled={!texto.trim() || enviando}
        >
          <Text style={styles.enviarBtnTexto}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  voltar: { color: colors.navy700, fontSize: 15, fontWeight: '600', width: 56 },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.navy900 },
  avisoBox: { backgroundColor: '#FFF4E5', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  avisoTexto: { color: '#8A5A00', fontSize: 11, lineHeight: 16 },
  vazio: { paddingTop: spacing.xxl, paddingHorizontal: spacing.md },
  vazioTexto: { color: colors.gray600, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  bolha: { maxWidth: '82%', borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  bolhaUsuario: { backgroundColor: colors.navy700, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bolhaIA: { backgroundColor: colors.white, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.gray100 },
  bolhaTextoUsuario: { color: colors.white, fontSize: 13, lineHeight: 19 },
  bolhaTextoIA: { color: colors.gray900, fontSize: 13, lineHeight: 19 },
  carregando: { paddingVertical: spacing.sm, alignItems: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: colors.gray50,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.gray900,
  },
  enviarBtn: { backgroundColor: colors.navy700, borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: spacing.lg },
  enviarBtnDesabilitado: { backgroundColor: colors.gray100 },
  enviarBtnTexto: { color: colors.white, fontSize: 13, fontWeight: '700' },
});
