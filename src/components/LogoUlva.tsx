import React from 'react';
import { View, Animated, ViewStyle, StyleProp } from 'react-native';

// Logo do ULVA 2.0: um "U" com um olho azul no meio. Desenhado só com Views
// (sem react-native-svg, que exigiria um APK novo), na mesma geometria do
// SVG da marca — viewBox 160: braços do U de x=42 a x=118, traço 20, olho
// em (80,74) com raio 15.

export const ULVA_AZUL = '#2F7BFF';
export const ULVA_NAVY = '#0E1B2C';

type Props = {
  tamanho: number;
  corU?: string;
  corOlho?: string;
  // Animações opcionais do olho (piscar / olhar para os lados / aparecer)
  olhoEscalaY?: Animated.Value | Animated.AnimatedInterpolation<number>;
  olhoEscala?: Animated.Value | Animated.AnimatedInterpolation<number>;
  olhoX?: Animated.Value | Animated.AnimatedInterpolation<number>;
  style?: StyleProp<ViewStyle>;
};

export default function LogoUlva({ tamanho, corU = '#F4F5F7', corOlho = ULVA_AZUL, olhoEscalaY, olhoEscala, olhoX, style }: Props) {
  const k = tamanho / 160;
  const traco = 20 * k;
  const olho = 30 * k;
  return (
    <View style={[{ width: tamanho, height: tamanho }, style]}>
      {/* Corpo do U (sem a borda de cima) */}
      <View
        style={{
          position: 'absolute',
          left: 32 * k,
          top: 36 * k,
          width: 96 * k,
          height: 96 * k,
          borderLeftWidth: traco,
          borderRightWidth: traco,
          borderBottomWidth: traco,
          borderTopWidth: 0,
          borderColor: corU,
          borderBottomLeftRadius: 48 * k,
          borderBottomRightRadius: 48 * k,
        }}
      />
      {/* Pontas arredondadas dos braços */}
      <View style={{ position: 'absolute', left: 32 * k, top: 26 * k, width: traco, height: traco, borderRadius: traco / 2, backgroundColor: corU }} />
      <View style={{ position: 'absolute', left: 108 * k, top: 26 * k, width: traco, height: traco, borderRadius: traco / 2, backgroundColor: corU }} />
      {/* Olho */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 65 * k,
          top: 59 * k,
          width: olho,
          height: olho,
          borderRadius: olho / 2,
          backgroundColor: corOlho,
          transform: [
            ...(olhoX ? [{ translateX: olhoX }] : []),
            ...(olhoEscala ? [{ scale: olhoEscala }] : []),
            ...(olhoEscalaY ? [{ scaleY: olhoEscalaY }] : []),
          ],
        }}
      />
    </View>
  );
}
