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
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import {
  BaseGiro,
  FAIXAS,
  FAIXA_MAIS_30,
  rotuloFaixa,
  NIVEIS,
  ROTULO_NIVEL,
  ProdutoGiro,
  carregarBaseGiro,
  diasSemVendaTexto,
  ehSemVenda,
  filtrar,
  formatarDataCurta,
  formatarEstoque,
  formatarReais,
  formatarReaisCurto,
  lerOcultos,
  nomeBonito,
  opcoesDoNivel,
  ordenarPorEstoque,
  resumir,
  salvarOcultos,
} from '../data/giroApi';

// Giro de Produtos: já abre com a lista de produtos sem venda/parados, do
// maior estoque pro menor. O botão "Filtro" vai afunilando: setor → subsetor
// → categoria → subcategoria (cada escolha libera o próximo nível). Seta pra
// inverter a ordem do estoque e "Limpar filtro" pra voltar a ver tudo.
const POR_PAGINA = 40;

export default function GiroProdutosScreen({ onVoltar }: { onVoltar: () => void }) {
  const [base, setBase] = useState<BaseGiro | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [caminho, setCaminho] = useState<string[]>([]);
  const [dias, setDias] = useState(FAIXA_MAIS_30);
  const [soComEstoque, setSoComEstoque] = useState(true);
  const [mostrarOcultos, setMostrarOcultos] = useState(false);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [crescente, setCrescente] = useState(false);
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [filtroAberto, setFiltroAberto] = useState(false);

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

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (filtroAberto) {
        setFiltroAberto(false);
        return true;
      }
      onVoltar();
      return true;
    });
    return () => sub.remove();
  }, [filtroAberto, onVoltar]);

  function escolher(nivelIdx: number, valor: string) {
    setCaminho((c) => (c[nivelIdx] === valor ? c.slice(0, nivelIdx) : [...c.slice(0, nivelIdx), valor]));
    setLimite(POR_PAGINA);
  }

  function limparFiltro() {
    setCaminho([]);
    setBusca('');
    setDias(FAIXA_MAIS_30);
    setSoComEstoque(true);
    setMostrarOcultos(false);
    setLimite(POR_PAGINA);
  }

  async function alternarOculto(p: ProdutoGiro) {
    const novo = new Set(ocultos);
    if (novo.has(p.codigo)) novo.delete(p.codigo);
    else novo.add(p.codigo);
    setOcultos(novo);
    await salvarOcultos(novo);
  }

  const semCaminho = useMemo(
    () => (base ? filtrar(base.produtos, { caminho: [], soComEstoque, dias, mostrarOcultos, ocultos }) : []),
    [base, soComEstoque, dias, mostrarOcultos, ocultos]
  );
  const doEscopo = useMemo(
    () => (base ? filtrar(base.produtos, { caminho, soComEstoque, dias, mostrarOcultos, ocultos }) : []),
    [base, caminho, soComEstoque, dias, mostrarOcultos, ocultos]
  );
  const resumo = useMemo(() => resumir(doEscopo, dias), [doEscopo, dias]);
  const produtos = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    const lista = termo ? doEscopo.filter((p) => p.nome.toUpperCase().includes(termo) || p.codigo.includes(termo)) : doEscopo;
    return ordenarPorEstoque(lista, dias, crescente);
  }, [doEscopo, busca, dias, crescente]);

  // Opções de cada nível do filtro, considerando o que já foi escolhido acima.
  const niveisFiltro = useMemo(() => {
    const out: { idx: number; opcoes: { valor: string; qtd: number }[] }[] = [];
    let lista = semCaminho;
    for (let i = 0; i < NIVEIS.length; i++) {
      out.push({ idx: i, opcoes: opcoesDoNivel(lista, NIVEIS[i], dias) });
      if (!caminho[i]) break;
      lista = lista.filter((p) => p[NIVEIS[i]] === caminho[i]);
    }
    return out;
  }, [semCaminho, caminho, dias]);

  const qtdFiltros = caminho.length + (dias !== FAIXA_MAIS_30 ? 1 : 0) + (!soComEstoque ? 1 : 0) + (mostrarOcultos ? 1 : 0);
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

        {/* Busca + filtro + ordem */}
        <View style={styles.barra}>
          <View style={styles.buscaBox}>
            <Feather name="search" size={16} color="rgba(255,255,255,0.7)" />
            <TextInput
              style={styles.buscaInput}
              placeholder="Buscar produto ou código"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={busca}
              onChangeText={(t) => { setBusca(t); setLimite(POR_PAGINA); }}
            />
            {!!busca && (
              <TouchableOpacity onPress={() => setBusca('')}>
                <Feather name="x" size={16} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.botaoQuadrado} onPress={() => setFiltroAberto(true)}>
            <Feather name="filter" size={18} color={colors.navy700} />
            {qtdFiltros > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeTexto}>{qtdFiltros}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.botaoQuadrado} onPress={() => setCrescente((v) => !v)}>
            <Feather name={crescente ? 'arrow-up' : 'arrow-down'} size={18} color={colors.navy700} />
          </TouchableOpacity>
        </View>
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
            {/* Filtros ativos */}
            {qtdFiltros > 0 && (
              <View style={styles.ativosLinha}>
                {caminho.map((c, i) => (
                  <TouchableOpacity key={i} style={styles.ativoChip} onPress={() => setCaminho(caminho.slice(0, i))}>
                    <Text style={styles.ativoRotulo}>{ROTULO_NIVEL[NIVEIS[i]]}:</Text>
                    <Text style={styles.ativoTexto} numberOfLines={1}>{nomeBonito(c)}</Text>
                    <Feather name="x" size={12} color={colors.navy700} />
                  </TouchableOpacity>
                ))}
                {dias !== FAIXA_MAIS_30 && (
                  <View style={styles.ativoChip}>
                    <Text style={styles.ativoTexto}>{rotuloFaixa(dias)}</Text>
                  </View>
                )}
                {!soComEstoque && (
                  <View style={styles.ativoChip}>
                    <Text style={styles.ativoTexto}>Inclui sem estoque</Text>
                  </View>
                )}
                {mostrarOcultos && (
                  <View style={styles.ativoChip}>
                    <Text style={styles.ativoTexto}>Mostrando ocultos</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.limparChip} onPress={limparFiltro}>
                  <Feather name="x-circle" size={13} color={colors.red500} />
                  <Text style={styles.limparTexto}>Limpar filtro</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Resumo */}
            <View style={styles.statsCard}>
              <View style={styles.stat}>
                <Text style={[styles.statValor, { color: colors.red500 }]}>{resumo.semVenda.toLocaleString('pt-BR')}</Text>
                <Text style={styles.statRotulo}>sem venda</Text>
              </View>
              <View style={styles.statDivisor} />
              <View style={styles.stat}>
                <Text style={[styles.statValor, { color: '#B4650E' }]}>{resumo.parados.toLocaleString('pt-BR')}</Text>
                <Text style={styles.statRotulo}>{dias >= FAIXA_MAIS_30 ? 'mais de 30 dias' : `até ${dias} dias`}</Text>
              </View>
              <View style={styles.statDivisor} />
              <View style={styles.stat}>
                <Text style={[styles.statValor, { fontSize: 17 }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatarReaisCurto(resumo.custoParado)}
                </Text>
                <Text style={styles.statRotulo}>estoque parado</Text>
              </View>
            </View>

            <View style={styles.listaTopo}>
              <Text style={styles.secaoTitulo}>{produtos.length.toLocaleString('pt-BR')} produtos</Text>
              <TouchableOpacity style={styles.ordemBotao} onPress={() => setCrescente((v) => !v)}>
                <Text style={styles.ordemTexto}>Estoque: {crescente ? 'menor → maior' : 'maior → menor'}</Text>
                <Feather name={crescente ? 'arrow-up' : 'arrow-down'} size={13} color={colors.navy700} />
              </TouchableOpacity>
            </View>

            {produtos.length === 0 ? (
              <Text style={[styles.ajuda, { textAlign: 'center', marginTop: spacing.xl }]}>
                Nenhum produto nessa faixa com esses filtros.
              </Text>
            ) : (
              produtos.slice(0, limite).map((p) => {
                const oculto = p.ocultoPorSetor || ocultos.has(p.codigo);
                return (
                  <View key={p.codigo} style={[styles.prodCard, oculto && { opacity: 0.55 }]}>
                    <View style={styles.prodTopo}>
                      <Text style={styles.prodNome}>{p.nome}</Text>
                      {ehSemVenda(p) ? (
                        <View style={[styles.pill, { backgroundColor: '#FBE4E2' }]}>
                          <Text style={[styles.pillTexto, { color: colors.red500 }]}>Sem venda no período</Text>
                        </View>
                      ) : (
                        <View style={[styles.pill, { backgroundColor: '#FBEBD4' }]}>
                          <Text style={[styles.pillTexto, { color: '#B4650E' }]}>Parado</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.prodMeta} numberOfLines={1}>
                      {p.codigo} · {nomeBonito(p.setor)} › {nomeBonito(p.subcategoria)} · última venda: {p.ultimaVenda ? formatarDataCurta(p.ultimaVenda) : 'nenhuma'}
                    </Text>
                    <View style={styles.prodNumeros}>
                      <View style={styles.prodNum}>
                        <Text style={styles.prodNumRotulo}>Estoque</Text>
                        <Text style={[styles.prodNumValor, { fontSize: 15 }]}>{formatarEstoque(p.estoque)}</Text>
                      </View>
                      <View style={styles.prodNum}>
                        <Text style={styles.prodNumRotulo}>Dias sem venda</Text>
                        <Text style={[styles.prodNumValor, { fontSize: 15, color: ehSemVenda(p) ? colors.red500 : '#B4650E' }]}>
                          {diasSemVendaTexto(p, base)}
                        </Text>
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
              })
            )}
            {produtos.length > limite && (
              <TouchableOpacity style={styles.maisBotao} onPress={() => setLimite((l) => l + POR_PAGINA)}>
                <Text style={styles.maisTexto}>Mostrar mais ({(produtos.length - limite).toLocaleString('pt-BR')} restantes)</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {/* Painel de filtro */}
      <Modal visible={filtroAberto} transparent animationType="slide" onRequestClose={() => setFiltroAberto(false)}>
        <View style={styles.modalFundo}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setFiltroAberto(false)} />
          <View style={styles.folha}>
            <View style={styles.folhaAlca} />
            <View style={styles.folhaTopo}>
              <Text style={styles.folhaTitulo}>Filtro</Text>
              <TouchableOpacity onPress={limparFiltro} style={styles.limparChip}>
                <Feather name="x-circle" size={13} color={colors.red500} />
                <Text style={styles.limparTexto}>Limpar filtro</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: spacing.md }}>
              {niveisFiltro.map(({ idx, opcoes }) => (
                <View key={idx} style={{ marginTop: spacing.md }}>
                  <Text style={styles.filtroRotulo}>
                    {idx + 1}. {ROTULO_NIVEL[NIVEIS[idx]]}
                    {idx > 0 ? <Text style={styles.filtroDica}> de {nomeBonito(caminho[idx - 1])}</Text> : null}
                  </Text>
                  <View style={styles.opcoesWrap}>
                    {opcoes.length === 0 ? (
                      <Text style={styles.ajuda}>Nada parado aqui.</Text>
                    ) : (
                      opcoes.map((o) => {
                        const ativo = caminho[idx] === o.valor;
                        return (
                          <TouchableOpacity key={o.valor} style={[styles.opcao, ativo && styles.opcaoAtiva]} onPress={() => escolher(idx, o.valor)}>
                            <Text style={[styles.opcaoTexto, ativo && styles.opcaoTextoAtivo]}>{nomeBonito(o.valor)}</Text>
                            <Text style={[styles.opcaoQtd, ativo && styles.opcaoTextoAtivo]}>{o.qtd}</Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                </View>
              ))}

              <Text style={[styles.filtroRotulo, { marginTop: spacing.lg }]}>Dias sem venda</Text>
              <View style={styles.segmento}>
                {FAIXAS.map((f) => (
                  <TouchableOpacity key={f.valor} style={[styles.segItem, dias === f.valor && styles.segItemAtivo]} onPress={() => setDias(f.valor)}>
                    <Text style={[styles.segTexto, dias === f.valor && styles.segTextoAtivo]}>{f.rotulo}</Text>
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
                  <Text style={[styles.chipTexto, mostrarOcultos && styles.chipTextoAtivo]}>Mostrar ocultos</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.verBotao} onPress={() => setFiltroAberto(false)}>
              <Text style={styles.verTexto}>Ver {produtos.length.toLocaleString('pt-BR')} produtos</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  barra: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  buscaBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  buscaInput: { flex: 1, paddingVertical: 10, fontSize: 13.5, color: colors.white },
  botaoQuadrado: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.red500,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeTexto: { color: colors.white, fontSize: 10.5, fontWeight: '800' },
  ajuda: { fontSize: 11.5, color: colors.gray600 },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  ativosLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  ativoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E3E7F5',
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: 10,
    maxWidth: 230,
  },
  ativoRotulo: { fontSize: 11, color: colors.gray600, fontWeight: '600' },
  ativoTexto: { fontSize: 12, color: colors.navy700, fontWeight: '700', flexShrink: 1 },
  limparChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#F3C5C1',
    backgroundColor: colors.white,
  },
  limparTexto: { fontSize: 12, color: colors.red500, fontWeight: '700' },
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
  listaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  secaoTitulo: { fontSize: 13, fontWeight: '800', color: colors.navy900, textTransform: 'uppercase', letterSpacing: 0.5 },
  ordemBotao: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.white, borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 10 },
  ordemTexto: { fontSize: 11.5, fontWeight: '700', color: colors.navy700 },
  pill: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9, alignSelf: 'flex-start' },
  pillTexto: { fontSize: 11, fontWeight: '700' },
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
  modalFundo: { flex: 1, backgroundColor: 'rgba(18,27,74,0.45)' },
  folha: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  folhaAlca: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray100, marginBottom: spacing.md },
  folhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  folhaTitulo: { fontSize: 18, fontWeight: '800', color: colors.navy900 },
  filtroRotulo: { fontSize: 11.5, fontWeight: '800', color: colors.navy900, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  filtroDica: { fontSize: 11.5, fontWeight: '600', color: colors.gray600, textTransform: 'none', letterSpacing: 0 },
  opcoesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  opcaoAtiva: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  opcaoTexto: { fontSize: 12.5, fontWeight: '600', color: colors.gray900 },
  opcaoQtd: { fontSize: 11, fontWeight: '700', color: colors.gray600 },
  opcaoTextoAtivo: { color: colors.white },
  segmento: { flexDirection: 'row', backgroundColor: colors.gray50, borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  segItemAtivo: { backgroundColor: colors.navy700 },
  segTexto: { fontSize: 11.5, fontWeight: '700', color: colors.gray600 },
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
  verBotao: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.md },
  verTexto: { color: colors.white, fontSize: 15, fontWeight: '700' },
});
