import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import CabecalhoTela from '../components/CabecalhoTela';
import SeletorDataValidade from '../components/SeletorDataValidade';
import { compartilharPdf } from '../lib/compartilharPdf';
import {
  carregarVendaDia,
  DadosVendaDia,
  ProdutoDia,
  somarDiasIso,
  nomeDia,
  diaMesCurto,
  reais,
  qtdTexto,
  variacao,
  htmlVendaDia,
} from '../data/vendaDiaApi';
import { carregarResumoMeta, ResumoMeta, pctTexto } from '../data/metaVendaApi';

// Venda do dia: escolhe um dia e vê a venda total, por setor e o top 10 em
// valor e em volume. Exporta o PDF pela tela de compartilhar do celular.
const CORES = ['#2F7BFF', '#1FA56A', '#8B6CFF', '#F2A600', '#E14337', '#14A3B5', '#E8710A', '#5B6577'];
const VERDE = '#1E8E5A';
const VERMELHO = '#C0392B';

// Barra de progresso da meta (verde quando bate, laranja quando falta).
function BarraMeta({ pct }: { pct: number }) {
  const bateu = pct >= 100;
  return (
    <View style={styles.trilhoMeta}>
      <View style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', borderRadius: 6, backgroundColor: bateu ? VERDE : '#E8710A' }} />
    </View>
  );
}

function CardMeta({ m }: { m: ResumoMeta }) {
  const bateuDia = m.pctDia != null && m.pctDia >= 100;
  const bateuMes = m.faltaMes <= 0;
  return (
    <View style={styles.card}>
      {m.metaDia != null && m.pctDia != null && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.rotulo}>META DO DIA</Text>
            <Text style={[styles.selo, { backgroundColor: bateuDia ? '#DFF3E8' : '#FBEBD4', color: bateuDia ? VERDE : '#B4650E' }]}>
              {bateuDia ? '✓ Meta batida' : 'Abaixo da meta'}
            </Text>
          </View>
          <Text style={styles.kpi}>{pctTexto(m.pctDia)}</Text>
          <BarraMeta pct={m.pctDia} />
          <Text style={[styles.legenda, { marginTop: 6 }]}>
            Venda {reais(m.vendaDia, 0)} de {reais(m.metaDia, 0)} ·{' '}
            {bateuDia ? (
              <Text style={{ color: VERDE, fontWeight: '800' }}>passou {reais(m.vendaDia - m.metaDia, 0)}</Text>
            ) : (
              <Text style={{ color: VERMELHO, fontWeight: '800' }}>
                faltou {reais(m.metaDia - m.vendaDia, 0)} ({pctTexto(100 - m.pctDia)})
              </Text>
            )}
          </Text>
          {m.temMes && <View style={styles.divisor} />}
        </>
      )}
      {m.temMes && (
      <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.rotulo}>META DO MÊS</Text>
        <Text style={[styles.selo, { backgroundColor: bateuMes ? '#DFF3E8' : colors.gray100, color: bateuMes ? VERDE : colors.gray600 }]}>
          {bateuMes ? '✓ Meta do mês batida' : `faltam ${pctTexto(100 - m.pctMes)}`}
        </Text>
      </View>
      <Text style={styles.kpi}>{pctTexto(m.pctMes)}</Text>
      <BarraMeta pct={m.pctMes} />
      <Text style={[styles.legenda, { marginTop: 6 }]}>
        Vendido {reais(m.vendaMes, 0)} de {reais(m.metaMes, 0)}
      </Text>
      {!bateuMes && (
        <Text style={[styles.legenda, { marginTop: 2 }]}>
          Falta <Text style={{ fontWeight: '800', color: '#0E1B2C' }}>{reais(m.faltaMes, 0)}</Text>
          {m.precisaPorDia != null ? (
            <>
              {' '}· precisa de <Text style={{ fontWeight: '800', color: '#0E1B2C' }}>{reais(m.precisaPorDia, 0)}</Text> por dia nos próximos {m.diasRestantes} dias
            </>
          ) : null}
        </Text>
      )}
      <Text style={[styles.legenda, { marginTop: 2 }]}>
        Até {diaMesCurto(m.dia)}: {pctTexto(m.pctAteDia)} da meta acumulada ({reais(m.metaAteDia, 0)})
      </Text>
      </>
      )}
    </View>
  );
}

function Selo({ pct }: { pct: number | null }) {
  if (pct == null) return <Text style={[styles.selo, { backgroundColor: colors.gray100, color: colors.gray600 }]}>novo</Text>;
  const sobe = pct >= 0.05, desce = pct <= -0.05;
  return (
    <Text style={[styles.selo, { backgroundColor: sobe ? '#DFF3E8' : desce ? '#FBDEDC' : colors.gray100, color: sobe ? VERDE : desce ? VERMELHO : colors.gray600 }]}>
      {sobe ? '▲ ' : desce ? '▼ ' : ''}
      {(pct > 0 ? '+' : '') + pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
    </Text>
  );
}

export default function VendaDiaScreen({ onVoltar }: { onVoltar: () => void }) {
  const [dia, setDia] = useState<string | null>(null);
  const [dados, setDados] = useState<DadosVendaDia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<'valor' | 'volume'>('valor');
  const [gerando, setGerando] = useState(false);
  const [meta, setMeta] = useState<ResumoMeta | null>(null);

  const carregar = useCallback(
    (forcar = false) => {
      setErro(null);
      carregarVendaDia(dia, forcar)
        .then((d) => {
          if (!d) setErro('Ainda não há vendas no banco. Suba as vendas pelo “Importar vendas (Falcon)” no portal.');
          setDados(d);
          if (d && d.dia !== dia) setDia(d.dia);
          setMeta(null);
          if (d)
            carregarResumoMeta(d.dia, d.total, forcar)
              .then(setMeta)
              .catch(() => setMeta(null));
        })
        .catch(() => setErro('Não consegui carregar as vendas. Puxe a tela para baixo para tentar de novo.'))
        .finally(() => {
          setCarregando(false);
          setAtualizando(false);
        });
    },
    [dia]
  );
  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [carregar]);

  function passo(n: number) {
    if (!dados) return;
    const novo = somarDiasIso(dados.dia, n);
    if (novo > dados.ultimo || novo < dados.primeiro) return;
    setDia(novo);
  }

  async function exportar() {
    if (!dados) return;
    setGerando(true);
    try {
      await compartilharPdf(htmlVendaDia(dados, meta), `venda-do-dia-${dados.dia.split('-').reverse().join('-')}`);
    } catch (e: any) {
      Alert.alert('Não deu certo', e?.message ?? 'Não consegui gerar o PDF.');
    } finally {
      setGerando(false);
    }
  }

  const lista: ProdutoDia[] = dados ? (aba === 'valor' ? dados.topValor : dados.topVolume) : [];
  const maxSetor = dados && dados.setores.length ? dados.setores[0].venda : 1;

  return (
    <View style={styles.flex}>
      <CabecalhoTela
        titulo="Venda do dia"
        subtitulo={dados ? nomeDia(dados.dia) : 'Total, setores e os produtos que mais venderam'}
        icone="calendar"
        onVoltar={onVoltar}
        acao={
          dados ? (
            <TouchableOpacity onPress={exportar} disabled={gerando} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {gerando ? <ActivityIndicator size="small" color={colors.navy700} /> : <Feather name="download" size={15} color={colors.navy700} />}
              <Text style={{ color: colors.navy700, fontWeight: '700', fontSize: 13 }}>PDF</Text>
            </TouchableOpacity>
          ) : null
        }
      >
        {dados && (
          <View style={styles.diaNav}>
            <TouchableOpacity onPress={() => passo(-1)} disabled={dados.dia <= dados.primeiro} style={[styles.seta, dados.dia <= dados.primeiro && { opacity: 0.3 }]}>
              <Feather name="chevron-left" size={20} color={colors.white} />
            </TouchableOpacity>
            <View style={styles.diaCaixa}>
              <SeletorDataValidade valor={dados.dia} onSelecionar={(v) => setDia(v)} />
            </View>
            <TouchableOpacity onPress={() => passo(1)} disabled={dados.dia >= dados.ultimo} style={[styles.seta, dados.dia >= dados.ultimo && { opacity: 0.3 }]}>
              <Feather name="chevron-right" size={20} color={colors.white} />
            </TouchableOpacity>
          </View>
        )}
      </CabecalhoTela>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: 12 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(true); }} />}
      >
        {carregando && !dados ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: 40 }} />
        ) : erro && !dados ? (
          <Text style={styles.vazio}>{erro}</Text>
        ) : dados ? (
          <View style={{ gap: 12, opacity: carregando ? 0.5 : 1 }}>
            <View style={styles.card}>
              <Text style={styles.rotulo}>VENDA TOTAL DO DIA</Text>
              <Text style={styles.total}>{reais(dados.total)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <Selo pct={variacao(dados.total, dados.totalAnt)} />
                <Text style={styles.legenda}>
                  vs {diaMesCurto(dados.ant)} ({reais(dados.totalAnt, 0)})
                </Text>
              </View>
            </View>
            {meta && meta.dia === dados.dia && <CardMeta m={meta} />}
            <View style={styles.card}>
              <Text style={styles.rotulo}>
                ACUMULADO DO MÊS ({diaMesCurto(dados.acum.ini)} A {diaMesCurto(dados.acum.fim)})
              </Text>
              <Text style={styles.kpi}>{reais(dados.acum.total)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <Selo pct={variacao(dados.acum.total, dados.acum.totalAnt)} />
                <Text style={styles.legenda}>
                  vs {diaMesCurto(dados.acum.antIni)} a {diaMesCurto(dados.acum.antFim)} ({reais(dados.acum.totalAnt, 0)})
                </Text>
              </View>
              <Text style={[styles.legenda, { marginTop: 4 }]}>
                Média de {reais(dados.acum.total / (dados.acum.dias || 1), 0)} por dia · {dados.acum.dias} dias com venda
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={[styles.card, { flex: 1 }]}>
                <Text style={styles.rotulo}>PRODUTOS VENDIDOS</Text>
                <Text style={styles.kpi}>{dados.itens.toLocaleString('pt-BR')}</Text>
              </View>
              <View style={[styles.card, { flex: 1.3 }]}>
                <Text style={styles.rotulo}>SETOR QUE MAIS VENDEU</Text>
                <Text style={[styles.kpi, { fontSize: 17 }]} numberOfLines={1}>{dados.setores[0]?.nome ?? '—'}</Text>
                {!!dados.setores[0] && <Text style={styles.legenda}>{reais(dados.setores[0].venda, 0)}</Text>}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.titulo}>Venda por setor</Text>
              <Text style={[styles.legenda, { marginBottom: 6 }]}>variação vs mesmo dia da semana passada</Text>
              {dados.setores.map((s, i) => (
                <View key={s.nome} style={styles.setorLinha}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.setorNome} numberOfLines={1}>{s.nome}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.setorValor}>{reais(s.venda, 0)}</Text>
                      <Selo pct={variacao(s.venda, s.vendaAnt)} />
                    </View>
                  </View>
                  <View style={styles.trilho}>
                    <View style={{ width: `${(s.venda / maxSetor) * 100}%`, height: '100%', backgroundColor: CORES[i % CORES.length], borderRadius: 5 }} />
                  </View>
                  <Text style={styles.pct}>{((s.venda / (dados.total || 1)) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do dia</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.abas}>
                {(['valor', 'volume'] as const).map((k) => (
                  <TouchableOpacity key={k} style={[styles.aba, aba === k && styles.abaOn]} onPress={() => setAba(k)}>
                    <Text style={[styles.abaTxt, aba === k && styles.abaTxtOn]}>Top 10 em {k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {lista.map((p, i) => (
                <View key={p.codigo} style={styles.prod}>
                  <Text style={styles.pos}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prodNome}>{p.nome}</Text>
                    <Text style={styles.prodSub}>{p.setor}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.prodValor}>{aba === 'valor' ? reais(p.venda) : qtdTexto(p)}</Text>
                    <Text style={styles.prodSub}>{aba === 'valor' ? qtdTexto(p) : reais(p.venda)}</Text>
                  </View>
                </View>
              ))}
              {lista.length === 0 && <Text style={styles.vazio}>Sem vendas nesse dia.</Text>}
              <Text style={[styles.legenda, { marginTop: 8 }]}>
                Volume aproximado: a planilha do Falcon traz só o valor vendido, então as unidades (ou kg) são o valor dividido pelo preço de venda atual.
              </Text>
            </View>

            <TouchableOpacity style={styles.botao} onPress={exportar} disabled={gerando}>
              {gerando ? <ActivityIndicator color={colors.white} /> : <Feather name="download" size={18} color={colors.white} />}
              <Text style={styles.botaoTxt}>Exportar PDF do dia</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F3F5F9' },
  diaNav: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md },
  seta: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  diaCaixa: { flex: 1, backgroundColor: colors.white, borderRadius: 12, overflow: 'hidden' },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 14, elevation: 1, shadowColor: '#0E1B2C', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  rotulo: { fontSize: 11, fontWeight: '800', color: colors.gray600, letterSpacing: 0.5 },
  total: { fontSize: 30, fontWeight: '800', color: '#0E1B2C', marginTop: 4 },
  kpi: { fontSize: 22, fontWeight: '800', color: '#0E1B2C', marginTop: 4 },
  legenda: { fontSize: 11.5, color: colors.gray600 },
  selo: { fontSize: 11, fontWeight: '800', paddingVertical: 3, paddingHorizontal: 7, borderRadius: radius.full, overflow: 'hidden' },
  titulo: { fontSize: 16, fontWeight: '800', color: '#0E1B2C' },
  setorLinha: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.gray100 },
  setorNome: { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#0E1B2C' },
  setorValor: { fontSize: 13.5, fontWeight: '800', color: '#0E1B2C' },
  trilhoMeta: { height: 10, borderRadius: 6, backgroundColor: '#EEF1F6', marginTop: 8, overflow: 'hidden' },
  divisor: { height: 1, backgroundColor: colors.gray100, marginVertical: 12 },
  trilho: { height: 8, borderRadius: 5, backgroundColor: '#EEF1F6', marginTop: 6, overflow: 'hidden' },
  pct: { fontSize: 11, color: colors.gray600, marginTop: 3 },
  abas: { flexDirection: 'row', backgroundColor: '#EEF1F6', borderRadius: 12, padding: 3, marginBottom: 6 },
  aba: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  abaOn: { backgroundColor: colors.white },
  abaTxt: { fontSize: 13, fontWeight: '700', color: colors.gray600 },
  abaTxtOn: { color: '#0E1B2C' },
  prod: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.gray100 },
  pos: { width: 22, fontSize: 14, fontWeight: '800', color: colors.gray400, textAlign: 'center' },
  prodNome: { fontSize: 12.5, fontWeight: '700', color: '#0E1B2C' },
  prodSub: { fontSize: 11, color: colors.gray600, marginTop: 2 },
  prodValor: { fontSize: 13.5, fontWeight: '800', color: '#0E1B2C' },
  vazio: { textAlign: 'center', color: colors.gray600, marginTop: 20 },
  botao: { backgroundColor: '#2F7BFF', borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  botaoTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
