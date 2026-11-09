import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import CabecalhoTela from '../components/CabecalhoTela';
import { supabase } from '../lib/supabase';

// Cortes do pedido (CD): lotes importados no Portal Admin (planilha de
// pedidos cortados) esperando pra disparar pra fila do Pedido CD — e o
// histórico dos já disparados. A planilha só sobe pelo Portal Admin
// (web); aqui só acompanha e dispara.
// Tabelas: supabase/pedido_cortes.sql.

const AZUL = '#2F7BFF';
const VERDE = '#178553';
const LARANJA = '#9A5B00';

interface LoteCortes {
  id: string;
  arquivo: string | null;
  origemCd: string;
  criadoPor: string | null;
  criadoEm: string;
  totalItens: number;
  enviadoEm: string | null;
  excluidos: { descontinuados?: number; pedido_14_dias?: number };
}

async function buscarLotesCortes(): Promise<LoteCortes[]> {
  const { data, error } = await supabase.from('pedido_cortes_lotes').select('*').order('criado_em', { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((l: any) => ({
    id: l.id, arquivo: l.arquivo, origemCd: l.origem_cd, criadoPor: l.criado_por, criadoEm: l.criado_em,
    totalItens: l.total_itens, enviadoEm: l.enviado_em, excluidos: l.excluidos ?? {},
  }));
}

const hora = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function CortesPedidoCDScreen({ quem, onVoltar }: { quem: string; onVoltar: () => void }) {
  const [lotes, setLotes] = useState<LoteCortes[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [disparando, setDisparando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLotes(await buscarLotesCortes());
    } catch (e: any) {
      Alert.alert('Não consegui carregar', e?.message ?? '');
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function disparar(l: LoteCortes) {
    setDisparando(l.id);
    try {
      const { data, error } = await supabase.rpc('pedido_cortes_disparar', { p_lote: l.id, p_por: quem });
      if (error) throw new Error(error.message);
      Alert.alert(
        'Pedido disparado',
        `${data.itens} produtos enviados pra fila do Pedido CD` +
          (data.pedido_14_dias || data.descontinuados
            ? ` (${data.pedido_14_dias ?? 0} já pedidos nos últimos 14 dias e ${data.descontinuados ?? 0} descontinuados ficaram de fora).`
            : '.'),
      );
      await carregar();
    } catch (e: any) {
      Alert.alert('Não consegui disparar', e?.message ?? '');
    } finally {
      setDisparando(null);
    }
  }

  const pendentes = lotes.filter((l) => !l.enviadoEm);
  const disparados = lotes.filter((l) => l.enviadoEm);

  function cartao(l: LoteCortes) {
    const ex = l.excluidos || {};
    return (
      <View key={l.id} style={styles.cartao}>
        <Text style={styles.titulo} numberOfLines={2}>{l.arquivo ?? 'Planilha de cortes'}</Text>
        <View style={styles.selos}>
          <Text style={[styles.selo, styles.seloCinza]}>CD {l.origemCd}</Text>
          <Text style={[styles.selo, styles.seloCinza]}>{l.totalItens} produtos</Text>
          {l.enviadoEm ? (
            <Text style={[styles.selo, { color: VERDE, backgroundColor: '#E6F6EE' }]}>✅ Disparado</Text>
          ) : (
            <Text style={[styles.selo, { color: LARANJA, backgroundColor: '#FFF4E0' }]}>⏳ Pendente</Text>
          )}
        </View>
        <Text style={styles.det}>
          Importado por {l.criadoPor ?? '—'} às {hora(l.criadoEm)}
          {l.enviadoEm ? ` · disparado às ${hora(l.enviadoEm)}` : ''}
        </Text>
        {(ex.descontinuados || ex.pedido_14_dias) ? (
          <Text style={styles.det}>
            {ex.pedido_14_dias ?? 0} já pedidos nos últimos 14 dias · {ex.descontinuados ?? 0} descontinuados ficaram de fora
          </Text>
        ) : null}
        {!l.enviadoEm && (
          <TouchableOpacity
            style={[styles.btnDisparar, disparando === l.id && { opacity: 0.6 }]}
            disabled={disparando === l.id}
            onPress={() => disparar(l)}
          >
            {disparando === l.id ? <ActivityIndicator color={colors.white} size="small" /> : <Feather name="send" size={16} color={colors.white} />}
            <Text style={styles.btnDispararTexto}>{disparando === l.id ? 'Disparando…' : '🚀 Disparar pedido'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo="Cortes do pedido (CD)" subtitulo="Reenviar pro CD o que foi cortado do pedido" icone="repeat" onVoltar={onVoltar} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}>
        <Text style={styles.sec}>⏳ Esperando disparar · {pendentes.length}</Text>
        {pendentes.length ? pendentes.map(cartao) : <Text style={styles.vazio}>Nada esperando. 👍</Text>}
        <Text style={styles.nota}>A planilha de cortes sobe pelo Portal Admin (Operação › Cortes do pedido (CD)); aqui dá pra acompanhar e disparar.</Text>

        <Text style={styles.sec}>✅ Já disparados</Text>
        {carregando && !lotes.length && <ActivityIndicator color={AZUL} style={{ marginTop: spacing.xl }} />}
        {!carregando && !disparados.length && <Text style={styles.vazio}>Nenhum ainda.</Text>}
        {disparados.map(cartao)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.gray50 },
  sec: { fontSize: 15, fontWeight: '800', color: colors.navy900, marginTop: spacing.md, marginBottom: spacing.sm },
  vazio: { color: colors.gray600, marginBottom: spacing.sm },
  nota: { fontSize: 12, color: colors.gray600, marginBottom: spacing.sm },
  cartao: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: spacing.md, marginBottom: spacing.sm },
  titulo: { fontSize: 14, fontWeight: '800', color: colors.navy900 },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  selo: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full, overflow: 'hidden' },
  seloCinza: { color: colors.gray600, backgroundColor: colors.gray50 },
  det: { fontSize: 12, color: colors.gray600, marginTop: 6 },
  btnDisparar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.sm, paddingVertical: 10, borderRadius: radius.md, backgroundColor: AZUL },
  btnDispararTexto: { fontWeight: '700', color: colors.white },
});
