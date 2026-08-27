import React, { useEffect, useState } from 'react';
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
import {
  Ocorrencia,
  abrirOcorrencia,
  buscarMinhasOcorrencias,
  enviarFotoOcorrencia,
} from '../data/ocorrenciasApi';

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes} às ${hora}:${min}`;
}

export default function OcorrenciaScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();

  const [minhas, setMinhas] = useState<Ocorrencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const [texto, setTexto] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function carregar() {
    if (!usuarioAtual) return;
    buscarMinhasOcorrencias(usuarioAtual.nome)
      .then(setMinhas)
      .catch(() => {})
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioAtual?.nome]);

  if (!usuarioAtual) return null;

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

  async function enviar() {
    if (!texto.trim() || !usuarioAtual) return;
    setEnviando(true);
    try {
      let fotoUrl: string | null = null;
      if (fotoUri) {
        fotoUrl = await enviarFotoOcorrencia(fotoUri);
      }
      const nova = await abrirOcorrencia({
        colaboradorNome: usuarioAtual.nome,
        setor: usuarioAtual.setor,
        texto: texto.trim(),
        fotoUrl,
      });
      setMinhas((prev) => [nova, ...prev]);
      setTexto('');
      setFotoUri(null);
      Alert.alert('Enviado', 'Sua ocorrência foi enviada pros administradores.');
    } catch (e: any) {
      Alert.alert('Não consegui enviar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Abrir ocorrência</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
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
        <View style={styles.formCard}>
          <Text style={styles.formLabel}>O que aconteceu?</Text>
          <TextInput
            style={[styles.input, styles.inputMultilinha]}
            placeholder="Descreva a ocorrência aqui"
            value={texto}
            onChangeText={setTexto}
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

          <TouchableOpacity
            style={[styles.btnEnviar, (!texto.trim() || enviando) && styles.btnEnviarDesabilitado]}
            onPress={enviar}
            disabled={!texto.trim() || enviando}
          >
            <Text style={styles.btnEnviarTexto}>{enviando ? 'Enviando…' : 'Enviar pros administradores'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.secaoTitulo}>Minhas ocorrências</Text>

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xl }} />
        ) : minhas.length === 0 ? (
          <Text style={styles.vazioTexto}>Você ainda não abriu nenhuma ocorrência.</Text>
        ) : (
          minhas.map((o) => (
            <View key={o.id} style={styles.card}>
              <View style={styles.cardTopo}>
                <Text style={styles.cardData}>{formatarDataHora(o.criadoEm)}</Text>
                <View style={[styles.chipStatus, o.status === 'resolvida' ? styles.chipResolvida : styles.chipAberta]}>
                  <Text style={[styles.chipStatusTexto, { color: o.status === 'resolvida' ? colors.green500 : '#B4650E' }]}>
                    {o.status === 'resolvida' ? 'Resolvida' : 'Aberta'}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardTexto}>{o.texto}</Text>
              {o.fotoUrl && <Image source={{ uri: o.fotoUrl }} style={styles.cardFoto} />}
            </View>
          ))
        )}
      </ScrollView>
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
  fotoPreview: { width: '100%', height: 160, borderRadius: radius.md, backgroundColor: colors.gray50 },
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
  btnEnviar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.xl },
  btnEnviarDesabilitado: { backgroundColor: colors.gray100 },
  btnEnviarTexto: { color: colors.white, fontSize: 13, fontWeight: '700' },
  secaoTitulo: { fontSize: 15, fontWeight: '700', color: colors.gray900, marginTop: spacing.xxl, marginBottom: spacing.md },
  vazioTexto: { fontSize: 12.5, color: colors.gray600, textAlign: 'center', paddingVertical: spacing.xl },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardData: { fontSize: 11, color: colors.gray400, fontWeight: '600' },
  chipStatus: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipAberta: { backgroundColor: '#FBEBD4' },
  chipResolvida: { backgroundColor: '#DFF3E9' },
  chipStatusTexto: { fontSize: 10.5, fontWeight: '700' },
  cardTexto: { fontSize: 13, color: colors.gray900, marginTop: spacing.sm, lineHeight: 19 },
  cardFoto: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm, backgroundColor: colors.gray50 },
});
