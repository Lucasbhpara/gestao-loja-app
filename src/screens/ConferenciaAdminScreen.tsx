import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { Conferencia, ConferenciaItem, buscarTodasConferencias, buscarItensDaConferencia } from '../data/conferenciasApi';

export default function ConferenciaAdminScreen({ onVoltar }: { onVoltar: () => void }) {
  const [conferencias, setConferencias] = useState<Conferencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const [conferenciaAtual, setConferenciaAtual] = useState<Conferencia | null>(null);
  const [itens, setItens] = useState<ConferenciaItem[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);

  function carregar() {
    buscarTodasConferencias()
      .then(setConferencias)
      .catch(() => {})
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrir(c: Conferencia) {
    setConferenciaAtual(c);
    setCarregandoItens(true);
    buscarItensDaConferencia(c.id)
      .then(setItens)
      .catch(() => {})
      .finally(() => setCarregandoItens(false));
  }

  if (conferenciaAtual) {
    const divergencias = itens.filter((i) => i.status === 'divergencia');
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setConferenciaAtual(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.voltar}>‹ Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.titulo} numberOfLines={1}>{conferenciaAtual.titulo}</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          <View style={styles.avisoBox}>
            <Text style={styles.avisoTexto}>
              Pra baixar essa conferência em PDF, abra a página "Conferências" no Portal Admin (no computador).
            </Text>
          </View>

          {conferenciaAtual.notaFiscalUrl && (
            <View style={styles.itemCard}>
              <Text style={styles.itemProduto}>Nota fiscal da entrega</Text>
              <Image source={{ uri: conferenciaAtual.notaFiscalUrl }} style={styles.itemFoto} />
            </View>
          )}

          {carregandoItens ? (
            <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xl }} />
          ) : (
            <>
              {divergencias.length > 0 && (
                <Text style={styles.secaoTitulo}>{divergencias.length} divergência(s)</Text>
              )}
              {itens.map((item) => (
                <View key={item.id} style={[styles.itemCard, item.status === 'divergencia' && styles.itemCardDivergencia]}>
                  <View style={styles.itemTopo}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemProduto}>{item.produto}</Text>
                      <Text style={styles.itemMeta}>
                        {item.codigoInterno ? `Cód. ${item.codigoInterno} · ` : ''}Esperado: {item.quantidadeEsperada}
                        {item.quantidadeReal !== null ? ` · Recebido: ${item.quantidadeReal}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.itemStatus, { color: item.status === 'ok' ? colors.green500 : item.status === 'divergencia' ? colors.red500 : colors.gray400 }]}>
                      {item.status === 'ok' ? '✓ OK' : item.status === 'divergencia' ? '⚠ Divergência' : 'Pendente'}
                    </Text>
                  </View>
                  {item.fotoUrl && <Image source={{ uri: item.fotoUrl }} style={styles.itemFoto} />}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Conferências</Text>
        <View style={{ width: 50 }} />
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        refreshControl={
          <RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />
        }
      >
        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : conferencias.length === 0 ? (
          <Text style={styles.vazioTexto}>Nenhuma conferência criada ainda.</Text>
        ) : (
          conferencias.map((c) => (
            <TouchableOpacity key={c.id} style={styles.card} onPress={() => abrir(c)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitulo}>{c.titulo}</Text>
                <Text style={styles.cardMeta}>
                  Criada por {c.criadaPorNome}
                  {c.conferidaPorNome ? ` · Conferida por ${c.conferidaPorNome}` : ''}
                </Text>
              </View>
              <View style={[styles.chipStatus, c.status === 'concluida' ? styles.chipConcluida : styles.chipPendente]}>
                <Text style={[styles.chipStatusTexto, { color: c.status === 'concluida' ? colors.green500 : '#B4650E' }]}>
                  {c.status === 'concluida' ? 'Concluída' : 'Pendente'}
                </Text>
              </View>
            </TouchableOpacity>
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
  titulo: { fontSize: 16, fontWeight: '700', color: colors.navy900, flex: 1, textAlign: 'center' },
  vazioTexto: { fontSize: 12.5, color: colors.gray600, textAlign: 'center', paddingVertical: spacing.xxl },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardTitulo: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  cardMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 4 },
  chipStatus: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipPendente: { backgroundColor: '#FBEBD4' },
  chipConcluida: { backgroundColor: '#DFF3E9' },
  chipStatusTexto: { fontSize: 10.5, fontWeight: '700' },
  avisoBox: { backgroundColor: '#EAF0FF', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  avisoTexto: { color: colors.navy700, fontSize: 12, lineHeight: 17 },
  secaoTitulo: { fontSize: 13, fontWeight: '700', color: colors.red500, marginBottom: spacing.md },
  itemCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  itemCardDivergencia: { borderWidth: 1, borderColor: colors.red500 },
  itemTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  itemProduto: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  itemMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  itemStatus: { fontSize: 11.5, fontWeight: '700' },
  itemFoto: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm, backgroundColor: colors.gray50 },
});
