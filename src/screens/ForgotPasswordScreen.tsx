import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

interface Props {
  onVoltarParaLogin: () => void;
}

export default function ForgotPasswordScreen({ onVoltarParaLogin }: Props) {
  const { solicitarRecuperacaoSenha } = useAuth();
  const [nome, setNome] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSolicitar() {
    if (!nome.trim()) {
      setErro('Digite seu usuário.');
      return;
    }
    setErro(null);
    setEnviando(true);
    const resultado = await solicitarRecuperacaoSenha(nome);
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro ?? 'Não foi possível localizar esse usuário.');
      return;
    }
    setMensagem('Pronto! Sua senha provisória voltou a ser sua matrícula. Faça login novamente para criar uma nova senha.');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.iconCircle} />
      <Text style={styles.title}>Esqueci minha senha</Text>
      <Text style={styles.subtitle}>
        Digite seu usuário. A gerência vai receber o pedido e gerar uma nova senha provisória pra você.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Usuário</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: Reni"
          placeholderTextColor={colors.gray400}
          autoCapitalize="words"
          value={nome}
          onChangeText={setNome}
        />

        {erro ? <Text style={styles.erro}>{erro}</Text> : null}
        {mensagem ? <Text style={styles.sucesso}>{mensagem}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={handleSolicitar} disabled={enviando}>
          <Text style={styles.buttonLabel}>{enviando ? 'Enviando...' : 'Solicitar nova senha'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={onVoltarParaLogin} style={{ marginTop: spacing.xxl }}>
        <Text style={styles.backLink}>← Voltar para o login</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', paddingTop: 80, paddingBottom: 40, backgroundColor: colors.white },
  iconCircle: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: colors.navy700, marginBottom: spacing.xl },
  title: { fontSize: 21, fontWeight: '700', color: colors.navy900, textAlign: 'center' },
  subtitle: { fontSize: 13, color: colors.gray600, textAlign: 'center', marginTop: 4, marginHorizontal: 24, marginBottom: spacing.xxxl },
  card: { width: '85%', backgroundColor: colors.gray50, borderRadius: radius.xl, padding: spacing.xxl },
  label: { fontSize: 12, fontWeight: '500', color: colors.gray600, marginBottom: 6 },
  input: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gray100,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.gray900,
  },
  erro: { color: colors.red500, fontSize: 12, marginTop: spacing.md },
  sucesso: { color: colors.green500, fontSize: 12, marginTop: spacing.md },
  button: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  buttonLabel: { color: colors.white, fontSize: 15, fontWeight: '600' },
  backLink: { color: colors.navy700, fontSize: 12, fontWeight: '600' },
});
