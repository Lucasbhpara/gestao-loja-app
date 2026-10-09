import React, { useEffect, useMemo, useReducer, useState } from 'react';
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
  BackHandler,
  AppState,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import ValidadeDocumentosCard from '../components/ValidadeDocumentosCard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { colors, radius, spacing } from '../theme/colors';
import {
  RespostaVisita,
  SETORES_VISITA,
  SetorVisita,
  UNIDADE_DA_LOJA,
  VisitaPergunta,
  VisitaTecnica,
  buscarUltimasVisitasPorSetor,
  buscarVisitasFinalizadas,
  nomeDoSetorVisita,
} from '../data/visitaTecnicaApi';
import {
  RespostaLocal,
  VisitaLocal,
  assinar,
  atualizarPerguntas,
  carregarOffline,
  consideracoesLocal,
  contarPendentes,
  criarVisitaLocal,
  descartarSeVazia,
  finalizadasPendentes,
  finalizarLocal,
  MAX_FOTOS,
  adicionarFotoLocal,
  removerFotoLocal,
  importarVisitaRemota,
  justificarLocal,
  passosLocal,
  perguntasDoSetor,
  responderLocal,
  sincronizar,
  sincronizarEmBreve,
  temPerguntasGuardadas,
  ultimoErroSincronizacao,
  visitaEmAndamentoLocal,
  visitaLocal,
} from '../lib/visitaOffline';
import { compartilharVisita } from '../lib/visitaTecnicaPdf';
import CorrecaoScreen from './CorrecaoScreen';
import { buscarCorrecoesParaAprovar } from '../data/correcaoApi';
import { Tarefa } from '../data/tarefasApi';

// =============================================================================
// Visita Técnica — checklist do Técnico Veterinário (ver visitaTecnicaApi.ts
// e, pro funcionamento sem internet, src/lib/visitaOffline.ts).
//
// Fluxo:
//   1. "Qual unidade estamos visitando agora?" — número da loja; ao
//      confirmar, pega a localização (vale pra todas as visitas da sessão);
//   2. Painel da unidade: setores em grade, resumo do mês, finalizadas;
//   3. Visita de um setor: perguntas em gavetas por subcategoria
//      (Temperatura, Câmara fria…), considerações finais opcionais.
// Tudo é salvo primeiro no celular e enviado quando tiver internet.
//
// Usada pelo próprio veterinário (login cai direto aqui, vem `onSair`) e
// pelo administrador, como tile da Home (vem `onVoltar`).
// =============================================================================

const CHAVE_ULTIMA_UNIDADE = '@ulva/visita-ultima-unidade';

type IconeFeather = React.ComponentProps<typeof Feather>['name'];

// Ícone e cor de cada setor — pra grade ser fácil de reconhecer de relance.
const VISUAL_SETOR: Record<SetorVisita, { icone: IconeFeather; cor: string; fundo: string }> = {
  acougue: { icone: 'scissors', cor: '#C5392F', fundo: '#FBE4E2' },
  frios: { icone: 'thermometer', cor: '#2C6FB4', fundo: '#E1ECF8' },
  padaria: { icone: 'coffee', cor: '#B4650E', fundo: '#FBEBD4' },
  flv: { icone: 'sun', cor: '#2C8F5E', fundo: '#DCF2E7' },
  deposito: { icone: 'package', cor: '#6B4FA3', fundo: '#ECE6F7' },
  mercearia: { icone: 'shopping-cart', cor: '#1B2A6B', fundo: '#E3E7F5' },
  geral: { icone: 'file-text', cor: '#5B6280', fundo: '#E7E9F2' },
};

interface Localizacao {
  lat: number;
  lng: number;
  endereco: string | null;
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

function hojePorExtenso(): string {
  const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Re-renderiza o componente sempre que o armazenamento offline mudar.
function useOffline() {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => assinar(tick), []);
}

// GPS com limite de tempo (dentro de câmara/depósito o fix pode demorar).
async function pegarLocalizacao(): Promise<Localizacao | null> {
  try {
    const permissao = await Location.requestForegroundPermissionsAsync();
    if (!permissao.granted) return null;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
    ]);
    if (!pos) {
      const ultima = await Location.getLastKnownPositionAsync().catch(() => null);
      if (!ultima) return null;
      return { lat: ultima.coords.latitude, lng: ultima.coords.longitude, endereco: null };
    }
    let endereco: string | null = null;
    try {
      // Endereço legível depende de internet — sem sinal, fica só lat/lng.
      const [r] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      if (r) endereco = [r.street, r.subregion || r.city, r.region].filter(Boolean).join(', ');
    } catch {
      // segue sem endereço
    }
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, endereco };
  } catch {
    return null;
  }
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
  const [unidade, setUnidade] = useState<string | null>(null);
  const [localizacao, setLocalizacao] = useState<Localizacao | null>(null);

  // Carrega o que está salvo no celular, atualiza as perguntas e tenta
  // enviar o que estiver pendente — na abertura, a cada 30s e sempre que o
  // app volta pra frente.
  useEffect(() => {
    carregarOffline().then(() => {
      atualizarPerguntas();
      sincronizar().catch(() => {});
    });
    const intervalo = setInterval(() => sincronizar().catch(() => {}), 30000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sincronizar().catch(() => {});
    });
    return () => {
      clearInterval(intervalo);
      sub.remove();
    };
  }, []);

  function confirmarSair() {
    Alert.alert('Sair da conta?', 'Você vai precisar entrar de novo com nome e senha.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: onSair },
    ]);
  }

  if (!unidade) {
    return (
      <EscolherUnidade
        usuarioNome={usuarioNome}
        onVoltar={onVoltar}
        onSair={onSair ? confirmarSair : undefined}
        onConfirmar={(u, loc) => {
          setUnidade(u);
          setLocalizacao(loc);
        }}
      />
    );
  }

  return (
    <PainelUnidade
      unidade={unidade}
      localizacao={localizacao}
      usuarioNome={usuarioNome}
      usuarioMatricula={usuarioMatricula ?? null}
      onVoltar={onVoltar}
      onSair={onSair ? confirmarSair : undefined}
      onTrocarUnidade={() => {
        setUnidade(null);
        setLocalizacao(null);
      }}
    />
  );
}

// =============================================================================
// 1. "Qual unidade estamos visitando agora?"
// =============================================================================
function EscolherUnidade({
  usuarioNome,
  onVoltar,
  onSair,
  onConfirmar,
}: {
  usuarioNome: string;
  onVoltar?: () => void;
  onSair?: () => void;
  onConfirmar: (unidade: string, localizacao: Localizacao | null) => void;
}) {
  const [numero, setNumero] = useState('');
  const [buscandoLocal, setBuscandoLocal] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(CHAVE_ULTIMA_UNIDADE)
      .then((u) => {
        if (u) setNumero(u);
      })
      .catch(() => {});
  }, []);

  const valido = /^\d{1,5}$/.test(numero.trim());

  async function confirmar() {
    if (!valido) return;
    const u = String(Number(numero.trim()));
    AsyncStorage.setItem(CHAVE_ULTIMA_UNIDADE, u).catch(() => {});
    setBuscandoLocal(true);
    const loc = await pegarLocalizacao();
    setBuscandoLocal(false);
    onConfirmar(u, loc);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, styles.heroUnidade]}>
          <View style={styles.heroBarra}>
            {onVoltar ? (
              <TouchableOpacity onPress={onVoltar} style={styles.heroBotao}>
                <Feather name="chevron-left" size={18} color={colors.white} />
                <Text style={styles.heroBotaoTexto}>Voltar</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            {onSair ? (
              <TouchableOpacity onPress={onSair} style={styles.heroBotao}>
                <Feather name="log-out" size={16} color={colors.white} />
                <Text style={styles.heroBotaoTexto}>Sair</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
          </View>
          <View style={styles.unidadeIconeGrande}>
            <Feather name="map-pin" size={30} color={colors.navy700} />
          </View>
          <Text style={styles.unidadeOla}>Olá, {usuarioNome.split(' ')[0]}!</Text>
          <Text style={styles.unidadeData}>{hojePorExtenso()}</Text>
        </View>

        <View style={styles.unidadeCard}>
          <Text style={styles.unidadePergunta}>Qual unidade estamos visitando agora?</Text>
          <Text style={styles.unidadeAjuda}>Digite o número da loja. Ao confirmar, vamos registrar a sua localização.</Text>
          <View style={styles.unidadeInputLinha}>
            <Text style={styles.unidadePrefixo}>Loja</Text>
            <TextInput
              style={styles.unidadeInput}
              value={numero}
              onChangeText={(t) => setNumero(t.replace(/\D/g, '').slice(0, 5))}
              keyboardType="number-pad"
              placeholder="327"
              placeholderTextColor={colors.gray400}
              maxLength={5}
              autoFocus={!numero}
              returnKeyType="done"
              onSubmitEditing={confirmar}
            />
          </View>
          <TouchableOpacity
            style={[styles.btnConfirmar, (!valido || buscandoLocal) && styles.btnConfirmarDesab]}
            onPress={confirmar}
            disabled={!valido || buscandoLocal}
          >
            {buscandoLocal ? (
              <>
                <ActivityIndicator color={colors.white} size="small" />
                <Text style={styles.btnConfirmarTexto}>Pegando sua localização…</Text>
              </>
            ) : (
              <>
                <Feather name="navigation" size={16} color={colors.white} />
                <Text style={styles.btnConfirmarTexto}>Confirmar unidade</Text>
              </>
            )}
          </TouchableOpacity>
          <View style={styles.offlineDica}>
            <Feather name="wifi-off" size={13} color={colors.gray600} />
            <Text style={styles.offlineDicaTexto}>Funciona sem internet: tudo fica salvo no celular e é enviado sozinho depois.</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// =============================================================================
// 2. Painel da unidade
// =============================================================================
function PainelUnidade({
  unidade,
  localizacao,
  usuarioNome,
  usuarioMatricula,
  onVoltar,
  onSair,
  onTrocarUnidade,
}: {
  unidade: string;
  localizacao: Localizacao | null;
  usuarioNome: string;
  usuarioMatricula: string | null;
  onVoltar?: () => void;
  onSair?: () => void;
  onTrocarUnidade: () => void;
}) {
  useOffline();
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [semInternet, setSemInternet] = useState(false);
  const [ultimas, setUltimas] = useState<Map<SetorVisita, VisitaTecnica>>(new Map());
  const [finalizadas, setFinalizadas] = useState<VisitaTecnica[]>([]);
  const [visitaAberta, setVisitaAberta] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState<SetorVisita | null>(null);
  const [compartilhandoId, setCompartilhandoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarComoFunciona, setMostrarComoFunciona] = useState(false);
  const [paraAprovar, setParaAprovar] = useState<Tarefa[]>([]);
  const [aprovando, setAprovando] = useState<Tarefa | null>(null);

  async function carregar() {
    try {
      const [mapa, lista, correcoes] = await Promise.all([
        buscarUltimasVisitasPorSetor(unidade),
        buscarVisitasFinalizadas(unidade, 30),
        unidade === UNIDADE_DA_LOJA ? buscarCorrecoesParaAprovar('visita') : Promise.resolve([] as Tarefa[]),
      ]);
      setUltimas(mapa);
      setFinalizadas(lista);
      setParaAprovar(correcoes);
      setSemInternet(false);
    } catch {
      setSemInternet(true);
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [unidade]);

  // Voltar do Android: dentro da visita volta pro painel; no painel, troca
  // de unidade (no modo veterinário) ou deixa a Home do admin decidir.
  useEffect(() => {
    const aoVoltar = () => {
      if (aprovando) {
        setAprovando(null);
        return true;
      }
      if (visitaAberta) {
        descartarSeVazia(visitaAberta);
        setVisitaAberta(null);
        carregar();
        return true;
      }
      if (onSair) {
        onTrocarUnidade();
        return true;
      }
      return false;
    };
    const assinatura = BackHandler.addEventListener('hardwareBackPress', aoVoltar);
    return () => assinatura.remove();
  }, [visitaAberta, aprovando]);

  const pendentesUnidade = finalizadasPendentes(unidade);
  const totalPendentes = contarPendentes();
  const erroEnvio = ultimoErroSincronizacao();

  // Resumo do mês (nuvem + o que finalizou no celular e ainda não subiu).
  const doMes = useMemo(() => {
    const agora = new Date();
    const doMesmoMes = (iso: string | null) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    };
    const notas: { pct: number; crit: number }[] = [];
    finalizadas.filter((v) => doMesmoMes(v.finalizadaEm)).forEach((v) => notas.push({ pct: v.aproveitamento ?? 0, crit: v.criticosNaoConformes ?? 0 }));
    pendentesUnidade
      .filter((v) => doMesmoMes(v.finalizadaEm) && !finalizadas.some((f) => f.id === v.id))
      .forEach((v) => notas.push({ pct: v.resultadoLocal?.aproveitamento ?? 0, crit: v.resultadoLocal?.criticos ?? 0 }));
    const media = notas.length ? Math.round((notas.reduce((s, n) => s + n.pct, 0) / notas.length) * 10) / 10 : null;
    return { visitas: notas.length, media, criticos: notas.reduce((s, n) => s + n.crit, 0) };
  }, [finalizadas, pendentesUnidade.length]);

  async function abrirSetor(setor: SetorVisita) {
    setAbrindo(setor);
    try {
      await carregarOffline();
      if (!temPerguntasGuardadas()) {
        const ok = await atualizarPerguntas();
        if (!ok || !temPerguntasGuardadas()) {
          Alert.alert('Precisa de internet uma vez', 'Na primeira vez o app precisa de internet para baixar as perguntas. Depois funciona sem sinal.');
          return;
        }
      }
      let v: VisitaLocal | null = visitaEmAndamentoLocal(setor, unidade);
      if (!v) {
        try {
          v = await importarVisitaRemota(setor, unidade);
        } catch {
          v = null; // sem internet — começa uma nova no celular
        }
      }
      if (!v) {
        v = criarVisitaLocal({
          setor,
          unidade,
          veterinarioNome: usuarioNome,
          veterinarioMatricula: usuarioMatricula,
          localizacao,
        });
      }
      setVisitaAberta(v.id);
    } finally {
      setAbrindo(null);
    }
  }

  async function enviarAgora() {
    setEnviando(true);
    const r = await sincronizar().catch(() => ({ ok: false, pendentes: contarPendentes() }));
    setEnviando(false);
    if (r.pendentes === 0) carregar();
    else Alert.alert('Ainda sem conexão', 'Não consegui enviar agora. O app tenta de novo sozinho quando a internet voltar.');
  }

  async function compartilhar(v: VisitaTecnica) {
    setCompartilhandoId(v.id);
    try {
      await compartilharVisita(v);
    } catch (e: any) {
      Alert.alert('Não consegui gerar o PDF', e?.message ?? 'Verifique a internet e tente novamente.');
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

  if (visitaAberta) {
    return (
      <FormularioVisita
        visitaId={visitaAberta}
        onVoltar={() => {
          descartarSeVazia(visitaAberta);
          setVisitaAberta(null);
          carregar();
        }}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              atualizarPerguntas();
              sincronizar().catch(() => {}).finally(carregar);
            }}
          />
        }
      >
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
              <TouchableOpacity onPress={onSair} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.heroBotao}>
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
              <Text style={styles.heroSub}>{hojePorExtenso()}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.unidadeChip} onPress={onTrocarUnidade} activeOpacity={0.8}>
            <Feather name="map-pin" size={14} color={colors.white} />
            <Text style={styles.unidadeChipTexto}>Loja {unidade}</Text>
            {localizacao ? <Feather name="check-circle" size={13} color="#9BE3BE" /> : null}
            <Text style={styles.unidadeChipTrocar}>· trocar</Text>
          </TouchableOpacity>

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
          {(totalPendentes > 0 || semInternet) && (
            <View style={[styles.syncCard, totalPendentes > 0 ? styles.syncCardPendente : null]}>
              <Feather name={totalPendentes > 0 ? 'upload-cloud' : 'wifi-off'} size={18} color={totalPendentes > 0 ? '#B4650E' : colors.gray600} />
              <View style={{ flex: 1 }}>
                <Text style={styles.syncTitulo}>
                  {totalPendentes > 0
                    ? `${totalPendentes} visita(s) aguardando envio`
                    : 'Sem internet no momento'}
                </Text>
                <Text style={styles.syncTexto}>
                  {totalPendentes > 0
                    ? 'Está tudo salvo no celular. Envia sozinho quando a internet voltar.'
                    : 'Pode continuar normalmente — tudo fica salvo no celular.'}
                  {erroEnvio && !semInternet ? `\nÚltimo erro: ${erroEnvio}` : ''}
                </Text>
              </View>
              {totalPendentes > 0 && (
                <TouchableOpacity style={styles.syncBotao} onPress={enviarAgora} disabled={enviando}>
                  {enviando ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.syncBotaoTexto}>Enviar</Text>}
                </TouchableOpacity>
              )}
            </View>
          )}

          {unidade !== UNIDADE_DA_LOJA && (
            <View style={styles.avisoUnidade}>
              <Feather name="info" size={14} color={colors.navy700} />
              <Text style={styles.avisoUnidadeTexto}>
                Nesta unidade a visita fica registrada com PDF, mas os "Não" não viram tarefa (as tarefas automáticas são só da Loja {UNIDADE_DA_LOJA}).
              </Text>
            </View>
          )}

          {paraAprovar.length > 0 && (
            <>
              <Text style={styles.secaoTitulo}>Correções para aprovar</Text>
              <View style={styles.listaCard}>
                {paraAprovar.map((t, i) => (
                  <TouchableOpacity key={t.id} style={[styles.linhaFinalizada, i > 0 && styles.linhaDivisor]} onPress={() => setAprovando(t)}>
                    <View style={[styles.linhaIcone, { backgroundColor: '#FFF1DC' }]}>
                      <Feather name="check-circle" size={15} color="#B4650E" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linhaNome}>{t.titulo.replace('Visita Técnica — ', '')}</Text>
                      <Text style={styles.linhaMeta}>Corrigido por {t.correcaoEnviadaPor ?? '—'}{t.correcaoRodada > 1 ? ` · rodada ${t.correcaoRodada}` : ''}</Text>
                    </View>
                    <Text style={styles.tileAcao}>Avaliar</Text>
                    <Feather name="chevron-right" size={16} color={colors.navy700} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <View style={{ marginTop: spacing.lg }}>
            <ValidadeDocumentosCard unidade={unidade} usuarioNome={usuarioNome} modo="resumo" />
          </View>

          <TouchableOpacity style={styles.comoFunciona} onPress={() => setMostrarComoFunciona((v) => !v)} activeOpacity={0.8}>
            <Feather name="info" size={15} color={colors.navy700} />
            <Text style={styles.comoFuncionaTitulo}>Como funciona</Text>
            <Feather name={mostrarComoFunciona ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray600} />
          </TouchableOpacity>
          {mostrarComoFunciona && (
            <View style={styles.passos}>
              {[
                { icone: 'grid' as const, texto: 'Escolha o setor; as perguntas ficam em gavetas por assunto (Temperatura, Câmara fria…).' },
                { icone: 'alert-triangle' as const, texto: 'Responda Sim (conforme), Não ou N/A. Itens CRÍTICO e com 📷 pedem atenção e foto.' },
                { icone: 'wifi-off' as const, texto: 'Sem sinal na câmara? Pode continuar: tudo fica salvo e é enviado depois.' },
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
                const perguntas = perguntasDoSetor(key);
                const total = perguntas.length;
                const criticas = perguntas.filter((p) => p.critico).length;
                const andamento = visitaEmAndamentoLocal(key, unidade);
                const respondidas = andamento ? perguntas.filter((p) => andamento.respostas[p.id]).length : 0;
                const pct = andamento && total > 0 ? Math.min(1, respondidas / total) : 0;

                // Última finalizada: a mais recente entre nuvem e celular.
                const nuvem = ultimas.get(key);
                const local = pendentesUnidade.find((v) => v.setor === key);
                const ultimaPct = local && (!nuvem || (local.finalizadaEm ?? '') > (nuvem.finalizadaEm ?? ''))
                  ? { pct: local.resultadoLocal?.aproveitamento ?? 0, em: local.finalizadaEm!, crit: local.resultadoLocal?.criticos ?? 0 }
                  : nuvem
                  ? { pct: nuvem.aproveitamento ?? 0, em: nuvem.finalizadaEm!, crit: nuvem.criticosNaoConformes ?? 0 }
                  : null;
                const banda = ultimaPct ? faixa(ultimaPct.pct) : null;

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
                          <Text style={[styles.notaChipTexto, { color: banda.cor }]}>{ultimaPct!.pct}%</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.tileNome} numberOfLines={1}>{nome}</Text>
                    <Text style={styles.tileMeta}>
                      {total ? `${total} perguntas${criticas ? ` · ${criticas} críticas` : ''}` : 'Perguntas ao abrir'}
                    </Text>
                    {andamento ? (
                      <View style={{ marginTop: spacing.sm }}>
                        <View style={styles.barraFundo}>
                          <View style={[styles.barraCheia, { width: `${Math.round(pct * 100)}%` }]} />
                        </View>
                        <Text style={styles.tileStatusAndamento}>
                          Em andamento · {respondidas}/{total}
                        </Text>
                      </View>
                    ) : ultimaPct ? (
                      <Text style={styles.tileStatus}>
                        Última: {haQuanto(ultimaPct.em)}
                        {ultimaPct.crit ? <Text style={{ color: colors.red500, fontWeight: '700' }}> · {ultimaPct.crit} crít.</Text> : null}
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

          {!carregando && (pendentesUnidade.length > 0 || finalizadas.length > 0) && (
            <>
              <Text style={styles.secaoTitulo}>Visitas finalizadas</Text>
              <View style={styles.listaCard}>
                {pendentesUnidade.map((v, i) => {
                  const visual = VISUAL_SETOR[v.setor];
                  const banda = faixa(v.resultadoLocal?.aproveitamento ?? 0);
                  return (
                    <View key={v.id} style={[styles.linhaFinalizada, i > 0 && styles.linhaDivisor]}>
                      <View style={[styles.linhaIcone, { backgroundColor: visual.fundo }]}>
                        <Feather name={visual.icone} size={15} color={visual.cor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linhaNome}>{nomeDoSetorVisita(v.setor)}</Text>
                        <Text style={[styles.linhaMeta, { color: '#B4650E', fontWeight: '700' }]}>Aguardando internet para enviar</Text>
                      </View>
                      <View style={[styles.notaChip, { backgroundColor: banda.fundo, marginRight: spacing.sm }]}>
                        <Text style={[styles.notaChipTexto, { color: banda.cor }]}>{v.resultadoLocal?.aproveitamento ?? 0}%</Text>
                      </View>
                      <View style={[styles.btnShare, { backgroundColor: colors.gray100 }]}>
                        <Feather name="clock" size={16} color={colors.gray600} />
                      </View>
                    </View>
                  );
                })}
                {finalizadas
                  .filter((v) => !pendentesUnidade.some((p) => p.id === v.id))
                  .map((v, i) => {
                    const banda = faixa(v.aproveitamento ?? 0);
                    const visual = VISUAL_SETOR[v.setor];
                    return (
                      <View key={v.id} style={[styles.linhaFinalizada, (i > 0 || pendentesUnidade.length > 0) && styles.linhaDivisor]}>
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
// 3. Preenchimento da visita de um setor (perguntas em gavetas).
// =============================================================================
function FormularioVisita({ visitaId, onVoltar }: { visitaId: string; onVoltar: () => void }) {
  useOffline();
  const visita = visitaLocal(visitaId);
  const setor = visita?.setor ?? 'geral';
  const perguntas = useMemo(() => perguntasDoSetor(setor), [setor]);

  const [justificativas, setJustificativas] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    Object.values(visita?.respostas ?? {}).forEach((r) => {
      if (r.justificativa) m[r.perguntaId] = r.justificativa;
    });
    return m;
  });
  const [consideracoes, setConsideracoes] = useState(visita?.consideracoes ?? '');
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [passos, setPassos] = useState<number | null>(visita?.passos ?? null);

  // Gavetas: começa com a primeira subcategoria que ainda tem pergunta sem
  // resposta aberta; o resto fechado.
  const grupos = useMemo(() => {
    const lista: { nome: string; perguntas: { p: VisitaPergunta; numero: number }[] }[] = [];
    perguntas.forEach((p, i) => {
      const nome = p.grupo || 'Outros';
      let g = lista.find((x) => x.nome === nome);
      if (!g) {
        g = { nome, perguntas: [] };
        lista.push(g);
      }
      g.perguntas.push({ p, numero: i + 1 });
    });
    return lista;
  }, [perguntas]);
  const [abertos, setAbertos] = useState<Set<string>>(() => {
    const primeiro = grupos.find((g) => g.perguntas.some(({ p }) => !visita?.respostas[p.id]));
    return new Set(primeiro ? [primeiro.nome] : []);
  });

  // Pedômetro (passos da visita), guardado junto da visita no celular.
  useEffect(() => {
    let inscricao: { remove: () => void } | null = null;
    const base = visita?.passos ?? 0;
    (async () => {
      try {
        if (!(await Pedometer.isAvailableAsync())) return;
        if (Platform.OS === 'ios') {
          const permissao = await Pedometer.requestPermissionsAsync();
          if (!permissao.granted) return;
        }
        setPassos(base);
        inscricao = Pedometer.watchStepCount((r) => {
          setPassos(base + r.steps);
          passosLocal(visitaId, base + r.steps);
        });
      } catch {
        // sem sensor/permissão — segue sem contar passos
      }
    })();
    return () => inscricao?.remove();
  }, [visitaId]);

  if (!visita) {
    return (
      <View style={[styles.flex, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.explicacao}>Visita não encontrada.</Text>
        <TouchableOpacity onPress={onVoltar}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const respostas = visita.respostas;
  const visual = VISUAL_SETOR[setor];

  function alternarGrupo(nome: string) {
    setAbertos((prev) => {
      const n = new Set(prev);
      if (n.has(nome)) n.delete(nome);
      else n.add(nome);
      return n;
    });
  }

  function responder(p: VisitaPergunta, valor: RespostaVisita) {
    responderLocal(visitaId, p, valor);
    sincronizarEmBreve();
  }

  function salvarJustificativa(p: VisitaPergunta) {
    justificarLocal(visitaId, p, (justificativas[p.id] ?? '').trim());
    sincronizarEmBreve();
  }

  function escolherFoto(p: VisitaPergunta) {
    Alert.alert('Foto', 'Como você quer anexar a foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto agora', onPress: () => capturarFoto(p, 'camera') },
      { text: 'Escolher da galeria', onPress: () => capturarFoto(p, 'galeria') },
    ]);
  }

  async function capturarFoto(p: VisitaPergunta, origem: 'camera' | 'galeria') {
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
    setOcupadoId(p.id);
    try {
      await adicionarFotoLocal(visitaId, p, uri);
      sincronizarEmBreve();
    } finally {
      setOcupadoId(null);
    }
  }

  // Pendências que impedem de finalizar.
  function pendenciaDa(p: VisitaPergunta, r: RespostaLocal | undefined): 'sem_resposta' | 'sem_obs' | 'sem_foto' | null {
    if (!r) return 'sem_resposta';
    if (r.resposta === 'nao' && !(justificativas[p.id] ?? r.justificativa ?? '').trim()) return 'sem_obs';
    if (p.fotoObrigatoria && r.resposta !== 'na' && r.fotos.length === 0) return 'sem_foto';
    return null;
  }
  let semResposta = 0;
  let semObs = 0;
  let semFoto = 0;
  perguntas.forEach((p) => {
    const pend = pendenciaDa(p, respostas[p.id]);
    if (pend === 'sem_resposta') semResposta++;
    if (pend === 'sem_obs') semObs++;
    if (pend === 'sem_foto') semFoto++;
  });
  const totalRespondidas = perguntas.length - semResposta;
  const completa = perguntas.length > 0 && semResposta === 0 && semObs === 0 && semFoto === 0;
  // Dá pra finalizar sem terminar (pelo menos 1 resposta): o que ficou sem
  // resposta vira "Não avaliada" (fora da nota) — ver finalizar().
  const podeFinalizar = totalRespondidas > 0;

  function textoBotao(): string {
    if (finalizando) return 'Finalizando…';
    if (completa) return 'Finalizar visita';
    const faltas: string[] = [];
    if (semResposta) faltas.push(`${semResposta} sem resposta`);
    if (semObs) faltas.push(`${semObs} sem observação`);
    if (semFoto) faltas.push(`${semFoto} sem foto`);
    return totalRespondidas ? `Finalizar · faltam ${faltas.join(', ')}` : 'Responda ao menos uma pergunta';
  }

  function finalizar() {
    if (!podeFinalizar || !visita) return;
    if (!completa) {
      const linhas: string[] = [];
      if (semResposta) linhas.push(`• ${semResposta} pergunta(s) sem resposta — ficam como "Não avaliada" e não contam na nota.`);
      if (semObs) linhas.push(`• ${semObs} "Não" sem observação.`);
      if (semFoto) linhas.push(`• ${semFoto} foto(s) obrigatória(s) faltando.`);
      Alert.alert('A visita ainda não está completa', linhas.join('\n') + '\n\nDeseja finalizar mesmo assim?', [
        { text: 'Continuar respondendo', style: 'cancel' },
        { text: 'Finalizar mesmo assim', style: 'destructive', onPress: () => confirmarFinalizacao() },
      ]);
      return;
    }
    confirmarFinalizacao();
  }

  function confirmarFinalizacao() {
    if (!visita) return;
    Alert.alert(
      'Finalizar visita',
      `Finalizar a visita de ${nomeDoSetorVisita(setor)} (Loja ${visita.unidade})?` +
        (visita.unidade === UNIDADE_DA_LOJA ? ` As não conformidades vão virar tarefa para ${setor === 'geral' ? 'a Gerência' : 'o encarregado do setor'}.` : ''),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: async () => {
            setFinalizando(true);
            // Garante que o que está digitado foi salvo antes de fechar.
            perguntas.forEach((p) => {
              if (respostas[p.id]?.resposta === 'nao') justificarLocal(visitaId, p, (justificativas[p.id] ?? '').trim());
            });
            consideracoesLocal(visitaId, consideracoes.trim());
            await finalizarLocal(visitaId, perguntas);
            const local = visitaLocal(visitaId);
            const resumo =
              `Aproveitamento: ${local?.resultadoLocal?.aproveitamento ?? 0}%.\n` +
              (local?.resultadoLocal?.naoConformidades
                ? `${local.resultadoLocal.naoConformidades} não conformidade(s)` +
                  (local.resultadoLocal.criticos ? `, ${local.resultadoLocal.criticos} crítica(s)` : '') +
                  '.'
                : 'Nenhuma não conformidade encontrada. 🎉') +
              (local?.resultadoLocal?.naoAvaliadas ? `\n${local.resultadoLocal.naoAvaliadas} pergunta(s) não avaliada(s).` : '');

            await sincronizar().catch(() => {});
            const enviada = visitaLocal(visitaId)?.resultadoNuvem;
            if (enviada) {
              // Online: já abre a tela de compartilhar com o PDF.
              try {
                await compartilharVisita(enviada);
              } catch (e: any) {
                Alert.alert('Visita salva, mas o PDF falhou', `${e?.message ?? ''}\nCompartilhe depois em "Visitas finalizadas".`);
              }
              Alert.alert('Visita finalizada', resumo, [{ text: 'OK', onPress: onVoltar }]);
            } else {
              Alert.alert(
                'Visita salva no celular',
                resumo +
                  '\n\nSem internet agora: ela será enviada sozinha quando o sinal voltar. O PDF fica disponível em "Visitas finalizadas" depois do envio.',
                [{ text: 'OK', onPress: onVoltar }]
              );
            }
          },
        },
      ]
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.formHeader}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.formVoltar}>
          <Feather name="chevron-left" size={20} color={colors.navy700} />
        </TouchableOpacity>
        <View style={[styles.tileIcone, { backgroundColor: visual.fundo, width: 36, height: 36 }]}>
          <Feather name={visual.icone} size={17} color={visual.cor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.formTitulo}>{nomeDoSetorVisita(setor)}</Text>
          <Text style={styles.formSub}>
            Loja {visita.unidade} · {totalRespondidas}/{perguntas.length} respondidas{passos !== null ? ` · 🚶 ${passos}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.barraProgressoForm}>
        <View
          style={[styles.barraProgressoFormCheia, { width: `${perguntas.length ? Math.round((totalRespondidas / perguntas.length) * 100) : 0}%` }]}
        />
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        {setor === 'geral' && (
          <ValidadeDocumentosCard unidade={visita.unidade} usuarioNome={visita.veterinarioNome} modo="editar" />
        )}
        {grupos.map((g) => {
          const aberto = abertos.has(g.nome);
          const respondidasG = g.perguntas.filter(({ p }) => respostas[p.id]).length;
          const completo = respondidasG === g.perguntas.length && g.perguntas.every(({ p }) => !pendenciaDa(p, respostas[p.id]));
          const temNao = g.perguntas.some(({ p }) => respostas[p.id]?.resposta === 'nao');
          const temPendenciaIniciada = g.perguntas.some(({ p }) => {
            const pend = pendenciaDa(p, respostas[p.id]);
            return pend === 'sem_obs' || pend === 'sem_foto';
          });
          return (
            <View key={g.nome} style={styles.gaveta}>
              <TouchableOpacity style={styles.gavetaCabecalho} onPress={() => alternarGrupo(g.nome)} activeOpacity={0.8}>
                <View style={[styles.gavetaStatus, completo ? styles.gavetaStatusOk : temPendenciaIniciada ? styles.gavetaStatusAlerta : null]}>
                  {completo ? (
                    <Feather name="check" size={13} color={colors.white} />
                  ) : temPendenciaIniciada ? (
                    <Feather name="alert-circle" size={13} color={colors.white} />
                  ) : (
                    <Text style={styles.gavetaStatusTexto}>{g.perguntas.length - respondidasG}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gavetaTitulo}>{g.nome}</Text>
                  <Text style={styles.gavetaSub}>
                    {respondidasG}/{g.perguntas.length} respondidas
                    {temNao ? <Text style={{ color: colors.red500, fontWeight: '700' }}> · tem "Não"</Text> : null}
                  </Text>
                </View>
                <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray600} />
              </TouchableOpacity>

              {aberto &&
                g.perguntas.map(({ p, numero }) => {
                  const r = respostas[p.id];
                  const pend = r ? pendenciaDa(p, r) : null;
                  const fotos = r?.fotos ?? [];
                  const mostrarFoto = !!r && r.resposta !== 'na' && (p.fotoObrigatoria || r.resposta === 'nao');
                  return (
                    <View key={p.id} style={[styles.perguntaCard, pend && styles.perguntaPendente]}>
                      <View style={styles.tagsLinha}>
                        {p.critico && <Text style={styles.tagCritico}>CRÍTICO</Text>}
                        {p.fotoObrigatoria && <Text style={styles.tagFoto}>📷 foto obrigatória</Text>}
                      </View>
                      <Text style={styles.perguntaTexto}>{numero}. {p.texto}</Text>
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
                            style={[styles.input, !(justificativas[p.id] ?? '').trim() && styles.inputErro]}
                            placeholder="Descreva o que foi encontrado"
                            value={justificativas[p.id] ?? ''}
                            onChangeText={(t) => setJustificativas((prev) => ({ ...prev, [p.id]: t }))}
                            onBlur={() => salvarJustificativa(p)}
                            multiline
                          />
                        </View>
                      )}

                      {mostrarFoto && (
                        <View style={r?.resposta === 'nao' ? { marginTop: spacing.md } : styles.caixaExtra}>
                          <Text style={styles.label}>
                            Fotos {p.fotoObrigatoria ? '(obrigatória)' : '(opcional)'} · {fotos.length}/{MAX_FOTOS}
                          </Text>
                          <View style={styles.fotosGrade}>
                            {fotos.map((f) => (
                              <View key={f.id} style={styles.fotoItem}>
                                <Image source={{ uri: (f.local ?? f.url) as string }} style={styles.foto} />
                                <TouchableOpacity
                                  style={styles.fotoRemover}
                                  onPress={() =>
                                    Alert.alert('Remover foto?', '', [
                                      { text: 'Cancelar', style: 'cancel' },
                                      { text: 'Remover', style: 'destructive', onPress: () => removerFotoLocal(visitaId, p, f.id) },
                                    ])
                                  }
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                  <Feather name="x" size={12} color={colors.white} />
                                </TouchableOpacity>
                                {f.local ? <View style={styles.fotoNuvem}><Feather name="upload-cloud" size={10} color={colors.white} /></View> : null}
                              </View>
                            ))}
                            {fotos.length < MAX_FOTOS &&
                              (ocupadoId === p.id ? (
                                <View style={[styles.fotoAdd, { borderStyle: 'solid' }]}>
                                  <ActivityIndicator color={colors.navy700} />
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={[styles.fotoAdd, p.fotoObrigatoria && fotos.length === 0 && { borderColor: colors.red500 }]}
                                  onPress={() => escolherFoto(p)}
                                >
                                  <Feather name="camera" size={18} color={p.fotoObrigatoria && fotos.length === 0 ? colors.red500 : colors.navy700} />
                                  <Text style={[styles.fotoAddTexto, p.fotoObrigatoria && fotos.length === 0 && { color: colors.red500 }]}>
                                    {fotos.length ? '+ foto' : 'Foto'}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                          </View>
                          {fotos.some((f) => f.local) ? <Text style={styles.fotoPendente}>☁ salvas no celular · enviam quando tiver internet</Text> : null}
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
            placeholder="Observações gerais da visita, orientações passadas à equipe, prazos combinados…"
            value={consideracoes}
            onChangeText={setConsideracoes}
            onBlur={() => {
              consideracoesLocal(visitaId, consideracoes.trim());
              sincronizarEmBreve();
            }}
            multiline
          />
        </View>
      </ScrollView>

      <View style={styles.rodape}>
        <TouchableOpacity
          style={[styles.btnFinalizar, (!podeFinalizar || finalizando) && styles.btnFinalizarDesabilitado]}
          onPress={finalizar}
          disabled={!podeFinalizar || finalizando}
        >
          {finalizando ? <ActivityIndicator color={colors.white} size="small" style={{ marginRight: 8 }} /> : null}
          <Text
            style={[styles.btnFinalizarTexto, !podeFinalizar && { color: colors.gray600 }, podeFinalizar && !completa && { fontSize: 12.5 }]}
            numberOfLines={1}
          >
            {textoBotao()}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  voltar: { color: colors.navy700, fontSize: 15, fontWeight: '600' },
  explicacao: { fontSize: 12.5, color: colors.gray600, lineHeight: 18, marginBottom: spacing.lg },

  // Topo azul
  hero: { backgroundColor: colors.navy700, paddingTop: 52, paddingBottom: spacing.xl, paddingHorizontal: spacing.lg, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  heroBarra: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  heroBotao: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12 },
  heroBotaoTexto: { color: colors.white, fontSize: 13, fontWeight: '600' },
  heroTituloLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIcone: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  heroTitulo: { color: colors.white, fontSize: 21, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 2 },
  heroStats: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.lg, paddingVertical: spacing.md, marginTop: spacing.md },
  stat: { flex: 1, alignItems: 'center' },
  statValor: { color: colors.white, fontSize: 20, fontWeight: '800' },
  statRotulo: { color: 'rgba(255,255,255,0.7)', fontSize: 10.5, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  statDivisor: { width: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 4 },
  unidadeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12, marginTop: spacing.md },
  unidadeChipTexto: { color: colors.white, fontSize: 13, fontWeight: '800' },
  unidadeChipTrocar: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },

  // Tela da unidade
  heroUnidade: { alignItems: 'center', paddingBottom: 56 },
  unidadeIconeGrande: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  unidadeOla: { color: colors.white, fontSize: 22, fontWeight: '800', marginTop: spacing.md },
  unidadeData: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  unidadeCard: { backgroundColor: colors.white, borderRadius: radius.xl, marginHorizontal: spacing.lg, marginTop: -36, padding: spacing.xl, shadowColor: '#121B4A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  unidadePergunta: { fontSize: 19, fontWeight: '800', color: colors.navy900, textAlign: 'center' },
  unidadeAjuda: { fontSize: 12.5, color: colors.gray600, textAlign: 'center', marginTop: 6, lineHeight: 17 },
  unidadeInputLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.xl, backgroundColor: colors.gray50, borderRadius: radius.lg, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.gray100 },
  unidadePrefixo: { fontSize: 18, fontWeight: '700', color: colors.gray400 },
  unidadeInput: { fontSize: 34, fontWeight: '800', color: colors.navy900, minWidth: 110, textAlign: 'center', letterSpacing: 2, paddingVertical: 0 },
  btnConfirmar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, marginTop: spacing.xl },
  btnConfirmarDesab: { backgroundColor: colors.gray400 },
  btnConfirmarTexto: { color: colors.white, fontSize: 15, fontWeight: '700' },
  offlineDica: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.lg, justifyContent: 'center' },
  offlineDicaTexto: { fontSize: 11.5, color: colors.gray600, flexShrink: 1, textAlign: 'center' },

  // Painel
  syncCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.gray100 },
  syncCardPendente: { backgroundColor: '#FFF7EA', borderColor: '#F4D9A8' },
  syncTitulo: { fontSize: 13, fontWeight: '800', color: colors.gray900 },
  syncTexto: { fontSize: 11.5, color: colors.gray600, marginTop: 2, lineHeight: 16 },
  syncBotao: { backgroundColor: '#B4650E', borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12, minWidth: 64, alignItems: 'center' },
  syncBotaoTexto: { color: colors.white, fontWeight: '700', fontSize: 12.5 },
  avisoUnidade: { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#E3E7F5', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  avisoUnidadeTexto: { flex: 1, fontSize: 11.5, color: colors.navy700, lineHeight: 16 },
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
  linhaFinalizada: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
  linhaDivisor: { borderTopWidth: 1, borderTopColor: colors.gray100 },
  linhaIcone: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  linhaNome: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  linhaMeta: { fontSize: 11, color: colors.gray600, marginTop: 2 },
  btnShare: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' },

  // Formulário
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, paddingTop: 52, paddingBottom: spacing.md, paddingHorizontal: spacing.lg },
  formVoltar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.gray50, alignItems: 'center', justifyContent: 'center' },
  formTitulo: { fontSize: 16, fontWeight: '800', color: colors.navy900 },
  formSub: { fontSize: 11.5, color: colors.gray600, marginTop: 1 },
  barraProgressoForm: { height: 4, backgroundColor: colors.gray100 },
  barraProgressoFormCheia: { height: 4, backgroundColor: colors.green500 },
  gaveta: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden' },
  gavetaCabecalho: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  gavetaStatus: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  gavetaStatusOk: { backgroundColor: colors.green500 },
  gavetaStatusAlerta: { backgroundColor: colors.red500 },
  gavetaStatusTexto: { fontSize: 11.5, fontWeight: '800', color: colors.gray600 },
  gavetaTitulo: { fontSize: 14, fontWeight: '800', color: colors.gray900 },
  gavetaSub: { fontSize: 11.5, color: colors.gray600, marginTop: 1 },
  perguntaCard: { backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md, marginHorizontal: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: 'transparent' },
  perguntaPendente: { borderColor: colors.red500 },
  tagsLinha: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tagCritico: { fontSize: 9.5, fontWeight: '800', color: colors.red500, borderWidth: 1, borderColor: colors.red500, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 6 },
  tagFoto: { fontSize: 9.5, fontWeight: '700', color: colors.gray600, backgroundColor: colors.white, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 6 },
  perguntaTexto: { fontSize: 13.5, fontWeight: '600', color: colors.gray900, lineHeight: 19 },
  dica: { fontSize: 11.5, color: colors.gray600, marginTop: 6, lineHeight: 16 },
  base: { fontSize: 10.5, color: colors.gray400, marginTop: 3 },
  chipsWrap: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  chip: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center' },
  chipSim: { backgroundColor: colors.green500, borderColor: colors.green500 },
  chipNao: { backgroundColor: colors.red500, borderColor: colors.red500 },
  chipNa: { backgroundColor: colors.gray600, borderColor: colors.gray600 },
  chipTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  caixaExtra: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray100 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginBottom: 6 },
  input: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900, minHeight: 54, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.gray100 },
  inputErro: { borderColor: colors.red500 },
  btnFoto: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  btnFotoTexto: { fontSize: 12, fontWeight: '700', color: colors.navy700 },
  fotosGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  fotoItem: { width: 68, height: 68 },
  foto: { width: 68, height: 68, borderRadius: radius.sm, backgroundColor: colors.gray100 },
  fotoRemover: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.red500, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  fotoNuvem: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(180,101,14,0.9)', borderRadius: 8, padding: 3 },
  fotoAdd: { width: 68, height: 68, borderRadius: radius.sm, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.navy500, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, gap: 2 },
  fotoAddTexto: { fontSize: 10.5, fontWeight: '700', color: colors.navy700 },
  fotoPendente: { fontSize: 10.5, color: '#B4650E', marginTop: 4 },
  consideracoesCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.sm },
  consideracoesTitulo: { fontSize: 14, fontWeight: '800', color: colors.gray900, flex: 1 },
  opcional: { fontSize: 11, color: colors.gray400 },
  rodape: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray100, padding: spacing.lg },
  btnFinalizar: { flexDirection: 'row', justifyContent: 'center', backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.md, alignItems: 'center' },
  btnFinalizarDesabilitado: { backgroundColor: colors.gray100 },
  btnFinalizarTexto: { color: colors.white, fontSize: 14, fontWeight: '700' },
});
