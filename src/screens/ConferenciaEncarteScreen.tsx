import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, Keyboard, Platform, useWindowDimensions, RefreshControl } from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import VisualizadorJornalModal from '../components/VisualizadorJornalModal';
import { buscarJornalAtual, JornalOferta } from '../data/jornalOfertasApi';
import { CampanhaJornal, ProdutoLigado, produtosDoItem, removerProduto, qtdBr } from '../data/jornalEstoqueApi';
import {
  ItemEncarte,
  StatusConferencia,
  atualizarItemEncarte,
  campanhaDoJornal,
  criarItensLidos,
  ligarVarios,
  listarItensEncarte,
  marcarConferencia,
  reiniciarConferenciaJornal,
} from '../data/jornalEncarteApi';
import { lerItensDoJornal, TextoPdf } from '../data/jornalLeituraPdf';
import { ProdutoLista, buscarProdutos } from '../data/buscaProdutoApi';
import { htmlLerTextos } from '../data/encarteHtml';

// Conferência do jornal, no mesmo formato da Conferência: a lista de itens do
// Jornal de Ofertas (lida do próprio PDF: nome, preço "POR" e código interno)
// com OK / Ruptura / Falta Explosivo. Em "Produtos" você escolhe, uma vez, os
// produtos da loja de cada item (todas as fragrâncias, com caixinhas) — fica
// gravado para o período inteiro e alimenta o Estoque do Jornal.

const AZUL = '#2F7BFF';
type Filtro = 'pendentes' | 'feitos' | 'todos';
const reais = (v: number | null) => (v == null ? '' : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const STATUS: Record<StatusConferencia, { texto: string; cor: string; fundo: string }> = {
  ok: { texto: '✓ OK', cor: colors.green500, fundo: '#DFF3E9' },
  ruptura: { texto: '⚠ Ruptura', cor: colors.red500, fundo: '#FBDEDC' },
  falta_explosivo: { texto: '🏷 Falta Explosivo', cor: '#B4650E', fundo: '#FBEBD4' },
};

export default function ConferenciaEncarteScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const por = usuarioAtual?.nome ?? '';
  const [jornal, setJornal] = useState<JornalOferta | null>(null);
  const [campanha, setCampanha] = useState<CampanhaJornal | null>(null);
  const [itens, setItens] = useState<ItemEncarte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [lendo, setLendo] = useState(false); // lendo os itens do PDF
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('pendentes');
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);
  const [gaveta, setGaveta] = useState<ItemEncarte | null>(null);
  const [verJornal, setVerJornal] = useState(false);

  const recarregar = useCallback(async (c: CampanhaJornal) => {
    const l = await listarItensEncarte(c.id);
    setItens(l);
    return l;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const j = await buscarJornalAtual();
        if (!j) { setErro('Nenhum jornal enviado ainda. Suba o PDF no portal (Ofertas → Jornal de Ofertas).'); return; }
        setJornal(j);
        const c = await campanhaDoJornal(j, por);
        setCampanha(c);
        const l = await recarregar(c);
        if (!l.length) setLendo(true); // primeira vez: monta a lista a partir do PDF
      } catch (e: any) {
        setErro(e?.message ?? 'Não consegui abrir o jornal.');
      } finally {
        setCarregando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function aoLerTextos(ev: any) {
    let m: any;
    try { m = JSON.parse(ev.nativeEvent.data); } catch { return; }
    if (!campanha) return;
    if (m.tipo === 'erro') {
      setLendo(false);
      Alert.alert('Não consegui ler o jornal', m.mensagem ?? '');
      return;
    }
    if (m.tipo !== 'textos') return;
    try {
      const lidos = lerItensDoJornal((m.paginas ?? []) as TextoPdf[][]);
      const n = await criarItensLidos(campanha.id, lidos, itens, por);
      await recarregar(campanha);
      if (!lidos.length) Alert.alert('Jornal sem lista', 'Não achei os itens no texto do PDF (ele pode ser só imagem).');
      else if (n === 0 && itens.length) Alert.alert('Nada novo', 'Todos os itens do jornal já estão na lista.');
    } catch (e: any) {
      Alert.alert('Não consegui montar a lista', e?.message ?? '');
    } finally {
      setLendo(false);
    }
  }

  async function marcar(i: ItemEncarte, status: StatusConferencia | null) {
    setSalvando(i.id);
    try {
      await marcarConferencia(i.id, status, por);
      setItens((l) => l.map((x) => (x.id === i.id ? { ...x, confStatus: status, confPor: status ? por : null } : x)));
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    } finally {
      setSalvando(null);
    }
  }

  function reiniciar() {
    if (!campanha) return;
    Alert.alert('Reiniciar conferência', 'Todos os itens voltam para pendente. Os produtos ligados continuam.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Reiniciar',
        style: 'destructive',
        onPress: async () => {
          try { await reiniciarConferenciaJornal(campanha.id); await recarregar(campanha); } catch (e: any) { Alert.alert('Erro', e?.message ?? ''); }
        },
      },
    ]);
  }

  const feitos = itens.filter((i) => i.confStatus).length;
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens
      .filter((i) => (filtro === 'pendentes' ? !i.confStatus : filtro === 'feitos' ? !!i.confStatus : true))
      .filter((i) => !t || i.descricao.toLowerCase().includes(t) || (i.codigo ?? '').includes(t));
  }, [itens, filtro, busca]);

  const chip = (k: Filtro, r: string) => (
    <TouchableOpacity key={k} style={[styles.chip, filtro === k && styles.chipAtivo]} onPress={() => setFiltro(k)}>
      <Text style={[styles.chipTexto, filtro === k && { color: colors.white }]}>{r}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo="Conferência do jornal" subtitulo={campanha ? campanha.titulo : 'Jornal de Ofertas'} icone="clipboard" onVoltar={onVoltar} />

      {carregando ? (
        <View style={styles.centro}><ActivityIndicator color={colors.navy700} size="large" /></View>
      ) : erro ? (
        <View style={styles.centro}><Text style={styles.vazio}>{erro}</Text></View>
      ) : (
        <>
          <View style={styles.progressoBox}>
            <Text style={styles.progressoTexto}>{feitos} de {itens.length} conferidos</Text>
            <View style={styles.barraFundo}><View style={[styles.barra, { width: `${itens.length ? (feitos / itens.length) * 100 : 0}%` }]} /></View>
            <View style={styles.linhaAcoesTopo}>
              {jornal && (
                <TouchableOpacity onPress={() => setVerJornal(true)}><Text style={styles.link}>📄 Ver jornal</Text></TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setLendo(true)} disabled={lendo}><Text style={styles.link}>{lendo ? 'Lendo o jornal…' : '↻ Ler itens do jornal'}</Text></TouchableOpacity>
              {feitos > 0 && <TouchableOpacity onPress={reiniciar}><Text style={[styles.link, { color: colors.red500 }]}>Reiniciar</Text></TouchableOpacity>}
            </View>
          </View>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={false} onRefresh={() => campanha && recarregar(campanha)} />}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              {chip('pendentes', `Pendentes (${itens.length - feitos})`)}
              {chip('feitos', `Conferidos (${feitos})`)}
              {chip('todos', `Todos (${itens.length})`)}
            </ScrollView>
            <View style={styles.busca}>
              <Feather name="search" size={15} color={colors.gray400} />
              <TextInput style={styles.buscaInput} value={busca} onChangeText={setBusca} placeholder="Buscar item do jornal ou código" placeholderTextColor={colors.gray400} />
            </View>

            {lendo && !itens.length ? (
              <View style={styles.lendo}>
                <ActivityIndicator color={AZUL} />
                <Text style={styles.vazio}>Lendo os produtos do jornal…</Text>
              </View>
            ) : null}

            {lista.map((i) => {
              const st = i.confStatus ? STATUS[i.confStatus] : null;
              const ocupado = salvando === i.id;
              return (
                <View key={i.id} style={styles.itemCard}>
                  <View style={styles.itemTopo}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemProduto}>{i.descricao}</Text>
                      <Text style={styles.itemMeta}>
                        {i.codigo ? `Cód. ${i.codigo} · ` : ''}{reais(i.preco)}{i.pagina ? ` · pág. ${i.pagina}` : ''}
                      </Text>
                    </View>
                    {st && (
                      <View style={[styles.chipStatus, { backgroundColor: st.fundo }]}>
                        <Text style={[styles.chipStatusTexto, { color: st.cor }]}>{st.texto}</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity style={styles.produtosLinha} onPress={() => setGaveta(i)}>
                    <Feather name="package" size={15} color={i.produtos ? AZUL : colors.red500} />
                    <Text style={[styles.produtosTexto, !i.produtos && { color: colors.red500 }]}>
                      {i.produtos ? `${i.produtos} produto${i.produtos === 1 ? '' : 's'} · estoque ${qtdBr(i.estoque)}` : 'Nenhum produto ligado'}
                    </Text>
                    <Text style={styles.link}>{i.produtos ? 'Produtos ›' : 'Escolher ›'}</Text>
                  </TouchableOpacity>

                  {!i.confStatus ? (
                    <View>
                      <View style={styles.itemAcoes}>
                        <TouchableOpacity style={[styles.btnOk, ocupado && styles.btnDesabilitado]} onPress={() => marcar(i, 'ok')} disabled={!!salvando}>
                          <Text style={styles.btnOkTexto}>✓ OK</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.itemAcoes}>
                        <TouchableOpacity style={[styles.btnDivergencia, ocupado && styles.btnDesabilitado]} onPress={() => marcar(i, 'ruptura')} disabled={!!salvando}>
                          <Text style={styles.btnDivergenciaTexto}>⚠ Ruptura</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btnFaltaExplosivo, ocupado && styles.btnDesabilitado]} onPress={() => marcar(i, 'falta_explosivo')} disabled={!!salvando}>
                          <Text style={styles.btnFaltaExplosivoTexto}>🏷 Falta Explosivo</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.itemAcoes}>
                      <Text style={styles.itemMeta}>{i.confPor ?? ''}</Text>
                      <TouchableOpacity onPress={() => marcar(i, null)} disabled={!!salvando}>
                        <Text style={styles.btnRefazerTexto}>Refazer</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
            {!lendo && !lista.length && (
              <Text style={styles.vazio}>{itens.length ? (filtro === 'pendentes' ? 'Tudo conferido! 🎉' : 'Nada com esse filtro.') : 'Nenhum item ainda. Toque em "Ler itens do jornal".'}</Text>
            )}
          </ScrollView>
        </>
      )}

      {/* leitura do PDF escondida (pdf.js) */}
      {lendo && jornal && (
        <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }}>
          <WebView originWhitelist={['*']} source={{ html: htmlLerTextos(jornal.arquivoUrl), baseUrl: 'https://ulva.com.br/' }} onMessage={aoLerTextos} javaScriptEnabled />
        </View>
      )}

      {gaveta && (
        <GavetaProdutos
          item={gaveta}
          por={por}
          onFechar={() => setGaveta(null)}
          onSalvo={async () => { setGaveta(null); if (campanha) await recarregar(campanha); }}
        />
      )}
      {jornal && <VisualizadorJornalModal visible={verJornal} arquivoUrl={jornal.arquivoUrl} onFechar={() => setVerJornal(false)} />}
    </View>
  );
}

// ------------------------------------------------- gaveta de produtos ----
function GavetaProdutos({ item, por, onFechar, onSalvo }: { item: ItemEncarte; por: string; onFechar: () => void; onSalvo: () => void }) {
  const [descricao, setDescricao] = useState(item.descricao);
  const [ligados, setLigados] = useState<ProdutoLigado[] | null>(null);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ProdutoLista[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [marcados, setMarcados] = useState<Map<string, ProdutoLista>>(new Map());
  const [salvando, setSalvando] = useState(false);
  // Modal = janela própria: a gaveta sobe sozinha a altura do teclado.
  const [teclado, setTeclado] = useState(0);
  const { height: alturaTela } = useWindowDimensions();
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setTeclado(e.endCoordinates?.height ?? 0));
    const f = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setTeclado(0));
    return () => { a.remove(); f.remove(); };
  }, []);

  useEffect(() => {
    produtosDoItem(item.id)
      .then((l) => {
        setLigados(l);
        // Busca inicial: o cadastro abrevia os nomes ("BEB.LAC.BH MORANGO 1100G FR"),
        // então usa a 1ª palavra do produto do código + o tamanho → "BEB.LAC.BH 1100G"
        // traz todos os sabores. Sem produto ligado, usa o nome do jornal.
        const ref = l[0]?.produto;
        if (ref) {
          const tam = ref.toUpperCase().match(/\d+(?:[.,]\d+)?\s?(?:KG|G|ML|L|M|UN)\b/);
          // + palavras que aparecem no jornal e no cadastro (marca, ex.: "BH")
          const sa = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
          const doJornal = new Set(sa(item.descricao).split(/[^A-Z0-9]+/));
          const primeira = ref.split(' ')[0];
          const comuns = sa(ref).split(/[^A-Z0-9]+/).filter((w) => w.length >= 2 && !/\d/.test(w) && doJornal.has(w) && !sa(primeira).includes(w));
          setTermo([primeira, ...comuns.slice(0, 1), tam ? tam[0].replace(/\s/g, '') : ''].filter(Boolean).join(' '));
        } else {
          setTermo(item.descricao.split(' ').filter((w) => w.length > 2 && !/^\d/.test(w)).slice(0, 2).join(' '));
        }
      })
      .catch(() => setLigados([]));
  }, [item]);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 3) { setResultados([]); return; }
    setBuscando(true);
    const id = setTimeout(() => buscarProdutos(t).then(setResultados).catch(() => setResultados([])).finally(() => setBuscando(false)), 350);
    return () => clearTimeout(id);
  }, [termo]);

  const chaveP = (p: ProdutoLista) => p.codigoInterno ?? p.produto;
  const jaLigado = (p: ProdutoLista) => (ligados ?? []).some((l) => (p.codigoInterno && l.codigo === p.codigoInterno) || l.produto === p.produto);
  const disponiveis = resultados.filter((p) => !jaLigado(p));
  const todosMarcados = disponiveis.length > 0 && disponiveis.every((p) => marcados.has(chaveP(p)));
  const totalEstoque = (ligados ?? []).reduce((a, l) => a + Math.max(0, l.estoque ?? 0), 0);

  function alternar(p: ProdutoLista) {
    const m = new Map(marcados);
    m.has(chaveP(p)) ? m.delete(chaveP(p)) : m.set(chaveP(p), p);
    setMarcados(m);
  }
  function marcarTodos() {
    const m = new Map(marcados);
    if (todosMarcados) disponiveis.forEach((p) => m.delete(chaveP(p)));
    else disponiveis.forEach((p) => m.set(chaveP(p), p));
    setMarcados(m);
  }
  async function tirar(l: ProdutoLigado) {
    try { await removerProduto(l.id); setLigados((x) => (x ?? []).filter((y) => y.id !== l.id)); } catch (e: any) { Alert.alert('Erro', e?.message ?? ''); }
  }
  async function salvar() {
    setSalvando(true);
    try {
      if (descricao.trim() && descricao.trim() !== item.descricao) await atualizarItemEncarte(item.id, { descricao: descricao.trim() });
      await ligarVarios(item.id, [...marcados.values()].map((p) => ({ codigo: p.codigoInterno, produto: p.produto })), por);
      onSalvo();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFechar}>
      <View style={styles.fundo}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onFechar} activeOpacity={1} />
        <View style={[styles.gaveta, { marginBottom: teclado, maxHeight: Math.max(260, alturaTela * 0.9 - teclado) }]}>
          <View style={styles.alca} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.md }}>
            <Text style={styles.rotulo}>Item do jornal{item.codigo ? ` · cód. ${item.codigo}` : ''}{item.preco != null ? ` · ${reais(item.preco)}` : ''}</Text>
            <TextInput style={styles.input} value={descricao} onChangeText={setDescricao} multiline />

            <Text style={styles.rotulo}>Produtos ligados ({ligados?.length ?? 0}) · estoque {qtdBr(totalEstoque)}</Text>
            {ligados === null ? <ActivityIndicator color={AZUL} /> : null}
            {ligados?.map((l) => (
              <View key={l.id} style={styles.ligado}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prodNome}>{l.produto}</Text>
                  <Text style={styles.prodDet}>{l.codigo ? `Cód. ${l.codigo}` : 'sem código'}{l.origem === 'auto' ? ' · do código do jornal' : ''}</Text>
                </View>
                <Text style={[styles.qtd, (l.estoque ?? 0) <= 0 && { color: colors.red500 }]}>{qtdBr(l.estoque)}</Text>
                <TouchableOpacity onPress={() => tirar(l)} style={styles.btnX}><Feather name="x" size={14} color={colors.red500} /></TouchableOpacity>
              </View>
            ))}

            <Text style={styles.rotulo}>Adicionar fragrâncias / sabores</Text>
            <View style={styles.buscaG}>
              <Feather name="search" size={16} color={colors.gray400} />
              <TextInput style={styles.buscaInput} value={termo} onChangeText={setTermo} placeholder="Buscar (ex.: omo 3l)" placeholderTextColor={colors.gray400} autoCorrect={false} />
              {buscando ? <ActivityIndicator size="small" color={AZUL} /> : null}
            </View>
            {disponiveis.length > 1 && (
              <TouchableOpacity style={styles.todos} onPress={marcarTodos}>
                <Feather name={todosMarcados ? 'check-square' : 'square'} size={18} color={AZUL} />
                <Text style={styles.todosTexto}>{todosMarcados ? 'Desmarcar todos' : `Marcar todos (${disponiveis.length})`}</Text>
              </TouchableOpacity>
            )}
            {resultados.map((p) => {
              const ja = jaLigado(p);
              const m = marcados.has(chaveP(p));
              return (
                <TouchableOpacity key={chaveP(p)} style={[styles.resultado, m && styles.resultadoMarcado]} onPress={() => alternar(p)} disabled={ja}>
                  <Feather name={ja ? 'check' : m ? 'check-square' : 'square'} size={20} color={ja ? colors.green500 : m ? AZUL : colors.gray400} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.prodNome, ja && { color: colors.gray400 }]}>{p.produto}</Text>
                    <Text style={styles.prodDet}>{p.codigoInterno ? `Cód. ${p.codigoInterno}` : 'sem código'}{ja ? ' · já ligado' : ''}</Text>
                  </View>
                  <Text style={[styles.qtd, (p.quantidade ?? 0) <= 0 && { color: colors.red500 }]}>{qtdBr(p.quantidade)}</Text>
                </TouchableOpacity>
              );
            })}
            {termo.trim().length >= 3 && !buscando && !resultados.length && <Text style={styles.prodDet}>Nenhum produto com esse nome.</Text>}
          </ScrollView>
          <TouchableOpacity style={[styles.btnSalvar, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
            {salvando ? <ActivityIndicator color={colors.white} /> : <Feather name="check" size={18} color={colors.white} />}
            <Text style={styles.btnSalvarTexto}>{marcados.size ? `Salvar e ligar ${marcados.size} produto${marcados.size === 1 ? '' : 's'}` : 'Salvar'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  vazio: { color: colors.gray600, textAlign: 'center', lineHeight: 20, marginTop: spacing.md },
  lendo: { alignItems: 'center', paddingVertical: spacing.xl },
  progressoBox: { backgroundColor: colors.white, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  progressoTexto: { fontSize: 14, fontWeight: '800', color: colors.navy900 },
  barraFundo: { height: 7, backgroundColor: colors.gray100, borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  barra: { height: '100%', backgroundColor: colors.green500 },
  linhaAcoesTopo: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm, flexWrap: 'wrap' },
  link: { color: AZUL, fontWeight: '800', fontSize: 12.5 },
  chip: { borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white, borderRadius: radius.full, paddingVertical: 7, paddingHorizontal: 12, marginRight: 6 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 12, fontWeight: '700', color: colors.gray900 },
  busca: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  buscaInput: { flex: 1, paddingVertical: 9, fontSize: 14, color: colors.gray900 },
  itemCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  itemTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  itemProduto: { fontSize: 14, fontWeight: '800', color: colors.gray900 },
  itemMeta: { fontSize: 12, color: colors.gray600, marginTop: 3 },
  chipStatus: { borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 10 },
  chipStatusTexto: { fontSize: 11.5, fontWeight: '800' },
  produtosLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9, marginTop: spacing.sm },
  produtosTexto: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.navy900 },
  itemAcoes: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center', justifyContent: 'space-between' },
  btnOk: { flex: 1, backgroundColor: colors.green500, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  btnOkTexto: { color: colors.white, fontWeight: '800', fontSize: 14 },
  btnDivergencia: { flex: 1, backgroundColor: '#FBDEDC', borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  btnDivergenciaTexto: { color: colors.red500, fontWeight: '800', fontSize: 13.5 },
  btnFaltaExplosivo: { flex: 1, backgroundColor: '#FBEBD4', borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  btnFaltaExplosivoTexto: { color: '#B4650E', fontWeight: '800', fontSize: 13.5 },
  btnDesabilitado: { opacity: 0.5 },
  btnRefazerTexto: { color: AZUL, fontWeight: '800', fontSize: 13 },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  gaveta: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  alca: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.gray100, alignSelf: 'center', marginBottom: spacing.sm },
  rotulo: { fontSize: 11, fontWeight: '800', color: colors.gray600, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: 14, color: colors.gray900, backgroundColor: colors.gray50 },
  ligado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.gray50 },
  prodNome: { fontSize: 12.5, fontWeight: '700', color: colors.gray900 },
  prodDet: { fontSize: 11, color: colors.gray600, marginTop: 1 },
  qtd: { fontSize: 13, fontWeight: '800', color: colors.navy900, minWidth: 36, textAlign: 'right' },
  btnX: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  buscaG: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.gray50 },
  todos: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  todosTexto: { color: AZUL, fontWeight: '800', fontSize: 13 },
  resultado: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 6, borderRadius: radius.sm },
  resultadoMarcado: { backgroundColor: '#EEF4FF' },
  btnSalvar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: AZUL, borderRadius: radius.md, paddingVertical: 14, marginTop: spacing.sm },
  btnSalvarTexto: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
