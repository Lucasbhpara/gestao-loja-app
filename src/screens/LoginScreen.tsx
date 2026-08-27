import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

interface Props {
  onIrParaRecuperarSenha: () => void;
}

export default function LoginScreen({ onIrParaRecuperarSenha }: Props) {
  const { login } = useAuth();
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleEntrar() {
    if (!nome.trim() || !senha.trim()) {
      setErro('Preencha usuário e senha.');
      return;
    }
    setErro(null);
    setEnviando(true);
    const resultado = await login(nome, senha);
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro ?? 'Não foi possível entrar.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.logo}>
          <Image source={require('../../assets/icon.png')} style={styles.logoImagem} />
        </View>
        <Text style={styles.title}>ULVA</Text>
        <Text style={styles.subtitle}>Gestão de Loja · Acesso da equipe</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Usuário</Text>
          <TextInput
            style={styles.input}
            placeholder="Digite seu nome"
            placeholderTextColor={colors.gray400}
            autoCapitalize="words"
            value={nome}
            onChangeText={setNome}
          />

          <Text style={[styles.label, { marginTop: spacing.lg }]}>Senha</Text>
          <TextInput
            style={styles.input}
            placeholder="Sua matrícula (primeiro acesso)"
            placeholderTextColor={colors.gray400}
            secureTextEntry
            value={senha}
            onChangeText={setSenha}
          />

          {erro ? <Text style={styles.erro}>{erro}</Text> : null}

          <TouchableOpacity onPress={onIrParaRecuperarSenha} style={styles.forgotWrap}>
            <Text style={styles.forgot}>Esqueci minha senha</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={handleEntrar} disabled={enviando}>
            <Text style={styles.buttonLabel}>{enviando ? 'Entrando...' : 'Entrar'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.signature}>Idealizado por Lucas Alberto</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 40,
    backgroundColor: colors.white,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.navy700,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  logoImagem: { width: '100%', height: '100%' },
  title: { fontSize: 22, fontWeight: '700', color: colors.navy900 },
  subtitle: { fontSize: 13, color: colors.gray600, marginTop: 4, marginBottom: spacing.xxxl },
  card: {
    width: '85%',
    backgroundColor: colors.gray50,
    borderRadius: radius.xl,
    padding: spacing.xxl,
  },
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
  forgotWrap: { alignSelf: 'flex-end', marginTop: spacing.md },
  forgot: { color: colors.navy700, fontSize: 12, fontWeight: '600' },
  button: {
    backgroundColor: colors.navy700,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonLabel: { color: colors.white, fontSize: 15, fontWeight: '600' },
  signature: { color: colors.navy700, fontSize: 12, fontWeight: '500', marginTop: spacing.xxxl },
});
