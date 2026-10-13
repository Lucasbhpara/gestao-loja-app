import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';

// Rede de segurança: se alguma tela quebrar, em vez do app fechar sozinho
// aparece esta tela com o motivo (dá pra tirar print e mandar) e um botão
// pra voltar ao início.
export default class LimiteDeErro extends React.Component<
  { children: React.ReactNode; onReiniciar?: () => void },
  { erro: Error | null }
> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: { componentStack?: string | null }) {
    console.error('Tela quebrou:', erro, info?.componentStack);
  }

  reiniciar = () => {
    this.setState({ erro: null });
    this.props.onReiniciar?.();
  };

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    return (
      <View style={styles.fundo}>
        <View style={styles.cartao}>
          <Text style={styles.titulo}>Ops, essa tela deu um problema</Text>
          <Text style={styles.texto}>
            O app não fechou e nada do que já estava salvo foi perdido. Tire um print desta tela e mande pro Lucas, depois toque em
            "Voltar ao início".
          </Text>
          <ScrollView style={styles.detalheCaixa}>
            <Text style={styles.detalhe} selectable>
              {String(erro?.message || erro)}
              {'\n\n'}
              {String(erro?.stack || '').split('\n').slice(0, 8).join('\n')}
            </Text>
          </ScrollView>
          <TouchableOpacity style={styles.botao} onPress={this.reiniciar}>
            <Text style={styles.botaoTexto}>Voltar ao início</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: colors.gray50, justifyContent: 'center', padding: spacing.lg },
  cartao: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  titulo: { fontSize: 18, fontWeight: '800', color: colors.navy900 },
  texto: { fontSize: 13.5, color: colors.gray600, marginTop: spacing.sm, lineHeight: 19 },
  detalheCaixa: { maxHeight: 220, backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  detalhe: { fontSize: 11.5, color: colors.gray900, fontFamily: 'monospace' },
  botao: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.lg },
  botaoTexto: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
