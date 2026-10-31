import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Image,
  RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import { SetorKey } from '../data/employees';
import { enviarFotoTarefa } from '../data/tarefasApi';
import { MOTIVOS_DESCONTINUADO, SITUACOES, Situacao } from '../data/rupturaApi';
import {
  AcaoTratativa,
  PEDIDO_ENCARREGADO,
  ROTULO_ACAO,
  StatusTratativa,
  Tratativa,
  ajustarEstoqueEFechar,
  buscarTratativas,
  descontinuar,
  enviarAoEncarregado,
  marcarAcaoGerencia,
  resolverManual,
  responderEncarregado,
  validar,
  verificarAutomatico,
} from '../data/rupturaTratativasApi';

// Tratativas da Ruptura — ver src/data/rupturaTratativasApi.ts.
// modo "gerencia": abertas, validar, com encarregado e resolvidas.
// modo "encarregado": só o que foi mandado para o setor dele, com os botões.

const AZUL = '#2F7BFF';
const dataBR = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const diasAberta = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
const nomeSetor = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');

const SETORES_ENVIO: { key: SetorKey; nome: string }[] = [
  { key: 'mercearia', nome: 'Mercearia' },
  { key: 'deposito', nome: 'Depósito' },
  { key: 'prevencao', nome: 'Prevenção' },
];

const ORDEM: Situacao[] = ['ruptura', 'nunca_veio', 'cd_sem', 'repor', 'suspeito', 'parado'];
const VAI_PARA_ENCARREGADO: Situacao[] = ['repor', 'suspeito'];

type Aba = 'abertas' | 'validar' | 'encarregado' | 'resolvidas';

async function tirarFoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Sem permissão', 'Precisa liberar o acesso à câmera nas configurações do celular.');
    return null;
  }
  const r = await ImagePicker.launchCameraAsync({ quality: 0.5 });
  if (r.canceled || !r.assets?.[0]) return null;
  return enviarFotoTarefa(r.assets[0].uri);
}

export default function RupturaTratativasScreen({ modo, onVoltar }: { modo: 'gerencia' | 'encarregado'; onVoltar: () => void }) {
  return modo === 'gerencia' ? <TelaGerencia onVoltar={onVoltar} /> : <TelaEncarregado onVoltar={onVoltar} />;
}

// ================================================================ gerência ==

function TelaGerencia({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const quem = usuarioAtual?.nome ?? '';
  const [aba, setAba] = useState<Aba>('abertas');
  const [lista, setLista] = useState<Tratativa[]>([]);
  const [resolvidas, setResolvidas] = useState<Tratativa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [envio, setEnvio] = useState<{ itens: Tratativa[]; pedido: AcaoTratativa | null } | null>(null);
  const [descont, setDescont] = useState<Tratativa | null>(null);
  const [ajuste, setAjuste] = useState<Tratativa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtroSetor, setFiltroSetor] = useState<string | null>(null);

  const carregar = useCallback(async (auto = false) => {
    setCarregando(true);
    try {
      if (auto) {
        const r = await verificarAutomatico();
        if (r.chegaram || r.cdVoltou)
          setAviso(
            [r.chegaram ? `${r.chegaram} ${r.chegaram === 1 ? 'produto chegou' : 'produtos chegaram'} e ${r.chegaram === 1 ? 'foi fechado' : 'foram fechados'} sozinhos` : '',
              r.cdVoltou ? `${r.cdVoltou} ${r.cdVoltou === 1 ? 'voltou' : 'voltaram'} a ter estoque no CD (pode pedir)` : '']
              .filter(Boolean).join(' · '),
          );
      }
      const [abertos, fechados] = await Promise.all([
        buscarTratativas({ status: ['aberta', 'encarregado', 'validacao'] }),
        buscarTratativas({ status: ['resolvida'], resolvidasDias: 7 }),
      ]);
      setLista(abertos);
      setResolvidas(fechados.reverse());
      setMarcadas(new Set());
    } catch (e: any) {
      Alert.alert('Erro ao carregar', e?.message ?? '');
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { carregar(true); }, [carregar]);

  async function executar(fn: () => Promise<void>) {
    setOcupado(true);
    try {
      await fn();
      await carregar(false);
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    } finally {
      setOcupado(false);
    }
  }

  const doSetor = (t: Tratativa) => !filtroSetor || t.setor === filtroSetor;
  const abertas = lista.filter((t) => t.status === 'aberta' && doSetor(t));
  const paraValidar = lista.filter((t) => t.status === 'validacao' && doSetor(t));
  const comEncarregado = lista.filter((t) => t.status === 'encarregado' && doSetor(t));
  const setores = useMemo(() => [...new Set(lista.map((t) => t.setor).filter(Boolean))] as string[], [lista]);
  const maisAntiga = abertas.reduce((m, t) => Math.max(m, diasAberta(t.abertaEm)), 0);

  const alternar = (id: string) => {
    const n = new Set(marcadas);
    n.has(id) ? n.delete(id) : n.add(id);
    setMarcadas(n);
  };

  function cartao(t: Tratativa, filhos: React.ReactNode, selecionavel = false) {
    const info = SITUACOES[t.situacao];
    const m = marcadas.has(t.id);
    return (
      <View key={t.id} style={[styles.item, m && { borderColor: AZUL }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {selecionavel && (
            <TouchableOpacity onPress={() => alternar(t.id)} style={{ paddingRight: 8, paddingTop: 2 }}>
              <Feather name={m ? 'check-square' : 'square'} size={20} color={m ? AZUL : colors.gray400} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.itemNome}>{t.produto}</Text>
            <Text style={styles.itemDet}>
              {t.codigoInterno} · {t.grupoNome} · {info.emoji} {info.titulo} · {diasAberta(t.abertaEm)}d
              {t.saldo != null ? ` · saldo ${t.saldo}` : ''}{t.estoqueCd != null ? ` · CD ${t.estoqueCd}` : ''}
            </Text>
            {t.acao && t.status === 'aberta' && <Text style={styles.tag}>{ROTULO_ACAO[t.acao]} · {dataBR(t.atualizadaEm)}</Text>}
          </View>
        </View>
        {filhos}
      </View>
    );
  }

  const botao = (rotulo: string, onPress: () => void, tipo: 'pri' | 'sec' | 'perigo' = 'sec') => (
    <TouchableOpacity
      key={rotulo}
      style={[styles.btn, tipo === 'pri' && styles.btnPri, tipo === 'perigo' && styles.btnPerigo]}
      onPress={onPress}
      disabled={ocupado}
    >
      <Text style={[styles.btnTexto, tipo === 'pri' && { color: colors.white }, tipo === 'perigo' && { color: '#C0352B' }]}>{rotulo}</Text>
    </TouchableOpacity>
  );

  function acoesAberta(t: Tratativa) {
    const b: React.ReactNode[] = [];
    if (t.situacao === 'ruptura' || t.situacao === 'nunca_veio') {
      if (t.acao !== 'pedido_feito') b.push(botao('Pedido feito', () => executar(() => marcarAcaoGerencia(t, 'pedido_feito', quem)), 'pri'));
      b.push(botao('Descontinuado', () => setDescont(t), 'perigo'));
    } else if (t.situacao === 'cd_sem') {
      if (t.acao !== 'cobrado') b.push(botao('Cobrei o comprador', () => executar(() => marcarAcaoGerencia(t, 'cobrado', quem)), 'pri'));
      b.push(botao('Descontinuado', () => setDescont(t), 'perigo'));
    } else if (VAI_PARA_ENCARREGADO.includes(t.situacao)) {
      b.push(botao('Enviar ao encarregado', () => setEnvio({ itens: [t], pedido: null }), 'pri'));
      b.push(botao('Resolvido', () => executar(() => resolverManual(t, quem))));
    } else if (t.situacao === 'parado') {
      b.push(botao('Sem preço', () => setEnvio({ itens: [t], pedido: 'sem_preco' })));
      b.push(botao('Mal exposto', () => setEnvio({ itens: [t], pedido: 'mal_exposto' })));
      b.push(botao('Validade', () => setEnvio({ itens: [t], pedido: 'validade' })));
      b.push(botao('Só não vende', () => executar(() => resolverManual(t, quem, 'Exposto corretamente, só não vende'))));
    }
    return <View style={styles.linhaBotoes}>{b}</View>;
  }

  function acoesValidar(t: Tratativa) {
    return (
      <>
        <View style={styles.resposta}>
          <Text style={styles.respostaTexto}>
            {t.acao ? ROTULO_ACAO[t.acao] : ''} · {t.respondidaPor ?? ''} · {dataBR(t.atualizadaEm)}
          </Text>
          {t.obs ? <Text style={styles.itemDet}>“{t.obs}”</Text> : null}
          {t.fotoUrl ? <Image source={{ uri: t.fotoUrl }} style={styles.foto} /> : null}
        </View>
        <View style={styles.linhaBotoes}>
          {t.acao === 'nao_achei'
            ? [
                botao('Ajustar estoque', () => setAjuste(t), 'pri'),
                botao('Fechar sem ajuste', () => executar(() => validar(t, 'aprovado', quem, 'Sem ajuste'))),
                botao('Devolver', () => devolver(t), 'perigo'),
              ]
            : [botao('Aprovar', () => executar(() => validar(t, 'aprovado', quem)), 'pri'), botao('Devolver', () => devolver(t), 'perigo')]}
        </View>
      </>
    );
  }

  function devolver(t: Tratativa) {
    Alert.alert('Devolver ao encarregado?', t.produto, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Devolver', onPress: () => executar(() => validar(t, 'devolvido', quem, 'Refazer: conferir de novo')) },
    ]);
  }

  const selecionadas = abertas.filter((t) => marcadas.has(t.id));

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo="Tratativas" subtitulo="Produtos da ruptura até resolver" icone="check-square" onVoltar={onVoltar} />
      <View style={styles.abas}>
        {([
          ['abertas', `Abertas (${abertas.length})`],
          ['validar', `Validar (${paraValidar.length})`],
          ['encarregado', `Com encarregado (${comEncarregado.length})`],
          ['resolvidas', 'Resolvidas'],
        ] as [Aba, string][]).map(([k, r]) => (
          <TouchableOpacity key={k} style={[styles.aba, aba === k && styles.abaAtiva]} onPress={() => setAba(k)}>
            <Text style={[styles.abaTexto, aba === k && { color: colors.white }]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} refreshControl={<RefreshControl refreshing={carregando} onRefresh={() => carregar(true)} />}>
        {aviso && (
          <View style={styles.avisoAzul}>
            <Feather name="zap" size={16} color={AZUL} />
            <Text style={styles.avisoTexto}>{aviso}</Text>
          </View>
        )}
        {setores.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
            {[null, ...setores].map((s) => (
              <TouchableOpacity key={s ?? 'todos'} style={[styles.chip, filtroSetor === s && styles.chipAtivo]} onPress={() => setFiltroSetor(s)}>
                <Text style={[styles.chipTexto, filtroSetor === s && { color: colors.white }]}>{s ? nomeSetor(s) : 'Todos'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {aba === 'abertas' && (
          <>
            {abertas.length > 0 && <Text style={styles.nota}>Mais antiga: {maisAntiga} {maisAntiga === 1 ? 'dia' : 'dias'} aberta</Text>}
            {ORDEM.map((s) => {
              const its = abertas.filter((t) => t.situacao === s);
              if (!its.length) return null;
              const info = SITUACOES[s];
              const sel = VAI_PARA_ENCARREGADO.includes(s);
              return (
                <View key={s} style={{ marginBottom: spacing.lg }}>
                  <View style={styles.secTopo}>
                    <Text style={[styles.secTitulo, { color: info.cor }]}>{info.emoji} {info.titulo} ({its.length})</Text>
                    {sel && (
                      <TouchableOpacity onPress={() => setMarcadas(new Set([...marcadas, ...its.map((t) => t.id)]))}>
                        <Text style={styles.link}>Marcar todos</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {its.map((t) => cartao(t, acoesAberta(t), sel))}
                </View>
              );
            })}
            {!carregando && !abertas.length && <Text style={styles.vazio}>Nenhuma tratativa aberta. Elas aparecem ao salvar uma coleta.</Text>}
          </>
        )}

        {aba === 'validar' && (
          <>
            {paraValidar.map((t) => cartao(t, acoesValidar(t)))}
            {!carregando && !paraValidar.length && <Text style={styles.vazio}>Nada para validar agora.</Text>}
          </>
        )}

        {aba === 'encarregado' && (
          <>
            {comEncarregado.map((t) =>
              cartao(
                t,
                <Text style={styles.tag}>
                  {nomeSetor(t.setorTarefa)} · {t.acao ? ROTULO_ACAO[t.acao] : ''} · enviado {dataBR(t.atualizadaEm)}
                </Text>,
              ),
            )}
            {!carregando && !comEncarregado.length && <Text style={styles.vazio}>Nada com os encarregados.</Text>}
          </>
        )}

        {aba === 'resolvidas' && (
          <>
            <Text style={styles.nota}>Últimos 7 dias</Text>
            {resolvidas.filter(doSetor).map((t) =>
              cartao(t, <Text style={styles.tag}>✅ {t.acao ? ROTULO_ACAO[t.acao] : 'Resolvida'} · {dataBR(t.resolvidaEm)}</Text>),
            )}
            {!carregando && !resolvidas.length && <Text style={styles.vazio}>Nenhuma resolvida nos últimos 7 dias.</Text>}
          </>
        )}
      </ScrollView>

      {aba === 'abertas' && selecionadas.length > 0 && (
        <View style={styles.rodape}>
          <TouchableOpacity style={[styles.btnGrande, { flex: 1 }]} onPress={() => setEnvio({ itens: selecionadas, pedido: null })}>
            <Feather name="send" size={16} color={colors.white} />
            <Text style={styles.btnGrandeTexto}>Enviar {selecionadas.length} ao encarregado</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Escolher setor do encarregado */}
      <Modal visible={!!envio} transparent animationType="fade" onRequestClose={() => setEnvio(null)}>
        <View style={styles.modalFundo}>
          <View style={styles.modal}>
            <Text style={styles.modalTitulo}>Enviar ao encarregado</Text>
            <Text style={styles.modalTexto}>
              {envio?.itens.length} {envio?.itens.length === 1 ? 'produto' : 'produtos'}
              {envio?.pedido ? ` · ${ROTULO_ACAO[envio.pedido]}` : ''}. Vira uma tarefa com prazo hoje. Para qual setor?
            </Text>
            {SETORES_ENVIO.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={styles.opcao}
                disabled={ocupado}
                onPress={() => {
                  const e = envio;
                  setEnvio(null);
                  if (e) executar(() => enviarAoEncarregado(e.itens, s.key, e.pedido, quem));
                }}
              >
                <Text style={styles.opcaoTexto}>{s.nome}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setEnvio(null)} style={{ marginTop: spacing.md, alignSelf: 'center' }}>
              <Text style={styles.link}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Descontinuado */}
      <Modal visible={!!descont} transparent animationType="fade" onRequestClose={() => setDescont(null)}>
        <View style={styles.modalFundo}>
          <View style={styles.modal}>
            <Text style={styles.modalTitulo}>Marcar como descontinuado</Text>
            <Text style={styles.modalTexto}>{descont?.produto}</Text>
            {MOTIVOS_DESCONTINUADO.map((m) => (
              <TouchableOpacity
                key={m}
                style={styles.opcao}
                onPress={() => {
                  const t = descont;
                  setDescont(null);
                  if (t) executar(() => descontinuar(t, m, quem));
                }}
              >
                <Text style={styles.opcaoTexto}>{m}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setDescont(null)} style={{ marginTop: spacing.md, alignSelf: 'center' }}>
              <Text style={styles.link}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ModalAjuste
        t={ajuste}
        onFechar={() => setAjuste(null)}
        onConfirmar={(q) => {
          const t = ajuste;
          setAjuste(null);
          if (t) executar(() => ajustarEstoqueEFechar(t, q, quem));
        }}
      />
      {ocupado && (
        <View style={styles.ocupado}>
          <ActivityIndicator color={colors.white} />
        </View>
      )}
    </View>
  );
}

function ModalAjuste({ t, onFechar, onConfirmar }: { t: Tratativa | null; onFechar: () => void; onConfirmar: (q: number) => void }) {
  const [qtd, setQtd] = useState('0');
  useEffect(() => { if (t) setQtd('0'); }, [t]);
  return (
    <Modal visible={!!t} transparent animationType="fade" onRequestClose={onFechar}>
      <View style={styles.modalFundo}>
        <View style={styles.modal}>
          <Text style={styles.modalTitulo}>Ajustar estoque</Text>
          <Text style={styles.modalTexto}>{t?.produto}</Text>
          <Text style={styles.modalTexto}>Sistema: {t?.saldo ?? '?'} · Quantidade que existe de verdade:</Text>
          <TextInput style={styles.input} value={qtd} onChangeText={setQtd} keyboardType="number-pad" autoFocus />
          <Text style={styles.nota}>Vai para a lista de Ajustes do Giro (motivo “Contagem física”), igual a um ajuste feito por lá.</Text>
          <TouchableOpacity style={[styles.btnGrande, { marginTop: spacing.md }]} onPress={() => onConfirmar(Math.max(0, parseInt(qtd, 10) || 0))}>
            <Text style={styles.btnGrandeTexto}>Registrar ajuste e fechar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onFechar} style={{ marginTop: spacing.md, alignSelf: 'center' }}>
            <Text style={styles.link}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================= encarregado ==

function TelaEncarregado({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const quem = usuarioAtual?.nome ?? '';
  const setor = usuarioAtual?.setor ?? '';
  const [lista, setLista] = useState<Tratativa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [naoAchei, setNaoAchei] = useState<Tratativa | null>(null);
  const [obs, setObs] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await buscarTratativas({ status: ['encarregado'], setorTarefa: setor }));
    } catch (e: any) {
      Alert.alert('Erro ao carregar', e?.message ?? '');
    } finally {
      setCarregando(false);
    }
  }, [setor]);
  useEffect(() => { carregar(); }, [carregar]);

  async function feito(t: Tratativa) {
    setOcupado(t.id);
    try {
      const foto = await tirarFoto();
      if (!foto) return;
      await responderEncarregado(t, 'na_area', quem, foto);
      setLista((l) => l.filter((x) => x.id !== t.id));
    } catch (e: any) {
      Alert.alert('Não consegui enviar', e?.message ?? '');
    } finally {
      setOcupado(null);
    }
  }

  async function confirmarNaoAchei() {
    const t = naoAchei;
    if (!t) return;
    setNaoAchei(null);
    setOcupado(t.id);
    try {
      const ehParado = !!t.acao && ['sem_preco', 'mal_exposto', 'validade'].includes(t.acao);
      await responderEncarregado(t, ehParado ? 'nao_resolvido' : 'nao_achei', quem, null, obs.trim() || undefined);
      setLista((l) => l.filter((x) => x.id !== t.id));
    } catch (e: any) {
      Alert.alert('Não consegui enviar', e?.message ?? '');
    } finally {
      setOcupado(null);
      setObs('');
    }
  }

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo="Ruptura · tratativas" subtitulo="Responda produto por produto" icone="check-square" onVoltar={onVoltar} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}>
        {lista.map((t) => {
          const ehParado = !!t.acao && ['sem_preco', 'mal_exposto', 'validade'].includes(t.acao);
          const oque = (t.acao && PEDIDO_ENCARREGADO[t.acao]) || PEDIDO_ENCARREGADO[t.situacao] || '';
          return (
            <View key={t.id} style={styles.item}>
              <Text style={styles.itemNome}>{t.produto}</Text>
              <Text style={styles.itemDet}>{t.codigoInterno} · {t.grupoNome}</Text>
              {oque ? <Text style={styles.oQueFazer}>👉 {oque}</Text> : null}
              {t.obs && t.acao === 'devolvido' ? <Text style={[styles.itemDet, { color: '#C0352B' }]}>Devolvido pela gerência: {t.obs}</Text> : null}
              {ocupado === t.id ? (
                <ActivityIndicator color={AZUL} style={{ marginTop: spacing.sm }} />
              ) : (
                <View style={styles.linhaBotoes}>
                  <TouchableOpacity style={[styles.btn, styles.btnOk]} onPress={() => feito(t)}>
                    <Feather name="camera" size={14} color={colors.white} />
                    <Text style={[styles.btnTexto, { color: colors.white }]}>{ehParado ? 'Resolvido' : 'Na área de venda'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.btnPerigo]} onPress={() => setNaoAchei(t)}>
                    <Text style={[styles.btnTexto, { color: '#C0352B' }]}>{ehParado ? 'Não consegui' : 'Não achei'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
        {!carregando && !lista.length && <Text style={styles.vazio}>Nenhum produto de ruptura para o seu setor agora. 👍</Text>}
      </ScrollView>

      <Modal visible={!!naoAchei} transparent animationType="fade" onRequestClose={() => setNaoAchei(null)}>
        <View style={styles.modalFundo}>
          <View style={styles.modal}>
            <Text style={styles.modalTitulo}>Não achei</Text>
            <Text style={styles.modalTexto}>{naoAchei?.produto}</Text>
            <TextInput style={styles.input} value={obs} onChangeText={setObs} placeholder="Observação (opcional)" placeholderTextColor={colors.gray400} />
            <TouchableOpacity style={[styles.btnGrande, { marginTop: spacing.md }]} onPress={confirmarNaoAchei}>
              <Text style={styles.btnGrandeTexto}>Enviar para a gerência</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setNaoAchei(null)} style={{ marginTop: spacing.md, alignSelf: 'center' }}>
              <Text style={styles.link}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// =================================================================== estilos ==

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.gray50 },
  abas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  aba: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  abaAtiva: { backgroundColor: AZUL, borderColor: AZUL },
  abaTexto: { fontSize: 12.5, fontWeight: '700', color: colors.navy700 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, marginRight: 6 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 12, fontWeight: '600', color: colors.navy700 },
  avisoAzul: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E3EDFF', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  avisoTexto: { flex: 1, fontSize: 13, color: colors.gray900 },
  nota: { fontSize: 12, color: colors.gray600, marginBottom: spacing.sm },
  secTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  secTitulo: { fontSize: 15, fontWeight: '800' },
  item: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: spacing.md, marginBottom: spacing.sm },
  itemNome: { fontSize: 14, fontWeight: '700', color: colors.navy900 },
  itemDet: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  tag: { fontSize: 11.5, color: AZUL, fontWeight: '700', marginTop: 6 },
  oQueFazer: { fontSize: 13, color: colors.navy700, fontWeight: '600', marginTop: 6 },
  linhaBotoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.gray100, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.gray50 },
  btnPri: { backgroundColor: AZUL, borderColor: AZUL },
  btnOk: { backgroundColor: '#178553', borderColor: '#178553' },
  btnPerigo: { backgroundColor: '#FDECEA', borderColor: '#FDECEA' },
  btnTexto: { fontSize: 12.5, fontWeight: '700', color: colors.navy700 },
  resposta: { backgroundColor: colors.gray50, borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm },
  respostaTexto: { fontSize: 12.5, fontWeight: '700', color: colors.navy900 },
  foto: { width: '100%', height: 220, borderRadius: radius.sm, marginTop: spacing.sm, backgroundColor: colors.gray100 },
  vazio: { textAlign: 'center', color: colors.gray600, marginTop: spacing.xl },
  link: { color: AZUL, fontWeight: '700' },
  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', padding: spacing.lg, backgroundColor: colors.gray50, borderTopWidth: 1, borderTopColor: colors.gray100 },
  btnGrande: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: AZUL, borderRadius: radius.md, paddingVertical: 14 },
  btnGrandeTexto: { color: colors.white, fontWeight: '700', fontSize: 15 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.xl },
  modal: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  modalTitulo: { fontSize: 17, fontWeight: '800', color: colors.navy900, marginBottom: spacing.sm },
  modalTexto: { fontSize: 13, color: colors.gray600, marginBottom: spacing.sm },
  opcao: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  opcaoTexto: { fontSize: 14, color: colors.navy900, fontWeight: '600' },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16, color: colors.gray900 },
  ocupado: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
});
