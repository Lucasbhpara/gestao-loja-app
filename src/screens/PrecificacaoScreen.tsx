import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity, ScrollView } from 'react-native';
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

interface PrecificacaoScreenProps {
  onVoltar: () => void;
}

interface BarcodeItem {
  id: string;
  barcode: string;
  status: string;
  created_at: string;
}

export default function PrecificacaoScreen({ onVoltar }: PrecificacaoScreenProps) {
  const { usuarioAtual } = useAuth();
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentBarcodes, setRecentBarcodes] = useState<BarcodeItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ultimoOk, setUltimoOk] = useState<string | null>(null);

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
        .select('id, barcode, status, created_at')
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

  async function handleBarcodeScanned(barcode: string) {
    if (scanned || isSubmitting) return;

    const codigo = barcode.trim();
    if (!codigo) return;

    setScanned(true);
    setIsSubmitting(true);

    try {
      // Já tem esse código esperando na fila? Então não duplica.
      const { data: naFila } = await supabase
        .from('barcode_collection')
        .select('id, status')
        .eq('barcode', codigo)
        .in('status', STATUS_EM_ANDAMENTO)
        .limit(1)
        .maybeSingle();

      if (naFila) {
        Alert.alert(
          'Código já está na fila',
          `Esse código ainda não foi finalizado.\nStatus: ${getStatusLabel(naFila.status)}`
        );
        setScanned(false);
        return;
      }

      const { error } = await supabase.from('barcode_collection').insert([
        {
          barcode: codigo,
          status: 'pending',
          collected_by: idComoUuid(usuarioAtual?.id),
          location: 'store',
        },
      ]);

      if (error) throw error;

      // Sem alerta de sucesso: a coleta é contínua, um pop-up a cada bipe
      // trava o fluxo. Mostra confirmação na tela e rearma sozinho.
      setUltimoOk(codigo);
      await carregarDados();
      setTimeout(() => setScanned(false), 1500);
    } catch (error: any) {
      Alert.alert('❌ Erro', error?.message || 'Não consegui adicionar o código');
      setScanned(false);
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

  if (!permissao.granted) {
    return (
      <View style={styles.centro}>
        <Text style={styles.erro}>Precisa liberar o acesso à câmera para bipar os códigos.</Text>
        {permissao.canAskAgain ? (
          <TouchableOpacity style={styles.btnProximo} onPress={pedirPermissao}>
            <Text style={styles.btnProximoText}>Permitir câmera</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.aviso}>Libere nas configurações do celular e volte aqui.</Text>
        )}
        <TouchableOpacity style={styles.btnVoltarTexto} onPress={onVoltar}>
          <Text style={styles.btnProximoText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} style={styles.btnVoltar}>
          <Feather name="chevron-left" size={24} color={colors.navy900} />
        </TouchableOpacity>
        <Text style={styles.titulo}>Precificação</Text>
        <View style={{ width: 24 }} />
      </View>

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

      {!!ultimoOk && (
        <View style={styles.okBox}>
          <Feather name="check-circle" size={16} color="#0F5132" />
          <Text style={styles.okTexto}>Último código adicionado: {ultimoOk}</Text>
        </View>
      )}

      <View style={styles.infoBox}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Pendentes:</Text>
          <Text style={styles.infoValue}>{pendingCount}</Text>
        </View>
        {isSubmitting && <ActivityIndicator color={colors.green500} size="small" />}
      </View>

      {scanned && !isSubmitting && (
        <TouchableOpacity style={styles.btnProximo} onPress={() => setScanned(false)}>
          <Text style={styles.btnProximoText}>Bipar próximo agora</Text>
        </TouchableOpacity>
      )}

      {!carregando && recentBarcodes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Últimos coletados</Text>
          {recentBarcodes.map((item) => (
            <View
              key={item.id}
              style={[styles.barcodeItem, { backgroundColor: getStatusColor(item.status) }]}
            >
              <View style={styles.barcodeLeft}>
                <Text style={styles.barcodeCode}>{item.barcode}</Text>
                <Text style={styles.barcodeTime}>
                  {new Date(item.created_at).toLocaleTimeString('pt-BR')}
                </Text>
              </View>
              <Text style={styles.barcodeStatus}>{getStatusLabel(item.status)}</Text>
            </View>
          ))}
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
  btnVoltarTexto: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.navy700,
    borderRadius: radius.md,
  },
  titulo: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.navy900,
  },
  cameraContainer: {
    position: 'relative',
    height: 350,
    marginVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.gray900,
  },
  camera: {
    flex: 1,
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
  okBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#D1E7DD',
    borderRadius: radius.md,
  },
  okTexto: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F5132',
  },
  infoBox: {
    marginHorizontal: spacing.lg,
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
  },
  erro: {
    color: colors.red500,
    textAlign: 'center',
    fontSize: 13,
  },
});
