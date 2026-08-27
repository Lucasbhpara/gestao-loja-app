import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';

export default function SobreScreen({ onVoltar }: { onVoltar: () => void }) {
  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Sobre</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={styles.iconeBox}>
          <Image source={require('../../assets/icon.png')} style={styles.icone} />
        </View>

        <Text style={styles.nomeApp}>ULVA</Text>
        <Text style={styles.unidade}>Gestão de Loja · Unidade 327</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>O que significa ULVA</Text>
          <Text style={styles.significadoTexto}>
            <Text style={styles.significadoDestaque}>Etimologia: </Text>
            vem do nórdico antigo <Text style={styles.significadoItalico}>Úlfa</Text>, e também do
            germânico — a versão feminina de "lobo".
          </Text>
          <Text style={[styles.significadoTexto, { marginTop: spacing.md }]}>
            <Text style={styles.significadoDestaque}>O conceito: </Text>
            na natureza, as lobas têm um papel essencial de coesão, sobrevivência e mentoria dentro da
            alcateia. Elas não apenas caçam — são as principais responsáveis pelo cuidado, pela educação e
            pela proteção dos membros mais jovens ou vulneráveis do grupo.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitulo}>Por que esse app existe</Text>
          <Text style={styles.mensagem}>
            "Aplicativo criado para a unidade 327 afim de melhorar e otimizar o nosso dia a dia, façam bom
            uso que está ferramenta é de grande importância para mim, que dê certo."
          </Text>
          <Text style={styles.assinatura}>— Lucas Alberto</Text>
        </View>
      </ScrollView>
    </View>
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
  voltar: { color: colors.navy700, fontSize: 15, fontWeight: '600' },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.navy900 },
  iconeBox: { alignItems: 'center', marginTop: spacing.xl },
  icone: { width: 88, height: 88, borderRadius: radius.full },
  nomeApp: { fontSize: 19, fontWeight: '700', color: colors.navy900, textAlign: 'center', marginTop: spacing.lg },
  unidade: { fontSize: 12.5, color: colors.gray600, textAlign: 'center', marginTop: 2, fontWeight: '600' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.xxl,
  },
  cardTitulo: { fontSize: 13, fontWeight: '700', color: colors.navy700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.md },
  significadoTexto: { fontSize: 13.5, color: colors.gray900, lineHeight: 21 },
  significadoDestaque: { fontWeight: '700', color: colors.navy900 },
  significadoItalico: { fontStyle: 'italic' },
  mensagem: { fontSize: 14, color: colors.gray900, lineHeight: 22, fontStyle: 'italic' },
  assinatura: { fontSize: 12.5, color: colors.navy700, fontWeight: '700', marginTop: spacing.lg, textAlign: 'right' },
});
