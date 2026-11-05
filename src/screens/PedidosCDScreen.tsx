import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import CabecalhoTela from '../components/CabecalhoTela';
import { supabase } from '../lib/supabase';

// Pedidos CD: o que está na fila para a extensão do Chrome digitar no Portal
// 360 (MG SECOS) e o que já foi digitado, dia a dia.
// Tabela pedido_cd_solicitacoes (supabase/pedido_cd_solicitacoes.sql).

const AZUL = '#2F7BFF';
const VERDE = '#178553';
const VERMELHO = '#C0352B';
const LARANJA = '#9A5B00';

type Item = { codigo: string; produto?: string; qtd?: number; giro?: number; valor?: string; motivo?: string };
export interface PedidoCD {
  id: string;
  grupos: string | null;
  status: 'pendente' | 'processando' | 'pronto' | 'parou' | 'erro' | 'cancelada';
  criadoPor: string | null;
  criadoEm: string;
  iniciadoEm: string | null;
  concluidoEm: string | null;
  itens: Item[];
  ok: Item[];
  ja: Item[];
  fora: Item[];
  naoAchou: Item[];
  erro: string | null;
}

export async function buscarPedidosCD(dias = 30): Promise<PedidoCD[]> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await supabase
    .from('pedido_cd_solicitacoes')
    .select('*')
    .or(`criado_em.gte.${desde},status.in.(pendente,processando,parou)`)
    .order('criado_em', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []).map((s: any) => {
    const r = s.resultado ?? {};
    return {
      id: s.id, grupos: s.grupos, status: s.status, criadoPor: s.criado_por, criadoEm: s.criado_em,
      iniciadoEm: s.iniciado_em, concluidoEm: s.concluido_em, itens: s.itens ?? [],
      ok: r.ok ?? [], ja: r.ja ?? [], fora: r.fora ?? [], naoAchou: r.naoAchou ?? [], erro: r.erro ?? null,
    };
  });
}

const hora = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaTexto = (d: string) => {
  const x = new Date(d);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86400000);
  if (x.toDateString() === hoje.toDateString()) return 'Hoje';
  if (x.toDateString() === ontem.toDateString()) return 'Ontem';
  return x.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
};
const esperando = (d: string) => {
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} dias`;
};

const ROTULO: Record<PedidoCD['status'], { texto: string; cor: string; fundo: string }> = {
  pendente: { texto: '⏳ Na fila', cor: LARANJA, fundo: '#FFF4E0' },
  processando: { texto: '⌨️ Digitando agora', cor: AZUL, fundo: '#E3EDFF' },
  parou: { texto: '⚠ Parou (Confirmar digitação)', cor: VERMELHO, fundo: '#FDECEA' },
  pronto: { texto: '✅ Digitado', cor: VERDE, fundo: '#E6F6EE' },
  erro: { texto: '❌ Erro', cor: VERMELHO, fundo: '#FDECEA' },
  cancelada: { texto: 'Cancelado', cor: colors.gray600, fundo: colors.gray50 },
};

export default function PedidosCDScreen({ quem, onVoltar, onHistoricoColetas }: { quem: string; onVoltar: () => void; onHistoricoColetas?: () => void }) {
  const [pedidos, setPedidos] = useState<PedidoCD[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setPedidos(await buscarPedidosCD());
    } catch (e: any) {
      Alert.alert('Não consegui carregar', e?.message ?? '');
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30000); // a fila anda sozinha: atualiza a cada 30 s
    return () => clearInterval(t);
  }, [carregar]);

  function cancelar(p: PedidoCD) {
    Alert.alert('Tirar da fila?', `${p.grupos ?? 'Pedido'} · ${p.itens.length} produtos. Eles voltam a ficar para pedir.`, [
      { text: 'Não' },
      {
        text: 'Tirar da fila',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('pedido_cd_cancelar', { p_id: p.id, p_por: quem });
          if (error) Alert.alert('Não consegui', error.message);
          carregar();
        },
      },
    ]);
  }

  const fila = pedidos.filter((p) => ['pendente', 'processando', 'parou'].includes(p.status)).reverse();
  const feitos = pedidos.filter((p) => !['pendente', 'processando', 'parou'].includes(p.status));
  const porDia = new Map<string, PedidoCD[]>();
  feitos.forEach((p) => {
    const k = diaTexto(p.concluidoEm ?? p.criadoEm);
    porDia.set(k, [...(porDia.get(k) ?? []), p]);
  });
  const caixas = (p: PedidoCD) => p.ok.reduce((s, i) => s + (Number(i.qtd) || 0), 0);

  function cartao(p: PedidoCD) {
    const r = ROTULO[p.status];
    const ab = aberto === p.id;
    const lista: (Item & { marca: string })[] = p.status === 'pronto' || p.status === 'parou' || p.status === 'erro'
      ? [
          ...p.ok.map((i) => ({ ...i, marca: `✓ ${i.qtd ?? '?'} cx` })),
          ...p.ja.map((i) => ({ ...i, marca: `já tinha ${i.valor ?? ''}` })),
          ...p.fora.map((i) => ({ ...i, marca: i.motivo ?? 'fora' })),
          ...p.naoAchou.map((i) => ({ ...i, marca: 'não achou no portal' })),
        ]
      : p.itens.map((i) => ({ ...i, marca: '' }));
    return (
      <View key={p.id} style={styles.cartao}>
        <TouchableOpacity onPress={() => setAberto(ab ? null : p.id)} activeOpacity={0.7}>
          <View style={styles.linha}>
            <Text style={styles.titulo} numberOfLines={2}>{p.grupos ?? 'Pedido'}</Text>
            <Feather name={ab ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray400} />
          </View>
          <View style={styles.selos}>
            <Text style={[styles.selo, { color: r.cor, backgroundColor: r.fundo }]}>{r.texto}</Text>
            <Text style={[styles.selo, styles.seloCinza]}>{p.itens.length} produtos</Text>
            {p.status === 'pronto' && <Text style={[styles.selo, styles.seloCinza]}>{p.ok.length} digitados · {caixas(p)} cx</Text>}
            {(p.fora.length > 0 || p.naoAchou.length > 0) && <Text style={[styles.selo, styles.seloCinza]}>{p.fora.length + p.naoAchou.length} fora</Text>}
          </View>
          <Text style={styles.det}>
            Enviado por {p.criadoPor ?? '—'} às {hora(p.criadoEm)}
            {p.status === 'pendente' ? ` · esperando ${esperando(p.criadoEm)}` : ''}
            {p.concluidoEm && p.status !== 'cancelada' ? ` · digitado às ${hora(p.concluidoEm)}` : ''}
            {p.erro ? ` · ${p.erro}` : ''}
          </Text>
        </TouchableOpacity>
        {ab && (
          <View style={{ marginTop: spacing.sm }}>
            {lista.map((i, n) => (
              <View key={i.codigo + n} style={styles.itemLinha}>
                <Text style={styles.itemNome} numberOfLines={1}>{i.codigo} · {i.produto ?? ''}</Text>
                {!!i.marca && <Text style={[styles.itemMarca, i.marca.startsWith('✓') && { color: VERDE }]}>{i.marca}</Text>}
              </View>
            ))}
          </View>
        )}
        {(p.status === 'pendente' || p.status === 'parou') && (
          <TouchableOpacity onPress={() => cancelar(p)} style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
            <Text style={[styles.link, { color: VERMELHO }]}>Tirar da fila</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo="Pedidos CD" subtitulo="Fila da extensão e o que já foi digitado" icone="shopping-cart" onVoltar={onVoltar} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}>
        <Text style={styles.sec}>⏳ Na fila · {fila.length}</Text>
        {fila.length ? fila.map(cartao) : <Text style={styles.vazio}>Nada esperando para digitar. 👍</Text>}
        {fila.some((p) => p.status === 'pendente') && (
          <Text style={styles.nota}>A extensão digita quando o MG SECOS está aberto no Chrome do notebook com o modo automático ligado.</Text>
        )}

        {[...porDia.entries()].map(([dia, ps]) => (
          <View key={dia}>
            <Text style={[styles.sec, { textTransform: 'capitalize' }]}>
              {dia} · {ps.filter((p) => p.status === 'pronto').reduce((s, p) => s + p.ok.length, 0)} produtos digitados
            </Text>
            {ps.map(cartao)}
          </View>
        ))}
        {carregando && !pedidos.length && <ActivityIndicator color={AZUL} style={{ marginTop: spacing.xl }} />}
        {!carregando && !feitos.length && <Text style={styles.vazio}>Nenhum pedido digitado nos últimos 30 dias.</Text>}

        {onHistoricoColetas && (
          <TouchableOpacity style={styles.btnSec} onPress={onHistoricoColetas}>
            <Feather name="clock" size={16} color={colors.navy700} />
            <Text style={styles.btnSecTexto}>Histórico das coletas e lista de pedido</Text>
          </TouchableOpacity>
        )}
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
  linha: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titulo: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.navy900 },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  selo: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full, overflow: 'hidden' },
  seloCinza: { color: colors.gray600, backgroundColor: colors.gray50 },
  det: { fontSize: 12, color: colors.gray600, marginTop: 6 },
  itemLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.gray50 },
  itemNome: { flex: 1, fontSize: 12.5, color: colors.navy900 },
  itemMarca: { fontSize: 12, fontWeight: '700', color: colors.gray600 },
  link: { fontWeight: '700', color: AZUL },
  btnSec: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.lg, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white },
  btnSecTexto: { fontWeight: '700', color: colors.navy700 },
});
