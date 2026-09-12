import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { AreaMapa, FotoMapa, buscarAreasMapa, buscarFotosDaArea } from '../data/mapaLojaApi';

// Mapa da loja: a planta real da loja (imagem embutida no app) com um botão
// invisível em cima de cada corredor/setor/ponto extra. Tocar numa área abre
// a galeria de fotos daquele trecho — pra qualquer colaborador tirar dúvida
// de onde um produto fica. Quem monta o mapa (criar área, subir foto) é o
// administrador, lá no portal — aqui é só consulta.
const PLANTA = require('../../assets/mapa-loja-planta.png');
// proporção real do arquivo (largura / altura), pra calcular a altura certa
// na tela sem esticar o desenho
const PLANTA_RAZAO = 1400 / 1061;
const TOQUE_MINIMO = 30; // px — área mínima de toque, mesmo pra botões pequenininhos (pilares)

export default function MapaLojaScreen({ onVoltar }: { onVoltar: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [areas, setAreas] = useState<AreaMapa[]>([]);
  const [areaSelecionada, setAreaSelecionada] = useState<AreaMapa | null>(null);

  useEffect(() => {
    buscarAreasMapa()
      .then((lista) => {
        setAreas(lista);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar o mapa da loja.'))
      .finally(() => setCarregando(false));
  }, []);

  // Margem menor que antes (era spacing.xl dos dois lados) pra planta
  // aparecer maior na tela — e agora dá pra belisca-zoom em cima dela
  // (ScrollView com minimumZoomScale/maximumZoomScale abaixo) pra quem
  // quiser ver um corredor de perto.
  const largura = Dimensions.get('window').width - spacing.md * 2;
  const altura = largura / PLANTA_RAZAO;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Mapa da Loja</Text>
        <View style={{ width: 50 }} />
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.navy700} size="large" />
        </View>
      ) : erro ? (
        <View style={styles.centro}>
          <Text style={styles.erroTexto}>{erro}</Text>
        </View>
      ) : areas.length === 0 ? (
        <View style={styles.centro}>
          <Text style={styles.vazioTexto}>
            Ainda não há áreas cadastradas no mapa. Peça pro administrador montar a planta no portal.
          </Text>
        </View>
      ) : (
        <View style={styles.flex}>
          <Text style={styles.dica}>
            Toque numa área pra ver as fotos do posicionamento dos produtos. Belisque a tela com dois dedos pra dar zoom.
          </Text>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.mapaScrollConteudo}
            minimumZoomScale={1}
            maximumZoomScale={3}
            bouncesZoom
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
          <View style={{ width: largura, height: altura, borderRadius: radius.md, overflow: 'hidden' }}>
            <Image source={PLANTA} style={{ width: largura, height: altura }} resizeMode="contain" />
            {areas.map((a) => {
              const wPx = (a.posW / 100) * largura;
              const hPx = (a.posH / 100) * altura;
              const folgaH = Math.max(0, (TOQUE_MINIMO - wPx) / 2);
              const folgaV = Math.max(0, (TOQUE_MINIMO - hPx) / 2);
              // áreas mais altas que largas (a maioria dos corredores) ficam
              // com o texto na vertical — sobra muito mais espaço pra ler
              // o nome do que espremido na largura estreita do corredor
              const vertical = hPx > wPx;
              return (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => setAreaSelecionada(a)}
                  hitSlop={{ top: folgaV, bottom: folgaV, left: folgaH, right: folgaH }}
                  style={[
                    styles.area,
                    {
                      left: `${a.posX}%`,
                      top: `${a.posY}%`,
                      width: `${a.posW}%`,
                      height: `${a.posH}%`,
                      backgroundColor: a.cor + '9E',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.areaTexto,
                      vertical
                        ? { width: hPx - 6, transform: [{ rotate: '-90deg' }] }
                        : { width: wPx - 4 },
                    ]}
                    numberOfLines={vertical ? 1 : 3}
                    ellipsizeMode="tail"
                  >
                    {a.nome}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          </ScrollView>
        </View>
      )}

      {areaSelecionada && (
        <GaleriaFotosArea area={areaSelecionada} onFechar={() => setAreaSelecionada(null)} />
      )}
    </View>
  );
}

function GaleriaFotosArea({ area, onFechar }: { area: AreaMapa; onFechar: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [fotos, setFotos] = useState<FotoMapa[]>([]);
  const [indice, setIndice] = useState(0);
  // true (ou ausente) = ainda carregando essa foto, false = já carregou.
  // Sem isso a área com várias fotos baixava todas de uma vez ao abrir a
  // galeria, disputando a rede entre si e deixando a foto que a pessoa tá
  // realmente vendo mais lenta de aparecer.
  const [carregandoFoto, setCarregandoFoto] = useState<Record<string, boolean>>({});
  const larguraTela = Dimensions.get('window').width;

  useEffect(() => {
    buscarFotosDaArea(area.id)
      .then((lista) => {
        setFotos(lista);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar as fotos.'))
      .finally(() => setCarregando(false));
  }, [area.id]);

  return (
    <Modal visible animationType="slide" onRequestClose={onFechar}>
      <View style={styles.galeriaFlex}>
        <View style={styles.galeriaHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.galeriaTitulo} numberOfLines={1}>{area.nome}</Text>
            {fotos.length > 0 && (
              <Text style={styles.galeriaContagem}>{indice + 1} de {fotos.length}</Text>
            )}
          </View>
          <TouchableOpacity onPress={onFechar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.galeriaFechar}>Fechar</Text>
          </TouchableOpacity>
        </View>

        {carregando ? (
          <View style={styles.centro}>
            <ActivityIndicator color={colors.white} size="large" />
          </View>
        ) : erro ? (
          <View style={styles.centro}>
            <Text style={styles.galeriaVazioTexto}>{erro}</Text>
          </View>
        ) : fotos.length === 0 ? (
          <View style={styles.centro}>
            <Text style={styles.galeriaVazioTexto}>
              Nenhuma foto cadastrada ainda para essa área.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(ev) => {
              const novoIndice = Math.round(ev.nativeEvent.contentOffset.x / larguraTela);
              setIndice(novoIndice);
            }}
          >
            {fotos.map((f, idx) => {
              // Só monta a <Image> (e portanto só baixa) a foto atual e as
              // vizinhas imediatas — as outras ficam de fora até a pessoa
              // chegar perto delas no scroll.
              const pertoDeMostrar = Math.abs(idx - indice) <= 1;
              return (
                <View key={f.id} style={{ width: larguraTela, alignItems: 'center', justifyContent: 'center' }}>
                  {pertoDeMostrar && (
                    <>
                      <Image
                        source={{ uri: f.fotoUrl }}
                        style={styles.galeriaImagem}
                        resizeMode="contain"
                        onLoadStart={() =>
                          setCarregandoFoto((prev) => (prev[f.id] === false ? prev : { ...prev, [f.id]: true }))
                        }
                        onLoadEnd={() => setCarregandoFoto((prev) => ({ ...prev, [f.id]: false }))}
                      />
                      {carregandoFoto[f.id] !== false && (
                        <View style={styles.galeriaCarregando}>
                          <ActivityIndicator color={colors.white} size="large" />
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  voltar: { color: colors.navy700, fontSize: 15, fontWeight: '600' },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.navy900 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  erroTexto: { color: colors.red500, fontSize: 13, textAlign: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  dica: { color: colors.gray600, fontSize: 12.5, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  mapaScrollConteudo: { padding: spacing.md, paddingBottom: 40, alignItems: 'center' },
  area: {
    position: 'absolute',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  areaTexto: { color: colors.white, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  galeriaFlex: { flex: 1, backgroundColor: colors.navy900 },
  galeriaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  galeriaTitulo: { fontSize: 16, fontWeight: '700', color: colors.white },
  galeriaContagem: { fontSize: 11.5, color: colors.gray400, marginTop: 2 },
  galeriaFechar: { color: colors.white, fontSize: 14, fontWeight: '600' },
  galeriaImagem: { width: '100%', height: '100%' },
  galeriaCarregando: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  galeriaVazioTexto: { color: colors.gray400, fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
