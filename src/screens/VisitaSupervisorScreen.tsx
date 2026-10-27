import React, { useCallback, useEffect, useState } from 'react';
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
  Platform,
  KeyboardAvoidingView,
  Switch,
  BackHandler,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing } from '../theme/colors';
import {
  ItemVisitaSup,
  SETORES_VISITA_SUP,
  SetorVisitaSup,
  VisitaSupervisor,
  contarItensSup,
  enviarFotoSup,
  excluirItemSup,
  excluirVisitaSup,
  finalizarVisitaSup,
  iniciarVisitaSup,
  listarItensSup,
  listarVisitasSup,
  reabrirVisitaSup,
  salvarItemSup,
} from '../data/visitaSupervisorApi';
import { compartilharVisitaSup } from '../lib/visitaSupervisorPdf';
import AreaTeclado from '../components/AreaTeclado';

// =============================================================================
// Visita Supervisor — o supervisor (ou a gerência) registra, setor por setor
// (gavetas), o que ele orientou mudar: descrição + até 2 fotos. Cada
// orientação pode virar tarefa para o encarregado do setor. No fim, finaliza
// e compartilha o PDF (igual ao Checklist).
// Ver src/data/visitaSupervisorApi.ts e supabase/visita_supervisor.sql.
// =============================================================================

type IconeFeather = React.ComponentProps<typeof Feather>['name'];
const AZUL = '#2F7BFF';
const AZUL_FUNDO = '#E3EDFF';
const SUPERVISOR_PADRAO = 'Marcos Campideli';

const VISUAL: Record<SetorVisitaSup, { cor: string; fundo: string }> = {
  deposito: { cor: '#6B4FA3', fundo: '#ECE6F7' },
  mercearia: { cor: '#1B2A6B', fundo: '#E3E7F5' },
  'frente-caixa': { cor: '#0B7F8E', fundo: '#DDF2F4' },
  acougue: { cor: '#C5392F', fundo: '#FBE4E2' },
  frios: { cor: '#2C6FB4', fundo: '#E1ECF8' },
  padaria: { cor: '#B4650E', fundo: '#FBEBD4' },
  area_externa: { cor: '#2C8F5E', fundo: '#DCF2E7' },
};

const dataHora = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const isoDaquiA = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const PRAZOS: { rotulo: string; dias: number | null }[] = [
  { rotulo: 'Sem prazo', dias: null },
  { rotulo: 'Hoje', dias: 0 },
  { rotulo: 'Amanhã', dias: 1 },
  { rotulo: '3 dias', dias: 3 },
  { rotulo: '7 dias', dias: 7 },
  { rotulo: '15 dias', dias: 15 },
];

export default function VisitaSupervisorScreen({
  usuarioNome,
  usuarioMatricula,
  ehOSupervisor,
  onVoltar,
}: {
  usuarioNome: string;
  usuarioMatricula: string | null;
  ehOSupervisor?: boolean;
  onVoltar: () => void;
}) {
  const [aberta, setAberta] = useState<VisitaSupervisor | null>(null);

  if (aberta) {
    return <TelaVisita visita={aberta} usuarioNome={usuarioNome} onVoltar={() => setAberta(null)} onAtualizar={setAberta} />;
  }
  return (
    <ListaVisitas
      usuarioNome={usuarioNome}
      usuarioMatricula={usuarioMatricula}
      ehOSupervisor={!!ehOSupervisor}
      onVoltar={onVoltar}
      onAbrir={setAberta}
    />
  );
}

// =============================================================================
// Lista de visitas + iniciar nova
// =============================================================================
function ListaVisitas({
  usuarioNome,
  usuarioMatricula,
  ehOSupervisor,
  onVoltar,
  onAbrir,
}: {
  usuarioNome: string;
  usuarioMatricula: string | null;
  ehOSupervisor: boolean;
  onVoltar: () => void;
  onAbrir: (v: VisitaSupervisor) => void;
}) {
  const [visitas, setVisitas] = useState<VisitaSupervisor[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [nomeSupervisor, setNomeSupervisor] = useState('');
  const [mostrarIniciar, setMostrarIniciar] = useState(false);
  const [compartilhando, setCompartilhando] = useState<string | null>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onVoltar();
      return true;
    });
    return () => sub.remove();
  }, [onVoltar]);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const vs = await listarVisitasSup();
      setVisitas(vs);
      setContagem(await contarItensSup(vs.map((v) => v.id)));
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui carregar as visitas.');
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const emAndamento = visitas.find((v) => v.status === 'em_andamento');

  function abrirIniciar() {
    setNomeSupervisor(ehOSupervisor ? usuarioNome : visitas[0]?.supervisorNome ?? SUPERVISOR_PADRAO);
    setMostrarIniciar(true);
  }

  async function iniciar() {
    if (!nomeSupervisor.trim()) return Alert.alert('Falta o nome', 'Escreva o nome do supervisor que está visitando.');
    setIniciando(true);
    try {
      const v = await iniciarVisitaSup({ supervisorNome: nomeSupervisor, registradaPorNome: usuarioNome, registradaPorMatricula: usuarioMatricula });
      setMostrarIniciar(false);
      onAbrir(v);
    } catch (e: any) {
      Alert.alert('Não consegui iniciar a visita', e?.message ?? 'Verifique a internet e tente de novo.');
    } finally {
      setIniciando(false);
    }
  }

  async function compartilhar(v: VisitaSupervisor) {
    setCompartilhando(v.id);
    try {
      await compartilharVisitaSup(v);
    } catch (e: any) {
      Alert.alert('Não consegui gerar o PDF', e?.message ?? 'Tente novamente.');
    } finally {
      setCompartilhando(null);
    }
  }

  function excluir(v: VisitaSupervisor) {
    Alert.alert(
      'Excluir esta visita?',
      `Visita de ${v.supervisorNome} em ${dataHora(v.iniciadaEm)}.\nAs orientações e as tarefas ainda abertas que vieram dela também saem. Não dá para desfazer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await excluirVisitaSup(v.id);
              carregar();
            } catch (e: any) {
              Alert.alert('Não consegui excluir', e?.message ?? '');
            }
          },
        },
      ],
    );
  }

  return (
    <AreaTeclado style={s.flex}>
      <ScrollView
        style={s.flex}
        contentContainerStyle={{ paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={carregar} />}
      >
        <View style={s.topo}>
          <TouchableOpacity style={s.voltar} onPress={onVoltar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={20} color={AZUL} />
            <Text style={s.voltarTxt}>Voltar</Text>
          </TouchableOpacity>
          <View style={s.tituloLinha}>
            <View style={[s.iconeGrande, { backgroundColor: AZUL_FUNDO }]}>
              <Feather name="user-check" size={26} color={AZUL} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.titulo}>Visita Supervisor</Text>
              <Text style={s.subtitulo}>O que o supervisor orientou mudar, setor por setor</Text>
            </View>
          </View>
        </View>

        <View style={s.corpo}>
          {emAndamento ? (
            <TouchableOpacity style={s.botaoPrincipal} onPress={() => onAbrir(emAndamento)} activeOpacity={0.85}>
              <Feather name="play-circle" size={18} color={colors.white} />
              <Text style={s.botaoPrincipalTxt}>Continuar visita em andamento</Text>
            </TouchableOpacity>
          ) : mostrarIniciar ? (
            <View style={s.cartao}>
              <Text style={s.rotulo}>Supervisor que está visitando</Text>
              <TextInput
                style={s.input}
                value={nomeSupervisor}
                onChangeText={setNomeSupervisor}
                placeholder="Nome do supervisor"
                placeholderTextColor={colors.gray400}
                autoCapitalize="words"
              />
              <Text style={s.dica}>Registrada por {usuarioNome}</Text>
              <View style={s.linhaBotoes}>
                <TouchableOpacity style={s.botaoSecundario} onPress={() => setMostrarIniciar(false)}>
                  <Text style={s.botaoSecundarioTxt}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.botaoPrincipal, { flex: 1, marginTop: 0 }]} onPress={iniciar} disabled={iniciando}>
                  {iniciando ? <ActivityIndicator color={colors.white} /> : <Text style={s.botaoPrincipalTxt}>Começar</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.botaoPrincipal} onPress={abrirIniciar} activeOpacity={0.85}>
              <Feather name="plus" size={18} color={colors.white} />
              <Text style={s.botaoPrincipalTxt}>Iniciar nova visita</Text>
            </TouchableOpacity>
          )}

          <Text style={s.secao}>Visitas</Text>
          {carregando ? (
            <ActivityIndicator color={AZUL} style={{ marginTop: spacing.lg }} />
          ) : erro ? (
            <View style={s.erro}>
              <Text style={s.erroTxt}>{erro}</Text>
            </View>
          ) : visitas.length === 0 ? (
            <View style={s.vazio}>
              <Text style={s.vazioTxt}>Nenhuma visita registrada ainda. Toque em "Iniciar nova visita" quando o supervisor chegar.</Text>
            </View>
          ) : (
            visitas.map((v) => (
              <TouchableOpacity key={v.id} style={s.cartaoVisita} onPress={() => onAbrir(v)} activeOpacity={0.8}>
                <View style={{ flex: 1 }}>
                  <Text style={s.visitaTitulo}>{v.supervisorNome}</Text>
                  <Text style={s.visitaMeta}>
                    {dataHora(v.iniciadaEm)} · {contagem[v.id] ?? 0} {(contagem[v.id] ?? 0) === 1 ? 'orientação' : 'orientações'}
                  </Text>
                  <Text style={s.visitaMeta}>Registrada por {v.registradaPorNome}</Text>
                  <View style={[s.chip, v.status === 'finalizada' ? s.chipOk : s.chipAndamento]}>
                    <Text style={[s.chipTxt, { color: v.status === 'finalizada' ? '#178553' : '#B4650E' }]}>
                      {v.status === 'finalizada' ? 'Finalizada' : 'Em andamento'}
                    </Text>
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <TouchableOpacity style={s.iconeBotao} onPress={() => compartilhar(v)} disabled={compartilhando === v.id}>
                    {compartilhando === v.id ? <ActivityIndicator size="small" color={AZUL} /> : <Feather name="share-2" size={18} color={AZUL} />}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.iconeBotao} onPress={() => excluir(v)}>
                    <Feather name="trash-2" size={18} color={colors.gray400} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </AreaTeclado>
  );
}

// =============================================================================
// Visita aberta: gavetas por setor
// =============================================================================
type Rascunho = {
  id?: string;
  tarefaId?: string | null;
  setor: SetorVisitaSup;
  descricao: string;
  fotos: string[]; // URL (já enviada) ou uri local
  virarTarefa: boolean;
  prioridade: 'normal' | 'alta';
  prazo: string | null;
};

function TelaVisita({
  visita,
  usuarioNome,
  onVoltar,
  onAtualizar,
}: {
  visita: VisitaSupervisor;
  usuarioNome: string;
  onVoltar: () => void;
  onAtualizar: (v: VisitaSupervisor) => void;
}) {
  const [itens, setItens] = useState<ItemVisitaSup[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [abertos, setAbertos] = useState<SetorVisitaSup[]>([]);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [observacoes, setObservacoes] = useState(visita.observacoes ?? '');
  const [finalizando, setFinalizando] = useState(false);
  const finalizada = visita.status === 'finalizada';

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (rascunho) setRascunho(null);
      else onVoltar();
      return true;
    });
    return () => sub.remove();
  }, [rascunho, onVoltar]);

  const carregar = useCallback(async () => {
    try {
      setItens(await listarItensSup(visita.id));
    } catch (e: any) {
      Alert.alert('Não consegui carregar', e?.message ?? '');
    } finally {
      setCarregando(false);
    }
  }, [visita.id]);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const alternar = (k: SetorVisitaSup) => setAbertos((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));

  function novo(setor: SetorVisitaSup) {
    setRascunho({ setor, descricao: '', fotos: [], virarTarefa: true, prioridade: 'normal', prazo: null });
  }
  function editar(i: ItemVisitaSup) {
    setRascunho({
      id: i.id,
      tarefaId: i.tarefaId,
      setor: i.setor,
      descricao: i.descricao,
      fotos: [...i.fotos],
      virarTarefa: i.virarTarefa,
      prioridade: i.prioridade,
      prazo: i.prazo,
    });
  }

  function escolherFoto() {
    if (!rascunho || rascunho.fotos.length >= 2) return;
    Alert.alert('Foto', 'Como você quer anexar a foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Galeria', onPress: () => pegarFoto(false) },
      { text: 'Câmera', onPress: () => pegarFoto(true) },
    ]);
  }
  async function pegarFoto(camera: boolean) {
    let uri: string | undefined;
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Sem permissão', 'Libere o acesso à câmera nas configurações do celular.');
      const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      if (!r.canceled && r.assets?.[0]) uri = r.assets[0].uri;
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('Sem permissão', 'Libere o acesso às fotos nas configurações do celular.');
      const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!r.canceled && r.assets?.[0]) uri = r.assets[0].uri;
    }
    if (uri) setRascunho((r) => (r ? { ...r, fotos: [...r.fotos, uri!].slice(0, 2) } : r));
  }

  async function salvar() {
    if (!rascunho) return;
    if (!rascunho.descricao.trim()) return Alert.alert('Falta a descrição', 'Escreva o que o supervisor pediu para mudar.');
    setSalvando(true);
    try {
      const fotos: string[] = [];
      for (const f of rascunho.fotos) fotos.push(f.startsWith('http') ? f : await enviarFotoSup(f));
      const salvo = await salvarItemSup(visita, { ...rascunho, fotos, criadoPorNome: usuarioNome }, usuarioNome);
      setItens((lista) => (rascunho.id ? lista.map((i) => (i.id === salvo.id ? salvo : i)) : [...lista, salvo]));
      setRascunho(null);
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Verifique a internet e tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  function excluir(i: ItemVisitaSup) {
    Alert.alert('Excluir esta orientação?', i.tarefaId ? 'A tarefa do encarregado também sai (se ainda não foi concluída).' : '', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await excluirItemSup(i);
            setItens((l) => l.filter((x) => x.id !== i.id));
          } catch (e: any) {
            Alert.alert('Não consegui excluir', e?.message ?? '');
          }
        },
      },
    ]);
  }

  async function compartilhar(v: VisitaSupervisor) {
    try {
      await compartilharVisitaSup(v, itens);
    } catch (e: any) {
      Alert.alert('Não consegui gerar o PDF', e?.message ?? 'Tente novamente.');
    }
  }

  function finalizar() {
    const comTarefa = itens.filter((i) => i.virarTarefa).length;
    Alert.alert(
      'Finalizar a visita?',
      `${itens.length} ${itens.length === 1 ? 'orientação' : 'orientações'}${comTarefa ? `, ${comTarefa} virando tarefa para os encarregados` : ''}.\nDepois você pode reabrir se precisar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: async () => {
            setFinalizando(true);
            try {
              await finalizarVisitaSup(visita.id, observacoes);
              const v: VisitaSupervisor = { ...visita, status: 'finalizada', finalizadaEm: new Date().toISOString(), observacoes: observacoes.trim() || null };
              onAtualizar(v);
              Alert.alert('Visita finalizada', 'Quer compartilhar o PDF agora (WhatsApp, e-mail…)?', [
                { text: 'Agora não', style: 'cancel' },
                { text: 'Compartilhar PDF', onPress: () => compartilhar(v) },
              ]);
            } catch (e: any) {
              Alert.alert('Não consegui finalizar', e?.message ?? '');
            } finally {
              setFinalizando(false);
            }
          },
        },
      ],
    );
  }

  async function reabrir() {
    try {
      await reabrirVisitaSup(visita.id);
      onAtualizar({ ...visita, status: 'em_andamento', finalizadaEm: null });
    } catch (e: any) {
      Alert.alert('Não consegui reabrir', e?.message ?? '');
    }
  }

  return (
    <AreaTeclado style={s.flex}>
      <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={s.topo}>
          <TouchableOpacity style={s.voltar} onPress={onVoltar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={20} color={AZUL} />
            <Text style={s.voltarTxt}>Visitas</Text>
          </TouchableOpacity>
          <Text style={s.titulo}>{visita.supervisorNome}</Text>
          <Text style={s.subtitulo}>
            {dataHora(visita.iniciadaEm)} · registrada por {visita.registradaPorNome}
          </Text>
          <View style={[s.chip, finalizada ? s.chipOk : s.chipAndamento, { marginTop: 8 }]}>
            <Text style={[s.chipTxt, { color: finalizada ? '#178553' : '#B4650E' }]}>{finalizada ? 'Finalizada' : 'Em andamento'}</Text>
          </View>
        </View>

        <View style={s.corpo}>
          {carregando ? (
            <ActivityIndicator color={AZUL} style={{ marginTop: spacing.lg }} />
          ) : (
            SETORES_VISITA_SUP.map((setor) => {
              const lista = itens.filter((i) => i.setor === setor.key);
              const aberto = abertos.includes(setor.key) || rascunho?.setor === setor.key;
              const vis = VISUAL[setor.key];
              return (
                <View key={setor.key} style={s.gaveta}>
                  <TouchableOpacity style={s.gavetaTopo} onPress={() => alternar(setor.key)} activeOpacity={0.75}>
                    <View style={[s.gavetaIcone, { backgroundColor: vis.fundo }]}>
                      <Feather name={setor.icone as IconeFeather} size={18} color={vis.cor} />
                    </View>
                    <Text style={s.gavetaNome}>{setor.nome}</Text>
                    {lista.length > 0 && (
                      <View style={[s.contador, { backgroundColor: vis.fundo }]}>
                        <Text style={[s.contadorTxt, { color: vis.cor }]}>{lista.length}</Text>
                      </View>
                    )}
                    <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray400} />
                  </TouchableOpacity>

                  {aberto && (
                    <View style={s.gavetaCorpo}>
                      {lista.length === 0 && rascunho?.setor !== setor.key && <Text style={s.dica}>Nenhuma orientação neste setor.</Text>}
                      {lista.map((i, k) =>
                        rascunho?.id === i.id ? null : (
                          <View key={i.id} style={[s.item, i.prioridade === 'alta' && i.virarTarefa && s.itemAlta]}>
                            <Text style={s.itemTexto}>
                              {k + 1}. {i.descricao}
                            </Text>
                            {i.fotos.length > 0 && (
                              <View style={s.fotos}>
                                {i.fotos.map((u) => (
                                  <Image key={u} source={{ uri: u }} style={s.foto} />
                                ))}
                              </View>
                            )}
                            <View style={s.itemRodape}>
                              <View style={[s.chip, i.virarTarefa ? s.chipTarefa : s.chipInfo]}>
                                <Text style={[s.chipTxt, { color: i.virarTarefa ? AZUL : colors.gray600 }]}>
                                  {i.virarTarefa ? 'Tarefa p/ encarregado' : 'Só orientação'}
                                </Text>
                              </View>
                              {i.virarTarefa && i.prioridade === 'alta' && <Text style={s.alta}>Muito importante</Text>}
                              {i.virarTarefa && i.prazo && <Text style={s.meta}>Prazo {dataBr(i.prazo)}</Text>}
                              <View style={{ flex: 1 }} />
                              {!finalizada && (
                                <>
                                  <TouchableOpacity onPress={() => editar(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Feather name="edit-2" size={16} color={AZUL} />
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => excluir(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Feather name="trash-2" size={16} color={colors.gray400} />
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>
                          </View>
                        ),
                      )}

                      {rascunho?.setor === setor.key ? (
                        <Editor
                          r={rascunho}
                          salvando={salvando}
                          onMudar={setRascunho}
                          onFoto={escolherFoto}
                          onCancelar={() => setRascunho(null)}
                          onSalvar={salvar}
                        />
                      ) : (
                        !finalizada &&
                        !rascunho && (
                          <TouchableOpacity style={s.botaoAdicionar} onPress={() => novo(setor.key)}>
                            <Feather name="plus" size={16} color={AZUL} />
                            <Text style={s.botaoAdicionarTxt}>Nova orientação</Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}

          <Text style={s.secao}>Observações gerais</Text>
          <TextInput
            style={[s.input, s.inputGrande]}
            value={observacoes}
            onChangeText={setObservacoes}
            editable={!finalizada}
            multiline
            placeholder="Resumo da visita, combinados com o supervisor, próxima visita…"
            placeholderTextColor={colors.gray400}
          />

          {finalizada ? (
            <>
              <TouchableOpacity style={s.botaoPrincipal} onPress={() => compartilhar(visita)}>
                <Feather name="share-2" size={18} color={colors.white} />
                <Text style={s.botaoPrincipalTxt}>Compartilhar PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.botaoSecundario, { marginTop: spacing.sm, alignSelf: 'stretch' }]} onPress={reabrir}>
                <Text style={s.botaoSecundarioTxt}>Reabrir para editar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={s.botaoPrincipal} onPress={finalizar} disabled={finalizando || !!rascunho}>
                {finalizando ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Feather name="check-circle" size={18} color={colors.white} />
                    <Text style={s.botaoPrincipalTxt}>Finalizar e compartilhar PDF</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={[s.botaoSecundario, { marginTop: spacing.sm, alignSelf: 'stretch' }]} onPress={() => compartilhar(visita)}>
                <Text style={s.botaoSecundarioTxt}>Ver PDF parcial</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </AreaTeclado>
  );
}

function Editor({
  r,
  salvando,
  onMudar,
  onFoto,
  onCancelar,
  onSalvar,
}: {
  r: Rascunho;
  salvando: boolean;
  onMudar: (r: Rascunho) => void;
  onFoto: () => void;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  return (
    <View style={s.editor}>
      <Text style={s.rotulo}>O que o supervisor pediu para mudar?</Text>
      <TextInput
        style={[s.input, s.inputGrande]}
        value={r.descricao}
        onChangeText={(t) => onMudar({ ...r, descricao: t })}
        multiline
        autoFocus={!r.id}
        placeholder="Ex.: reorganizar a ponta de biscoitos, retirar caixas do corredor…"
        placeholderTextColor={colors.gray400}
      />

      <Text style={s.rotulo}>Fotos (até 2)</Text>
      <View style={s.fotos}>
        {r.fotos.map((u) => (
          <View key={u}>
            <Image source={{ uri: u }} style={s.foto} />
            <TouchableOpacity style={s.removerFoto} onPress={() => onMudar({ ...r, fotos: r.fotos.filter((x) => x !== u) })}>
              <Feather name="x" size={14} color={colors.white} />
            </TouchableOpacity>
          </View>
        ))}
        {r.fotos.length < 2 && (
          <TouchableOpacity style={s.addFoto} onPress={onFoto}>
            <Feather name="camera" size={20} color={AZUL} />
            <Text style={s.addFotoTxt}>Adicionar</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.linhaSwitch}>
        <View style={{ flex: 1 }}>
          <Text style={s.switchTitulo}>Virar tarefa para o encarregado</Text>
          <Text style={s.dica}>
            {r.setor === 'area_externa' ? 'Área Externa: a tarefa fica com a gerência.' : 'Aparece nas prioridades do setor, com as fotos.'}
          </Text>
        </View>
        <Switch value={r.virarTarefa} onValueChange={(v) => onMudar({ ...r, virarTarefa: v })} trackColor={{ true: AZUL, false: colors.gray100 }} />
      </View>

      {r.virarTarefa && (
        <>
          <Text style={s.rotulo}>Importância</Text>
          <View style={s.chips}>
            {(['normal', 'alta'] as const).map((p) => (
              <TouchableOpacity key={p} style={[s.opcao, r.prioridade === p && s.opcaoAtiva]} onPress={() => onMudar({ ...r, prioridade: p })}>
                <Text style={[s.opcaoTxt, r.prioridade === p && s.opcaoTxtAtiva]}>{p === 'normal' ? 'Normal' : 'Muito importante'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.rotulo}>Prazo</Text>
          <View style={s.chips}>
            {PRAZOS.map((p) => {
              const valor = p.dias === null ? null : isoDaquiA(p.dias);
              const ativo = r.prazo === valor;
              return (
                <TouchableOpacity key={p.rotulo} style={[s.opcao, ativo && s.opcaoAtiva]} onPress={() => onMudar({ ...r, prazo: valor })}>
                  <Text style={[s.opcaoTxt, ativo && s.opcaoTxtAtiva]}>{p.rotulo}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {r.prazo && !PRAZOS.some((p) => p.dias !== null && isoDaquiA(p.dias) === r.prazo) && <Text style={s.dica}>Prazo atual: {dataBr(r.prazo)}</Text>}
        </>
      )}

      <View style={s.linhaBotoes}>
        <TouchableOpacity style={s.botaoSecundario} onPress={onCancelar} disabled={salvando}>
          <Text style={s.botaoSecundarioTxt}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.botaoPrincipal, { flex: 1, marginTop: 0 }]} onPress={onSalvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color={colors.white} /> : <Text style={s.botaoPrincipalTxt}>Salvar</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F6F8FC' },
  topo: { backgroundColor: colors.white, paddingHorizontal: spacing.xl, paddingTop: 52, paddingBottom: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  voltar: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  voltarTxt: { color: AZUL, fontSize: 15, fontWeight: '600' },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconeGrande: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 22, fontWeight: '800', color: colors.gray900 },
  subtitulo: { fontSize: 13, color: colors.gray600, marginTop: 2 },
  corpo: { padding: spacing.lg },
  secao: { fontSize: 13, fontWeight: '700', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm },
  cartao: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.gray100 },
  rotulo: { fontSize: 12.5, fontWeight: '700', color: colors.gray600, marginBottom: 6, marginTop: spacing.md },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, color: colors.gray900 },
  inputGrande: { minHeight: 84, textAlignVertical: 'top' },
  dica: { fontSize: 12, color: colors.gray400, marginTop: 4 },
  linhaBotoes: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, alignItems: 'center' },
  botaoPrincipal: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: AZUL, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  botaoPrincipalTxt: { color: colors.white, fontWeight: '700', fontSize: 15 },
  botaoSecundario: { borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: spacing.lg, borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white, alignItems: 'center' },
  botaoSecundarioTxt: { color: colors.gray600, fontWeight: '600', fontSize: 14 },
  erro: { backgroundColor: '#FBE4E2', borderRadius: radius.md, padding: spacing.md },
  erroTxt: { color: '#C5392F', fontSize: 13 },
  vazio: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.gray100 },
  vazioTxt: { color: colors.gray600, fontSize: 13, lineHeight: 19 },
  cartaoVisita: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.gray100 },
  visitaTitulo: { fontSize: 15.5, fontWeight: '700', color: colors.gray900 },
  visitaMeta: { fontSize: 12.5, color: colors.gray600, marginTop: 2 },
  iconeBotao: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F6F8FC', alignItems: 'center', justifyContent: 'center' },
  chip: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3, marginTop: 6 },
  chipTxt: { fontSize: 11, fontWeight: '700' },
  chipOk: { backgroundColor: '#DFF3E8' },
  chipAndamento: { backgroundColor: '#FBEBD4' },
  chipTarefa: { backgroundColor: AZUL_FUNDO, marginTop: 0 },
  chipInfo: { backgroundColor: colors.gray50, marginTop: 0 },
  gaveta: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.gray100, overflow: 'hidden' },
  gavetaTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  gavetaIcone: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  gavetaNome: { flex: 1, fontSize: 15.5, fontWeight: '700', color: colors.gray900 },
  contador: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  contadorTxt: { fontSize: 12.5, fontWeight: '800' },
  gavetaCorpo: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray50, paddingTop: spacing.sm },
  item: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  itemAlta: { borderColor: '#E86A5F' },
  itemTexto: { fontSize: 14, color: colors.gray900, lineHeight: 20 },
  itemRodape: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  alta: { fontSize: 11.5, fontWeight: '700', color: '#C5392F' },
  meta: { fontSize: 11.5, color: colors.gray600 },
  fotos: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  foto: { width: 120, height: 90, borderRadius: 10, backgroundColor: colors.gray100 },
  removerFoto: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  addFoto: { width: 120, height: 90, borderRadius: 10, borderWidth: 1.5, borderColor: AZUL, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F9FF' },
  addFotoTxt: { color: AZUL, fontSize: 12, fontWeight: '600', marginTop: 4 },
  botaoAdicionar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: radius.md, backgroundColor: '#F5F9FF', borderWidth: 1, borderColor: AZUL_FUNDO, marginTop: 4 },
  botaoAdicionarTxt: { color: AZUL, fontWeight: '700', fontSize: 14 },
  editor: { backgroundColor: '#FAFBFE', borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: AZUL_FUNDO },
  linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  switchTitulo: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcao: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white },
  opcaoAtiva: { backgroundColor: AZUL, borderColor: AZUL },
  opcaoTxt: { fontSize: 13, color: colors.gray600, fontWeight: '600' },
  opcaoTxtAtiva: { color: colors.white },
});
