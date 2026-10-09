import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, spacing } from '../theme/colors';
import { PAINEL_INVENTARIO_FLV_HTML } from '../data/painelInventarioFlvHtml';
import CabecalhoTela from '../components/CabecalhoTela';

// Painel só de administrador: essa tela só existe dentro do HomeAdminScreen
// (quem não é admin nunca vê essa opção — ver HomeColaboradorScreen), então
// não precisa de nenhuma trava extra de permissão aqui dentro.
export default function PainelInventarioFlvScreen({ onVoltar }: { onVoltar: () => void }) {
  return (
    <View style={styles.flex}>
      <CabecalhoTela
        titulo="Painel Resultados"
        icone="bar-chart-2"
        onVoltar={onVoltar}
      />

      <WebView
        originWhitelist={['*']}
        source={{ html: PAINEL_INVENTARIO_FLV_HTML }}
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
