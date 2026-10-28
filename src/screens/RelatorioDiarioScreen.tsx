import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import CabecalhoTela from '../components/CabecalhoTela';
import { compartilharPdf } from '../lib/compartilharPdf';
import { somarDiasIso, nomeDia, diaMesCurto, reais } from '../data/vendaDiaApi';
import { pctTexto } from '../data/metaVendaApi';
import { RelatorioDiario, carregarRelatorioDiario, htmlRelatorioDiario, nomeSetor, nomeTipo } from '../data/relatorioDiarioApi';

// Relatório diário (só do Lucas). Abre pela notificação "Relatório pronto"
// e, nesse caso, já abre a tela de compartilhar para mandar o PDF no WhatsApp.
const VERDE = '#1E8E5A';
const VERMELHO = '#C0392B';

export default function RelatorioDiarioScreen({
  onVoltar,
  diaInicial,
  compartilharAoAbrir,
}: {
  onVoltar: () => void;
  diaInicial?: string | null;
  compartilharAoAbrir?: boolean;
}) {
  const [dia, setDia] = useState<string | null>(diaInicial ?? null);
  const [r, setR] = useState<RelatorioDiario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const jaCompartilhou = useRef(false);

  const carregar = useCallback(
    (forcar = false) => {
      setErro(null);
      carregarRelatorioDiario(dia, forcar)
        .then((d) => {
          if (!d) setErro('Ainda não há vendas subidas.');
          setR(d);
          if (d && d.diaVenda !== dia) setDia(d.diaVenda);
        })
        .catch((e) => setErro(e?.message ?? 'Não consegui montar o relatório.'))
        .finally(() => {
          setCarregando(false);
          setAtualizando(false);
        });
    },
    [dia],
  );
  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [carregar]);

  async function enviar(rel: RelatorioDiario) {
    setGerando(true);
    try {
      await compartilharPdf(htmlRelatorioDiario(rel), `relatorio-diario-${rel.diaVenda.split('-').reverse().join('-')}`, 'Enviar relatório diário');
    } catch (e: any) {
      Alert.alert('Não deu certo', e?.message ?? 'Não consegui gerar o PDF.');
    } finally {
      setGerando(false);
    }
  }

  // Veio da notificação: assim que o relatório carregar, abre o compartilhar.
  useEffect(() => {
    if (compartilharAoAbrir && r && !jaCompartilhou.current) {
      jaCompartilhou.current = true;
      enviar(r);
    }
  }, [compartilharAoAbrir, r]);

  const m = r?.meta;

  return (
    <View style={s.flex}>
      <CabecalhoTela
        titulo="Relatório diário"
        subtitulo={r ? `Hoje: ${nomeDia(r.diaFolgas)} · vendas de ${diaMesCurto(r.diaVenda)}` : 'Venda, meta, folgas e quebra'}
        icone="file-text"
        onVoltar={onVoltar}
      >
        {r && (
          <View style={s.diaNav}>
            <TouchableOpacity style={s.seta} onPress={() => setDia(somarDiasIso(r.diaVenda, -1))} disabled={r.diaVenda <= r.venda.primeiro}>
              <Feather name="chevron-left" size={20} color={colors.white} />
            </TouchableOpacity>
            <Text style={s.diaTexto}>{diaMesCurto(r.diaFolgas)}</Text>
            <TouchableOpacity style={s.seta} onPress={() => setDia(somarDiasIso(r.diaVenda, 1))} disabled={r.diaVenda >= r.venda.ultimo}>
              <Feather name="chevron-right" size={20} color={colors.white} />
            </TouchableOpacity>
          </View>
        )}
      </CabecalhoTela>

      <ScrollView
        style={s.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: 12 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(true); }} />}
      >
        {carregando && !r ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: 40 }} />
        ) : erro && !r ? (
          <Text style={s.vazio}>{erro}</Text>
        ) : r ? (
          <View style={{ gap: 12, opacity: carregando ? 0.5 : 1 }}>
            <TouchableOpacity style={s.botao} onPress={() => enviar(r)} disabled={gerando}>
              {gerando ? <ActivityIndicator color={colors.white} /> : <Feather name="send" size={18} color={colors.white} />}
              <Text style={s.botaoTxt}>Enviar PDF no WhatsApp</Text>
            </TouchableOpacity>

            <Text style={s.secao}>ONTEM · {nomeDia(r.diaVenda).toUpperCase()}</Text>
            <View style={s.card}>
              <Text style={s.rotulo}>VENDA DE ONTEM</Text>
              <Text style={s.total}>{reais(r.venda.total)}</Text>
              <Text style={s.legenda}>
                vs {diaMesCurto(r.venda.ant)}: {reais(r.venda.totalAnt, 0)}
              </Text>
            </View>

            <View style={s.card}>
              <Text style={s.rotulo}>META DE ONTEM</Text>
              {m && m.metaDia != null && m.pctDia != null ? (
                <>
                  <Text style={[s.kpi, { color: m.pctDia >= 100 ? VERDE : VERMELHO }]}>{pctTexto(m.pctDia)}</Text>
                  <Text style={s.legenda}>
                    {reais(m.vendaDia, 0)} de {reais(m.metaDia, 0)} ·{' '}
                    {m.pctDia >= 100 ? `bateu (+${reais(m.vendaDia - m.metaDia, 0)})` : `faltou ${reais(m.metaDia - m.vendaDia, 0)}`}
                  </Text>
                </>
              ) : (
                <Text style={s.legenda}>Sem meta cadastrada para esse dia.</Text>
              )}
              {m && m.temMes ? (
                <Text style={[s.legenda, { marginTop: 6 }]}>
                  Mês: {pctTexto(m.pctMes)} · {m.faltaMes > 0 ? `falta ${reais(m.faltaMes, 0)}` : 'meta batida'}
                  {m.precisaPorDia != null ? ` (${reais(m.precisaPorDia, 0)}/dia)` : ''}
                </Text>
              ) : null}
            </View>

            <Text style={s.secao}>HOJE · {nomeDia(r.diaFolgas).toUpperCase()}</Text>
            <View style={[s.card, { borderWidth: 2, borderColor: VERDE }]}>
              <Text style={s.rotulo}>META DE HOJE</Text>
              <Text style={s.total}>{r.metaHoje != null ? reais(r.metaHoje, 0) : '—'}</Text>
              {r.metaHoje == null ? (
                <Text style={s.legenda}>Sem meta cadastrada para hoje.</Text>
              ) : m && m.temMes && m.faltaMes > 0 && m.precisaPorDia != null ? (
                <Text style={s.legenda}>
                  Para fechar o mês: {reais(m.precisaPorDia, 0)}/dia nos {m.diasRestantes} dias que faltam
                </Text>
              ) : null}
            </View>

            <View style={s.card}>
              <Text style={s.titulo}>Colaboradores fora hoje ({diaMesCurto(r.diaFolgas)}) · {r.totalFora}</Text>
              {r.folgas.length === 0 ? (
                <Text style={s.legenda}>Ninguém de folga, falta ou atestado lançado.</Text>
              ) : (
                r.folgas.map((f) => (
                  <View key={f.setor} style={s.linha}>
                    <Text style={s.linhaTitulo}>
                      {nomeSetor(f.setor)} <Text style={s.legenda}>({f.pessoas.length})</Text>
                    </Text>
                    <Text style={s.legenda}>
                      {f.pessoas.map((p) => (p.tipo === 'folga' ? p.nome : `${p.nome} (${nomeTipo(p.tipo)})`)).join(', ')}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={s.card}>
              <Text style={s.titulo}>Quebra por setor</Text>
              {r.quebras ? (
                <>
                  <Text style={[s.legenda, { marginBottom: 4 }]}>
                    acumulado de {diaMesCurto(r.quebras.ini)} a {diaMesCurto(r.quebras.fim)}
                  </Text>
                  {r.quebras.setores.map((q) => (
                    <View key={q.setor} style={[s.linha, { flexDirection: 'row', alignItems: 'center' }]}>
                      <Text style={[s.linhaTitulo, { flex: 1 }]}>{nomeSetor(q.setor)}</Text>
                      <Text style={[s.linhaTitulo, { marginRight: 10 }]}>{reais(q.perdido, 0)}</Text>
                      <Text style={[s.linhaTitulo, { width: 58, textAlign: 'right', color: (q.pct ?? 0) > 3 ? VERMELHO : '#0E1B2C' }]}>
                        {q.pct == null ? '—' : pctTexto(q.pct)}
                      </Text>
                    </View>
                  ))}
                  <View style={[s.linha, { flexDirection: 'row' }]}>
                    <Text style={[s.linhaTitulo, { flex: 1 }]}>Total</Text>
                    <Text style={[s.linhaTitulo, { marginRight: 10 }]}>{reais(r.quebras.perdido, 0)}</Text>
                    <Text style={[s.linhaTitulo, { width: 58, textAlign: 'right' }]}>
                      {r.quebras.vendido > 0 ? pctTexto((r.quebras.perdido / r.quebras.vendido) * 100) : '—'}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={s.legenda}>Nenhum relatório de perdas importado.</Text>
              )}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F3F5F9' },
  diaNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: spacing.md },
  seta: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  diaTexto: { color: colors.white, fontSize: 18, fontWeight: '800', minWidth: 70, textAlign: 'center' },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 14, elevation: 1, shadowColor: '#0E1B2C', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  rotulo: { fontSize: 11, fontWeight: '800', color: colors.gray600, letterSpacing: 0.5 },
  total: { fontSize: 30, fontWeight: '800', color: '#0E1B2C', marginTop: 4 },
  kpi: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  legenda: { fontSize: 12, color: colors.gray600, marginTop: 2, lineHeight: 17 },
  titulo: { fontSize: 15.5, fontWeight: '800', color: '#0E1B2C', marginBottom: 4 },
  linha: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.gray100 },
  linhaTitulo: { fontSize: 13.5, fontWeight: '700', color: '#0E1B2C' },
  secao: { fontSize: 12, fontWeight: '800', color: colors.gray600, letterSpacing: 0.6, marginTop: 6 },
  vazio: { textAlign: 'center', color: colors.gray600, marginTop: 20 },
  botao: { backgroundColor: '#1FA855', borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  botaoTxt: { color: colors.white, fontWeight: '800', fontSize: 15.5 },
});
