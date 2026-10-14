import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import { pegarLocalizacaoSegura } from '../lib/localizacao';
import { rodandoNaWeb } from '../lib/plataforma';
import {
  Concorrente,
  ItemPesquisa,
  PesquisaEnviada,
  PesquisaLocal,
  ProdutoLoja,
  TEXTO_SITUACAO,
  acharPorCodigoBarras,
  baixarCatalogo,
  buscarConcorrentes,
  buscarPesquisaCompleta,
  buscarPesquisasEnviadas,
  buscarPorNome,
  carregarCatalogoGuardado,
  carregarPendentes,
  carregarPesquisaAtual,
  comparar,
  compartilharPlanilha,
  criarConcorrente,
  enviarPendentes,
  enviarPesquisa,
  excluirPesquisa,
  gerarId,
  guardarComoPendente,
  resumoPesquisa,
  salvarPesquisaAtual,
} from '../data/pesquisaPrecoApi';

// Pesquisa de preço nos concorrentes (só administradores). Ver
// src/data/pesquisaPrecoApi.ts.

const AZUL = '#2F7BFF';
const reais = (v: number | null | undefined) =>
  v == null ? '—' : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numeroBR = (t: string): number | null => {
  const limpo = t.replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(limpo);
  return limpo && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};
const dataHora = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const COR_SITUACAO = {
  mais_caro: { cor: '#C5392F', fundo: '#FBDEDC' },
  mais_barato: { cor: '#178553', fundo: '#DFF3E8' },
  igual: { cor: colors.gray600, fundo: colors.gray100 },
  sem_produto: { cor: '#6A4BD6', fundo: '#ECE7FB' },
};

export default function PesquisaPrecoScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const [carregando, setCarregando] = useState(true);
  const [atual, setAtual] = useState<PesquisaLocal | null>(null);
  const [pendentes, setPendentes] = useState<PesquisaLocal[]>([]);
  const [enviadas, setEnviadas] = useState<PesquisaEnviada[]>([]);
  const [semInternet, setSemInternet] = useState(false);
  const [catalogo, setCatalogo] = useState<{ produtos: ProdutoLoja[]; baixadoEm: string } | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [escolhendoConcorrente, setEscolhendoConcorrente] = useState(false);
  const [aberta, setAberta] = useState<PesquisaLocal | null>(null); // detalhe de uma já enviada
  const [abrindoId, setAbrindoId] = useState<string | null>(null);

  async function carregar() {
    const [a, pend, cat] = await Promise.all([carregarPesquisaAtual(), carregarPendentes(), carregarCatalogoGuardado()]);
    setAtual(a);
    setPendentes(pend);
    setCatalogo(cat);
    try {
      if (pend.length) {
        await enviarPendentes();
        setPendentes(await carregarPendentes());
      }
      setEnviadas(await buscarPesquisasEnviadas());
      setSemInternet(false);
      // Estoque guardado com mais de 12h: atualiza sozinho.
      if (!cat || Date.now() - new Date(cat.baixadoEm).getTime() > 12 * 3600 * 1000) {
        setBaixando(true);
        setCatalogo(await baixarCatalogo().finally(() => setBaixando(false)));
      }
    } catch {
      setSemInternet(true);
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function iniciar(c: Concorrente) {
    const nova: PesquisaLocal = {
      id: gerarId(),
      concorrenteId: c.id,
      concorrenteNome: c.nome,
      feitaPorNome: usuarioAtual?.nome ?? '',
      iniciadaEm: new Date().toISOString(),
      lat: null,
      lng: null,
      itens: [],
      finalizada: false,
    };
    setEscolhendoConcorrente(false);
    setAtual(nova);
    await salvarPesquisaAtual(nova);
    pegarLocalizacaoSegura({ endereco: false }).then(async (loc) => {
      if (!loc) return;
      const p = await carregarPesquisaAtual();
      if (p && p.id === nova.id) {
        const comLocal = { ...p, lat: loc.lat, lng: loc.lng };
        await salvarPesquisaAtual(comLocal);
        setAtual((x) => (x && x.id === nova.id ? { ...x, lat: loc.lat, lng: loc.lng } : x));
      }
    });
  }

  async function abrirEnviada(id: string) {
    setAbrindoId(id);
    try {
      setAberta(await buscarPesquisaCompleta(id));
    } catch (e: any) {
      Alert.alert('Não consegui abrir', e?.message ?? 'Verifique a internet.');
    } finally {
      setAbrindoId(null);
    }
  }

  if (atual && !atual.finalizada) {
    return (
      <PesquisaEmAndamento
        pesquisa={atual}
        catalogo={catalogo}
        onMudou={(p) => {
          setAtual(p);
          salvarPesquisaAtual(p);
        }}
        onVoltar={() => {
          setAtual(null);
          carregar();
        }}
        onFinalizada={() => {
          setAtual(null);
          carregar();
        }}
        onDescartar={async () => {
          await salvarPesquisaAtual(null);
          setAtual(null);
        }}
      />
    );
  }

  if (aberta) {
    return (
      <DetalhePesquisa
        pesquisa={aberta}
        onVoltar={() => setAberta(null)}
        onExcluida={() => {
          setAberta(null);
          carregar();
        }}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo="Pesquisa de Preço" subtitulo="Concorrentes × preço da loja" icone="search" onVoltar={onVoltar} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : (
          <>
            {atual === null && (
              <TouchableOpacity style={styles.btnPrincipal} onPress={() => setEscolhendoConcorrente(true)} activeOpacity={0.85}>
                <Feather name="plus" size={20} color={colors.white} />
                <Text style={styles.btnPrincipalTexto}>Nova pesquisa</Text>
              </TouchableOpacity>
            )}

            <View style={styles.infoLinha}>
              <Feather name={catalogo ? 'check-circle' : 'alert-circle'} size={14} color={catalogo ? '#178553' : '#B4650E'} />
              <Text style={styles.infoTexto}>
                {baixando
                  ? 'Baixando os preços da loja…'
                  : catalogo
                  ? `Preços da loja guardados no celular (${catalogo.produtos.length.toLocaleString('pt-BR')} produtos) — funciona sem internet.`
                  : 'Abra com internet uma vez para baixar os preços da loja.'}
              </Text>
            </View>

            {pendentes.length > 0 && (
              <View style={styles.avisoPendente}>
                <Feather name="upload-cloud" size={18} color="#B4650E" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.avisoTitulo}>{pendentes.length} pesquisa(s) esperando internet</Text>
                  <Text style={styles.avisoTexto}>Está tudo salvo no celular. Puxe a tela para baixo para tentar enviar.</Text>
                </View>
              </View>
            )}

            <Text style={styles.secao}>Pesquisas feitas</Text>
            {semInternet && <Text style={styles.vazio}>Sem internet agora — o histórico aparece quando voltar.</Text>}
            {!semInternet && enviadas.length === 0 && <Text style={styles.vazio}>Nenhuma pesquisa ainda. Toque em "Nova pesquisa" no concorrente.</Text>}
            {enviadas.length > 0 && (
              <View style={styles.cartao}>
                {enviadas.map((p, i) => (
                  <TouchableOpacity key={p.id} style={[styles.linha, i > 0 && styles.divisor]} onPress={() => abrirEnviada(p.id)} activeOpacity={0.7}>
                    <View style={styles.iconeCirculo}>
                      <Feather name="shopping-bag" size={16} color={AZUL} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linhaTitulo}>{p.concorrenteNome}</Text>
                      <Text style={styles.linhaSub}>
                        {dataHora(p.iniciadaEm)} · {p.totalItens} {p.totalItens === 1 ? 'item' : 'itens'}
                        {p.feitaPorNome ? ` · ${p.feitaPorNome.split(' ')[0]}` : ''}
                      </Text>
                    </View>
                    {abrindoId === p.id ? <ActivityIndicator size="small" color={colors.navy700} /> : <Feather name="chevron-right" size={18} color={colors.gray400} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <EscolherConcorrente visivel={escolhendoConcorrente} onFechar={() => setEscolhendoConcorrente(false)} onEscolher={iniciar} />
    </View>
  );
}

// =============================================================================
// Escolher (ou cadastrar) o concorrente
// =============================================================================
function EscolherConcorrente({ visivel, onFechar, onEscolher }: { visivel: boolean; onFechar: () => void; onEscolher: (c: Concorrente) => void }) {
  const [lista, setLista] = useState<Concorrente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [novaCidade, setNovaCidade] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!visivel) return;
    setErro(null);
    buscarConcorrentes()
      .then(setLista)
      .catch(() => setErro('Sem internet: para escolher o concorrente a primeira vez precisa de sinal. Se já cadastrou, tente de novo perto da porta.'));
  }, [visivel]);

  async function cadastrar() {
    if (!novoNome.trim()) return;
    setSalvando(true);
    try {
      const c = await criarConcorrente(novoNome, novaCidade);
      setNovoNome('');
      setNovaCidade('');
      onEscolher(c);
    } catch (e: any) {
      Alert.alert('Não consegui cadastrar', e?.message ?? 'Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible={visivel} animationType="slide" transparent onRequestClose={onFechar}>
      <KeyboardAvoidingView style={styles.modalFundo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.folha}>
          <View style={styles.folhaTopo}>
            <Text style={styles.folhaTitulo}>Em qual concorrente?</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={12} accessibilityLabel="Fechar">
              <Feather name="x" size={22} color={colors.gray600} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
            {erro && <Text style={styles.erroTexto}>{erro}</Text>}
            {!erro && lista === null && <ActivityIndicator color={colors.navy700} style={{ marginVertical: spacing.lg }} />}
            {lista?.map((c) => (
              <TouchableOpacity key={c.id} style={styles.opcao} onPress={() => onEscolher(c)}>
                <Feather name="map-pin" size={16} color={AZUL} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.opcaoTexto}>{c.nome}</Text>
                  {c.cidade ? <Text style={styles.linhaSub}>{c.cidade}</Text> : null}
                </View>
                <Feather name="chevron-right" size={18} color={colors.gray400} />
              </TouchableOpacity>
            ))}
            <Text style={[styles.secao, { marginTop: spacing.lg }]}>Novo concorrente</Text>
            <TextInput style={styles.input} placeholder="Nome (ex.: Supermercado Exemplo)" placeholderTextColor={colors.gray400} value={novoNome} onChangeText={setNovoNome} />
            <TextInput style={styles.input} placeholder="Cidade ou bairro (opcional)" placeholderTextColor={colors.gray400} value={novaCidade} onChangeText={setNovaCidade} />
            <TouchableOpacity style={[styles.btnPrincipal, (!novoNome.trim() || salvando) && { opacity: 0.5 }]} disabled={!novoNome.trim() || salvando} onPress={cadastrar}>
              {salvando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.btnPrincipalTexto}>Cadastrar e começar</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// =============================================================================
// Pesquisa em andamento (no concorrente)
// =============================================================================
function PesquisaEmAndamento({
  pesquisa,
  catalogo,
  onMudou,
  onVoltar,
  onFinalizada,
  onDescartar,
}: {
  pesquisa: PesquisaLocal;
  catalogo: { produtos: ProdutoLoja[] } | null;
  onMudou: (p: PesquisaLocal) => void;
  onVoltar: () => void;
  onFinalizada: () => void;
  onDescartar: () => void;
}) {
  const [editando, setEditando] = useState<ItemPesquisa | 'novo-bipar' | 'novo-nome' | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const r = resumoPesquisa(pesquisa.itens);

  function salvarItem(it: ItemPesquisa) {
    const existe = pesquisa.itens.some((x) => x.id === it.id);
    onMudou({ ...pesquisa, itens: existe ? pesquisa.itens.map((x) => (x.id === it.id ? it : x)) : [it, ...pesquisa.itens] });
    setEditando(null);
  }
  function removerItem(id: string) {
    onMudou({ ...pesquisa, itens: pesquisa.itens.filter((x) => x.id !== id) });
    setEditando(null);
  }

  function confirmarDescarte() {
    Alert.alert('Descartar pesquisa?', `Os ${pesquisa.itens.length} itens anotados serão apagados do celular.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: onDescartar },
    ]);
  }

  async function finalizar() {
    if (!pesquisa.itens.length) return Alert.alert('Nada anotado', 'Anote pelo menos um produto antes de finalizar.');
    setFinalizando(true);
    const final = { ...pesquisa, finalizada: true };
    await guardarComoPendente(final);
    await salvarPesquisaAtual(null);
    let enviou = true;
    try {
      await enviarPesquisa(final);
    } catch {
      enviou = false;
    }
    try {
      await compartilharPlanilha(final);
    } catch (e: any) {
      Alert.alert('Planilha', e?.message ?? 'Não consegui gerar a planilha.');
    }
    setFinalizando(false);
    if (!enviou) Alert.alert('Salvo no celular', 'Sem internet agora: a pesquisa fica guardada e sobe sozinha quando voltar o sinal.');
    onFinalizada();
  }

  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo={pesquisa.concorrenteNome} subtitulo={`Pesquisa de preço · ${pesquisa.itens.length} ${pesquisa.itens.length === 1 ? 'item' : 'itens'}`} icone="search" onVoltar={onVoltar} />
      <View style={styles.acoesTopo}>
        <TouchableOpacity style={[styles.btnAcao, { backgroundColor: AZUL }]} onPress={() => setEditando('novo-bipar')} activeOpacity={0.85}>
          <Feather name="maximize" size={18} color={colors.white} />
          <Text style={styles.btnAcaoTexto}>Bipar código</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnAcao, { backgroundColor: colors.navy700 }]} onPress={() => setEditando('novo-nome')} activeOpacity={0.85}>
          <Feather name="edit-3" size={18} color={colors.white} />
          <Text style={styles.btnAcaoTexto}>Digitar produto</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        {!catalogo && (
          <View style={styles.avisoPendente}>
            <Feather name="alert-circle" size={18} color="#B4650E" />
            <Text style={[styles.avisoTexto, { flex: 1 }]}>Os preços da loja ainda não foram baixados. Dá para anotar, mas o preço da loja só aparece depois.</Text>
          </View>
        )}
        {pesquisa.itens.length > 0 && (
          <View style={styles.resumo}>
            <Resumo rotulo="Loja mais cara" valor={r.maisCaro} cor="#C5392F" />
            <Resumo rotulo="Mais barata" valor={r.maisBarato} cor="#178553" />
            <Resumo rotulo="Igual" valor={r.igual} cor={colors.gray600} />
            <Resumo rotulo="Não temos" valor={r.semProduto} cor="#6A4BD6" />
          </View>
        )}
        {pesquisa.itens.length === 0 ? (
          <View style={styles.vazioGrande}>
            <Feather name="maximize" size={34} color={colors.gray400} />
            <Text style={styles.vazioTitulo}>Bipe o primeiro produto</Text>
            <Text style={styles.vazio}>
              Aponte a câmera para o código de barras: o app acha o seu produto e você só digita o preço do concorrente. Produto sem código ou que você não vende: "Digitar produto".
            </Text>
          </View>
        ) : (
          <View style={styles.cartao}>
            {pesquisa.itens.map((it, i) => (
              <LinhaItem key={it.id} item={it} primeira={i === 0} onPress={() => setEditando(it)} />
            ))}
          </View>
        )}
        <TouchableOpacity onPress={confirmarDescarte} style={{ alignSelf: 'center', padding: spacing.lg }}>
          <Text style={{ color: colors.red500, fontWeight: '700' }}>Descartar pesquisa</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.rodape}>
        <TouchableOpacity style={[styles.btnPrincipal, { marginBottom: 0 }, (finalizando || !pesquisa.itens.length) && { opacity: 0.5 }]} disabled={finalizando || !pesquisa.itens.length} onPress={finalizar}>
          {finalizando ? <ActivityIndicator color={colors.white} /> : <Feather name="send" size={18} color={colors.white} />}
          <Text style={styles.btnPrincipalTexto}>Finalizar e gerar planilha</Text>
        </TouchableOpacity>
      </View>

      {editando && (
        <EditorItem
          inicial={typeof editando === 'string' ? null : editando}
          modo={editando === 'novo-bipar' ? 'bipar' : 'nome'}
          catalogo={catalogo}
          jaAnotados={pesquisa.itens}
          onFechar={() => setEditando(null)}
          onSalvar={salvarItem}
          onRemover={typeof editando === 'string' ? undefined : () => removerItem(editando.id)}
        />
      )}
    </View>
  );
}

function Resumo({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <View style={styles.resumoBox}>
      <Text style={[styles.resumoValor, { color: cor }]}>{valor}</Text>
      <Text style={styles.resumoRotulo}>{rotulo}</Text>
    </View>
  );
}

function LinhaItem({ item, primeira, onPress }: { item: ItemPesquisa; primeira: boolean; onPress?: () => void }) {
  const c = comparar(item);
  const visual = COR_SITUACAO[c.situacao];
  return (
    <TouchableOpacity style={[styles.item, !primeira && styles.divisor]} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemNome}>{item.produtoConcorrente}</Text>
        {item.produtoLoja && (item.similar || item.produtoLoja !== item.produtoConcorrente) ? (
          <Text style={styles.linhaSub}>
            {item.similar ? 'Similar: ' : 'Loja: '}
            {item.produtoLoja}
          </Text>
        ) : null}
        <Text style={styles.itemPrecos}>
          Concorrente <Text style={styles.forte}>{reais(item.precoConcorrente)}</Text> · Loja <Text style={styles.forte}>{reais(item.precoLoja)}</Text>
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <View style={[styles.badge, { backgroundColor: visual.fundo }]}>
          <Text style={[styles.badgeTexto, { color: visual.cor }]}>
            {c.difPct == null ? TEXTO_SITUACAO[c.situacao] : `${c.difPct > 0 ? '+' : ''}${c.difPct.toFixed(1).replace('.', ',')}%`}
          </Text>
        </View>
        {item.fotoLocal || item.fotoUrl ? <Feather name="camera" size={13} color={colors.gray400} /> : null}
      </View>
    </TouchableOpacity>
  );
}

// =============================================================================
// Anotar um produto: bipar ou digitar
// =============================================================================
function EditorItem({
  inicial,
  modo,
  catalogo,
  jaAnotados,
  onFechar,
  onSalvar,
  onRemover,
}: {
  inicial: ItemPesquisa | null;
  modo: 'bipar' | 'nome';
  catalogo: { produtos: ProdutoLoja[] } | null;
  jaAnotados: ItemPesquisa[];
  onFechar: () => void;
  onSalvar: (it: ItemPesquisa) => void;
  onRemover?: () => void;
}) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [lendo, setLendo] = useState(modo === 'bipar' && !inicial);
  const [codigo, setCodigo] = useState<string | null>(inicial?.codigoBarras ?? null);
  const [nomeConc, setNomeConc] = useState(inicial?.produtoConcorrente ?? '');
  const [precoTxt, setPrecoTxt] = useState(inicial ? inicial.precoConcorrente.toFixed(2).replace('.', ',') : '');
  const [loja, setLoja] = useState<ProdutoLoja | null>(
    inicial?.codigoInterno
      ? { codigoInterno: inicial.codigoInterno, codigoBarras: null, produto: inicial.produtoLoja ?? '', precoVenda: inicial.precoLoja, setor: inicial.setor }
      : null
  );
  const [similar, setSimilar] = useState(inicial?.similar ?? false);
  const [busca, setBusca] = useState('');
  const [buscandoSimilar, setBuscandoSimilar] = useState(modo === 'nome' && !inicial);
  const [foto, setFoto] = useState<string | null>(inicial?.fotoLocal ?? inicial?.fotoUrl ?? null);
  const [obs, setObs] = useState(inicial?.observacao ?? '');
  const lido = useRef(false);
  const produtos = catalogo?.produtos ?? [];
  const resultados = useMemo(() => (busca.trim().length >= 2 ? buscarPorNome(produtos, busca) : []), [busca, produtos]);

  function aoLer(dado: string) {
    if (lido.current) return;
    lido.current = true;
    const cod = dado.trim();
    setCodigo(cod);
    setLendo(false);
    const p = acharPorCodigoBarras(produtos, cod);
    const repetido = jaAnotados.find((x) => x.codigoBarras && x.codigoBarras === cod);
    if (repetido) Alert.alert('Já anotado', `${repetido.produtoConcorrente} já está na pesquisa. Toque nele na lista para mudar o preço.`);
    if (p) {
      setLoja(p);
      setNomeConc(p.produto);
      setSimilar(false);
    } else {
      setLoja(null);
      setBuscandoSimilar(true);
    }
  }

  async function tirarFoto() {
    if (rodandoNaWeb) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Sem permissão', 'Libere a câmera nas configurações do celular.');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (r.canceled || !r.assets?.[0]) return;
    let uri = r.assets[0].uri;
    try {
      const FileSystem = await import('expo-file-system/legacy');
      const pasta = `${FileSystem.documentDirectory}pesquisa-preco/`;
      await FileSystem.makeDirectoryAsync(pasta, { intermediates: true }).catch(() => {});
      const destino = `${pasta}${gerarId()}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: destino });
      uri = destino;
    } catch {
      // usa a original
    }
    setFoto(uri);
  }

  const preco = numeroBR(precoTxt);
  const podeSalvar = !!preco && !!nomeConc.trim();

  function salvar() {
    if (!preco || !nomeConc.trim()) return;
    onSalvar({
      id: inicial?.id ?? gerarId(),
      produtoConcorrente: nomeConc.trim().toUpperCase(),
      codigoBarras: codigo,
      precoConcorrente: preco,
      codigoInterno: loja?.codigoInterno ?? null,
      produtoLoja: loja?.produto ?? null,
      precoLoja: loja?.precoVenda ?? null,
      setor: loja?.setor ?? null,
      similar: !!loja && similar,
      fotoLocal: foto && !foto.startsWith('http') ? foto : null,
      fotoUrl: foto && foto.startsWith('http') ? foto : null,
      observacao: obs.trim() || null,
      criadoEm: inicial?.criadoEm ?? new Date().toISOString(),
    });
  }

  const c = preco && loja?.precoVenda ? comparar({ precoConcorrente: preco, precoLoja: loja.precoVenda } as ItemPesquisa) : null;

  return (
    <Modal visible animationType="slide" onRequestClose={onFechar}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.editorTopo}>
          <TouchableOpacity onPress={onFechar} hitSlop={12} style={styles.editorFechar} accessibilityLabel="Fechar">
            <Feather name="x" size={22} color={colors.navy900} />
          </TouchableOpacity>
          <Text style={styles.folhaTitulo}>{inicial ? 'Editar produto' : 'Anotar produto'}</Text>
          <View style={{ width: 44 }} />
        </View>

        {lendo ? (
          <View style={styles.flex}>
            {!permissao ? (
              <ActivityIndicator style={{ marginTop: 40 }} />
            ) : !permissao.granted ? (
              <View style={{ padding: spacing.xl, gap: spacing.md }}>
                <Text style={styles.vazio}>Precisa liberar a câmera para bipar.</Text>
                <TouchableOpacity style={styles.btnPrincipal} onPress={pedirPermissao}>
                  <Text style={styles.btnPrincipalTexto}>Permitir câmera</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setLendo(false); setBuscandoSimilar(true); }}>
                  <Text style={styles.link}>Digitar o produto</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.flex}>
                <CameraView
                  style={styles.flex}
                  facing="back"
                  onBarcodeScanned={({ data }: { data: string }) => aoLer(data)}
                  barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
                />
                <View style={styles.miraCamera} pointerEvents="none" />
                <TouchableOpacity style={styles.btnSemCodigo} onPress={() => { setLendo(false); setBuscandoSimilar(true); }}>
                  <Text style={styles.btnSemCodigoTexto}>Sem código? Digitar o produto</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {codigo && !loja && (
              <View style={styles.avisoPendente}>
                <Feather name="info" size={16} color="#B4650E" />
                <Text style={[styles.avisoTexto, { flex: 1 }]}>O código {codigo} não está no estoque da loja. Escreva o nome e, se tiver, escolha um similar nosso.</Text>
              </View>
            )}

            <Text style={styles.rotulo}>Produto no concorrente</Text>
            <TextInput style={styles.input} value={nomeConc} onChangeText={setNomeConc} placeholder="Ex.: ARROZ TIO JOÃO 5KG" placeholderTextColor={colors.gray400} autoCapitalize="characters" />

            <Text style={styles.rotulo}>Preço no concorrente</Text>
            <TextInput
              style={[styles.input, styles.inputPreco]}
              value={precoTxt}
              onChangeText={setPrecoTxt}
              placeholder="0,00"
              placeholderTextColor={colors.gray400}
              keyboardType="decimal-pad"
              autoFocus={!!loja && !inicial}
            />

            <Text style={styles.rotulo}>Produto da loja</Text>
            {loja ? (
              <View style={styles.lojaCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNome}>{loja.produto}</Text>
                  <Text style={styles.linhaSub}>
                    Cód. {loja.codigoInterno}
                    {loja.setor ? ` · ${loja.setor}` : ''}
                  </Text>
                  <Text style={styles.lojaPreco}>{reais(loja.precoVenda)}</Text>
                </View>
                <TouchableOpacity onPress={() => { setLoja(null); setSimilar(false); setBuscandoSimilar(true); }} hitSlop={10}>
                  <Text style={styles.link}>Trocar</Text>
                </TouchableOpacity>
              </View>
            ) : buscandoSimilar ? (
              <>
                <TextInput style={styles.input} value={busca} onChangeText={setBusca} placeholder="Buscar no estoque da loja (ex.: arroz 5kg)" placeholderTextColor={colors.gray400} autoCorrect={false} />
                {!catalogo && <Text style={styles.linhaSub}>Preços da loja não baixados — abra a tela com internet.</Text>}
                {resultados.map((p) => (
                  <TouchableOpacity key={p.codigoInterno} style={styles.opcao} onPress={() => { setLoja(p); setSimilar(!!codigo && acharPorCodigoBarras([p], codigo) === null); setBusca(''); setBuscandoSimilar(false); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.opcaoTexto}>{p.produto}</Text>
                      <Text style={styles.linhaSub}>Cód. {p.codigoInterno}{p.setor ? ` · ${p.setor}` : ''}</Text>
                    </View>
                    <Text style={styles.forte}>{reais(p.precoVenda)}</Text>
                  </TouchableOpacity>
                ))}
                {busca.trim().length >= 2 && resultados.length === 0 && <Text style={styles.linhaSub}>Nada encontrado.</Text>}
                <Text style={[styles.linhaSub, { marginTop: 6 }]}>Não trabalhamos com esse nem com similar? Deixe em branco — entra como "Não temos".</Text>
              </>
            ) : (
              <TouchableOpacity onPress={() => setBuscandoSimilar(true)}>
                <Text style={styles.link}>Escolher produto da loja</Text>
              </TouchableOpacity>
            )}

            {loja && (
              <TouchableOpacity style={styles.check} onPress={() => setSimilar((v) => !v)} activeOpacity={0.8}>
                <Feather name={similar ? 'check-square' : 'square'} size={20} color={similar ? AZUL : colors.gray400} />
                <Text style={styles.checkTexto}>É um produto similar (não o mesmo)</Text>
              </TouchableOpacity>
            )}

            {c && (
              <View style={[styles.comparacao, { backgroundColor: COR_SITUACAO[c.situacao].fundo }]}>
                <Text style={[styles.comparacaoTexto, { color: COR_SITUACAO[c.situacao].cor }]}>
                  {TEXTO_SITUACAO[c.situacao]}
                  {c.difReais != null && c.situacao !== 'igual' ? ` em ${reais(Math.abs(c.difReais))} (${Math.abs(c.difPct ?? 0).toFixed(1).replace('.', ',')}%)` : ''}
                </Text>
              </View>
            )}

            <Text style={styles.rotulo}>Observação (opcional)</Text>
            <TextInput style={styles.input} value={obs} onChangeText={setObs} placeholder="Ex.: preço de oferta, leve 3 pague 2…" placeholderTextColor={colors.gray400} />

            {!rodandoNaWeb && (
              <TouchableOpacity style={styles.btnFoto} onPress={tirarFoto}>
                {foto ? <Image source={{ uri: foto }} style={styles.fotoMini} /> : <Feather name="camera" size={18} color={colors.navy700} />}
                <Text style={styles.btnFotoTexto}>{foto ? 'Trocar foto da etiqueta' : 'Foto da etiqueta (opcional)'}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.btnPrincipal, { marginTop: spacing.lg }, !podeSalvar && { opacity: 0.5 }]} disabled={!podeSalvar} onPress={salvar}>
              <Feather name="check" size={18} color={colors.white} />
              <Text style={styles.btnPrincipalTexto}>{inicial ? 'Salvar' : 'Anotar'}</Text>
            </TouchableOpacity>
            {onRemover && (
              <TouchableOpacity onPress={onRemover} style={{ alignSelf: 'center', padding: spacing.md }}>
                <Text style={{ color: colors.red500, fontWeight: '700' }}>Remover da pesquisa</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// =============================================================================
// Pesquisa já enviada
// =============================================================================
function DetalhePesquisa({ pesquisa, onVoltar, onExcluida }: { pesquisa: PesquisaLocal; onVoltar: () => void; onExcluida: () => void }) {
  const [gerando, setGerando] = useState(false);
  const r = resumoPesquisa(pesquisa.itens);

  async function baixar() {
    setGerando(true);
    try {
      await compartilharPlanilha(pesquisa);
    } catch (e: any) {
      Alert.alert('Planilha', e?.message ?? 'Não consegui gerar.');
    } finally {
      setGerando(false);
    }
  }
  function excluir() {
    Alert.alert('Excluir pesquisa?', `${pesquisa.concorrenteNome} de ${dataHora(pesquisa.iniciadaEm)} será apagada.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirPesquisa(pesquisa.id);
            onExcluida();
          } catch (e: any) {
            Alert.alert('Não consegui excluir', e?.message ?? '');
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo={pesquisa.concorrenteNome} subtitulo={`${dataHora(pesquisa.iniciadaEm)} · ${pesquisa.feitaPorNome}`} icone="search" onVoltar={onVoltar} />
      <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={styles.resumo}>
          <Resumo rotulo="Loja mais cara" valor={r.maisCaro} cor="#C5392F" />
          <Resumo rotulo="Mais barata" valor={r.maisBarato} cor="#178553" />
          <Resumo rotulo="Igual" valor={r.igual} cor={colors.gray600} />
          <Resumo rotulo="Não temos" valor={r.semProduto} cor="#6A4BD6" />
        </View>
        {r.cestaPct != null && (
          <View style={styles.cesta}>
            <Text style={styles.linhaSub}>Cesta dos itens que temos</Text>
            <Text style={styles.cestaTexto}>
              Loja {reais(r.cestaLoja)} × Concorrente {reais(r.cestaConcorrente)}
            </Text>
            <Text style={[styles.forte, { color: r.cestaPct > 0 ? '#C5392F' : '#178553' }]}>
              Loja {r.cestaPct > 0 ? 'mais cara' : r.cestaPct < 0 ? 'mais barata' : 'igual'} {Math.abs(r.cestaPct).toFixed(1).replace('.', ',')}%
            </Text>
          </View>
        )}
        <TouchableOpacity style={styles.btnPrincipal} onPress={baixar} disabled={gerando}>
          {gerando ? <ActivityIndicator color={colors.white} /> : <Feather name="download" size={18} color={colors.white} />}
          <Text style={styles.btnPrincipalTexto}>Gerar planilha para enviar</Text>
        </TouchableOpacity>
        <View style={styles.cartao}>
          {pesquisa.itens.map((it, i) => (
            <LinhaItem key={it.id} item={it} primeira={i === 0} />
          ))}
        </View>
        <TouchableOpacity onPress={excluir} style={{ alignSelf: 'center', padding: spacing.lg }}>
          <Text style={{ color: colors.red500, fontWeight: '700' }}>Excluir pesquisa</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  btnPrincipal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: AZUL, borderRadius: radius.lg, paddingVertical: 15, marginBottom: spacing.lg, minHeight: 48 },
  btnPrincipalTexto: { color: colors.white, fontWeight: '800', fontSize: 15 },
  infoLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  infoTexto: { fontSize: 12, color: colors.gray600, flex: 1 },
  avisoPendente: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: '#FFF4E3', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  avisoTitulo: { fontSize: 13, fontWeight: '700', color: colors.gray900 },
  avisoTexto: { fontSize: 12, color: '#7A4A0B', lineHeight: 17 },
  secao: { fontSize: 12, fontWeight: '800', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.sm },
  vazio: { fontSize: 13, color: colors.gray600, textAlign: 'center', lineHeight: 19, marginTop: spacing.sm },
  vazioGrande: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  vazioTitulo: { fontSize: 16, fontWeight: '800', color: colors.navy900 },
  cartao: { backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  divisor: { borderTopWidth: 1, borderTopColor: colors.gray100 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 56 },
  iconeCirculo: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E3EDFF', alignItems: 'center', justifyContent: 'center' },
  linhaTitulo: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  linhaSub: { fontSize: 12, color: colors.gray600, marginTop: 2 },
  acoesTopo: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.gray50 },
  btnAcao: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.lg, paddingVertical: 14, minHeight: 48 },
  btnAcaoTexto: { color: colors.white, fontWeight: '800', fontSize: 14 },
  resumo: { flexDirection: 'row', gap: 6, marginBottom: spacing.lg },
  resumoBox: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  resumoValor: { fontSize: 20, fontWeight: '800' },
  resumoRotulo: { fontSize: 10.5, color: colors.gray600, marginTop: 2, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  itemNome: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  itemPrecos: { fontSize: 12, color: colors.gray600, marginTop: 4 },
  forte: { fontWeight: '800', color: colors.gray900 },
  badge: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  badgeTexto: { fontSize: 11.5, fontWeight: '800' },
  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray100 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(14,27,44,0.45)', justifyContent: 'flex-end' },
  folha: { backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: spacing.lg, paddingBottom: spacing.xxl },
  folhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  folhaTitulo: { fontSize: 17, fontWeight: '800', color: colors.navy900 },
  erroTexto: { color: colors.red500, fontSize: 13, marginBottom: spacing.md },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray100, minHeight: 48 },
  opcaoTexto: { fontSize: 14, fontWeight: '600', color: colors.gray900 },
  input: { borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16, color: colors.gray900, marginBottom: spacing.sm },
  inputPreco: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  rotulo: { fontSize: 12.5, fontWeight: '700', color: colors.gray600, marginTop: spacing.md, marginBottom: 6 },
  editorTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 48, paddingBottom: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  editorFechar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  miraCamera: { position: 'absolute', left: '12%', right: '12%', top: '35%', height: 150, borderWidth: 3, borderColor: AZUL, borderRadius: 16 },
  btnSemCodigo: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 40, backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center' },
  btnSemCodigoTexto: { color: colors.navy900, fontWeight: '800', fontSize: 14 },
  lojaCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: '#CFE0FF' },
  lojaPreco: { fontSize: 16, fontWeight: '800', color: colors.navy900, marginTop: 4 },
  link: { color: AZUL, fontWeight: '700', fontSize: 14, paddingVertical: 6 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md, minHeight: 44 },
  checkTexto: { fontSize: 13.5, color: colors.gray900 },
  comparacao: { borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  comparacaoTexto: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  btnFoto: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, minHeight: 48 },
  btnFotoTexto: { fontSize: 13.5, fontWeight: '700', color: colors.navy700 },
  fotoMini: { width: 36, height: 36, borderRadius: 6 },
  cesta: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, gap: 4 },
  cestaTexto: { fontSize: 14, color: colors.gray900, fontWeight: '600' },
});
