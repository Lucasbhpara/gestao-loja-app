import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { VendaSetor, buscarVendasSetorLoja, agruparVendasPorMes, VendasDoMes } from '../data/vendasApi';

// Mesma paleta categórica usada nos gráficos do Portal Admin (--cat-1..6).
const CORES_SETOR = ['#2C3F8C', '#6B4FA0', '#1D8A8A', '#4C6EF5', '#9C6ADE', '#3F6B52', '#B4650E', '#9AA1B8'];

function formatarReais(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nomeMes(mesRef: string): string {
  const [ano, mes] = mesRef.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

// A categoria vem em CAIXA ALTA da planilha (ex.: "MERCEARIA SALGADA") —
// deixa mais legível sem mudar o dado.
function formatarSetor(setor: string): string {
  return setor
    .toLowerCase()
    .split(/([ /])/)
    .map((parte) => (parte === ' ' || parte === '/' ? parte : parte.charAt(0).toUpperCase() + parte.slice(1)))
    .join('');
}

function corAtingimento(razao: number | null): { cor: string; fundo: string } {
  if (razao === null) return { cor: colors.gray600, fundo: colors.gray50 };
  if (razao >= 1) return { cor: colors.green500, fundo: '#DFF3E9' };
  if (razao >= 0.9) return { cor: '#B4650E', fundo: '#FBEBD4' };
  return { cor: colors.red500, fundo: '#FBDEDC' };
}

export default function VendasScreen({ onVoltar }: { onVoltar: () => void }) {
  const [vendas, setVendas] = useState<VendaSetor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mesSelecionado, setMesSelecionado] = useState<string | null>(null);

  function carregar() {
    buscarVendasSetorLoja()
      .then((lista) => {
        setVendas(lista);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar as vendas.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
  }, []);

  const meses: VendasDoMes[] = useMemo(() => agruparVendasPorMes(vendas, 5), [vendas]);

  useEffect(() => {
    if (meses.length > 0 && (!mesSelecionado || !meses.some((m) => m.mesRef === mesSelecionado))) {
      setMesSelecionado(meses[0].mesRef);
    }
  }, [meses, mesSelecionado]);

  const mesAtual = meses.find((m) => m.mesRef === mesSelecionado) ?? meses[0];
  const maxSetorVenda = Math.max(...(mesAtual?.porSetor.map((s) => s.venda) ?? []), 1);
  const maxMesTotal = Math.max(...meses.map((m) => m.totalVenda), 1);
  const atingimentoMesAtual = mesAtual && mesAtual.totalMeta > 0 ? mesAtual.totalVenda / mesAtual.totalMeta : null;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Vendas</Text>
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
        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : meses.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Nenhuma venda lançada ainda.</Text>
          </View>
        ) : (
          <>
            <View style={styles.resumoCard}>
              <Text style={styles.resumoLabel}>{mesAtual ? nomeMes(mesAtual.mesRef) : ''}</Text>
              <Text style={styles.resumoValor}>{mesAtual ? formatarReais(mesAtual.totalVenda) : ''}</Text>
              {atingimentoMesAtual !== null && (
                <View style={[styles.chipAtingimento, { backgroundColor: corAtingimento(atingimentoMesAtual).fundo }]}>
                  <Text style={[styles.chipAtingimentoTexto, { color: corAtingimento(atingimentoMesAtual).cor }]}>
                    {(atingimentoMesAtual * 100).toFixed(0)}% da meta
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.chipsWrap}>
              {meses.map((m) => (
                <TouchableOpacity
                  key={m.mesRef}
                  style={[styles.chip, mesSelecionado === m.mesRef && styles.chipAtivo]}
                  onPress={() => setMesSelecionado(m.mesRef)}
                >
                  <Text style={[styles.chipTexto, mesSelecionado === m.mesRef && styles.chipTextoAtivo]}>
                    {nomeMes(m.mesRef)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Vendas por categoria — {mesAtual ? nomeMes(mesAtual.mesRef) : ''}</Text>
            <View style={styles.card}>
              {(mesAtual?.porSetor ?? []).map((s, i) => (
                <View key={s.setor} style={styles.barraLinha}>
                  <Text style={styles.barraLabel} numberOfLines={2}>
                    {formatarSetor(s.setor)}
                  </Text>
                  <View style={styles.trilha}>
                    <View
                      style={[
                        styles.seg,
                        { width: `${(100 * s.venda) / maxSetorVenda}%`, backgroundColor: CORES_SETOR[i % CORES_SETOR.length] },
                      ]}
                    />
                  </View>
                  <Text style={styles.barraValor}>{formatarReais(s.venda)}</Text>
                </View>
              ))}
            </View>

            {meses.length > 1 && (
              <>
                <Text style={styles.sectionTitle}>Comparativo — últimos {meses.length} meses</Text>
                <View style={styles.card}>
                  {[...meses].reverse().map((m) => (
                    <View key={m.mesRef} style={styles.barraLinha}>
                      <Text style={styles.barraLabel} numberOfLines={1}>
                        {nomeMes(m.mesRef)}
                      </Text>
                      <View style={styles.trilha}>
                        <View
                          style={[
                            styles.seg,
                            {
                              width: `${(100 * m.totalVenda) / maxMesTotal}%`,
                              backgroundColor: m.mesRef === mesSelecionado ? colors.navy700 : colors.navy500,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.barraValor}>{formatarReais(m.totalVenda)}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
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
  chipAtingimento: { alignSelf: 'flex-start', borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9, marginTop: 8 },
  chipAtingimentoTexto: { fontSize: 11, fontWeight: '700' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.gray900, marginBottom: spacing.sm, marginTop: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  barraLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  barraLabel: { flex: 0, width: 96, fontSize: 10.5, color: colors.gray900 },
  trilha: { flex: 1, height: 16, backgroundColor: colors.gray50, borderRadius: 5, overflow: 'hidden' },
  seg: { height: '100%', borderRadius: 5 },
  barraValor: { flex: 0, width: 88, textAlign: 'right', fontSize: 11, fontWeight: '700', color: colors.gray600 },
});
