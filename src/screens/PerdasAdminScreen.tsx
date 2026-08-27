import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { setores, SetorKey } from '../data/employees';
import { Perda, buscarTodasPerdas } from '../data/perdasApi';

function formatarReais(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function corPct(pct: number | null): { cor: string; fundo: string } {
  if (pct === null) return { cor: colors.gray600, fundo: colors.gray50 };
  if (pct >= 100) return { cor: colors.red500, fundo: '#FBDEDC' };
  if (pct >= 30) return { cor: '#B4650E', fundo: '#FBEBD4' };
  return { cor: colors.green500, fundo: '#DFF3E9' };
}

export default function PerdasAdminScreen({ onVoltar }: { onVoltar: () => void }) {
  const [perdas, setPerdas] = useState<Perda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [setorFiltro, setSetorFiltro] = useState<SetorKey | null>(null);

  function carregar() {
    buscarTodasPerdas()
      .then((lista) => {
        setPerdas(lista);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar as perdas.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
  }, []);

  function nomeSetor(key: SetorKey) {
    return setores.find((s) => s.key === key)?.nome ?? key;
  }

  const perdasFiltradas = useMemo(
    () => (setorFiltro ? perdas.filter((p) => p.setor === setorFiltro) : perdas),
    [perdas, setorFiltro]
  );

  const totalPerdido = useMemo(
    () => perdasFiltradas.reduce((soma, p) => soma + p.valorPerdido, 0),
    [perdasFiltradas]
  );

  const periodo = perdas[0];

  // Só os setores que já têm alguma perda importada aparecem como filtro.
  const setoresComPerda = useMemo(() => {
    const chaves = new Set(perdas.map((p) => p.setor));
    return setores.filter((s) => chaves.has(s.key));
  }, [perdas]);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Perdas geral</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
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
        <View style={styles.resumoCard}>
          <Text style={styles.resumoLabel}>{setorFiltro ? nomeSetor(setorFiltro) : 'Todos os setores'}</Text>
          <Text style={styles.resumoValor}>{formatarReais(totalPerdido)}</Text>
          <Text style={styles.resumoSub}>
            {periodo
              ? `${formatarData(periodo.periodoInicio)} a ${formatarData(periodo.periodoFim)} · ${
                  perdasFiltradas.length
                } ${perdasFiltradas.length === 1 ? 'produto' : 'produtos'}`
              : 'Nenhum relatório importado ainda'}
          </Text>
        </View>

        {setoresComPerda.length > 1 && (
          <View style={styles.chipsWrap}>
            <TouchableOpacity
              style={[styles.chip, setorFiltro === null && styles.chipAtivo]}
              onPress={() => setSetorFiltro(null)}
            >
              <Text style={[styles.chipTexto, setorFiltro === null && styles.chipTextoAtivo]}>Todos</Text>
            </TouchableOpacity>
            {setoresComPerda.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.chip, setorFiltro === s.key && styles.chipAtivo]}
                onPress={() => setSetorFiltro(s.key)}
              >
                <Text style={[styles.chipTexto, setorFiltro === s.key && styles.chipTextoAtivo]}>{s.nome}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : perdasFiltradas.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Nenhum relatório de perdas importado ainda.</Text>
          </View>
        ) : (
          perdasFiltradas.map((p) => {
            const badge = corPct(p.pctPerda);
            return (
              <View key={p.id} style={styles.perdaCard}>
                <View style={styles.perdaTopo}>
                  <Text style={styles.perdaProduto}>{p.produto}</Text>
                  {p.pctPerda !== null && (
                    <View style={[styles.chipPct, { backgroundColor: badge.fundo }]}>
                      <Text style={[styles.chipPctTexto, { color: badge.cor }]}>
                        {p.pctPerda.toFixed(1).replace('.', ',')}%
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.perdaSortimento}>{p.sortimento}</Text>
                <Text style={styles.perdaQtd}>
                  {p.quantidade} {p.unidade} · {formatarReais(p.valorPerdido)}
                </Text>
                <Text style={styles.perdaMeta}>{nomeSetor(p.setor)}</Text>
              </View>
            );
          })
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
  resumoCard: { backgroundColor: colors.navy900, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  resumoLabel: { color: colors.gray100, fontSize: 12, fontWeight: '600' },
  resumoValor: { color: colors.white, fontSize: 26, fontWeight: '700', marginTop: 4 },
  resumoSub: { color: colors.gray100, fontSize: 11, marginTop: 4 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl },
  perdaCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  perdaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  perdaProduto: { fontSize: 14, fontWeight: '700', color: colors.gray900, flex: 1 },
  perdaSortimento: { fontSize: 11, color: colors.gray400, marginTop: 4, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  perdaQtd: { fontSize: 12.5, color: colors.gray600, marginTop: 6, fontWeight: '600' },
  perdaMeta: { fontSize: 11, color: colors.gray400, marginTop: 8 },
  chipPct: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipPctTexto: { fontSize: 11, fontWeight: '700' },
});
