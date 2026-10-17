import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import CabecalhoTela from '../components/CabecalhoTela';
import { colors, radius, spacing } from '../theme/colors';
import { compartilharPdf } from '../lib/compartilharPdf';
import {
  anteriorDoSetor,
  brl,
  dentroDaMeta,
  dia,
  htmlResultado,
  listarResultadosInventario,
  pct,
  ResultadoInventario,
  temCompensacao,
  textoResultado,
  ultimosPorSetor,
} from '../data/inventarioResultadosApi';

// Resultados de inventário: o resultado final de cada setor (último inventário)
// e o histórico, com compartilhar no WhatsApp e PDF de 1 página. A importação
// do PDF da regional é feita no Portal (Indicadores › Resultados de inventário).

const VERDE = '#1E8E5A';
const VERMELHO = '#C0392B';
const NAVY = '#0E1B2C';

export default function ResultadosInventarioScreen({ onVoltar }: { onVoltar: () => void }) {
  const [lista, setLista] = useState<ResultadoInventario[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(await listarResultadosInventario());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
      setLista((x) => x ?? []);
    } finally {
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onVoltar();
      return true;
    });
    return () => sub.remove();
  }, [onVoltar]);

  const todos = lista ?? [];
  const ultimos = useMemo(() => ultimosPorSetor(todos), [todos]);
  const historico = useMemo(() => todos.slice().sort((a, b) => b.periodo_fim.localeCompare(a.periodo_fim) || a.setor.localeCompare(b.setor)), [todos]);

  async function whatsapp(r: ResultadoInventario) {
    const texto = textoResultado(r, todos);
    const url = 'whatsapp://send?text=' + encodeURIComponent(texto);
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // cai para o compartilhar do celular
    }
    await Share.share({ message: texto });
  }

  async function compartilharTexto(r: ResultadoInventario) {
    await Share.share({ message: textoResultado(r, todos) });
  }

  async function pdf(r: ResultadoInventario) {
    setGerando(r.id);
    try {
      await compartilharPdf(htmlResultado(r, todos), `inventario-${r.setor}-${dia(r.periodo_inicio)}-a-${dia(r.periodo_fim)}`);
    } catch (e) {
      Alert.alert('PDF', (e as Error).message);
    } finally {
      setGerando(null);
    }
  }

  return (
    <View style={st.flex}>
      <CabecalhoTela titulo="Resultados de inventário" subtitulo="Resultado final de cada setor" icone="award" onVoltar={onVoltar} />
      <ScrollView
        style={st.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
        {erro ? <Text style={st.erro}>{erro}</Text> : null}
        {!lista ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: 24 }} />
        ) : !ultimos.length ? (
          <View style={st.card}>
            <Text style={st.titulo}>Nenhum resultado ainda</Text>
            <Text style={st.sub}>Importe o PDF "Resultado de Inventário" no Portal (Indicadores › Resultados de inventário).</Text>
          </View>
        ) : (
          ultimos.map((r) => {
            const ant = anteriorDoSetor(r, todos);
            const ok = dentroDaMeta(r.perda_total_pct, r.meta_total_pct);
            const melhorou = ant && r.perda_total_pct != null && ant.perda_total_pct != null ? r.perda_total_pct <= ant.perda_total_pct : null;
            return (
              <View key={r.id} style={[st.card, { gap: 12 }]}>
                <View style={st.linhaTopo}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.setor}>{r.setor}</Text>
                    <Text style={st.sub}>
                      {dia(r.periodo_inicio)} a {dia(r.periodo_fim)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={st.rotulo}>PERDA TOTAL</Text>
                    <Text style={[st.grande, { color: ok == null ? NAVY : ok ? VERDE : VERMELHO }]}>{pct(r.perda_total_pct)}</Text>
                    <Text style={st.sub}>
                      meta {pct(r.meta_total_pct)}
                      {ok == null ? '' : ok ? ' · ✅ dentro' : ' · ❌ acima'}
                    </Text>
                  </View>
                </View>
                <Text style={st.texto}>
                  {brl(r.perda_total)} de perda em {brl(r.venda)} de venda
                </Text>
                {ant ? (
                  <Text style={st.sub}>
                    Anterior ({dia(ant.periodo_inicio).slice(0, 5)}–{dia(ant.periodo_fim).slice(0, 5)}): {pct(ant.perda_total_pct)}{' '}
                    <Text style={{ fontWeight: '800', color: melhorou ? VERDE : VERMELHO }}>
                      {melhorou ? '▼' : '▲'} {pct(Math.abs((r.perda_total_pct ?? 0) - (ant.perda_total_pct ?? 0))).replace('%', ' p.p.')}
                    </Text>
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Mini rotulo="Identificada" real={r.perda_identificada_pct} meta={r.meta_identificada_pct} valor={r.perda_identificada} />
                  <Mini rotulo="Não identificada" real={r.perda_nao_identificada_pct} meta={r.meta_nao_identificada_pct} valor={r.perda_nao_identificada} />
                </View>
                {temCompensacao(r) ? (
                  <View style={st.alerta}>
                    <Text style={st.alertaTexto}>
                      <Text style={{ fontWeight: '800' }}>Atenção: </Text>
                      {brl(r.quebra_bruta)} de quebra em {r.n_quebra} produtos estão sendo compensados por {brl(Math.abs(r.sobra_bruta))} de sobra em {r.n_sobra} — o total esconde troca de código.
                    </Text>
                  </View>
                ) : null}
                <Lista titulo="Maiores quebras" itens={r.destaques.maiores_quebras} cor={VERMELHO} />
                <Lista titulo="Maiores sobras" itens={r.destaques.maiores_sobras} cor="#B7791F" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[st.botao, { backgroundColor: '#25D366' }]} onPress={() => whatsapp(r)}>
                    <Feather name="message-circle" size={16} color={colors.white} />
                    <Text style={st.botaoTxt}>WhatsApp</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.botao, st.botaoClaro]} onPress={() => compartilharTexto(r)}>
                    <Feather name="share-2" size={16} color={colors.navy700} />
                    <Text style={[st.botaoTxt, { color: colors.navy700 }]}>Texto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.botao, st.botaoClaro]} onPress={() => pdf(r)} disabled={gerando === r.id}>
                    {gerando === r.id ? <ActivityIndicator color={colors.navy700} /> : <Feather name="file-text" size={16} color={colors.navy700} />}
                    <Text style={[st.botaoTxt, { color: colors.navy700 }]}>PDF</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {historico.length ? (
          <>
            <Text style={st.secao}>Histórico</Text>
            <View style={st.card}>
              {historico.map((r, i) => {
                const ok = dentroDaMeta(r.perda_total_pct, r.meta_total_pct);
                return (
                  <TouchableOpacity key={r.id} style={[st.histLinha, i > 0 && st.histBorda]} onPress={() => pdf(r)}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.histSetor}>{r.setor}</Text>
                      <Text style={st.sub}>
                        {dia(r.periodo_inicio)} a {dia(r.periodo_fim)} · {brl(r.perda_total)}
                      </Text>
                    </View>
                    <Text style={[st.histPct, { color: ok == null ? NAVY : ok ? VERDE : VERMELHO }]}>{pct(r.perda_total_pct)}</Text>
                    <Feather name="file-text" size={16} color={colors.gray400} />
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[st.sub, { textAlign: 'center' }]}>Toque num inventário do histórico para gerar o PDF.</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Mini({ rotulo, real, meta, valor }: { rotulo: string; real: number | null; meta: number | null; valor: number | null }) {
  const ok = dentroDaMeta(real, meta);
  return (
    <View style={st.mini}>
      <Text style={st.rotulo}>{rotulo.toUpperCase()}</Text>
      <Text style={[st.miniValor, { color: ok == null ? NAVY : ok ? VERDE : VERMELHO }]}>{pct(real)}</Text>
      <Text style={st.sub}>
        meta {pct(meta)} · {brl(valor)}
      </Text>
    </View>
  );
}

function Lista({ titulo, itens, cor }: { titulo: string; itens?: { produto: string; valor: number }[]; cor: string }) {
  if (!itens?.length) return null;
  return (
    <View>
      <Text style={st.rotulo}>{titulo.toUpperCase()}</Text>
      {itens.slice(0, 3).map((p, i) => (
        <View key={i} style={st.itemLinha}>
          <Text style={st.itemNome} numberOfLines={1}>
            {p.produto}
          </Text>
          <Text style={[st.itemValor, { color: cor }]}>{brl(p.valor)}</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F3F5F9' },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 14, shadowColor: NAVY, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  linhaTopo: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  setor: { fontSize: 18, fontWeight: '800', color: NAVY },
  titulo: { fontSize: 15, fontWeight: '700', color: NAVY },
  sub: { fontSize: 12, color: '#5B6577', marginTop: 2 },
  texto: { fontSize: 13.5, color: NAVY },
  rotulo: { fontSize: 10.5, fontWeight: '800', color: '#5B6577', letterSpacing: 0.4 },
  grande: { fontSize: 30, fontWeight: '800', lineHeight: 34 },
  mini: { flex: 1, backgroundColor: '#F3F5F9', borderRadius: 12, padding: 10 },
  miniValor: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  alerta: { backgroundColor: '#FDECEA', borderRadius: 12, padding: 10 },
  alertaTexto: { color: '#B42318', fontSize: 12.5 },
  itemLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 3 },
  itemNome: { flex: 1, fontSize: 12.5, color: NAVY },
  itemValor: { fontSize: 12.5, fontWeight: '800' },
  botao: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, paddingVertical: 11 },
  botaoClaro: { backgroundColor: '#E3E7F5' },
  botaoTxt: { color: colors.white, fontWeight: '800', fontSize: 13.5 },
  secao: { fontSize: 12.5, fontWeight: '800', color: '#5B6577', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6, marginLeft: 4 },
  histLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  histBorda: { borderTopWidth: 1, borderTopColor: '#E4E8EF' },
  histSetor: { fontSize: 14, fontWeight: '700', color: NAVY },
  histPct: { fontSize: 15, fontWeight: '800' },
  erro: { color: '#B5520E', fontSize: 13, backgroundColor: '#FFF1E0', padding: 12, borderRadius: 12 },
});
