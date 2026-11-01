import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { radius } from '../theme/colors';
import { AreaMapa } from '../data/mapaLojaApi';

// A planta da loja com as áreas por cima (o mesmo desenho do Mapa da Loja),
// em versão reaproveitável: a Ruptura usa para escolher "onde estou" e para
// mostrar a rota numerada.
const PLANTA = require('../../assets/mapa-loja-planta.png');
export const PLANTA_RAZAO = 1400 / 1061;
const TOQUE_MINIMO = 30;

export type DestaqueArea = { numero?: number; cor?: string };

export default function MapaPlanta({
  areas,
  largura,
  onToque,
  selecionada,
  destaques,
  apagarResto = false,
  marcadorEntrada,
}: {
  areas: AreaMapa[];
  largura: number;
  onToque?: (a: AreaMapa) => void;
  selecionada?: string | null;
  destaques?: Record<string, DestaqueArea>;
  apagarResto?: boolean; // áreas sem destaque ficam bem clarinhas
  marcadorEntrada?: { x: number; y: number };
}) {
  const altura = largura / PLANTA_RAZAO;
  return (
    <View style={{ width: largura, height: altura, borderRadius: radius.md, overflow: 'hidden' }}>
      <Image source={PLANTA} style={{ width: largura, height: altura }} resizeMode="contain" />
      {areas.map((a) => {
        const wPx = (a.posW / 100) * largura;
        const hPx = (a.posH / 100) * altura;
        const folgaH = Math.max(0, (TOQUE_MINIMO - wPx) / 2);
        const folgaV = Math.max(0, (TOQUE_MINIMO - hPx) / 2);
        const vertical = hPx > wPx;
        const d = destaques?.[a.id];
        const ehSel = selecionada === a.id;
        const apagada = apagarResto && !d && !ehSel;
        return (
          <TouchableOpacity
            key={a.id}
            activeOpacity={onToque ? 0.6 : 1}
            disabled={!onToque}
            onPress={() => onToque?.(a)}
            hitSlop={{ top: folgaV, bottom: folgaV, left: folgaH, right: folgaH }}
            style={[
              styles.area,
              {
                left: `${a.posX}%`,
                top: `${a.posY}%`,
                width: `${a.posW}%`,
                height: `${a.posH}%`,
                backgroundColor: ehSel ? '#2F7BFF' : (d?.cor ?? a.cor) + (apagada ? '33' : '9E'),
                borderWidth: ehSel ? 3 : d ? 2 : 1,
                borderColor: ehSel ? '#0E1B2C' : d ? '#0E1B2C' : 'rgba(255,255,255,0.7)',
              },
            ]}
          >
            {!d?.numero && (
              <Text
                style={[styles.texto, apagada && { opacity: 0.45 }, vertical ? { width: hPx - 6, transform: [{ rotate: '-90deg' }] } : { width: wPx - 4 }]}
                numberOfLines={vertical ? 1 : 3}
                ellipsizeMode="tail"
              >
                {a.nome}
              </Text>
            )}
            {d?.numero != null && (
              <View style={styles.numero}>
                <Text style={styles.numeroTexto}>{d.numero}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
      {marcadorEntrada && (
        <View style={[styles.entrada, { left: `${marcadorEntrada.x}%`, top: `${marcadorEntrada.y}%` }]} pointerEvents="none">
          <Text style={styles.entradaTexto}>Entrada</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { position: 'absolute', borderRadius: 4, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  texto: { color: '#fff', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  numero: { minWidth: 24, height: 24, paddingHorizontal: 4, borderRadius: 12, backgroundColor: '#0E1B2C', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { color: '#fff', fontSize: 12, fontWeight: '900' },
  entrada: { position: 'absolute', transform: [{ translateX: -28 }, { translateY: -18 }], backgroundColor: '#178553', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  entradaTexto: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
