import React, { useRef } from 'react';
import { Modal, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';

// Câmera para ler o QR Code do cupom fiscal ou o código de barras do produto.
export default function LeitorCodigo({
  visivel,
  modo,
  onLido,
  onCancelar,
}: {
  visivel: boolean;
  modo: 'qr' | 'barras';
  onLido: (texto: string) => void;
  onCancelar: () => void;
}) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const lido = useRef(false);
  const topo = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 52;

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onCancelar} onShow={() => (lido.current = false)}>
      <View style={[st.tela, { paddingTop: topo }]}>
        <View style={st.topo}>
          <Pressable onPress={onCancelar} hitSlop={12} style={st.fechar}>
            <Feather name="x" size={20} color={colors.white} />
          </Pressable>
          <Text style={st.titulo}>{modo === 'qr' ? 'Aponte para o QR Code do cupom' : 'Aponte para o código de barras'}</Text>
        </View>
        {!permissao ? null : !permissao.granted ? (
          <View style={st.centro}>
            <Text style={st.texto}>O app precisa da câmera para ler o código.</Text>
            <Pressable style={st.botao} onPress={pedirPermissao}>
              <Text style={st.botaoTexto}>Permitir câmera</Text>
            </Pressable>
          </View>
        ) : (
          <View style={st.camera}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: modo === 'qr' ? ['qr'] : ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
              onBarcodeScanned={(r) => {
                if (lido.current || !r?.data) return;
                lido.current = true;
                onLido(r.data);
              }}
            />
            <View style={[st.mira, modo === 'qr' ? st.miraQr : st.miraBarras]} pointerEvents="none" />
          </View>
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#0E1B2C', paddingHorizontal: spacing.lg, paddingBottom: 28, gap: spacing.md },
  topo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fechar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  titulo: { flex: 1, color: colors.white, fontSize: 16, fontWeight: '700' },
  camera: { flex: 1, borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  mira: { borderWidth: 3, borderColor: '#2F7BFF', borderRadius: 14 },
  miraQr: { width: 230, height: 230 },
  miraBarras: { width: 280, height: 140 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  texto: { color: colors.white, fontSize: 15, textAlign: 'center' },
  botao: { backgroundColor: '#2F7BFF', borderRadius: radius.md, paddingHorizontal: 22, paddingVertical: 12 },
  botaoTexto: { color: colors.white, fontWeight: '700', fontSize: 15 },
});
