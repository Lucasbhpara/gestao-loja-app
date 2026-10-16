import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import CabecalhoTela from '../components/CabecalhoTela';
import VendaDiaScreen from './VendaDiaScreen';
import {
  PERIODOS,
  NIVEIS,
  TipoPeriodo,
  DadosVendasLoja,
  VendaGrupo,
  carregarVendasLoja,
  faltaFuncaoNoBanco,
  paraData,
  diaMes,
} from '../data/vendasLojaApi';

// Vendas da Loja: venda por dia, por setor e pelo sortimento inteiro
// (setor → grupo → categoria → subcategoria → produto), sempre comparando
// com o período anterior. Mesmos números da aba do Portal Admin.

const AZUL = '#2F7BFF';
const AZUL_CLARO = '#7FAEFF';
const CINZA_ANT = '#DCE3EC';
const VERDE = '#1E8E5A';
const VERDE_FUNDO = '#E3F5EC';
const VERMELHO = '#D23C33';
const VERMELHO_FUNDO = '#FDE8E6';
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function reais(n: number): string {
  return `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
}
function reaisCurto(n: number): string {
  if (Math.abs(n) >= 1e6) return `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`;
  if (Math.abs(n) >= 1e3) return `R$ ${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return reais(n);
}
function variacao(atual: number, anterior: number): number | null {
  return anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
}
function nomeBonito(s: string): string {
  return s
    .toLowerCase()
    .split(/([ /.])/)
    .map((p) => (p === ' ' || p === '/' || p === '.' ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
}

function Selo({ pct }: { pct: number | null }) {
  if (pct === null || !isFinite(pct)) {
    return (
      <View style={[styles.selo, { backgroundColor: colors.gray50 }]}>
        <Text style={[styles.seloTexto, { color: colors.gray600 }]}>novo</Text>
      </View>
    );
  }
  const sobe = pct >= 0.05;
  const desce = pct <= -0.05;
  return (
    <View style={[styles.selo, { backgroundColor: sobe ? VERDE_FUNDO : desce ? VERMELHO_FUNDO : colors.gray50 }]}>
      <Text style={[styles.seloTexto, { color: sobe ? VERDE : desce ? VERMELHO : colors.gray600 }]}>
        {sobe ? '▲ ' : desce ? '▼ ' : ''}
        {(pct > 0 ? '+' : '') + pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
      </Text>
    </View>
  );
}

export default function VendasLojaScreen({ onVoltar }: { onVoltar: () => void }) {
  const [tipo, setTipo] = useState<TipoPeriodo>('mes');
  const [caminho, setCaminho] = useState<string[]>([]);
  const [dados, setDados] = useState<DadosVendasLoja | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [diaTocado, setDiaTocado] = useState<number | null>(null);
  const [ranking, setRanking] = useState<'top' | 'altas' | 'quedas'>('top');
  const [verDia, setVerDia] = useState(false);

  const carregar = useCallback(
    async (forcar = false) => {
      setErro(null);
      try {
        const d = await carregarVendasLoja(tipo, caminho, forcar);
        if (!d) setErro('Ainda não há vendas no banco. Suba as vendas pelo “Importar vendas (Falcon)” no portal.');
        setDados(d);
        setDiaTocado(null);
      } catch (e) {
        setErro(
          faltaFuncaoNoBanco(e)
            ? 'Falta criar as consultas de vendas no banco (arquivo supabase/vendas_loja.sql).'
            : 'Não consegui carregar as vendas. Puxe a tela para baixo para tentar de novo.'
        );
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    [tipo, caminho]
  );

  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [carregar]);

  const resumo = useMemo(() => {
    if (!dados) return null;
    const total = dados.dias.reduce((a, x) => a + x.venda, 0);
    const totalA = dados.diasA.reduce((a, x) => a + x.venda, 0);
    const soma = dados.grupos.reduce((a, g) => a + g.venda, 0);
    const somaA = dados.grupos.reduce((a, g) => a + g.vendaAnt, 0);
    const comMargem = dados.grupos.filter((g) => g.margem !== null && g.venda > 0);
    const vendaM = comMargem.reduce((a, g) => a + g.venda, 0);
    const margem = vendaM ? comMargem.reduce((a, g) => a + g.venda * (g.margem as number), 0) / vendaM : null;
    const melhor = dados.dias.reduce<(typeof dados.dias)[number] | null>((m, x) => (!m || x.venda > m.venda ? x : m), null);
    const max = Math.max(1, ...dados.dias.map((x) => x.venda), ...dados.diasA.map((x) => x.venda));
    return { total, totalA, soma, somaA, margem, melhor, max };
  }, [dados]);

  const rankings = useMemo(() => {
    if (!dados) return { top: [], altas: [], quedas: [] } as Record<string, (VendaGrupo & { dif: number })[]>;
    const prods = dados.produtos.map((p) => ({ ...p, dif: p.venda - p.vendaAnt }));
    const comAnt = prods.filter((p) => p.vendaAnt > 0);
    return {
      top: [...prods].sort((a, b) => b.venda - a.venda).slice(0, 10),
      altas: comAnt.filter((p) => p.dif > 0).sort((a, b) => b.dif - a.dif).slice(0, 10),
      quedas: comAnt.filter((p) => p.dif < 0).sort((a, b) => a.dif - b.dif).slice(0, 10),
    };
  }, [dados]);

  const noCaminho = caminho.length > 0;
  const nivelNome = dados ? NIVEIS[dados.nivel - 2] : 'Setor';

  if (verDia) return <VendaDiaScreen onVoltar={() => setVerDia(false)} />;

  return (
    <View style={styles.flex}>
      <CabecalhoTela
        titulo="Vendas da Loja"
        subtitulo={dados ? `Vendas até ${diaMes(dados.ultimoDia)} · atualiza a cada importação` : 'Venda por dia, setor e sortimento'}
        icone="bar-chart-2"
        onVoltar={onVoltar}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(true); }} />}
      >
        <TouchableOpacity style={styles.botaoDia} onPress={() => setVerDia(true)} activeOpacity={0.85}>
          <Feather name="calendar" size={18} color={colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.botaoDiaTitulo}>Venda do dia</Text>
            <Text style={styles.botaoDiaSub}>Total, setores, top 10 e PDF de um dia</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.white} />
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
          {PERIODOS.map((p) => (
            <TouchableOpacity key={p.tipo} style={[styles.chip, tipo === p.tipo && styles.chipAtivo]} onPress={() => setTipo(p.tipo)}>
              <Text style={[styles.chipTexto, tipo === p.tipo && styles.chipTextoAtivo]}>{p.rotulo}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {carregando && !dados ? (
          <View style={styles.centro}>
            <ActivityIndicator color={AZUL} />
            <Text style={styles.cinza}>Carregando as vendas…</Text>
          </View>
        ) : erro && !dados ? (
          <View style={styles.vazio}>
            <Feather name="alert-circle" size={22} color={colors.gray600} />
            <Text style={styles.vazioTexto}>{erro}</Text>
          </View>
        ) : dados && resumo ? (
          <View style={{ opacity: carregando ? 0.5 : 1 }}>
            {/* Resumo */}
            <View style={styles.grade}>
              <View style={styles.kpi}>
                <Text style={styles.kpiRotulo} numberOfLines={1}>
                  {noCaminho ? nomeBonito(caminho[caminho.length - 1]) : 'Venda da loja'}
                </Text>
                <Text style={styles.kpiValor}>{reaisCurto(noCaminho ? resumo.soma : resumo.total)}</Text>
                <View style={styles.kpiLinha}>
                  <Selo pct={variacao(noCaminho ? resumo.soma : resumo.total, noCaminho ? resumo.somaA : resumo.totalA)} />
                </View>
                <Text style={styles.kpiLegenda}>{dados.periodo.rotulo} vs {dados.periodo.rotuloA}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiRotulo}>Média por dia</Text>
                <Text style={styles.kpiValor}>{reaisCurto(resumo.total / (dados.dias.length || 1))}</Text>
                <Text style={styles.kpiLegenda}>{dados.dias.length} dias com venda</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiRotulo}>Margem estimada</Text>
                <Text style={[styles.kpiValor, resumo.margem !== null && { color: resumo.margem >= 20 ? VERDE : resumo.margem < 10 ? VERMELHO : colors.gray900 }]}>
                  {resumo.margem === null ? '—' : `${resumo.margem.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                </Text>
                <Text style={styles.kpiLegenda}>preço e custo médio do estoque</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiRotulo}>Melhor dia</Text>
                <Text style={styles.kpiValor}>{resumo.melhor ? reaisCurto(resumo.melhor.venda) : '—'}</Text>
                <Text style={styles.kpiLegenda}>
                  {resumo.melhor ? `${SEMANA[paraData(resumo.melhor.dia).getUTCDay()]}, ${diaMes(resumo.melhor.dia)}` : ''}
                </Text>
              </View>
            </View>

            {/* Gráfico por dia */}
            <View style={styles.card}>
              <Text style={styles.cardTitulo}>Venda por dia</Text>
              <View style={styles.legenda}>
                <View style={styles.legendaItem}>
                  <View style={[styles.quad, { backgroundColor: AZUL }]} />
                  <Text style={styles.legendaTexto}>{dados.periodo.rotulo}</Text>
                </View>
                <View style={styles.legendaItem}>
                  <View style={[styles.quad, { backgroundColor: CINZA_ANT }]} />
                  <Text style={styles.legendaTexto}>{dados.periodo.rotuloA}</Text>
                </View>
              </View>
              <Text style={styles.diaInfo}>
                {diaTocado !== null && dados.dias[diaTocado]
                  ? `${SEMANA[paraData(dados.dias[diaTocado].dia).getUTCDay()]} ${diaMes(dados.dias[diaTocado].dia)}: ${reais(dados.dias[diaTocado].venda)}` +
                    (dados.diasA[diaTocado] ? `  ·  anterior ${reais(dados.diasA[diaTocado].venda)}` : '')
                  : 'Toque numa barra para ver o valor do dia'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={[styles.grafico, { minWidth: dados.dias.length * 22 }]}>
                  {dados.dias.map((d, i) => {
                    const a = dados.diasA[i];
                    const dow = paraData(d.dia).getUTCDay();
                    return (
                      <TouchableOpacity key={d.dia} style={styles.coluna} onPress={() => setDiaTocado(i)} activeOpacity={0.7}>
                        <View style={styles.barras}>
                          <View style={[styles.barraAnt, { height: `${a ? (a.venda / resumo.max) * 100 : 0}%` }]} />
                          <View
                            style={[
                              styles.barra,
                              { height: `${(d.venda / resumo.max) * 100}%`, backgroundColor: diaTocado === i ? colors.navy900 : dow === 0 ? AZUL_CLARO : AZUL },
                            ]}
                          />
                        </View>
                        <Text style={styles.rotuloDia}>{paraData(d.dia).getUTCDate()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {/* Sortimento */}
            <View style={styles.card}>
              <Text style={styles.cardTitulo}>Venda por {nivelNome.toLowerCase()}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingVertical: spacing.sm }}>
                <TouchableOpacity style={[styles.migalha, !noCaminho && styles.migalhaAtual]} onPress={() => setCaminho([])} disabled={!noCaminho}>
                  <Text style={[styles.migalhaTexto, !noCaminho && styles.migalhaTextoAtual]}>Loja inteira</Text>
                </TouchableOpacity>
                {caminho.map((c, i) => {
                  const atual = i === caminho.length - 1;
                  return (
                    <React.Fragment key={c + i}>
                      <Feather name="chevron-right" size={14} color={colors.gray400} />
                      <TouchableOpacity style={[styles.migalha, atual && styles.migalhaAtual]} onPress={() => setCaminho(caminho.slice(0, i + 1))} disabled={atual}>
                        <Text style={[styles.migalhaTexto, atual && styles.migalhaTextoAtual]} numberOfLines={1}>
                          {nomeBonito(c)}
                        </Text>
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </ScrollView>
              {dados.grupos.length === 0 ? (
                <Text style={styles.cinza}>Sem vendas neste período.</Text>
              ) : (
                dados.grupos.map((g) => {
                  const part = resumo.soma > 0 ? (g.venda / resumo.soma) * 100 : 0;
                  const abre = dados.nivel < 6;
                  return (
                    <TouchableOpacity
                      key={g.chave}
                      style={styles.linha}
                      disabled={!abre}
                      onPress={() => setCaminho([...caminho, g.chave])}
                      activeOpacity={0.7}
                    >
                      <View style={styles.linhaTopo}>
                        <Text style={styles.linhaNome} numberOfLines={2}>
                          {nomeBonito(g.nome)}
                        </Text>
                        {abre ? <Feather name="chevron-right" size={18} color={colors.gray400} /> : null}
                      </View>
                      <View style={styles.linhaMeio}>
                        <Text style={styles.linhaValor}>{reais(g.venda)}</Text>
                        <Selo pct={variacao(g.venda, g.vendaAnt)} />
                      </View>
                      <View style={styles.trilha}>
                        <View style={[styles.trilhaCheia, { width: `${Math.min(100, part)}%` }]} />
                      </View>
                      <View style={styles.linhaBase}>
                        <Text style={styles.linhaInfo}>{part.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do total</Text>
                        <Text style={styles.linhaInfo}>
                          Margem {g.margem === null ? '—' : `${g.margem.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                          {abre ? `  ·  ${g.itens.toLocaleString('pt-BR')} itens` : `  ·  cód. ${g.chave}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              {dados.nivel < 6 && dados.grupos.length > 0 ? (
                <Text style={styles.dica}>Toque num item para abrir os {NIVEIS[dados.nivel - 1].toLowerCase()}s dentro dele.</Text>
              ) : null}
            </View>

            {/* Rankings */}
            <View style={styles.card}>
              <View style={styles.abas}>
                {([['top', 'Mais vendidos'], ['altas', 'Altas'], ['quedas', 'Quedas']] as const).map(([k, t]) => (
                  <TouchableOpacity key={k} style={[styles.aba, ranking === k && styles.abaAtiva]} onPress={() => setRanking(k)}>
                    <Text style={[styles.abaTexto, ranking === k && styles.abaTextoAtiva]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {rankings[ranking].length === 0 ? (
                <Text style={styles.cinza}>Sem dados para comparar.</Text>
              ) : (
                rankings[ranking].map((p, i) => (
                  <View key={p.chave} style={styles.rank}>
                    <Text style={styles.rankN}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rankNome}>{nomeBonito(p.nome)}</Text>
                      {ranking === 'top' ? (
                        <View style={styles.rankLinha}>
                          <Text style={styles.rankValor}>{reais(p.venda)}</Text>
                          <Selo pct={variacao(p.venda, p.vendaAnt)} />
                        </View>
                      ) : (
                        <Text style={styles.rankValor}>
                          {p.dif >= 0 ? '+' : '−'}
                          {reais(Math.abs(p.dif))}
                          <Text style={styles.rankSub}>{`   ${reais(p.vendaAnt)} → ${reais(p.venda)}`}</Text>
                        </Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>

            <Text style={styles.nota}>
              Margem estimada com o preço de venda e o custo médio atuais do estoque. Produtos sem setor aparecem como “Sem Classificacao”.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  centro: { alignItems: 'center', paddingVertical: 40, gap: spacing.sm },
  cinza: { color: colors.gray600, fontSize: 13 },
  vazio: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.gray100 },
  vazioTexto: { color: colors.gray600, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  chip: { paddingHorizontal: 14, minHeight: 38, justifyContent: 'center', borderRadius: radius.full, borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white },
  chipAtivo: { backgroundColor: colors.navy900, borderColor: colors.navy900 },
  chipTexto: { fontSize: 13, fontWeight: '700', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  kpi: { flexBasis: '48%', flexGrow: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.gray100 },
  kpiRotulo: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.gray400 },
  kpiValor: { fontSize: 22, fontWeight: '800', color: colors.gray900, marginTop: 6 },
  kpiLinha: { flexDirection: 'row', marginTop: 6 },
  kpiLegenda: { fontSize: 11, color: colors.gray600, marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.gray100 },
  cardTitulo: { fontSize: 16, fontWeight: '800', color: colors.gray900 },
  legenda: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  legendaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendaTexto: { fontSize: 11.5, color: colors.gray600, fontWeight: '600' },
  quad: { width: 11, height: 11, borderRadius: 3 },
  diaInfo: { fontSize: 12.5, color: colors.gray900, fontWeight: '700', marginTop: spacing.sm, marginBottom: spacing.sm },
  grafico: { flexDirection: 'row', alignItems: 'flex-end', height: 170, gap: 4, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  coluna: { flex: 1, minWidth: 18, height: '100%', justifyContent: 'flex-end' },
  barras: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  barraAnt: { position: 'absolute', bottom: 0, width: '84%', backgroundColor: CINZA_ANT, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barra: { width: '54%', minHeight: 2, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  rotuloDia: { fontSize: 10, color: colors.gray400, textAlign: 'center', paddingTop: 4, fontWeight: '700' },
  migalha: { paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', borderRadius: radius.full, borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.gray50, maxWidth: 220 },
  migalhaAtual: { backgroundColor: colors.navy900, borderColor: colors.navy900 },
  migalhaTexto: { fontSize: 12.5, fontWeight: '700', color: AZUL },
  migalhaTextoAtual: { color: colors.white },
  linha: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray100 },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  linhaNome: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.gray900 },
  linhaMeio: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  linhaValor: { fontSize: 16, fontWeight: '800', color: colors.gray900 },
  trilha: { height: 7, backgroundColor: colors.gray50, borderRadius: 999, overflow: 'hidden', marginTop: 8 },
  trilhaCheia: { height: '100%', backgroundColor: AZUL, borderRadius: 999 },
  linhaBase: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: spacing.sm },
  linhaInfo: { fontSize: 11.5, color: colors.gray600 },
  dica: { fontSize: 12, color: colors.gray400, marginTop: spacing.sm },
  selo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  seloTexto: { fontSize: 11.5, fontWeight: '800' },
  abas: { flexDirection: 'row', backgroundColor: colors.gray50, borderRadius: radius.md, padding: 4, marginBottom: spacing.sm },
  aba: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  abaAtiva: { backgroundColor: colors.white },
  abaTexto: { fontSize: 13, fontWeight: '700', color: colors.gray600 },
  abaTextoAtiva: { color: colors.gray900 },
  rank: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray100 },
  rankN: { width: 18, fontSize: 12, fontWeight: '800', color: colors.gray400, paddingTop: 1 },
  rankNome: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  rankLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  rankValor: { fontSize: 13, fontWeight: '800', color: colors.gray900, marginTop: 4 },
  rankSub: { fontSize: 11.5, fontWeight: '600', color: colors.gray400 },
  nota: { fontSize: 11.5, color: colors.gray400, marginTop: spacing.sm, lineHeight: 16 },
  botaoDia: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#2F7BFF', borderRadius: 16, padding: 14, marginBottom: spacing.md },
  botaoDiaTitulo: { color: colors.white, fontWeight: '800', fontSize: 15 },
  botaoDiaSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
});
