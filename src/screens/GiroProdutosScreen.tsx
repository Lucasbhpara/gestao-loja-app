import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  BackHandler,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import {
  BaseGiro,
  NIVEIS,
  ROTULO_NIVEL,
  ProdutoGiro,
  agrupar,
  carregarBaseGiro,
  ehSemVenda,
  filtrar,
  formatarDataCurta,
  formatarEstoque,
  formatarReais,
  formatarReaisCurto,
  lerOcultos,
  nomeBonito,
  ordenarProblemas,
  resumir,
  salvarOcultos,
} from '../data/giroApi';

// Giro de Produtos: o que está sem venda ou parado, descendo de setor até
// subcategoria. Mesmo visual da Visita Técnica (cabeçalho azul + cartões).
const OPCOES_DIAS = [7, 15, 30];
const POR_PAGINA = 40;

export default function GiroProdutosScreen({ onVoltar }: { onVoltar: () => void }) {
  const [base, setBase] = useState<BaseGiro | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [caminho, setCaminho] = useState<string[]>([]);
  const [dias, setDias] = useState(15);
  const [soComEstoque, setSoComEstoque] = useState(true);
  const [mostrarOcultos, setMostrarOcultos] = useState(false);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [aba, setAba] = useState<'grupos' | 'produtos'>('grupos');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);

  const carregar = useCallback(async (forcar = false) => {
    try {
      setErro(null);
      const [b, o] = await Promise.all([carregarBaseGiro(forcar), lerOcultos()]);
      setBase(b);
      setOcultos(o);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui carregar o giro.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Botão voltar do Android: sobe um nível antes de sair da tela.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (caminho.length > 0) {
        subirPara(caminho.length - 1);
        return true;
      }
      onVoltar();
      return true;
    });
    return () => sub.remove();
  }, [caminho, onVoltar]);

  function subirPara(n: number) {
    setCaminho((c) => c.slice(0, n));
    setAba('grupos');
    setLimite(POR_PAGINA);
  }

  function entrar(grupo: string) {
    const novo = [...caminho, grupo];
    setCaminho(novo);
    setAba(novo.length >= NIVEIS.length ? 'produtos' : 'grupos');
    setLimite(POR_PAGINA);
  }

  async function alternarOculto(p: ProdutoGiro) {
    const novo = new Set(ocultos);
    if (novo.has(p.codigo)) novo.delete(p.codigo);
    else novo.add(p.codigo);
    setOcultos(novo);
    await salvarOcultos(novo);
  }

  const doEscopo = useMemo(
    () => (base ? filtrar(base.produtos, { caminho, soComEstoque, dias, mostrarOcultos, ocultos }) : []),
    [base, caminho, soComEstoque, dias, mostrarOcultos, ocultos]
  );
  const resumo = useMemo(() => resumir(doEscopo, dias), [doEscopo, dias]);
  const nivelAtual = NIVEIS[Math.min(caminho.length, NIVEIS.length - 1)];
  const grupos = useMemo(
    () => (caminho.length < NIVEIS.length ? agrupar(doEscopo, nivelAtual, dias) : []),
    [doEscopo, nivelAtual, dias, caminho.length]
  );
  const produtos = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    const lista = termo
      ? doEscopo.filter((p) => p.nome.toUpperCase().includes(termo) || p.codigo.includes(termo))
      : doEscopo;
    return ordenarProblemas(lista, dias);
  }, [doEscopo, busca, dias]);
  const qtdOcultos = useMemo(() => {
    if (!base) return 0;
    return base.produtos.filter((p) => p.ocultoPorSetor || ocultos.has(p.codigo)).length;
  }, [base, ocultos]);

  const periodoTexto =
    base?.periodoInicio && base.periodoFim
      ? `Vendas de ${formatarDataCurta(base.periodoInicio)} a ${formatarDataCurta(base.periodoFim)}`
      : 'Sem vendas carregadas';

  return (
    <View style={styles.flex}>
      <View style={styles.hero}>
        <TouchableOpacity onPress={onVoltar} style={styles.heroBotao} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="chevron-left" size={18} color={colors.white} />
          <Text style={styles.heroBotaoTexto}>Voltar</Text>
        </TouchableOpacity>
        <View style={styles.heroLinha}>
          <View style={styles.heroIcone}>
            <Feather name="refresh-cw" size={20} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitulo}>Giro de Produtos</Text>
            <Text style={styles.heroSub}>{periodoTexto}</Text>
          </View>
        </View>

        {/* Onde estou: Todos › Setor › Subsetor ... */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trilhaWrap}>
          <TouchableOpacity onPress={() => subirPara(0)} style={[styles.trilhaChip, caminho.length === 0 && styles.trilhaChipAtivo]}>
            <Feather name="home" size={12} color={caminho.length === 0 ? colors.navy700 : colors.white} />
            <Text style={[styles.trilhaTexto, caminho.length === 0 && styles.trilhaTextoAtivo]}>Loja toda</Text>
          </TouchableOpacity>
          {caminho.map((c, i) => {
            const ativo = i === caminho.length - 1;
            return (
              <React.Fragment key={i}>
                <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.6)" />
                <TouchableOpacity onPress={() => subirPara(i + 1)} style={[styles.trilhaChip, ativo && styles.trilhaChipAtivo]}>
                  <Text style={[styles.trilhaTexto, ativo && styles.trilhaTextoAtivo]} numberOfLines={1}>
                    {nomeBonito(c)}
                  </Text>
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(true); }} />}
      >
        {carregando ? (
          <View style={{ alignItems: 'center', marginTop: spacing.xxl, gap: spacing.md }}>
            <ActivityIndicator color={colors.navy700} />
            <Text style={styles.ajuda}>Carregando quase 10 mil produtos…</Text>
          </View>
        ) : erro ? (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        ) : (
          <>
            {/* Resumo do escopo atual */}
            <View style={styles.statsCard}>
              <View style={styles.stat}>
                <Text style={[styles.statValor, { color: colors.red500 }]}>{resumo.semVenda.toLocaleString('pt-BR')}</Text>
                <Text style={styles.statRotulo}>sem venda</Text>
              </View>
              <View style={styles.statDivisor} />
              <View style={styles.stat}>
                <Text style={[styles.statValor, { color: '#B4650E' }]}>{resumo.parados.toLocaleString('pt-BR')}</Text>
                <Text style={styles.statRotulo}>parados {dias}+ dias</Text>
              </View>
              <View style={styles.statDivisor} />
              <View style={styles.stat}>
                <Text style={[styles.statValor, { fontSize: 17 }]} numberOfLines={1} adjustsFontSizeToFit>{formatarReaisCurto(resumo.custoParado)}</Text>
                <Text style={styles.statRotulo}>estoque parado</Text>
              </View>
            </View>
            <Text style={[styles.ajuda, { marginTop: 6, textAlign: 'center' }]}>
              de {resumo.produtos.toLocaleString('pt-BR')} produtos{soComEstoque ? ' com estoque' : ''} · custo médio × estoque
            </Text>

            {/* Filtros */}
            <View style={styles.filtrosCard}>
              <Text style={styles.filtroRotulo}>Parado há pelo menos</Text>
              <View style={styles.segmento}>
                {OPCOES_DIAS.map((d) => (
                  <TouchableOpacity key={d} style={[styles.segItem, dias === d && styles.segItemAtivo]} onPress={() => setDias(d)}>
                    <Text style={[styles.segTexto, dias === d && styles.segTextoAtivo]}>{d} dias</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.chipsLinha}>
                <TouchableOpacity style={[styles.chip, soComEstoque && styles.chipAtivo]} onPress={() => setSoComEstoque((v) => !v)}>
                  <Feather name={soComEstoque ? 'check-square' : 'square'} size={13} color={soComEstoque ? colors.white : colors.gray600} />
                  <Text style={[styles.chipTexto, soComEstoque && styles.chipTextoAtivo]}>Só com estoque</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.chip, mostrarOcultos && styles.chipAtivo]} onPress={() => setMostrarOcultos((v) => !v)}>
                  <Feather name={mostrarOcultos ? 'eye' : 'eye-off'} size={13} color={mostrarOcultos ? colors.white : colors.gray600} />
                  <Text style={[styles.chipTexto, mostrarOcultos && styles.chipTextoAtivo]}>
                    {mostrarOcultos ? 'Mostrando ocultos' : `Ocultos (${qtdOcultos})`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Grupos x Produtos */}
            {caminho.length < NIVEIS.length && (
              <View style={styles.abas}>
                {(
                  [
                    { k: 'grupos', rotulo: `Por ${ROTULO_NIVEL[nivelAtual].toLowerCase()}`, icone: 'grid' },
                    { k: 'produtos', rotulo: 'Lista de produtos', icone: 'list' },
                  ] as const
                ).map((a) => (
                  <TouchableOpacity
                    key={a.k}
                    style={[styles.aba, aba === a.k && styles.abaAtiva]}
                    onPress={() => { setAba(a.k); setLimite(POR_PAGINA); }}
                  >
                    <Feather name={a.icone} size={14} color={aba === a.k ? colors.white : colors.gray600} />
                    <Text style={[styles.abaTexto, aba === a.k && styles.abaTextoAtivo]}>{a.rotulo}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {aba === 'grupos' && caminho.length < NIVEIS.length ? (
              grupos.length === 0 ? (
                <Text style={[styles.ajuda, { textAlign: 'center', marginTop: spacing.xl }]}>Nada por aqui com esses filtros.</Text>
              ) : (
                grupos.map((g) => {
                  const problema = g.semVenda + g.parados;
                  const pct = g.produtos ? problema / g.produtos : 0;
                  return (
                    <TouchableOpacity key={g.grupo} style={styles.grupoCard} onPress={() => entrar(g.grupo)} activeOpacity={0.8}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.grupoNome}>{nomeBonito(g.grupo)}</Text>
                        <View style={styles.grupoNumeros}>
                          {g.semVenda > 0 && (
                            <View style={[styles.pill, { backgroundColor: '#FBE4E2' }]}>
                              <Text style={[styles.pillTexto, { color: colors.red500 }]}>{g.semVenda} sem venda</Text>
                            </View>
                          )}
                          {g.parados > 0 && (
                            <View style={[styles.pill, { backgroundColor: '#FBEBD4' }]}>
                              <Text style={[styles.pillTexto, { color: '#B4650E' }]}>{g.parados} parados</Text>
                            </View>
                          )}
                          {problema === 0 && (
                            <View style={[styles.pill, { backgroundColor: '#DCF2E7' }]}>
                              <Text style={[styles.pillTexto, { color: colors.green500 }]}>Tudo girando</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.trilhaBarra}>
                          <View style={[styles.barra, { width: `${pct * 100}%`, backgroundColor: pct > 0.4 ? colors.red500 : '#E08A1E' }]} />
                        </View>
                        <Text style={styles.grupoRodape}>
                          {problema} de {g.produtos} produtos · {formatarReais(g.custoParado)} parado
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={20} color={colors.gray400} />
                    </TouchableOpacity>
                  );
                })
              )
            ) : (
              <>
                <View style={styles.buscaBox}>
                  <Feather name="search" size={16} color={colors.gray400} />
                  <TextInput
                    style={styles.buscaInput}
                    placeholder="Buscar por nome ou código"
                    placeholderTextColor={colors.gray400}
                    value={busca}
                    onChangeText={(t) => { setBusca(t); setLimite(POR_PAGINA); }}
                  />
                  {!!busca && (
                    <TouchableOpacity onPress={() => setBusca('')}>
                      <Feather name="x" size={16} color={colors.gray400} />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={[styles.ajuda, { marginBottom: spacing.sm }]}>
                  {produtos.length.toLocaleString('pt-BR')} produtos sem venda ou parados {dias}+ dias — os mais parados primeiro
                </Text>
                {produtos.slice(0, limite).map((p) => {
                  const oculto = p.ocultoPorSetor || ocultos.has(p.codigo);
                  return (
                    <View key={p.codigo} style={[styles.prodCard, oculto && { opacity: 0.55 }]}>
                      <View style={styles.prodTopo}>
                        <Text style={styles.prodNome}>{p.nome}</Text>
                        {ehSemVenda(p) ? (
                          <View style={[styles.pill, { backgroundColor: '#FBE4E2' }]}>
                            <Text style={[styles.pillTexto, { color: colors.red500 }]}>Sem venda</Text>
                          </View>
                        ) : (
                          <View style={[styles.pill, { backgroundColor: '#FBEBD4' }]}>
                            <Text style={[styles.pillTexto, { color: '#B4650E' }]}>{p.diasParado} dias parado</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.prodMeta}>
                        {p.codigo} · {nomeBonito(p.subcategoria)}
                      </Text>
                      <View style={styles.prodNumeros}>
                        <View style={styles.prodNum}>
                          <Text style={styles.prodNumRotulo}>Estoque</Text>
                          <Text style={styles.prodNumValor}>{formatarEstoque(p.estoque)}</Text>
                        </View>
                        <View style={styles.prodNum}>
                          <Text style={styles.prodNumRotulo}>Última venda</Text>
                          <Text style={styles.prodNumValor}>{p.ultimaVenda ? formatarDataCurta(p.ultimaVenda) : 'nenhuma'}</Text>
                        </View>
                        <View style={styles.prodNum}>
                          <Text style={styles.prodNumRotulo}>Parado</Text>
                          <Text style={styles.prodNumValor}>{formatarReais(p.custoEstoque)}</Text>
                        </View>
                      </View>
                      {!p.ocultoPorSetor && (
                        <TouchableOpacity style={styles.ocultarBotao} onPress={() => alternarOculto(p)}>
                          <Feather name={oculto ? 'eye' : 'eye-off'} size={13} color={colors.navy700} />
                          <Text style={styles.ocultarTexto}>{oculto ? 'Voltar a mostrar' : 'Ocultar (insumo / não é de venda)'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                {produtos.length > limite && (
                  <TouchableOpacity style={styles.maisBotao} onPress={() => setLimite((l) => l + POR_PAGINA)}>
                    <Text style={styles.maisTexto}>Mostrar mais ({(produtos.length - limite).toLocaleString('pt-BR')} restantes)</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  hero: {
    backgroundColor: colors.navy700,
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroBotao: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2 },
  heroBotaoTexto: { color: colors.white, fontSize: 15, fontWeight: '600' },
  heroLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  heroIcone: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroTitulo: { color: colors.white, fontSize: 22, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  trilhaWrap: { alignItems: 'center', gap: 6, marginTop: spacing.lg, paddingRight: spacing.lg },
  trilhaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
    maxWidth: 200,
  },
  trilhaChipAtivo: { backgroundColor: colors.white },
  trilhaTexto: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  trilhaTextoAtivo: { color: colors.navy700 },
  ajuda: { fontSize: 11.5, color: colors.gray600 },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statValor: { fontSize: 22, fontWeight: '800', color: colors.navy900 },
  statRotulo: { fontSize: 11, color: colors.gray600, marginTop: 2, textAlign: 'center' },
  statDivisor: { width: 1, backgroundColor: colors.gray100 },
  filtrosCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.lg },
  filtroRotulo: { fontSize: 11, fontWeight: '700', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.4 },
  segmento: { flexDirection: 'row', backgroundColor: colors.gray50, borderRadius: radius.md, padding: 3, marginTop: 8 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  segItemAtivo: { backgroundColor: colors.navy700 },
  segTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  segTextoAtivo: { color: colors.white },
  chipsLinha: { flexDirection: 'row', gap: 8, marginTop: spacing.md, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 12, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  abas: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
  aba: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  abaAtiva: { backgroundColor: colors.navy700 },
  abaTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  abaTextoAtivo: { color: colors.white },
  grupoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  grupoNome: { fontSize: 14.5, fontWeight: '700', color: colors.gray900 },
  grupoNumeros: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  pill: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9, alignSelf: 'flex-start' },
  pillTexto: { fontSize: 11, fontWeight: '700' },
  trilhaBarra: { height: 5, borderRadius: radius.full, backgroundColor: colors.gray100, marginTop: 8, overflow: 'hidden' },
  barra: { height: 5, borderRadius: radius.full },
  grupoRodape: { fontSize: 11, color: colors.gray600, marginTop: 6 },
  buscaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  buscaInput: { flex: 1, paddingVertical: 10, fontSize: 13.5, color: colors.gray900 },
  prodCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  prodTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  prodNome: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  prodMeta: { fontSize: 11, color: colors.gray400, marginTop: 3 },
  prodNumeros: { flexDirection: 'row', marginTop: spacing.sm, backgroundColor: colors.gray50, borderRadius: radius.md, paddingVertical: 8 },
  prodNum: { flex: 1, alignItems: 'center' },
  prodNumRotulo: { fontSize: 10.5, color: colors.gray600 },
  prodNumValor: { fontSize: 13, fontWeight: '700', color: colors.navy900, marginTop: 2 },
  ocultarBotao: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.sm },
  ocultarTexto: { fontSize: 11.5, fontWeight: '600', color: colors.navy700 },
  maisBotao: { borderWidth: 1.5, borderColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.sm },
  maisTexto: { color: colors.navy700, fontWeight: '700', fontSize: 13 },
});
