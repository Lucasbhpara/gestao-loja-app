import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { createClient } from '@supabase/supabase-js';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';

const SUPABASE_URL = 'https://llstmcmgormolhbnszap.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Kk5u4REY7PUWKMpx9wlZnA_BXgfqrxF';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Status que significam "ainda está na fila". Só esses bloqueiam uma nova
// leitura do mesmo código — se a etiqueta já saiu (completed/error), o
// colaborador pode bipar de novo pra reimprimir.
const STATUS_EM_ANDAMENTO = ['pending', 'injected', 'printed'];

// collected_by é uuid no banco. Se o id do usuário logado não for um uuid
// válido, manda null em vez de quebrar o insert inteiro.
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function idComoUuid(id: unknown): string | null {
  return typeof id === 'string' && REGEX_UUID.test(id) ? id : null;
}

function formatarPreco(valor: number | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  if (isNaN(n)) return null;
  return 'R$ ' + n.toFixed(2).replace('.', ',');
}

interface PrecificacaoScreenProps {
  onVoltar: () => void;
}

interface BarcodeItem {
  id: string;
  barcode: string;
  status: string;
  product_name: string | null;
  preco_venda: number | null;
  created_at: string;
}

// Produto encontrado na planilha de estoque ou no catálogo geral
interface Produto {
  codigo_barras: string;
  produto: string;
  preco_venda: number | null;
  quantidade: number | null;
}

export default function PrecificacaoScreen({ onVoltar }: PrecificacaoScreenProps) {
  const { usuarioAtual } = useAuth();
  const [permissao, pedirPermissao] = useCameraPermissions();

  // 'bipar' = câmera ligada; 'buscar' = caixa de pesquisa (produtos sem
  // código de barras no corpo, tipo hortifruti e pesáveis).
  const [modo, setModo] = useState<'bipar' | 'buscar'>('bipar');

  const [scanned, setScanned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentBarcodes, setRecentBarcodes] = useState<BarcodeItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ultimoOk, setUltimoOk] = useState<{ codigo: string; nome: string | null; preco: string | null } | null>(null);

  // Trava imediata contra leitura dupla: o estado do React só chega no
  // próximo render, e a câmera dispara várias vezes nesse intervalo.
  const processando = useRef(false);
  const timerRearmar = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [jaBuscou, setJaBuscou] = useState(false);

  // Pede a permissão de câmera assim que a tela abre, uma vez só.
  useEffect(() => {
    if (permissao && !permissao.granted && permissao.canAskAgain) {
      pedirPermissao();
    }
  }, [permissao]);

  useEffect(() => {
    carregarDados();

    // Atualiza a fila em tempo real (a tabela já está publicada no Realtime).
    const canal = supabase
      .channel('barcode_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'barcode_collection' },
        () => {
          carregarDados();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
      if (timerRearmar.current) clearTimeout(timerRearmar.current);
    };
  }, []);

  async function carregarDados() {
    try {
      const { count: pendingCnt } = await supabase
        .from('barcode_collection')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { data: recent } = await supabase
        .from('barcode_collection')
        .select('id, barcode, status, product_name, preco_venda, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

      setPendingCount(pendingCnt || 0);
      setRecentBarcodes((recent as BarcodeItem[]) || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setCarregando(false);
    }
  }

  // Procura o produto pelo código: primeiro na planilha de estoque da loja
  // (que tem preço), depois no catálogo geral (só descrição, mas cobre muito
  // mais itens). O banco também preenche isso sozinho por gatilho — aqui é
  // só pra mostrar na tela na hora da leitura.
  async function buscarProdutoPorCodigo(codigo: string): Promise<Produto | null> {
    const { data: naLoja } = await supabase
      .from('estoque_loja_itens')
      .select('codigo_barras, produto, preco_venda, quantidade')
      .eq('codigo_barras', codigo)
      .order('preco_venda', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (naLoja) return naLoja as Produto;

    const { data: noCatalogo } = await supabase
      .from('produtos_catalogo')
      .select('codigo_barras, produto')
      .eq('codigo_barras', codigo)
      .limit(1)
      .maybeSingle();

    if (noCatalogo) {
      return {
        codigo_barras: (noCatalogo as any).codigo_barras,
        produto: (noCatalogo as any).produto,
        preco_venda: null,
        quantidade: null,
      };
    }

    return null;
  }

  async function buscarPorNome() {
    const texto = termo.trim();
    if (texto.length < 3) {
      Alert.alert('Busca muito curta', 'Digite pelo menos 3 letras pra pesquisar.');
      return;
    }

    setBuscando(true);
    setJaBuscou(true);
    setResultados([]);
    // % e _ são curingas no ilike; se o usuário digitar, vira busca torta.
    const seguro = texto.replace(/[%_]/g, '');
    try {
      const { data, error } = await supabase
        .from('estoque_loja_itens')
        .select('codigo_barras, produto, preco_venda, quantidade')
        .ilike('produto', `%${seguro}%`)
        .not('codigo_barras', 'is', null)
        .neq('codigo_barras', '')
        .order('produto')
        .limit(40);

      if (error) throw error;
      setResultados((data as Produto[]) || []);
    } catch (error: any) {
      Alert.alert('Erro na busca', error?.message || 'Não consegui pesquisar agora');
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }

  // Caminho único de inserção, usado tanto pela câmera quanto pela busca.
  async function adicionarNaFila(codigo: string, produtoJaConhecido?: Produto | null) {
    const limpo = codigo.trim();
    if (!limpo) return false;

    // Já tem esse código esperando na fila? Então não duplica.
    const { data: naFila } = await supabase
      .from('barcode_collection')
      .select('id, status')
      .eq('barcode', limpo)
      .in('status', STATUS_EM_ANDAMENTO)
      .limit(1)
      .maybeSingle();

    if (naFila) {
      Alert.alert(
        'Código já está na fila',
        `Esse código ainda não foi finalizado.\nStatus: ${getStatusLabel(naFila.status)}`
      );
      return false;
    }

    const produto = produtoJaConhecido !== undefined ? produtoJaConhecido : await buscarProdutoPorCodigo(limpo);

    const { error } = await supabase.from('barcode_collection').insert([
      {
        barcode: limpo,
        status: 'pending',
        collected_by: idComoUuid(usuarioAtual?.id),
        location: 'store',
        product_name: produto?.produto ?? null,
        preco_venda: produto?.preco_venda ?? null,
      },
    ]);

    if (error) throw error;

    setUltimoOk({
      codigo: limpo,
      nome: produto?.produto ?? null,
      preco: formatarPreco(produto?.preco_venda),
    });
    await carregarDados();
    return true;
  }

  function rearmarDepois(ms: number) {
    if (timerRearmar.current) clearTimeout(timerRearmar.current);
    timerRearmar.current = setTimeout(() => {
      processando.current = false;
      setScanned(false);
    }, ms);
  }

  async function handleBarcodeScanned(barcode: string) {
    // A trava por ref é o que vale: `scanned` só muda no próximo render e a
    // câmera dispara de novo antes disso, o que duplicava a leitura.
    if (processando.current) return;

    const codigo = barcode.trim();
    if (!codigo) return;

    processando.current = true;
    setScanned(true);
    setIsSubmitting(true);

    try {
      const adicionou = await adicionarNaFila(codigo);
      // Em qualquer caso espera antes de rearmar: sem isso, com a etiqueta
      // ainda na frente da câmera, o aviso de "já está na fila" reaparecia
      // em sequência sem parar.
      rearmarDepois(adicionou ? 1500 : 2500);
    } catch (error: any) {
      Alert.alert('❌ Erro', error?.message || 'Não consegui adicionar o código');
      rearmarDepois(2500);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function adicionarDaBusca(produto: Produto) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const adicionou = await adicionarNaFila(produto.codigo_barras, produto);
      if (adicionou) {
        Alert.alert('✅ Adicionado', `${produto.produto}\nCódigo ${produto.codigo_barras}`);
      }
    } catch (error: any) {
      Alert.alert('❌ Erro', error?.message || 'Não consegui adicionar o código');
    } finally {
      setIsSubmitting(false);
    }
  }

  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pendente',
      injected: 'Injetado',
      printed: 'Impresso',
      completed: 'Concluído',
      error: 'Erro',
    };
    return labels[status] || status;
  }

  function getStatusColor(status: string): string {
    const mapa: Record<string, string> = {
      pending: '#FFF3CD',
      injected: '#CFE2FF',
      printed: '#D1E7DD',
      completed: '#D1E7DD',
      error: '#F8D7DA',
    };
    return mapa[status] || '#f0f0f0';
  }

  if (!permissao) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator color={colors.navy700} />
        <Text style={styles.aviso}>Preparando a câmera…</Text>
      </View>
    );
  }

  // Sem permissão de câmera a busca por nome ainda funciona, então em vez de
  // travar a tela inteira, só escondemos o modo "bipar".
  const podeUsarCamera = permissao.granted;

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} style={styles.btnVoltar}>
          <Feather name="chevron-left" size={24} color={colors.navy900} />
        </TouchableOpacity>
        <Text style={styles.titulo}>Precificação</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.abas}>
        <TouchableOpacity
          style={[styles.aba, modo === 'bipar' && styles.abaAtiva]}
          onPress={() => { setModo('bipar'); setUltimoOk(null); }}
        >
          <Feather name="camera" size={15} color={modo === 'bipar' ? colors.white : colors.gray600} />
          <Text style={[styles.abaTexto, modo === 'bipar' && styles.abaTextoAtivo]}>Bipar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.aba, modo === 'buscar' && styles.abaAtiva]}
          onPress={() => { setModo('buscar'); setUltimoOk(null); }}
        >
          <Feather name="search" size={15} color={modo === 'buscar' ? colors.white : colors.gray600} />
          <Text style={[styles.abaTexto, modo === 'buscar' && styles.abaTextoAtivo]}>Buscar pelo nome</Text>
        </TouchableOpacity>
      </View>

      {modo === 'bipar' ? (
        !podeUsarCamera ? (
          <View style={styles.semCamera}>
            <Text style={styles.erro}>Precisa liberar o acesso à câmera para bipar os códigos.</Text>
            {permissao.canAskAgain ? (
              <TouchableOpacity style={styles.btnProximo} onPress={pedirPermissao}>
                <Text style={styles.btnProximoText}>Permitir câmera</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.aviso}>Libere nas configurações do celular, ou use a busca pelo nome.</Text>
            )}
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              facing="back"
              onBarcodeScanned={scanned ? undefined : ({ data }: { data: string }) => handleBarcodeScanned(data)}
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
              }}
            />
            <View style={[styles.scanFrame, scanned && styles.scanFrameLido]} />
          </View>
        )
      ) : (
        <View style={styles.buscaBox}>
          <Text style={styles.buscaDica}>
            Pra produtos sem código de barras no corpo (hortifruti, açougue, padaria).
          </Text>
          <View style={styles.buscaLinha}>
            <TextInput
              style={styles.buscaInput}
              placeholder="Ex.: banana caturra"
              placeholderTextColor={colors.gray400}
              value={termo}
              onChangeText={setTermo}
              onSubmitEditing={buscarPorNome}
              returnKeyType="search"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.buscaBtn} onPress={buscarPorNome} disabled={buscando}>
              {buscando ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Feather name="search" size={18} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>

          {jaBuscou && !buscando && resultados.length === 0 && (
            <Text style={styles.buscaVazia}>Nenhum produto encontrado com esse nome.</Text>
          )}

          {resultados.map((p) => {
            const preco = formatarPreco(p.preco_venda);
            return (
              <TouchableOpacity
                key={p.codigo_barras + p.produto}
                style={styles.resultado}
                onPress={() => adicionarDaBusca(p)}
                disabled={isSubmitting}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultadoNome}>{p.produto}</Text>
                  <Text style={styles.resultadoInfo}>
                    {p.codigo_barras}
                    {preco ? ` · ${preco}` : ''}
                    {p.quantidade !== null && p.quantidade !== undefined
                      ? ` · ${Number(p.quantidade).toFixed(0)} em estoque`
                      : ''}
                  </Text>
                </View>
                <Feather name="plus-circle" size={20} color={colors.green500} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {!!ultimoOk && (
        <View style={styles.okBox}>
          <Feather name="check-circle" size={16} color="#0F5132" />
          <View style={{ flex: 1 }}>
            <Text style={styles.okTexto}>{ultimoOk.nome || 'Produto não identificado'}</Text>
            <Text style={styles.okSub}>
              {ultimoOk.codigo}
              {ultimoOk.preco ? ` · preço atual ${ultimoOk.preco}` : ''}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.infoBox}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Pendentes:</Text>
          <Text style={styles.infoValue}>{pendingCount}</Text>
        </View>
        {isSubmitting && <ActivityIndicator color={colors.green500} size="small" />}
      </View>

      {modo === 'bipar' && scanned && !isSubmitting && (
        <TouchableOpacity
          style={styles.btnProximo}
          onPress={() => {
            if (timerRearmar.current) clearTimeout(timerRearmar.current);
            processando.current = false;
            setScanned(false);
          }}
        >
          <Text style={styles.btnProximoText}>Bipar próximo agora</Text>
        </TouchableOpacity>
      )}

      {!carregando && recentBarcodes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Últimos coletados</Text>
          {recentBarcodes.map((item) => {
            const preco = formatarPreco(item.preco_venda);
            return (
              <View
                key={item.id}
                style={[styles.barcodeItem, { backgroundColor: getStatusColor(item.status) }]}
              >
                <View style={styles.barcodeLeft}>
                  <Text style={styles.barcodeCode}>{item.product_name || item.barcode}</Text>
                  <Text style={styles.barcodeTime}>
                    {item.product_name ? `${item.barcode} · ` : ''}
                    {preco ? `${preco} · ` : ''}
                    {new Date(item.created_at).toLocaleTimeString('pt-BR')}
                  </Text>
                </View>
                <Text style={styles.barcodeStatus}>{getStatusLabel(item.status)}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray50,
  },
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.gray50,
  },
  aviso: {
    fontSize: 13,
    color: colors.gray600,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
    marginTop: 12,
  },
  btnVoltar: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.navy900,
  },
  abas: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  aba: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  abaAtiva: {
    backgroundColor: colors.navy700,
    borderColor: colors.navy700,
  },
  abaTexto: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.gray600,
  },
  abaTextoAtivo: {
    color: colors.white,
  },
  cameraContainer: {
    position: 'relative',
    height: 320,
    marginVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.gray900,
  },
  camera: {
    flex: 1,
  },
  semCamera: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.lg,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  scanFrame: {
    position: 'absolute',
    width: 250,
    height: 250,
    top: '50%',
    left: '50%',
    marginTop: -125,
    marginLeft: -125,
    borderWidth: 3,
    borderColor: '#00ff00',
    borderRadius: 10,
  },
  scanFrameLido: {
    borderColor: '#FFC107',
  },
  buscaBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  buscaDica: {
    fontSize: 12,
    color: colors.gray600,
    marginBottom: 2,
  },
  buscaLinha: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buscaInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 14,
    color: colors.gray900,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  buscaBtn: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy700,
    borderRadius: radius.md,
  },
  buscaVazia: {
    fontSize: 12.5,
    color: colors.gray600,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  resultado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  resultadoNome: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray900,
  },
  resultadoInfo: {
    fontSize: 11,
    color: colors.gray600,
    marginTop: 2,
  },
  okBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#D1E7DD',
    borderRadius: radius.md,
  },
  okTexto: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F5132',
  },
  okSub: {
    fontSize: 11,
    color: '#0F5132',
    marginTop: 2,
  },
  infoBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray600,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.green500,
  },
  btnProximo: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.green500,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  btnProximoText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gray900,
    marginBottom: spacing.md,
  },
  barcodeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  barcodeLeft: {
    flex: 1,
  },
  barcodeCode: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray900,
  },
  barcodeTime: {
    fontSize: 11,
    color: colors.gray600,
    marginTop: 2,
  },
  barcodeStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gray600,
    marginLeft: spacing.sm,
  },
  erro: {
    color: colors.red500,
    textAlign: 'center',
    fontSize: 13,
  },
});
