import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Vibration,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import RupturaTratativasScreen from './RupturaTratativasScreen';
import { abrirTratativasDaColeta } from '../data/rupturaTratativasApi';
import SeletorAreaMapa from '../components/SeletorAreaMapa';
import { AreaMapa } from '../data/mapaLojaApi';
import { buscarAreasComCache, buscarAreasDosGrupos, moverProdutoDeGrupo, salvarAreaDoGrupo } from '../data/rupturaMapaApi';
import {
  ColetaLocal,
  ColetaSalva,
  Descontinuado,
  ItemSalvo,
  GrupoRuptura,
  ItemUniverso,
  MOTIVOS_DESCONTINUADO,
  ORDEM_SITUACOES,
  ResultadoItem,
  SITUACOES,
  Situacao,
  baixarUniverso,
  buscarDescontinuados,
  buscarHistorico,
  buscarPrioridade,
  notaPrioridade,
  PrioridadeGrupo,
  buscarItensColetas,
  buscarGrupos,
  buscarProdutoPorEan,
  calcularResultado,
  carregarColetaAtual,
  compartilharPedido,
  compartilharResultado,
  contaRuptura,
  enviarColeta,
  gerarId,
  itensSalvosComoResultado,
  mapaEans,
  marcarDescontinuado,
  normalizarEan,
  reativar,
  salvarColetaAtual,
} from '../data/rupturaApi';

// Controle de Ruptura — ver src/data/rupturaApi.ts.
// Telas: grupos → coleta (câmera contínua + lista do que falta) → resultado.

const AZUL = '#2F7BFF';
const dataBR = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const nomeSetor = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const dataHoraBR = (d: string) => {
  const x = new Date(d);
  return x.toLocaleDateString('pt-BR') + ' ' + x.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

type Etapa = 'grupos' | 'coleta' | 'resultado' | 'descontinuados' | 'historico' | 'tratativas';

export default function RupturaScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const quem = usuarioAtual?.nome ?? '';

  const [etapa, setEtapa] = useState<Etapa>('grupos');
  const [grupos, setGrupos] = useState<GrupoRuptura[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [grupo, setGrupo] = useState<GrupoRuptura | null>(null);
  const [universo, setUniverso] = useState<ItemUniverso[]>([]);
  const [dataVendas, setDataVendas] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [coleta, setColeta] = useState<ColetaLocal | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  // Cada setor é uma gaveta fechada; abre uma de cada vez para a tela não poluir.
  const [setorAberto, setSetorAberto] = useState<string | null>(null);
  const [prioridade, setPrioridade] = useState<Map<string, PrioridadeGrupo>>(new Map());
  // Mapa da loja: áreas e em que área fica cada grupo.
  const [areas, setAreas] = useState<AreaMapa[]>([]);
  const [areaDoGrupo, setAreaDoGrupo] = useState<Record<string, string>>({});

  useEffect(() => {
    buscarAreasComCache().then(setAreas).catch(() => setAreas([]));
    buscarAreasDosGrupos().then(setAreaDoGrupo).catch(() => {});
  }, []);

  async function definirAreaDoGrupo(grupoId: string, areaId: string) {
    setAreaDoGrupo((m) => ({ ...m, [grupoId]: areaId }));
    try {
      await salvarAreaDoGrupo(grupoId, areaId, quem);
    } catch {
      // ficou guardado no celular; tenta de novo na próxima vez
    }
  }

  async function moverParaOutroGrupo(item: ItemUniverso, destino: GrupoRuptura): Promise<boolean> {
    if (!grupo) return false;
    try {
      await moverProdutoDeGrupo(item.codigoInterno, item.produto, destino.id, grupo.id, quem);
      setUniverso((u) => u.filter((x) => x.codigoInterno !== item.codigoInterno));
      return true;
    } catch (e: any) {
      Alert.alert('Não consegui mover', 'Precisa de internet para mover o produto de grupo.\n\n' + (e?.message ?? ''));
      return false;
    }
  }

  const carregarGrupos = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [gs, pr] = await Promise.all([buscarGrupos(), buscarPrioridade()]);
      setGrupos(gs);
      setPrioridade(pr);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui carregar os grupos.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await carregarGrupos();
      const aberta = await carregarColetaAtual();
      if (aberta) {
        Alert.alert('Coleta em andamento', `Você tem uma coleta de "${aberta.grupoNome}" com ${aberta.lidos.length} leituras. Continuar?`, [
          { text: 'Descartar', style: 'destructive', onPress: () => salvarColetaAtual(null) },
          { text: 'Continuar', onPress: () => abrirGrupo({ id: aberta.grupoId, nome: aberta.grupoNome, setor: aberta.setor } as GrupoRuptura, aberta) },
        ]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function abrirGrupo(g: GrupoRuptura, continuar?: ColetaLocal) {
    setAbrindo(true);
    try {
      const u = await baixarUniverso(g.id);
      const completo = grupos.find((x) => x.id === g.id) ?? { ...g, diasSemVenda: g.diasSemVenda ?? 10, ordem: 0, ultimaColeta: null };
      setGrupo(completo);
      setUniverso(u.itens);
      setDataVendas(u.dataVendas);
      setOffline(u.offline);
      const c: ColetaLocal = continuar ? { ...continuar, areaId: continuar.areaId ?? areaDoGrupo[g.id] ?? null } : {
        id: gerarId(), grupoId: g.id, grupoNome: g.nome, setor: g.setor, iniciadaEm: new Date().toISOString(), lidos: [],
        areaId: areaDoGrupo[g.id] ?? null,
      };
      setColeta(c);
      await salvarColetaAtual(c);
      setEtapa('coleta');
    } catch (e: any) {
      Alert.alert('Sem conexão', 'Não consegui baixar a lista deste grupo. Conecte à internet uma vez para baixar; depois a coleta funciona offline.\n\n' + (e?.message ?? ''));
    } finally {
      setAbrindo(false);
    }
  }

  async function encerrar() {
    await salvarColetaAtual(null);
    setColeta(null);
    setGrupo(null);
    setEtapa('grupos');
    carregarGrupos();
  }

  if (etapa === 'coleta' && grupo && coleta) {
    return (
      <TelaColeta
        grupo={grupo}
        universo={universo}
        coleta={coleta}
        offline={offline}
        areas={areas}
        areaDoGrupo={areaDoGrupo[grupo.id] ?? null}
        onDefinirAreaDoGrupo={(id) => definirAreaDoGrupo(grupo.id, id)}
        grupos={grupos}
        onMover={moverParaOutroGrupo}
        onMudar={(c) => { setColeta(c); salvarColetaAtual(c); }}
        onFinalizar={() => setEtapa('resultado')}
        onCancelar={() =>
          Alert.alert('Cancelar coleta?', 'As leituras desta coleta serão apagadas.', [
            { text: 'Voltar', style: 'cancel' },
            { text: 'Cancelar coleta', style: 'destructive', onPress: encerrar },
          ])
        }
      />
    );
  }

  if (etapa === 'resultado' && grupo && coleta) {
    return (
      <TelaResultado
        grupo={grupo}
        universo={universo}
        setUniverso={setUniverso}
        coleta={coleta}
        dataVendas={dataVendas}
        quem={quem}
        onVoltarColeta={() => setEtapa('coleta')}
        onConcluir={encerrar}
        onVerTratativas={async () => { await encerrar(); setEtapa('tratativas'); }}
      />
    );
  }

  if (etapa === 'tratativas') {
    return <RupturaTratativasScreen modo="gerencia" onVoltar={() => { setEtapa('grupos'); carregarGrupos(); }} />;
  }

  if (etapa === 'historico') {
    return <TelaHistorico onVoltar={() => setEtapa('grupos')} quem={quem} />;
  }

  if (etapa === 'descontinuados') {
    return <TelaDescontinuados onVoltar={() => setEtapa('grupos')} />;
  }

  // ------------------------------------------------------------ grupos ----
  const porSetor = grupos.reduce<Record<string, GrupoRuptura[]>>((acc, g) => {
    (acc[g.setor] ??= []).push(g);
    return acc;
  }, {});

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo="Ruptura" subtitulo="Escolha o grupo da gôndola e bipe o que está exposto" icone="alert-octagon" onVoltar={onVoltar} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregarGrupos} />}>
        {erro && (
          <View style={styles.aviso}>
            <Feather name="alert-circle" size={16} color={colors.red500} />
            <Text style={styles.avisoTexto}>{erro}</Text>
          </View>
        )}
        {abrindo && (
          <View style={styles.aviso}>
            <ActivityIndicator color={AZUL} />
            <Text style={styles.avisoTexto}>Baixando a lista do grupo…</Text>
          </View>
        )}
        {(() => {
          const top = grupos
            .map((g) => ({ g, p: prioridade.get(g.id), n: notaPrioridade(prioridade.get(g.id), g.ultimaColeta?.data ?? null) }))
            .filter((x) => x.p && x.p.suspeitos > 0 && x.n > 0)
            .sort((a, b) => b.n - a.n)
            .slice(0, 5);
          if (!top.length) return null;
          return (
            <View style={styles.painel}>
              <Text style={styles.painelTitulo}>🎯 Prioridade de coleta</Text>
              <Text style={styles.painelSub}>Zerados na loja que vendiam · cruzado com estoque, vendas e CD</Text>
              {top.map(({ g, p }, i) => {
                const u = g.ultimaColeta;
                const dias = u ? Math.floor((Date.now() - new Date(u.data).getTime()) / 86400000) : null;
                return (
                  <TouchableOpacity key={g.id} style={styles.painelLinha} onPress={() => abrirGrupo(g)} disabled={abrindo}>
                    <Text style={styles.painelPos}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nomeGrupo}>{g.nome}</Text>
                      <Text style={styles.subGrupo}>
                        {nomeSetor(g.setor)} · {p!.suspeitos} suspeitos{p!.comCd ? ` (${p!.comCd} o CD tem)` : ''} · {dias == null ? 'nunca coletado' : dias === 0 ? 'coletado hoje' : `coletado há ${dias}d`}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.gray400} />
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })()}
        {Object.entries(porSetor).map(([setor, gs]) => {
          const aberto = setorAberto === setor;
          const coletados = gs.filter((g) => g.ultimaColeta);
          const emFalta = coletados.reduce((t, g) => t + (g.ultimaColeta?.ruptura ?? 0), 0);
          return (
            <View key={setor} style={[styles.gaveta, aberto && styles.gavetaAberta]}>
              <TouchableOpacity style={styles.gavetaTopo} onPress={() => setSetorAberto(aberto ? null : setor)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gavetaTitulo}>{nomeSetor(setor)}</Text>
                  <Text style={styles.subGrupo}>
                    {gs.length} grupos · {coletados.length ? `${coletados.length} coletados · ${emFalta} em falta` : 'nenhuma coleta ainda'}
                  </Text>
                </View>
                <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={22} color={colors.navy700} />
              </TouchableOpacity>
              {aberto &&
                gs.map((g) => {
                  const u = g.ultimaColeta;
                  const pct = u && u.total ? Math.round((u.ruptura / u.total) * 100) : null;
                  return (
                    <TouchableOpacity key={g.id} style={styles.cardGrupo} onPress={() => abrirGrupo(g)} disabled={abrindo}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.nomeGrupo}>{g.nome}</Text>
                        <Text style={styles.subGrupo}>{u ? `Última coleta ${dataBR(u.data)} · ${u.ruptura} em ruptura` : 'Nenhuma coleta ainda'}</Text>
                        {(prioridade.get(g.id)?.suspeitos ?? 0) > 0 && (
                          <Text style={styles.suspeitos}>⚠️ {prioridade.get(g.id)!.suspeitos} suspeitos de ruptura</Text>
                        )}
                      </View>
                      {pct != null && (
                        <View style={[styles.pill, { backgroundColor: pct >= 10 ? '#FDECEA' : pct >= 5 ? '#FFF8D6' : '#DFF3E8' }]}>
                          <Text style={[styles.pillTexto, { color: pct >= 10 ? '#C0352B' : pct >= 5 ? '#9A7A00' : '#178553' }]}>{pct}%</Text>
                        </View>
                      )}
                      <Feather name="chevron-right" size={20} color={colors.gray400} />
                    </TouchableOpacity>
                  );
                })}
            </View>
          );
        })}
        {!carregando && grupos.length === 0 && !erro && <Text style={styles.vazio}>Nenhum grupo cadastrado ainda.</Text>}
        <TouchableOpacity style={[styles.btnSecundario, { backgroundColor: '#E3EDFF', borderColor: '#E3EDFF' }]} onPress={() => setEtapa('tratativas')}>
          <Feather name="check-square" size={16} color={colors.navy700} />
          <Text style={styles.btnSecundarioTexto}>Tratativas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecundario} onPress={() => setEtapa('historico')}>
          <Feather name="clock" size={16} color={colors.navy700} />
          <Text style={styles.btnSecundarioTexto}>Histórico e lista de pedido</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecundario} onPress={() => setEtapa('descontinuados')}>
          <Feather name="slash" size={16} color={colors.navy700} />
          <Text style={styles.btnSecundarioTexto}>Produtos descontinuados</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// =================================================================== coleta ==

function TelaColeta({
  grupo,
  universo,
  coleta,
  offline,
  areas,
  areaDoGrupo,
  onDefinirAreaDoGrupo,
  grupos,
  onMover,
  onMudar,
  onFinalizar,
  onCancelar,
}: {
  grupo: GrupoRuptura;
  universo: ItemUniverso[];
  coleta: ColetaLocal;
  offline: boolean;
  areas: AreaMapa[];
  areaDoGrupo: string | null;
  onDefinirAreaDoGrupo: (areaId: string) => void;
  grupos: GrupoRuptura[];
  onMover: (item: ItemUniverso, destino: GrupoRuptura) => Promise<boolean>;
  onMudar: (c: ColetaLocal) => void;
  onFinalizar: () => void;
  onCancelar: () => void;
}) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [camera, setCamera] = useState(true);
  const [digitado, setDigitado] = useState('');
  const [flash, setFlash] = useState<{ texto: string; tipo: 'ok' | 'repetido' | 'fora' } | null>(null);
  const ultimo = useRef<{ ean: string; em: number }>({ ean: '', em: 0 });
  // A câmera às vezes lê um número errado num quadro só. Só aceitamos o código
  // quando ele aparece igual em leituras seguidas (2 para produto do grupo,
  // 3 para código desconhecido). Digitado/leitor externo entra direto.
  const candidato = useRef<{ ean: string; vezes: number; em: number }>({ ean: '', vezes: 0, em: 0 });
  const coletaRef = useRef(coleta);
  coletaRef.current = coleta;
  // Primeira coleta do grupo: abre o mapa para marcar onde ele fica.
  const [seletorArea, setSeletorArea] = useState(!coleta.areaId && !areaDoGrupo && areas.length > 0);
  const [mover, setMover] = useState<ItemUniverso | null>(null);
  const perguntouArea = useRef(seletorArea);
  useEffect(() => {
    // o mapa pode terminar de carregar depois que a coleta abriu
    if (!perguntouArea.current && !coleta.areaId && !areaDoGrupo && areas.length > 0) {
      perguntouArea.current = true;
      setSeletorArea(true);
    }
  }, [areas.length, areaDoGrupo, coleta.areaId]);
  const areaAtual = areas.find((a) => a.id === coleta.areaId) ?? null;

  function escolherArea(a: AreaMapa) {
    setSeletorArea(false);
    onMudar({ ...coletaRef.current, areaId: a.id });
    if (!areaDoGrupo) {
      onDefinirAreaDoGrupo(a.id);
    } else if (areaDoGrupo !== a.id) {
      Alert.alert('Local do grupo', `“${grupo.nome}” fica sempre em ${a.nome}?`, [
        { text: 'Só nesta coleta', style: 'cancel' },
        { text: 'Sim, mudar o local', onPress: () => onDefinirAreaDoGrupo(a.id) },
      ]);
    }
  }

  function tocarFalta(u: ItemUniverso) {
    Alert.alert(u.produto, 'Este produto fica em outro subsetor?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Mover para outro grupo', onPress: () => setMover(u) },
    ]);
  }

  const eans = useMemo(() => mapaEans(universo), [universo]);
  const ativos = useMemo(() => universo.filter((u) => !u.descontinuado), [universo]);
  const bipados = useMemo(() => new Set(coleta.lidos.map((l) => l.codigoInterno).filter(Boolean) as string[]), [coleta]);
  const faltam = ativos.filter((u) => !bipados.has(u.codigoInterno) && u.lojaTrabalha);
  const coletados = ativos.filter((u) => bipados.has(u.codigoInterno)).length;
  const esperados = ativos.filter((u) => u.lojaTrabalha).length;

  async function registrar(bruto: string, manual = false) {
    if (seletorArea || mover) return; // mapa ou lista de grupos aberta por cima da câmera
    const ean = normalizarEan(bruto);
    if (!ean) return;
    const agora = Date.now();
    if (!manual) {
      const c0 = candidato.current;
      if (c0.ean === ean && agora - c0.em < 1500) candidato.current = { ean, vezes: c0.vezes + 1, em: agora };
      else candidato.current = { ean, vezes: 1, em: agora };
      const precisa = eans.has(ean) ? 2 : 3;
      if (candidato.current.vezes < precisa) return;
    }
    if (ultimo.current.ean === ean && agora - ultimo.current.em < 2500) return; // mesma leitura repetida pela câmera
    ultimo.current = { ean, em: agora };
    const c = coletaRef.current;
    const it = eans.get(ean);
    if (it && c.lidos.some((l) => l.codigoInterno === it.codigoInterno)) {
      setFlash({ texto: `Já bipado: ${it.produto}`, tipo: 'repetido' });
      return;
    }
    if (!it && c.lidos.some((l) => l.ean === ean)) return;
    Vibration.vibrate(it ? 60 : [0, 80, 80, 80]);
    let produto = it?.produto ?? null;
    const novo: ColetaLocal = { ...c, lidos: [...c.lidos, { ean, codigoInterno: it?.codigoInterno ?? null, produto, em: new Date().toISOString(), areaId: c.areaId ?? null }] };
    onMudar(novo);
    setFlash(it ? { texto: it.produto, tipo: 'ok' } : { texto: `Código ${ean} não é deste grupo`, tipo: 'fora' });
    if (!it) {
      produto = await buscarProdutoPorEan(ean);
      if (produto) {
        const atual = coletaRef.current;
        onMudar({ ...atual, lidos: atual.lidos.map((l) => (l.ean === ean && !l.codigoInterno ? { ...l, produto } : l)) });
        setFlash({ texto: `Fora do grupo: ${produto}`, tipo: 'fora' });
      }
    }
  }

  function desfazerUltimo() {
    if (!coleta.lidos.length) return;
    const ult = coleta.lidos[coleta.lidos.length - 1];
    Alert.alert('Desfazer última leitura?', ult.produto ?? ult.ean, [
      { text: 'Não', style: 'cancel' },
      { text: 'Desfazer', onPress: () => onMudar({ ...coleta, lidos: coleta.lidos.slice(0, -1) }) },
    ]);
  }

  const pct = esperados ? Math.round((coletados / esperados) * 100) : 0;
  const corFlash = flash?.tipo === 'ok' ? '#178553' : flash?.tipo === 'repetido' ? '#9A7A00' : '#C0352B';

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo={grupo.nome} subtitulo={`${coletados} de ${esperados} bipados`} icone="maximize" onVoltar={onCancelar} rotuloVoltar="Cancelar" />
      {offline && (
        <View style={[styles.aviso, { marginHorizontal: spacing.lg, marginTop: spacing.sm }]}>
          <Feather name="wifi-off" size={16} color="#B4650E" />
          <Text style={styles.avisoTexto}>Sem internet — usando a lista guardada no celular.</Text>
        </View>
      )}

      <View style={styles.barraFundo}>
        <View style={[styles.barra, { width: `${pct}%` }]} />
      </View>
      {areas.length > 0 && (
        <TouchableOpacity style={styles.ondeEstou} onPress={() => setSeletorArea(true)}>
          <Feather name="map-pin" size={15} color={AZUL} />
          <Text style={styles.ondeEstouTexto} numberOfLines={1}>
            {areaAtual ? `Estou em: ${areaAtual.nome}` : 'Marcar no mapa onde estou'}
          </Text>
          <Text style={styles.link}>{areaAtual ? 'Trocar' : 'Abrir mapa'}</Text>
        </TouchableOpacity>
      )}

      {camera ? (
        <View style={styles.areaCamera}>
          {!permissao?.granted ? (
            <View style={styles.semCamera}>
              <Text style={styles.semCameraTexto}>Preciso da câmera para ler os códigos.</Text>
              <TouchableOpacity style={styles.btnPrincipal} onPress={pedirPermissao}>
                <Text style={styles.btnPrincipalTexto}>Permitir câmera</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              onBarcodeScanned={({ data }: { data: string }) => registrar(data)}
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
            />
          )}
          <View style={styles.mira} pointerEvents="none" />
          {flash && (
            <View style={[styles.flash, { backgroundColor: corFlash }]}>
              <Text style={styles.flashTexto} numberOfLines={2}>{flash.texto}</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.linhaDigitar}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={digitado}
            onChangeText={setDigitado}
            placeholder="Digite ou use o leitor"
            placeholderTextColor={colors.gray400}
            keyboardType="number-pad"
            autoFocus
            onSubmitEditing={() => { registrar(digitado, true); setDigitado(''); }}
            blurOnSubmit={false}
          />
          <TouchableOpacity style={styles.btnPequeno} onPress={() => { registrar(digitado, true); setDigitado(''); }}>
            <Feather name="plus" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.linhaAcoes}>
        <TouchableOpacity style={styles.acao} onPress={() => setCamera(!camera)}>
          <Feather name={camera ? 'type' : 'camera'} size={16} color={colors.navy700} />
          <Text style={styles.acaoTexto}>{camera ? 'Digitar' : 'Câmera'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.acao} onPress={desfazerUltimo} disabled={!coleta.lidos.length}>
          <Feather name="rotate-ccw" size={16} color={coleta.lidos.length ? colors.navy700 : colors.gray400} />
          <Text style={[styles.acaoTexto, !coleta.lidos.length && { color: colors.gray400 }]}>Desfazer</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.titLista}>Ainda não bipados ({faltam.length})</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 100 }}>
        {faltam.length > 0 && <Text style={styles.dicaFalta}>Toque num produto para mandar para outro grupo, se ele fica em outro subsetor.</Text>}
        {faltam.map((u) => (
          <TouchableOpacity key={u.codigoInterno} style={styles.linhaFalta} onPress={() => tocarFalta(u)}>
            <Text style={styles.linhaFaltaNome} numberOfLines={1}>{u.produto}</Text>
            <Text style={styles.linhaFaltaCod}>{u.codigoInterno}</Text>
            <Feather name="corner-up-right" size={15} color={colors.gray400} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        ))}
        {faltam.length === 0 && <Text style={styles.vazio}>Tudo bipado! 🎉</Text>}
      </ScrollView>

      <View style={styles.rodape}>
        <TouchableOpacity
          style={styles.btnPrincipal}
          onPress={() =>
            faltam.length
              ? Alert.alert('Finalizar coleta?', `${faltam.length} produtos não foram bipados e vão para a análise de ruptura.`, [
                  { text: 'Continuar bipando', style: 'cancel' },
                  { text: 'Finalizar', onPress: onFinalizar },
                ])
              : onFinalizar()
          }
        >
          <Feather name="check" size={18} color={colors.white} />
          <Text style={styles.btnPrincipalTexto}>Finalizar e ver ruptura</Text>
        </TouchableOpacity>
      </View>
      <SeletorAreaMapa
        visivel={seletorArea}
        titulo={areaDoGrupo ? 'Onde você está?' : `Onde fica ${grupo.nome}?`}
        subtitulo={areaDoGrupo ? 'Os produtos bipados agora ficam guardados nesta área' : 'Primeira coleta deste grupo: toque na área dele no mapa. Fica salvo para as próximas.'}
        areas={areas}
        inicial={coleta.areaId ?? areaDoGrupo}
        textoConfirmar="Estou aqui"
        onEscolher={escolherArea}
        onFechar={() => setSeletorArea(false)}
        textoPular="Agora não"
        onPular={() => setSeletorArea(false)}
      />
      <SeletorGrupo
        item={mover}
        grupos={grupos.filter((g) => g.id !== grupo.id)}
        setorAtual={grupo.setor}
        onFechar={() => setMover(null)}
        onEscolher={(g) => {
          const u = mover;
          if (!u) return;
          Alert.alert('Mover produto?', `${u.produto}\n\nSai de “${grupo.nome}” e passa a ser coletado em “${g.nome}”.`, [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Mover',
              onPress: async () => {
                setMover(null);
                if (await onMover(u, g)) setFlash({ texto: `Movido para ${g.nome}`, tipo: 'ok' });
              },
            },
          ]);
        }}
      />
    </View>
  );
}

// Lista de grupos para mandar um produto que está no subsetor errado.
function SeletorGrupo({
  item,
  grupos,
  setorAtual,
  onFechar,
  onEscolher,
}: {
  item: ItemUniverso | null;
  grupos: GrupoRuptura[];
  setorAtual: string;
  onFechar: () => void;
  onEscolher: (g: GrupoRuptura) => void;
}) {
  const [busca, setBusca] = useState('');
  useEffect(() => { if (item) setBusca(''); }, [item]);
  const termo = busca.trim().toLowerCase();
  const filtrados = grupos.filter((g) => !termo || g.nome.toLowerCase().includes(termo) || g.setor.toLowerCase().includes(termo));
  // setor atual primeiro (o mais comum é trocar de subsetor dentro dele)
  const setores = [...new Set(filtrados.map((g) => g.setor))].sort((a, b) => (a === setorAtual ? -1 : b === setorAtual ? 1 : a.localeCompare(b)));
  return (
    <Modal visible={!!item} animationType="slide" onRequestClose={onFechar}>
      <View style={[styles.tela, { paddingTop: 44 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          <TouchableOpacity onPress={onFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={24} color={colors.navy900} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: colors.navy900 }}>Mover para qual grupo?</Text>
            <Text style={styles.subGrupo} numberOfLines={2}>{item?.produto}</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <TextInput style={styles.input} value={busca} onChangeText={setBusca} placeholder="Buscar grupo" placeholderTextColor={colors.gray400} autoCorrect={false} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {setores.map((st) => (
            <View key={st} style={{ marginBottom: spacing.md }}>
              <Text style={[styles.titLista, { paddingHorizontal: 0, marginTop: 0 }]}>{nomeSetor(st)}</Text>
              {filtrados.filter((g) => g.setor === st).map((g) => (
                <TouchableOpacity key={g.id} style={styles.cardGrupo} onPress={() => onEscolher(g)}>
                  <Text style={[styles.nomeGrupo, { flex: 1 }]}>{g.nome}</Text>
                  <Feather name="chevron-right" size={18} color={colors.gray400} />
                </TouchableOpacity>
              ))}
            </View>
          ))}
          {!setores.length && <Text style={styles.vazio}>Nenhum grupo com esse nome.</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ================================================================ resultado ==

function TelaResultado({
  grupo,
  universo,
  setUniverso,
  coleta,
  dataVendas,
  quem,
  onVoltarColeta,
  onConcluir,
  onVerTratativas,
}: {
  grupo: GrupoRuptura;
  universo: ItemUniverso[];
  setUniverso: (u: ItemUniverso[]) => void;
  coleta: ColetaLocal;
  dataVendas: string | null;
  quem: string;
  onVoltarColeta: () => void;
  onConcluir: () => void;
  onVerTratativas: () => void;
}) {
  const { resultado, voltaram, esperados, coletados } = useMemo(
    () => calcularResultado(coleta, universo, grupo.diasSemVenda ?? 10, dataVendas),
    [coleta, universo, grupo, dataVendas],
  );
  const [aberta, setAberta] = useState<Situacao | null>(null);
  const [descontinuar, setDescontinuar] = useState<ResultadoItem | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);

  const grupos = ORDEM_SITUACOES.map((s) => ({ s, itens: resultado.filter((r) => r.situacao === s) })).filter((g) => g.itens.length);
  const ruptura = contaRuptura(resultado);
  const pct = esperados ? Math.round((ruptura / esperados) * 100) : 0;

  async function salvar(): Promise<boolean> {
    if (enviada) return true;
    setEnviando(true);
    try {
      await enviarColeta(coleta, resultado, esperados, coletados, quem);
      setEnviada(true);
      return true;
    } catch (e: any) {
      Alert.alert('Não consegui salvar', 'A coleta continua guardada no celular. Tente de novo com internet.\n\n' + (e?.message ?? ''));
      return false;
    } finally {
      setEnviando(false);
    }
  }

  async function exportar() {
    Alert.alert('Gerar planilha', 'Qual planilha?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Completa',
        onPress: async () => {
          try { await compartilharResultado(coleta, resultado, true); } catch (e: any) { Alert.alert('Erro ao gerar planilha', e?.message ?? ''); }
        },
      },
      {
        text: 'Para pedido',
        onPress: async () => {
          try {
            const itens: ItemSalvo[] = resultado.map((r) => ({ coletaId: coleta.id, codigoInterno: r.codigoInterno, codigoBarras: r.codigoBarras, produto: r.produto, situacao: r.situacao, saldo: r.saldo, ultimaVenda: r.ultimaVenda, estoqueCd: r.estoqueCd }));
            const n = await compartilharPedido([{ id: coleta.id, grupoNome: coleta.grupoNome }], itens);
            if (!n.pedido && !n.cdSem && !n.foraCd) Alert.alert('Nada para pedir', 'Nenhum item em ruptura ou “nunca veio” nesta coleta.');
          } catch (e: any) { Alert.alert('Erro ao gerar planilha', e?.message ?? ''); }
        },
      },
    ]);
  }

  async function confirmarDescontinuado(item: ResultadoItem, motivo: string) {
    if (!item.codigoInterno) return;
    try {
      await marcarDescontinuado(item.codigoInterno, item.produto, motivo, quem);
      setUniverso(universo.map((u) => (u.codigoInterno === item.codigoInterno ? { ...u, descontinuado: true, motivoDescontinuado: motivo } : u)));
      setDescontinuar(null);
    } catch (e: any) {
      Alert.alert('Não consegui marcar', e?.message ?? '');
    }
  }

  async function reativarItem(u: ItemUniverso) {
    try {
      await reativar(u.codigoInterno);
      setUniverso(universo.map((x) => (x.codigoInterno === u.codigoInterno ? { ...x, descontinuado: false, motivoDescontinuado: null } : x)));
    } catch (e: any) {
      Alert.alert('Não consegui reativar', e?.message ?? '');
    }
  }

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo={grupo.nome} subtitulo={`Resultado · ${coletados} de ${esperados} na gôndola`} icone="alert-octagon" onVoltar={onVoltarColeta} rotuloVoltar="Voltar à coleta" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <View style={styles.resumo}>
          <View style={styles.resumoBloco}>
            <Text style={[styles.resumoNum, { color: pct >= 10 ? '#C0352B' : pct >= 5 ? '#9A7A00' : '#178553' }]}>{pct}%</Text>
            <Text style={styles.resumoRot}>ruptura</Text>
          </View>
          <View style={styles.resumoBloco}>
            <Text style={styles.resumoNum}>{ruptura}</Text>
            <Text style={styles.resumoRot}>itens em falta</Text>
          </View>
          <View style={styles.resumoBloco}>
            <Text style={styles.resumoNum}>{coletados}</Text>
            <Text style={styles.resumoRot}>bipados</Text>
          </View>
        </View>
        {dataVendas && <Text style={styles.nota}>Vendas consideradas até {dataBR(dataVendas)} · sem venda = mais de {grupo.diasSemVenda} dias</Text>}

        {voltaram.length > 0 && (
          <View style={[styles.cardSit, { borderColor: AZUL }]}>
            <Text style={styles.cardSitTitulo}>↩️ Descontinuados que voltaram ({voltaram.length})</Text>
            <Text style={styles.cardSitDica}>Foram bipados ou voltaram a vender. Reativar?</Text>
            {voltaram.map((u) => (
              <View key={u.codigoInterno} style={styles.linhaItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNome}>{u.produto}</Text>
                  <Text style={styles.itemDet}>{u.codigoInterno} · {u.motivoDescontinuado}</Text>
                </View>
                <TouchableOpacity style={styles.btnMini} onPress={() => reativarItem(u)}>
                  <Text style={styles.btnMiniTexto}>Reativar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {grupos.map(({ s, itens }) => {
          const info = SITUACOES[s];
          const expandida = aberta === s || (aberta == null && s !== 'ok');
          return (
            <View key={s} style={[styles.cardSit, { backgroundColor: info.fundo, borderColor: info.fundo }]}>
              <TouchableOpacity onPress={() => setAberta(expandida ? (s === 'ok' ? null : 'ok') : s)} style={styles.cardSitTopo}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardSitTitulo, { color: info.cor }]}>{info.emoji} {info.titulo} ({itens.length})</Text>
                  <Text style={styles.cardSitDica}>{info.dica}</Text>
                </View>
                <Feather name={expandida ? 'chevron-up' : 'chevron-down'} size={18} color={info.cor} />
              </TouchableOpacity>
              {expandida &&
                itens.map((r, i) => (
                  <View key={(r.codigoInterno ?? r.codigoBarras ?? '') + i} style={styles.linhaItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemNome}>{r.produto}</Text>
                      <Text style={styles.itemDet}>
                        {r.codigoInterno ?? r.codigoBarras}
                        {r.saldo != null ? ` · saldo ${r.saldo}` : ''}
                        {s !== 'nao_cadastrado' ? ` · últ. venda ${dataBR(r.ultimaVenda)}` : ''}
                        {r.estoqueCd != null ? ` · CD ${r.estoqueCd}` : ''}
                      </Text>
                      {r.provavelDescontinuado && <Text style={styles.selo}>⚠️ Provável descontinuado</Text>}
                    </View>
                    {r.codigoInterno && s !== 'ok' && s !== 'parado' && (
                      <TouchableOpacity style={styles.btnMiniCinza} onPress={() => setDescontinuar(r)}>
                        <Feather name="slash" size={14} color={colors.gray600} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              {s === 'suspeito' && expandida && (
                <Text style={styles.notaSit}>Para corrigir o saldo, use “Ajustar estoque” no Giro de Produtos com o motivo “Contagem física”.</Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.rodape}>
        <TouchableOpacity style={[styles.btnSecundario, { flex: 1, marginTop: 0 }]} onPress={exportar}>
          <Feather name="share-2" size={16} color={colors.navy700} />
          <Text style={styles.btnSecundarioTexto}>Planilha</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnPrincipal, { flex: 2, marginLeft: spacing.sm }]}
          disabled={enviando}
          onPress={async () => {
            if (!(await salvar())) return;
            try {
              const r = await abrirTratativasDaColeta(
                { id: coleta.id, grupoId: coleta.grupoId, grupoNome: coleta.grupoNome, setor: coleta.setor },
                resultado,
                quem,
              );
              Alert.alert(
                'Coleta salva',
                `${r.abertas} ${r.abertas === 1 ? 'tratativa aberta' : 'tratativas abertas'}` +
                  (r.fechadas ? ` · ${r.fechadas} ${r.fechadas === 1 ? 'resolvida' : 'resolvidas'} (estavam na gôndola)` : '') + '.',
                [
                  { text: 'Voltar aos grupos', onPress: onConcluir },
                  { text: 'Ver tratativas', onPress: onVerTratativas },
                ],
              );
            } catch (e: any) {
              Alert.alert('Coleta salva', 'Mas não consegui abrir as tratativas: ' + (e?.message ?? ''));
              onConcluir();
            }
          }}
        >
          {enviando ? <ActivityIndicator color={colors.white} /> : <Feather name="check" size={18} color={colors.white} />}
          <Text style={styles.btnPrincipalTexto}>Salvar e concluir</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={!!descontinuar} transparent animationType="fade" onRequestClose={() => setDescontinuar(null)}>
        <View style={styles.modalFundo}>
          <View style={styles.modal}>
            <Text style={styles.modalTitulo}>Marcar como descontinuado</Text>
            <Text style={styles.modalTexto}>{descontinuar?.produto}</Text>
            <Text style={styles.modalTexto}>Ele deixa de aparecer na ruptura. Dá para reativar depois.</Text>
            {MOTIVOS_DESCONTINUADO.map((m) => (
              <TouchableOpacity key={m} style={styles.opcao} onPress={() => descontinuar && confirmarDescontinuado(descontinuar, m)}>
                <Text style={styles.opcaoTexto}>{m}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setDescontinuar(null)} style={{ marginTop: spacing.md, alignSelf: 'center' }}>
              <Text style={styles.link}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ================================================================ histórico ==

function TelaHistorico({ onVoltar, quem }: { onVoltar: () => void; quem: string }) {
  const [lista, setLista] = useState<ColetaSalva[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState(false);
  const [aberta, setAberta] = useState<{ coleta: ColetaSalva; itens: ResultadoItem[] } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await buscarHistorico());
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? '');
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const alternar = (id: string) => {
    const n = new Set(marcadas);
    n.has(id) ? n.delete(id) : n.add(id);
    setMarcadas(n);
  };
  const marcarHoje = () => {
    const hoje = new Date().toDateString();
    setMarcadas(new Set(lista.filter((c) => new Date(c.finalizadaEm).toDateString() === hoje).map((c) => c.id)));
  };

  async function gerarPedido(ids: string[]) {
    setGerando(true);
    try {
      const coletas = lista.filter((c) => ids.includes(c.id));
      const itens = await buscarItensColetas(ids);
      const n = await compartilharPedido(coletas.map((c) => ({ id: c.id, grupoNome: c.grupoNome })), itens);
      if (!n.pedido && !n.cdSem && !n.foraCd) Alert.alert('Nada para pedir', 'Nenhum item em ruptura ou “nunca veio” nessas coletas.');
    } catch (e: any) {
      Alert.alert('Erro ao gerar planilha', e?.message ?? '');
    } finally {
      setGerando(false);
    }
  }

  async function abrir(c: ColetaSalva) {
    try {
      const itens = await buscarItensColetas([c.id]);
      setAberta({ coleta: c, itens: itensSalvosComoResultado(itens) });
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? '');
    }
  }

  if (aberta) {
    const { coleta, itens } = aberta;
    const grupos = ORDEM_SITUACOES.map((s) => ({ s, itens: itens.filter((r) => r.situacao === s) })).filter((g) => g.itens.length && g.s !== 'ok');
    return (
      <View style={styles.tela}>
        <CabecalhoTela titulo={coleta.grupoNome} subtitulo={`${dataHoraBR(coleta.finalizadaEm)} · ${coleta.feitaPor ?? ''}`} icone="clock" onVoltar={() => setAberta(null)} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
          <View style={styles.resumo}>
            <View style={styles.resumoBloco}><Text style={styles.resumoNum}>{coleta.totalRuptura}</Text><Text style={styles.resumoRot}>em falta</Text></View>
            <View style={styles.resumoBloco}><Text style={styles.resumoNum}>{coleta.totalColetados}</Text><Text style={styles.resumoRot}>bipados</Text></View>
            <View style={styles.resumoBloco}><Text style={styles.resumoNum}>{coleta.totalItens}</Text><Text style={styles.resumoRot}>no grupo</Text></View>
          </View>

          {grupos.map(({ s, itens: its }) => {
            const info = SITUACOES[s];
            return (
              <View key={s} style={[styles.cardSit, { backgroundColor: info.fundo, borderColor: info.fundo, marginTop: spacing.md }]}>
                <Text style={[styles.cardSitTitulo, { color: info.cor }]}>{info.emoji} {info.titulo} ({its.length})</Text>
                {its.map((r, i) => (
                  <View key={(r.codigoInterno ?? r.codigoBarras ?? '') + i} style={styles.linhaItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemNome}>{r.produto}</Text>
                      <Text style={styles.itemDet}>{r.codigoInterno ?? r.codigoBarras}{r.saldo != null ? ` · saldo ${r.saldo}` : ''}{r.estoqueCd != null ? ` · CD ${r.estoqueCd}` : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
        </ScrollView>
        <View style={styles.rodape}>
          <TouchableOpacity style={[styles.btnSecundario, { flex: 1, marginTop: 0 }]} onPress={() => compartilharResultado(coleta, itens, true).catch((e) => Alert.alert('Erro', e?.message ?? ''))}>
            <Feather name="share-2" size={16} color={colors.navy700} />
            <Text style={styles.btnSecundarioTexto}>Completa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnPrincipal, { flex: 1, marginLeft: spacing.sm }]} disabled={gerando} onPress={() => gerarPedido([coleta.id])}>
            {gerando ? <ActivityIndicator color={colors.white} /> : <Feather name="shopping-cart" size={16} color={colors.white} />}
            <Text style={styles.btnPrincipalTexto}>Para pedido</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo="Histórico" subtitulo="Marque as coletas para gerar uma lista de pedido única" icone="clock" onVoltar={onVoltar} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}>
        {lista.length > 0 && (
          <TouchableOpacity onPress={marcarHoje} style={{ alignSelf: 'flex-end', marginBottom: spacing.sm }}>
            <Text style={styles.link}>Marcar as de hoje</Text>
          </TouchableOpacity>
        )}
        {lista.map((c) => {
          const m = marcadas.has(c.id);
          const pedir = (c.resumo.ruptura ?? 0) + (c.resumo.nunca_veio ?? 0);
          return (
            <View key={c.id} style={[styles.cardGrupo, m && { borderColor: AZUL }]}>
              <TouchableOpacity onPress={() => alternar(c.id)} style={{ padding: 4 }}>
                <Feather name={m ? 'check-square' : 'square'} size={22} color={m ? AZUL : colors.gray400} />
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => abrir(c)}>
                <Text style={styles.nomeGrupo}>{c.grupoNome}</Text>
                <Text style={styles.subGrupo}>{dataHoraBR(c.finalizadaEm)} · {c.totalRuptura} em falta · {pedir} para pedir</Text>
              </TouchableOpacity>
              <Feather name="chevron-right" size={20} color={colors.gray400} />
            </View>
          );
        })}
        {!carregando && lista.length === 0 && <Text style={styles.vazio}>Nenhuma coleta salva ainda.</Text>}
      </ScrollView>
      {marcadas.size > 0 && (
        <View style={styles.rodape}>
          <TouchableOpacity style={[styles.btnPrincipal, { flex: 1 }]} disabled={gerando} onPress={() => gerarPedido([...marcadas])}>
            {gerando ? <ActivityIndicator color={colors.white} /> : <Feather name="shopping-cart" size={18} color={colors.white} />}
            <Text style={styles.btnPrincipalTexto}>Lista de pedido ({marcadas.size} {marcadas.size === 1 ? 'coleta' : 'coletas'})</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// =========================================================== descontinuados ==

function TelaDescontinuados({ onVoltar }: { onVoltar: () => void }) {
  const [lista, setLista] = useState<Descontinuado[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await buscarDescontinuados());
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? '');
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo="Descontinuados" subtitulo="Não aparecem na ruptura" icone="slash" onVoltar={onVoltar} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}>
        {lista.map((d) => (
          <View key={d.codigoInterno} style={styles.cardGrupo}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nomeGrupo}>{d.produto ?? d.codigoInterno}</Text>
              <Text style={styles.subGrupo}>{d.codigoInterno} · {d.motivo} · {d.marcadoPor ?? ''} em {dataBR(d.marcadoEm)}</Text>
            </View>
            <TouchableOpacity
              style={styles.btnMini}
              onPress={() =>
                Alert.alert('Reativar?', d.produto ?? d.codigoInterno, [
                  { text: 'Não', style: 'cancel' },
                  { text: 'Reativar', onPress: async () => { await reativar(d.codigoInterno); carregar(); } },
                ])
              }
            >
              <Text style={styles.btnMiniTexto}>Reativar</Text>
            </TouchableOpacity>
          </View>
        ))}
        {!carregando && lista.length === 0 && <Text style={styles.vazio}>Nenhum produto marcado como descontinuado.</Text>}
      </ScrollView>
    </View>
  );
}

// =================================================================== estilos ==

const styles = StyleSheet.create({
  ondeEstou: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E3EDFF', marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  ondeEstouTexto: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.navy900 },
  dicaFalta: { fontSize: 11.5, color: colors.gray600, marginBottom: 6 },
  tela: { flex: 1, backgroundColor: colors.gray50 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF6E5', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  avisoTexto: { color: colors.gray900, fontSize: 13, flex: 1 },
  titSetor: { fontSize: 13, fontWeight: '700', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  cardGrupo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.gray100 },
  nomeGrupo: { fontSize: 15, fontWeight: '700', color: colors.navy900 },
  subGrupo: { fontSize: 12, color: colors.gray600, marginTop: 2 },
  pill: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  pillTexto: { fontSize: 13, fontWeight: '700' },
  vazio: { textAlign: 'center', color: colors.gray600, marginTop: spacing.xl },
  btnSecundario: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 14, marginTop: spacing.md },
  btnSecundarioTexto: { color: colors.navy700, fontWeight: '700', fontSize: 14 },
  btnPrincipal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: AZUL, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.lg },
  btnPrincipalTexto: { color: colors.white, fontWeight: '700', fontSize: 15 },
  barraFundo: { height: 6, backgroundColor: colors.gray100, marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: 3, overflow: 'hidden' },
  barra: { height: 6, backgroundColor: '#2FA36B' },
  areaCamera: { height: 220, margin: spacing.lg, marginBottom: spacing.sm, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  semCamera: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  semCameraTexto: { color: colors.white, textAlign: 'center' },
  mira: { position: 'absolute', left: '12%', right: '12%', top: '38%', height: 2, backgroundColor: '#FF4D4D' },
  flash: { position: 'absolute', left: 8, right: 8, bottom: 8, borderRadius: radius.sm, padding: 8 },
  flashTexto: { color: colors.white, fontWeight: '700', fontSize: 13 },
  linhaDigitar: { flexDirection: 'row', gap: spacing.sm, margin: spacing.lg, marginBottom: spacing.sm },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16, color: colors.gray900 },
  btnPequeno: { backgroundColor: AZUL, borderRadius: radius.md, width: 48, alignItems: 'center', justifyContent: 'center' },
  linhaAcoes: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  acao: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.white, borderRadius: radius.full, borderWidth: 1, borderColor: colors.gray100, paddingHorizontal: 14, paddingVertical: 8 },
  acaoTexto: { color: colors.navy700, fontWeight: '600', fontSize: 13 },
  titLista: { fontSize: 13, fontWeight: '700', color: colors.gray600, paddingHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm },
  linhaFalta: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, marginBottom: 6 },
  linhaFaltaNome: { flex: 1, fontSize: 13, color: colors.gray900 },
  linhaFaltaCod: { fontSize: 12, color: colors.gray400, marginLeft: spacing.sm },
  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: spacing.lg, backgroundColor: colors.gray50, borderTopWidth: 1, borderTopColor: colors.gray100 },
  resumo: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.gray100 },
  resumoBloco: { flex: 1, alignItems: 'center' },
  resumoNum: { fontSize: 26, fontWeight: '800', color: colors.navy900 },
  resumoRot: { fontSize: 12, color: colors.gray600 },
  nota: { fontSize: 12, color: colors.gray600, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.md },
  cardSit: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, backgroundColor: colors.white },
  cardSitTopo: { flexDirection: 'row', alignItems: 'center' },
  cardSitTitulo: { fontSize: 15, fontWeight: '800', color: colors.navy900 },
  cardSitDica: { fontSize: 12, color: colors.gray600, marginTop: 2 },
  notaSit: { fontSize: 12, color: '#7A3FC4', marginTop: spacing.sm },
  linhaItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.sm, padding: spacing.sm, marginTop: 6 },
  itemNome: { fontSize: 13, fontWeight: '600', color: colors.gray900 },
  itemDet: { fontSize: 11, color: colors.gray600, marginTop: 2 },
  selo: { fontSize: 11, color: '#B4650E', fontWeight: '700', marginTop: 2 },
  btnMini: { backgroundColor: AZUL, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, marginLeft: spacing.sm },
  btnMiniTexto: { color: colors.white, fontWeight: '700', fontSize: 12 },
  btnMiniCinza: { borderRadius: radius.sm, padding: 8, marginLeft: spacing.sm, backgroundColor: colors.gray50 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.xl },
  modal: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  modalTitulo: { fontSize: 17, fontWeight: '800', color: colors.navy900, marginBottom: spacing.sm },
  modalTexto: { fontSize: 13, color: colors.gray600, marginBottom: spacing.sm },
  opcao: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  opcaoTexto: { fontSize: 14, color: colors.navy900, fontWeight: '600' },
  link: { color: AZUL, fontWeight: '700' },
  painel: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: '#F3C9C4', padding: spacing.md, marginBottom: spacing.lg },
  painelTitulo: { fontSize: 16, fontWeight: '800', color: colors.navy900 },
  painelSub: { fontSize: 11.5, color: colors.gray600, marginBottom: spacing.sm },
  painelLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.gray100 },
  painelPos: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FDECEA', color: '#C0352B', fontWeight: '800', textAlign: 'center', lineHeight: 24, fontSize: 12 },
  suspeitos: { fontSize: 11.5, color: '#C0352B', fontWeight: '700', marginTop: 2 },
  gaveta: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray100, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  gavetaAberta: { borderColor: AZUL, paddingBottom: spacing.sm },
  gavetaTopo: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  gavetaTitulo: { fontSize: 16, fontWeight: '800', color: colors.navy900 },
  btnTarefa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F1E9FB', borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.md },
  btnTarefaTexto: { color: '#7A3FC4', fontWeight: '700', fontSize: 14 },
});
