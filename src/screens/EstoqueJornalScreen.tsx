import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import {
  CampanhaJornal,
  ItemJornal,
  ProdutoLigado,
  SituacaoJornal,
  listarCampanhas,
  campanhaAtual,
  listarItens,
  produtosDoItem,
  confirmarProduto,
  removerProduto,
  ligarProduto,
  salvarMinimo,
  buscarNoEstoque,
  ehAlerta,
  qtdBr,
} from '../data/jornalEstoqueApi';

// Estoque do Jornal: cada item do jornal quinzenal com o estoque somado de
// todos os produtos ligados (fragrâncias, sabores) e se vai acabar antes do
// fim do jornal. A importação do jornal é feita no Portal.

const SITUACAO: Record<SituacaoJornal, { texto: string; cor: string; fundo: string }> = {
  zerado: { texto: 'Zerado', cor: colors.red500, fundo: '#FBDEDC' },
  vai_faltar: { texto: 'Vai faltar', cor: colors.red500, fundo: '#FBDEDC' },
  baixo: { texto: 'Estoque baixo', cor: '#B4650E', fundo: '#FBEBD4' },
  sem_produto: { texto: 'Sem produto', cor: colors.gray600, fundo: colors.gray100 },
  ok: { texto: 'OK', cor: colors.green500, fundo: '#DFF3E9' },
};
const ORDEM: Record<SituacaoJornal, number> = { zerado: 0, vai_faltar: 1, baixo: 2, sem_produto: 3, ok: 4 };
type Filtro = 'alertas' | 'todos' | 'sem' | 'confirmar';
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

export default function EstoqueJornalScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const por = usuarioAtual?.nome ?? '';
  const [campanhas, setCampanhas] = useState<CampanhaJornal[]>([]);
  const [campanha, setCampanha] = useState<CampanhaJornal | null>(null);
  const [itens, setItens] = useState<ItemJornal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('alertas');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [produtos, setProdutos] = useState<ProdutoLigado[] | null>(null);
  const [termoAdd, setTermoAdd] = useState('');
  const [resultadosAdd, setResultadosAdd] = useState<{ codigo: string | null; produto: string; quantidade: number }[]>([]);
  const [minimoTexto, setMinimoTexto] = useState('');

  async function carregar(c?: CampanhaJornal | null) {
    try {
      let lista = campanhas;
      if (!c) {
        lista = await listarCampanhas();
        setCampanhas(lista);
      }
      const atual = c ?? (campanha ? lista.find((x) => x.id === campanha.id) ?? campanhaAtual(lista) : campanhaAtual(lista));
      setCampanha(atual);
      setItens(atual ? await listarItens(atual.id) : []);
      setErro(null);
    } catch (e: any) {
      setErro(/jornal_/.test(e?.message ?? '') ? 'A base do Estoque do Jornal ainda não foi criada no Supabase (schema_jornal_estoque.sql).' : e?.message ?? 'Não consegui carregar.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function abrir(i: ItemJornal) {
    if (aberto === i.id) {
      setAberto(null);
      return;
    }
    setAberto(i.id);
    setProdutos(null);
    setTermoAdd('');
    setResultadosAdd([]);
    setMinimoTexto(i.estoqueMinimo != null ? String(i.estoqueMinimo) : '');
    try {
      setProdutos(await produtosDoItem(i.id));
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? '');
      setProdutos([]);
    }
  }

  async function recarregarItem(itemId: string) {
    setProdutos(await produtosDoItem(itemId));
    if (campanha) setItens(await listarItens(campanha.id));
  }

  useEffect(() => {
    if (!aberto || termoAdd.trim().length < 2) {
      setResultadosAdd([]);
      return;
    }
    const t = setTimeout(() => buscarNoEstoque(termoAdd).then(setResultadosAdd).catch(() => setResultadosAdd([])), 350);
    return () => clearTimeout(t);
  }, [termoAdd, aberto]);

  const contagem = useMemo(
    () => ({
      alertas: itens.filter(ehAlerta).length,
      sem: itens.filter((i) => i.situacao === 'sem_produto').length,
      confirmar: itens.filter((i) => i.sugestoes > 0).length,
    }),
    [itens],
  );

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens
      .filter((i) =>
        filtro === 'alertas' ? ehAlerta(i) : filtro === 'sem' ? i.situacao === 'sem_produto' : filtro === 'confirmar' ? i.sugestoes > 0 : true,
      )
      .filter((i) => !t || i.descricao.toLowerCase().includes(t))
      .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || a.ordem - b.ordem);
  }, [itens, filtro, busca]);

  const chip = (k: Filtro, r: string) => (
    <TouchableOpacity key={k} style={[styles.chip, filtro === k && styles.chipAtivo]} onPress={() => setFiltro(k)}>
      <Text style={[styles.chipTexto, filtro === k && styles.chipTextoAtivo]}>{r}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo="Estoque do Jornal" subtitulo={campanha ? `${campanha.titulo} · ${dataBr(campanha.inicio)} a ${dataBr(campanha.fim)}` : 'Produtos do jornal × estoque da loja'} icone="package" onVoltar={onVoltar}>
        {campanhas.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.md }}>
            {campanhas.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.campanha, campanha?.id === c.id && styles.campanhaAtiva]}
                onPress={() => {
                  setAberto(null);
                  setCarregando(true);
                  carregar(c);
                }}
              >
                <Text style={[styles.campanhaTexto, campanha?.id === c.id && { color: colors.navy700 }]}>
                  {dataBr(c.inicio).slice(0, 5)} a {dataBr(c.fim).slice(0, 5)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}
      </CabecalhoTela>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
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
        {erro ? (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        ) : null}
        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : !campanha ? (
          <Text style={styles.vazio}>Nenhum jornal importado ainda. A planilha do jornal é importada no Portal, em Ofertas → Estoque do Jornal.</Text>
        ) : (
          <>
            <View style={styles.resumo}>
              <View style={styles.resumoBox}>
                <Text style={styles.resumoRotulo}>Itens</Text>
                <Text style={styles.resumoValor}>{itens.length}</Text>
              </View>
              <View style={styles.resumoBox}>
                <Text style={styles.resumoRotulo}>Alertas</Text>
                <Text style={[styles.resumoValor, contagem.alertas > 0 && { color: colors.red500 }]}>{contagem.alertas}</Text>
              </View>
              <View style={styles.resumoBox}>
                <Text style={styles.resumoRotulo}>Faltam</Text>
                <Text style={styles.resumoValor}>{itens[0]?.diasRestantes ?? '—'} dias</Text>
              </View>
            </View>
            <Text style={styles.dica}>
              Venda/dia pelas vendas importadas até {dataBr(itens[0]?.vendasAte ?? null)} (últimos 14 dias). "Vai faltar" = o estoque não dá até o fim do jornal nesse ritmo.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              {chip('alertas', `⚠️ Alertas (${contagem.alertas})`)}
              {chip('todos', `Todos (${itens.length})`)}
              {chip('confirmar', `A confirmar (${contagem.confirmar})`)}
              {chip('sem', `Sem produto (${contagem.sem})`)}
            </ScrollView>
            <View style={styles.buscaWrap}>
              <Feather name="search" size={15} color={colors.gray400} />
              <TextInput style={styles.buscaInput} placeholder="Buscar item do jornal" placeholderTextColor={colors.gray400} value={busca} onChangeText={setBusca} />
            </View>

            {lista.length === 0 ? (
              <Text style={styles.vazio}>{filtro === 'alertas' ? 'Nenhum alerta agora. 👍' : 'Nada com esse filtro.'}</Text>
            ) : (
              lista.map((i) => {
                const sit = SITUACAO[i.situacao];
                const estaAberto = aberto === i.id;
                return (
                  <View key={i.id} style={styles.card}>
                    <TouchableOpacity onPress={() => abrir(i)} activeOpacity={0.7}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                        <Text style={[styles.cardNome, { flex: 1 }]}>{i.descricao}</Text>
                        <View style={[styles.pill, { backgroundColor: sit.fundo }]}>
                          <Text style={[styles.pillTexto, { color: sit.cor }]}>{sit.texto}</Text>
                        </View>
                      </View>
                      <View style={styles.numeros}>
                        <View style={styles.num}>
                          <Text style={styles.numRotulo}>Estoque</Text>
                          <Text style={styles.numValor}>{qtdBr(i.estoque)}</Text>
                        </View>
                        <View style={styles.num}>
                          <Text style={styles.numRotulo}>Venda/dia</Text>
                          <Text style={styles.numValor}>{i.vendaDiaUn ? qtdBr(i.vendaDiaUn) : '—'}</Text>
                        </View>
                        <View style={styles.num}>
                          <Text style={styles.numRotulo}>Dá para</Text>
                          <Text style={styles.numValor}>{i.diasCobertura != null ? `${qtdBr(i.diasCobertura)} d` : '—'}</Text>
                        </View>
                        <View style={styles.num}>
                          <Text style={styles.numRotulo}>Precisa</Text>
                          <Text style={styles.numValor}>{qtdBr(i.necessarioAteFim)}</Text>
                        </View>
                      </View>
                      <Text style={styles.cardMeta}>
                        {i.produtos} produto{i.produtos === 1 ? '' : 's'} ligado{i.produtos === 1 ? '' : 's'}
                        {i.produtosZerados ? ` · ${i.produtosZerados} zerado${i.produtosZerados === 1 ? '' : 's'}` : ''}
                        {i.sugestoes ? ` · ${i.sugestoes} para confirmar` : ''}
                        {'  '}
                        <Text style={styles.link}>{estaAberto ? 'fechar ▴' : 'ver produtos ▾'}</Text>
                      </Text>
                    </TouchableOpacity>

                    {estaAberto ? (
                      <View style={styles.detalhe}>
                        {produtos === null ? (
                          <ActivityIndicator color={colors.navy700} />
                        ) : (
                          <>
                            {produtos.length === 0 ? <Text style={styles.cardMeta}>Nenhum produto ligado. Busque abaixo.</Text> : null}
                            {[...produtos]
                              .sort((a, b) => Number(a.origem === 'sugestao') - Number(b.origem === 'sugestao') || a.produto.localeCompare(b.produto))
                              .map((p) => (
                                <View key={p.id} style={[styles.prod, p.origem === 'sugestao' && { opacity: 0.8 }]}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.prodNome}>{p.produto}</Text>
                                    <Text style={[styles.cardMeta, p.origem === 'sugestao' && { color: '#B4650E', fontWeight: '700' }]}>
                                      {p.codigo ? `Cód. ${p.codigo}` : 'sem código'} ·{' '}
                                      {p.origem === 'sugestao' ? 'sugestão — é este produto?' : p.origem === 'manual' ? 'adicionado' : 'automático'}
                                    </Text>
                                  </View>
                                  <Text style={[styles.prodQtd, p.estoque != null && p.estoque <= 0 && { color: colors.red500 }]}>{qtdBr(p.estoque)}</Text>
                                  {p.origem === 'sugestao' ? (
                                    <TouchableOpacity style={styles.btnOk} onPress={() => confirmarProduto(p.id, por).then(() => recarregarItem(i.id)).catch((e) => Alert.alert('Erro', e?.message ?? ''))}>
                                      <Feather name="check" size={15} color={colors.white} />
                                    </TouchableOpacity>
                                  ) : null}
                                  <TouchableOpacity
                                    style={styles.btnX}
                                    onPress={() =>
                                      Alert.alert('Tirar do item?', p.produto, [
                                        { text: 'Cancelar', style: 'cancel' },
                                        { text: 'Tirar', style: 'destructive', onPress: () => removerProduto(p.id).then(() => recarregarItem(i.id)) },
                                      ])
                                    }
                                  >
                                    <Feather name="x" size={15} color={colors.red500} />
                                  </TouchableOpacity>
                                </View>
                              ))}
                            <Text style={styles.rotulo}>Adicionar produto</Text>
                            <TextInput
                              style={styles.input}
                              placeholder="Nome, código ou código de barras"
                              placeholderTextColor={colors.gray400}
                              value={termoAdd}
                              onChangeText={setTermoAdd}
                            />
                            {resultadosAdd.map((r, k) => {
                              const ja = produtos.some((p) => p.produto === r.produto);
                              return (
                                <TouchableOpacity
                                  key={(r.codigo ?? '') + k}
                                  style={styles.resBusca}
                                  disabled={ja}
                                  onPress={() =>
                                    ligarProduto(i.id, r, por)
                                      .then(() => {
                                        setTermoAdd('');
                                        return recarregarItem(i.id);
                                      })
                                      .catch((e) => Alert.alert('Erro', e?.message ?? ''))
                                  }
                                >
                                  <Text style={[styles.prodNome, { flex: 1 }]}>{r.produto}</Text>
                                  <Text style={styles.prodQtd}>{qtdBr(r.quantidade)}</Text>
                                  <Text style={[styles.link, { marginLeft: 8 }]}>{ja ? 'já ligado' : '+ ligar'}</Text>
                                </TouchableOpacity>
                              );
                            })}
                            <Text style={styles.rotulo}>Avisar quando o estoque ficar abaixo de</Text>
                            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                              <TextInput
                                style={[styles.input, { flex: 1 }]}
                                keyboardType="decimal-pad"
                                placeholder="ex.: 20 (opcional)"
                                placeholderTextColor={colors.gray400}
                                value={minimoTexto}
                                onChangeText={setMinimoTexto}
                              />
                              <TouchableOpacity
                                style={styles.btnSalvar}
                                onPress={() => {
                                  const v = minimoTexto.trim() ? Number(minimoTexto.replace(',', '.')) : null;
                                  salvarMinimo(i.id, v != null && isFinite(v) ? v : null)
                                    .then(() => recarregarItem(i.id))
                                    .then(() => Alert.alert('Salvo', 'Alerta de estoque mínimo atualizado.'))
                                    .catch((e) => Alert.alert('Erro', e?.message ?? ''));
                                }}
                              >
                                <Text style={styles.btnSalvarTexto}>Salvar</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  campanha: { borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.14)', marginRight: 6 },
  campanhaAtiva: { backgroundColor: colors.white },
  campanhaTexto: { color: colors.white, fontWeight: '700', fontSize: 12 },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12.5, lineHeight: 18 },
  vazio: { color: colors.gray600, fontSize: 13, textAlign: 'center', marginTop: spacing.xl, lineHeight: 19 },
  resumo: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  resumoBox: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md },
  resumoRotulo: { fontSize: 10.5, fontWeight: '700', color: colors.gray400, textTransform: 'uppercase' },
  resumoValor: { fontSize: 18, fontWeight: '800', color: colors.navy900, marginTop: 4 },
  dica: { fontSize: 11.5, color: colors.gray400, marginBottom: spacing.md, lineHeight: 16 },
  chip: { borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white, borderRadius: radius.full, paddingVertical: 7, paddingHorizontal: 12, marginRight: 6 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 12, fontWeight: '700', color: colors.gray900 },
  chipTextoAtivo: { color: colors.white },
  buscaWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  buscaInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.gray900 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  cardNome: { fontSize: 13.5, fontWeight: '800', color: colors.gray900 },
  cardMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 6 },
  link: { color: colors.navy700, fontWeight: '700', fontSize: 12 },
  pill: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  pillTexto: { fontSize: 10.5, fontWeight: '800' },
  numeros: { flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  num: { flex: 1, backgroundColor: colors.gray50, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 8 },
  numRotulo: { fontSize: 9.5, color: colors.gray400, fontWeight: '700', textTransform: 'uppercase' },
  numValor: { fontSize: 14, fontWeight: '800', color: colors.gray900, marginTop: 2 },
  detalhe: { borderTopWidth: 1, borderTopColor: colors.gray100, marginTop: spacing.md, paddingTop: spacing.sm },
  prod: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray50 },
  prodNome: { fontSize: 12.5, fontWeight: '700', color: colors.gray900 },
  prodQtd: { fontSize: 13, fontWeight: '800', color: colors.navy900, minWidth: 40, textAlign: 'right' },
  btnOk: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.green500, alignItems: 'center', justifyContent: 'center' },
  btnX: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  rotulo: { fontSize: 11, fontWeight: '800', color: colors.gray600, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: 14, color: colors.gray900, backgroundColor: colors.gray50 },
  resBusca: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray50 },
  btnSalvar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingHorizontal: 16, justifyContent: 'center' },
  btnSalvarTexto: { color: colors.white, fontWeight: '800' },
});
