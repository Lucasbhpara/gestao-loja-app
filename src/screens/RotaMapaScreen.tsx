import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import MapaPlanta, { DestaqueArea } from '../components/MapaPlanta';
import SeletorAreaMapa from '../components/SeletorAreaMapa';
import { AreaMapa } from '../data/mapaLojaApi';
import { ENTRADA, buscarAreasComCache, buscarAreasDosGrupos, buscarLocalizacoes, ordenarRota, salvarLocalManual } from '../data/rupturaMapaApi';

// Rota no mapa: pega uma lista de produtos (ex.: tratativas filtradas), acha
// a área de cada um (onde foi bipado na Ruptura ou, se ainda não, a área do
// grupo) e monta a ordem de visita saindo da entrada da loja. Cada parada
// aparece numerada no mapa e na lista; dá para ir marcando o que já conferiu.

export type ItemRota = { codigoInterno: string; produto: string; grupoId: string | null; detalhe?: string };

const AZUL = '#2F7BFF';

export default function RotaMapaScreen({ itens, titulo = 'Rota no mapa', onVoltar }: { itens: ItemRota[]; titulo?: string; onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const quem = usuarioAtual?.nome ?? '';
  const [areas, setAreas] = useState<AreaMapa[]>([]);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [doGrupo, setDoGrupo] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [conferidos, setConferidos] = useState<Set<string>>(new Set());
  const [definir, setDefinir] = useState<ItemRota | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [a, g, l] = await Promise.all([
        buscarAreasComCache(),
        buscarAreasDosGrupos(),
        buscarLocalizacoes(itens.map((i) => i.codigoInterno)).catch(() => ({} as Record<string, string>)),
      ]);
      setAreas(a);
      setDoGrupo(g);
      setLocal(l);
    } catch (e: any) {
      Alert.alert('Não consegui abrir o mapa', e?.message ?? '');
    } finally {
      setCarregando(false);
    }
  }, [itens]);
  useEffect(() => { carregar(); }, [carregar]);

  const porId = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const areaDe = (it: ItemRota): { id: string; certeza: 'bipado' | 'grupo' } | null => {
    if (local[it.codigoInterno] && porId.has(local[it.codigoInterno])) return { id: local[it.codigoInterno], certeza: 'bipado' };
    if (it.grupoId && doGrupo[it.grupoId] && porId.has(doGrupo[it.grupoId])) return { id: doGrupo[it.grupoId], certeza: 'grupo' };
    return null;
  };

  const { paradas, semLocal } = useMemo(() => {
    const grupos = new Map<string, { item: ItemRota; certeza: 'bipado' | 'grupo' }[]>();
    const sem: ItemRota[] = [];
    for (const it of itens) {
      const a = areaDe(it);
      if (!a) { sem.push(it); continue; }
      if (!grupos.has(a.id)) grupos.set(a.id, []);
      grupos.get(a.id)!.push({ item: it, certeza: a.certeza });
    }
    const ordem = ordenarRota([...grupos.keys()].map((id) => porId.get(id)!));
    return {
      paradas: ordem.map((a, i) => ({ numero: i + 1, area: a, itens: grupos.get(a.id)!.sort((x, y) => x.item.produto.localeCompare(y.item.produto)) })),
      semLocal: sem,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, local, doGrupo, porId]);

  const destaques: Record<string, DestaqueArea> = {};
  paradas.forEach((p) => {
    const tudo = p.itens.every((x) => conferidos.has(x.item.codigoInterno));
    destaques[p.area.id] = { numero: p.numero, cor: tudo ? '#178553' : AZUL };
  });
  const totalConferidos = itens.filter((i) => conferidos.has(i.codigoInterno)).length;
  const largura = Dimensions.get('window').width - spacing.md * 2;

  const alternar = (cod: string) => {
    const n = new Set(conferidos);
    n.has(cod) ? n.delete(cod) : n.add(cod);
    setConferidos(n);
  };

  async function salvarLocal(a: AreaMapa) {
    const it = definir;
    setDefinir(null);
    if (!it) return;
    setLocal((m) => ({ ...m, [it.codigoInterno]: a.id }));
    try {
      await salvarLocalManual(it.codigoInterno, it.produto, a.id, it.grupoId, quem);
    } catch (e: any) {
      Alert.alert('Não consegui salvar o local', e?.message ?? '');
    }
  }

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo={titulo} subtitulo={`${itens.length} produtos · ${paradas.length} paradas`} icone="navigation" onVoltar={onVoltar} />
      {carregando ? (
        <View style={styles.centro}><ActivityIndicator color={colors.navy700} size="large" /></View>
      ) : !areas.length ? (
        <View style={styles.centro}><Text style={styles.vazio}>O mapa da loja ainda não tem áreas cadastradas (portal → Mapa da Loja).</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 60 }}>
          <View style={{ alignItems: 'center' }}>
            <MapaPlanta areas={areas} largura={largura} destaques={destaques} apagarResto marcadorEntrada={ENTRADA} />
          </View>
          <View style={styles.resumo}>
            <Text style={styles.resumoTexto}>Saindo da entrada, siga os números. {totalConferidos} de {itens.length} conferidos.</Text>
            {totalConferidos > 0 && (
              <TouchableOpacity onPress={() => setConferidos(new Set())}><Text style={styles.link}>Zerar</Text></TouchableOpacity>
            )}
          </View>

          {paradas.map((p) => {
            const feitos = p.itens.filter((x) => conferidos.has(x.item.codigoInterno)).length;
            return (
              <View key={p.area.id} style={[styles.parada, feitos === p.itens.length && { borderColor: '#178553' }]}>
                <View style={styles.paradaTopo}>
                  <View style={[styles.num, feitos === p.itens.length && { backgroundColor: '#178553' }]}><Text style={styles.numTexto}>{p.numero}</Text></View>
                  <Text style={styles.paradaNome}>{p.area.nome}</Text>
                  <Text style={styles.paradaQtd}>{feitos}/{p.itens.length}</Text>
                </View>
                {p.itens.map(({ item, certeza }) => {
                  const ok = conferidos.has(item.codigoInterno);
                  return (
                    <TouchableOpacity key={item.codigoInterno} style={styles.item} onPress={() => alternar(item.codigoInterno)} onLongPress={() => setDefinir(item)}>
                      <Feather name={ok ? 'check-circle' : 'circle'} size={20} color={ok ? '#178553' : colors.gray400} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemNome, ok && styles.riscado]}>{item.produto}</Text>
                        <Text style={styles.itemDet}>
                          {item.codigoInterno}{item.detalhe ? ` · ${item.detalhe}` : ''}{certeza === 'grupo' ? ' · local do grupo' : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}

          {semLocal.length > 0 && (
            <View style={[styles.parada, { borderStyle: 'dashed' }]}>
              <Text style={styles.paradaNome}>Sem local no mapa ({semLocal.length})</Text>
              <Text style={styles.itemDet}>Ainda não foram bipados com “Estou em” e o grupo não tem área. Toque para marcar no mapa.</Text>
              {semLocal.map((item) => (
                <TouchableOpacity key={item.codigoInterno} style={styles.item} onPress={() => setDefinir(item)}>
                  <Feather name="map-pin" size={18} color={AZUL} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemNome}>{item.produto}</Text>
                    <Text style={styles.itemDet}>{item.codigoInterno}{item.detalhe ? ` · ${item.detalhe}` : ''}</Text>
                  </View>
                  <Text style={styles.link}>Marcar</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {paradas.length > 0 && <Text style={styles.nota}>Segure o dedo num produto para corrigir o local dele no mapa.</Text>}
        </ScrollView>
      )}
      <SeletorAreaMapa
        visivel={!!definir}
        titulo="Onde fica este produto?"
        subtitulo={definir?.produto}
        areas={areas}
        inicial={definir ? areaDe(definir)?.id ?? null : null}
        textoConfirmar="Salvar local"
        onEscolher={salvarLocal}
        onFechar={() => setDefinir(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.gray50 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  vazio: { color: colors.gray600, textAlign: 'center' },
  resumo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  resumoTexto: { flex: 1, fontSize: 12.5, color: colors.gray600 },
  link: { color: AZUL, fontWeight: '800' },
  parada: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: spacing.md, marginBottom: spacing.sm },
  paradaTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#0E1B2C', alignItems: 'center', justifyContent: 'center' },
  numTexto: { color: colors.white, fontWeight: '900', fontSize: 12.5 },
  paradaNome: { flex: 1, fontSize: 14.5, fontWeight: '800', color: colors.navy900 },
  paradaQtd: { fontSize: 12, fontWeight: '700', color: colors.gray600 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.gray50 },
  itemNome: { fontSize: 13.5, fontWeight: '600', color: colors.gray900 },
  riscado: { textDecorationLine: 'line-through', color: colors.gray400 },
  itemDet: { fontSize: 11.5, color: colors.gray600, marginTop: 1 },
  nota: { fontSize: 11.5, color: colors.gray600, textAlign: 'center', marginTop: spacing.sm },
});
