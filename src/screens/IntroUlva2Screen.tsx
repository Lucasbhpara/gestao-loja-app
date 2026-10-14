import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableWithoutFeedback } from 'react-native';
import LogoUlva, { ULVA_AZUL, ULVA_NAVY } from '../components/LogoUlva';

// Abertura do ULVA 2.0 (substitui o vídeo do lobo): o U entra, o olho
// acende com um brilho, olha para os lados, pisca duas vezes e o nome
// aparece. ~3s no total; tocar na tela pula.
const LOGO = 148;
const k = LOGO / 160;

export default function IntroUlva2Screen({ onFim }: { onFim: () => void }) {
  const tela = useRef(new Animated.Value(1)).current;
  const uOpac = useRef(new Animated.Value(0)).current;
  const uSobe = useRef(new Animated.Value(24)).current;
  const uEscala = useRef(new Animated.Value(0.86)).current;
  const olhoEscala = useRef(new Animated.Value(0)).current;
  const olhoY = useRef(new Animated.Value(1)).current;
  const olhoX = useRef(new Animated.Value(0)).current;
  const brilhoEscala = useRef(new Animated.Value(1)).current;
  const brilhoOpac = useRef(new Animated.Value(0)).current;
  const nomeOpac = useRef(new Animated.Value(0)).current;
  const nomeSobe = useRef(new Animated.Value(14)).current;
  const fraseOpac = useRef(new Animated.Value(0)).current;
  const toqueOpac = useRef(new Animated.Value(0)).current;
  const acabou = useRef(false);

  function finalizar() {
    if (acabou.current) return;
    acabou.current = true;
    Animated.timing(tela, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onFim());
  }

  useEffect(() => {
    const nd = { useNativeDriver: true };
    const piscar = () =>
      Animated.sequence([
        Animated.timing(olhoY, { toValue: 0.08, duration: 85, easing: Easing.in(Easing.quad), ...nd }),
        Animated.timing(olhoY, { toValue: 1, duration: 130, easing: Easing.out(Easing.quad), ...nd }),
      ]);

    const anim = Animated.sequence([
      // 1) U entra
      Animated.parallel([
        Animated.timing(uOpac, { toValue: 1, duration: 420, ...nd }),
        Animated.timing(uSobe, { toValue: 0, duration: 520, easing: Easing.out(Easing.back(1.6)), ...nd }),
        Animated.timing(uEscala, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.6)), ...nd }),
      ]),
      // 2) olho acende com brilho
      Animated.parallel([
        Animated.timing(olhoEscala, { toValue: 1, duration: 380, easing: Easing.out(Easing.back(2.6)), ...nd }),
        Animated.sequence([
          Animated.timing(brilhoOpac, { toValue: 0.55, duration: 80, ...nd }),
          Animated.parallel([
            Animated.timing(brilhoEscala, { toValue: 3.4, duration: 600, easing: Easing.out(Easing.cubic), ...nd }),
            Animated.timing(brilhoOpac, { toValue: 0, duration: 600, ...nd }),
          ]),
        ]),
      ]),
      // 3) olha para os lados
      Animated.timing(olhoX, { toValue: -7 * k, duration: 180, easing: Easing.inOut(Easing.quad), ...nd }),
      Animated.delay(120),
      Animated.timing(olhoX, { toValue: 7 * k, duration: 240, easing: Easing.inOut(Easing.quad), ...nd }),
      Animated.delay(120),
      Animated.timing(olhoX, { toValue: 0, duration: 180, easing: Easing.inOut(Easing.quad), ...nd }),
      // 4) pisca duas vezes enquanto o nome aparece
      Animated.parallel([
        Animated.sequence([piscar(), Animated.delay(140), piscar()]),
        Animated.parallel([
          Animated.timing(nomeOpac, { toValue: 1, duration: 380, ...nd }),
          Animated.timing(nomeSobe, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), ...nd }),
        ]),
        Animated.timing(fraseOpac, { toValue: 1, duration: 380, delay: 220, ...nd }),
      ]),
      Animated.delay(900),
    ]);
    anim.start(({ finished }) => finished && finalizar());

    Animated.timing(toqueOpac, { toValue: 1, duration: 350, delay: 1200, ...nd }).start();
    // Rede de segurança: nunca prende a pessoa na abertura.
    const t = setTimeout(finalizar, 6000);
    return () => {
      clearTimeout(t);
      anim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const olho = 30 * k;
  return (
    <TouchableWithoutFeedback onPress={finalizar}>
      <Animated.View style={[s.tela, { opacity: tela }]}>
        <Animated.View style={{ opacity: uOpac, transform: [{ translateY: uSobe }, { scale: uEscala }] }}>
          <View style={{ width: LOGO, height: LOGO }}>
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 65 * k,
                top: 59 * k,
                width: olho,
                height: olho,
                borderRadius: olho / 2,
                backgroundColor: ULVA_AZUL,
                opacity: brilhoOpac,
                transform: [{ scale: brilhoEscala }],
              }}
            />
            <LogoUlva tamanho={LOGO} olhoEscala={olhoEscala} olhoEscalaY={olhoY} olhoX={olhoX} />
          </View>
        </Animated.View>
        <Animated.Text style={[s.nome, { opacity: nomeOpac, transform: [{ translateY: nomeSobe }] }]}>ULVA</Animated.Text>
        <Animated.Text style={[s.frase, { opacity: fraseOpac }]}>A loja inteira na palma da mão.</Animated.Text>
        <Animated.Text style={[s.toque, { opacity: toqueOpac }]}>toque para continuar</Animated.Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: ULVA_NAVY, alignItems: 'center', justifyContent: 'center' },
  nome: { marginTop: 14, fontSize: 38, fontWeight: '800', letterSpacing: 4, color: '#FFFFFF' },
  frase: { marginTop: 8, fontSize: 14, fontWeight: '600', color: '#B9C3D3' },
  toque: {
    position: 'absolute', bottom: 56, fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
});
