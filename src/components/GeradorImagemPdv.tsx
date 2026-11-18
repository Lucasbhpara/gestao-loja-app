import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { DadosImagemPdv, htmlGerador } from '../lib/imagemPdv';

// WebView invisível que desenha a imagem do mapa dos PDVs num <canvas> e
// devolve o JPEG (dataURL). Só é usado no celular; no navegador a imagem é
// desenhada direto (gerarImagemNaWeb).
export default function GeradorImagemPdv({
  dados,
  onPronto,
  onErro,
}: {
  dados: DadosImagemPdv;
  onPronto: (dataUrl: string) => void;
  onErro: (mensagem: string) => void;
}) {
  return (
    <View style={{ position: 'absolute', width: 2, height: 2, opacity: 0, left: -10, top: -10 }} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        source={{ html: htmlGerador(dados) }}
        javaScriptEnabled
        onMessage={(e) => {
          const msg = e.nativeEvent.data;
          if (msg.startsWith('ERRO:')) onErro(msg.slice(5));
          else onPronto(msg);
        }}
        onError={() => onErro('Não consegui gerar a imagem.')}
      />
    </View>
  );
}
