import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, LayoutChangeEvent, Platform, StyleProp, View, ViewStyle } from 'react-native';

// =============================================================================
// AreaTeclado — evita que o teclado fique na frente do que está sendo digitado.
//
// No Android com tela de ponta a ponta (Expo atual) o sistema NÃO encolhe mais
// a tela quando o teclado abre, então campos no meio/fim da tela ficavam atrás
// do teclado. Este componente mede o teclado e dá um espaço embaixo do mesmo
// tamanho — mas só o que faltar: se a tela (ou um pai) já encolheu, ele
// desconta, então pode ser usado em vários níveis (raiz do app + Modals) sem
// somar espaço duas vezes. Com a área menor, a rolagem do Android traz o campo
// focado para cima do teclado.
//
// iOS: continua o KeyboardAvoidingView padrão (que já funciona bem lá).
// =============================================================================
export default function AreaTeclado({
  style,
  children,
  keyboardVerticalOffset,
}: {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  keyboardVerticalOffset?: number;
}) {
  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior="padding" keyboardVerticalOffset={keyboardVerticalOffset}>
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <AreaTecladoAndroid style={style}>{children}</AreaTecladoAndroid>;
}

function AreaTecladoAndroid({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const [teclado, setTeclado] = useState(0);
  const [altura, setAltura] = useState(0);
  const alturaSemTeclado = useRef(0);
  const tecladoRef = useRef(0);
  const recalibrar = useRef(true);

  useEffect(() => {
    const abrir = Keyboard.addListener('keyboardDidShow', (e) => {
      tecladoRef.current = e.endCoordinates?.height ?? 0;
      setTeclado(tecladoRef.current);
    });
    const fechar = Keyboard.addListener('keyboardDidHide', () => {
      tecladoRef.current = 0;
      recalibrar.current = true;
      setTeclado(0);
    });
    return () => {
      abrir.remove();
      fechar.remove();
    };
  }, []);

  function aoMedir(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    setAltura(h);
    if (tecladoRef.current === 0) {
      // Se o sistema encolher a tela um instante antes do aviso do teclado,
      // não podemos tomar a altura menor como "sem teclado": por isso só
      // aceitamos uma altura menor logo depois que o teclado fechou.
      if (recalibrar.current) {
        alturaSemTeclado.current = h;
        recalibrar.current = false;
      } else {
        alturaSemTeclado.current = Math.max(alturaSemTeclado.current, h);
      }
    }
  }

  // Quanto a área já encolheu sozinha (sistema ou um pai já deu espaço).
  const jaEncolheu = alturaSemTeclado.current > 0 && altura > 0 ? Math.max(0, alturaSemTeclado.current - altura) : 0;
  const espaco = teclado > 0 ? Math.max(0, teclado - jaEncolheu) : 0;

  return (
    <View style={[{ flex: 1 }, style, espaco > 0 ? { paddingBottom: espaco } : null]} onLayout={aoMedir}>
      {children}
    </View>
  );
}
