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
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { colors, radius, spacing } from '../theme/colors';
import { setores, SetorKey } from '../data/employees';
import {
  AvaliacaoPergunta,
  AvaliacaoResposta,
  AvaliacaoSetor,
  RespostaValor,
  SETORES_CHECKLIST,
  buscarAndamentoPorSetor,
  buscarAvaliacaoEmAndamento,
  buscarAvaliacoesFinalizadas,
  buscarPerguntasAtivas,
  buscarRespostasDaAvaliacao,
  buscarUltimasAvaliacoesPorSetor,
  contarPerguntasAtivas,
  enviarFotoNaoConformidade,
  finalizarAvaliacao,
  iniciarAvaliacao,
  salvarLocalizacaoAvaliacao,
  salvarResposta,
} from '../data/avaliacaoSetorApi';
import { compartilharAvaliacao } from '../lib/checklistPdf';
import CorrecaoScreen from './CorrecaoScreen';
import { buscarCorrecoesParaAprovar } from '../data/correcaoApi';
import { Tarefa } from '../data/tarefasApi';

// =============================================================================
// Checklist de Setor — avaliação de conformidade feita pela gerência, setor
// por setor (6 setores da loja + Área Externa), em qualquer dia. Mesma
// interface da Visita Técnica (VisitaTecnicaScreen.tsx): painel em grade,
// perguntas em gavetas por subcategoria, várias fotos, considerações finais
// e opção de finalizar sem terminar ("Não avaliada"). Ao finalizar, os "Não"
// viram tarefa de Correção pro encarregado (ver correcaoApi.ts) e o PDF abre
// pra compartilhar.
// =============================================================================

type IconeFeather = React.ComponentProps<typeof Feather>['name'];
const MAX_FOTOS = 5;

const VISUAL_SETOR: Partial<Record<SetorKey, { icone: IconeFeather; cor: string; fundo: string }>> = {
  mercearia: { icone: 'shopping-cart', cor: '#1B2A6B', fundo: '#E3E7F5' },
  acougue: { icone: 'scissors', cor: '#C5392F', fundo: '#FBE4E2' },
  flv: { icone: 'sun', cor: '#2C8F5E', fundo: '#DCF2E7' },
  frios: { icone: 'thermometer', cor: '#2C6FB4', fundo: '#E1ECF8' },
  padaria: { icone: 'coffee', cor: '#B4650E', fundo: '#FBEBD4' },
  deposito: { icone: 'package', cor: '#6B4FA3', fundo: '#ECE6F7' },
  area_externa: { icone: 'map', cor: '#5B6280', fundo: '#E7E9F2' },
};
const visualDe = (k: SetorKey) => VISUAL_SETOR[k] ?? { icone: 'grid' as IconeFeather, cor: colors.navy700, fundo: colors.gray100 };

function nomeDoSetor(key: SetorKey): string {
  if (key === 'area_externa') return 'Área Externa';
  return setores.find((s) => s.key === key)?.nome ?? key;
}

function faixa(pct: number): { cor: string; fundo: string; texto: string } {
  if (pct >= 90) return { cor: '#2C8F5E', fundo: '#DCF2E7', texto: 'Excelente' };
  if (pct >= 75) return { cor: '#3E9B6E', fundo: '#E3F3EA', texto: 'Bom' };
  if (pct >= 60) return { cor: '#B4650E', fundo: '#FBEBD4', texto: 'Atenção' };
  return { cor: '#C5392F', fundo: '#FBDEDC', texto: 'Crítico' };
}

function dataHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function haQuanto(iso: string): string {
  const inicio = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicio(new Date()) - inicio(new Date(iso))) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

export default function ChecklistSetorScreen({
  onVoltar,
  usuarioNome,
  embutido,
}: {
  onVoltar?: () => void;
  usuarioNome: string;
  // true quando vive dentro do ChecklistHubScreen (o Hub desenha o topo).
  embutido?: boolean;
}) {
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimas, setUltimas] = useState<Map<SetorKey, AvaliacaoSetor>>(new Map());
  const [andamento, setAndamento] = useState<Map<SetorKey, { avaliacaoId: string; respondidas: number }>>(new Map());
  const [totais, setTotais] = useState<{ loja: number; areaExterna: number }>({ loja: 0, areaExterna: 0 });
  const [finalizadas, setFinalizadas] = useState<AvaliacaoSetor[]>([]);
  const [paraAprovar, setParaAprovar] = useState<Tarefa[]>([]);
  const [aprovando, setAprovando] = useState<Tarefa | null>(null);
  const [setorAtivo, setSetorAtivo] = useState<SetorKey | null>(null);
  const [avaliacaoAtiva, setAvaliacaoAtiva] = useState<AvaliacaoSetor | null>(null);
  const [abrindo, setAbrindo] = useState<SetorKey | null>(null);
  const [compartilhandoId, setCompartilhandoId] = useState<string | null>(null);
  const [mostrarComoFunciona, setMostrarComoFunciona] = useState(false);

  async function carregar() {
    try {
      setErro(null);
      const [mapa, lista, and, tot, correcoes] = await Promise.all([
        buscarUltimasAvaliacoesPorSetor(),
        buscarAvaliacoesFinalizadas(30),
        buscarAndamentoPorSetor(),
        contarPerguntasAtivas(),
        buscarCorrecoesParaAprovar('avaliacao').catch(() => [] as Tarefa[]),
      ]);
      setUltimas(mapa);
      setFinalizadas(lista);
      setAndamento(and);
      setTotais(tot);
      setParaAprovar(correcoes);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui carregar o checklist. Verifique a internet.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const doMes = useMemo(() => {
    const agora = new Date();
    const lista = finalizadas.filter((a) => {
      if (!a.finalizadaEm) return false;
      const d = new Date(a.finalizadaEm);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
    const media = lista.length ? Math.round((lista.reduce((s, a) => s + (a.aproveitamento ?? 0), 0) / lista.length) * 10) / 10 : null;
    return { avaliacoes: lista.length, media, nc: lista.reduce((s, a) => s + (a.naoConformidades ?? 0), 0) };
  }, [finalizadas]);

  async function abrirSetor(setor: SetorKey) {
    setAbrindo(setor);
    try {
      let avaliacao = await buscarAvaliacaoEmAndamento(setor);
      if (!avaliacao) avaliacao = await iniciarAvaliacao(setor, usuarioNome);
      setAvaliacaoAtiva(avaliacao);
      setSetorAtivo(setor);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui iniciar o checklist desse setor.');
    } finally {
      setAbrindo(null);
    }
  }

  async function compartilhar(a: AvaliacaoSetor) {
    setCompartilhandoId(a.id);
    try {
      await compartilharAvaliacao(a);
    } catch (e: any) {
      Alert.alert('Não consegui gerar o PDF', e?.message ?? 'Tente novamente.');
    } finally {
      setCompartilhandoId(null);
    }
  }

  if (aprovando) {
    return (
      <CorrecaoScreen
        tarefa={aprovando}
        modo="aprovar"
        usuarioNome={usuarioNome}
        onVoltar={(mudou) => {
          setAprovando(null);
          if (mudou) carregar();
        }}
      />
    );
  }

  if (setorAtivo && avaliacaoAtiva) {
    return (
      <FormularioAvaliacao
        setor={setorAtivo}
        avaliacao={avaliacaoAtiva}
        usuarioNome={usuarioNome}
        onVoltar={() => {
          setSetorAtivo(null);
          setAvaliacaoAtiva(null);
          carregar();
        }}
      />
    );
  }

  return (
    <View style={styles.flex}>
      {!embutido && (
        <View style={[styles.hero, { paddingBottom: spacing.lg }]}>
          <TouchableOpacity onPress={onVoltar} style={styles.heroBotao}>
            <Feather name="chevron-left" size={18} color={colors.white} />
            <Text style={styles.heroBotaoTexto}>Voltar</Text>
          </TouchableOpacity>
          <Text style={[styles.heroTitulo, { marginTop: spacing.md }]}>Checklist de Setor</Text>
        </View>
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
        {/* Resumo do mês */}
        <View style={styles.statsCard}>
          <View style={styles.stat}>
            <Text style={styles.statValor}>{doMes.avaliacoes}</Text>
            <Text style={styles.statRotulo}>avaliações no mês</Text>
          </View>
          <View style={styles.statDivisor} />
          <View style={styles.stat}>
            <Text style={styles.statValor}>{doMes.media != null ? `${doMes.media}%` : '—'}</Text>
            <Text style={styles.statRotulo}>aproveitamento</Text>
          </View>
          <View style={styles.statDivisor} />
          <View style={styles.stat}>
            <Text style={[styles.statValor, doMes.nc > 0 && { color: colors.red500 }]}>{doMes.nc}</Text>
            <Text style={styles.statRotulo}>não conformid.</Text>
          </View>
        </View>

        {erro && (
          <View style={[styles.erroBox, { marginTop: spacing.lg }]}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {paraAprovar.length > 0 && (
          <>
            <Text style={styles.secaoTitulo}>Correções para aprovar</Text>
            <View style={styles.listaCard}>
              {paraAprovar.map((t, i) => (
                <TouchableOpacity key={t.id} style={[styles.linha, i > 0 && styles.linhaDivisor]} onPress={() => setAprovando(t)}>
                  <View style={[styles.linhaIcone, { backgroundColor: '#FFF1DC' }]}>
                    <Feather name="check-circle" size={15} color="#B4650E" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaNome}>{t.titulo.replace('Checklist de Setor — ', '')}</Text>
                    <Text style={styles.linhaMeta}>
                      Corrigido por {t.correcaoEnviadaPor ?? '—'}
                      {t.correcaoRodada > 1 ? ` · rodada ${t.correcaoRodada}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.tileAcao}>Avaliar</Text>
                  <Feather name="chevron-right" size={16} color={colors.navy700} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.comoFunciona} onPress={() => setMostrarComoFunciona((v) => !v)} activeOpacity={0.8}>
          <Feather name="info" size={15} color={colors.navy700} />
          <Text style={styles.comoFuncionaTitulo}>Como funciona</Text>
          <Feather name={mostrarComoFunciona ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray600} />
        </TouchableOpacity>
        {mostrarComoFunciona && (
          <View style={styles.passos}>
            {[
              { icone: 'grid' as const, texto: 'Escolha o setor (qualquer dia, quantas vezes quiser); as perguntas ficam em gavetas por assunto.' },
              { icone: 'camera' as const, texto: 'Responda Sim, Não ou N/A. No "Não", escreva a observação e anexe até 5 fotos.' },
              { icone: 'send' as const, texto: 'Ao finalizar, o PDF abre pra compartilhar e os "Não" viram Correção pro encarregado.' },
            ].map((p, i) => (
              <View key={i} style={styles.passo}>
                <View style={styles.passoIcone}>
                  <Feather name={p.icone} size={14} color={colors.navy700} />
                </View>
                <Text style={styles.passoTexto}>{p.texto}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.secaoTitulo}>Setores</Text>
        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : (
          <View style={styles.grade}>
            {SETORES_CHECKLIST.map((setor) => {
              const visual = visualDe(setor);
              const total = setor === 'area_externa' ? totais.areaExterna : totais.loja;
              const and = andamento.get(setor);
              const pct = and && total ? Math.min(1, and.respondidas / total) : 0;
              const ultima = ultimas.get(setor);
              const banda = ultima?.aproveitamento != null ? faixa(ultima.aproveitamento) : null;
              return (
                <TouchableOpacity
                  key={setor}
                  style={[styles.tile, setor === 'area_externa' && styles.tileLargo]}
                  onPress={() => abrirSetor(setor)}
                  disabled={abrindo === setor}
                  activeOpacity={0.85}
                >
                  <View style={styles.tileTopo}>
                    <View style={[styles.tileIcone, { backgroundColor: visual.fundo }]}>
                      <Feather name={visual.icone} size={18} color={visual.cor} />
                    </View>
                    {abrindo === setor ? (
                      <ActivityIndicator size="small" color={colors.navy700} />
                    ) : banda && !and ? (
                      <View style={[styles.notaChip, { backgroundColor: banda.fundo }]}>
                        <Text style={[styles.notaChipTexto, { color: banda.cor }]}>{ultima!.aproveitamento}%</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.tileNome} numberOfLines={1}>{nomeDoSetor(setor)}</Text>
                  <Text style={styles.tileMeta}>{total} perguntas</Text>
                  {and ? (
                    <View style={{ marginTop: spacing.sm }}>
                      <View style={styles.barraFundo}>
                        <View style={[styles.barraCheia, { width: `${Math.round(pct * 100)}%` }]} />
                      </View>
                      <Text style={styles.tileStatusAndamento}>
                        Em andamento · {and.respondidas}/{total}
                      </Text>
                    </View>
                  ) : ultima?.finalizadaEm ? (
                    <Text style={styles.tileStatus}>
                      Última: {haQuanto(ultima.finalizadaEm)}
                      {ultima.naoConformidades ? <Text style={{ color: colors.red500, fontWeight: '700' }}> · {ultima.naoConformidades} NC</Text> : null}
                    </Text>
                  ) : (
                    <Text style={styles.tileStatusVazio}>Não avaliado</Text>
                  )}
                  <View style={styles.tileAcaoLinha}>
                    <Text style={styles.tileAcao}>{and ? 'Continuar' : 'Iniciar checklist'}</Text>
                    <Feather name="arrow-right" size={14} color={colors.navy700} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!carregando && finalizadas.length > 0 && (
          <>
            <Text style={styles.secaoTitulo}>Checklists finalizados</Text>
            <View style={styles.listaCard}>
              {finalizadas.map((a, i) => {
                const banda = faixa(a.aproveitamento ?? 0);
                const visual = visualDe(a.setor);
                return (
                  <View key={a.id} style={[styles.linha, i > 0 && styles.linhaDivisor]}>
                    <View style={[styles.linhaIcone, { backgroundColor: visual.fundo }]}>
                      <Feather name={visual.icone} size={15} color={visual.cor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linhaNome}>{nomeDoSetor(a.setor)}</Text>
                      <Text style={styles.linhaMeta} numberOfLines={1}>
                        {a.finalizadaEm ? dataHora(a.finalizadaEm) : '—'} · {a.gerenteNome}
                      </Text>
                    </View>
                    <View style={[styles.notaChip, { backgroundColor: banda.fundo, marginRight: spacing.sm }]}>
                      <Text style={[styles.notaChipTexto, { color: banda.cor }]}>{a.aproveitamento ?? 0}%</Text>
                    </View>
                    <TouchableOpacity style={styles.btnShare} onPress={() => compartilhar(a)} disabled={compartilhandoId === a.id}>
                      {compartilhandoId === a.id ? (
                        <ActivityIndicator color={colors.white} size="small" />
                      ) : (
                        <Feather name="share-2" size={16} color={colors.white} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// =============================================================================
// Preenchimento (perguntas em gavetas).
// =============================================================================
function FormularioAvaliacao({
  setor,
  avaliacao,
  usuarioNome,
  onVoltar,
}: {
  setor: SetorKey;
  avaliacao: AvaliacaoSetor;
  usuarioNome: string;
  onVoltar: () => void;
}) {
  const [perguntas, setPerguntas] = useState<AvaliacaoPergunta[]>([]);
  const [respostas, setRespostas] = useState<Map<string, AvaliacaoResposta>>(new Map());
  const [justificativas, setJustificativas] = useState<Record<string, string>>({});
  const [consideracoes, setConsideracoes] = useState(avaliacao.consideracoesFinais ?? '');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [passos, setPassos] = useState<number | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const visual = visualDe(setor);

  // Pedômetro (passos durante o checklist).
  useEffect(() => {
    let inscricao: { remove: () => void } | null = null;
    (async () => {
      try {
        if (!(await Pedometer.isAvailableAsync())) return;
        if (Platform.OS === 'ios') {
          const permissao = await Pedometer.requestPermissionsAsync();
          if (!permissao.granted) return;
        }
        setPassos(0);
        inscricao = Pedometer.watchStepCount((r) => setPassos(r.steps));
      } catch {
        // sem sensor/permissão
      }
    })();
    return () => inscricao?.remove();
  }, []);

  // Localização no início (só se ainda não foi gravada).
  useEffect(() => {
    if (avaliacao.localizacaoLat != null) return;
    (async () => {
      try {
        const permissao = await Location.requestForegroundPermissionsAsync();
        if (!permissao.granted) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        let endereco: string | null = null;
        try {
          const [r] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          if (r) endereco = [r.street, r.subregion || r.city, r.region].filter(Boolean).join(', ');
        } catch {
          // sem endereço legível
        }
        await salvarLocalizacaoAvaliacao(avaliacao.id, { lat: pos.coords.latitude, lng: pos.coords.longitude, endereco });
      } catch {
        // sem GPS/permissão
      }
    })();
  }, [avaliacao.id]);

  useEffect(() => {
    Promise.all([buscarPerguntasAtivas(setor), buscarRespostasDaAvaliacao(avaliacao.id)])
      .then(([lista, resp]) => {
        setPerguntas(lista);
        const mapa = new Map<string, AvaliacaoResposta>();
        const just: Record<string, string> = {};
        resp.forEach((r) => {
          if (!r.perguntaId) return;
          mapa.set(r.perguntaId, r);
          if (r.justificativa) just[r.perguntaId] = r.justificativa;
        });
        setRespostas(mapa);
        setJustificativas(just);
        // Abre a primeira gaveta que ainda tem pergunta sem resposta.
        const primeira = lista.find((p) => !mapa.has(p.id));
        setAbertos(new Set([primeira?.grupo || 'Perguntas']));
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar as perguntas.'))
      .finally(() => setCarregando(false));
  }, [avaliacao.id, setor]);

  const grupos = useMemo(() => {
    const lista: { nome: string; perguntas: { p: AvaliacaoPergunta; numero: number }[] }[] = [];
    perguntas.forEach((p, i) => {
      const nome = p.grupo || 'Perguntas';
      let g = lista.find((x) => x.nome === nome);
      if (!g) {
        g = { nome, perguntas: [] };
        lista.push(g);
      }
      g.perguntas.push({ p, numero: i + 1 });
    });
    return lista;
  }, [perguntas]);

  async function gravar(p: AvaliacaoPergunta, valor: RespostaValor, fotos: string[], justificativa: string | null) {
    setOcupadoId(p.id);
    try {
      const nova = await salvarResposta({
        avaliacaoId: avaliacao.id,
        perguntaId: p.id,
        perguntaTexto: p.texto,
        resposta: valor,
        justificativa,
        fotosUrls: fotos,
      });
      setRespostas((prev) => new Map(prev).set(p.id, nova));
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Verifique a internet e tente de novo.');
    } finally {
      setOcupadoId(null);
    }
  }

  function responder(p: AvaliacaoPergunta, valor: RespostaValor) {
    const atual = respostas.get(p.id);
    gravar(p, valor, valor === 'nao' ? atual?.fotosUrls ?? [] : [], valor === 'nao' ? (justificativas[p.id] ?? '').trim() || null : null);
  }

  function salvarJustificativa(p: AvaliacaoPergunta) {
    const r = respostas.get(p.id);
    if (!r || r.resposta !== 'nao') return;
    const texto = (justificativas[p.id] ?? '').trim();
    if ((r.justificativa ?? '') === texto) return;
    gravar(p, 'nao', r.fotosUrls, texto || null);
  }

  function escolherFoto(p: AvaliacaoPergunta) {
    Alert.alert('Foto', 'Como você quer anexar a foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto agora', onPress: () => capturarFoto(p, 'camera') },
      { text: 'Escolher da galeria', onPress: () => capturarFoto(p, 'galeria') },
    ]);
  }

  async function capturarFoto(p: AvaliacaoPergunta, origem: 'camera' | 'galeria') {
    const r = respostas.get(p.id);
    if (!r || r.resposta !== 'nao') return;
    let uri: string | null = null;
    if (origem === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Sem permissão', 'Libere o acesso à câmera nas configurações do celular.');
      const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      if (!res.canceled && res.assets?.[0]) uri = res.assets[0].uri;
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('Sem permissão', 'Libere o acesso às fotos nas configurações do celular.');
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!res.canceled && res.assets?.[0]) uri = res.assets[0].uri;
    }
    if (!uri) return;
    setOcupadoId(p.id);
    try {
      const url = await enviarFotoNaoConformidade(uri);
      setOcupadoId(null);
      await gravar(p, 'nao', [...r.fotosUrls, url], (justificativas[p.id] ?? r.justificativa ?? '').trim() || null);
    } catch (e: any) {
      setOcupadoId(null);
      Alert.alert('Não consegui enviar a foto', e?.message ?? 'Verifique a internet.');
    }
  }

  function removerFoto(p: AvaliacaoPergunta, url: string) {
    const r = respostas.get(p.id);
    if (!r) return;
    Alert.alert('Remover foto?', '', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => gravar(p, 'nao', r.fotosUrls.filter((u) => u !== url), r.justificativa) },
    ]);
  }

  const semResposta = perguntas.filter((p) => !respostas.has(p.id)).length;
  const semObs = perguntas.filter((p) => {
    const r = respostas.get(p.id);
    return r?.resposta === 'nao' && !(justificativas[p.id] ?? r.justificativa ?? '').trim();
  }).length;
  const totalRespondidas = perguntas.length - semResposta;
  const completa = perguntas.length > 0 && semResposta === 0 && semObs === 0;
  const podeFinalizar = totalRespondidas > 0;

  function textoBotao(): string {
    if (finalizando) return 'Finalizando…';
    if (completa) return 'Finalizar checklist';
    const f: string[] = [];
    if (semResposta) f.push(`${semResposta} sem resposta`);
    if (semObs) f.push(`${semObs} sem observação`);
    return totalRespondidas ? `Finalizar · faltam ${f.join(', ')}` : 'Responda ao menos uma pergunta';
  }

  function finalizar() {
    if (!podeFinalizar) return;
    if (!completa) {
      const linhas: string[] = [];
      if (semResposta) linhas.push(`• ${semResposta} pergunta(s) sem resposta — ficam como "Não avaliada" e não contam na nota.`);
      if (semObs) linhas.push(`• ${semObs} "Não" sem observação.`);
      Alert.alert('O checklist ainda não está completo', linhas.join('\n') + '\n\nDeseja finalizar mesmo assim?', [
        { text: 'Continuar respondendo', style: 'cancel' },
        { text: 'Finalizar mesmo assim', style: 'destructive', onPress: confirmar },
      ]);
      return;
    }
    confirmar();
  }

  function confirmar() {
    Alert.alert('Finalizar checklist', `Finalizar a avaliação de ${nomeDoSetor(setor)}? Os "Não" vão virar Correção para o encarregado.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar',
        onPress: async () => {
          setFinalizando(true);
          try {
            for (const p of perguntas) {
              const r = respostas.get(p.id);
              const texto = (justificativas[p.id] ?? '').trim();
              if (r?.resposta === 'nao' && (r.justificativa ?? '') !== texto) await gravar(p, 'nao', r.fotosUrls, texto || null);
            }
            const resultado = await finalizarAvaliacao({
              avaliacaoId: avaliacao.id,
              setor,
              nomeSetor: nomeDoSetor(setor),
              gerenteNome: usuarioNome,
              passosContados: passos,
              consideracoesFinais: consideracoes.trim() || null,
              perguntasNaoAvaliadas: semResposta,
            });
            const resumo =
              `Aproveitamento: ${resultado.aproveitamento}%.\n` +
              (resultado.naoConformidades
                ? `${resultado.naoConformidades} não conformidade(s) — Correção enviada ao encarregado.`
                : 'Nenhuma não conformidade encontrada. 🎉') +
              (semResposta ? `\n${semResposta} pergunta(s) não avaliada(s).` : '');
            try {
              await compartilharAvaliacao(resultado);
            } catch (e: any) {
              Alert.alert('Checklist salvo, mas o PDF falhou', `${e?.message ?? ''}\nCompartilhe depois em "Checklists finalizados".`);
            }
            Alert.alert('Checklist finalizado', resumo, [{ text: 'OK', onPress: onVoltar }]);
          } catch (e: any) {
            setErro(e?.message ?? 'Não consegui finalizar o checklist.');
            setFinalizando(false);
          }
        },
      },
    ]);
  }

  function alternar(nome: string) {
    setAbertos((prev) => {
      const n = new Set(prev);
      if (n.has(nome)) n.delete(nome);
      else n.add(nome);
      return n;
    });
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.formHeader}>
        <TouchableOpacity onPress={onVoltar} style={styles.formVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="chevron-left" size={20} color={colors.navy700} />
        </TouchableOpacity>
        <View style={[styles.tileIcone, { backgroundColor: visual.fundo, width: 36, height: 36 }]}>
          <Feather name={visual.icone} size={17} color={visual.cor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.formTitulo}>{nomeDoSetor(setor)}</Text>
          <Text style={styles.formSub}>
            {totalRespondidas}/{perguntas.length} respondidas{passos !== null ? ` · 🚶 ${passos}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.barraForm}>
        <View style={[styles.barraFormCheia, { width: `${perguntas.length ? Math.round((totalRespondidas / perguntas.length) * 100) : 0}%` }]} />
      </View>

      {carregando ? (
        <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
      ) : (
        <>
          <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
            {erro && (
              <View style={styles.erroBox}>
                <Text style={styles.erroTexto}>{erro}</Text>
              </View>
            )}

            {grupos.map((g) => {
              const aberto = abertos.has(g.nome);
              const resp = g.perguntas.filter(({ p }) => respostas.has(p.id)).length;
              const pend = g.perguntas.some(({ p }) => {
                const r = respostas.get(p.id);
                return r?.resposta === 'nao' && !(justificativas[p.id] ?? r.justificativa ?? '').trim();
              });
              const completo = resp === g.perguntas.length && !pend;
              const temNao = g.perguntas.some(({ p }) => respostas.get(p.id)?.resposta === 'nao');
              return (
                <View key={g.nome} style={styles.gaveta}>
                  <TouchableOpacity style={styles.gavetaCab} onPress={() => alternar(g.nome)} activeOpacity={0.8}>
                    <View style={[styles.gavetaStatus, completo ? { backgroundColor: colors.green500 } : pend ? { backgroundColor: colors.red500 } : null]}>
                      {completo ? (
                        <Feather name="check" size={13} color={colors.white} />
                      ) : pend ? (
                        <Feather name="alert-circle" size={13} color={colors.white} />
                      ) : (
                        <Text style={styles.gavetaStatusTexto}>{g.perguntas.length - resp}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gavetaTitulo}>{g.nome}</Text>
                      <Text style={styles.gavetaSub}>
                        {resp}/{g.perguntas.length} respondidas
                        {temNao ? <Text style={{ color: colors.red500, fontWeight: '700' }}> · tem "Não"</Text> : null}
                      </Text>
                    </View>
                    <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray600} />
                  </TouchableOpacity>

                  {aberto &&
                    g.perguntas.map(({ p, numero }) => {
                      const r = respostas.get(p.id);
                      const semObsP = r?.resposta === 'nao' && !(justificativas[p.id] ?? r.justificativa ?? '').trim();
                      return (
                        <View key={p.id} style={[styles.perguntaCard, semObsP && { borderColor: colors.red500 }]}>
                          <Text style={styles.perguntaTexto}>{numero}. {p.texto}</Text>
                          <View style={styles.chips}>
                            {(['sim', 'nao', 'na'] as RespostaValor[]).map((valor) => (
                              <TouchableOpacity
                                key={valor}
                                style={[styles.chip, r?.resposta === valor && (valor === 'nao' ? styles.chipNao : valor === 'na' ? styles.chipNa : styles.chipSim)]}
                                onPress={() => responder(p, valor)}
                                disabled={ocupadoId === p.id}
                              >
                                <Text style={[styles.chipTexto, r?.resposta === valor && { color: colors.white }]}>
                                  {valor === 'sim' ? 'Sim' : valor === 'nao' ? 'Não' : 'N/A'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          {r?.resposta === 'nao' && (
                            <View style={styles.caixaExtra}>
                              <Text style={styles.label}>Observação (obrigatória)</Text>
                              <TextInput
                                style={[styles.input, semObsP && { borderColor: colors.red500 }]}
                                placeholder="Descreva a não conformidade encontrada"
                                value={justificativas[p.id] ?? ''}
                                onChangeText={(t) => setJustificativas((prev) => ({ ...prev, [p.id]: t }))}
                                onBlur={() => salvarJustificativa(p)}
                                multiline
                              />
                              <Text style={[styles.label, { marginTop: spacing.md }]}>Fotos (opcional) · {r.fotosUrls.length}/{MAX_FOTOS}</Text>
                              <View style={styles.fotos}>
                                {r.fotosUrls.map((u) => (
                                  <View key={u}>
                                    <Image source={{ uri: u }} style={styles.foto} />
                                    <TouchableOpacity style={styles.fotoRemover} onPress={() => removerFoto(p, u)}>
                                      <Feather name="x" size={12} color={colors.white} />
                                    </TouchableOpacity>
                                  </View>
                                ))}
                                {r.fotosUrls.length < MAX_FOTOS &&
                                  (ocupadoId === p.id ? (
                                    <View style={[styles.fotoAdd, { borderStyle: 'solid' }]}>
                                      <ActivityIndicator color={colors.navy700} />
                                    </View>
                                  ) : (
                                    <TouchableOpacity style={styles.fotoAdd} onPress={() => escolherFoto(p)}>
                                      <Feather name="camera" size={18} color={colors.navy700} />
                                      <Text style={styles.fotoAddTexto}>{r.fotosUrls.length ? '+ foto' : 'Foto'}</Text>
                                    </TouchableOpacity>
                                  ))}
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })}
                </View>
              );
            })}

            <View style={styles.consideracoesCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                <Feather name="edit-3" size={16} color={colors.navy700} />
                <Text style={styles.consideracoesTitulo}>Considerações finais</Text>
                <Text style={styles.opcional}>opcional</Text>
              </View>
              <TextInput
                style={[styles.input, { minHeight: 96 }]}
                placeholder="Observações gerais, orientações passadas à equipe, prazos combinados…"
                value={consideracoes}
                onChangeText={setConsideracoes}
                multiline
              />
            </View>
          </ScrollView>

          <View style={styles.rodape}>
            <TouchableOpacity
              style={[styles.btnFinalizar, (!podeFinalizar || finalizando) && styles.btnFinalizarDesab]}
              onPress={finalizar}
              disabled={!podeFinalizar || finalizando}
            >
              {finalizando ? <ActivityIndicator color={colors.white} size="small" style={{ marginRight: 8 }} /> : null}
              <Text style={[styles.btnFinalizarTexto, !podeFinalizar && { color: colors.gray600 }, podeFinalizar && !completa && { fontSize: 12.5 }]} numberOfLines={1}>
                {textoBotao()}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  hero: { backgroundColor: colors.navy700, paddingTop: 52, paddingHorizontal: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  heroBotao: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12 },
  heroBotaoTexto: { color: colors.white, fontSize: 13, fontWeight: '600' },
  heroTitulo: { color: colors.white, fontSize: 21, fontWeight: '800' },
  statsCard: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: spacing.md, shadowColor: '#121B4A', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  stat: { flex: 1, alignItems: 'center' },
  statValor: { color: colors.navy900, fontSize: 20, fontWeight: '800' },
  statRotulo: { color: colors.gray600, fontSize: 10.5, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  statDivisor: { width: 1, backgroundColor: colors.gray100, marginVertical: 4 },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  comoFunciona: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: spacing.md, marginTop: spacing.lg },
  comoFuncionaTitulo: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.navy900 },
  passos: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginTop: 6, gap: 10 },
  passo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  passoIcone: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gray50, alignItems: 'center', justifyContent: 'center' },
  passoTexto: { flex: 1, fontSize: 12, color: colors.gray600, lineHeight: 16 },
  secaoTitulo: { fontSize: 14, fontWeight: '800', color: colors.navy900, marginTop: spacing.xxl, marginBottom: spacing.md },
  grade: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  tile: { width: '48.3%', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, shadowColor: '#121B4A', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tileLargo: { width: '100%' },
  tileTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  tileIcone: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  tileNome: { fontSize: 14.5, fontWeight: '800', color: colors.gray900 },
  tileMeta: { fontSize: 11, color: colors.gray400, marginTop: 2 },
  tileStatus: { fontSize: 11.5, color: colors.gray600, marginTop: spacing.sm },
  tileStatusVazio: { fontSize: 11.5, color: colors.gray400, marginTop: spacing.sm, fontStyle: 'italic' },
  tileStatusAndamento: { fontSize: 11, color: '#B4650E', fontWeight: '700', marginTop: 5 },
  barraFundo: { height: 6, borderRadius: 3, backgroundColor: colors.gray100, overflow: 'hidden' },
  barraCheia: { height: 6, borderRadius: 3, backgroundColor: '#E8A13A' },
  tileAcaoLinha: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.md },
  tileAcao: { fontSize: 12.5, fontWeight: '700', color: colors.navy700 },
  notaChip: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  notaChipTexto: { fontSize: 11.5, fontWeight: '800' },
  listaCard: { backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: spacing.md },
  linha: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  linhaDivisor: { borderTopWidth: 1, borderTopColor: colors.gray100 },
  linhaIcone: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  linhaNome: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  linhaMeta: { fontSize: 11, color: colors.gray600, marginTop: 2 },
  btnShare: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, paddingTop: 52, paddingBottom: spacing.md, paddingHorizontal: spacing.lg },
  formVoltar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.gray50, alignItems: 'center', justifyContent: 'center' },
  formTitulo: { fontSize: 16, fontWeight: '800', color: colors.navy900 },
  formSub: { fontSize: 11.5, color: colors.gray600, marginTop: 1 },
  barraForm: { height: 4, backgroundColor: colors.gray100 },
  barraFormCheia: { height: 4, backgroundColor: colors.green500 },
  gaveta: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden' },
  gavetaCab: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  gavetaStatus: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  gavetaStatusTexto: { fontSize: 11.5, fontWeight: '800', color: colors.gray600 },
  gavetaTitulo: { fontSize: 14, fontWeight: '800', color: colors.gray900 },
  gavetaSub: { fontSize: 11.5, color: colors.gray600, marginTop: 1 },
  perguntaCard: { backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md, marginHorizontal: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: 'transparent' },
  perguntaTexto: { fontSize: 13.5, fontWeight: '600', color: colors.gray900, lineHeight: 19 },
  chips: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  chip: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center' },
  chipSim: { backgroundColor: colors.green500, borderColor: colors.green500 },
  chipNao: { backgroundColor: colors.red500, borderColor: colors.red500 },
  chipNa: { backgroundColor: colors.gray600, borderColor: colors.gray600 },
  chipTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  caixaExtra: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray100 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900, minHeight: 54, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.gray100 },
  fotos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  foto: { width: 68, height: 68, borderRadius: radius.sm, backgroundColor: colors.gray100 },
  fotoRemover: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.red500, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  fotoAdd: { width: 68, height: 68, borderRadius: radius.sm, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.navy500, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, gap: 2 },
  fotoAddTexto: { fontSize: 10.5, fontWeight: '700', color: colors.navy700 },
  consideracoesCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.sm },
  consideracoesTitulo: { fontSize: 14, fontWeight: '800', color: colors.gray900, flex: 1 },
  opcional: { fontSize: 11, color: colors.gray400 },
  rodape: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray100, padding: spacing.lg },
  btnFinalizar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.md },
  btnFinalizarDesab: { backgroundColor: colors.gray100 },
  btnFinalizarTexto: { color: colors.white, fontSize: 14, fontWeight: '700' },
});
