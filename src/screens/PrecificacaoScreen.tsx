import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  FlatList,
  Vibration,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { supabase } from '../lib/supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type FilaItem = {
  id: string;
  barcode: string;
  status: 'pending' | 'completed' | 'error';
  product_name?: string;
  preco_venda?: number | null;
  created_at: string;
  priority?: number;
};

type Produto = {
  barcode: string;
  product_name?: string;
  preco_venda?: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatarPreco(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return 'R$ ' + v.toFixed(2).replace('.', ',');
}

function limparCodigo(raw: string): string {
  return raw.replace(/\D/g, '').trim();
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PrecificacaoScreen() {
  const [input, setInput] = useState('');
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // ── Busca produto por código (em estoque e catálogo geral) ────────────────

  async function buscarProdutoPorCodigo(codigo: string): Promise<Produto | null> {
    // Tenta na tabela de estoque primeiro
    const { data: estoque } = await supabase
      .from('estoque')
      .select('barcode, product_name, preco_venda')
      .eq('barcode', codigo)
      .maybeSingle();

    if (estoque) return estoque as Produto;

    // Tenta no catálogo geral
    const { data: catalogo } = await supabase
      .from('produtos_catalogo')
      .select('barcode, product_name, preco_venda')
      .eq('barcode', codigo)
      .maybeSingle();

    if (catalogo) return catalogo as Produto;

    return null;
  }

  // ── Busca fila pendente ────────────────────────────────────────────────────

  const buscarFila = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const { data, error } = await supabase
      .from('barcode_collection')
      .select('id, barcode, status, product_name, preco_venda, created_at, priority')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(30);

    if (isRefresh) setRefreshing(false);
    else setLoading(false);

    if (error) {
      Alert.alert('Erro', 'Não foi possível carregar a fila.');
      return;
    }
    setFila((data as FilaItem[]) || []);
  }, []);

  useEffect(() => {
    buscarFila();
    const interval = setInterval(() => buscarFila(), 5000);
    return () => clearInterval(interval);
  }, [buscarFila]);

  // ── Adicionar na fila ─────────────────────────────────────────────────────

  async function adicionarNaFila(
    raw: string,
    produtoJaConhecido?: Produto | null,
  ): Promise<boolean> {
    const limpo = limparCodigo(raw);
    if (!limpo) return false;

    // Verifica se já está na fila
    const naFila = fila.some((i) => i.barcode === limpo && i.status === 'pending');
    if (naFila) {
      Alert.alert('Já na fila', `O código ${limpo} já está aguardando na fila.`);
      return false;
    }

    // Verifica se o produto existe no banco. Se não existir em nenhuma das
    // duas tabelas, bloqueia a coleta e informa o colaborador.
    const produto = produtoJaConhecido !== undefined
      ? produtoJaConhecido
      : await buscarProdutoPorCodigo(limpo);

    if (!produto) {
      Alert.alert(
        '⚠️ Produto sem cadastro',
        `O código ${limpo} não foi encontrado na planilha de estoque nem no catálogo geral.\n\nEsse código não será enviado para a fila.`
      );
      return false;
    }

    const { error } = await supabase.from('barcode_collection').insert([
      {
        barcode: limpo,
        status: 'pending',
        product_name: produto?.product_name ?? null,
        preco_venda: produto?.preco_venda ?? null,
        priority: 0,
      },
    ]);

    if (error) {
      Alert.alert('Erro', 'Não foi possível adicionar o código à fila.');
      return false;
    }

    if (Platform.OS !== 'web') Vibration.vibrate(80);
    await buscarFila();
    return true;
  }

  // ── Confirmar (marcar como concluído) ─────────────────────────────────────

  async function confirmarItem(item: FilaItem) {
    const { error } = await supabase
      .from('barcode_collection')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', item.id);

    if (error) {
      Alert.alert('Erro', 'Não foi possível confirmar o item.');
      return;
    }
    await buscarFila();
  }

  // ── Submit do input ────────────────────────────────────────────────────────

  async function onSubmit() {
    const raw = input.trim();
    if (!raw) return;
    setInput('');
    inputRef.current?.focus();
    const ok = await adicionarNaFila(raw);
    if (!ok) {
      // restaura o foco mas não o valor
      inputRef.current?.focus();
    }
  }

  // ── Renderização de item da fila ──────────────────────────────────────────

  function renderItem({ item }: { item: FilaItem }) {
    const hora = new Date(item.created_at).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <View style={styles.filaRow}>
        <View style={styles.filaInfo}>
          <Text style={styles.filaCode}>{item.barcode}</Text>
          {item.product_name ? (
            <Text style={styles.filaName} numberOfLines={1}>
              {item.product_name}
            </Text>
          ) : null}
          {item.preco_venda != null ? (
            <Text style={styles.filaPreco}>{formatarPreco(item.preco_venda)}</Text>
          ) : null}
          <Text style={styles.filaHora}>{hora}</Text>
        </View>
        <TouchableOpacity
          style={styles.confirmBtn}
          onPress={() => confirmarItem(item)}
          activeOpacity={0.75}
        >
          <Text style={styles.confirmBtnText}>✓</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Precificação</Text>
          <Text style={styles.subtitle}>
            {fila.length} código{fila.length !== 1 ? 's' : ''} na fila
          </Text>
        </View>

        {/* Input de código */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>CÓDIGO DE BARRAS</Text>
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={onSubmit}
              placeholder="Bipe ou digite o código"
              placeholderTextColor="#a09a8e"
              keyboardType="default"
              returnKeyType="send"
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
            />
            <TouchableOpacity
              style={[styles.addBtn, !input.trim() && styles.addBtnDisabled]}
              onPress={onSubmit}
              disabled={!input.trim()}
              activeOpacity={0.8}
            >
              <Text style={styles.addBtnText}>→</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Fila */}
        {loading ? (
          <ActivityIndicator color="#2f9e44" style={{ marginTop: 32 }} />
        ) : fila.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>
              Nenhum código aguardando. Bipe um produto para adicioná-lo à fila.
            </Text>
          </View>
        ) : (
          <FlatList
            data={fila}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            scrollEnabled={false}
            onRefresh={() => buscarFila(true)}
            refreshing={refreshing}
            contentContainerStyle={styles.filaList}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}

        {/* Footer */}
        <Text style={styles.footer}>by Lucas Alberto</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f5f0',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    flexGrow: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1c1b19',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b6558',
  },

  // Input card
  inputCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e0d5',
    shadowColor: '#1c1b19',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
    gap: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.08 * 11,
    color: '#6b6558',
    textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e0d5',
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    color: '#1c1b19',
    backgroundColor: '#f7f5f0',
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2f9e44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addBtnText: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '800',
  },

  // Fila
  filaList: {
    gap: 0,
  },
  filaRow: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e0d5',
  },
  filaInfo: {
    flex: 1,
    gap: 2,
  },
  filaCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    fontWeight: '700',
    color: '#1c1b19',
    letterSpacing: 0.5,
  },
  filaName: {
    fontSize: 12.5,
    color: '#6b6558',
    fontWeight: '500',
  },
  filaPreco: {
    fontSize: 12.5,
    color: '#2f9e44',
    fontWeight: '700',
  },
  filaHora: {
    fontSize: 11,
    color: '#a09a8e',
    fontWeight: '500',
    marginTop: 2,
  },
  confirmBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eaf7ee',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#b2dfbc',
  },
  confirmBtnText: {
    fontSize: 18,
    color: '#2f9e44',
    fontWeight: '800',
  },
  separator: {
    height: 8,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 42,
  },
  emptyText: {
    fontSize: 13.5,
    color: '#6b6558',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },

  // Footer
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: '#a09a8e',
    marginTop: 16,
    paddingBottom: 8,
  },
});
