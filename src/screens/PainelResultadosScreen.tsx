import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, spacing } from '../theme/colors';
import { PAINEL_RESULTADOS_HTML } from '../data/painelResultadosHtml';

// Painel só de administrador: essa tela só existe dentro do HomeAdminScreen
// (quem não é admin nunca vê essa opção — ver HomeColaboradorScreen), então
// não precisa de nenhuma trava extra de permissão aqui dentro.
//
// O HTML já traz todos os setores (FLV, Açougue, ...) com um seletor próprio
// lá dentro — essa tela só hospeda a WebView, não escolhe setor nenhum.
export default function PainelResultadosScreen({ onVoltar }: { onVoltar: () => void }) {
  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Painel Resultados</Text>
        <View style={{ width: 50 }} />
      </View>

      <WebView
        originWhitelist={['*']}
        source={{ html: PAINEL_RESULTADOS_HTML }}
        style={styles.flex}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.carregando}>
            <ActivityIndicator color={colors.navy700} size="large" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
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
  carregando: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
});
