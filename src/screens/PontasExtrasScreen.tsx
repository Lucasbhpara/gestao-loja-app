import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  Image,
  TextInput,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import {
  PontaExtra,
  ProdutoPonta,
  MAX_PRODUTOS_POR_PONTA,
  buscarPontas,
  buscarTodosProdutos,
  criarPonta,
  editarPonta,
  removerPonta,
  criarProduto,
  editarProduto,
  removerProduto,
  enviarFotoProdutoPonta,
} from '../data/pontasExtrasApi';

// Pontas e Pontos Extras: diferente do Mapa da Loja (que mostra ONDE cada
// ponta fica), aqui mostra O QUE está montado em cada uma agora — até 4
// produtos, cada um com foto e/ou nome, empilhados como os níveis reais de
// uma prateleira. Qualquer colaborador consulta; só administrador cria,
// edita e apaga (tanto aqui no app, tirando foto na hora, quanto no portal).
export default function PontasExtrasScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const souAdmin = !!usuarioAtual?.isAdmin;

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pontas, setPontas] = useState<PontaExtra[]>([]);
  const [produtos, setProdutos] = useState<ProdutoPonta[]>([]);

  const [novaPontaVisivel, setNovaPontaVisivel] = useState(false);
  const [pontaEditando, setPontaEditando] = useState<PontaExtra | null>(null);
  const [produtoEditando, setProdutoEditando] = useState<ProdutoPonta | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<ProdutoPonta | null>(null);

  function carregar() {
    Promise.all([buscarPontas(), buscarTodosProdutos()])
      .then(([listaPontas, listaProdutos]) => {
        setPontas(listaPontas);
        setProdutos(listaProdutos);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar as pontas.'))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  function produtosDaPonta(pontaId: string) {
    return produtos.filter((p) => p.pontaId === pontaId);
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Pontas e Pontos Extras</Text>
        {souAdmin ? (
          <TouchableOpacity
            onPress={() => setNovaPontaVisivel(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.novaPontaBotao}
          >
            <Feather name="plus" size={18} color={colors.navy700} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 26 }} />
        )}
      </View>

      {carregando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.navy700} size="large" />
        </View>
      ) : erro ? (
        <View style={styles.centro}>
          <Text style={styles.erroTexto}>{erro}</Text>
        </View>
      ) : pontas.length === 0 ? (
        <View style={styles.centro}>
          <Text style={styles.vazioTexto}>
            {souAdmin
              ? 'Ainda não há pontas cadastradas. Toque em "+" pra criar a primeira.'
              : 'Ainda não há pontas cadastradas. Peça pro administrador cadastrar no portal ou no app.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40, gap: spacing.lg }}>
          {souAdmin && (
            <Text style={styles.dica}>Toque num produto pra trocar a foto ou o nome · toque no lápis pra editar a ponta.</Text>
          )}
          {pontas.map((ponta) => (
            <PontaCard
              key={ponta.id}
              ponta={ponta}
              produtos={produtosDaPonta(ponta.id)}
              souAdmin={souAdmin}
              onEditarPonta={() => setPontaEditando(ponta)}
              onTocarProduto={(produto) => (souAdmin ? setProdutoEditando(produto) : setFotoAmpliada(produto))}
              onAdicionarProduto={async () => {
                try {
                  const ordem = produtosDaPonta(ponta.id).length;
                  const novo = await criarProduto(ponta.id, ordem);
                  setProdutos((prev) => [...prev, novo]);
                  setProdutoEditando(novo);
                } catch (e: any) {
                  Alert.alert('Não consegui adicionar', e?.message ?? 'Tenta de novo em alguns instantes.');
                }
              }}
            />
          ))}
        </ScrollView>
      )}

      {novaPontaVisivel && (
        <ModalNovaPonta
          proximaOrdem={pontas.length}
          onFechar={() => setNovaPontaVisivel(false)}
          onCriada={(nova) => {
            setPontas((prev) => [...prev, nova]);
            setNovaPontaVisivel(false);
          }}
        />
      )}

      {pontaEditando && (
        <ModalEditarPonta
          ponta={pontaEditando}
          onFechar={() => setPontaEditando(null)}
          onSalva={(atualizada) => {
            setPontas((prev) => prev.map((p) => (p.id === atualizada.id ? atualizada : p)));
            setPontaEditando(null);
          }}
          onRemovida={(id) => {
            setPontas((prev) => prev.filter((p) => p.id !== id));
            setProdutos((prev) => prev.filter((p) => p.pontaId !== id));
            setPontaEditando(null);
          }}
        />
      )}

      {produtoEditando && (
        <ModalEditarProduto
          produto={produtoEditando}
          onFechar={() => setProdutoEditando(null)}
          onSalvo={(atualizado) => {
            setProdutos((prev) => prev.map((p) => (p.id === atualizado.id ? atualizado : p)));
          }}
          onRemovido={(id) => {
            setProdutos((prev) => prev.filter((p) => p.id !== id));
            setProdutoEditando(null);
          }}
        />
      )}

      {fotoAmpliada && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setFotoAmpliada(null)}>
          <View style={styles.visorFundo}>
            <TouchableOpacity style={styles.visorFechar} onPress={() => setFotoAmpliada(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Feather name="x" size={22} color={colors.white} />
            </TouchableOpacity>
            {fotoAmpliada.fotoUrl && (
              <Image source={{ uri: fotoAmpliada.fotoUrl }} style={styles.visorImagem} resizeMode="contain" />
            )}
            {!!fotoAmpliada.nome && <Text style={styles.visorLegenda}>{fotoAmpliada.nome}</Text>}
          </View>
        </Modal>
      )}
    </View>
  );
}

function PontaCard({
  ponta,
  produtos,
  souAdmin,
  onEditarPonta,
  onTocarProduto,
  onAdicionarProduto,
}: {
  ponta: PontaExtra;
  produtos: ProdutoPonta[];
  souAdmin: boolean;
  onEditarPonta: () => void;
  onTocarProduto: (p: ProdutoPonta) => void;
  onAdicionarProduto: () => void;
}) {
  const podeAdicionar = produtos.length < MAX_PRODUTOS_POR_PONTA;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardNomeWrap}>
          <View style={styles.cardIcone}>
            <Feather name="layers" size={17} color={colors.navy700} />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.cardNome} numberOfLines={1}>{ponta.nome}</Text>
            {!!ponta.local && <Text style={styles.cardSub} numberOfLines={1}>{ponta.local}</Text>}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={styles.contagemPill}>
            <Text style={styles.contagemTexto}>
              <Text style={{ fontWeight: '800', color: colors.navy900 }}>{produtos.length}</Text>/{MAX_PRODUTOS_POR_PONTA} produtos
            </Text>
          </View>
          {souAdmin && (
            <TouchableOpacity onPress={onEditarPonta} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="edit-2" size={15} color={colors.gray600} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={{ gap: spacing.md }}>
        {produtos.length === 0 && !souAdmin && (
          <Text style={styles.pontaVaziaTexto}>Nenhum produto cadastrado nessa ponta ainda.</Text>
        )}
        {produtos.map((produto) => (
          <FaixaProduto key={produto.id} produto={produto} onPress={() => onTocarProduto(produto)} />
        ))}
        {souAdmin && podeAdicionar && (
          <TouchableOpacity style={styles.slotVazio} onPress={onAdicionarProduto}>
            <Feather name="plus" size={17} color={colors.gray600} />
            <Text style={styles.slotVazioTexto}>Adicionar produto</Text>
          </TouchableOpacity>
        )}
        {!podeAdicionar && souAdmin && (
          <Text style={styles.limiteTexto}>Limite de {MAX_PRODUTOS_POR_PONTA} produtos por ponta atingido.</Text>
        )}
      </View>
    </View>
  );
}

function FaixaProduto({ produto, onPress }: { produto: ProdutoPonta; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <View style={styles.faixaConteudo}>
        {produto.fotoUrl ? (
          <Image source={{ uri: produto.fotoUrl }} style={styles.faixaFoto} resizeMode="cover" />
        ) : (
          <View style={styles.faixaSemFoto}>
            <Feather name="camera" size={18} color={colors.gray400} />
            <Text style={styles.faixaSemFotoTexto}>Sem foto</Text>
          </View>
        )}
        {!!produto.nome && (
          <View style={styles.faixaLegenda}>
            <Text style={styles.faixaLegendaTexto} numberOfLines={1}>{produto.nome}</Text>
          </View>
        )}
      </View>
      <View style={styles.trilho} />
    </TouchableOpacity>
  );
}

function ModalNovaPonta({
  proximaOrdem,
  onFechar,
  onCriada,
}: {
  proximaOrdem: number;
  onFechar: () => void;
  onCriada: (p: PontaExtra) => void;
}) {
  const [nome, setNome] = useState('');
  const [local, setLocal] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      const nova = await criarPonta({ nome: nome.trim(), local: local.trim() || null, ordem: proximaOrdem });
      onCriada(nova);
    } catch (e: any) {
      Alert.alert('Não consegui criar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.modalFundo}>
        <View style={styles.modalCaixa}>
          <Text style={styles.modalTitulo}>Nova ponta</Text>
          <Text style={styles.modalLabel}>Nome</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Ex.: Ponta 1"
            placeholderTextColor={colors.gray400}
            value={nome}
            onChangeText={setNome}
          />
          <Text style={styles.modalLabel}>Local (opcional)</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Ex.: Corredor 3 — entrada"
            placeholderTextColor={colors.gray400}
            value={local}
            onChangeText={setLocal}
          />
          <View style={styles.modalBotoes}>
            <TouchableOpacity style={styles.modalBotaoSecundario} onPress={onFechar} disabled={salvando}>
              <Text style={styles.modalBotaoSecundarioTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBotaoPrimario, (!nome.trim() || salvando) && styles.modalBotaoDesabilitado]}
              onPress={salvar}
              disabled={!nome.trim() || salvando}
            >
              {salvando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.modalBotaoPrimarioTexto}>Criar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ModalEditarPonta({
  ponta,
  onFechar,
  onSalva,
  onRemovida,
}: {
  ponta: PontaExtra;
  onFechar: () => void;
  onSalva: (p: PontaExtra) => void;
  onRemovida: (id: string) => void;
}) {
  const [nome, setNome] = useState(ponta.nome);
  const [local, setLocal] = useState(ponta.local ?? '');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      await editarPonta(ponta.id, { nome: nome.trim(), local: local.trim() || null });
      onSalva({ ...ponta, nome: nome.trim(), local: local.trim() || null });
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao() {
    Alert.alert('Remover ponta', `Remover "${ponta.nome}" e os produtos dela?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await removerPonta(ponta.id);
            onRemovida(ponta.id);
          } catch (e: any) {
            Alert.alert('Não consegui remover', e?.message ?? 'Tenta de novo em alguns instantes.');
          }
        },
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.modalFundo}>
        <View style={styles.modalCaixa}>
          <Text style={styles.modalTitulo}>Editar ponta</Text>
          <Text style={styles.modalLabel}>Nome</Text>
          <TextInput style={styles.modalInput} value={nome} onChangeText={setNome} placeholderTextColor={colors.gray400} />
          <Text style={styles.modalLabel}>Local (opcional)</Text>
          <TextInput style={styles.modalInput} value={local} onChangeText={setLocal} placeholderTextColor={colors.gray400} />
          <View style={styles.modalBotoes}>
            <TouchableOpacity style={styles.modalBotaoSecundario} onPress={onFechar} disabled={salvando}>
              <Text style={styles.modalBotaoSecundarioTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBotaoPrimario, (!nome.trim() || salvando) && styles.modalBotaoDesabilitado]}
              onPress={salvar}
              disabled={!nome.trim() || salvando}
            >
              {salvando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.modalBotaoPrimarioTexto}>Salvar</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.modalExcluir} onPress={confirmarExclusao} disabled={salvando}>
            <Feather name="trash-2" size={14} color={colors.red500} />
            <Text style={styles.modalExcluirTexto}>Remover esta ponta</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ModalEditarProduto({
  produto,
  onFechar,
  onSalvo,
  onRemovido,
}: {
  produto: ProdutoPonta;
  onFechar: () => void;
  onSalvo: (p: ProdutoPonta) => void;
  onRemovido: (id: string) => void;
}) {
  const [nome, setNome] = useState(produto.nome ?? '');
  const [fotoUrl, setFotoUrl] = useState(produto.fotoUrl);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function escolherFoto() {
    Alert.alert('Foto do produto', 'Como você quer adicionar a foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto agora', onPress: tirarFoto },
      { text: 'Escolher da galeria', onPress: escolherDaGaleria },
    ]);
  }

  async function tirarFoto() {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Sem permissão', 'Precisa liberar o acesso à câmera nas configurações do celular.');
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!resultado.canceled && resultado.assets?.[0]) {
      await enviarEsalvarFoto(resultado.assets[0].uri);
    }
  }

  async function escolherDaGaleria() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Sem permissão', 'Precisa liberar o acesso às fotos nas configurações do celular.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!resultado.canceled && resultado.assets?.[0]) {
      await enviarEsalvarFoto(resultado.assets[0].uri);
    }
  }

  async function enviarEsalvarFoto(uriLocal: string) {
    setEnviandoFoto(true);
    try {
      const url = await enviarFotoProdutoPonta(uriLocal);
      await editarProduto(produto.id, { nome: produto.nome, fotoUrl: url });
      setFotoUrl(url);
      onSalvo({ ...produto, nome: produto.nome, fotoUrl: url });
    } catch (e: any) {
      Alert.alert('Não consegui enviar a foto', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function salvarNome() {
    setSalvando(true);
    try {
      await editarProduto(produto.id, { nome: nome.trim() || null });
      onSalvo({ ...produto, nome: nome.trim() || null, fotoUrl });
      onFechar();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarExclusao() {
    Alert.alert('Remover produto', 'Remover este produto da ponta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await removerProduto(produto.id);
            onRemovido(produto.id);
          } catch (e: any) {
            Alert.alert('Não consegui remover', e?.message ?? 'Tenta de novo em alguns instantes.');
          }
        },
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <View style={styles.modalFundo}>
        <View style={styles.modalCaixa}>
          <Text style={styles.modalTitulo}>Editar produto</Text>

          <TouchableOpacity style={styles.previewFoto} onPress={escolherFoto} disabled={enviandoFoto}>
            {enviandoFoto ? (
              <ActivityIndicator color={colors.navy700} />
            ) : fotoUrl ? (
              <Image source={{ uri: fotoUrl }} style={styles.previewFotoImagem} resizeMode="cover" />
            ) : (
              <>
                <Feather name="camera" size={22} color={colors.gray400} />
                <Text style={styles.previewFotoTexto}>Adicionar foto</Text>
              </>
            )}
          </TouchableOpacity>
          {!!fotoUrl && !enviandoFoto && (
            <TouchableOpacity onPress={escolherFoto}>
              <Text style={styles.trocarFotoTexto}>Trocar foto</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.modalLabel}>Nome do produto (opcional)</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Ex.: Papel toalha Social Clean"
            placeholderTextColor={colors.gray400}
            value={nome}
            onChangeText={setNome}
          />

          <View style={styles.modalBotoes}>
            <TouchableOpacity style={styles.modalBotaoSecundario} onPress={onFechar} disabled={salvando}>
              <Text style={styles.modalBotaoSecundarioTexto}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBotaoPrimario, salvando && styles.modalBotaoDesabilitado]}
              onPress={salvarNome}
              disabled={salvando}
            >
              {salvando ? <ActivityIndicator color={colors.white} /> : <Text style={styles.modalBotaoPrimarioTexto}>Salvar</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.modalExcluir} onPress={confirmarExclusao} disabled={salvando || enviandoFoto}>
            <Feather name="trash-2" size={14} color={colors.red500} />
            <Text style={styles.modalExcluirTexto}>Remover este produto</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
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
  novaPontaBotao: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gray50,
    alignItems: 'center', justifyContent: 'center',
  },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  erroTexto: { color: colors.red500, fontSize: 13, textAlign: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  dica: { color: colors.gray600, fontSize: 12, marginBottom: -spacing.xs },

  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray100,
    padding: spacing.lg, gap: spacing.lg,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardNomeWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  cardIcone: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: colors.gray50,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardNome: { fontSize: 15, fontWeight: '700', color: colors.navy900 },
  cardSub: { fontSize: 11, color: colors.gray600, marginTop: 1 },
  contagemPill: {
    backgroundColor: colors.gray50, borderRadius: radius.full, borderWidth: 1, borderColor: colors.gray100,
    paddingVertical: 3, paddingHorizontal: 9,
  },
  contagemTexto: { fontSize: 10.5, fontWeight: '600', color: colors.gray600 },
  pontaVaziaTexto: { fontSize: 12.5, color: colors.gray600, lineHeight: 18 },

  faixaConteudo: {
    height: 106, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.gray50,
    borderWidth: 1, borderColor: colors.gray100, position: 'relative',
  },
  faixaFoto: { width: '100%', height: '100%' },
  faixaSemFoto: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  faixaSemFotoTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray400 },
  faixaLegenda: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(18,27,74,0.72)', paddingVertical: 7, paddingHorizontal: 12,
  },
  faixaLegendaTexto: { color: colors.white, fontSize: 12, fontWeight: '700' },
  trilho: {
    height: 6, marginTop: -1, borderRadius: 3, backgroundColor: colors.gray400,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },

  slotVazio: {
    height: 76, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.gray100, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm,
  },
  slotVazioTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  limiteTexto: { fontSize: 11.5, color: colors.gray400, textAlign: 'center' },

  visorFundo: { flex: 1, backgroundColor: 'rgba(18,27,74,0.96)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  visorFechar: { position: 'absolute', top: 56, right: spacing.xl, zIndex: 2 },
  visorImagem: { width: '100%', height: '70%' },
  visorLegenda: { color: colors.white, fontSize: 14, fontWeight: '700', marginTop: spacing.lg, textAlign: 'center' },

  modalFundo: { flex: 1, backgroundColor: 'rgba(18,27,74,0.55)', justifyContent: 'flex-end' },
  modalCaixa: {
    backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.xxl, gap: spacing.sm, paddingBottom: 40,
  },
  modalTitulo: { fontSize: 17, fontWeight: '800', color: colors.navy900, marginBottom: spacing.sm },
  modalLabel: { fontSize: 12, fontWeight: '600', color: colors.gray600, marginTop: spacing.sm },
  modalInput: {
    borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.sm, paddingHorizontal: spacing.md,
    paddingVertical: 10, fontSize: 14, color: colors.navy900, backgroundColor: colors.gray50,
  },
  modalBotoes: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalBotaoSecundario: {
    flex: 1, paddingVertical: 12, borderRadius: radius.sm, alignItems: 'center',
    backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.gray100,
  },
  modalBotaoSecundarioTexto: { fontSize: 13.5, fontWeight: '700', color: colors.gray600 },
  modalBotaoPrimario: { flex: 1, paddingVertical: 12, borderRadius: radius.sm, alignItems: 'center', backgroundColor: colors.navy700 },
  modalBotaoDesabilitado: { opacity: 0.5 },
  modalBotaoPrimarioTexto: { fontSize: 13.5, fontWeight: '700', color: colors.white },
  modalExcluir: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.lg, padding: spacing.sm },
  modalExcluirTexto: { fontSize: 12.5, fontWeight: '700', color: colors.red500 },

  previewFoto: {
    height: 140, borderRadius: radius.md, backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.gray100,
    alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden', marginTop: spacing.sm,
  },
  previewFotoImagem: { width: '100%', height: '100%' },
  previewFotoTexto: { fontSize: 12.5, fontWeight: '600', color: colors.gray400 },
  trocarFotoTexto: { fontSize: 12.5, fontWeight: '700', color: colors.navy700, textAlign: 'center', marginTop: 6 },
});
