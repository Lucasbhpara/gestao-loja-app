import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { setores, SetorKey } from '../data/employees';
import { baixarArquivo, nomeArquivoAmigavel } from '../lib/baixarArquivo';
import {
  Aviso,
  Visualizacao,
  buscarTodosAvisos,
  buscarAvisosDoSetor,
  publicarAviso,
  removerAviso,
  enviarFotoAviso,
  marcarVisualizado,
  buscarVisualizacoes,
} from '../data/avisosApi';

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes} às ${hora}:${min}`;
}

export default function AvisosScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const podeVerTodos = !!usuarioAtual?.isAdmin;
  const podeExcluir = !!usuarioAtual?.isAdmin;
  const podeVerVisualizacoes = !!usuarioAtual?.isAdmin;
  // Além do administrador, CPD e a função A.P.P também podem publicar avisos
  // (inclusive com foto).
  const podePublicar =
    !!usuarioAtual && (usuarioAtual.isAdmin || usuarioAtual.setor === 'cpd' || usuarioAtual.funcao === 'A.P.P');

  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [modo, setModo] = useState<'lista' | 'novo'>('lista');
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [urgente, setUrgente] = useState(false);
  const [setorEscolhido, setSetorEscolhido] = useState<SetorKey | null>(null);
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);

  const [visualizacoesAbertas, setVisualizacoesAbertas] = useState<
    Record<string, Visualizacao[] | 'carregando' | undefined>
  >({});
  const [baixando, setBaixando] = useState<Record<string, boolean>>({});

  async function baixarFotoAviso(a: Aviso) {
    const fotoUrl = a.fotoUrl;
    if (!fotoUrl || baixando[a.id]) return;
    setBaixando((prev) => ({ ...prev, [a.id]: true }));
    try {
      await baixarArquivo(fotoUrl, nomeArquivoAmigavel(a.titulo, fotoUrl));
    } catch (e: any) {
      Alert.alert('Não consegui baixar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setBaixando((prev) => ({ ...prev, [a.id]: false }));
    }
  }

  function carregar() {
    if (!usuarioAtual) return;
    const promessa = podeVerTodos ? buscarTodosAvisos() : buscarAvisosDoSetor(usuarioAtual.setor);
    promessa
      .then((lista) => {
        setAvisos(lista);
        setErro(null);
        // Registra sozinho que esse colaborador abriu o mural — é o que dá
        // ao administrador a visibilidade de quem já viu cada aviso.
        lista.forEach((a) => {
          marcarVisualizado(a.id, usuarioAtual.nome).catch(() => {});
        });
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar o mural de avisos.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  React.useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioAtual?.setor, podeVerTodos]);

  if (!usuarioAtual) return null;

  function nomeSetor(key: SetorKey | null) {
    if (!key) return 'Todos os setores';
    return setores.find((s) => s.key === key)?.nome ?? key;
  }

  function abrirNovo() {
    setTitulo('');
    setMensagem('');
    setUrgente(false);
    setSetorEscolhido(null);
    setFotoUri(null);
    setModo('novo');
  }

  async function escolherFoto() {
    Alert.alert('Adicionar foto', 'Como você quer adicionar a foto?', [
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
      setFotoUri(resultado.assets[0].uri);
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
      setFotoUri(resultado.assets[0].uri);
    }
  }

  const formValido = titulo.trim().length > 0 && mensagem.trim().length > 0;

  async function publicar() {
    if (!formValido || !usuarioAtual) return;
    setPublicando(true);
    try {
      let fotoUrl: string | null = null;
      if (fotoUri) {
        fotoUrl = await enviarFotoAviso(fotoUri);
      }
      const novo = await publicarAviso({
        titulo: titulo.trim(),
        mensagem: mensagem.trim(),
        urgente,
        setor: setorEscolhido,
        fotoUrl,
        criadoPorNome: usuarioAtual.nome,
      });
      setAvisos((prev) => [novo, ...prev]);
      setModo('lista');
    } catch (e: any) {
      Alert.alert('Não consegui publicar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setPublicando(false);
    }
  }

  function confirmarExclusao(a: Aviso) {
    Alert.alert('Remover aviso', `Remover "${a.titulo}" do mural?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await removerAviso(a.id);
            setAvisos((prev) => prev.filter((p) => p.id !== a.id));
          } catch (e: any) {
            Alert.alert('Não consegui remover', e?.message ?? 'Tenta de novo em alguns instantes.');
          }
        },
      },
    ]);
  }

  async function alternarVisualizacoes(avisoId: string) {
    const atual = visualizacoesAbertas[avisoId];
    if (Array.isArray(atual)) {
      setVisualizacoesAbertas((prev) => {
        const copia = { ...prev };
        delete copia[avisoId];
        return copia;
      });
      return;
    }
    setVisualizacoesAbertas((prev) => ({ ...prev, [avisoId]: 'carregando' }));
    try {
      const lista = await buscarVisualizacoes(avisoId);
      setVisualizacoesAbertas((prev) => ({ ...prev, [avisoId]: lista }));
    } catch (e: any) {
      setVisualizacoesAbertas((prev) => {
        const copia = { ...prev };
        delete copia[avisoId];
        return copia;
      });
      Alert.alert('Não consegui carregar', e?.message ?? 'Tenta de novo em alguns instantes.');
    }
  }

  // --- tela de novo aviso ----------------------------------------------------
  if (modo === 'novo') {
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setModo('lista')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.voltar}>‹ Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.titulo}>Novo aviso</Text>
          <View style={{ width: 70 }} />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Título</Text>
            <TextInput style={styles.input} placeholder="Ex: Falta de energia amanhã" value={titulo} onChangeText={setTitulo} />

            <Text style={styles.formLabel}>Mensagem</Text>
            <TextInput
              style={[styles.input, styles.inputMultilinha]}
              placeholder="Escreva o aviso completo aqui"
              value={mensagem}
              onChangeText={setMensagem}
              multiline
              numberOfLines={5}
            />

            <Text style={styles.formLabel}>Foto (opcional)</Text>
            {fotoUri ? (
              <View style={styles.fotoPreviewBox}>
                <Image source={{ uri: fotoUri }} style={styles.fotoPreview} />
                <TouchableOpacity onPress={() => setFotoUri(null)}>
                  <Text style={styles.btnRemoverFotoTexto}>Remover foto</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.btnAdicionarFoto} onPress={escolherFoto}>
                <Text style={styles.btnAdicionarFotoTexto}>+ Adicionar foto</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.formLabel}>Setor</Text>
            <View style={styles.chipsWrap}>
              <TouchableOpacity style={[styles.chip, setorEscolhido === null && styles.chipAtivo]} onPress={() => setSetorEscolhido(null)}>
                <Text style={[styles.chipTexto, setorEscolhido === null && styles.chipTextoAtivo]}>Todos</Text>
              </TouchableOpacity>
              {setores.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.chip, setorEscolhido === s.key && styles.chipAtivo]}
                  onPress={() => setSetorEscolhido(s.key)}
                >
                  <Text style={[styles.chipTexto, setorEscolhido === s.key && styles.chipTextoAtivo]}>{s.nome}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.urgenteLinha} onPress={() => setUrgente((v) => !v)}>
              <View style={[styles.checkbox, urgente && styles.checkboxMarcado]}>
                {urgente && <Text style={styles.checkboxMarca}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.urgenteTitulo}>Marcar como urgente</Text>
                <Text style={styles.urgenteDescricao}>Aparece destacado em vermelho no topo do mural.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnSalvar, (!formValido || publicando) && styles.btnSalvarDesabilitado]}
              onPress={publicar}
              disabled={!formValido || publicando}
            >
              <Text style={styles.btnSalvarTexto}>{publicando ? 'Publicando…' : 'Publicar aviso'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // --- lista principal ---------------------------------------------------------
  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Mural de Avisos</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
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
        ) : avisos.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>
              Nenhum aviso publicado ainda.
              {podePublicar ? ' Toque no botão "+" aqui embaixo pra publicar o primeiro.' : ''}
            </Text>
          </View>
        ) : (
          avisos.map((a) => {
            const visualizacoes = visualizacoesAbertas[a.id];
            return (
              <View key={a.id} style={[styles.card, a.urgente && styles.cardUrgente]}>
                <View style={styles.cardTopo}>
                  <Text style={styles.cardTitulo}>{a.titulo}</Text>
                  {a.urgente && (
                    <View style={styles.chipUrgente}>
                      <Text style={styles.chipUrgenteTexto}>Urgente</Text>
                    </View>
                  )}
                </View>
                {a.fotoUrl && <Image source={{ uri: a.fotoUrl }} style={styles.cardFoto} />}
                <Text style={styles.cardMensagem}>{a.mensagem}</Text>
                <Text style={styles.cardRodape}>
                  {formatarDataHora(a.criadoEm)} · {a.criadoPorNome}
                  {podeVerTodos ? ` · ${nomeSetor(a.setor)}` : ''}
                </Text>

                <View style={styles.cardAcoes}>
                  {a.fotoUrl && (
                    <TouchableOpacity onPress={() => baixarFotoAviso(a)} disabled={!!baixando[a.id]}>
                      <Text style={styles.btnBaixarTexto}>{baixando[a.id] ? 'Baixando…' : '⬇ Baixar foto'}</Text>
                    </TouchableOpacity>
                  )}
                  {podeVerVisualizacoes && (
                    <TouchableOpacity onPress={() => alternarVisualizacoes(a.id)}>
                      <Text style={styles.btnVisualizacoesTexto}>
                        {visualizacoes === 'carregando'
                          ? 'Carregando…'
                          : Array.isArray(visualizacoes)
                          ? 'Ocultar quem visualizou'
                          : 'Ver quem visualizou'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {podeExcluir && (
                    <TouchableOpacity onPress={() => confirmarExclusao(a)}>
                      <Text style={styles.btnRemoverTexto}>Remover</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {Array.isArray(visualizacoes) && (
                  <View style={styles.visualizacoesBox}>
                    {visualizacoes.length === 0 ? (
                      <Text style={styles.visualizacoesVazio}>Ninguém abriu esse aviso ainda.</Text>
                    ) : (
                      visualizacoes.map((v) => (
                        <Text key={v.colaboradorNome} style={styles.visualizacaoLinha}>
                          {v.colaboradorNome} · {formatarDataHora(v.visualizadoEm)}
                        </Text>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {podePublicar && (
        <TouchableOpacity style={styles.fab} onPress={abrirNovo}>
          <Text style={styles.fabTexto}>+</Text>
        </TouchableOpacity>
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
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 19 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardUrgente: { borderWidth: 1, borderColor: colors.red500 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardTitulo: { fontSize: 14.5, fontWeight: '700', color: colors.gray900, flex: 1 },
  cardFoto: { width: '100%', height: 180, borderRadius: radius.md, marginTop: spacing.sm, backgroundColor: colors.gray50 },
  cardMensagem: { fontSize: 13, color: colors.gray900, marginTop: spacing.sm, lineHeight: 19 },
  cardRodape: { fontSize: 11, color: colors.gray400, marginTop: spacing.md, fontWeight: '600' },
  chipUrgente: { backgroundColor: '#FBDEDC', borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipUrgenteTexto: { fontSize: 10.5, fontWeight: '700', color: colors.red500 },
  cardAcoes: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  btnRemoverTexto: { fontSize: 11.5, color: colors.red500, fontWeight: '600' },
  btnVisualizacoesTexto: { fontSize: 11.5, color: colors.navy700, fontWeight: '600' },
  btnBaixarTexto: { fontSize: 11.5, color: colors.navy700, fontWeight: '600' },
  visualizacoesBox: { backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  visualizacoesVazio: { fontSize: 11.5, color: colors.gray600 },
  visualizacaoLinha: { fontSize: 11.5, color: colors.gray900, paddingVertical: 2 },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.navy700,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabTexto: { color: colors.white, fontSize: 28, fontWeight: '600', marginTop: -2 },
  formCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  formLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.gray600,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  input: { backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900 },
  inputMultilinha: { minHeight: 100, textAlignVertical: 'top' },
  fotoPreviewBox: { gap: spacing.sm },
  fotoPreview: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.gray50 },
  btnRemoverFotoTexto: { fontSize: 12, color: colors.red500, fontWeight: '600' },
  btnAdicionarFoto: {
    borderWidth: 1,
    borderColor: colors.gray100,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnAdicionarFotoTexto: { fontSize: 12.5, color: colors.navy700, fontWeight: '700' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  urgenteLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMarcado: { backgroundColor: colors.red500, borderColor: colors.red500 },
  checkboxMarca: { color: colors.white, fontSize: 13, fontWeight: '700' },
  urgenteTitulo: { fontSize: 13, fontWeight: '600', color: colors.gray900 },
  urgenteDescricao: { fontSize: 11, color: colors.gray600, marginTop: 2 },
  btnSalvar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.xl },
  btnSalvarDesabilitado: { backgroundColor: colors.gray100 },
  btnSalvarTexto: { color: colors.white, fontSize: 13, fontWeight: '700' },
});
