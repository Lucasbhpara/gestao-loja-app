import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

// Exibida automaticamente quando `usuarioAtual.senhaDefinida === false`
// (primeiro acesso, ou depois de uma recuperação de senha).
export default function CreatePasswordScreen() {
  const { definirNovaSenha } = useAuth();
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar() {
    if (novaSenha.trim().length < 6) {
      setErro('A senha precisa ter pelo menos 6 dígitos.');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem.');
      return;
    }
    setErro(null);
    setSalvando(true);
    await definirNovaSenha(novaSenha.trim());
    setSalvando(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.iconCircle} />
      <Text style={styles.title}>Crie sua nova senha</Text>
      <Text style={styles.subtitle}>
        Primeiro acesso — por segurança, defina uma senha só sua antes de continuar.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Nova senha</Text>
        <TextInput
          style={styles.input}
          placeholder="Mínimo 6 dígitos"
          placeholderTextColor={colors.gray400}
          secureTextEntry
          value={novaSenha}
          onChangeText={setNovaSenha}
        />

        <Text style={[styles.label, { marginTop: spacing.lg }]}>Confirmar nova senha</Text>
        <TextInput
          style={styles.input}
          placeholder="Repita a nova senha"
          placeholderTextColor={colors.gray400}
          secureTextEntry
          value={confirmarSenha}
          onChangeText={setConfirmarSenha}
        />

        {erro ? <Text style={styles.erro}>{erro}</Text> : null}

        <Text style={styles.hint}>Sua matrícula deixa de funcionar como senha assim que você salvar.</Text>

        <TouchableOpacity style={styles.button} onPress={handleSalvar} disabled={salvando}>
          <Text style={styles.buttonLabel}>{salvando ? 'Salvando...' : 'Salvar e continuar'}</Text>
        </TouchableOpacity>
      </View>
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
  hint: { color: colors.gray600, fontSize: 11, marginTop: spacing.md },
  button: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  buttonLabel: { color: colors.white, fontSize: 15, fontWeight: '600' },
});
