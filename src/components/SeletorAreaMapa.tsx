import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { AreaMapa } from '../data/mapaLojaApi';
import MapaPlanta from './MapaPlanta';

// Tela cheia com a planta da loja para tocar na área certa e confirmar.
export default function SeletorAreaMapa({
  visivel,
  titulo,
  subtitulo,
  areas,
  inicial,
  textoConfirmar = 'Confirmar',
  onEscolher,
  onFechar,
  textoPular,
  onPular,
}: {
  visivel: boolean;
  titulo: string;
  subtitulo?: string;
  areas: AreaMapa[];
  inicial?: string | null;
  textoConfirmar?: string;
  onEscolher: (a: AreaMapa) => void;
  onFechar: () => void;
  textoPular?: string;
  onPular?: () => void;
}) {
  const [sel, setSel] = useState<string | null>(inicial ?? null);
  useEffect(() => { if (visivel) setSel(inicial ?? null); }, [visivel, inicial]);
  const largura = Dimensions.get('window').width - spacing.md * 2;
  const area = areas.find((a) => a.id === sel) ?? null;

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar}>
      <View style={styles.tela}>
        <View style={styles.topo}>
          <TouchableOpacity onPress={onFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={24} color={colors.navy900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>{titulo}</Text>
            {subtitulo ? <Text style={styles.sub}>{subtitulo}</Text> : null}
          </View>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.md, alignItems: 'center' }}
          minimumZoomScale={1}
          maximumZoomScale={3}
          bouncesZoom
        >
          <MapaPlanta areas={areas} largura={largura} selecionada={sel} onToque={(a) => setSel(a.id)} />
          <Text style={styles.dica}>Toque na área do mapa. Dá para dar zoom com dois dedos.</Text>
        </ScrollView>
        <View style={styles.rodape}>
          <Text style={styles.escolhida} numberOfLines={2}>{area ? `📍 ${area.nome}` : 'Nenhuma área escolhida'}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {onPular && (
              <TouchableOpacity style={[styles.btn, styles.btnSec]} onPress={onPular}>
                <Text style={[styles.btnTexto, { color: colors.navy700 }]}>{textoPular ?? 'Agora não'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.btn, { flex: 1 }, !area && { opacity: 0.5 }]} disabled={!area} onPress={() => area && onEscolher(area)}>
              <Feather name="check" size={18} color={colors.white} />
              <Text style={styles.btnTexto}>{textoConfirmar}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.gray50, paddingTop: 44 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  titulo: { fontSize: 17, fontWeight: '800', color: colors.navy900 },
  sub: { fontSize: 12.5, color: colors.gray600, marginTop: 2 },
  dica: { fontSize: 12, color: colors.gray600, marginTop: spacing.sm, textAlign: 'center' },
  rodape: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.gray100, backgroundColor: colors.white, gap: spacing.sm },
  escolhida: { fontSize: 14, fontWeight: '700', color: colors.navy900 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2F7BFF', borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 16 },
  btnSec: { backgroundColor: colors.gray100 },
  btnTexto: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
