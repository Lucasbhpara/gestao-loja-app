import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import CabecalhoTela from '../components/CabecalhoTela';
import { compartilharPdf } from '../lib/compartilharPdf';
import { carregarRelatorioMensal, mesMaisRecente } from '../data/relatorioMensalApi';
import { DadosRelatorioMensal, rmxDocumentoHtml, rmxMesSoma, rmxMesTitulo, RMX_MESES } from '../data/relatorioMensalHtml';

// Relatório mensal: o mês inteiro da loja (meta por setor, horários,
// pagamentos, PDVs, produtos, quebras e turnover). A tela mostra o mesmo
// HTML que vira o PDF — o botão "Enviar PDF" abre a tela de compartilhar do
// celular (WhatsApp, e-mail, Drive…). Os arquivos do mês são subidos no
// portal; aqui é só consulta.
export default function RelatorioMensalScreen({ onVoltar }: { onVoltar: () => void }) {
  const [mes, setMes] = useState<string | null>(null);
  const [dados, setDados] = useState<DadosRelatorioMensal | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    mesMaisRecente()
      .then(setMes)
      .catch(() => {
        const hoje = new Date();
        setMes(rmxMesSoma(hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0'), -1));
      });
  }, []);

  const carregar = useCallback(() => {
    if (!mes) return;
    setCarregando(true);
    setErro(null);
    carregarRelatorioMensal(mes)
      .then(setDados)
      .catch(() => setErro('Não consegui montar o relatório. Confira a internet e tente de novo.'))
      .finally(() => setCarregando(false));
  }, [mes]);
  useEffect(carregar, [carregar]);

  const html = useMemo(() => (dados ? rmxDocumentoHtml(dados) : ''), [dados]);

  async function enviarPdf() {
    if (!dados) return;
    setGerando(true);
    try {
      const nomeMes = RMX_MESES[Number(dados.mes.slice(5)) - 1];
      await compartilharPdf(rmxDocumentoHtml(dados, { paraPdf: true }), `relatorio-mensal-${nomeMes}-${dados.mes.slice(0, 4)}`, 'Enviar relatório mensal');
    } catch (e: any) {
      Alert.alert('Não deu para gerar o PDF', e?.message || 'Tente de novo.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo="Relatório mensal" subtitulo={mes ? rmxMesTitulo(mes) : ' '} icone="file-text" onVoltar={onVoltar}>
        <View style={styles.barra}>
          <TouchableOpacity style={styles.seta} onPress={() => mes && setMes(rmxMesSoma(mes, -1))} disabled={!mes || carregando} accessibilityLabel="Mês anterior">
            <Feather name="chevron-left" size={20} color={colors.navy900} />
          </TouchableOpacity>
          <Text style={styles.mes}>{mes ? rmxMesTitulo(mes) : '…'}</Text>
          <TouchableOpacity style={styles.seta} onPress={() => mes && setMes(rmxMesSoma(mes, 1))} disabled={!mes || carregando} accessibilityLabel="Próximo mês">
            <Feather name="chevron-right" size={20} color={colors.navy900} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.botaoPdf, (!dados || gerando) && { opacity: 0.6 }]} onPress={enviarPdf} disabled={!dados || gerando}>
            {gerando ? <ActivityIndicator color={colors.white} size="small" /> : <Feather name="share-2" size={16} color={colors.white} />}
            <Text style={styles.botaoPdfTexto}>Enviar PDF</Text>
          </TouchableOpacity>
        </View>
      </CabecalhoTela>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.navy700} size="large" />
          <Text style={styles.aviso}>Montando o relatório…</Text>
        </View>
      ) : erro ? (
        <View style={styles.centro}>
          <Text style={styles.aviso}>{erro}</Text>
          <TouchableOpacity style={[styles.botaoPdf, { marginTop: spacing.md }]} onPress={carregar}>
            <Text style={styles.botaoPdfTexto}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView originWhitelist={['*']} source={{ html }} style={styles.flex} javaScriptEnabled={false} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F3F5F8' },
  barra: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  seta: { width: 38, height: 38, borderRadius: radius.full, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  mes: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: colors.white },
  botaoPdf: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2F7BFF', paddingHorizontal: 14, height: 38, borderRadius: radius.full },
  botaoPdfTexto: { color: colors.white, fontWeight: '800', fontSize: 13.5 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  aviso: { marginTop: spacing.md, color: colors.gray600, fontSize: 14, textAlign: 'center' },
});
