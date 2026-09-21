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
  Conferencia,
  ConferenciaItem,
  buscarConferencias,
  buscarTodasConferencias,
  buscarItensDaConferencia,
  marcarItemOk,
  marcarItemDivergencia,
  marcarItemRuptura,
  marcarItemFaltaExplosivo,
  reiniciarConferencia,
  concluirConferencia,
  enviarFotoConferencia,
  anexarNotaFiscal,
  criarConferencia,
} from '../data/conferenciasApi';
import { JornalOferta, buscarJornalAtual } from '../data/jornalOfertasApi';
import VisualizadorJornalModal from '../components/VisualizadorJornalModal';

export default function ConferenciaScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  // Administrador enxerga e cria conferência de qualquer setor (hoje só
  // existe FLV, mas evita ficar preso ao setor "gerencia" dele).
  const podeVerTudo = !!usuarioAtual?.isAdmin;

  const [modo, setModo] = useState<'lista' | 'itens' | 'nova'>('lista');
  const [conferencias, setConferencias] = useState<Conferencia[]>([]);
  const [filtro, setFiltro] = useState<'pendentes' | 'concluidas'>('pendentes');
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const [conferenciaAtual, setConferenciaAtual] = useState<Conferencia | null>(null);
  const [itens, setItens] = useState<ConferenciaItem[]>([]);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [itemEmDivergencia, setItemEmDivergencia] = useState<string | null>(null);
  const [quantidadeReal, setQuantidadeReal] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [salvandoItem, setSalvandoItem] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);
  const [enviandoNF, setEnviandoNF] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);

  // Jornal de Ofertas como referência, só pras conferências do tipo "jornal"
  // (checklist do Jornal de Aniversário) — mesmo PDF que o admin sobe no
  // portal / na bolha flutuante.
  const [jornalAtual, setJornalAtual] = useState<JornalOferta | null>(null);
  const [verJornal, setVerJornal] = useState(false);

  // --- Criação de uma conferência nova, direto pelo colaborador ------------
  // 'nf' = conferência normal de nota fiscal. 'jornal' = "Conferência
  // Folheto de Oferta": usa o Jornal de Ofertas já publicado (o mesmo PDF
  // que o admin sobe no portal) como referência, em vez de anexar uma NF.
  const [novoTipo, setNovoTipo] = useState<'nf' | 'jornal'>('nf');
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novaNfUri, setNovaNfUri] = useState<string | null>(null);
  const [novosItens, setNovosItens] = useState<{ codigoInterno: string; produto: string; quantidade: string }[]>([
    { codigoInterno: '', produto: '', quantidade: '' },
  ]);
  const [criandoConferencia, setCriandoConferencia] = useState(false);

  function carregarLista() {
    if (!usuarioAtual) return;
    const promessa = podeVerTudo ? buscarTodasConferencias() : buscarConferencias(usuarioAtual.setor);
    promessa
      .then(setConferencias)
      .catch(() => {})
      .finally(() => {
        setCarregandoLista(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioAtual?.setor, podeVerTudo]);

  if (!usuarioAtual) return null;

  function abrirConferencia(c: Conferencia) {
    setConferenciaAtual(c);
    setCarregandoItens(true);
    setModo('itens');
    buscarItensDaConferencia(c.id)
      .then(setItens)
      .catch(() => {})
      .finally(() => setCarregandoItens(false));
    if (c.tipo === 'jornal') {
      buscarJornalAtual().then(setJornalAtual).catch(() => setJornalAtual(null));
    } else {
      setJornalAtual(null);
    }
  }

  function voltarParaLista() {
    setModo('lista');
    setConferenciaAtual(null);
    setItens([]);
    setItemEmDivergencia(null);
    setJornalAtual(null);
    setVerJornal(false);
    carregarLista();
  }

  async function confirmarOk(item: ConferenciaItem) {
    setSalvandoItem(item.id);
    try {
      await marcarItemOk(item.id, item.quantidadeEsperada);
      setItens((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'ok', quantidadeReal: item.quantidadeEsperada } : p))
      );
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setSalvandoItem(null);
    }
  }

  function abrirDivergencia(item: ConferenciaItem) {
    setItemEmDivergencia(item.id);
    setQuantidadeReal('');
    setFotoUri(null);
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
    if (!resultado.canceled && resultado.assets?.[0]) setFotoUri(resultado.assets[0].uri);
  }

  async function escolherDaGaleria() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Sem permissão', 'Precisa liberar o acesso às fotos nas configurações do celular.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!resultado.canceled && resultado.assets?.[0]) setFotoUri(resultado.assets[0].uri);
  }

  async function escolherFotoNF() {
    Alert.alert('Anexar nota fiscal', 'Como você quer anexar a NF?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto agora', onPress: tirarFotoNF },
      { text: 'Escolher da galeria', onPress: escolherDaGaleriaNF },
    ]);
  }

  async function tirarFotoNF() {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Sem permissão', 'Precisa liberar o acesso à câmera nas configurações do celular.');
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!resultado.canceled && resultado.assets?.[0]) await salvarNotaFiscal(resultado.assets[0].uri);
  }

  async function escolherDaGaleriaNF() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Sem permissão', 'Precisa liberar o acesso às fotos nas configurações do celular.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!resultado.canceled && resultado.assets?.[0]) await salvarNotaFiscal(resultado.assets[0].uri);
  }

  async function salvarNotaFiscal(uriLocal: string) {
    if (!conferenciaAtual) return;
    setEnviandoNF(true);
    try {
      const url = await enviarFotoConferencia(uriLocal);
      await anexarNotaFiscal(conferenciaAtual.id, url);
      setConferenciaAtual((prev) => (prev ? { ...prev, notaFiscalUrl: url } : prev));
      setConferencias((prev) => prev.map((c) => (c.id === conferenciaAtual.id ? { ...c, notaFiscalUrl: url } : c)));
    } catch (e: any) {
      Alert.alert('Não consegui anexar a NF', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setEnviandoNF(false);
    }
  }

  function escolherTipoNovaConferencia() {
    Alert.alert('Nova conferência', 'Qual tipo de conferência você quer criar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Nota Fiscal (NF)', onPress: () => abrirNovaConferencia('nf') },
      { text: 'Folheto de Oferta', onPress: () => abrirNovaConferencia('jornal') },
    ]);
  }

  function abrirNovaConferencia(tipo: 'nf' | 'jornal') {
    setNovoTipo(tipo);
    setNovaNfUri(null);
    setNovosItens([{ codigoInterno: '', produto: '', quantidade: '' }]);
    setVerJornal(false);
    if (tipo === 'jornal') {
      const hoje = new Date();
      const dataFormatada = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}`;
      setNovoTitulo(`Folheto de Oferta - ${dataFormatada}`);
      buscarJornalAtual().then(setJornalAtual).catch(() => setJornalAtual(null));
    } else {
      setNovoTitulo('');
      setJornalAtual(null);
    }
    setModo('nova');
  }

  function atualizarItemNovo(indice: number, campo: 'codigoInterno' | 'produto' | 'quantidade', valor: string) {
    setNovosItens((prev) => prev.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)));
  }

  function adicionarLinhaItem() {
    setNovosItens((prev) => [...prev, { codigoInterno: '', produto: '', quantidade: '' }]);
  }

  function removerLinhaItem(indice: number) {
    setNovosItens((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== indice)));
  }

  async function tirarFotoNovaNF() {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Sem permissão', 'Precisa liberar o acesso à câmera nas configurações do celular.');
      return;
    }
    const resultado = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!resultado.canceled && resultado.assets?.[0]) setNovaNfUri(resultado.assets[0].uri);
  }

  async function escolherDaGaleriaNovaNF() {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Sem permissão', 'Precisa liberar o acesso às fotos nas configurações do celular.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!resultado.canceled && resultado.assets?.[0]) setNovaNfUri(resultado.assets[0].uri);
  }

  function escolherFotoNovaConferencia() {
    Alert.alert('Anexar nota fiscal', 'Como você quer anexar a NF?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto agora', onPress: tirarFotoNovaNF },
      { text: 'Escolher da galeria', onPress: escolherDaGaleriaNovaNF },
    ]);
  }

  async function criarConferenciaHandler() {
    if (!usuarioAtual) return;
    const titulo = novoTitulo.trim();
    if (!titulo) {
      Alert.alert('Falta o título', 'Dá um nome pra essa conferência (ex.: "NF 12345 - Fornecedor XPTO").');
      return;
    }
    const itensValidos = novosItens
      .map((it) => ({
        codigoInterno: it.codigoInterno.trim() || null,
        produto: it.produto.trim(),
        quantidadeEsperada: Number(it.quantidade.replace(',', '.')),
      }))
      .filter((it) => it.produto && !Number.isNaN(it.quantidadeEsperada) && it.quantidadeEsperada >= 0);
    if (itensValidos.length === 0) {
      Alert.alert('Falta os itens', 'Adiciona pelo menos um produto com a quantidade esperada preenchida.');
      return;
    }
    setCriandoConferencia(true);
    try {
      let notaFiscalUrl: string | null = null;
      if (novaNfUri) notaFiscalUrl = await enviarFotoConferencia(novaNfUri);
      await criarConferencia({
        titulo,
        // Conferência agora também é usada pelo CPD e pelo Açougue, além
        // do FLV — usa o setor de quem está criando. Administrador
        // (setor "gerencia") não tem uma conferência "própria", então
        // continua caindo em "flv" por padrão nesse caso.
        setor: usuarioAtual.setor === 'gerencia' ? 'flv' : usuarioAtual.setor,
        criadaPorNome: usuarioAtual.nome,
        notaFiscalUrl,
        itens: itensValidos,
        tipo: novoTipo,
      });
      Alert.alert('Conferência criada', 'Já pode começar a conferir os itens.');
      setModo('lista');
      carregarLista();
    } catch (e: any) {
      Alert.alert('Não consegui criar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setCriandoConferencia(false);
    }
  }

  async function confirmarDivergencia(item: ConferenciaItem) {
    const numero = Number(quantidadeReal.replace(',', '.'));
    if (!quantidadeReal.trim() || Number.isNaN(numero) || numero < 0) {
      Alert.alert('Quantidade inválida', 'Digite a quantidade que realmente chegou.');
      return;
    }
    setSalvandoItem(item.id);
    try {
      let fotoUrl: string | null = null;
      if (fotoUri) fotoUrl = await enviarFotoConferencia(fotoUri);
      await marcarItemDivergencia({ itemId: item.id, quantidadeReal: numero, fotoUrl });
      setItens((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, status: 'divergencia', quantidadeReal: numero, fotoUrl } : p))
      );
      setItemEmDivergencia(null);
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setSalvandoItem(null);
    }
  }

  async function concluir() {
    if (!conferenciaAtual) return;
    setConcluindo(true);
    try {
      await concluirConferencia(conferenciaAtual.id, usuarioAtual.nome);
      Alert.alert('Conferência enviada', 'Os administradores já podem ver o resultado.');
      voltarParaLista();
    } catch (e: any) {
      Alert.alert('Não consegui enviar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setConcluindo(false);
    }
  }

  // --- Ações específicas do tipo "jornal" (checklist do Jornal de Aniversário) ---
  async function confirmarRuptura(item: ConferenciaItem) {
    setSalvandoItem(item.id);
    try {
      await marcarItemRuptura(item.id);
      setItens((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'ruptura' } : p)));
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setSalvandoItem(null);
    }
  }

  async function confirmarFaltaExplosivo(item: ConferenciaItem) {
    setSalvandoItem(item.id);
    try {
      await marcarItemFaltaExplosivo(item.id);
      setItens((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: 'falta_explosivo' } : p)));
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setSalvandoItem(null);
    }
  }

  function confirmarReiniciar() {
    if (!conferenciaAtual) return;
    Alert.alert(
      'Reiniciar conferência',
      'Todos os itens voltam para "pendente" e o progresso atual é apagado. Quer refazer essa conferência do zero?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reiniciar', style: 'destructive', onPress: reiniciar },
      ]
    );
  }

  async function reiniciar() {
    if (!conferenciaAtual) return;
    setReiniciando(true);
    try {
      await reiniciarConferencia(conferenciaAtual.id);
      setItens((prev) => prev.map((p) => ({ ...p, status: 'pendente', quantidadeReal: null, fotoUrl: null, conferidoEm: null })));
      setConferenciaAtual((prev) => (prev ? { ...prev, status: 'pendente', conferidaPorNome: null, concluidaEm: null } : prev));
    } catch (e: any) {
      Alert.alert('Não consegui reiniciar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setReiniciando(false);
    }
  }

  // --- Tela de criar uma conferência nova ---------------------------------
  if (modo === 'nova') {
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setModo('lista')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.voltar}>‹ Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.titulo}>{novoTipo === 'jornal' ? 'Folheto de Oferta' : 'Nova conferência'}</Text>
          <View style={{ width: 70 }} />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Título</Text>
            <TextInput
              style={styles.input}
              placeholder={novoTipo === 'jornal' ? 'Ex.: Folheto de Oferta - 21/09' : 'Ex.: NF 12345 - Fornecedor XPTO'}
              value={novoTitulo}
              onChangeText={setNovoTitulo}
            />

            {novoTipo === 'nf' ? (
              <>
                <Text style={[styles.formLabel, { marginTop: spacing.md }]}>Nota fiscal (opcional)</Text>
                {novaNfUri ? (
                  <View>
                    <Image source={{ uri: novaNfUri }} style={styles.fotoPreview} />
                    <TouchableOpacity onPress={() => setNovaNfUri(null)}>
                      <Text style={styles.btnRemoverFotoTexto}>Remover foto</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.btnAdicionarFoto} onPress={escolherFotoNovaConferencia}>
                    <Text style={styles.btnAdicionarFotoTexto}>+ Anexar foto da NF</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <Text style={[styles.formLabel, { marginTop: spacing.md }]}>Jornal de Ofertas</Text>
                {jornalAtual ? (
                  <TouchableOpacity style={styles.btnAdicionarFoto} onPress={() => setVerJornal(true)}>
                    <Text style={styles.btnAdicionarFotoTexto}>📄 Ver jornal de ofertas atual</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.jornalAvisoTexto}>
                    Nenhum jornal enviado ainda no portal — dá pra continuar e montar a lista de itens mesmo assim,
                    mas o encarte não vai aparecer aqui até alguém subir um PDF novo.
                  </Text>
                )}
              </>
            )}
          </View>

          <Text style={styles.secaoTitulo}>{novoTipo === 'jornal' ? 'Itens do folheto de oferta' : 'Itens da nota fiscal'}</Text>
          {novosItens.map((item, indice) => (
            <View key={indice} style={styles.itemNovoCard}>
              <Text style={styles.formLabel}>Produto</Text>
              <TextInput
                style={styles.input}
                placeholder="Nome do produto"
                value={item.produto}
                onChangeText={(v) => atualizarItemNovo(indice, 'produto', v)}
              />
              <View style={styles.linhaDupla}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Código (opcional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Código interno"
                    value={item.codigoInterno}
                    onChangeText={(v) => atualizarItemNovo(indice, 'codigoInterno', v)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Qtd. esperada</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    keyboardType="numeric"
                    value={item.quantidade}
                    onChangeText={(v) => atualizarItemNovo(indice, 'quantidade', v)}
                  />
                </View>
              </View>
              {novosItens.length > 1 && (
                <TouchableOpacity onPress={() => removerLinhaItem(indice)}>
                  <Text style={styles.btnRemoverFotoTexto}>Remover item</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity style={styles.btnAdicionarItem} onPress={adicionarLinhaItem}>
            <Text style={styles.btnAdicionarItemTexto}>+ Adicionar outro produto</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnSalvar, criandoConferencia && styles.btnDesabilitado]}
            onPress={criarConferenciaHandler}
            disabled={criandoConferencia}
          >
            <Text style={styles.btnSalvarTexto}>{criandoConferencia ? 'Criando…' : 'Criar conferência'}</Text>
          </TouchableOpacity>
        </ScrollView>

        {jornalAtual && (
          <VisualizadorJornalModal
            visible={verJornal}
            arquivoUrl={jornalAtual.arquivoUrl}
            onFechar={() => setVerJornal(false)}
          />
        )}
      </View>
    );
  }

  // --- Tela de itens de uma conferência -----------------------------------
  if (modo === 'itens' && conferenciaAtual) {
    const tipoJornal = conferenciaAtual.tipo === 'jornal';
    const conferidos = itens.filter((i) => i.status !== 'pendente').length;
    const todosConferidos = itens.length > 0 && conferidos === itens.length;
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={voltarParaLista} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.voltar}>‹ Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.titulo} numberOfLines={1}>{conferenciaAtual.titulo}</Text>
          <View style={{ width: 50 }} />
        </View>

        {!carregandoItens && (
          <View style={styles.progressoBox}>
            <Text style={styles.progressoTexto}>{conferidos} de {itens.length} conferidos</Text>
            {tipoJornal && (
              <TouchableOpacity onPress={confirmarReiniciar} disabled={reiniciando} style={{ marginTop: 6 }}>
                <Text style={styles.btnReiniciarTexto}>{reiniciando ? 'Reiniciando…' : '↻ Reiniciar conferência'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
          {!carregandoItens && !tipoJornal && (
            <View style={styles.nfBox}>
              <Text style={styles.formLabel}>Nota fiscal da entrega</Text>
              {conferenciaAtual.notaFiscalUrl ? (
                <View>
                  <Image source={{ uri: conferenciaAtual.notaFiscalUrl }} style={styles.fotoPreview} />
                  <TouchableOpacity onPress={escolherFotoNF} disabled={enviandoNF} style={{ marginTop: spacing.sm }}>
                    <Text style={styles.btnAdicionarFotoTexto}>{enviandoNF ? 'Enviando…' : 'Trocar foto da NF'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.btnAdicionarFoto} onPress={escolherFotoNF} disabled={enviandoNF}>
                  <Text style={styles.btnAdicionarFotoTexto}>
                    {enviandoNF ? 'Enviando…' : '+ Anexar foto da NF'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!carregandoItens && tipoJornal && jornalAtual && (
            <View style={styles.nfBox}>
              <Text style={styles.formLabel}>Jornal de Ofertas</Text>
              <TouchableOpacity style={styles.btnAdicionarFoto} onPress={() => setVerJornal(true)}>
                <Text style={styles.btnAdicionarFotoTexto}>📄 Ver jornal de ofertas</Text>
              </TouchableOpacity>
            </View>
          )}

          {carregandoItens ? (
            <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
          ) : (
            itens.map((item) => (
              <View key={item.id} style={styles.itemCard}>
                <View style={styles.itemTopo}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemProduto}>{item.produto}</Text>
                    <Text style={styles.itemMeta}>
                      {item.codigoInterno ? `Cód. ${item.codigoInterno} · ` : ''}Esperado: {item.quantidadeEsperada}
                    </Text>
                  </View>
                  {item.status === 'ok' && (
                    <View style={[styles.chipStatus, styles.chipOk]}>
                      <Text style={[styles.chipStatusTexto, { color: colors.green500 }]}>✓ OK</Text>
                    </View>
                  )}
                  {item.status === 'divergencia' && (
                    <View style={[styles.chipStatus, styles.chipDivergencia]}>
                      <Text style={[styles.chipStatusTexto, { color: colors.red500 }]}>
                        ⚠ Recebido: {item.quantidadeReal}
                      </Text>
                    </View>
                  )}
                  {item.status === 'ruptura' && (
                    <View style={[styles.chipStatus, styles.chipDivergencia]}>
                      <Text style={[styles.chipStatusTexto, { color: colors.red500 }]}>⚠ Ruptura</Text>
                    </View>
                  )}
                  {item.status === 'falta_explosivo' && (
                    <View style={[styles.chipStatus, styles.chipFaltaExplosivo]}>
                      <Text style={[styles.chipStatusTexto, { color: '#B4650E' }]}>🏷 Falta Explosivo</Text>
                    </View>
                  )}
                </View>

                {item.status === 'pendente' && itemEmDivergencia !== item.id && tipoJornal && (
                  <View>
                    <View style={styles.itemAcoes}>
                      <TouchableOpacity
                        style={[styles.btnOk, salvandoItem === item.id && styles.btnDesabilitado]}
                        onPress={() => confirmarOk(item)}
                        disabled={!!salvandoItem}
                      >
                        <Text style={styles.btnOkTexto}>✓ OK</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.itemAcoes}>
                      <TouchableOpacity
                        style={[styles.btnDivergencia, salvandoItem === item.id && styles.btnDesabilitado]}
                        onPress={() => confirmarRuptura(item)}
                        disabled={!!salvandoItem}
                      >
                        <Text style={styles.btnDivergenciaTexto}>⚠ Ruptura</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btnFaltaExplosivo, salvandoItem === item.id && styles.btnDesabilitado]}
                        onPress={() => confirmarFaltaExplosivo(item)}
                        disabled={!!salvandoItem}
                      >
                        <Text style={styles.btnFaltaExplosivoTexto}>🏷 Falta Explosivo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {item.status === 'pendente' && itemEmDivergencia !== item.id && !tipoJornal && (
                  <View style={styles.itemAcoes}>
                    <TouchableOpacity
                      style={[styles.btnOk, salvandoItem === item.id && styles.btnDesabilitado]}
                      onPress={() => confirmarOk(item)}
                      disabled={!!salvandoItem}
                    >
                      <Text style={styles.btnOkTexto}>✓ OK</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnDivergencia, salvandoItem === item.id && styles.btnDesabilitado]}
                      onPress={() => abrirDivergencia(item)}
                      disabled={!!salvandoItem}
                    >
                      <Text style={styles.btnDivergenciaTexto}>⚠ Divergência</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {item.status !== 'pendente' && tipoJornal && (
                  <View style={styles.itemAcoes}>
                    <TouchableOpacity onPress={() => confirmarOk(item)} disabled={!!salvandoItem}>
                      <Text style={styles.btnRefazerTexto}>Marcar OK</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmarRuptura(item)} disabled={!!salvandoItem}>
                      <Text style={styles.btnRefazerTexto}>Marcar Ruptura</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmarFaltaExplosivo(item)} disabled={!!salvandoItem}>
                      <Text style={styles.btnRefazerTexto}>Marcar Falta Explosivo</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {item.status !== 'pendente' && !tipoJornal && (
                  <TouchableOpacity onPress={() => abrirDivergencia({ ...item, status: 'pendente' } as ConferenciaItem)}>
                    <Text style={styles.btnRefazerTexto}>Corrigir</Text>
                  </TouchableOpacity>
                )}

                {itemEmDivergencia === item.id && (
                  <View style={styles.divergenciaBox}>
                    <Text style={styles.formLabel}>Quantidade que realmente chegou</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      value={quantidadeReal}
                      onChangeText={setQuantidadeReal}
                      keyboardType="numeric"
                    />
                    {fotoUri ? (
                      <View style={{ marginTop: spacing.sm }}>
                        <Image source={{ uri: fotoUri }} style={styles.fotoPreview} />
                        <TouchableOpacity onPress={() => setFotoUri(null)}>
                          <Text style={styles.btnRemoverFotoTexto}>Remover foto</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.btnAdicionarFoto} onPress={escolherFoto}>
                        <Text style={styles.btnAdicionarFotoTexto}>+ Adicionar foto (opcional)</Text>
                      </TouchableOpacity>
                    )}
                    <View style={styles.itemAcoes}>
                      <TouchableOpacity style={styles.btnCancelarDivergencia} onPress={() => setItemEmDivergencia(null)}>
                        <Text style={styles.btnCancelarDivergenciaTexto}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btnConfirmarDivergencia, salvandoItem === item.id && styles.btnDesabilitado]}
                        onPress={() => confirmarDivergencia(item)}
                        disabled={salvandoItem === item.id}
                      >
                        <Text style={styles.btnConfirmarDivergenciaTexto}>
                          {salvandoItem === item.id ? 'Salvando…' : 'Confirmar divergência'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>

        {todosConferidos && (
          <TouchableOpacity style={styles.btnConcluir} onPress={concluir} disabled={concluindo}>
            <Text style={styles.btnConcluirTexto}>{concluindo ? 'Enviando…' : 'Concluir e enviar pros administradores'}</Text>
          </TouchableOpacity>
        )}

        {jornalAtual && (
          <VisualizadorJornalModal
            visible={verJornal}
            arquivoUrl={jornalAtual.arquivoUrl}
            onFechar={() => setVerJornal(false)}
          />
        )}
      </View>
    );
  }

  // --- Lista de conferências -----------------------------------------------
  const lista = conferencias.filter((c) => (filtro === 'pendentes' ? c.status === 'pendente' : c.status === 'concluida'));

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Conferência</Text>
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
              carregarLista();
            }}
          />
        }
      >
        <View style={styles.chipsWrap}>
          <TouchableOpacity style={[styles.chip, filtro === 'pendentes' && styles.chipAtivo]} onPress={() => setFiltro('pendentes')}>
            <Text style={[styles.chipTexto, filtro === 'pendentes' && styles.chipTextoAtivo]}>Pendentes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, filtro === 'concluidas' && styles.chipAtivo]} onPress={() => setFiltro('concluidas')}>
            <Text style={[styles.chipTexto, filtro === 'concluidas' && styles.chipTextoAtivo]}>Concluídas</Text>
          </TouchableOpacity>
        </View>

        {carregandoLista ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : lista.length === 0 ? (
          <Text style={styles.vazioTexto}>
            {filtro === 'pendentes' ? 'Nenhuma conferência pendente no momento.' : 'Nenhuma conferência concluída ainda.'}
          </Text>
        ) : (
          lista.map((c) => (
            <TouchableOpacity key={c.id} style={styles.card} onPress={() => abrirConferencia(c)}>
              <Text style={styles.cardTitulo}>{c.titulo}</Text>
              <Text style={styles.cardMeta}>
                Criada por {c.criadaPorNome}
                {c.conferidaPorNome ? ` · Conferida por ${c.conferidaPorNome}` : ''}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={escolherTipoNovaConferencia}>
        <Text style={styles.fabTexto}>+</Text>
      </TouchableOpacity>
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
  titulo: { fontSize: 16, fontWeight: '700', color: colors.navy900, flex: 1, textAlign: 'center' },
  progressoBox: { backgroundColor: colors.white, paddingVertical: spacing.sm, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  progressoTexto: { fontSize: 12, fontWeight: '700', color: colors.navy700 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  vazioTexto: { fontSize: 12.5, color: colors.gray600, textAlign: 'center', paddingVertical: spacing.xxl },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardTitulo: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  cardMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 4 },
  nfBox: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  itemCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  itemTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  itemProduto: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  itemMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  chipStatus: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipOk: { backgroundColor: '#DFF3E9' },
  chipDivergencia: { backgroundColor: '#FBDEDC' },
  chipFaltaExplosivo: { backgroundColor: '#FBEBD4' },
  chipStatusTexto: { fontSize: 10.5, fontWeight: '700' },
  itemAcoes: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btnOk: { flex: 1, backgroundColor: colors.green500, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  btnOkTexto: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  btnDivergencia: { flex: 1, backgroundColor: '#FBDEDC', borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  btnDivergenciaTexto: { color: colors.red500, fontSize: 12.5, fontWeight: '700' },
  btnFaltaExplosivo: { flex: 1, backgroundColor: '#FBEBD4', borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  btnFaltaExplosivoTexto: { color: '#B4650E', fontSize: 12.5, fontWeight: '700' },
  btnDesabilitado: { opacity: 0.6 },
  btnRefazerTexto: { fontSize: 11.5, color: colors.navy700, fontWeight: '700', marginTop: spacing.sm },
  btnReiniciarTexto: { fontSize: 12, color: colors.navy700, fontWeight: '700' },
  divergenciaBox: { backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  formLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900, borderWidth: 1, borderColor: colors.gray100 },
  fotoPreview: { width: '100%', height: 140, borderRadius: radius.md, backgroundColor: colors.gray100 },
  btnRemoverFotoTexto: { fontSize: 12, color: colors.red500, fontWeight: '600', marginTop: 6 },
  btnAdicionarFoto: { borderWidth: 1, borderColor: colors.gray100, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.sm },
  btnAdicionarFotoTexto: { fontSize: 12, color: colors.navy700, fontWeight: '700' },
  jornalAvisoTexto: { fontSize: 11.5, color: colors.gray600, lineHeight: 17, marginTop: spacing.sm },
  btnCancelarDivergencia: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  btnCancelarDivergenciaTexto: { color: colors.gray600, fontSize: 12.5, fontWeight: '600' },
  btnConfirmarDivergencia: { flex: 1.4, backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  btnConfirmarDivergenciaTexto: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  btnConcluir: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: colors.navy700,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  btnConcluirTexto: { color: colors.white, fontSize: 14, fontWeight: '700' },
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
  formCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  secaoTitulo: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginBottom: spacing.sm },
  itemNovoCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  linhaDupla: { flexDirection: 'row', gap: spacing.sm },
  btnAdicionarItem: { borderWidth: 1, borderColor: colors.gray100, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginBottom: spacing.lg },
  btnAdicionarItemTexto: { fontSize: 12.5, color: colors.navy700, fontWeight: '700' },
  btnSalvar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  btnSalvarTexto: { color: colors.white, fontSize: 13, fontWeight: '700' },
});
