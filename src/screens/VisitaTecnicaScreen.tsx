import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, RefreshControl, Alert, Platform, BackHandler } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { colors, radius, spacing } from '../theme/colors';
import {
  ResumoSetorVisita,
  RespostaVisita,
  SETORES_VISITA,
  SetorVisita,
  VisitaPergunta,
  VisitaResposta,
  VisitaTecnica,
  buscarPerguntasDoSetor,
  buscarRespostasDaVisita,
  buscarResumoSetores,
  buscarUltimasVisitasPorSetor,
  buscarVisitaEmAndamento,
  buscarVisitasFinalizadas,
  enviarFotoVisita,
  finalizarVisita,
  iniciarVisita,
  nomeDoSetorVisita,
  salvarLocalizacaoVisita,
  salvarRespostaVisita,
} from '../data/visitaTecnicaApi';
import { compartilharVisita } from '../lib/visitaTecnicaPdf';

// Visita Técnica — checklist do Técnico Veterinário (ver visitaTecnicaApi.ts).
// Usada de dois jeitos:
//   - pelo próprio veterinário: o login dele cai direto aqui (App.tsx), sem
//     Home — nesse caso vem `onSair` e o cabeçalho mostra "Sair";
//   - pelo administrador, como mais um tile da Home (vem `onVoltar`).

// Ícone (Feather) e cor de destaque de cada setor — só pra deixar a grade
// mais fácil de reconhecer de relance; o resto da tela segue o azul-marinho.
const VISUAL_SETOR: Record<SetorVisita, { icone: React.ComponentProps<typeof Feather>['name']; cor: string; fundo: string }> = {
  acougue: { icone: 'scissors', cor: '#C5392F', fundo: '#FBE4E2' },
  frios: { icone: 'thermometer', cor: '#2C6FB4', fundo: '#E1ECF8' },
  padaria: { icone: 'coffee', cor: '#B4650E', fundo: '#FBEBD4' },
  flv: { icone: 'sun', cor: '#2C8F5E', fundo: '#DCF2E7' },
  deposito: { icone: 'package', cor: '#6B4FA3', fundo: '#ECE6F7' },
  mercearia: { icone: 'shopping-cart', cor: '#1B2A6B', fundo: '#E3E7F5' },
  geral: { icone: 'file-text', cor: '#5B6280', fundo: '#E7E9F2' },
};

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

// "hoje", "ontem", "há 5 dias" — mais rápido de ler que a data cheia.
function haQuanto(iso: string): string {
  const inicio = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((inicio(new Date()) - inicio(new Date(iso))) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

function hojePorExtenso(): string {
  const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function VisitaTecnicaScreen({
  usuarioNome,
  usuarioMatricula,
  onVoltar,
  onSair,
}: {
  usuarioNome: string;
  usuarioMatricula?: string | null;
  onVoltar?: () => void;
  onSair?: () => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimas, setUltimas] = useState<Map<SetorVisita, VisitaTecnica>>(new Map());
  const [resumo, setResumo] = useState<Map<SetorVisita, ResumoSetorVisita>>(new Map());
  const [setorAtivo, setSetorAtivo] = useState<SetorVisita | null>(null);
  const [visitaAtiva, setVisitaAtiva] = useState<VisitaTecnica | null>(null);
  const [abrindo, setAbrindo] = useState<SetorVisita | null>(null);
  const [finalizadas, setFinalizadas] = useState<VisitaTecnica[]>([]);
  const [compartilhandoId, setCompartilhandoId] = useState<string | null>(null);
  const [mostrarComoFunciona, setMostrarComoFunciona] = useState(false);

  async function carregar() {
    try {
      setErro(null);
      const [mapa, lista, res] = await Promise.all([
        buscarUltimasVisitasPorSetor(),
        buscarVisitasFinalizadas(30),
        buscarResumoSetores(),
      ]);
      setUltimas(mapa);
      setFinalizadas(lista);
      setResumo(res);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui carregar as visitas.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  // Botão físico de voltar do Android: dentro de um setor, volta pra lista.
  // Na lista, quem decide é a tela de fora (Home do admin) — ou, no modo
  // veterinário, deixa o Android fechar o app normalmente.
  useEffect(() => {
    const aoVoltar = () => {
      if (setorAtivo) {
        setSetorAtivo(null);
        setVisitaAtiva(null);
        carregar();
        return true;
      }
      return false;
    };
    const assinatura = BackHandler.addEventListener('hardwareBackPress', aoVoltar);
    return () => assinatura.remove();
  }, [setorAtivo]);

  // Números do mês corrente pro cartão do topo.
  const doMes = useMemo(() => {
    const agora = new Date();
    const lista = finalizadas.filter((v) => {
      if (!v.finalizadaEm) return false;
      const d = new Date(v.finalizadaEm);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
    const media = lista.length
      ? Math.round((lista.reduce((s, v) => s + (v.aproveitamento ?? 0), 0) / lista.length) * 10) / 10
      : null;
    const criticos = lista.reduce((s, v) => s + (v.criticosNaoConformes ?? 0), 0);
    return { visitas: lista.length, media, criticos };
  }, [finalizadas]);

  async function abrirSetor(setor: SetorVisita) {
    setAbrindo(setor);
    try {
      let visita = await buscarVisitaEmAndamento(setor);
      if (!visita) visita = await iniciarVisita(setor, usuarioNome, usuarioMatricula ?? null);
      setVisitaAtiva(visita);
      setSetorAtivo(setor);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui iniciar a visita desse setor.');
    } finally {
      setAbrindo(null);
    }
  }

  async function compartilhar(v: VisitaTecnica) {
    setCompartilhandoId(v.id);
    try {
      await compartilharVisita(v);
    } catch (e: any) {
      Alert.alert('Não consegui gerar o PDF', e?.message ?? 'Tente novamente.');
    } finally {
      setCompartilhandoId(null);
    }
  }

  function confirmarSair() {
    Alert.alert('Sair da conta?', 'Você vai precisar entrar de novo com nome e senha.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: onSair },
    ]);
  }

  if (setorAtivo && visitaAtiva) {
    return (
      <FormularioVisita
        setor={setorAtivo}
        visita={visitaAtiva}
        usuarioNome={usuarioNome}
        onVoltar={() => {
          setSetorAtivo(null);
          setVisitaAtiva(null);
          carregar();
        }}
      />
    );
  }

  const primeiroNome = usuarioNome.split(' ')[0];

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
        {/* Topo azul-marinho: saudação + resumo do mês */}
        <View style={styles.hero}>
          <View style={styles.heroBarra}>
            {onVoltar ? (
              <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.heroBotao}>
                <Feather name="chevron-left" size={18} color={colors.white} />
                <Text style={styles.heroBotaoTexto}>Voltar</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            {onSair ? (
              <TouchableOpacity onPress={confirmarSair} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.heroBotao}>
                <Feather name="log-out" size={16} color={colors.white} />
                <Text style={styles.heroBotaoTexto}>Sair</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
          </View>

          <View style={styles.heroTituloLinha}>
            <View style={styles.heroIcone}>
              <Feather name="shield" size={22} color={colors.navy700} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitulo}>Visita Técnica</Text>
              <Text style={styles.heroSub}>
                {onSair ? `Olá, ${primeiroNome}! · ` : ''}
                {hojePorExtenso()}
              </Text>
            </View>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.stat}>
              <Text style={styles.statValor}>{doMes.visitas}</Text>
              <Text style={styles.statRotulo}>visitas no mês</Text>
            </View>
            <View style={styles.statDivisor} />
            <View style={styles.stat}>
              <Text style={styles.statValor}>{doMes.media != null ? `${doMes.media}%` : '—'}</Text>
              <Text style={styles.statRotulo}>aproveitamento</Text>
            </View>
            <View style={styles.statDivisor} />
            <View style={styles.stat}>
              <Text style={[styles.statValor, doMes.criticos > 0 && { color: '#FFB4AD' }]}>{doMes.criticos}</Text>
              <Text style={styles.statRotulo}>críticos</Text>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg }}>
          {erro && (
            <View style={[styles.erroBox, { marginTop: spacing.lg }]}>
              <Text style={styles.erroTexto}>{erro}</Text>
            </View>
          )}

          {/* Como funciona — recolhido por padrão pra não poluir a tela */}
          <TouchableOpacity style={styles.comoFunciona} onPress={() => setMostrarComoFunciona((v) => !v)} activeOpacity={0.8}>
            <Feather name="info" size={15} color={colors.navy700} />
            <Text style={styles.comoFuncionaTitulo}>Como funciona</Text>
            <Feather name={mostrarComoFunciona ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray600} />
          </TouchableOpacity>
          {mostrarComoFunciona && (
            <View style={styles.passos}>
              {[
                { icone: 'grid' as const, texto: 'Escolha o setor e responda Sim (conforme), Não ou N/A.' },
                { icone: 'alert-triangle' as const, texto: 'Itens CRÍTICO e com 📷 pedem atenção e foto.' },
                { icone: 'send' as const, texto: 'Ao finalizar, o PDF abre pra compartilhar e cada "Não" vira tarefa do encarregado.' },
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
              {SETORES_VISITA.map(({ key, nome }) => {
                const visual = VISUAL_SETOR[key];
                const ultima = ultimas.get(key);
                const r = resumo.get(key);
                const andamento = r?.emAndamento;
                const total = r?.perguntas ?? 0;
                const pctAndamento = andamento && total > 0 ? Math.min(1, andamento.respondidas / total) : 0;
                const banda = ultima?.aproveitamento != null ? faixa(ultima.aproveitamento) : null;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.tile, key === 'geral' && styles.tileLargo]}
                    onPress={() => abrirSetor(key)}
                    disabled={abrindo === key}
                    activeOpacity={0.85}
                  >
                    <View style={styles.tileTopo}>
                      <View style={[styles.tileIcone, { backgroundColor: visual.fundo }]}>
                        <Feather name={visual.icone} size={18} color={visual.cor} />
                      </View>
                      {abrindo === key ? (
                        <ActivityIndicator size="small" color={colors.navy700} />
                      ) : banda && !andamento ? (
                        <View style={[styles.notaChip, { backgroundColor: banda.fundo }]}>
                          <Text style={[styles.notaChipTexto, { color: banda.cor }]}>{ultima!.aproveitamento}%</Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={styles.tileNome} numberOfLines={1}>{nome}</Text>
                    <Text style={styles.tileMeta}>
                      {total} perguntas{r?.criticas ? ` · ${r.criticas} críticas` : ''}
                    </Text>

                    {andamento ? (
                      <View style={{ marginTop: spacing.sm }}>
                        <View style={styles.barraFundo}>
                          <View style={[styles.barraCheia, { width: `${Math.round(pctAndamento * 100)}%` }]} />
                        </View>
                        <Text style={styles.tileStatusAndamento}>
                          Em andamento · {andamento.respondidas}/{total}
                        </Text>
                      </View>
                    ) : ultima ? (
                      <Text style={styles.tileStatus}>
                        Última: {haQuanto(ultima.finalizadaEm!)}
                        {ultima.criticosNaoConformes ? (
                          <Text style={{ color: colors.red500, fontWeight: '700' }}> · {ultima.criticosNaoConformes} crít.</Text>
                        ) : null}
                      </Text>
                    ) : (
                      <Text style={styles.tileStatusVazio}>Não visitado</Text>
                    )}

                    <View style={styles.tileAcaoLinha}>
                      <Text style={styles.tileAcao}>{andamento ? 'Continuar' : 'Iniciar visita'}</Text>
                      <Feather name="arrow-right" size={14} color={colors.navy700} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {!carregando && finalizadas.length > 0 && (
            <>
              <Text style={styles.secaoTitulo}>Visitas finalizadas</Text>
              <View style={styles.listaCard}>
                {finalizadas.map((v, i) => {
                  const banda = faixa(v.aproveitamento ?? 0);
                  const visual = VISUAL_SETOR[v.setor];
                  return (
                    <View key={v.id} style={[styles.linhaFinalizada, i > 0 && styles.linhaDivisor]}>
                      <View style={[styles.linhaIcone, { backgroundColor: visual.fundo }]}>
                        <Feather name={visual.icone} size={15} color={visual.cor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linhaNome}>{nomeDoSetorVisita(v.setor)}</Text>
                        <Text style={styles.linhaMeta} numberOfLines={1}>
                          {v.finalizadaEm ? dataHora(v.finalizadaEm) : '—'} · {v.veterinarioNome}
                        </Text>
                      </View>
                      <View style={[styles.notaChip, { backgroundColor: banda.fundo, marginRight: spacing.sm }]}>
                        <Text style={[styles.notaChipTexto, { color: banda.cor }]}>{v.aproveitamento ?? 0}%</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.btnShare}
                        onPress={() => compartilhar(v)}
                        disabled={compartilhandoId === v.id}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {compartilhandoId === v.id ? (
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
        </View>
      </ScrollView>
    </View>
  );
}

// =============================================================================
// Preenchimento da visita de um setor.
// =============================================================================
function FormularioVisita({
  setor,
  visita,
  usuarioNome,
  onVoltar,
}: {
  setor: SetorVisita;
  visita: VisitaTecnica;
  usuarioNome: string;
  onVoltar: () => void;
}) {
  const [perguntas, setPerguntas] = useState<VisitaPergunta[]>([]);
  const [respostas, setRespostas] = useState<Map<string, VisitaResposta>>(new Map());
  const [justificativas, setJustificativas] = useState<Map<string, string>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [passos, setPassos] = useState<number | null>(null);

  // Pedômetro (mesmo padrão do Checklist de Setor).
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
        // sem sensor/permissão — segue sem contar passos
      }
    })();
    return () => inscricao?.remove();
  }, []);

  // Localização no início da visita (só se ainda não foi gravada).
  useEffect(() => {
    if (visita.localizacaoLat != null) return;
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
        await salvarLocalizacaoVisita(visita.id, { lat: pos.coords.latitude, lng: pos.coords.longitude, endereco });
      } catch {
        // sem GPS/permissão — segue sem localização
      }
    })();
  }, [visita.id]);

  useEffect(() => {
    Promise.all([buscarPerguntasDoSetor(setor), buscarRespostasDaVisita(visita.id)])
      .then(([lista, resp]) => {
        setPerguntas(lista);
        const mapa = new Map<string, VisitaResposta>();
        const just = new Map<string, string>();
        resp.forEach((r) => {
          if (!r.perguntaId) return;
          mapa.set(r.perguntaId, r);
          if (r.justificativa) just.set(r.perguntaId, r.justificativa);
        });
        setRespostas(mapa);
        setJustificativas(just);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar as perguntas.'))
      .finally(() => setCarregando(false));
  }, [visita.id, setor]);

  async function gravar(p: VisitaPergunta, valor: RespostaVisita, fotoUrl: string | null, justificativa: string | null) {
    setSalvandoId(p.id);
    try {
      const nova = await salvarRespostaVisita({ visitaId: visita.id, pergunta: p, resposta: valor, justificativa, fotoUrl });
      setRespostas((prev) => new Map(prev).set(p.id, nova));
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui salvar a resposta.');
    } finally {
      setSalvandoId(null);
    }
  }

  function responder(p: VisitaPergunta, valor: RespostaVisita) {
    const atual = respostas.get(p.id);
    // N/A não guarda foto; Sim/Não mantêm a foto que já tiver sido tirada.
    const foto = valor === 'na' ? null : atual?.fotoUrl ?? null;
    const just = valor === 'nao' ? justificativas.get(p.id) ?? null : null;
    gravar(p, valor, foto, just);
  }

  function salvarJustificativa(p: VisitaPergunta) {
    const atual = respostas.get(p.id);
    if (!atual || atual.resposta !== 'nao') return;
    const texto = (justificativas.get(p.id) ?? '').trim();
    if ((atual.justificativa ?? '') === texto) return;
    gravar(p, 'nao', atual.fotoUrl, texto || null);
  }

  function escolherFoto(p: VisitaPergunta) {
    Alert.alert('Foto', 'Como você quer anexar a foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto agora', onPress: () => capturarFoto(p, 'camera') },
      { text: 'Escolher da galeria', onPress: () => capturarFoto(p, 'galeria') },
    ]);
  }

  async function capturarFoto(p: VisitaPergunta, origem: 'camera' | 'galeria') {
    const atual = respostas.get(p.id);
    if (!atual || atual.resposta === 'na') return;
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
    setSalvandoId(p.id);
    try {
      const fotoUrl = await enviarFotoVisita(uri);
      const just = atual.resposta === 'nao' ? justificativas.get(p.id) ?? atual.justificativa ?? null : null;
      const nova = await salvarRespostaVisita({ visitaId: visita.id, pergunta: p, resposta: atual.resposta, justificativa: just, fotoUrl });
      setRespostas((prev) => new Map(prev).set(p.id, nova));
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui enviar a foto.');
    } finally {
      setSalvandoId(null);
    }
  }

  // O que ainda impede de finalizar.
  const pendencias = useMemo(() => {
    let semResposta = 0;
    let semJustificativa = 0;
    let semFoto = 0;
    const idsComPendencia = new Set<string>();
    perguntas.forEach((p) => {
      const r = respostas.get(p.id);
      if (!r) {
        semResposta++;
        return;
      }
      if (r.resposta === 'nao' && !(justificativas.get(p.id) ?? r.justificativa ?? '').trim()) {
        semJustificativa++;
        idsComPendencia.add(p.id);
      }
      if (p.fotoObrigatoria && r.resposta !== 'na' && !r.fotoUrl) {
        semFoto++;
        idsComPendencia.add(p.id);
      }
    });
    return { semResposta, semJustificativa, semFoto, idsComPendencia };
  }, [perguntas, respostas, justificativas]);

  const totalRespondidas = perguntas.length - pendencias.semResposta;
  const podeFinalizar =
    perguntas.length > 0 && pendencias.semResposta === 0 && pendencias.semJustificativa === 0 && pendencias.semFoto === 0;

  function textoBotao(): string {
    if (finalizando) return 'Finalizando…';
    if (pendencias.semResposta) return `Faltam ${pendencias.semResposta} pergunta(s)`;
    if (pendencias.semJustificativa) return `Falta observação em ${pendencias.semJustificativa} "Não"`;
    if (pendencias.semFoto) return `Faltam ${pendencias.semFoto} foto(s) obrigatória(s)`;
    return 'Finalizar visita';
  }

  function finalizar() {
    if (!podeFinalizar) return;
    Alert.alert(
      'Finalizar visita',
      `Finalizar a visita de ${nomeDoSetorVisita(setor)}? As não conformidades vão virar tarefa para o ${
        setor === 'geral' ? 'gerente' : 'encarregado do setor'
      }.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: async () => {
            setFinalizando(true);
            try {
              const resultado = await finalizarVisita({
                visitaId: visita.id,
                setor,
                veterinarioNome: usuarioNome,
                passosContados: passos,
                ordemPerguntas: perguntas.map((p) => p.id),
              });
              const resumo =
                `Aproveitamento: ${resultado.aproveitamento}%.\n` +
                (resultado.naoConformidades
                  ? `${resultado.naoConformidades} não conformidade(s)` +
                    (resultado.criticosNaoConformes ? `, ${resultado.criticosNaoConformes} crítica(s)` : '') +
                    ' — tarefa enviada.'
                  : 'Nenhuma não conformidade encontrada. 🎉');
              // Já abre a tela de compartilhar com o PDF (WhatsApp etc.). A
              // visita já está salva — se o PDF falhar, dá pra compartilhar
              // depois pela lista "Visitas finalizadas".
              try {
                await compartilharVisita(resultado);
              } catch (e: any) {
                Alert.alert('Visita salva, mas o PDF falhou', `${e?.message ?? ''}\nCompartilhe depois em "Visitas finalizadas".`);
              }
              Alert.alert('Visita finalizada', resumo, [{ text: 'OK', onPress: onVoltar }]);
            } catch (e: any) {
              setErro(e?.message ?? 'Não consegui finalizar a visita.');
              setFinalizando(false);
            }
          },
        },
      ]
    );
  }

  let grupoAnterior: string | null = null;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>{nomeDoSetorVisita(setor)}</Text>
        <View style={{ width: 50 }} />
      </View>

      {carregando ? (
        <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
      ) : (
        <>
          <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
            <Text style={styles.progresso}>
              {totalRespondidas} de {perguntas.length} respondidas
              {passos !== null ? ` · 🚶 ${passos} passo(s)` : ''}
            </Text>
            <View style={styles.barraProgressoForm}>
              <View
                style={[
                  styles.barraProgressoFormCheia,
                  { width: `${perguntas.length ? Math.round((totalRespondidas / perguntas.length) * 100) : 0}%` },
                ]}
              />
            </View>

            {erro && (
              <View style={styles.erroBox}>
                <Text style={styles.erroTexto}>{erro}</Text>
              </View>
            )}

            {perguntas.map((p, i) => {
              const r = respostas.get(p.id);
              const mostrarGrupo = !!p.grupo && p.grupo !== grupoAnterior;
              grupoAnterior = p.grupo;
              const comPendencia = pendencias.idsComPendencia.has(p.id);
              const mostrarFoto = !!r && r.resposta !== 'na' && (p.fotoObrigatoria || r.resposta === 'nao');
              return (
                <View key={p.id}>
                  {mostrarGrupo && <Text style={styles.grupo}>{p.grupo}</Text>}
                  <View style={[styles.perguntaCard, comPendencia && styles.perguntaPendente]}>
                    <View style={styles.tagsLinha}>
                      {p.critico && <Text style={styles.tagCritico}>CRÍTICO</Text>}
                      {p.fotoObrigatoria && <Text style={styles.tagFoto}>📷 foto obrigatória</Text>}
                    </View>
                    <Text style={styles.perguntaTexto}>{i + 1}. {p.texto}</Text>
                    {p.comoVerificar ? <Text style={styles.dica}>🔎 {p.comoVerificar}</Text> : null}
                    {p.baseManual ? <Text style={styles.base}>Base: {p.baseManual}</Text> : null}

                    <View style={styles.chipsWrap}>
                      {(['sim', 'nao', 'na'] as RespostaVisita[]).map((valor) => (
                        <TouchableOpacity
                          key={valor}
                          style={[
                            styles.chip,
                            r?.resposta === valor && (valor === 'nao' ? styles.chipNao : valor === 'na' ? styles.chipNa : styles.chipSim),
                          ]}
                          onPress={() => responder(p, valor)}
                          disabled={salvandoId === p.id}
                        >
                          <Text style={[styles.chipTexto, r?.resposta === valor && styles.chipTextoAtivo]}>
                            {valor === 'sim' ? 'Sim' : valor === 'nao' ? 'Não' : 'N/A'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {r?.resposta === 'nao' && (
                      <View style={styles.caixaExtra}>
                        <Text style={styles.label}>Observação (obrigatória)</Text>
                        <TextInput
                          style={[styles.input, !(justificativas.get(p.id) ?? '').trim() && styles.inputErro]}
                          placeholder="Descreva o que foi encontrado"
                          value={justificativas.get(p.id) ?? ''}
                          onChangeText={(t) => setJustificativas((prev) => new Map(prev).set(p.id, t))}
                          onBlur={() => salvarJustificativa(p)}
                          multiline
                        />
                      </View>
                    )}

                    {mostrarFoto && (
                      <View style={r?.resposta === 'nao' ? undefined : styles.caixaExtra}>
                        {salvandoId === p.id ? (
                          <ActivityIndicator color={colors.navy700} style={{ alignSelf: 'flex-start', marginTop: spacing.sm }} />
                        ) : r?.fotoUrl ? (
                          <View style={styles.fotoLinha}>
                            <Image source={{ uri: r.fotoUrl }} style={styles.foto} />
                            <TouchableOpacity onPress={() => escolherFoto(p)}>
                              <Text style={styles.btnFotoTexto}>📷 Trocar foto</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity style={styles.btnFoto} onPress={() => escolherFoto(p)}>
                            <Text style={[styles.btnFotoTexto, p.fotoObrigatoria && { color: colors.red500 }]}>
                              📷 {p.fotoObrigatoria ? 'Anexar foto (obrigatória)' : 'Anexar foto (opcional)'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.rodape}>
            <TouchableOpacity
              style={[styles.btnFinalizar, (!podeFinalizar || finalizando) && styles.btnFinalizarDesabilitado]}
              onPress={finalizar}
              disabled={!podeFinalizar || finalizando}
            >
              <Text style={[styles.btnFinalizarTexto, !podeFinalizar && { color: colors.gray600 }]}>{textoBotao()}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  hero: { backgroundColor: colors.navy700, paddingTop: 52, paddingBottom: spacing.xl, paddingHorizontal: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  heroBarra: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  heroBotao: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12 },
  heroBotaoTexto: { color: colors.white, fontSize: 13, fontWeight: '600' },
  heroTituloLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcone: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  heroTitulo: { color: colors.white, fontSize: 21, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 2 },
  heroStats: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.lg, paddingVertical: spacing.md, marginTop: spacing.lg },
  stat: { flex: 1, alignItems: 'center' },
  statValor: { color: colors.white, fontSize: 20, fontWeight: '800' },
  statRotulo: { color: 'rgba(255,255,255,0.7)', fontSize: 10.5, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  statDivisor: { width: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 4 },
  comoFunciona: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: spacing.md, marginTop: spacing.lg },
  comoFuncionaTitulo: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.navy900 },
  passos: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginTop: 6, gap: 10 },
  passo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  passoIcone: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gray50, alignItems: 'center', justifyContent: 'center' },
  passoTexto: { flex: 1, fontSize: 12, color: colors.gray600, lineHeight: 16 },
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
  linhaFinalizada: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  linhaDivisor: { borderTopWidth: 1, borderTopColor: colors.gray100 },
  linhaIcone: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  linhaNome: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  linhaMeta: { fontSize: 11, color: colors.gray600, marginTop: 2 },
  btnShare: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' },
  barraProgressoForm: { height: 6, borderRadius: 3, backgroundColor: colors.gray100, overflow: 'hidden', marginBottom: spacing.md },
  barraProgressoFormCheia: { height: 6, borderRadius: 3, backgroundColor: colors.green500 },
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
  ola: { fontSize: 18, fontWeight: '700', color: colors.navy900, marginBottom: spacing.sm },
  explicacao: { fontSize: 12.5, color: colors.gray600, lineHeight: 18, marginBottom: spacing.lg },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  setorCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  setorTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  setorNome: { fontSize: 15, fontWeight: '700', color: colors.gray900, flex: 1 },
  setorMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 8, lineHeight: 16 },
  setorMetaVazio: { fontSize: 11.5, color: colors.gray400, marginTop: 8, fontStyle: 'italic' },
  setorAcao: { fontSize: 12.5, color: colors.navy700, fontWeight: '700', marginTop: spacing.md },
  chipBanda: { borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 10 },
  chipBandaTexto: { fontSize: 11, fontWeight: '700' },
  secaoTitulo: { fontSize: 14, fontWeight: '800', color: colors.navy900, marginTop: spacing.xxl, marginBottom: spacing.md },
  finalizadaCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  finalizadaNome: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  finalizadaMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  btnCompartilhar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 12, minWidth: 128, alignItems: 'center' },
  btnCompartilharTexto: { color: colors.white, fontSize: 12, fontWeight: '700' },
  progresso: { fontSize: 12, fontWeight: '700', color: colors.navy700, marginBottom: spacing.md },
  grupo: { fontSize: 12, fontWeight: '800', color: colors.navy700, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.sm },
  perguntaCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: 'transparent' },
  perguntaPendente: { borderColor: colors.red500 },
  tagsLinha: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tagCritico: { fontSize: 9.5, fontWeight: '800', color: colors.red500, borderWidth: 1, borderColor: colors.red500, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 6 },
  tagFoto: { fontSize: 9.5, fontWeight: '700', color: colors.gray600, backgroundColor: colors.gray50, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 6 },
  perguntaTexto: { fontSize: 13.5, fontWeight: '600', color: colors.gray900, lineHeight: 19 },
  dica: { fontSize: 11.5, color: colors.gray600, marginTop: 6, lineHeight: 16 },
  base: { fontSize: 10.5, color: colors.gray400, marginTop: 3 },
  chipsWrap: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  chip: { flex: 1, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center' },
  chipSim: { backgroundColor: colors.green500, borderColor: colors.green500 },
  chipNao: { backgroundColor: colors.red500, borderColor: colors.red500 },
  chipNa: { backgroundColor: colors.gray600, borderColor: colors.gray600 },
  chipTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  caixaExtra: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray100 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginBottom: 6 },
  input: { backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900, minHeight: 54, textAlignVertical: 'top' },
  inputErro: { borderWidth: 1, borderColor: colors.red500 },
  btnFoto: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  btnFotoTexto: { fontSize: 12, fontWeight: '700', color: colors.navy700 },
  fotoLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  foto: { width: 64, height: 64, borderRadius: radius.sm },
  rodape: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray100, padding: spacing.lg },
  btnFinalizar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  btnFinalizarDesabilitado: { backgroundColor: colors.gray100 },
  btnFinalizarTexto: { color: colors.white, fontSize: 14, fontWeight: '700' },
});
