import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { setores, SetorKey } from '../data/employees';
import { Ocorrencia, buscarTodasOcorrencias, marcarOcorrenciaResolvida } from '../data/ocorrenciasApi';

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes} às ${hora}:${min}`;
}

function nomeSetor(key: SetorKey) {
  return setores.find((s) => s.key === key)?.nome ?? key;
}

export default function OcorrenciaAdminScreen({ onVoltar }: { onVoltar: () => void }) {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [filtro, setFiltro] = useState<'abertas' | 'todas'>('abertas');
  const [resolvendo, setResolvendo] = useState<string | null>(null);

  function carregar() {
    buscarTodasOcorrencias()
      .then(setOcorrencias)
      .catch(() => {})
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
  }, []);

  async function resolver(o: Ocorrencia) {
    setResolvendo(o.id);
    try {
      await marcarOcorrenciaResolvida(o.id);
      setOcorrencias((prev) => prev.map((p) => (p.id === o.id ? { ...p, status: 'resolvida', resolvidaEm: new Date().toISOString() } : p)));
    } catch {
      // silencioso — a lista atualiza sozinha no próximo "puxar pra atualizar"
    } finally {
      setResolvendo(null);
    }
  }

  const lista = filtro === 'abertas' ? ocorrencias.filter((o) => o.status === 'aberta') : ocorrencias;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Ocorrências</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              carregar();
            }}
          />
        }
      >
        <View style={styles.chipsWrap}>
          <TouchableOpacity style={[styles.chip, filtro === 'abertas' && styles.chipAtivo]} onPress={() => setFiltro('abertas')}>
            <Text style={[styles.chipTexto, filtro === 'abertas' && styles.chipTextoAtivo]}>Abertas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, filtro === 'todas' && styles.chipAtivo]} onPress={() => setFiltro('todas')}>
            <Text style={[styles.chipTexto, filtro === 'todas' && styles.chipTextoAtivo]}>Todas</Text>
          </TouchableOpacity>
        </View>

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : lista.length === 0 ? (
          <Text style={styles.vazioTexto}>
            {filtro === 'abertas' ? 'Nenhuma ocorrência em aberto no momento.' : 'Nenhuma ocorrência registrada ainda.'}
          </Text>
        ) : (
          lista.map((o) => (
            <View key={o.id} style={styles.card}>
              <View style={styles.cardTopo}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardNome}>{o.colaboradorNome}</Text>
                  <Text style={styles.cardMeta}>
                    {nomeSetor(o.setor)} · {formatarDataHora(o.criadoEm)}
                  </Text>
                </View>
                <View style={[styles.chipStatus, o.status === 'resolvida' ? styles.chipResolvida : styles.chipAberta]}>
                  <Text style={[styles.chipStatusTexto, { color: o.status === 'resolvida' ? colors.green500 : '#B4650E' }]}>
                    {o.status === 'resolvida' ? 'Resolvida' : 'Aberta'}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardTexto}>{o.texto}</Text>
              {o.fotoUrl && <Image source={{ uri: o.fotoUrl }} style={styles.cardFoto} />}
              {o.status === 'aberta' && (
                <TouchableOpacity
                  style={[styles.btnResolver, resolvendo === o.id && styles.btnResolverDesabilitado]}
                  onPress={() => resolver(o)}
                  disabled={resolvendo === o.id}
                >
                  <Text style={styles.btnResolverTexto}>{resolvendo === o.id ? 'Marcando…' : 'Marcar como resolvida'}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
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
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  vazioTexto: { fontSize: 12.5, color: colors.gray600, textAlign: 'center', paddingVertical: spacing.xxl },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardNome: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  cardMeta: { fontSize: 11, color: colors.gray400, fontWeight: '600', marginTop: 2 },
  chipStatus: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipAberta: { backgroundColor: '#FBEBD4' },
  chipResolvida: { backgroundColor: '#DFF3E9' },
  chipStatusTexto: { fontSize: 10.5, fontWeight: '700' },
  cardTexto: { fontSize: 13, color: colors.gray900, marginTop: spacing.sm, lineHeight: 19 },
  cardFoto: { width: '100%', height: 180, borderRadius: radius.md, marginTop: spacing.sm, backgroundColor: colors.gray50 },
  btnResolver: { backgroundColor: colors.green500, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', marginTop: spacing.md },
  btnResolverDesabilitado: { opacity: 0.6 },
  btnResolverTexto: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
});
