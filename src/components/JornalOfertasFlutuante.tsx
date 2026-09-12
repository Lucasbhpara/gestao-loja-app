import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, spacing } from '../theme/colors';
import { JornalOferta, buscarJornalAtual } from '../data/jornalOfertasApi';
import VisualizadorJornalModal from './VisualizadorJornalModal';

// Bolha flutuante com o jornal de ofertas atual — fica por cima de qualquer
// tela do app enquanto a pessoa está logada (ver App.tsx), do mesmo jeito
// que a janelinha equivalente fica sempre visível no portal. Toca na bolha
// pra abrir, toca em "Minimizar" pra fechar de volta pra bolha.
//
// Quem sobe um jornal novo (PDF) é o administrador, lá no portal — aqui é
// só consulta, pra qualquer colaborador incluindo os admins, igual ao Mapa
// da Loja e as Pontas e Pontos Extras. O mesmo PDF também aparece como
// referência nas conferências do tipo "jornal" (ver VisualizadorJornalModal).
export default function JornalOfertasFlutuante() {
  const [jornal, setJornal] = useState<JornalOferta | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    buscarJornalAtual()
      .then(setJornal)
      .catch(() => setJornal(null));
  }, []);

  // Nada pra mostrar ainda (ou deu erro ao carregar) — some, não atrapalha
  // o resto da tela.
  if (!jornal) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.bolha}
        onPress={() => setAberto(true)}
        activeOpacity={0.85}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.bolhaEmoji}>🗞️</Text>
      </TouchableOpacity>

      <VisualizadorJornalModal
        visible={aberto}
        arquivoUrl={jornal.arquivoUrl}
        onFechar={() => setAberto(false)}
        textoFechar="Minimizar"
      />
    </>
  );
}

const styles = StyleSheet.create({
  bolha: {
    position: 'absolute',
    right: spacing.lg,
    bottom: 96,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.navy700,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 50,
  },
  bolhaEmoji: { fontSize: 24 },
});
