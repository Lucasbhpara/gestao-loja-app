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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { setores, SetorKey } from '../data/employees';
import { ColaboradorLoja, buscarColaboradoresLoja, buscarColaboradoresLojaDoSetor } from '../data/colaboradoresLojaApi';
import {
  RegistroEscala,
  TipoEscala,
  buscarEscalaDeVariosNoMes,
  registrarFaltaOuAtestado,
  removerRegistroEscala,
  enviarFotoAtestado,
} from '../data/escalaApi';

// Escala de Folgas + Faltas/Atestados — a mesma tela serve pra gerência
// (enxerga e lança em qualquer setor, com seletor) e pra encarregado (só
// lança dentro do próprio setor, sem seletor). Quem decide isso é o
// HomeAdminScreen/HomeColaboradorScreen, que só exibem o botão de entrada
// pra quem pode usar — aqui dentro só olhamos usuarioAtual.isAdmin pra
// saber se mostra o seletor de setor ou trava no setor da pessoa.
//
// "Só registrar": diferente do Checklist de Setor, lançar uma falta ou
// atestado aqui NÃO cria tarefa nem alerta ninguém sozinho — é só o
// registro, que já entra na escala do colaborador (ver escalaApi.ts).

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const LABEL_TIPO: Record<TipoEscala, { texto: string; cor: string; fundo: string }> = {
  folga: { texto: 'Folga', cor: colors.gray600, fundo: colors.gray100 },
  ferias_licenca_inss: { texto: 'Férias/Licença/INSS', cor: colors.navy700, fundo: '#DCE2F5' },
  falta: { texto: 'Falta', cor: colors.red500, fundo: '#FBDEDC' },
  atestado: { texto: 'Atestado', cor: '#B5750E', fundo: '#FBEBD4' },
};

function isoHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatarDataCurta(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

function dataValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso + 'T00:00:00');
  return !isNaN(d.getTime());
}

export default function EscalaFaltaAtestadoScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const souGerencia = !!usuarioAtual?.isAdmin;
  const setorFixo = !souGerencia ? usuarioAtual?.setor ?? null : null;

  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1); // 1-12

  const [todosColaboradores, setTodosColaboradores] = useState<ColaboradorLoja[]>([]);
  const [setorSelecionado, setSetorSelecionado] = useState<SetorKey | null>(setorFixo);
  const [carregandoColaboradores, setCarregandoColaboradores] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [resumoMes, setResumoMes] = useState<Map<string, RegistroEscala[]>>(new Map());
  const [carregandoResumo, setCarregandoResumo] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const [colaboradorAberto, setColaboradorAberto] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [dataForm, setDataForm] = useState(isoHoje());
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

  function carregarResumo() {
    if (colaboradoresDoSetor.length === 0) {
      setResumoMes(new Map());
      return;
    }
    setCarregandoResumo(true);
    buscarEscalaDeVariosNoMes(colaboradoresDoSetor.map((c) => c.id), ano, mes)
      .then((registros) => {
        const mapa = new Map<string, RegistroEscala[]>();
        registros.forEach((r) => {
          const lista = mapa.get(r.colaboradorLojaId) ?? [];
          lista.push(r);
          mapa.set(r.colaboradorLojaId, lista);
        });
        mapa.forEach((lista) => lista.sort((a, b) => (a.data < b.data ? -1 : 1)));
        setResumoMes(mapa);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar a escala do mês.'))
      .finally(() => setCarregandoResumo(false));
  }

  useEffect(() => {
    carregarResumo();
  }, [colaboradoresDoSetor, ano, mes]);

  if (!usuarioAtual) return null;

  function trocarMes(delta: number) {
    let novoMes = mes + delta;
    let novoAno = ano;
    if (novoMes > 12) { novoMes = 1; novoAno += 1; }
    if (novoMes < 1) { novoMes = 12; novoAno -= 1; }
    setMes(novoMes);
    setAno(novoAno);
    setColaboradorAberto(null);
    setMostrarForm(false);
  }

  function alternarColaborador(id: string) {
    setColaboradorAberto((atual) => (atual === id ? null : id));
    setMostrarForm(false);
    setObservacaoForm('');
    setFotoUri(null);
    setTipoForm('falta');
    setDataForm(isoHoje());
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

  function salvarRegistro(colaborador: ColaboradorLoja) {
    if (!dataValida(dataForm)) {
      Alert.alert('Data inválida', 'Use o formato AAAA-MM-DD com uma data válida (ex: 2026-09-26).');
      return;
    }
    if (tipoForm === 'atestado' && !fotoUri) {
      Alert.alert('Foto obrigatória', 'Anexe uma foto do atestado antes de salvar.');
      return;
    }
    const registrosDoColaborador = resumoMes.get(colaborador.id) ?? [];
    const existente = registrosDoColaborador.find((r) => r.data === dataForm);
    if (existente && existente.tipo !== tipoForm) {
      Alert.alert(
        'Já existe um registro nesse dia',
        `${formatarDataCurta(dataForm)} já está marcado como "${LABEL_TIPO[existente.tipo].texto}" para ${colaborador.nome}. Substituir por "${LABEL_TIPO[tipoForm].texto}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Substituir', style: 'destructive', onPress: () => confirmarESalvar(colaborador) },
        ]
      );
      return;
    }
    confirmarESalvar(colaborador);
  }

  async function confirmarESalvar(colaborador: ColaboradorLoja) {
    if (!usuarioAtual) return;
    const tipoSalvo = tipoForm;
    const dataSalva = dataForm;
    setSalvando(true);
    try {
      let fotoUrl: string | null = null;
      if (fotoUri) {
        fotoUrl = await enviarFotoAtestado(fotoUri);
      }
      await registrarFaltaOuAtestado({
        colaboradorLojaId: colaborador.id,
        data: dataSalva,
        tipo: tipoSalvo,
        observacao: observacaoForm.trim() || null,
        fotoUrl,
        registradoPorNome: usuarioAtual.nome,
      });
      carregarResumo();
      setMostrarForm(false);
      setObservacaoForm('');
      setFotoUri(null);
      setTipoForm('falta');
      setDataForm(isoHoje());
      Alert.alert('Registrado', `${LABEL_TIPO[tipoSalvo].texto} de ${colaborador.nome} em ${formatarDataCurta(dataSalva)} foi registrado.`);
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? 'Não consegui salvar o registro.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarRemocao(registro: RegistroEscala, nomeColaborador: string) {
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
              .then(carregarResumo)
              .catch((e) => Alert.alert('Erro', e?.message ?? 'Não consegui remover o registro.'));
          },
        },
      ]
    );
  }

  function resumoDoColaborador(id: string): string {
    const registros = resumoMes.get(id) ?? [];
    if (registros.length === 0) return 'Nenhum registro esse mês';
    const porTipo: Record<string, number> = {};
    registros.forEach((r) => { porTipo[r.tipo] = (porTipo[r.tipo] ?? 0) + 1; });
    return Object.entries(porTipo)
      .map(([tipo, n]) => `${n} ${LABEL_TIPO[tipo as TipoEscala].texto.toLowerCase()}${n > 1 ? 's' : ''}`)
      .join(' · ');
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Faltas e Atestados</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.mesNav}>
        <TouchableOpacity onPress={() => trocarMes(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.mesSeta}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.mesTexto}>{MESES[mes - 1]} de {ano}</Text>
        <TouchableOpacity onPress={() => trocarMes(1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.mesSeta}>›</Text>
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
                onPress={() => { setSetorSelecionado(s.key); setColaboradorAberto(null); setMostrarForm(false); }}
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
          colaboradoresDoSetor.map((c) => {
            const aberto = colaboradorAberto === c.id;
            const registros = resumoMes.get(c.id) ?? [];
            return (
              <View key={c.id} style={styles.colaboradorCard}>
                <TouchableOpacity style={styles.colaboradorTopo} onPress={() => alternarColaborador(c.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.colaboradorNome}>{c.nome}</Text>
                    <Text style={styles.colaboradorResumo}>
                      {carregandoResumo ? 'Carregando…' : resumoDoColaborador(c.id)}
                    </Text>
                  </View>
                  <Text style={styles.colaboradorSeta}>{aberto ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {aberto && (
                  <View style={styles.detalhe}>
                    {registros.length > 0 && (
                      <View style={styles.listaRegistros}>
                        {registros.map((r) => (
                          <View key={r.id} style={styles.registroRow}>
                            <View style={{ flex: 1 }}>
                              <View style={styles.registroTopo}>
                                <Text style={styles.registroData}>{formatarDataCurta(r.data)}</Text>
                                <View style={[styles.tipoBadge, { backgroundColor: LABEL_TIPO[r.tipo].fundo }]}>
                                  <Text style={[styles.tipoBadgeTexto, { color: LABEL_TIPO[r.tipo].cor }]}>
                                    {LABEL_TIPO[r.tipo].texto}
                                  </Text>
                                </View>
                              </View>
                              {!!r.registradoPorNome && (r.tipo === 'falta' || r.tipo === 'atestado') && (
                                <Text style={styles.registroInfo}>Lançado por {r.registradoPorNome}</Text>
                              )}
                              {!!r.observacao && <Text style={styles.registroInfo}>{r.observacao}</Text>}
                              {!!r.fotoUrl && (
                                <Image source={{ uri: r.fotoUrl }} style={styles.registroFoto} resizeMode="cover" />
                              )}
                            </View>
                            {(r.tipo === 'falta' || r.tipo === 'atestado') && (
                              <TouchableOpacity onPress={() => confirmarRemocao(r, c.nome)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Text style={styles.removerTexto}>Remover</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                      </View>
                    )}

                    {!mostrarForm ? (
                      <TouchableOpacity style={styles.btnAbrirForm} onPress={() => setMostrarForm(true)}>
                        <Text style={styles.btnAbrirFormTexto}>+ Registrar falta ou atestado</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.formCard}>
                        <Text style={styles.formLabel}>Tipo</Text>
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

                        <Text style={styles.formLabel}>Data</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="AAAA-MM-DD"
                          value={dataForm}
                          onChangeText={setDataForm}
                          maxLength={10}
                        />

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
                          <TouchableOpacity
                            style={styles.btnCancelar}
                            onPress={() => { setMostrarForm(false); setObservacaoForm(''); setFotoUri(null); }}
                          >
                            <Text style={styles.btnCancelarTexto}>Cancelar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.btnSalvar, salvando && styles.btnSalvarDesabilitado]}
                            onPress={() => salvarRegistro(c)}
                            disabled={salvando}
                          >
                            <Text style={styles.btnSalvarTexto}>{salvando ? 'Salvando…' : 'Salvar'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
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
    paddingHorizontal: spacing.xl,
  },
  voltar: { color: colors.navy700, fontSize: 14, fontWeight: '600', width: 50 },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.gray900 },
  mesNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
    paddingVertical: spacing.md,
  },
  mesSeta: { fontSize: 20, fontWeight: '700', color: colors.navy700, paddingHorizontal: spacing.md },
  mesTexto: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  erroTexto: { color: colors.red500, fontSize: 12.5 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: { borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white, borderRadius: radius.full, paddingVertical: 7, paddingHorizontal: 14 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  vazio: { padding: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center' },
  colaboradorCard: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden' },
  colaboradorTopo: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg },
  colaboradorNome: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  colaboradorResumo: { fontSize: 12, color: colors.gray600, marginTop: 2 },
  colaboradorSeta: { fontSize: 12, color: colors.gray400, marginLeft: spacing.sm },
  detalhe: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  listaRegistros: { borderTopWidth: 1, borderTopColor: colors.gray100, paddingTop: spacing.md, marginBottom: spacing.md },
  registroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 8 },
  registroTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  registroData: { fontSize: 12.5, fontWeight: '700', color: colors.gray900, width: 38 },
  tipoBadge: { borderRadius: radius.full, paddingVertical: 2, paddingHorizontal: 9 },
  tipoBadgeTexto: { fontSize: 10.5, fontWeight: '700' },
  registroInfo: { fontSize: 11.5, color: colors.gray600, marginTop: 3 },
  registroFoto: { width: 64, height: 64, borderRadius: radius.sm, marginTop: 6 },
  removerTexto: { fontSize: 11.5, fontWeight: '700', color: colors.red500 },
  btnAbrirForm: { alignItems: 'center', paddingVertical: 10, borderWidth: 1, borderColor: colors.navy700, borderRadius: radius.md, borderStyle: 'dashed' },
  btnAbrirFormTexto: { color: colors.navy700, fontSize: 12.5, fontWeight: '700' },
  formCard: { backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  formLabel: { fontSize: 11.5, fontWeight: '700', color: colors.gray600, marginTop: spacing.md, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: spacing.md, fontSize: 13, color: colors.gray900 },
  inputMultilinha: { minHeight: 60, textAlignVertical: 'top' },
  btnFoto: { alignItems: 'center', paddingVertical: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md },
  btnFotoTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray900 },
  fotoPreviewLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fotoPreview: { width: 64, height: 64, borderRadius: radius.sm },
  formBotoes: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  btnCancelar: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white },
  btnCancelarTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  btnSalvar: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.navy700 },
  btnSalvarDesabilitado: { opacity: 0.6 },
  btnSalvarTexto: { fontSize: 12.5, fontWeight: '700', color: colors.white },
});
