import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Dimensions, BackHandler } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import LeitorCodigo from '../components/LeitorCodigo';
import MapaPlanta from '../components/MapaPlanta';
import SeletorAreaMapa from '../components/SeletorAreaMapa';
import { AreaMapa } from '../data/mapaLojaApi';
import { buscarAreasComCache, salvarLocalManual } from '../data/rupturaMapaApi';
import { FichaProduto, ProdutoLista, buscarFicha, buscarProdutos } from '../data/buscaProdutoApi';

// Busca produto: abre pelo ícone de código de barras no topo do Início.
// Lê o código de barras (ou busca pelo nome/código) e mostra a ficha:
// estoque, preço, dias de estoque, dias sem venda e onde fica no mapa. Se o
// produto ainda não tem lugar no mapa, o mapa abre para marcar (igual à
// Ruptura) e fica salvo em produto_localizacao.

const AZUL = '#2F7BFF';
const reais = (v: number | null) => (v == null ? '—' : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const numero = (v: number | null, casas = 0) => (v == null ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: casas }));
const dataBR = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');

export default function BuscaProdutoScreen({ onVoltar, abrirLeitor = true }: { onVoltar: () => void; abrirLeitor?: boolean }) {
  const { usuarioAtual } = useAuth();
  const quem = usuarioAtual?.nome ?? '';
  const [lendo, setLendo] = useState(abrirLeitor);
  const [termo, setTermo] = useState('');
  const [lista, setLista] = useState<ProdutoLista[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [ficha, setFicha] = useState<FichaProduto | null>(null);
  const [semCodigo, setSemCodigo] = useState<ProdutoLista | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [areas, setAreas] = useState<AreaMapa[]>([]);
  const [marcarLocal, setMarcarLocal] = useState(false);
  const pedido = useRef(0);

  useEffect(() => { buscarAreasComCache().then(setAreas).catch(() => setAreas([])); }, []);

  // Voltar do Android: da ficha volta para a lista; da lista sai.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (ficha || semCodigo) { setFicha(null); setSemCodigo(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [ficha, semCodigo]);

  async function buscar(t: string, deCodigoLido = false) {
    const n = ++pedido.current;
    setBuscando(true);
    try {
      const r = await buscarProdutos(t);
      if (n !== pedido.current) return;
      if (deCodigoLido && r.length === 1) { abrir(r[0]); setLista(r); return; }
      if (deCodigoLido && !r.length) Alert.alert('Produto não encontrado', `O código ${t} não está no estoque da loja.`);
      setLista(r);
    } catch (e: any) {
      Alert.alert('Não consegui buscar', 'Confira a internet.\n\n' + (e?.message ?? ''));
    } finally {
      if (n === pedido.current) setBuscando(false);
    }
  }

  // busca enquanto digita (com uma pausa curta)
  useEffect(() => {
    const t = termo.trim();
    if (t.length < 3) { if (!t) setLista(null); return; }
    const id = setTimeout(() => buscar(t), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo]);

  async function abrir(p: ProdutoLista) {
    if (!p.codigoInterno) { setSemCodigo(p); return; }
    setAbrindo(true);
    try {
      const f = await buscarFicha(p.codigoInterno);
      if (!f) { Alert.alert('Produto não encontrado'); return; }
      setFicha(f);
      // sem lugar no mapa (nem dele, nem do grupo): já abre o mapa para marcar
      if (!f.areaId && !f.grupoAreaId && areas.length) setMarcarLocal(true);
    } catch (e: any) {
      Alert.alert('Não consegui abrir o produto', e?.message ?? '');
    } finally {
      setAbrindo(false);
    }
  }

  async function salvarLocal(a: AreaMapa) {
    setMarcarLocal(false);
    if (!ficha) return;
    setFicha({ ...ficha, areaId: a.id, areaFonte: 'manual' });
    try {
      await salvarLocalManual(ficha.codigoInterno, ficha.produto, a.id, ficha.grupoId, quem);
    } catch (e: any) {
      Alert.alert('Não consegui salvar o local', e?.message ?? '');
    }
  }

  const lido = (texto: string) => {
    setLendo(false);
    const t = texto.replace(/\D/g, '');
    if (!t) return;
    setTermo('');
    setFicha(null);
    buscar(t, true);
  };

  // ---------------------------------------------------------- ficha ----
  if (ficha) {
    const areaId = ficha.areaId ?? ficha.grupoAreaId;
    const area = areas.find((a) => a.id === areaId) ?? null;
    const doGrupo = !ficha.areaId && !!ficha.grupoAreaId;
    const largura = Dimensions.get('window').width - spacing.lg * 2 - spacing.md * 2;
    const de = ficha.diasEstoque;
    const corDias = de == null ? colors.navy900 : de < 3 ? '#C0352B' : de > 60 ? '#B4650E' : '#178553';
    const corSemVenda = ficha.diasSemVenda == null ? colors.navy900 : ficha.diasSemVenda >= 14 ? '#C0352B' : ficha.diasSemVenda >= 7 ? '#B4650E' : '#178553';
    return (
      <View style={styles.tela}>
        <CabecalhoTela titulo="Busca produto" icone="search" onVoltar={() => setFicha(null)} rotuloVoltar="Voltar" />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 50 }}>
          <Text style={styles.nome}>{ficha.produto}</Text>
          <Text style={styles.sub}>
            Cód. {ficha.codigoInterno}{ficha.eans.length ? ` · EAN ${ficha.eans.slice(0, 2).join(', ')}` : ''}
          </Text>
          {(ficha.grupoNome || ficha.classe) && <Text style={styles.sub}>{ficha.grupoNome ? `${ficha.grupoNome} · ` : ''}{ficha.classe ?? ''}</Text>}

          <View style={styles.cards}>
            <View style={styles.card}>
              <Text style={styles.cardR}>Estoque</Text>
              <Text style={[styles.cardV, (ficha.quantidade ?? 0) <= 0 && { color: '#C0352B' }]}>{numero(ficha.quantidade, 1)}</Text>
              <Text style={styles.cardL}>na loja · {dataBR(ficha.dataEstoque)}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardR}>Preço</Text>
              <Text style={styles.cardV}>{reais(ficha.precoVenda)}</Text>
              <Text style={styles.cardL}>preço de venda</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardR}>Dias de estoque</Text>
              <Text style={[styles.cardV, { color: corDias }]}>{de == null ? '—' : de >= 999 ? '999+' : numero(de)}</Text>
              <Text style={styles.cardL}>{ficha.vendaDiaUn ? `vende ≈ ${numero(ficha.vendaDiaUn, 1)}/dia` : 'sem venda em 30 dias'}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardR}>Dias sem venda</Text>
              <Text style={[styles.cardV, { color: corSemVenda }]}>{ficha.ultimaVenda ? numero(ficha.diasSemVenda) : '—'}</Text>
              <Text style={styles.cardL}>{ficha.ultimaVenda ? `última venda ${dataBR(ficha.ultimaVenda)}` : 'nunca vendeu'}</Text>
            </View>
          </View>
          <Text style={styles.nota}>
            Vendeu {reais(ficha.venda30d)} nos últimos 30 dias ({ficha.diasComVenda30d} dias com venda){ficha.estoqueCd != null ? ` · CD: ${numero(ficha.estoqueCd)}` : ''}.
            {' '}Vendas até {dataBR(ficha.dataRefVendas)}. Dias de estoque = estoque ÷ média de venda por dia (aproximado pelo preço atual).
          </Text>

          <View style={styles.blocoMapa}>
            <View style={styles.mapaTopo}>
              <Feather name="map-pin" size={16} color={AZUL} />
              <Text style={styles.mapaTitulo} numberOfLines={2}>{area ? area.nome : 'Sem lugar no mapa'}</Text>
              <TouchableOpacity onPress={() => setMarcarLocal(true)} disabled={!areas.length}>
                <Text style={styles.link}>{area ? (doGrupo ? 'Confirmar' : 'Trocar') : 'Marcar'}</Text>
              </TouchableOpacity>
            </View>
            {doGrupo && <Text style={styles.nota}>Local do grupo {ficha.grupoNome}. Toque em Confirmar se o produto fica mesmo aí.</Text>}
            {ficha.areaFonte === 'coleta' && <Text style={styles.nota}>Local aprendido na coleta da Ruptura.</Text>}
            {areas.length > 0 && (
              <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
                <MapaPlanta areas={areas} largura={largura} selecionada={areaId} apagarResto={!!areaId} onToque={() => setMarcarLocal(true)} />
              </View>
            )}
          </View>
        </ScrollView>
        <SeletorAreaMapa
          visivel={marcarLocal}
          titulo="Onde fica este produto?"
          subtitulo={ficha.produto}
          areas={areas}
          inicial={areaId}
          textoConfirmar="Salvar local"
          onEscolher={salvarLocal}
          onFechar={() => setMarcarLocal(false)}
        />
      </View>
    );
  }

  // ---------------------------------------------- produto sem código ----
  if (semCodigo) {
    return (
      <View style={styles.tela}>
        <CabecalhoTela titulo="Busca produto" icone="search" onVoltar={() => setSemCodigo(null)} />
        <View style={{ padding: spacing.lg }}>
          <Text style={styles.nome}>{semCodigo.produto}</Text>
          <View style={styles.cards}>
            <View style={styles.card}><Text style={styles.cardR}>Estoque</Text><Text style={styles.cardV}>{numero(semCodigo.quantidade, 1)}</Text></View>
            <View style={styles.card}><Text style={styles.cardR}>Preço</Text><Text style={styles.cardV}>{reais(semCodigo.precoVenda)}</Text></View>
          </View>
          <Text style={styles.nota}>Este item veio na planilha de estoque sem código interno, então não dá para ver vendas nem guardar o lugar no mapa.</Text>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------- busca ----
  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo="Busca produto" subtitulo="Leia o código de barras ou busque pelo nome" icone="search" onVoltar={onVoltar} />
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <View style={styles.linhaBusca}>
          <View style={styles.busca}>
            <Feather name="search" size={18} color={colors.gray400} />
            <TextInput
              style={styles.buscaInput}
              value={termo}
              onChangeText={setTermo}
              placeholder="Nome, código interno ou EAN"
              placeholderTextColor={colors.gray400}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => termo.trim() && buscar(termo.trim(), /^\d+$/.test(termo.trim()))}
            />
            {termo ? (
              <TouchableOpacity onPress={() => { setTermo(''); setLista(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={16} color={colors.gray600} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={styles.btnLer} onPress={() => setLendo(true)} accessibilityLabel="Ler código de barras">
            <MaterialCommunityIcons name="barcode-scan" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {(buscando || abrindo) && <ActivityIndicator color={AZUL} style={{ marginVertical: spacing.md }} />}
        {lista?.map((p, i) => (
          <TouchableOpacity key={(p.codigoInterno ?? p.produto) + i} style={styles.item} onPress={() => abrir(p)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemNome}>{p.produto}</Text>
              <Text style={styles.itemDet}>{p.codigoInterno ? `Cód. ${p.codigoInterno}` : 'sem código interno'} · {reais(p.precoVenda)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.itemQtd, (p.quantidade ?? 0) <= 0 && { color: '#C0352B' }]}>{numero(p.quantidade, 1)}</Text>
              <Text style={styles.itemDet}>estoque</Text>
            </View>
          </TouchableOpacity>
        ))}
        {lista && !lista.length && !buscando && <Text style={styles.vazio}>Nenhum produto encontrado.</Text>}
        {!lista && !buscando && (
          <View style={styles.dica}>
            <MaterialCommunityIcons name="barcode-scan" size={40} color={colors.gray400} />
            <Text style={styles.vazio}>Toque no leitor para bipar o produto, ou digite pelo menos 3 letras do nome.</Text>
          </View>
        )}
      </ScrollView>
      <LeitorCodigo visivel={lendo} modo="barras" onLido={lido} onCancelar={() => setLendo(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.gray50 },
  linhaBusca: { flexDirection: 'row', gap: spacing.sm },
  busca: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md },
  buscaInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.gray900 },
  btnLer: { width: 50, borderRadius: radius.md, backgroundColor: AZUL, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: spacing.md, marginBottom: spacing.sm },
  itemNome: { fontSize: 14, fontWeight: '700', color: colors.navy900 },
  itemDet: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  itemQtd: { fontSize: 16, fontWeight: '800', color: colors.navy900 },
  vazio: { textAlign: 'center', color: colors.gray600, marginTop: spacing.md },
  dica: { alignItems: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.xl },
  nome: { fontSize: 18, fontWeight: '800', color: colors.navy900 },
  sub: { fontSize: 12.5, color: colors.gray600, marginTop: 3 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  card: { flexBasis: '48%', flexGrow: 1, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: spacing.md },
  cardR: { fontSize: 10.5, fontWeight: '800', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardV: { fontSize: 22, fontWeight: '800', color: colors.navy900, marginTop: 4 },
  cardL: { fontSize: 11, color: colors.gray600, marginTop: 2 },
  nota: { fontSize: 11.5, color: colors.gray600, marginTop: spacing.sm, lineHeight: 16 },
  blocoMapa: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: spacing.md, marginTop: spacing.lg },
  mapaTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapaTitulo: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.navy900 },
  link: { color: AZUL, fontWeight: '800' },
});
