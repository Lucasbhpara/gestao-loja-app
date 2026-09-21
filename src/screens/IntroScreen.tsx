import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, TouchableWithoutFeedback, Image, Easing } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import { colors } from '../theme/colors';

// Intro animado, tipo o da Netflix/Disney+ quando abre o app: o vídeo do
// lobo uivando (~6,4s, já cortado e com fade nas pontas) toca primeiro, e
// se dissolve pro logo/nome ULVA no final — sem "morphing" literal, é um
// crossfade (a mesma técnica que a maioria das aberturas de marca usa).
// Toca sozinho toda vez que o app abre do zero, e dá pra tocar na tela pra
// pular a qualquer momento (a mesma pessoa abre o app várias vezes por
// turno de trabalho, diferente de um streaming).
const FALLBACK_MS = 4000; // se o vídeo não carregar por algum motivo, não trava o acesso ao app
const HOLD_LOGO_MS = 900; // quanto tempo o logo fica sozinho na tela depois do vídeo

export default function IntroScreen({ onFim }: { onFim: () => void }) {
  const opacidadeTela = useRef(new Animated.Value(1)).current;
  const opacidadeVideo = useRef(new Animated.Value(1)).current;
  const opacidadeLogo = useRef(new Animated.Value(0)).current;
  const escalaLogo = useRef(new Animated.Value(0.85)).current;
  const opacidadeToque = useRef(new Animated.Value(0)).current;

  const [terminado, setTerminado] = useState(false);
  const [videoFalhou, setVideoFalhou] = useState(false);
  const jaCruzou = useRef(false);

  // expo-video: o "player" é o controlador (equivalente ao antigo videoRef +
  // expo-av), criado uma vez e reaproveitado — troca direta do expo-av
  // (removido a partir do SDK 55) por expo-video, sem mudar o comportamento.
  const player = useVideoPlayer(require('../../assets/intro/lobo_intro.mp4'), (p) => {
    p.loop = false;
    p.play();
  });

  function finalizar() {
    if (terminado) return;
    setTerminado(true);
    try {
      player.pause();
    } catch {
      // Sem problema se o player já não existir mais nesse momento.
    }
    Animated.timing(opacidadeTela, {
      toValue: 0,
      duration: 350,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => onFim());
  }

  // Dissolve: o vídeo desaparece enquanto o logo/nome ULVA aparece por
  // cima, ao mesmo tempo — não é um corte seco.
  function mostrarLogo() {
    if (jaCruzou.current) return;
    jaCruzou.current = true;
    Animated.parallel([
      Animated.timing(opacidadeVideo, { toValue: 0, duration: 550, useNativeDriver: true }),
      Animated.timing(opacidadeLogo, { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.timing(escalaLogo, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(finalizar, HOLD_LOGO_MS);
    });
  }

  // Toca uma vez e cruza pro logo (equivalente ao antigo didJustFinish).
  useEventListener(player, 'playToEnd', () => {
    mostrarLogo();
  });

  // Se o vídeo falhar ao carregar/tocar, cai no mesmo caminho do fallback:
  // esconde o vídeo e vai direto pro logo, sem travar o acesso ao app.
  useEventListener(player, 'statusChange', ({ status, error }) => {
    if (status === 'error' || error) {
      setVideoFalhou(true);
      mostrarLogo();
    }
  });

  useEffect(() => {
    Animated.timing(opacidadeToque, {
      toValue: 1,
      duration: 350,
      delay: 1200,
      useNativeDriver: true,
    }).start();

    // Rede de segurança: se o vídeo não conseguir carregar/tocar por
    // algum motivo (arquivo, aparelho, o que for), não deixa a pessoa
    // presa na tela de intro sem conseguir entrar no app.
    const timerFallback = setTimeout(() => {
      if (!jaCruzou.current) mostrarLogo();
    }, FALLBACK_MS);

    return () => clearTimeout(timerFallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TouchableWithoutFeedback onPress={finalizar}>
      <Animated.View style={[styles.flex, { opacity: opacidadeTela }]}>
        {!videoFalhou && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacidadeVideo }]}>
            <VideoView
              player={player}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
          </Animated.View>
        )}

        <Animated.View
          style={[styles.logoGrupo, { opacity: opacidadeLogo, transform: [{ scale: escalaLogo }] }]}
          pointerEvents="none"
        >
          <View style={styles.logoBox}>
            <Image source={require('../../assets/icon.png')} style={styles.logo} />
          </View>
          <Text style={styles.titulo}>ULVA</Text>
          <Text style={styles.tagline}>Gestão na palma da sua mão</Text>
        </Animated.View>

        <Animated.Text style={[styles.toque, { opacity: opacidadeToque }]}>toque para continuar</Animated.Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.navy900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGrupo: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBox: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  logo: { width: '100%', height: '100%' },
  titulo: {
    marginTop: 22,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.white,
  },
  tagline: {
    marginTop: 6,
    fontSize: 12.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  toque: {
    position: 'absolute',
    bottom: 56,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
