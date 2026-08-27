import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { ProdutoPedido, buscarCatalogoPedidos, enviarPedido } from '../data/pedidosApi';

export default function PedidosScreen({
  onVoltar,
  setorPedido,
}: {
  onVoltar: () => void;
  /** Setor do catálogo a mostrar. Por padrão usa o setor do usuário logado —
   * passe esse prop quando quiser abrir o catálogo de um setor específico
   * (ex: administrador acessando o catálogo do FLV, que hoje é o único
   * setor com pedidos ativo). */
  setorPedido?: string;
}) {
  const { usuarioAtual } = useAuth();
  const setorAtivo = setorPedido ?? usuarioAtual?.setor ?? '';

  const [produtos, setProdutos] = useState<ProdutoPedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [pesquisa, setPesquisa] = useState('');
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  function carregar() {
    if (!setorAtivo) return;
    buscarCatalogoPedidos(setorAtivo)
      .then(setProdutos)
      .catch(() => {})
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setorAtivo]);

  if (!usuarioAtual) return null;

  const produtosFiltrados = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase();
    if (!termo) return produtos;
    return produtos.filter((p) => p.produto.toLowerCase().includes(termo) || p.codigo.toLowerCase().includes(termo));
  }, [produtos, pesquisa]);

  const itensParaEnviar = useMemo(
    () =>
      Object.entries(quantidades)
        .map(([codigo, valor]) => ({ codigo, quantidade: Number(valor.replace(',', '.')) }))
        .filter((i) => i.quantidade > 0),
    [quantidades]
  );

  function confirmarEnvio() {
    if (itensParaEnviar.length === 0) return;
    Alert.alert(
      'Enviar pedido',
      `Confirma o envio do pedido com ${itensParaEnviar.length} produto(s)?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: enviar },
      ]
    );
  }

  async function enviar() {
    if (!usuarioAtual || itensParaEnviar.length === 0) return;
    setEnviando(true);
    try {
      const itens = itensParaEnviar.map((i) => {
        const produto = produtos.find((p) => p.codigo === i.codigo);
        return { codigo: i.codigo, produto: produto?.produto ?? i.codigo, quantidade: i.quantidade };
      });
      await enviarPedido({ setor: setorAtivo, encarregadoNome: usuarioAtual.nome, itens });
      setQuantidades({});
      Alert.alert('Pedido enviado', 'Os administradores já podem ver esse pedido.');
    } catch (e: any) {
      Alert.alert('Não consegui enviar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Pedidos</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.pesquisaBox}>
        <TextInput
          style={styles.pesquisaInput}
          placeholder="Pesquisar produto ou código…"
          placeholderTextColor={colors.gray400}
          value={pesquisa}
          onChangeText={setPesquisa}
        />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />
        }
      >
        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : produtos.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>
              Ainda não tem produtos cadastrados pra pedido nesse setor. Assim que a planilha for importada, eles
              aparecem aqui.
            </Text>
          </View>
        ) : produtosFiltrados.length === 0 ? (
          <Text style={styles.vazioTexto}>Nenhum produto encontrado pra "{pesquisa}".</Text>
        ) : (
          produtosFiltrados.map((p) => (
            <View key={p.id} style={styles.card}>
              <Text style={styles.cardProduto}>{p.codigo} - {p.produto}</Text>
              <View style={styles.infoRow}>
                {!!p.embalagem && <Text style={styles.infoItem}>Emb: {p.embalagem}</Text>}
                {p.palete !== null && <Text style={styles.infoItem}>Palete: {p.palete}</Text>}
                {p.estoqueCd !== null && <Text style={styles.infoItem}>Estq. CD: {p.estoqueCd}</Text>}
                {p.giroSemanal !== null && <Text style={styles.infoItem}>Giro sem.: {p.giroSemanal}</Text>}
                {p.qtdPendenteEntrega !== null && <Text style={styles.infoItem}>Pend. entrega: {p.qtdPendenteEntrega}</Text>}
              </View>
              <View style={styles.pedidoRow}>
                <Text style={styles.pedidoLabel}>Pedido</Text>
                <TextInput
                  style={styles.pedidoInput}
                  placeholder="0"
                  keyboardType="numeric"
                  value={quantidades[p.codigo] ?? ''}
                  onChangeText={(v) => setQuantidades((prev) => ({ ...prev, [p.codigo]: v }))}
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {itensParaEnviar.length > 0 && (
        <TouchableOpacity style={styles.btnEnviar} onPress={confirmarEnvio} disabled={enviando}>
          <Text style={styles.btnEnviarTexto}>
            {enviando ? 'Enviando…' : `Enviar pedido (${itensParaEnviar.length} ${itensParaEnviar.length === 1 ? 'item' : 'itens'})`}
          </Text>
        </TouchableOpacity>
      )}
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
  pesquisaBox: { backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  pesquisaInput: { backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 19 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardProduto: { fontSize: 13, fontWeight: '700', color: colors.gray900 },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: spacing.sm },
  infoItem: { fontSize: 11, color: colors.gray600, fontWeight: '600' },
  pedidoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray100, paddingTop: spacing.md },
  pedidoLabel: { fontSize: 11, fontWeight: '700', color: colors.navy700, textTransform: 'uppercase', letterSpacing: 0.4 },
  pedidoInput: {
    flex: 1,
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy900,
    textAlign: 'right',
  },
  btnEnviar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: colors.navy700,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  btnEnviarTexto: { color: colors.white, fontSize: 14, fontWeight: '700' },
});
