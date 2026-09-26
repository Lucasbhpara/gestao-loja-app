import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { setores, SetorKey } from '../data/employees';
import { ColaboradorLoja, buscarColaboradoresLoja, buscarColaboradoresLojaDoSetor } from '../data/colaboradoresLojaApi';
import {
  RegistroEscala,
  TipoEscala,
  buscarEscalaDeVariosNoDia,
  registrarFaltaOuAtestado,
  removerRegistroEscala,
  enviarFotoAtestado,
} from '../data/escalaApi';
import SeletorDataValidade from '../components/SeletorDataValidade';

// Escala de Folgas + Faltas/Atestados — a mesma tela serve pra gerência
// (enxerga e lança em qualquer setor, com seletor) e pra encarregado (só
// lança dentro do próprio setor, sem seletor). Quem decide isso é o
// HomeAdminScreen/HomeColaboradorScreen, que só exibem o botão de entrada
// pra quem pode usar — aqui dentro só olhamos usuarioAtual.isAdmin pra
// saber se mostra o seletor de setor ou trava no setor da pessoa.
//
// A tela mostra UM DIA por vez (hoje por padrão, com seta pra navegar pros
// outros dias ou tocar na data pra abrir o calendário) — a ideia é o
// encarregado abrir e já ver, de cara, quem ele pode contar naquele dia:
// quem não tem nenhum registro aparece normal ("presente"); quem tem folga,
// férias/licença/INSS, falta ou atestado aparece apagado, com uma etiqueta
// dizendo o motivo. Tocar em qualquer colaborador (presente ou não) abre o
// formulário pra lançar falta/atestado naquele dia.
//
// "Só registrar": diferente do Checklist de Setor, lançar uma falta ou
// atestado aqui NÃO cria tarefa nem alerta ninguém sozinho — é só o
// registro, que já entra na escala do colaborador (ver escalaApi.ts).

const LABEL_TIPO: Record<TipoEscala, { texto: string; cor: string; fundo: string }> = {
  folga: { texto: 'Folga', cor: colors.gray600, fundo: colors.gray100 },
  ferias_licenca_inss: { texto: 'Férias/Licença/INSS', cor: colors.navy700, fundo: '#DCE2F5' },
  falta: { texto: 'Falta', cor: colors.red500, fundo: '#FBDEDC' },
  atestado: { texto: 'Atestado', cor: '#B5750E', fundo: '#FBEBD4' },
};

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const hitSlopPadrao = { top: 10, bottom: 10, left: 10, right: 10 };

function isoHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoParaData(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function somarDias(iso: string, delta: number): string {
  const d = isoParaData(iso);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatarDataCurta(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

function tituloDoDia(iso: string): string {
  const d = isoParaData(iso);
  const base = `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES_EXTENSO[d.getMonth()]}`;
  const hoje = isoHoje();
  if (iso === hoje) return `Hoje — ${base}`;
  if (iso === somarDias(hoje, -1)) return `Ontem — ${base}`;
  if (iso === somarDias(hoje, 1)) return `Amanhã — ${base}`;
  return base;
}

export default function EscalaFaltaAtestadoScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const souGerencia = !!usuarioAtual?.isAdmin;
  const setorFixo = !souGerencia ? usuarioAtual?.setor ?? null : null;

  const [dataSelecionada, setDataSelecionada] = useState(isoHoje());

  const [todosColaboradores, setTodosColaboradores] = useState<ColaboradorLoja[]>([]);
  const [setorSelecionado, setSetorSelecionado] = useState<SetorKey | null>(setorFixo);
  const [carregandoColaboradores, setCarregandoColaboradores] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [registrosDoDia, setRegistrosDoDia] = useState<Map<string, RegistroEscala>>(new Map());
  const [carregandoRegistros, setCarregandoRegistros] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const [colaboradorAtivo, setColaboradorAtivo] = useState<ColaboradorLoja | null>(null);
  const [tipoForm, setTipoForm] = useState<'falta' | 'atestado'>('falta');
  const [observacaoForm, setObservacaoForm] = useState('');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function carregarColaboradores() {
    setCarregandoColaboradores(true);
    const promessa = souGerencia ? buscarColaboradoresLoja() : buscarColaboradoresLojaDoSetor(setorFixo as SetorKey);
    promessa
      .then((lista) => {
        setTodosColaboradores(lista);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar os colaboradores.'))
      .finally(() => {
        setCarregandoColaboradores(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregarColaboradores();
  }, []);

  const setoresComGente = useMemo(() => {
    if (!souGerencia) return [];
    const chaves = new Set(todosColaboradores.map((c) => c.setor));
    return setores.filter((s) => chaves.has(s.key));
  }, [todosColaboradores, souGerencia]);

  useEffect(() => {
    if (souGerencia && !setorSelecionado && setoresComGente.length > 0) {
      setSetorSelecionado(setoresComGente[0].key);
    }
  }, [setoresComGente, souGerencia, setorSelecionado]);

  const colaboradoresDoSetor = useMemo(
    () => todosColaboradores.filter((c) => c.setor === setorSelecionado),
    [todosColaboradores, setorSelecionado]
  );

  function carregarRegistros() {
    if (colaboradoresDoSetor.length === 0) {
      setRegistrosDoDia(new Map());
      return;
    }
    setCarregandoRegistros(true);
    buscarEscalaDeVariosNoDia(colaboradoresDoSetor.map((c) => c.id), dataSelecionada)
      .then((registros) => {
        const mapa = new Map<string, RegistroEscala>();
        registros.forEach((r) => mapa.set(r.colaboradorLojaId, r));
        setRegistrosDoDia(mapa);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar a escala do dia.'))
      .finally(() => setCarregandoRegistros(false));
  }

  useEffect(() => {
    carregarRegistros();
  }, [colaboradoresDoSetor, dataSelecionada]);

  if (!usuarioAtual) return null;

  function trocarDia(delta: number) {
    setDataSelecionada((atual) => somarDias(atual, delta));
  }

  function abrirColaborador(c: ColaboradorLoja) {
    setColaboradorAtivo(c);
    setTipoForm('falta');
    setObservacaoForm('');
    setFotoUri(null);
  }

  function escolherFoto() {
    Alert.alert('Foto do atestado', 'Anexar a foto do atestado ajuda a documentar o afastamento.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto agora', onPress: () => capturarFoto('camera') },
      { text: 'Escolher da galeria', onPress: () => capturarFoto('galeria') },
    ]);
  }

  async function capturarFoto(origem: 'camera' | 'galeria') {
    let uri: string | null = null;
    if (origem === 'camera') {
      const permissao = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert('Sem permissão', 'Precisa liberar o acesso à câmera nas configurações do celular.');
        return;
      }
      const resultado = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      if (!resultado.canceled && resultado.assets?.[0]) uri = resultado.assets[0].uri;
    } else {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert('Sem permissão', 'Precisa liberar o acesso às fotos nas configurações do celular.');
        return;
      }
      const resultado = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!resultado.canceled && resultado.assets?.[0]) uri = resultado.assets[0].uri;
    }
    if (uri) setFotoUri(uri);
  }

  function salvarRegistro() {
    if (!colaboradorAtivo) return;
    if (tipoForm === 'atestado' && !fotoUri) {
      Alert.alert('Foto obrigatória', 'Anexe uma foto do atestado antes de salvar.');
      return;
    }
    const existente = registrosDoDia.get(colaboradorAtivo.id);
    if (existente && existente.tipo !== tipoForm) {
      Alert.alert(
        'Já existe um registro nesse dia',
        `${formatarDataCurta(dataSelecionada)} já está marcado como "${LABEL_TIPO[existente.tipo].texto}" para ${colaboradorAtivo.nome}. Substituir por "${LABEL_TIPO[tipoForm].texto}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Substituir', style: 'destructive', onPress: confirmarESalvar },
        ]
      );
      return;
    }
    confirmarESalvar();
  }

  async function confirmarESalvar() {
    if (!usuarioAtual || !colaboradorAtivo) return;
    const colaborador = colaboradorAtivo;
    const tipoSalvo = tipoForm;
    setSalvando(true);
    try {
      let fotoUrl: string | null = null;
      if (fotoUri) {
        fotoUrl = await enviarFotoAtestado(fotoUri);
      }
      await registrarFaltaOuAtestado({
        colaboradorLojaId: colaborador.id,
        data: dataSelecionada,
        tipo: tipoSalvo,
        observacao: observacaoForm.trim() || null,
        fotoUrl,
        registradoPorNome: usuarioAtual.nome,
      });
      carregarRegistros();
      setColaboradorAtivo(null);
      Alert.alert('Registrado', `${LABEL_TIPO[tipoSalvo].texto} de ${colaborador.nome} em ${formatarDataCurta(dataSelecionada)} foi registrado.`);
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não consegui salvar o registro.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarRemocao() {
    if (!colaboradorAtivo) return;
    const registro = registrosDoDia.get(colaboradorAtivo.id);
    if (!registro) return;
    const nomeColaborador = colaboradorAtivo.nome;
    Alert.alert(
      'Remover registro',
      `Remover o lançamento de "${LABEL_TIPO[registro.tipo].texto}" de ${nomeColaborador} em ${formatarDataCurta(registro.data)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            removerRegistroEscala(registro.id)
              .then(() => {
                carregarRegistros();
                setColaboradorAtivo(null);
              })
              .catch((e) => Alert.alert('Erro', e?.message ?? 'Não consegui remover o registro.'));
          },
        },
      ]
    );
  }

  const registroAtivo = colaboradorAtivo ? registrosDoDia.get(colaboradorAtivo.id) ?? null : null;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Faltas e Atestados</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.diaNav}>
        <TouchableOpacity onPress={() => trocarDia(-1)} hitSlop={hitSlopPadrao} style={styles.diaSetaBtn}>
          <Text style={styles.diaSeta}>‹</Text>
        </TouchableOpacity>
        <View style={styles.diaCentro}>
          <Text style={styles.diaTitulo}>{tituloDoDia(dataSelecionada)}</Text>
          <View style={styles.diaCalendarioCaixa}>
            <SeletorDataValidade valor={dataSelecionada} onSelecionar={setDataSelecionada} />
          </View>
        </View>
        <TouchableOpacity onPress={() => trocarDia(1)} hitSlop={hitSlopPadrao} style={styles.diaSetaBtn}>
          <Text style={styles.diaSeta}>›</Text>
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
              carregarColaboradores();
            }}
          />
        }
      >
        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {souGerencia && setoresComGente.length > 0 && (
          <View style={styles.chipsWrap}>
            {setoresComGente.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.chip, setorSelecionado === s.key && styles.chipAtivo]}
                onPress={() => setSetorSelecionado(s.key)}
              >
                <Text style={[styles.chipTexto, setorSelecionado === s.key && styles.chipTextoAtivo]}>{s.nome}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {carregandoColaboradores ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : colaboradoresDoSetor.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>
              Nenhum colaborador cadastrado ainda {souGerencia ? 'nesse setor' : 'no seu setor'}.
            </Text>
          </View>
        ) : (
          <>
            {carregandoRegistros && (
              <ActivityIndicator size="small" color={colors.navy700} style={{ marginBottom: spacing.md }} />
            )}
            {colaboradoresDoSetor.map((c) => {
              const registro = registrosDoDia.get(c.id);
              const ausente = !!registro;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.pessoaCard, ausente && styles.pessoaCardAusente]}
                  onPress={() => abrirColaborador(c)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pessoaNome, ausente && styles.pessoaNomeAusente]}>{c.nome}</Text>
                    {!!c.cargo && (
                      <Text style={[styles.pessoaCargo, ausente && styles.pessoaCargoAusente]}>{c.cargo}</Text>
                    )}
                  </View>
                  {registro ? (
                    <View style={[styles.tipoBadge, { backgroundColor: LABEL_TIPO[registro.tipo].fundo }]}>
                      <Text style={[styles.tipoBadgeTexto, { color: LABEL_TIPO[registro.tipo].cor }]}>
                        {LABEL_TIPO[registro.tipo].texto}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.presenteBadge}>
                      <View style={styles.presenteDot} />
                      <Text style={styles.presenteTexto}>Presente</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal
        visible={!!colaboradorAtivo}
        animationType="slide"
        transparent
        onRequestClose={() => setColaboradorAtivo(null)}
      >
        <View style={styles.modalFundo}>
          <View style={styles.modalCartao}>
            <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
              {colaboradorAtivo && (
                <>
                  <View style={styles.modalTopo}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalNome}>{colaboradorAtivo.nome}</Text>
                      <Text style={styles.modalData}>{tituloDoDia(dataSelecionada)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setColaboradorAtivo(null)} hitSlop={hitSlopPadrao}>
                      <Text style={styles.modalFechar}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {registroAtivo && (
                    <View style={styles.modalStatusAtual}>
                      <View style={styles.modalStatusTopo}>
                        <View style={[styles.tipoBadge, { backgroundColor: LABEL_TIPO[registroAtivo.tipo].fundo }]}>
                          <Text style={[styles.tipoBadgeTexto, { color: LABEL_TIPO[registroAtivo.tipo].cor }]}>
                            {LABEL_TIPO[registroAtivo.tipo].texto}
                          </Text>
                        </View>
                        {(registroAtivo.tipo === 'falta' || registroAtivo.tipo === 'atestado') && (
                          <TouchableOpacity onPress={confirmarRemocao} hitSlop={hitSlopPadrao}>
                            <Text style={styles.removerTexto}>Remover</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      {!!registroAtivo.registradoPorNome && (registroAtivo.tipo === 'falta' || registroAtivo.tipo === 'atestado') && (
                        <Text style={styles.registroInfo}>Lançado por {registroAtivo.registradoPorNome}</Text>
                      )}
                      {!!registroAtivo.observacao && <Text style={styles.registroInfo}>{registroAtivo.observacao}</Text>}
                      {!!registroAtivo.fotoUrl && (
                        <Image source={{ uri: registroAtivo.fotoUrl }} style={styles.registroFoto} resizeMode="cover" />
                      )}
                    </View>
                  )}

                  <Text style={styles.formLabel}>Registrar falta ou atestado</Text>
                  <View style={styles.chipsWrap}>
                    <TouchableOpacity
                      style={[styles.chip, tipoForm === 'falta' && styles.chipAtivo]}
                      onPress={() => setTipoForm('falta')}
                    >
                      <Text style={[styles.chipTexto, tipoForm === 'falta' && styles.chipTextoAtivo]}>Falta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, tipoForm === 'atestado' && styles.chipAtivo]}
                      onPress={() => setTipoForm('atestado')}
                    >
                      <Text style={[styles.chipTexto, tipoForm === 'atestado' && styles.chipTextoAtivo]}>Atestado</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.formLabel}>Observação (opcional)</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultilinha]}
                    placeholder="Detalhes, se precisar"
                    value={observacaoForm}
                    onChangeText={setObservacaoForm}
                    multiline
                  />

                  <Text style={styles.formLabel}>
                    Foto {tipoForm === 'atestado' ? 'do atestado (obrigatória)' : '(opcional)'}
                  </Text>
                  {fotoUri ? (
                    <View style={styles.fotoPreviewLinha}>
                      <Image source={{ uri: fotoUri }} style={styles.fotoPreview} />
                      <TouchableOpacity onPress={() => setFotoUri(null)}>
                        <Text style={styles.removerTexto}>Remover foto</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.btnFoto} onPress={escolherFoto}>
                      <Text style={styles.btnFotoTexto}>📷 Anexar foto</Text>
                    </TouchableOpacity>
                  )}

                  <View style={styles.formBotoes}>
                    <TouchableOpacity style={styles.btnCancelar} onPress={() => setColaboradorAtivo(null)}>
                      <Text style={styles.btnCancelarTexto}>Fechar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnSalvar, salvando && styles.btnSalvarDesabilitado]}
                      onPress={salvarRegistro}
                      disabled={salvando}
                    >
                      <Text style={styles.btnSalvarTexto}>{salvando ? 'Salvando…' : 'Salvar'}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: spacing.xl,
  },
  voltar: { color: colors.navy700, fontSize: 14, fontWeight: '600', width: 50 },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.gray900 },
  diaNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  diaSetaBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  diaSeta: { fontSize: 20, fontWeight: '700', color: colors.navy700 },
  diaCentro: { flex: 1, alignItems: 'center', gap: 6 },
  diaTitulo: { fontSize: 13.5, fontWeight: '700', color: colors.gray900, textAlign: 'center' },
  diaCalendarioCaixa: { width: 150 },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  erroTexto: { color: colors.red500, fontSize: 12.5 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: { borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white, borderRadius: radius.full, paddingVertical: 7, paddingHorizontal: 14 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  vazio: { padding: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center' },
  pessoaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  pessoaCardAusente: { backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.gray100 },
  pessoaNome: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  pessoaNomeAusente: { color: colors.gray400 },
  pessoaCargo: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  pessoaCargoAusente: { color: colors.gray400 },
  presenteBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  presenteDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: colors.green500 },
  presenteTexto: { fontSize: 11.5, fontWeight: '700', color: colors.green500 },
  tipoBadge: { borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 11 },
  tipoBadgeTexto: { fontSize: 10.5, fontWeight: '700' },
  registroInfo: { fontSize: 11.5, color: colors.gray600, marginTop: 6 },
  registroFoto: { width: 64, height: 64, borderRadius: radius.sm, marginTop: 8 },
  removerTexto: { fontSize: 11.5, fontWeight: '700', color: colors.red500 },
  formLabel: { fontSize: 11.5, fontWeight: '700', color: colors.gray600, marginTop: spacing.lg, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: spacing.md, fontSize: 13, color: colors.gray900 },
  inputMultilinha: { minHeight: 60, textAlignVertical: 'top' },
  btnFoto: { alignItems: 'center', paddingVertical: 10, backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md },
  btnFotoTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray900 },
  fotoPreviewLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fotoPreview: { width: 64, height: 64, borderRadius: radius.sm },
  formBotoes: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  btnCancelar: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white },
  btnCancelarTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  btnSalvar: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.navy700 },
  btnSalvarDesabilitado: { opacity: 0.6 },
  btnSalvarTexto: { fontSize: 12.5, fontWeight: '700', color: colors.white },
  modalFundo: { flex: 1, backgroundColor: 'rgba(18,27,74,0.45)', justifyContent: 'flex-end' },
  modalCartao: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '88%' },
  modalTopo: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  modalNome: { fontSize: 17, fontWeight: '800', color: colors.gray900 },
  modalData: { fontSize: 12.5, color: colors.gray600, marginTop: 2 },
  modalFechar: { fontSize: 16, color: colors.gray400, padding: 4 },
  modalStatusAtual: { backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  modalStatusTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
