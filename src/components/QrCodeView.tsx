import React, { useMemo } from 'react';
import { View } from 'react-native';
import { gerarQr } from '../lib/qrCode';

// QR code desenhado com quadradinhos do próprio app (sem internet e sem
// site de fora). Junta os quadrados pretos seguidos de cada linha num
// retângulo só, pra ficar leve.
export default function QrCodeView({ valor, tamanho = 220 }: { valor: string; tamanho?: number }) {
  const { n, faixas } = useMemo(() => {
    const m = gerarQr(valor);
    const lista: { x: number; y: number; w: number }[] = [];
    m.forEach((linha, y) => {
      let x = 0;
      while (x < linha.length) {
        if (!linha[x]) {
          x++;
          continue;
        }
        const ini = x;
        while (x < linha.length && linha[x]) x++;
        lista.push({ x: ini, y, w: x - ini });
      }
    });
    return { n: m.length, faixas: lista };
  }, [valor]);
  const borda = 2;
  const mod = tamanho / (n + borda * 2);
  return (
    <View style={{ width: tamanho, height: tamanho, backgroundColor: '#FFFFFF' }}>
      {faixas.map((f, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: (f.x + borda) * mod,
            top: (f.y + borda) * mod,
            width: f.w * mod + 0.5,
            height: mod + 0.5,
            backgroundColor: '#000000',
          }}
        />
      ))}
    </View>
  );
}
