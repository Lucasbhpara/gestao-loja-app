import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, spacing } from '../theme/colors';
import { JornalOferta, buscarJornalAtual } from '../data/jornalOfertasApi';

// Tela própria do Jornal de Ofertas — acessada pelo tile "Jornal de Ofertas"
// na Home, igual Mapa da Loja e Pontas e Pontos Extras. Antes isso era uma
// bolha flutuante por cima de todas as telas (JornalOfertasFlutuante), mas
// ela não estava aparecendo de forma confiável em toda tela (ex.: dentro de
// Pontas e Pontos Extras) — uma aba de verdade na Home é mais previsível.
//
// Quem sobe um jornal novo (PDF) é o administrador, lá no portal — aqui é
// só consulta, pra qualquer colaborador incluindo os admins.
export default function JornalOfertasScreen({ onVoltar }: { onVoltar: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [jornal, setJornal] = useState<JornalOferta | null>(null);

  useEffect(() => {
    buscarJornalAtual()
      .then(setJornal)
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar o jornal de ofertas.'))
      .finally(() => setCarregando(false));
  }, []);

  const urlVisualizacao = jornal
    ? 'https://docs.google.com/viewer?embedded=true&url=' + encodeURIComponent(jornal.arquivoUrl)
    : null;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Jornal de Ofertas</Text>
        <View style={{ width: 50 }} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.navy700} size="large" />
        </View>
      ) : erro ? (
        <View style={styles.centro}>
          <Text style={styles.erroTexto}>{erro}</Text>
        </View>
      ) : !jornal || !urlVisualizacao ? (
        <View style={styles.centro}>
          <Text style={styles.vazioTexto}>
            Nenhum jornal de ofertas enviado ainda. Peça pro administrador subir um PDF no portal.
          </Text>
        </View>
      ) : (
        <WebView
          source={{ uri: urlVisualizacao }}
          style={styles.flex}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.centro}>
              <ActivityIndicator color={colors.navy700} size="large" />
            </View>
          )}
        />
      )}
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
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  erroTexto: { color: colors.red500, fontSize: 13, textAlign: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
