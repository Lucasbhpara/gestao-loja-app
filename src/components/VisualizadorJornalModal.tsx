import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, spacing } from '../theme/colors';

// Visor em tela cheia do Jornal de Ofertas (PDF), compartilhado entre a
// bolha flutuante (JornalOfertasFlutuante) e as telas de Conferência do tipo
// "jornal" — lá ele serve de referência pra quem tá conferindo os itens do
// encarte, sem precisar sair da conferência pra achar o PDF em outro lugar.
export default function VisualizadorJornalModal({
  visible,
  arquivoUrl,
  onFechar,
  titulo = 'Jornal de Ofertas',
  textoFechar = 'Fechar',
}: {
  visible: boolean;
  arquivoUrl: string;
  onFechar: () => void;
  titulo?: string;
  textoFechar?: string;
}) {
  const urlVisualizacao = 'https://docs.google.com/viewer?embedded=true&url=' + encodeURIComponent(arquivoUrl);

  // Aquela leve travadinha ao abrir o jornal acontecia porque o Modal
  // começava a deslizar pra cima e, no mesmo instante, o app tentava montar
  // a WebView (que já sai carregando uma página inteira do Google Docs
  // Viewer) — as duas coisas pesadas ao mesmo tempo prendiam a tela por uma
  // fração de segundo. Aqui a WebView só entra depois que a animação do
  // Modal termina; até lá mostramos só um "carregando" leve.
  const [prontoParaWebview, setProntoParaWebview] = useState(false);
  useEffect(() => {
    if (!visible) {
      setProntoParaWebview(false);
      return;
    }
    const id = setTimeout(() => setProntoParaWebview(true), 350);
    return () => clearTimeout(id);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFechar}>
      <View style={styles.flex}>
        <View style={styles.header}>
          <Text style={styles.titulo}>{titulo}</Text>
          <TouchableOpacity onPress={onFechar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.fechar}>{textoFechar}</Text>
          </TouchableOpacity>
        </View>
        {prontoParaWebview ? (
          <WebView
            source={{ uri: urlVisualizacao }}
            style={styles.flex}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.carregando}>
                <ActivityIndicator color={colors.navy700} size="large" />
              </View>
            )}
          />
        ) : (
          <View style={styles.carregando}>
            <ActivityIndicator color={colors.navy700} size="large" />
          </View>
        )}
      </View>
    </Modal>
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
  titulo: { fontSize: 16, fontWeight: '700', color: colors.navy900 },
  fechar: { color: colors.navy700, fontSize: 14, fontWeight: '600' },
  carregando: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
});
