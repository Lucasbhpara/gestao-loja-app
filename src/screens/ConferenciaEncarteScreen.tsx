import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import { buscarJornalAtual, JornalOferta } from '../data/jornalOfertasApi';
import { CampanhaJornal, ProdutoLigado, produtosDoItem, removerProduto, qtdBr } from '../data/jornalEstoqueApi';
import { ItemEncarte, atualizarItemEncarte, campanhaDoJornal, criarItemEncarte, itensParecidos, ligarVarios, listarItensEncarte } from '../data/jornalEncarteApi';
import { ProdutoLista, buscarProdutos } from '../data/buscaProdutoApi';
import { htmlEncarte } from '../data/encarteHtml';

// Conferência no encarte: o jornal aparece como é (PDF). Toque num produto
// do encarte → gaveta com o nome/preço lido ali, a busca de produtos com
// caixinhas para escolher todas as fragrâncias/sabores, e salvar. Fica
// gravado no item do jornal para o período inteiro (e no Estoque do Jornal).

const AZUL = '#2F7BFF';
type Toque = { pagina: number; x: number; y: number; texto: string; preco: string | null };
const precoNum = (s: string | null | undefined) => {
  if (!s) return null;
  const v = Number(String(s).replace(/[^\d,]/g, '').replace(',', '.'));
  return isFinite(v) && v > 0 ? v : null;
};
const reais = (v: number | null) => (v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default function ConferenciaEncarteScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const por = usuarioAtual?.nome ?? '';
  const web = useRef<WebView>(null);
  const [jornal, setJornal] = useState<JornalOferta | null>(null);
  const [campanha, setCampanha] = useState<CampanhaJornal | null>(null);
  const [itens, setItens] = useState<ItemEncarte[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [pronto, setPronto] = useState(false);
  const [gaveta, setGaveta] = useState<{ toque: Toque | null; item: ItemEncarte | null } | null>(null);
  const [verLista, setVerLista] = useState(false);

  const carregarItens = useCallback(async (c: CampanhaJornal) => setItens(await listarItensEncarte(c.id)), []);

  useEffect(() => {
    (async () => {
      try {
        const j = await buscarJornalAtual();
        if (!j) { setErro('Nenhum jornal enviado ainda. Suba o PDF no portal (Ofertas → Jornal de Ofertas).'); return; }
        setJornal(j);
        const c = await campanhaDoJornal(j, por);
        setCampanha(c);
        await carregarItens(c);
      } catch (e: any) {
        setErro(e?.message ?? 'Não consegui abrir o jornal.');
      } finally {
        setCarregando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // manda os marcadores para o encarte
  useEffect(() => {
    if (!pronto) return;
    const m = itens.filter((i) => i.pagina != null && i.posX != null && i.posY != null).map((i) => ({ id: i.id, pagina: i.pagina, x: i.posX, y: i.posY, produtos: i.produtos, situacao: i.situacao }));
    web.current?.injectJavaScript(`window.setMarcadores && window.setMarcadores(${JSON.stringify(m)}); true;`);
  }, [itens, pronto]);

  const html = useMemo(() => (jornal ? htmlEncarte(jornal.arquivoUrl) : ''), [jornal]);
  const noEncarte = itens.filter((i) => i.pagina != null).length;
  const conferidos = itens.filter((i) => i.produtos > 0).length;

  function aoMensagem(ev: any) {
    let m: any;
    try { m = JSON.parse(ev.nativeEvent.data); } catch { return; }
    if (m.tipo === 'pronto') setPronto(true);
    else if (m.tipo === 'erro') setErro('Não consegui desenhar o encarte: ' + (m.mensagem ?? ''));
    else if (m.tipo === 'toque') setGaveta({ toque: m, item: null });
    else if (m.tipo === 'item') {
      const it = itens.find((i) => i.id === m.id);
      if (it) setGaveta({ toque: null, item: it });
    }
  }

  return (
    <View style={styles.flex}>
      <CabecalhoTela
        titulo="Conferir no encarte"
        subtitulo={campanha ? `${campanha.titulo} · ${conferidos} de ${itens.length} itens com produto` : 'Toque no produto do jornal'}
        icone="book-open"
        onVoltar={onVoltar}
        acao={
          itens.length ? (
            <TouchableOpacity onPress={() => setVerLista(true)} style={styles.btnLista}>
              <Feather name="list" size={16} color={colors.white} />
              <Text style={styles.btnListaTexto}>Itens</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      {carregando ? (
        <View style={styles.centro}><ActivityIndicator color={colors.navy700} size="large" /></View>
      ) : erro && !jornal ? (
        <View style={styles.centro}><Text style={styles.vazio}>{erro}</Text></View>
      ) : (
        <>
          <Text style={styles.dica}>
            Toque em cima do produto no encarte. Os números são quantos produtos já estão ligados (verde = ok, vermelho = zerado ou vai faltar). {noEncarte} marcados.
          </Text>
          {erro ? <Text style={[styles.dica, { color: colors.red500 }]}>{erro}</Text> : null}
          <WebView
            ref={web}
            originWhitelist={['*']}
            source={{ html, baseUrl: 'https://ulva.com.br/' }}
            onMessage={aoMensagem}
            javaScriptEnabled
            domStorageEnabled
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            style={styles.flex}
          />
        </>
      )}

      {gaveta && campanha && (
        <Gaveta
          toque={gaveta.toque}
          item={gaveta.item}
          itens={itens}
          campanhaId={campanha.id}
          por={por}
          onFechar={() => setGaveta(null)}
          onSalvo={async () => { setGaveta(null); await carregarItens(campanha); }}
        />
      )}

      <Modal visible={verLista} animationType="slide" onRequestClose={() => setVerLista(false)}>
        <View style={[styles.flex, { paddingTop: 44 }]}>
          <View style={styles.listaTopo}>
            <TouchableOpacity onPress={() => setVerLista(false)}><Feather name="x" size={24} color={colors.navy900} /></TouchableOpacity>
            <Text style={styles.listaTitulo}>Itens do jornal ({itens.length})</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
            {itens.map((i) => (
              <TouchableOpacity key={i.id} style={styles.linhaItem} onPress={() => { setVerLista(false); setGaveta({ toque: null, item: i }); }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNome}>{i.descricao}</Text>
                  <Text style={styles.itemDet}>
                    {i.produtos} produto{i.produtos === 1 ? '' : 's'} · estoque {qtdBr(i.estoque)}{i.pagina != null ? ` · pág. ${i.pagina}` : ' · sem lugar no encarte'}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.gray400} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ------------------------------------------------------------- gaveta ----
function Gaveta({
  toque,
  item: itemInicial,
  itens,
  campanhaId,
  por,
  onFechar,
  onSalvo,
}: {
  toque: Toque | null;
  item: ItemEncarte | null;
  itens: ItemEncarte[];
  campanhaId: string;
  por: string;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [item, setItem] = useState<ItemEncarte | null>(itemInicial);
  const [descricao, setDescricao] = useState(itemInicial?.descricao ?? toque?.texto ?? '');
  const [preco, setPreco] = useState(itemInicial?.preco != null ? reais(itemInicial.preco) : toque?.preco ?? '');
  const [ligados, setLigados] = useState<ProdutoLigado[]>([]);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ProdutoLista[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [marcados, setMarcados] = useState<Map<string, ProdutoLista>>(new Map());
  const [salvando, setSalvando] = useState(false);

  // sugestões de itens que já vieram da planilha do jornal
  const parecidos = useMemo(() => (toque && !item ? itensParecidos(toque.texto, itens.filter((i) => i.pagina == null)) : []), [toque, item, itens]);

  useEffect(() => {
    if (!item) { setLigados([]); return; }
    produtosDoItem(item.id).then(setLigados).catch(() => setLigados([]));
  }, [item]);

  // já busca pelo texto lido no encarte (as 3 primeiras palavras)
  useEffect(() => {
    if (!item && toque?.texto) setTermo(toque.texto.split(' ').filter((w) => w.length > 2 && !/^\d/.test(w)).slice(0, 3).join(' '));
  }, [toque, item]);

  useEffect(() => {
    const t = termo.trim();
    if (t.length < 3) { setResultados([]); return; }
    setBuscando(true);
    const id = setTimeout(() => {
      buscarProdutos(t).then(setResultados).catch(() => setResultados([])).finally(() => setBuscando(false));
    }, 350);
    return () => clearTimeout(id);
  }, [termo]);

  const chaveP = (p: ProdutoLista) => p.codigoInterno ?? p.produto;
  const jaLigado = (p: ProdutoLista) => ligados.some((l) => (p.codigoInterno && l.codigo === p.codigoInterno) || l.produto === p.produto);
  const disponiveis = resultados.filter((p) => !jaLigado(p));
  const todosMarcados = disponiveis.length > 0 && disponiveis.every((p) => marcados.has(chaveP(p)));

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

  async function salvar() {
    const d = descricao.trim();
    if (!d) { Alert.alert('Falta o nome', 'Escreva o nome do produto como está no jornal.'); return; }
    setSalvando(true);
    try {
      let id = item?.id;
      if (!id) {
        id = await criarItemEncarte(campanhaId, { descricao: d, preco: precoNum(preco), pagina: toque!.pagina, x: toque!.x, y: toque!.y });
      } else {
        await atualizarItemEncarte(id, {
          descricao: d,
          preco: precoNum(preco),
          ...(toque ? { pagina: toque.pagina, x: toque.x, y: toque.y } : {}),
        });
      }
      await ligarVarios(id, [...marcados.values()].map((p) => ({ codigo: p.codigoInterno, produto: p.produto })), por);
      onSalvo();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    } finally {
      setSalvando(false);
    }
  }

  async function tirar(l: ProdutoLigado) {
    try {
      await removerProduto(l.id);
      setLigados((x) => x.filter((y) => y.id !== l.id));
    } catch (e: any) {
      Alert.alert('Não consegui tirar', e?.message ?? '');
    }
  }

  async function tirarDoEncarte() {
    if (!item) return;
    try {
      await atualizarItemEncarte(item.id, { pagina: null, x: null, y: null });
      onSalvo();
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? '');
    }
  }

  const totalEstoque = ligados.reduce((a, l) => a + Math.max(0, l.estoque ?? 0), 0);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fundo}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onFechar} activeOpacity={1} />
        <View style={styles.gaveta}>
          <View style={styles.alca} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.lg }}>
            <Text style={styles.rotulo}>Produto no jornal</Text>
            <TextInput style={styles.input} value={descricao} onChangeText={setDescricao} placeholder="Ex.: Lava roupas Omo 3L" placeholderTextColor={colors.gray400} multiline />
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm }}>
              <Text style={styles.rotuloInline}>Preço R$</Text>
              <TextInput style={[styles.input, { flex: 1 }]} value={preco} onChangeText={setPreco} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={colors.gray400} />
            </View>

            {parecidos.length > 0 && (
              <>
                <Text style={styles.rotulo}>É um destes itens do jornal?</Text>
                {parecidos.map((p) => (
                  <TouchableOpacity key={p.id} style={styles.sugestao} onPress={() => { setItem(p); setDescricao(p.descricao); setPreco(p.preco != null ? reais(p.preco) : preco); }}>
                    <Feather name="corner-down-right" size={14} color={AZUL} />
                    <Text style={styles.sugestaoTexto}>{p.descricao}{p.produtos ? ` · ${p.produtos} produtos` : ''}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {item && (
              <>
                <Text style={styles.rotulo}>Produtos ligados ({ligados.length}) · estoque {qtdBr(totalEstoque)}</Text>
                {ligados.map((l) => (
                  <View key={l.id} style={styles.ligado}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prodNome}>{l.produto}</Text>
                      <Text style={styles.prodDet}>{l.codigo ? `Cód. ${l.codigo}` : 'sem código'}{l.origem === 'sugestao' ? ' · sugestão' : ''}</Text>
                    </View>
                    <Text style={[styles.qtd, (l.estoque ?? 0) <= 0 && { color: colors.red500 }]}>{qtdBr(l.estoque)}</Text>
                    <TouchableOpacity onPress={() => tirar(l)} style={styles.btnX}><Feather name="x" size={14} color={colors.red500} /></TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            <Text style={styles.rotulo}>Adicionar produtos da loja</Text>
            <View style={styles.busca}>
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
            {item && item.pagina != null && (
              <TouchableOpacity onPress={tirarDoEncarte} style={{ marginTop: spacing.lg, alignSelf: 'center' }}>
                <Text style={{ color: colors.red500, fontWeight: '700' }}>Tirar o marcador do encarte</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          <TouchableOpacity style={[styles.btnSalvar, salvando && { opacity: 0.6 }]} onPress={salvar} disabled={salvando}>
            {salvando ? <ActivityIndicator color={colors.white} /> : <Feather name="check" size={18} color={colors.white} />}
            <Text style={styles.btnSalvarTexto}>{marcados.size ? `Salvar e ligar ${marcados.size} produto${marcados.size === 1 ? '' : 's'}` : 'Salvar'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  vazio: { color: colors.gray600, textAlign: 'center', lineHeight: 20 },
  dica: { fontSize: 11.5, color: colors.gray600, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, lineHeight: 16 },
  btnLista: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full },
  btnListaTexto: { color: colors.white, fontWeight: '800', fontSize: 12.5 },
  listaTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  listaTitulo: { fontSize: 17, fontWeight: '800', color: colors.navy900 },
  linhaItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  itemNome: { fontSize: 13.5, fontWeight: '700', color: colors.navy900 },
  itemDet: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  gaveta: { maxHeight: '88%', backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  alca: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.gray100, alignSelf: 'center', marginBottom: spacing.sm },
  rotulo: { fontSize: 11, fontWeight: '800', color: colors.gray600, textTransform: 'uppercase', marginTop: spacing.md, marginBottom: 6 },
  rotuloInline: { fontSize: 12, fontWeight: '800', color: colors.gray600 },
  input: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 9, fontSize: 14, color: colors.gray900, backgroundColor: colors.gray50 },
  sugestao: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E3EDFF', borderRadius: radius.md, padding: spacing.sm, marginBottom: 6 },
  sugestaoTexto: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.navy900 },
  ligado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.gray50 },
  prodNome: { fontSize: 12.5, fontWeight: '700', color: colors.gray900 },
  prodDet: { fontSize: 11, color: colors.gray600, marginTop: 1 },
  qtd: { fontSize: 13, fontWeight: '800', color: colors.navy900, minWidth: 36, textAlign: 'right' },
  btnX: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  busca: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.gray50 },
  buscaInput: { flex: 1, paddingVertical: 9, fontSize: 14, color: colors.gray900 },
  todos: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  todosTexto: { color: AZUL, fontWeight: '800', fontSize: 13 },
  resultado: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 6, borderRadius: radius.sm },
  resultadoMarcado: { backgroundColor: '#EEF4FF' },
  btnSalvar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: AZUL, borderRadius: radius.md, paddingVertical: 14, marginTop: spacing.sm },
  btnSalvarTexto: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
