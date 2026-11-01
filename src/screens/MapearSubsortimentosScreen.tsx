import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import SeletorAreaMapa from '../components/SeletorAreaMapa';
import { AreaMapa } from '../data/mapaLojaApi';
import { Subsortimento, buscarAreasComCache, buscarSubsortimentos, salvarAreaSubsortimento } from '../data/rupturaMapaApi';

// Mapear sub-sortimentos: em vez de marcar produto a produto, mostra 3
// produtos de exemplo de cada sub-sortimento (classe 4 do cadastro) e você
// toca no corredor uma vez — todos os produtos dele passam a ter local.
// Produto com local próprio (bipado na coleta ou marcado na Busca) continua
// valendo por cima.

const AZUL = '#2F7BFF';
const bonito = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const chave = (s: Subsortimento) => `${s.classe2}|${s.classe3}|${s.classe4}`;

export default function MapearSubsortimentosScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const quem = usuarioAtual?.nome ?? '';
  const [lista, setLista] = useState<Subsortimento[]>([]);
  const [areas, setAreas] = useState<AreaMapa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null); // setor aberto
  const [atual, setAtual] = useState<Subsortimento | null>(null);
  const [emSequencia, setEmSequencia] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [s, a] = await Promise.all([buscarSubsortimentos(), buscarAreasComCache()]);
      setLista(s);
      setAreas(a);
    } catch (e: any) {
      Alert.alert('Não consegui carregar', e?.message ?? '');
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const porId = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const setores = useMemo(() => [...new Set(lista.map((s) => s.classe2))], [lista]);
  const feitos = lista.filter((s) => s.areaId).length;
  const pendentes = lista.filter((s) => !s.areaId);

  function proximoPendente(depoisDe: Subsortimento | null, base = lista): Subsortimento | null {
    const pend = base.filter((s) => !s.areaId);
    if (!depoisDe) return pend[0] ?? null;
    const i = base.findIndex((s) => chave(s) === chave(depoisDe));
    return pend.find((s) => base.indexOf(s) > i) ?? null;
  }

  async function salvar(a: AreaMapa) {
    const s = atual;
    if (!s) return;
    const nova = lista.map((x) => (chave(x) === chave(s) ? { ...x, areaId: a.id } : x));
    setLista(nova);
    try {
      await salvarAreaSubsortimento(s, a.id, quem);
    } catch (e: any) {
      setLista(lista);
      Alert.alert('Não consegui salvar', 'Confira a internet.\n\n' + (e?.message ?? ''));
      setAtual(null);
      setEmSequencia(false);
      return;
    }
    if (emSequencia) {
      const prox = proximoPendente(s, nova);
      setAtual(prox);
      if (!prox) { setEmSequencia(false); Alert.alert('Pronto!', 'Todos os sub-sortimentos estão no mapa.'); }
    } else setAtual(null);
  }

  function pular() {
    if (!atual) return;
    const prox = proximoPendente(atual);
    setAtual(prox);
    if (!prox) setEmSequencia(false);
  }

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo="Mapear sub-sortimentos" subtitulo={`${feitos} de ${lista.length} no mapa`} icone="map" onVoltar={onVoltar} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 50 }} refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}>
        <View style={styles.barraFundo}><View style={[styles.barra, { width: `${lista.length ? (feitos / lista.length) * 100 : 0}%` }]} /></View>
        <Text style={styles.nota}>
          Para cada sub-sortimento aparecem 3 produtos que mais vendem. Toque no corredor onde eles ficam e todos os produtos daquele sub-sortimento passam a ter local na rota e na Busca produto.
        </Text>
        {pendentes.length > 0 && (
          <TouchableOpacity style={styles.btnSeq} onPress={() => { setEmSequencia(true); setAtual(proximoPendente(null)); }} disabled={!areas.length}>
            <Feather name="play" size={16} color={colors.white} />
            <Text style={styles.btnSeqTexto}>Marcar os {pendentes.length} pendentes em sequência</Text>
          </TouchableOpacity>
        )}
        {carregando && !lista.length && <ActivityIndicator color={AZUL} style={{ marginTop: spacing.lg }} />}
        {setores.map((st) => {
          const its = lista.filter((s) => s.classe2 === st);
          const ok = its.filter((s) => s.areaId).length;
          const abre = aberto === st;
          return (
            <View key={st} style={styles.setor}>
              <TouchableOpacity style={styles.setorTopo} onPress={() => setAberto(abre ? null : st)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.setorNome}>{bonito(st)}</Text>
                  <Text style={styles.setorSub}>{ok} de {its.length} no mapa</Text>
                </View>
                {ok === its.length && <Feather name="check-circle" size={18} color="#178553" style={{ marginRight: 8 }} />}
                <Feather name={abre ? 'chevron-up' : 'chevron-down'} size={20} color={colors.navy700} />
              </TouchableOpacity>
              {abre && its.map((s) => {
                const a = s.areaId ? porId.get(s.areaId) : null;
                return (
                  <TouchableOpacity key={chave(s)} style={styles.sub} onPress={() => { setEmSequencia(false); setAtual(s); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subNome}>{bonito(s.classe4)}</Text>
                      <Text style={styles.subDet}>{bonito(s.classe3)} · {s.produtos} produtos</Text>
                      {s.exemplos.map((e) => <Text key={e} style={styles.exemplo} numberOfLines={1}>• {e}</Text>)}
                    </View>
                    <Text style={[styles.chip, a ? styles.chipOk : null]} numberOfLines={2}>{a ? `📍 ${a.nome}` : 'Marcar'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
      <SeletorAreaMapa
        visivel={!!atual}
        titulo={atual ? bonito(atual.classe4) : ''}
        subtitulo={atual ? `${bonito(atual.classe2)} · ${atual.produtos} produtos\n${atual.exemplos.map((e) => '• ' + e).join('\n')}` : ''}
        areas={areas}
        inicial={atual?.areaId ?? null}
        textoConfirmar={emSequencia ? 'Salvar e próximo' : 'Salvar'}
        onEscolher={salvar}
        onFechar={() => { setAtual(null); setEmSequencia(false); }}
        textoPular={emSequencia ? 'Pular' : undefined}
        onPular={emSequencia ? pular : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.gray50 },
  barraFundo: { height: 8, backgroundColor: colors.gray100, borderRadius: 4, overflow: 'hidden' },
  barra: { height: '100%', backgroundColor: '#178553' },
  nota: { fontSize: 12, color: colors.gray600, marginVertical: spacing.md, lineHeight: 17 },
  btnSeq: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: AZUL, borderRadius: radius.md, paddingVertical: 13, marginBottom: spacing.md },
  btnSeqTexto: { color: colors.white, fontWeight: '800', fontSize: 14 },
  setor: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, marginBottom: spacing.sm, overflow: 'hidden' },
  setorTopo: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  setorNome: { fontSize: 15, fontWeight: '800', color: colors.navy900 },
  setorSub: { fontSize: 12, color: colors.gray600, marginTop: 2 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.gray100, padding: spacing.md },
  subNome: { fontSize: 14, fontWeight: '700', color: colors.navy900 },
  subDet: { fontSize: 11.5, color: colors.gray600, marginTop: 1, marginBottom: 3 },
  exemplo: { fontSize: 11.5, color: colors.gray600 },
  chip: { maxWidth: 120, fontSize: 11.5, fontWeight: '800', color: AZUL, backgroundColor: '#E3EDFF', paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.full, overflow: 'hidden', textAlign: 'center' },
  chipOk: { color: '#178553', backgroundColor: '#DFF3E8' },
});
