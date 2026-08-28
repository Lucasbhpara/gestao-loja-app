import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { colors, radius, spacing } from '../theme/colors';
import { ItemEstoqueLoja, buscarEstoqueLoja, buscarDataEstoqueLoja } from '../data/estoqueLojaApi';
import { camaraDisponivel } from '../lib/plataforma';

function formatarQuantidade(q: number): string {
  if (Number.isInteger(q)) return String(q);
  return String(Math.round(q * 1000) / 1000);
}

function formatarData(iso: string | null): string {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export default function EstoqueLojaScreen({ onVoltar }: { onVoltar: () => void }) {
  const [dataEstoque, setDataEstoque] = useState<string | null>(null);

  useEffect(() => {
    buscarDataEstoqueLoja()
      .then(setDataEstoque)
      .catch(() => {});
  }, []);

  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ItemEstoqueLoja[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const buscaInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const termoLimpo = termo.trim();
    if (!termoLimpo) {
      setResultados([]);
      setBuscando(false);
      setErro(null);
      return;
    }
    setBuscando(true);
    const timer = setTimeout(() => {
      buscarEstoqueLoja(termoLimpo)
        .then((r) => {
          setResultados(r);
          setErro(null);
        })
        .catch((e) => setErro(e?.message ?? 'Não consegui buscar o estoque.'))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [termo]);

  // --- scanner ---------------------------------------------------------------
  const [modo, setModo] = useState<'busca' | 'scanner'>('busca');
  const [permissao, solicitarPermissao] = useCameraPermissions();
  const [scanBloqueado, setScanBloqueado] = useState(false);

  function abrirScanner() {
    setScanBloqueado(false);
    setModo('scanner');
  }

  function aoEscanear(resultado: BarcodeScanningResult) {
    if (scanBloqueado) return;
    setScanBloqueado(true);
    const codigo = resultado.data.trim();
    setModo('busca');
    setTermo(codigo);
  }

  if (modo === 'scanner') {
    if (!permissao) {
      return (
        <View style={styles.flex}>
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        </View>
      );
    }
    if (!permissao.granted) {
      return (
        <View style={[styles.flex, styles.permissaoBox]}>
          <Text style={styles.permissaoTitulo}>Preciso da câmera pra escanear</Text>
          <Text style={styles.permissaoTexto}>
            {permissao.canAskAgain
              ? 'Permite o acesso à câmera pra ler o código de barras do produto.'
              : 'O acesso à câmera foi negado antes. Ative manualmente nas configurações do celular, em Apps → Gestão de Loja → Permissões.'}
          </Text>
          {permissao.canAskAgain && (
            <TouchableOpacity style={styles.btnPrimario} onPress={solicitarPermissao}>
              <Text style={styles.btnPrimarioTexto}>Permitir câmera</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.btnSecundario} onPress={() => setModo('busca')}>
            <Text style={styles.btnSecundarioTexto}>Voltar</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.flex}>
        <CameraView
          style={styles.flex}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
          onBarcodeScanned={scanBloqueado ? undefined : aoEscanear}
        />
        <View style={styles.scannerOverlayTopo}>
          <TouchableOpacity onPress={() => setModo('busca')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.scannerVoltar}>‹ Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.scannerTitulo}>Aponte pro código de barras</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Estoque Loja</Text>
        <View style={{ width: 50 }} />
      </View>

      {dataEstoque && (
        <View style={styles.avisoData}>
          <Text style={styles.avisoDataTexto}>Estoque de {formatarData(dataEstoque)} · atualizado por importação de planilha</Text>
        </View>
      )}

      <View style={styles.buscaContainer}>
        <TextInput
          ref={buscaInputRef}
          style={styles.buscaInput}
          placeholder="Buscar por código ou nome do produto…"
          value={termo}
          onChangeText={setTermo}
          autoFocus
        />
        {camaraDisponivel && (
          <TouchableOpacity style={styles.btnScan} onPress={abrirScanner}>
            <Text style={styles.btnScanTexto}>Escanear</Text>
          </TouchableOpacity>
        )}
      </View>

      {erro && (
        <View style={styles.erroBox}>
          <Text style={styles.erroTexto}>{erro}</Text>
        </View>
      )}

      <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        {buscando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : !termo.trim() ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Digite um código ou nome pra consultar o estoque de um produto.</Text>
          </View>
        ) : resultados.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Não achei "{termo.trim()}" no estoque com quantidade diferente de zero.</Text>
          </View>
        ) : (
          resultados.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemCardProduto}>{item.produto}</Text>
                <Text style={styles.itemCardCodigo}>{item.codigoInterno}</Text>
              </View>
              <Text style={styles.itemCardQtd}>{formatarQuantidade(item.quantidade)}</Text>
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
  titulo: { fontSize: 15, fontWeight: '700', color: colors.navy900 },
  avisoData: {
    backgroundColor: colors.gray100,
    paddingVertical: 6,
    paddingHorizontal: spacing.lg,
  },
  avisoDataTexto: { fontSize: 10.5, color: colors.gray600, fontWeight: '600', textAlign: 'center' },
  buscaContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  buscaInput: {
    flex: 1,
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.gray900,
  },
  btnScan: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  btnScanTexto: { color: colors.white, fontSize: 12, fontWeight: '700' },
  permissaoBox: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  permissaoTitulo: { fontSize: 17, fontWeight: '700', color: colors.navy900, textAlign: 'center' },
  permissaoTexto: { fontSize: 13, color: colors.gray600, textAlign: 'center', marginTop: spacing.md, lineHeight: 19 },
  btnPrimario: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.xxl, marginTop: spacing.xl },
  btnPrimarioTexto: { color: colors.white, fontSize: 13.5, fontWeight: '700' },
  btnSecundario: { paddingVertical: 12, paddingHorizontal: spacing.xxl, marginTop: spacing.sm },
  btnSecundarioTexto: { color: colors.navy700, fontSize: 13.5, fontWeight: '600' },
  scannerOverlayTopo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(18,27,74,0.55)',
  },
  scannerVoltar: { color: colors.white, fontSize: 15, fontWeight: '600' },
  scannerTitulo: { color: colors.white, fontSize: 14, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center' },
  erroBox: { backgroundColor: '#FBDEDC', margin: spacing.lg, marginBottom: 0, borderRadius: radius.md, padding: spacing.md },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 19 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemCardProduto: { fontSize: 13, fontWeight: '600', color: colors.gray900 },
  itemCardCodigo: { fontSize: 10.5, color: colors.gray400, marginTop: 2, fontWeight: '600' },
  itemCardQtd: { fontSize: 13, fontWeight: '700', color: colors.navy700 },
});
