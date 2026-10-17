import React, { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Modal, PanResponder, Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { AssinaturaDesenho } from '../data/olhoValidadeApi';

// Assinatura com o dedo, desenhada só com Views (o ULVA não tem
// react-native-svg instalado e isso exigiria um APK novo). Os traços são
// guardados como caminho SVG ("M10 20 L12 22 ..."), igual ao Prevenção SBH,
// então o portal desenha a mesma assinatura com <svg>.

type Ponto = { x: number; y: number };
const ESPESSURA = 3;
const COR = '#121B4A';

function pontosDoCaminho(tracos: string): Ponto[][] {
  const linhas: Ponto[][] = [];
  const re = /([MLl])(-?[\d.]+) (-?[\d.]+)/g;
  let atual: Ponto[] | null = null;
  for (const m of tracos.matchAll(re)) {
    const x = Number(m[2]);
    const y = Number(m[3]);
    if (m[1] === 'M') {
      atual = [{ x, y }];
      linhas.push(atual);
    } else if (atual) {
      const ult = atual[atual.length - 1];
      atual.push(m[1] === 'l' ? { x: ult.x + x, y: ult.y + y } : { x, y });
    }
  }
  return linhas;
}

function Segmentos({ linhas, escala = 1, dx = 0, dy = 0 }: { linhas: Ponto[][]; escala?: number; dx?: number; dy?: number }) {
  const els: React.ReactNode[] = [];
  const e = Math.max(2, ESPESSURA * Math.min(1, escala * 1.4));
  linhas.forEach((pts, i) => {
    if (pts.length === 1) {
      const p = pts[0];
      els.push(
        <View key={`${i}p`} style={{ position: 'absolute', left: p.x * escala + dx - e / 2, top: p.y * escala + dy - e / 2, width: e, height: e, borderRadius: e / 2, backgroundColor: COR }} />,
      );
    }
    for (let k = 1; k < pts.length; k++) {
      const a = { x: pts[k - 1].x * escala + dx, y: pts[k - 1].y * escala + dy };
      const b = { x: pts[k].x * escala + dx, y: pts[k].y * escala + dy };
      const len = Math.hypot(b.x - a.x, b.y - a.y) + e * 0.6;
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      els.push(
        <View
          key={`${i}-${k}`}
          style={{
            position: 'absolute',
            left: (a.x + b.x) / 2 - len / 2,
            top: (a.y + b.y) / 2 - e / 2,
            width: len,
            height: e,
            borderRadius: e / 2,
            backgroundColor: COR,
            transform: [{ rotate: `${ang}rad` }],
          }}
        />,
      );
    }
  });
  return <>{els}</>;
}

export function VisualAssinatura({ desenho, altura = 90 }: { desenho: AssinaturaDesenho; altura?: number }) {
  const [largura, setLargura] = useState(0);
  const linhas = useMemo(() => pontosDoCaminho(desenho.tracos), [desenho.tracos]);
  const area = { w: Math.max(1, largura - 8), h: altura - 8 };
  const escala = Math.min(area.w / desenho.largura, area.h / desenho.altura);
  const dx = 4 + (area.w - desenho.largura * escala) / 2;
  const dy = 4 + (area.h - desenho.altura * escala) / 2;
  return (
    <View style={[st.previa, { height: altura }]} onLayout={(e) => setLargura(e.nativeEvent.layout.width)} pointerEvents="none">
      {largura > 0 ? <Segmentos linhas={linhas} escala={escala} dx={dx} dy={dy} /> : null}
    </View>
  );
}

// Recorta na área usada (com margem) para a assinatura ficar grande na prévia.
function recortar(linhas: Ponto[][]): AssinaturaDesenho {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  linhas.forEach((l) => l.forEach((p) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }));
  const margem = 12;
  const ox = minX - margem;
  const oy = minY - margem;
  const tracos = linhas
    .map((l) => l.map((p, i) => `${i ? 'L' : 'M'}${(p.x - ox).toFixed(1)} ${(p.y - oy).toFixed(1)}`).join(' ') + (l.length === 1 ? ' l0.1 0.1' : ''))
    .join(' ');
  return {
    tracos,
    largura: Math.max(40, Math.round(maxX - minX + 2 * margem)),
    altura: Math.max(30, Math.round(maxY - minY + 2 * margem)),
  };
}

export function PadAssinatura({
  visivel,
  titulo,
  subtitulo,
  onCancelar,
  onSalvar,
}: {
  visivel: boolean;
  titulo: string;
  subtitulo?: string;
  onCancelar: () => void;
  onSalvar: (d: AssinaturaDesenho) => void;
}) {
  const [linhas, setLinhas] = useState<Ponto[][]>([]);
  const atual = useRef<Ponto[]>([]);
  const [, redesenhar] = useState(0);
  const tamanho = useRef({ largura: 1, altura: 1 });
  const origem = useRef({ x: 0, y: 0 });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          // posição = pageX/Y menos a origem medida no 1º toque (locationX "pula" no Android)
          const { locationX, locationY, pageX, pageY } = e.nativeEvent;
          origem.current = { x: pageX - locationX, y: pageY - locationY };
          atual.current = [{ x: locationX, y: locationY }];
          redesenhar((n) => n + 1);
        },
        onPanResponderMove: (e) => {
          const { largura, altura } = tamanho.current;
          const x = Math.max(0, Math.min(largura, e.nativeEvent.pageX - origem.current.x));
          const y = Math.max(0, Math.min(altura, e.nativeEvent.pageY - origem.current.y));
          const ult = atual.current[atual.current.length - 1];
          if (ult && Math.hypot(x - ult.x, y - ult.y) < 2.5) return;
          atual.current = [...atual.current, { x, y }];
          redesenhar((n) => n + 1);
        },
        onPanResponderRelease: () => {
          const t = atual.current;
          atual.current = [];
          if (t.length) setLinhas((x) => [...x, t]);
          redesenhar((n) => n + 1);
        },
      }),
    [],
  );

  const vazio = linhas.length === 0 && atual.current.length === 0;
  const topo = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 12 : 52;

  function salvar() {
    if (!linhas.length) return;
    onSalvar(recortar(linhas));
    setLinhas([]);
  }

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onCancelar}>
      <View style={[st.tela, { paddingTop: topo }]}>
        <View style={st.topo}>
          <Pressable onPress={onCancelar} hitSlop={12} style={st.fechar}>
            <Feather name="x" size={20} color={colors.navy700} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={st.titulo}>{titulo}</Text>
            {subtitulo ? <Text style={st.subtitulo}>{subtitulo}</Text> : null}
          </View>
        </View>

        <View
          style={st.quadro}
          onLayout={(e: LayoutChangeEvent) => {
            tamanho.current = { largura: e.nativeEvent.layout.width, altura: e.nativeEvent.layout.height };
          }}
          {...responder.panHandlers}
        >
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Segmentos linhas={atual.current.length ? [...linhas, atual.current] : linhas} />
          </View>
          <View style={st.linha} pointerEvents="none" />
          {vazio ? (
            <Text style={st.dica} pointerEvents="none">
              Assine aqui com o dedo
            </Text>
          ) : null}
        </View>

        <View style={st.botoes}>
          <Pressable style={[st.botao, st.botaoClaro]} onPress={() => setLinhas([])}>
            <Feather name="rotate-ccw" size={16} color={colors.navy700} />
            <Text style={[st.botaoTexto, { color: colors.navy700 }]}>Limpar</Text>
          </Pressable>
          <Pressable style={[st.botao, { backgroundColor: colors.green500 }, !linhas.length && { opacity: 0.45 }]} onPress={salvar} disabled={!linhas.length}>
            <Feather name="check" size={16} color={colors.white} />
            <Text style={st.botaoTexto}>Salvar assinatura</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.gray50, paddingHorizontal: spacing.lg, paddingBottom: 24, gap: spacing.md },
  topo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fechar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 17, fontWeight: '800', color: colors.navy900 },
  subtitulo: { fontSize: 12.5, color: colors.gray600, marginTop: 2 },
  quadro: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.gray100, overflow: 'hidden' },
  linha: { position: 'absolute', left: 24, right: 24, bottom: '28%', height: 1.5, backgroundColor: colors.gray400 },
  dica: { position: 'absolute', alignSelf: 'center', bottom: '18%', color: colors.gray400, fontSize: 14 },
  botoes: { flexDirection: 'row', gap: spacing.md },
  botao: { flex: 1, minHeight: 50, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  botaoClaro: { backgroundColor: '#E3E7F5' },
  botaoTexto: { color: colors.white, fontWeight: '700', fontSize: 15 },
  previa: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, overflow: 'hidden' },
});
