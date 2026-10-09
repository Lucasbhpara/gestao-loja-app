import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing } from '../theme/colors';
import { Tarefa } from '../data/tarefasApi';
import {
  AprovacaoItem,
  Correcao,
  ItemCorrecao,
  StatusItemCorrecao,
  avaliarCorrecao,
  carregarCorrecao,
  enviarCorrecao,
  enviarFotoCorrecao,
  itemCompleto,
  salvarItemCorrecao,
} from '../data/correcaoApi';
import { compartilharCorrecao } from '../lib/correcaoPdf';

// =============================================================================
// Correção de checklist — ver src/data/correcaoApi.ts.
//
//   modo 'corrigir': o encarregado trata cada "Não" (Corrigido com foto do
//                    depois / Não foi possível com motivo) e envia pra
//                    aprovação;
//   modo 'aprovar':  quem fez o checklist vê antes × depois e aprova ou
//                    devolve cada item.
// =============================================================================

const MAX_FOTOS = 5;

const faltam = (n: number) => (n === 1 ? 'Falta 1 item' : `Faltam ${n} itens`);

function dataHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function CorrecaoScreen({
  tarefa,
  modo,
  usuarioNome,
  onVoltar,
}: {
  tarefa: Tarefa;
  modo: 'corrigir' | 'aprovar';
  usuarioNome: string;
  onVoltar: (mudou: boolean) => void;
}) {
  const [correcao, setCorrecao] = useState<Correcao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [decisoes, setDecisoes] = useState<Record<string, { aprovacao: AprovacaoItem; obs: string }>>({});
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  async function carregar() {
    try {
      const c = await carregarCorrecao(tarefa);
      setCorrecao(c);
      const m: Record<string, string> = {};
      c.itens.forEach((i) => {
        if (i.comentario) m[i.respostaId] = i.comentario;
      });
      setComentarios(m);
      setErro(null);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui abrir a correção. Verifique a internet.');
    }
  }

  useEffect(() => {
    carregar();
  }, [tarefa.id]);

  // Item que o encarregado ainda pode mexer (aprovado em rodada anterior fica travado).
  const editavel = (i: ItemCorrecao) => modo === 'corrigir' && i.aprovacao !== 'aprovado' && tarefa.correcaoStatus !== 'enviada';

  async function gravar(item: ItemCorrecao, mudanca: Partial<Pick<ItemCorrecao, 'status' | 'comentario' | 'fotosDepois'>>) {
    if (!correcao) return;
    const novo = { ...item, ...mudanca };
    setOcupado(item.respostaId);
    try {
      await salvarItemCorrecao(correcao, item, {
        status: novo.status,
        comentario: novo.comentario,
        fotosDepois: novo.fotosDepois,
        por: usuarioNome,
      });
      setCorrecao({ ...correcao, itens: correcao.itens.map((i) => (i.respostaId === item.respostaId ? { ...novo, aprovacao: null } : i)) });
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Verifique a internet e tente de novo.');
    } finally {
      setOcupado(null);
    }
  }

  function escolherStatus(item: ItemCorrecao, status: StatusItemCorrecao) {
    gravar(item, { status, comentario: (comentarios[item.respostaId] ?? '').trim() || null });
  }

  function salvarComentario(item: ItemCorrecao) {
    const texto = (comentarios[item.respostaId] ?? '').trim();
    if ((item.comentario ?? '') === texto || item.status === 'pendente') return;
    gravar(item, { comentario: texto || null });
  }

  function adicionarFoto(item: ItemCorrecao) {
    Alert.alert('Foto do depois', 'Como você quer anexar a foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto agora', onPress: () => capturar(item, 'camera') },
      { text: 'Escolher da galeria', onPress: () => capturar(item, 'galeria') },
    ]);
  }

  async function capturar(item: ItemCorrecao, origem: 'camera' | 'galeria') {
    let uri: string | null = null;
    if (origem === 'camera') {
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
    if (!uri) return;
    setOcupado(item.respostaId);
    try {
      const url = await enviarFotoCorrecao(uri);
      setOcupado(null);
      await gravar(item, { fotosDepois: [...item.fotosDepois, url] });
    } catch (e: any) {
      setOcupado(null);
      Alert.alert('Não consegui enviar a foto', e?.message ?? 'Verifique a internet e tente de novo.');
    }
  }

  function removerFoto(item: ItemCorrecao, url: string) {
    Alert.alert('Remover foto?', '', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => gravar(item, { fotosDepois: item.fotosDepois.filter((u) => u !== url) }) },
    ]);
  }

  async function enviar() {
    if (!correcao) return;
    // Salva o que ainda está digitado.
    for (const i of correcao.itens) {
      if (editavel(i) && i.status !== 'pendente' && (comentarios[i.respostaId] ?? '').trim() !== (i.comentario ?? '')) {
        await gravar(i, { comentario: (comentarios[i.respostaId] ?? '').trim() || null });
      }
    }
    const atual = await carregarCorrecao(tarefa).catch(() => correcao);
    if (!atual.itens.every(itemCompleto)) {
      Alert.alert('Falta tratar algum item', 'Cada item precisa estar "Corrigido" (com pelo menos 1 foto) ou "Não foi possível" (com o motivo).');
      return;
    }
    Alert.alert('Enviar para aprovação', `A correção vai para ${atual.feitoPor} aprovar.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Enviar',
        onPress: async () => {
          setEnviando(true);
          try {
            await enviarCorrecao(atual, usuarioNome);
            Alert.alert('Correção enviada', 'Agora é só aguardar a aprovação.', [{ text: 'OK', onPress: () => onVoltar(true) }]);
          } catch (e: any) {
            Alert.alert('Não consegui enviar', e?.message ?? 'Tente de novo.');
          } finally {
            setEnviando(false);
          }
        },
      },
    ]);
  }

  async function concluirAvaliacao() {
    if (!correcao) return;
    const pendentes = correcao.itens.filter((i) => i.aprovacao !== 'aprovado' && !decisoes[i.respostaId]);
    if (pendentes.length) {
      Alert.alert('Falta avaliar', `Ainda tem ${pendentes.length} item(ns) sem Aprovar ou Devolver.`);
      return;
    }
    const semMotivo = Object.entries(decisoes).filter(([, d]) => d.aprovacao === 'devolvido' && !d.obs.trim());
    if (semMotivo.length) {
      Alert.alert('Falta o motivo', 'Escreva o motivo em cada item devolvido, pro encarregado saber o que refazer.');
      return;
    }
    setEnviando(true);
    try {
      const resultado = await avaliarCorrecao(
        correcao,
        Object.fromEntries(Object.entries(decisoes).map(([k, d]) => [k, { aprovacao: d.aprovacao, obs: d.obs.trim() || null }])),
        usuarioNome
      );
      if (resultado === 'aprovada') {
        Alert.alert('Correção aprovada ✅', 'A tarefa foi concluída. Quer compartilhar o PDF com antes e depois?', [
          { text: 'Agora não', onPress: () => onVoltar(true) },
          {
            text: 'Compartilhar PDF',
            onPress: async () => {
              try {
                const c = await carregarCorrecao({ ...tarefa, concluida: true, correcaoStatus: 'aprovada', correcaoAvaliadaPor: usuarioNome });
                await compartilharCorrecao(c);
              } catch (e: any) {
                Alert.alert('Não consegui gerar o PDF', e?.message ?? '');
              }
              onVoltar(true);
            },
          },
        ]);
      } else {
        Alert.alert('Correção devolvida', 'Os itens devolvidos voltaram para o encarregado refazer.', [{ text: 'OK', onPress: () => onVoltar(true) }]);
      }
    } catch (e: any) {
      Alert.alert('Não consegui salvar a avaliação', e?.message ?? 'Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  const itens = correcao?.itens ?? [];
  const tratados = itens.filter(itemCompleto).length;
  const decididos = itens.filter((i) => i.aprovacao === 'aprovado' || decisoes[i.respostaId]).length;
  const aguardando = modo === 'corrigir' && tarefa.correcaoStatus === 'enviada';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.hero}>
        <TouchableOpacity onPress={() => onVoltar(false)} style={styles.heroBotao} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="chevron-left" size={18} color={colors.white} />
          <Text style={styles.heroBotaoTexto}>Voltar</Text>
        </TouchableOpacity>
        <View style={styles.heroLinha}>
          <View style={styles.heroIcone}>
            <Feather name={modo === 'aprovar' ? 'check-circle' : 'tool'} size={22} color={colors.navy700} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitulo}>{modo === 'aprovar' ? 'Aprovar correção' : 'Correção'}</Text>
            <Text style={styles.heroSub} numberOfLines={2}>
              {tarefa.titulo}
            </Text>
          </View>
        </View>
        {correcao && (
          <View style={styles.heroInfo}>
            <Text style={styles.heroInfoTexto}>
              Apontado por {correcao.feitoPor} · {dataHora(correcao.feitoEm)}
            </Text>
            {modo === 'aprovar' && tarefa.correcaoEnviadaPor ? (
              <Text style={styles.heroInfoTexto}>Corrigido por {tarefa.correcaoEnviadaPor}</Text>
            ) : null}
            {tarefa.correcaoRodada > 1 ? <Text style={styles.heroInfoTexto}>Rodada {tarefa.correcaoRodada}</Text> : null}
          </View>
        )}
        {correcao && itens.length > 0 && (
          <View style={styles.barraFundo}>
            <View
              style={[
                styles.barraCheia,
                { width: `${Math.round(((modo === 'aprovar' ? decididos : tratados) / itens.length) * 100)}%` },
              ]}
            />
          </View>
        )}
      </View>

      {!correcao ? (
        erro ? (
          <View style={{ padding: spacing.lg }}>
            <View style={styles.erroBox}>
              <Text style={styles.erroTexto}>{erro}</Text>
            </View>
            <TouchableOpacity style={styles.btnSec} onPress={carregar}>
              <Text style={styles.btnSecTexto}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        )
      ) : (
        <>
          <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
            {aguardando && (
              <View style={styles.aviso}>
                <Feather name="clock" size={16} color="#B4650E" />
                <Text style={styles.avisoTexto}>Correção enviada — aguardando a aprovação de {correcao.feitoPor}.</Text>
              </View>
            )}
            {modo === 'corrigir' && !aguardando && (
              <Text style={styles.explicacao}>
                Para cada item: marque <Text style={{ fontWeight: '800' }}>Corrigido</Text> e tire foto de como ficou, ou{' '}
                <Text style={{ fontWeight: '800' }}>Não foi possível</Text> e explique o motivo. Depois envie para aprovação.
              </Text>
            )}
            {modo === 'aprovar' && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                <Text style={[styles.explicacao, { marginBottom: 0, flex: 1 }]}>Compare o antes e o depois de cada item.</Text>
                <TouchableOpacity
                  onPress={() => {
                    const d = { ...decisoes };
                    itens.forEach((i) => {
                      if (i.aprovacao !== 'aprovado') d[i.respostaId] = { aprovacao: 'aprovado', obs: '' };
                    });
                    setDecisoes(d);
                  }}
                >
                  <Text style={styles.linkAcao}>Aprovar tudo</Text>
                </TouchableOpacity>
              </View>
            )}

            {itens.map((item, idx) => {
              const pode = editavel(item);
              const completo = itemCompleto(item);
              const dec = decisoes[item.respostaId];
              return (
                <View
                  key={item.respostaId}
                  style={[
                    styles.card,
                    item.aprovacao === 'aprovado' && styles.cardAprovado,
                    modo === 'corrigir' && !completo && !aguardando && item.status !== 'pendente' && styles.cardPendente,
                  ]}
                >
                  <View style={styles.cardTopo}>
                    <Text style={styles.numero}>{idx + 1}</Text>
                    <View style={{ flex: 1 }}>
                      {item.critico && <Text style={styles.tagCritico}>CRÍTICO</Text>}
                      <Text style={styles.pergunta}>{item.perguntaTexto}</Text>
                    </View>
                    {item.aprovacao === 'aprovado' ? (
                      <View style={[styles.selo, { backgroundColor: '#DCF2E7' }]}>
                        <Feather name="check" size={12} color="#2C8F5E" />
                        <Text style={[styles.seloTexto, { color: '#2C8F5E' }]}>Aprovado</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* ANTES */}
                  <View style={styles.bloco}>
                    <Text style={styles.blocoTitulo}>🔴 Apontado</Text>
                    {item.observacaoOriginal ? <Text style={styles.blocoTexto}>{item.observacaoOriginal}</Text> : null}
                    {item.fotosAntes.length > 0 && (
                      <View style={styles.fotos}>
                        {item.fotosAntes.map((u) => (
                          <TouchableOpacity key={u} onPress={() => setFotoAmpliada(u)}>
                            <Image source={{ uri: u }} style={styles.foto} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {item.aprovacao === 'devolvido' && modo === 'corrigir' && (
                    <View style={styles.devolvido}>
                      <Feather name="corner-up-left" size={14} color={colors.red500} />
                      <Text style={styles.devolvidoTexto}>Devolvido: {item.aprovacaoObs ?? 'refazer'}</Text>
                    </View>
                  )}

                  {/* DEPOIS */}
                  {modo === 'corrigir' && pode ? (
                    <View style={[styles.bloco, { borderTopWidth: 1, borderTopColor: colors.gray100 }]}>
                      <Text style={styles.blocoTitulo}>🟢 O que foi feito</Text>
                      <View style={styles.opcoes}>
                        {(
                          [
                            ['corrigido', 'Corrigido', 'check'],
                            ['nao_possivel', 'Não foi possível', 'x'],
                          ] as [StatusItemCorrecao, string, 'check' | 'x'][]
                        ).map(([valor, rotulo, icone]) => (
                          <TouchableOpacity
                            key={valor}
                            style={[styles.opcao, item.status === valor && (valor === 'corrigido' ? styles.opcaoOk : styles.opcaoNao)]}
                            onPress={() => escolherStatus(item, valor)}
                            disabled={ocupado === item.respostaId}
                          >
                            <Feather name={icone} size={14} color={item.status === valor ? colors.white : colors.gray600} />
                            <Text style={[styles.opcaoTexto, item.status === valor && { color: colors.white }]}>{rotulo}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {item.status !== 'pendente' && (
                        <>
                          <TextInput
                            style={[styles.input, item.status === 'nao_possivel' && !(comentarios[item.respostaId] ?? '').trim() && styles.inputErro]}
                            placeholder={item.status === 'nao_possivel' ? 'Motivo (obrigatório)' : 'Comentário (opcional)'}
                            value={comentarios[item.respostaId] ?? ''}
                            onChangeText={(t) => setComentarios((p) => ({ ...p, [item.respostaId]: t }))}
                            onBlur={() => salvarComentario(item)}
                            multiline
                          />
                          <Text style={styles.label}>
                            Fotos do depois {item.status === 'corrigido' ? '(obrigatória)' : '(opcional)'} · {item.fotosDepois.length}/{MAX_FOTOS}
                          </Text>
                          <View style={styles.fotos}>
                            {item.fotosDepois.map((u) => (
                              <View key={u}>
                                <Image source={{ uri: u }} style={styles.foto} />
                                <TouchableOpacity style={styles.fotoRemover} onPress={() => removerFoto(item, u)}>
                                  <Feather name="x" size={12} color={colors.white} />
                                </TouchableOpacity>
                              </View>
                            ))}
                            {item.fotosDepois.length < MAX_FOTOS &&
                              (ocupado === item.respostaId ? (
                                <View style={[styles.fotoAdd, { borderStyle: 'solid' }]}>
                                  <ActivityIndicator color={colors.navy700} />
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={[styles.fotoAdd, item.status === 'corrigido' && item.fotosDepois.length === 0 && { borderColor: colors.red500 }]}
                                  onPress={() => adicionarFoto(item)}
                                >
                                  <Feather name="camera" size={18} color={item.status === 'corrigido' && item.fotosDepois.length === 0 ? colors.red500 : colors.navy700} />
                                  <Text style={styles.fotoAddTexto}>{item.fotosDepois.length ? '+ foto' : 'Foto'}</Text>
                                </TouchableOpacity>
                              ))}
                          </View>
                        </>
                      )}
                    </View>
                  ) : item.status !== 'pendente' ? (
                    <View style={[styles.bloco, { borderTopWidth: 1, borderTopColor: colors.gray100 }]}>
                      <Text style={styles.blocoTitulo}>
                        {item.status === 'corrigido' ? '🟢 Corrigido' : '⚪ Não foi possível'}
                        {item.respondidoPor ? <Text style={styles.blocoMeta}>  · {item.respondidoPor}</Text> : null}
                      </Text>
                      {item.comentario ? <Text style={styles.blocoTexto}>{item.comentario}</Text> : null}
                      {item.fotosDepois.length > 0 && (
                        <View style={styles.fotos}>
                          {item.fotosDepois.map((u) => (
                            <TouchableOpacity key={u} onPress={() => setFotoAmpliada(u)}>
                              <Image source={{ uri: u }} style={styles.foto} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  ) : null}

                  {/* APROVAÇÃO */}
                  {modo === 'aprovar' && item.aprovacao !== 'aprovado' && (
                    <View style={[styles.bloco, { borderTopWidth: 1, borderTopColor: colors.gray100 }]}>
                      <View style={styles.opcoes}>
                        <TouchableOpacity
                          style={[styles.opcao, dec?.aprovacao === 'aprovado' && styles.opcaoOk]}
                          onPress={() => setDecisoes((p) => ({ ...p, [item.respostaId]: { aprovacao: 'aprovado', obs: '' } }))}
                        >
                          <Feather name="thumbs-up" size={14} color={dec?.aprovacao === 'aprovado' ? colors.white : colors.gray600} />
                          <Text style={[styles.opcaoTexto, dec?.aprovacao === 'aprovado' && { color: colors.white }]}>Aprovar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.opcao, dec?.aprovacao === 'devolvido' && styles.opcaoNao]}
                          onPress={() => setDecisoes((p) => ({ ...p, [item.respostaId]: { aprovacao: 'devolvido', obs: p[item.respostaId]?.obs ?? '' } }))}
                        >
                          <Feather name="corner-up-left" size={14} color={dec?.aprovacao === 'devolvido' ? colors.white : colors.gray600} />
                          <Text style={[styles.opcaoTexto, dec?.aprovacao === 'devolvido' && { color: colors.white }]}>Devolver</Text>
                        </TouchableOpacity>
                      </View>
                      {dec?.aprovacao === 'devolvido' && (
                        <TextInput
                          style={[styles.input, !dec.obs.trim() && styles.inputErro]}
                          placeholder="O que precisa refazer? (obrigatório)"
                          value={dec.obs}
                          onChangeText={(t) => setDecisoes((p) => ({ ...p, [item.respostaId]: { aprovacao: 'devolvido', obs: t } }))}
                          multiline
                        />
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {!aguardando && (
            <View style={styles.rodape}>
              {modo === 'corrigir' ? (
                <TouchableOpacity
                  style={[styles.btnPrincipal, (tratados < itens.length || enviando) && styles.btnDesab]}
                  onPress={enviar}
                  disabled={enviando}
                >
                  {enviando ? <ActivityIndicator color={colors.white} size="small" /> : <Feather name="send" size={16} color={tratados < itens.length ? colors.gray600 : colors.white} />}
                  <Text style={[styles.btnPrincipalTexto, tratados < itens.length && { color: colors.gray600 }]}>
                    {tratados < itens.length ? faltam(itens.length - tratados) : 'Enviar para aprovação'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.btnPrincipal, (decididos < itens.length || enviando) && styles.btnDesab]}
                  onPress={concluirAvaliacao}
                  disabled={enviando}
                >
                  {enviando ? <ActivityIndicator color={colors.white} size="small" /> : null}
                  <Text style={[styles.btnPrincipalTexto, decididos < itens.length && { color: colors.gray600 }]}>
                    {decididos < itens.length ? faltam(itens.length - decididos) : 'Concluir avaliação'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      )}

      <Modal visible={!!fotoAmpliada} transparent animationType="fade" onRequestClose={() => setFotoAmpliada(null)}>
        <TouchableOpacity style={styles.modalFundo} activeOpacity={1} onPress={() => setFotoAmpliada(null)}>
          {fotoAmpliada ? <Image source={{ uri: fotoAmpliada }} style={styles.modalFoto} resizeMode="contain" /> : null}
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  hero: { backgroundColor: colors.navy700, paddingTop: 52, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  heroBotao: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12, marginBottom: spacing.lg },
  heroBotaoTexto: { color: colors.white, fontSize: 13, fontWeight: '600' },
  heroLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcone: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  heroTitulo: { color: colors.white, fontSize: 21, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12.5, marginTop: 2 },
  heroInfo: { marginTop: spacing.md, gap: 2 },
  heroInfoTexto: { color: 'rgba(255,255,255,0.75)', fontSize: 11.5 },
  barraFundo: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden', marginTop: spacing.md },
  barraCheia: { height: 6, borderRadius: 3, backgroundColor: '#9BE3BE' },
  explicacao: { fontSize: 12.5, color: colors.gray600, lineHeight: 18, marginBottom: spacing.lg },
  linkAcao: { fontSize: 12.5, fontWeight: '800', color: colors.navy700 },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12.5, lineHeight: 17 },
  aviso: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: '#FFF7EA', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: '#F4D9A8' },
  avisoTexto: { flex: 1, fontSize: 12.5, color: '#8A4D0B', fontWeight: '600' },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden', borderWidth: 1, borderColor: 'transparent' },
  cardAprovado: { borderColor: '#9BE3BE', opacity: 0.85 },
  cardPendente: { borderColor: colors.red500 },
  cardTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.md },
  numero: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.gray50, textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '800', color: colors.navy700, overflow: 'hidden' },
  tagCritico: { alignSelf: 'flex-start', fontSize: 9.5, fontWeight: '800', color: colors.red500, borderWidth: 1, borderColor: colors.red500, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 4 },
  pergunta: { fontSize: 13.5, fontWeight: '700', color: colors.gray900, lineHeight: 19 },
  selo: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 8 },
  seloTexto: { fontSize: 10.5, fontWeight: '800' },
  bloco: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  blocoTitulo: { fontSize: 11.5, fontWeight: '800', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  blocoMeta: { textTransform: 'none', fontWeight: '600', color: colors.gray400 },
  blocoTexto: { fontSize: 13, color: colors.gray900, lineHeight: 18 },
  devolvido: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: '#FBDEDC', marginHorizontal: spacing.md, borderRadius: radius.sm, padding: spacing.sm },
  devolvidoTexto: { flex: 1, fontSize: 12, color: colors.red500, fontWeight: '700' },
  opcoes: { flexDirection: 'row', gap: spacing.sm },
  opcao: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.gray50 },
  opcaoOk: { backgroundColor: colors.green500, borderColor: colors.green500 },
  opcaoNao: { backgroundColor: colors.red500, borderColor: colors.red500 },
  opcaoTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  input: { backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900, minHeight: 50, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.gray100, marginTop: spacing.md },
  inputErro: { borderColor: colors.red500 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginTop: spacing.md, marginBottom: 6 },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 6 },
  foto: { width: 68, height: 68, borderRadius: radius.sm, backgroundColor: colors.gray100 },
  fotoRemover: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.red500, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  fotoAdd: { width: 68, height: 68, borderRadius: radius.sm, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.navy500, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, gap: 2 },
  fotoAddTexto: { fontSize: 10.5, fontWeight: '700', color: colors.navy700 },
  rodape: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray100, padding: spacing.lg },
  btnPrincipal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14 },
  btnDesab: { backgroundColor: colors.gray100 },
  btnPrincipalTexto: { color: colors.white, fontSize: 14, fontWeight: '700' },
  btnSec: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  btnSecTexto: { color: colors.navy700, fontWeight: '700' },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  modalFoto: { width: '94%', height: '80%' },
});
