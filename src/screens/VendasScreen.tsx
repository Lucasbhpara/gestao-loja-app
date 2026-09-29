import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  TextInput,
  Keyboard,
} from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import {
  VendaSetor,
  buscarVendasSetorLoja,
  agruparVendasPorMes,
  VendasDoMes,
  ItemVendaABC,
  buscarVendasComABC,
} from '../data/vendasApi';

// Mesma paleta categórica usada nos gráficos do Portal Admin (--cat-1..6).
const CORES_SETOR = ['#2C3F8C', '#6B4FA0', '#1D8A8A', '#4C6EF5', '#9C6ADE', '#3F6B52', '#B4650E', '#9AA1B8'];

function formatarReais(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nomeMes(mesRef: string): string {
  const [ano, mes] = mesRef.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

// A categoria vem em CAIXA ALTA da planilha (ex.: "MERCEARIA SALGADA") —
// deixa mais legível sem mudar o dado.
function formatarSetor(setor: string): string {
  return setor
    .toLowerCase()
    .split(/([ /])/)
    .map((parte) => (parte === ' ' || parte === '/' ? parte : parte.charAt(0).toUpperCase() + parte.slice(1)))
    .join('');
}

function corAtingimento(razao: number | null): { cor: string; fundo: string } {
  if (razao === null) return { cor: colors.gray600, fundo: colors.gray50 };
  if (razao >= 1) return { cor: colors.green500, fundo: '#DFF3E9' };
  if (razao >= 0.9) return { cor: '#B4650E', fundo: '#FBEBD4' };
  return { cor: colors.red500, fundo: '#FBDEDC' };
}

// Cor de fundo/texto do selo de variação percentual (comparativo de dois meses).
function corVariacao(variacao: number): { cor: string; fundo: string } {
  if (variacao > 0) return { cor: colors.green500, fundo: '#DFF3E9' };
  if (variacao < 0) return { cor: colors.red500, fundo: '#FBDEDC' };
  return { cor: colors.gray600, fundo: colors.gray50 };
}

const OPCOES_LIMITE = [50, 100, 200, 'todos'] as const;
type OpcaoLimite = (typeof OPCOES_LIMITE)[number];

export default function VendasScreen({ onVoltar }: { onVoltar: () => void }) {
  const [aba, setAba] = useState<'setor' | 'critico'>('setor');

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Vendas</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.abasWrap}>
        <TouchableOpacity style={[styles.aba, aba === 'setor' && styles.abaAtiva]} onPress={() => setAba('setor')}>
          <Text style={[styles.abaTexto, aba === 'setor' && styles.abaTextoAtivo]}>Por setor</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.aba, aba === 'critico' && styles.abaAtiva]} onPress={() => setAba('critico')}>
          <Text style={[styles.abaTexto, aba === 'critico' && styles.abaTextoAtivo]}>Curva ABC</Text>
        </TouchableOpacity>
      </View>

      {aba === 'setor' ? <VendasPorSetorConteudo /> : <CurvaAbcConteudo />}
    </View>
  );
}

function VendasPorSetorConteudo() {
  const [vendas, setVendas] = useState<VendaSetor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mesSelecionado, setMesSelecionado] = useState<string | null>(null);
  const [mesComparacao, setMesComparacao] = useState<string | null>(null);

  function carregar() {
    buscarVendasSetorLoja()
      .then((lista) => {
        setVendas(lista);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar as vendas.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
  }, []);

  const meses: VendasDoMes[] = useMemo(() => agruparVendasPorMes(vendas, 5), [vendas]);
  // Todos os meses com dado (não só os 5 dos chips) — pra poder comparar
  // meses mais distantes entre si, se um dia houver mais histórico.
  const todosMeses: VendasDoMes[] = useMemo(() => agruparVendasPorMes(vendas, 24), [vendas]);

  useEffect(() => {
    if (meses.length > 0 && (!mesSelecionado || !meses.some((m) => m.mesRef === mesSelecionado))) {
      setMesSelecionado(meses[0].mesRef);
    }
  }, [meses, mesSelecionado]);

  const mesAtual = meses.find((m) => m.mesRef === mesSelecionado) ?? meses[0];
  const maxSetorVenda = Math.max(...(mesAtual?.porSetor.map((s) => s.venda) ?? []), 1);
  const maxMesTotal = Math.max(...meses.map((m) => m.totalVenda), 1);
  const atingimentoMesAtual = mesAtual && mesAtual.totalMeta > 0 ? mesAtual.totalVenda / mesAtual.totalMeta : null;

  // Mês escolhido pra comparar com o mesAtual — por padrão, o mês anterior.
  useEffect(() => {
    if (!mesAtual) return;
    if (mesComparacao && todosMeses.some((m) => m.mesRef === mesComparacao) && mesComparacao !== mesAtual.mesRef) return;
    const outro = todosMeses.find((m) => m.mesRef !== mesAtual.mesRef);
    setMesComparacao(outro ? outro.mesRef : null);
  }, [mesAtual?.mesRef, todosMeses]);

  const mesB = todosMeses.find((m) => m.mesRef === mesComparacao) ?? null;

  const linhasComparativo = useMemo(() => {
    if (!mesAtual || !mesB) return [];
    const categorias = Array.from(
      new Set([...mesAtual.porSetor.map((l) => l.setor), ...mesB.porSetor.map((l) => l.setor)])
    );
    const valorNoMes = (mes: VendasDoMes, setor: string) => mes.porSetor.find((l) => l.setor === setor)?.venda ?? 0;
    return categorias
      .map((setor) => {
        const a = valorNoMes(mesAtual, setor);
        const b = valorNoMes(mesB, setor);
        const variacao = b !== 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0;
        return { setor, a, b, variacao };
      })
      .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  }, [mesAtual, mesB]);

  const maxComparativo = Math.max(...linhasComparativo.map((l) => Math.max(l.a, l.b)), 1);
  const variacaoTotal =
    mesAtual && mesB && mesB.totalVenda !== 0 ? ((mesAtual.totalVenda - mesB.totalVenda) / mesB.totalVenda) * 100 : 0;

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              carregar();
            }}
          />
        }
      >
        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : meses.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Nenhuma venda lançada ainda.</Text>
          </View>
        ) : (
          <>
            <View style={styles.resumoCard}>
              <Text style={styles.resumoLabel}>{mesAtual ? nomeMes(mesAtual.mesRef) : ''}</Text>
              <Text style={styles.resumoValor}>{mesAtual ? formatarReais(mesAtual.totalVenda) : ''}</Text>
              {atingimentoMesAtual !== null && (
                <View style={[styles.chipAtingimento, { backgroundColor: corAtingimento(atingimentoMesAtual).fundo }]}>
                  <Text style={[styles.chipAtingimentoTexto, { color: corAtingimento(atingimentoMesAtual).cor }]}>
                    {(atingimentoMesAtual * 100).toFixed(0)}% da meta
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.chipsWrap}>
              {meses.map((m) => (
                <TouchableOpacity
                  key={m.mesRef}
                  style={[styles.chip, mesSelecionado === m.mesRef && styles.chipAtivo]}
                  onPress={() => setMesSelecionado(m.mesRef)}
                >
                  <Text style={[styles.chipTexto, mesSelecionado === m.mesRef && styles.chipTextoAtivo]}>
                    {nomeMes(m.mesRef)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Vendas por categoria — {mesAtual ? nomeMes(mesAtual.mesRef) : ''}</Text>
            <View style={styles.card}>
              {(mesAtual?.porSetor ?? []).map((s, i) => (
                <View key={s.setor} style={styles.barraLinha}>
                  <Text style={styles.barraLabel} numberOfLines={2}>
                    {formatarSetor(s.setor)}
                  </Text>
                  <View style={styles.trilha}>
                    <View
                      style={[
                        styles.seg,
                        { width: `${(100 * s.venda) / maxSetorVenda}%`, backgroundColor: CORES_SETOR[i % CORES_SETOR.length] },
                      ]}
                    />
                  </View>
                  <Text style={styles.barraValor}>{formatarReais(s.venda)}</Text>
                </View>
              ))}
            </View>

            {meses.length > 1 && (
              <>
                <Text style={styles.sectionTitle}>Comparativo — últimos {meses.length} meses</Text>
                <View style={styles.card}>
                  {[...meses].reverse().map((m) => (
                    <View key={m.mesRef} style={styles.barraLinha}>
                      <Text style={styles.barraLabel} numberOfLines={1}>
                        {nomeMes(m.mesRef)}
                      </Text>
                      <View style={styles.trilha}>
                        <View
                          style={[
                            styles.seg,
                            {
                              width: `${(100 * m.totalVenda) / maxMesTotal}%`,
                              backgroundColor: m.mesRef === mesSelecionado ? colors.navy700 : colors.navy500,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.barraValor}>{formatarReais(m.totalVenda)}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {todosMeses.length > 1 && mesAtual && mesB && (
              <>
                <Text style={styles.sectionTitle}>Comparar dois meses</Text>
                <View style={styles.card}>
                  <View style={styles.compararHeader}>
                    <Text style={styles.compararLegenda}>
                      {nomeMes(mesAtual.mesRef)} (azul) vs {nomeMes(mesB.mesRef)} (laranja)
                    </Text>
                    <View style={[styles.chipVariacao, { backgroundColor: corVariacao(variacaoTotal).fundo }]}>
                      <Text style={[styles.chipVariacaoTexto, { color: corVariacao(variacaoTotal).cor }]}>
                        total {variacaoTotal > 0 ? '+' : ''}
                        {variacaoTotal.toFixed(0)}%
                      </Text>
                    </View>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsWrapCompara}>
                    {todosMeses
                      .filter((m) => m.mesRef !== mesAtual.mesRef)
                      .map((m) => (
                        <TouchableOpacity
                          key={m.mesRef}
                          style={[styles.chip, mesComparacao === m.mesRef && styles.chipAtivo]}
                          onPress={() => setMesComparacao(m.mesRef)}
                        >
                          <Text style={[styles.chipTexto, mesComparacao === m.mesRef && styles.chipTextoAtivo]}>
                            {nomeMes(m.mesRef)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>

                  {linhasComparativo.map((l) => {
                    const cv = corVariacao(l.variacao);
                    return (
                      <View key={l.setor} style={styles.compararItem}>
                        <View style={styles.compararNomeLinha}>
                          <Text style={styles.compararNome} numberOfLines={1}>
                            {formatarSetor(l.setor)}
                          </Text>
                          <View style={[styles.chipVariacao, { backgroundColor: cv.fundo }]}>
                            <Text style={[styles.chipVariacaoTexto, { color: cv.cor }]}>
                              {l.variacao > 0 ? '+' : ''}
                              {l.variacao.toFixed(0)}%
                            </Text>
                          </View>
                        </View>
                        <View style={styles.barraLinha}>
                          <Text style={styles.barraLabel} numberOfLines={1}>
                            {nomeMes(mesAtual.mesRef)}
                          </Text>
                          <View style={styles.trilha}>
                            <View
                              style={[styles.seg, { width: `${(100 * l.a) / maxComparativo}%`, backgroundColor: colors.navy700 }]}
                            />
                          </View>
                          <Text style={styles.barraValor}>{formatarReais(l.a)}</Text>
                        </View>
                        <View style={styles.barraLinha}>
                          <Text style={styles.barraLabel} numberOfLines={1}>
                            {nomeMes(mesB.mesRef)}
                          </Text>
                          <View style={styles.trilha}>
                            <View
                              style={[styles.seg, { width: `${(100 * l.b) / maxComparativo}%`, backgroundColor: '#B4650E' }]}
                            />
                          </View>
                          <Text style={styles.barraValor}>{formatarReais(l.b)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function CurvaAbcConteudo() {
  const [itens, setItens] = useState<ItemVendaABC[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [limiarDias, setLimiarDias] = useState('7');
  const [limite, setLimite] = useState<OpcaoLimite>(50);
  const [somentePositivo, setSomentePositivo] = useState(true);

  function carregar() {
    buscarVendasComABC()
      .then((lista) => {
        setItens(lista);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar a Curva ABC.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
  }, []);

  const limiarNumero = Number(limiarDias.replace(',', '.'));
  const limiarValido = Number.isFinite(limiarNumero) && limiarNumero > 0 ? limiarNumero : 7;

  // Itens de curva A com poucos dias de estoque — mesmo recorte do Portal Admin.
  const criticos = useMemo(() => {
    return itens
      .filter((l) => l.classe === 'A' && l.diasEstoqueRestante != null && l.diasEstoqueRestante < limiarValido)
      .filter((l) => !somentePositivo || (l.estoqueAtual != null && l.estoqueAtual >= 0))
      .sort((a, b) => (a.diasEstoqueRestante ?? 0) - (b.diasEstoqueRestante ?? 0));
  }, [itens, limiarValido, somentePositivo]);

  const exibidos = limite === 'todos' ? criticos : criticos.slice(0, limite);

  const porClasse = useMemo(() => {
    const c = { A: 0, B: 0, C: 0 };
    itens.forEach((l) => {
      if (l.classe === 'A' || l.classe === 'B' || l.classe === 'C') c[l.classe]++;
    });
    return c;
  }, [itens]);

  return (
    <View style={styles.flex}>
      {carregando ? (
        <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
      ) : itens.length === 0 ? (
        <View style={styles.vazio}>
          <Text style={styles.vazioTexto}>{erro ?? 'Ainda não tem planilha de vendas importada.'}</Text>
        </View>
      ) : (
        <>
          <View style={styles.resumoAbcCard}>
            <Text style={styles.resumoLabel}>{itens.length} produto(s) na planilha</Text>
            <View style={styles.resumoAbcLinha}>
              <View style={styles.resumoAbcItem}>
                <Text style={[styles.resumoAbcNumero, { color: '#7FE0A0' }]}>{porClasse.A}</Text>
                <Text style={styles.resumoAbcTag}>Classe A</Text>
              </View>
              <View style={styles.resumoAbcItem}>
                <Text style={[styles.resumoAbcNumero, { color: '#FFC978' }]}>{porClasse.B}</Text>
                <Text style={styles.resumoAbcTag}>Classe B</Text>
              </View>
              <View style={styles.resumoAbcItem}>
                <Text style={[styles.resumoAbcNumero, { color: colors.gray100 }]}>{porClasse.C}</Text>
                <Text style={styles.resumoAbcTag}>Classe C</Text>
              </View>
            </View>
          </View>

          <View style={styles.filtroCard}>
            <Text style={styles.filtroTitulo}>Estoque crítico (curva A)</Text>
            <View style={styles.filtroLinhaLimiar}>
              <Text style={styles.filtroLabel}>Alertar com menos de</Text>
              <TextInput
                style={styles.filtroInput}
                value={limiarDias}
                onChangeText={setLimiarDias}
                onBlur={Keyboard.dismiss}
                keyboardType="numeric"
                returnKeyType="done"
              />
              <Text style={styles.filtroLabel}>dias</Text>
            </View>

            <Text style={[styles.filtroLabel, { marginBottom: 6 }]}>Mostrar</Text>
            <View style={styles.chipsWrap}>
              {OPCOES_LIMITE.map((n) => (
                <TouchableOpacity key={n} style={[styles.chip, limite === n && styles.chipAtivo]} onPress={() => setLimite(n)}>
                  <Text style={[styles.chipTexto, limite === n && styles.chipTextoAtivo]}>{n === 'todos' ? 'Todos' : n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.chip, styles.chipPositivo, somentePositivo && styles.chipAtivo]}
              onPress={() => setSomentePositivo((v) => !v)}
            >
              <Text style={[styles.chipTexto, somentePositivo && styles.chipTextoAtivo]}>
                {somentePositivo ? '✓ ' : ''}Somente estoques positivos
              </Text>
            </TouchableOpacity>
            <Text style={styles.filtroAjuda}>Esconde produto com estoque negativo (erro de contagem/lançamento na planilha).</Text>
          </View>

          {erro && (
            <View style={styles.erroBox}>
              <Text style={styles.erroTexto}>{erro}</Text>
            </View>
          )}

          <Text style={styles.contagemCritico}>
            {exibidos.length < criticos.length
              ? `Mostrando ${exibidos.length} de ${criticos.length} produtos críticos.`
              : criticos.length === 0
                ? `Nenhum produto de curva A abaixo de ${limiarValido} dias de estoque agora. 👍`
                : `${criticos.length} produto(s) de curva A com estoque crítico.`}
          </Text>

          <FlatList
            style={styles.flex}
            data={exibidos}
            keyExtractor={(item, i) => item.produto + i}
            refreshControl={
              <RefreshControl
                refreshing={atualizando}
                onRefresh={() => {
                  setAtualizando(true);
                  carregar();
                }}
              />
            }
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={styles.itemCriticoCard}>
                <Text style={styles.itemCriticoNome} numberOfLines={2}>
                  {item.produto}
                </Text>
                <View style={styles.itemCriticoLinha}>
                  <View>
                    <Text style={styles.itemCriticoRotulo}>Estoque atual</Text>
                    <Text style={styles.itemCriticoValor}>
                      {item.estoqueAtual != null ? item.estoqueAtual.toLocaleString('pt-BR') : '—'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.itemCriticoRotulo}>Venda média</Text>
                    <Text style={styles.itemCriticoValor}>{item.vendaMediaDiaria.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia</Text>
                  </View>
                  <View>
                    <Text style={styles.itemCriticoRotulo}>Dias restantes</Text>
                    <Text style={[styles.itemCriticoValor, { color: colors.red500, fontWeight: '800' }]}>
                      {item.diasEstoqueRestante != null ? Math.round(item.diasEstoqueRestante) : '—'}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          />
        </>
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
  resumoCard: { backgroundColor: colors.navy900, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  resumoLabel: { color: colors.gray100, fontSize: 12, fontWeight: '600' },
  resumoValor: { color: colors.white, fontSize: 26, fontWeight: '700', marginTop: 4 },
  chipAtingimento: { alignSelf: 'flex-start', borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9, marginTop: 8 },
  chipAtingimentoTexto: { fontSize: 11, fontWeight: '700' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.gray900, marginBottom: spacing.sm, marginTop: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  barraLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  barraLabel: { flex: 0, width: 96, fontSize: 10.5, color: colors.gray900 },
  trilha: { flex: 1, height: 16, backgroundColor: colors.gray50, borderRadius: 5, overflow: 'hidden' },
  seg: { height: '100%', borderRadius: 5 },
  barraValor: { flex: 0, width: 88, textAlign: 'right', fontSize: 11, fontWeight: '700', color: colors.gray600 },
  compararHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  compararLegenda: { flex: 1, fontSize: 11.5, color: colors.gray600 },
  chipsWrapCompara: { marginBottom: 10 },
  compararItem: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.gray100 },
  compararNomeLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  compararNome: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.gray900 },
  chipVariacao: { borderRadius: radius.full, paddingVertical: 2, paddingHorizontal: 8 },
  chipVariacaoTexto: { fontSize: 11, fontWeight: '700' },

  abasWrap: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
    paddingHorizontal: spacing.lg,
    gap: 6,
  },
  aba: { paddingVertical: 12, paddingHorizontal: 4, marginRight: 18, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  abaAtiva: { borderBottomColor: colors.navy700 },
  abaTexto: { fontSize: 13.5, fontWeight: '700', color: colors.gray400 },
  abaTextoAtivo: { color: colors.navy700 },

  resumoAbcCard: { backgroundColor: colors.navy900, padding: spacing.lg, margin: spacing.lg, marginBottom: spacing.md, borderRadius: radius.lg },
  resumoAbcLinha: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.lg },
  resumoAbcItem: { alignItems: 'flex-start' },
  resumoAbcNumero: { fontSize: 22, fontWeight: '800' },
  resumoAbcTag: { color: colors.gray100, fontSize: 11, fontWeight: '600', marginTop: 2 },

  filtroCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  filtroTitulo: { fontSize: 13, fontWeight: '800', color: colors.gray900, marginBottom: 10 },
  filtroLinhaLimiar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  filtroLabel: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  filtroInput: {
    borderWidth: 1,
    borderColor: colors.gray100,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    width: 56,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray900,
  },
  chipPositivo: { alignSelf: 'flex-start', marginTop: 4 },
  filtroAjuda: { fontSize: 10.5, color: colors.gray400, marginTop: 6, lineHeight: 14 },

  contagemCritico: { fontSize: 11.5, fontWeight: '700', color: colors.red500, marginHorizontal: spacing.lg, marginBottom: 8 },

  itemCriticoCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  itemCriticoNome: { fontSize: 12.5, fontWeight: '700', color: colors.gray900, marginBottom: 8 },
  itemCriticoLinha: { flexDirection: 'row', justifyContent: 'space-between' },
  itemCriticoRotulo: { fontSize: 9.5, fontWeight: '600', color: colors.gray400, marginBottom: 2, textTransform: 'uppercase' },
  itemCriticoValor: { fontSize: 12.5, fontWeight: '700', color: colors.gray900 },
});
