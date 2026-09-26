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
import { formatarData } from '../lib/validadeUtils';
import {
  Tratativa,
  TratativaRegistro,
  buscarTratativasAbertas,
  buscarTratativasEncerradas,
  buscarRegistrosDaTratativa,
  registrarAtualizacaoDiaria,
  encerrarTratativa,
  enviarFotoTratativa,
  diasEmAberto,
  fotoObrigatoria,
} from '../data/tratativaApi';

function formatarDataHoraCurta(iso: string): string {
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
}

export default function TratativasScreen({
  onVoltar,
  usuarioNome,
}: {
  onVoltar: () => void;
  usuarioNome: string;
}) {
  const [aba, setAba] = useState<'abertas' | 'encerradas'>('abertas');
  const [abertas, setAbertas] = useState<Tratativa[]>([]);
  const [encerradas, setEncerradas] = useState<Tratativa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [selecionada, setSelecionada] = useState<Tratativa | null>(null);

  function carregar() {
    Promise.all([buscarTratativasAbertas(), buscarTratativasEncerradas()])
      .then(([listaAbertas, listaEncerradas]) => {
        setAbertas(listaAbertas);
        setEncerradas(listaEncerradas);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar as tratativas.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrirDetalhe(t: Tratativa) {
    setSelecionada(t);
  }

  function voltarDaLista() {
    setSelecionada(null);
    carregar();
  }

  if (selecionada) {
    return (
      <DetalheTratativa
        tratativa={selecionada}
        usuarioNome={usuarioNome}
        onVoltar={voltarDaLista}
      />
    );
  }

  const lista = aba === 'abertas' ? abertas : encerradas;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Tratativas</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.abasRow}>
        <TouchableOpacity
          style={[styles.aba, aba === 'abertas' && styles.abaAtiva]}
          onPress={() => setAba('abertas')}
        >
          <Text style={[styles.abaTexto, aba === 'abertas' && styles.abaTextoAtivo]}>
            Em aberto ({abertas.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.aba, aba === 'encerradas' && styles.abaAtiva]}
          onPress={() => setAba('encerradas')}
        >
          <Text style={[styles.abaTexto, aba === 'encerradas' && styles.abaTextoAtivo]}>
            Encerradas
          </Text>
        </TouchableOpacity>
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
        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : lista.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>
              {aba === 'abertas'
                ? 'Nenhuma tratativa em aberto no momento. Elas abrem sozinhas quando um produto tem quantidade alta e vencimento próximo.'
                : 'Nenhuma tratativa encerrada nos últimos 60 dias.'}
            </Text>
          </View>
        ) : (
          lista.map((t) => {
            const dias = aba === 'abertas' ? diasEmAberto(t.abertaEm) : diasEmAberto(t.abertaEm, t.encerradaEm);
            const precisaFoto = aba === 'abertas' && fotoObrigatoria(t.abertaEm);
            return (
              <TouchableOpacity key={t.id} style={styles.card} onPress={() => abrirDetalhe(t)}>
                <View style={styles.cardTopo}>
                  <Text style={styles.cardProduto}>{t.produto}</Text>
                  {t.status !== 'aberta' && (
                    <View
                      style={[
                        styles.chipStatus,
                        { backgroundColor: t.status === 'sucesso' ? '#DFF3E9' : '#FBDEDC' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipStatusTexto,
                          { color: t.status === 'sucesso' ? colors.green500 : colors.red500 },
                        ]}
                      >
                        {t.status === 'sucesso' ? 'Sucesso' : 'Perda'}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardInfo}>
                  {dias} dia{dias === 1 ? '' : 's'} em aberto · Vence {formatarData(t.dataValidade)}
                </Text>
                <Text style={styles.cardInfo}>
                  Quantidade atual: {t.quantidadeAtual} {t.unidade}
                  {t.precoAtual != null ? ` · R$ ${t.precoAtual.toFixed(2)}` : ''}
                </Text>
                {precisaFoto && (
                  <View style={styles.avisoFotoBox}>
                    <Text style={styles.avisoFotoTexto}>📷 Foto obrigatória no próximo lançamento</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function DetalheTratativa({
  tratativa,
  usuarioNome,
  onVoltar,
}: {
  tratativa: Tratativa;
  usuarioNome: string;
  onVoltar: () => void;
}) {
  const [registros, setRegistros] = useState<TratativaRegistro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [t, setT] = useState(tratativa);

  const [quantidadeTexto, setQuantidadeTexto] = useState(String(tratativa.quantidadeAtual));
  const [precoTexto, setPrecoTexto] = useState(tratativa.precoAtual != null ? String(tratativa.precoAtual) : '');
  const [anotacoes, setAnotacoes] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [encerrando, setEncerrando] = useState(false);
  const [quantidadePerdidaTexto, setQuantidadePerdidaTexto] = useState('');

  const emAberto = t.status === 'aberta';
  const precisaFoto = emAberto && fotoObrigatoria(t.abertaEm);

  function carregarRegistros() {
    buscarRegistrosDaTratativa(t.id)
      .then(setRegistros)
      .catch(() => {})
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregarRegistros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id]);

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
    const resultado = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (!resultado.canceled && resultado.assets?.[0]) {
      setFotoUri(resultado.assets[0].uri);
    }
  }

  const quantidadeNumero = Number(quantidadeTexto.replace(',', '.'));
  const precoNumero = Number(precoTexto.replace(',', '.'));
  const lancamentoValido =
    emAberto && quantidadeNumero >= 0 && precoNumero > 0 && (!precisaFoto || !!fotoUri);

  async function lancarHoje() {
    if (!lancamentoValido) return;
    setEnviando(true);
    try {
      let fotoUrl: string | null = null;
      if (fotoUri) {
        fotoUrl = await enviarFotoTratativa(fotoUri);
      }
      await registrarAtualizacaoDiaria({
        tratativaId: t.id,
        quantidade: quantidadeNumero,
        preco: precoNumero,
        pessoaNome: usuarioNome,
        fotoUrl,
        anotacoes: anotacoes.trim() || null,
      });
      setT((prev) => ({ ...prev, quantidadeAtual: quantidadeNumero, precoAtual: precoNumero }));
      setFotoUri(null);
      setAnotacoes('');
      Alert.alert('Lançamento salvo', 'Atualização do dia registrada.');
      carregarRegistros();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tenta de novo em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  function confirmarEncerrar(status: 'sucesso' | 'perda') {
    if (status === 'perda') {
      setEncerrando(true);
      return;
    }
    Alert.alert('Encerrar como sucesso', `Confirma que "${t.produto}" foi resolvido (vendeu/baixou tudo)?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: () => executarEncerrar('sucesso') },
    ]);
  }

  async function executarEncerrar(status: 'sucesso' | 'perda') {
    const quantidadePerdida = status === 'perda' ? Number(quantidadePerdidaTexto.replace(',', '.')) : undefined;
    if (status === 'perda' && (!quantidadePerdida || quantidadePerdida <= 0)) {
      Alert.alert('Informe a quantidade', 'Preenche quanto foi perdido pra registrar a perda.');
      return;
    }
    setEnviando(true);
    try {
      const atualizada = await encerrarTratativa({ tratativaId: t.id, status, quantidadePerdida });
      setT(atualizada);
      setEncerrando(false);
      Alert.alert(
        status === 'sucesso' ? 'Tratativa encerrada' : 'Perda registrada',
        status === 'sucesso' ? 'Marcada como sucesso.' : 'Marcada como perda no histórico.'
      );
    } catch (e: any) {
      Alert.alert('Não consegui encerrar', e?.message ?? 'Tenta de novo em instantes.');
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
        <Text style={styles.titulo} numberOfLines={1}>
          {t.produto}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={styles.formCard}>
          <Text style={styles.detalheInfo}>
            Aberta em {formatarData(t.abertaEm.slice(0, 10))} · Vence {formatarData(t.dataValidade)}
          </Text>
          <Text style={styles.detalheInfo}>
            Quantidade inicial: {t.quantidadeInicial} {t.unidade} → atual: {t.quantidadeAtual} {t.unidade}
          </Text>
          {t.status !== 'aberta' && (
            <View
              style={[
                styles.chipStatus,
                { alignSelf: 'flex-start', marginTop: spacing.sm, backgroundColor: t.status === 'sucesso' ? '#DFF3E9' : '#FBDEDC' },
              ]}
            >
              <Text
                style={[styles.chipStatusTexto, { color: t.status === 'sucesso' ? colors.green500 : colors.red500 }]}
              >
                {t.status === 'sucesso' ? 'Encerrada com sucesso' : `Perda registrada${t.quantidadePerdida ? ` (${t.quantidadePerdida} ${t.unidade})` : ''}`}
              </Text>
            </View>
          )}
        </View>

        {emAberto && (
          <View style={styles.formCard}>
            <Text style={styles.secaoTitulo}>Lançar hoje</Text>

            <Text style={styles.formLabel}>Quantidade atual</Text>
            <TextInput
              style={styles.input}
              value={quantidadeTexto}
              onChangeText={setQuantidadeTexto}
              keyboardType="numeric"
            />

            <Text style={styles.formLabel}>Preço atual (R$)</Text>
            <TextInput
              style={styles.input}
              placeholder="0,00"
              value={precoTexto}
              onChangeText={setPrecoTexto}
              keyboardType="numeric"
            />

            <Text style={styles.formLabel}>Anotações (opcional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultilinha]}
              placeholder="O que foi feito hoje pra resolver…"
              value={anotacoes}
              onChangeText={setAnotacoes}
              multiline
            />

            <Text style={styles.formLabel}>
              Foto{precisaFoto ? ' (obrigatória a partir do 3º dia em aberto)' : ' (opcional)'}
            </Text>
            {fotoUri ? (
              <View style={{ gap: spacing.sm }}>
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
              style={[styles.btnSalvar, (!lancamentoValido || enviando) && styles.btnSalvarDesabilitado]}
              onPress={lancarHoje}
              disabled={!lancamentoValido || enviando}
            >
              <Text style={styles.btnSalvarTexto}>{enviando ? 'Salvando…' : 'Salvar lançamento de hoje'}</Text>
            </TouchableOpacity>

            <Text style={styles.secaoTitulo}>Encerrar tratativa</Text>
            {!encerrando ? (
              <View style={styles.encerrarRow}>
                <TouchableOpacity style={styles.btnSucesso} onPress={() => confirmarEncerrar('sucesso')}>
                  <Text style={styles.btnSucessoTexto}>✓ Sucesso</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnPerda} onPress={() => confirmarEncerrar('perda')}>
                  <Text style={styles.btnPerdaTexto}>✕ Perda</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.formLabel}>Quantidade perdida ({t.unidade})</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  value={quantidadePerdidaTexto}
                  onChangeText={setQuantidadePerdidaTexto}
                  keyboardType="numeric"
                />
                <View style={styles.encerrarRow}>
                  <TouchableOpacity style={styles.btnSecundario} onPress={() => setEncerrando(false)}>
                    <Text style={styles.btnSecundarioTexto}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPerda, enviando && styles.btnSalvarDesabilitado]}
                    onPress={() => executarEncerrar('perda')}
                    disabled={enviando}
                  >
                    <Text style={styles.btnPerdaTexto}>{enviando ? 'Salvando…' : 'Confirmar perda'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        <Text style={styles.secaoTitulo}>Histórico de lançamentos</Text>
        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.lg }} />
        ) : registros.length === 0 ? (
          <Text style={styles.vazioTexto}>Nenhum lançamento registrado ainda.</Text>
        ) : (
          registros.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardTopo}>
                <Text style={styles.cardProduto}>{formatarDataHoraCurta(r.criadoEm)}</Text>
                <Text style={styles.cardInfo}>{r.pessoaNome ?? ''}</Text>
              </View>
              <Text style={styles.cardInfo}>
                Quantidade: {r.quantidade} · Preço: R$ {r.preco.toFixed(2)}
              </Text>
              {r.anotacoes && <Text style={styles.cardInfo}>{r.anotacoes}</Text>}
              {r.fotoUrl && <Image source={{ uri: r.fotoUrl }} style={styles.fotoPreview} />}
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
  titulo: { fontSize: 16, fontWeight: '700', color: colors.navy900, flex: 1, textAlign: 'center', marginHorizontal: spacing.sm },
  abasRow: { flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  aba: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  abaAtiva: { borderBottomColor: colors.navy700 },
  abaTexto: { fontSize: 12.5, fontWeight: '600', color: colors.gray600 },
  abaTextoAtivo: { color: colors.navy700 },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 19 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  cardProduto: { fontSize: 14, fontWeight: '700', color: colors.gray900, flex: 1 },
  cardInfo: { fontSize: 12, color: colors.gray600, marginTop: 4, fontWeight: '600' },
  chipStatus: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipStatusTexto: { fontSize: 10.5, fontWeight: '700' },
  avisoFotoBox: { backgroundColor: '#FBEBD4', borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  avisoFotoTexto: { color: '#7A4C0E', fontSize: 11.5, fontWeight: '600' },
  formCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  detalheInfo: { fontSize: 12.5, color: colors.gray600, fontWeight: '600', marginTop: 4 },
  secaoTitulo: { fontSize: 14, fontWeight: '700', color: colors.gray900, marginTop: spacing.lg, marginBottom: spacing.sm },
  formLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginTop: spacing.md, marginBottom: 6 },
  input: { backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900 },
  inputMultilinha: { minHeight: 80, textAlignVertical: 'top' },
  fotoPreview: { width: '100%', height: 160, borderRadius: radius.md, marginTop: spacing.sm, backgroundColor: colors.gray50 },
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
  btnSalvar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.lg },
  btnSalvarDesabilitado: { backgroundColor: colors.gray100 },
  btnSalvarTexto: { color: colors.white, fontSize: 13, fontWeight: '700' },
  encerrarRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  btnSucesso: { flex: 1, backgroundColor: '#DFF3E9', borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  btnSucessoTexto: { color: colors.green500, fontSize: 13, fontWeight: '700' },
  btnPerda: { flex: 1, backgroundColor: '#FBDEDC', borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  btnPerdaTexto: { color: colors.red500, fontSize: 13, fontWeight: '700' },
  btnSecundario: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.gray100 },
  btnSecundarioTexto: { color: colors.gray600, fontSize: 13, fontWeight: '700' },
});
