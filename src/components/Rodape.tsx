import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

// Frase fixa que aparece bem discreta no rodapé de toda tela do app.
// pointerEvents="none" garante que ela nunca atrapalha um toque em algo
// que esteja embaixo dela (como o botão "+" de várias telas).
export default function Rodape() {
  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.texto}>Criado por Lucas Alberto</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingVertical: 3,
  },
  texto: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.gray400,
    opacity: 0.8,
  },
});
