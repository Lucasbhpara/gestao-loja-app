import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView } from 'react-native';

// Teclado x campos no fim da tela (ex.: "Considerações finais").
// No Android com tela de ponta a ponta o sistema não encolhe mais a tela
// quando o teclado abre, então o campo ficava escondido atrás dele.
// Este hook mede o teclado, devolve a altura pra virar espaço extra no fim
// da rolagem e, quando o campo pediu (focarNoFim), rola a tela até o fim
// assim que o teclado termina de abrir — o campo fica logo acima do teclado.
export function useTeclado() {
  const [altura, setAltura] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const rolarAoAbrir = useRef(false);

  useEffect(() => {
    const eventoAbrir = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const eventoFechar = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const abrir = Keyboard.addListener(eventoAbrir, (e) => {
      setAltura(e.endCoordinates?.height ?? 0);
      if (rolarAoAbrir.current) {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
      }
    });
    const fechar = Keyboard.addListener(eventoFechar, () => {
      setAltura(0);
      rolarAoAbrir.current = false;
    });
    return () => {
      abrir.remove();
      fechar.remove();
    };
  }, []);

  // Chamar no onFocus do campo que fica no fim da tela.
  function focarNoFim() {
    rolarAoAbrir.current = true;
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
  }

  // No iOS o KeyboardAvoidingView já empurra a tela; o espaço extra é só pro Android.
  const espacoExtra = Platform.OS === 'android' ? altura : 0;

  return { scrollRef, focarNoFim, espacoExtra, aberto: altura > 0 };
}
