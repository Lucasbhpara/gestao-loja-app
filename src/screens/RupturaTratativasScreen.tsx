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
import RotaMapaScreen, { ItemRota } from './RotaMapaScreen';
import { SetorKey } from '../data/employees';
import { supabase } from '../lib/supabase';
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
  enviarAoPedidoCD,
  marcarAcaoGerencia,
  marcarZerado,
  resolverManual,
  responderEncarregado,
  validar,
  verificarAutomatico,
} from '../data/rupturaTratativasApi';

// Tratativas da Ruptura — ver src/data/rupturaTratativasApi.ts.
// modo "gerencia": abertas, validar, com encarregado e resolvidas.
// modo "encarregado": só o que foi mandado para o setor dele, com os botões.

const AZUL = '#2F7BFF';
const VERDE_PEDIDO = '#1B5E20';
const dataBR = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const dataCurta = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
const diasAberta = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
const nomeSetor = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');

const SETORES_ENVIO: { key: SetorKey; nome: string }[] = [
  { key: 'mercearia', nome: 'Mercearia' },
  { key: 'deposito', nome: 'Depósito' },
  { key: 'prevencao', nome: 'Prevenção' },
];

const ORDEM: Situacao[] = ['ruptura', 'nunca_veio', 'cd_sem', 'repor', 'suspeito', 'parado'];
const VAI_PARA_ENCARREGADO: Situacao[] = ['repor', 'suspeito'];

type Aba = 'comprar' | 'verificar' | 'abertas' | 'validar' | 'encarregado' | 'resolvidas';
type Idade = 'todas' | 'hoje' | '3' | '7';
type Ordem = 'antigas' | 'recentes' | 'nome';
type EstoqueAtual = { q: number; ean: string; em: string };

const IDADES: [Idade, string][] = [['todas', 'Qualquer'], ['hoje', 'Abertas hoje'], ['3', '+3 dias'], ['7', '+7 dias']];
const ORDENS: [Ordem, string][] = [['antigas', 'Mais antigas'], ['recentes', 'Mais recentes'], ['nome', 'Nome A–Z']];
const DIAS_ATRASADA = 7;
const paraRota = (lista: Tratativa[]): ItemRota[] =>
  lista.map((t) => ({ codigoInterno: t.codigoInterno, produto: t.produto, grupoId: t.grupoId, detalhe: `${SITUACOES[t.situacao].emoji} ${SITUACOES[t.situacao].titulo}` }));
const semAcento = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Saldo de agora no Estoque Loja (o "saldo" da tratativa é o da coleta).
async function buscarEstoqueAtual(codigos: string[]): Promise<Map<string, EstoqueAtual>> {
  const mapa = new Map<string, EstoqueAtual>();
  const unicos = [...new Set(codigos)];
  for (let i = 0; i < unicos.length; i += 300) {
    const { data, error } = await supabase
      .from('estoque_loja_itens')
      .select('codigo_interno, quantidade, codigo_barras, atualizado_em')
      .in('codigo_interno', unicos.slice(i, i + 300));
    if (error) throw error;
    (data || []).forEach((l: any) => {
      const k = String(l.codigo_interno);
      const atual = mapa.get(k);
      if (!atual || l.atualizado_em > atual.em) mapa.set(k, { q: Number(l.quantidade) || 0, ean: String(l.codigo_barras ?? ''), em: l.atualizado_em });
    });
  }
  return mapa;
}

// Estoque de agora no CD (último mix importado). O "estoqueCd" da tratativa é o da coleta.
async function buscarCdAtual(codigos: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  const unicos = [...new Set(codigos)];
  for (let i = 0; i < unicos.length; i += 300) {
    const { data, error } = await supabase.from('mix_cd_itens').select('codigo_interno, estoque_cd').in('codigo_interno', unicos.slice(i, i + 300));
    if (error) throw error;
    (data || []).forEach((l: any) => mapa.set(String(l.codigo_interno), Number(l.estoque_cd) || 0));
  }
  return mapa;
}

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
  const [aba, setAba] = useState<Aba>('comprar');
  const [lista, setLista] = useState<Tratativa[]>([]);
  const [resolvidas, setResolvidas] = useState<Tratativa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [envio, setEnvio] = useState<{ itens: Tratativa[]; pedido: AcaoTratativa | null } | null>(null);
  const [pedidoCD, setPedidoCD] = useState<Tratativa[] | null>(null);
  const [menu, setMenu] = useState<Tratativa | null>(null);
  const [verAguardando, setVerAguardando] = useState(false);
  const [descont, setDescont] = useState<Tratativa | null>(null);
  const [ajuste, setAjuste] = useState<Tratativa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtroSetor, setFiltroSetor] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState<Situacao | null>(null);
  const [idade, setIdade] = useState<Idade>('todas');
  const [soComEstoque, setSoComEstoque] = useState(false);
  const [soAguardando, setSoAguardando] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>('antigas');
  const [painelFiltros, setPainelFiltros] = useState(false);
  const [estoque, setEstoque] = useState<Map<string, EstoqueAtual>>(new Map());
  const [cdAgora, setCdAgora] = useState<Map<string, number> | null>(null);
  const [rota, setRota] = useState<ItemRota[] | null>(null);

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
      buscarEstoqueAtual([...abertos, ...fechados].map((t) => t.codigoInterno))
        .then(setEstoque)
        .catch(() => setEstoque(new Map()));
      buscarCdAtual(abertos.map((t) => t.codigoInterno))
        .then(setCdAgora)
        .catch(() => setCdAgora(null));
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

  // CD de agora; produto que saiu do mix conta como sem estoque no CD.
  const cdAtual = (t: Tratativa): number | null => (cdAgora ? cdAgora.get(t.codigoInterno) ?? 0 : t.estoqueCd);
  const saldoAgora = (t: Tratativa): number | null => {
    const e = estoque.get(t.codigoInterno);
    const q = e ? e.q : t.saldo;
    // Conferido como zerado: o estoque do sistema era fantasma; só conta se subir acima dele.
    if (t.acao === 'zerado') return q != null && q > Number(t.saldo ?? 0) ? q : 0;
    return q;
  };
  const termo = semAcento(busca.trim());
  const passa = (t: Tratativa) => {
    if (filtroSetor && t.setor !== filtroSetor) return false;
    if (filtroSituacao && t.situacao !== filtroSituacao) return false;
    if (termo) {
      const ean = estoque.get(t.codigoInterno)?.ean ?? '';
      if (!semAcento(t.produto).includes(termo) && !t.codigoInterno.includes(termo) && !ean.includes(termo)) return false;
    }
    const d = diasAberta(t.abertaEm);
    if (idade === 'hoje' && d > 0) return false;
    if ((idade === '3' && d < 3) || (idade === '7' && d < 7)) return false;
    if (soComEstoque && !((saldoAgora(t) ?? 0) > 0)) return false;
    if (soAguardando && !(t.acao === 'pedido_feito' && (t.situacao === 'ruptura' || t.situacao === 'nunca_veio'))) return false;
    return true;
  };
  const ordenar = (a: Tratativa, b: Tratativa) =>
    ordem === 'nome' ? a.produto.localeCompare(b.produto) : ordem === 'recentes' ? b.abertaEm.localeCompare(a.abertaEm) : a.abertaEm.localeCompare(b.abertaEm);
  const doSetor = passa;
  // Já foi para o pedido (fila do Pedido CD ou "Pedido feito"): sai da ruptura e espera chegar.
  const jaPedido = (t: Tratativa) => (t.situacao === 'ruptura' || t.situacao === 'nunca_veio') && (t.acao === 'pedido_feito' || t.acao === 'pedido_cd');
  // Precisa comprar: ruptura sem estoque na loja, com estoque no CD, ainda não pedida.
  const precisaComprar = (t: Tratativa) =>
    t.status === 'aberta' && t.situacao === 'ruptura' && !jaPedido(t) && (cdAtual(t) ?? 0) > 0 && !((saldoAgora(t) ?? 0) > 0);
  // Verificar estoque: não está na área de venda, mas o sistema tem estoque na loja → encarregado confere e leva.
  const verificarEstoque = (t: Tratativa) =>
    t.status === 'aberta' && !jaPedido(t) && !precisaComprar(t) && ['ruptura', 'repor', 'suspeito'].includes(t.situacao) && (saldoAgora(t) ?? 0) > 0;
  const outra = (t: Tratativa) => t.status === 'aberta' && !jaPedido(t) && !precisaComprar(t) && !verificarEstoque(t);
  const totalAbertas = lista.filter(outra).length;
  const abertas = lista.filter((t) => outra(t) && passa(t)).sort(ordenar);
  const verificar = lista.filter((t) => verificarEstoque(t) && passa(t)).sort((a, b) => (a.grupoNome ?? '').localeCompare(b.grupoNome ?? '') || (saldoAgora(b) ?? 0) - (saldoAgora(a) ?? 0));
  const comprar = lista.filter((t) => precisaComprar(t) && passa(t)).sort((a, b) => (a.grupoNome ?? '').localeCompare(b.grupoNome ?? '') || a.produto.localeCompare(b.produto));
  const aguardando = lista.filter((t) => t.status === 'aberta' && jaPedido(t) && passa(t)).sort(ordenar);
  const paraValidar = lista.filter((t) => t.status === 'validacao' && passa(t)).sort(ordenar);
  const comEncarregado = lista.filter((t) => t.status === 'encarregado' && passa(t)).sort(ordenar);
  const qtdFiltrosPainel = (idade !== 'todas' ? 1 : 0) + (soComEstoque ? 1 : 0) + (soAguardando ? 1 : 0) + (ordem !== 'antigas' ? 1 : 0) + (filtroSetor ? 1 : 0);
  const algumFiltro = qtdFiltrosPainel > 0 || !!filtroSituacao || !!termo;
  const limparFiltros = () => {
    setBusca(''); setFiltroSituacao(null); setIdade('todas'); setSoComEstoque(false); setSoAguardando(false); setOrdem('antigas'); setFiltroSetor(null);
  };
  const setores = useMemo(() => [...new Set(lista.map((t) => t.setor).filter(Boolean))] as string[], [lista]);
  const maisAntiga = abertas.reduce((m, t) => Math.max(m, diasAberta(t.abertaEm)), 0);

  const alternar = (id: string) => {
    const n = new Set(marcadas);
    n.has(id) ? n.delete(id) : n.add(id);
    setMarcadas(n);
  };

  // Selo do status da tratativa (o que já foi feito com ela).
  function seloAcao(t: Tratativa): { texto: string; cor: string; fundo: string } | null {
    if (!t.acao) return null;
    const quando = dataCurta(t.atualizadaEm);
    switch (t.acao) {
      case 'pedido_feito': return { texto: `🚚 Pedido feito · ${quando}`, cor: '#1D4ED8', fundo: '#E3EDFF' };
      case 'pedido_cd': return { texto: '⏳ Na fila do Pedido CD', cor: '#9A5B00', fundo: '#FFF4E0' };
      case 'zerado': return { texto: `0️⃣ Zerado na loja · ${quando}`, cor: '#C0352B', fundo: '#FDECEA' };
      case 'cobrado': return { texto: `📞 Comprador cobrado · ${quando}`, cor: '#6B21A8', fundo: '#F3E8FF' };
      case 'auto_cd': return { texto: '✅ CD voltou a ter estoque', cor: '#178553', fundo: '#E6F6EE' };
      default: return { texto: `${ROTULO_ACAO[t.acao]} · ${quando}`, cor: colors.navy700, fundo: colors.gray50 };
    }
  }

  function cartao(
    t: Tratativa,
    filhos: React.ReactNode,
    opc: { selecionavel?: boolean; menu?: boolean; ocultarSituacao?: boolean } = {},
  ) {
    const info = SITUACOES[t.situacao];
    const m = marcadas.has(t.id);
    const loja = saldoAgora(t);
    const selo = t.status === 'aberta' ? seloAcao(t) : null;
    const corpo = (
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {opc.selecionavel && (
          <View style={{ paddingRight: 10, paddingTop: 1 }}>
            <Feather name={m ? 'check-square' : 'square'} size={20} color={m ? AZUL : colors.gray400} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.itemNome} numberOfLines={2}>{t.produto}</Text>
          <Text style={styles.itemDet}>
            {t.codigoInterno} · {t.grupoNome}
            {opc.ocultarSituacao ? '' : ` · ${info.emoji} ${info.titulo}`}
          </Text>
          <View style={styles.selos}>
            {loja != null && (
              <Text style={[styles.selo, loja > 0 ? styles.seloVerde : styles.seloVermelho]}>
                Loja {loja}
                {t.saldo != null && t.saldo !== loja ? ` (era ${t.saldo})` : ''}
              </Text>
            )}
            {cdAtual(t) != null && (
              <Text style={[styles.selo, (cdAtual(t) ?? 0) > 0 ? styles.seloVerde : styles.seloVermelho]}>
                {(cdAtual(t) ?? 0) > 0 ? `CD ${cdAtual(t)}` : 'CD sem estoque'}
              </Text>
            )}
            <Text style={[styles.selo, diasAberta(t.abertaEm) >= DIAS_ATRASADA ? styles.seloVermelho : styles.seloCinza]}>
              {diasAberta(t.abertaEm) === 0 ? 'hoje' : `${diasAberta(t.abertaEm)}d aberta`}
            </Text>
            {selo && <Text style={[styles.selo, { color: selo.cor, backgroundColor: selo.fundo }]}>{selo.texto}</Text>}
          </View>
        </View>
        {opc.menu && (
          <TouchableOpacity onPress={() => setMenu(t)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.btnMenu}>
            <Feather name="more-vertical" size={20} color={colors.gray600} />
          </TouchableOpacity>
        )}
      </View>
    );
    return (
      <View key={t.id} style={[styles.item, m && { borderColor: AZUL, backgroundColor: '#F5F9FF' }]}>
        {opc.selecionavel ? (
          <TouchableOpacity activeOpacity={0.7} onPress={() => alternar(t.id)}>{corpo}</TouchableOpacity>
        ) : (
          corpo
        )}
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

  type Opcao = { rotulo: string; icone: React.ComponentProps<typeof Feather>['name']; perigo?: boolean; fn: () => void };
  function opcoesAberta(t: Tratativa): Opcao[] {
    const o: Opcao[] = [];
    if (t.situacao === 'ruptura') {
      if (t.acao !== 'pedido_cd' && t.acao !== 'pedido_feito' && (cdAtual(t) ?? 0) > 0) o.push({ rotulo: 'Enviar ao Pedido CD', icone: 'shopping-cart', fn: () => setPedidoCD([t]) });
    }
    if (verificarEstoque(t)) {
      o.push({
        rotulo: 'Zerado (não tem na loja) → pedir',
        icone: 'x-circle',
        fn: () =>
          executar(async () => {
            const sistema = estoque.get(t.codigoInterno)?.q ?? t.saldo;
            await marcarZerado(t, sistema, quem);
            setAviso(`${t.produto}: marcado como zerado. ${(cdAtual(t) ?? 0) > 0 ? 'Foi para “🛒 Precisa comprar”.' : 'O CD está sem estoque: ficou em “Outras”.'}`);
          }),
      });
    }
    if (t.situacao === 'ruptura' || t.situacao === 'nunca_veio') {
      if (t.acao !== 'pedido_feito') o.push({ rotulo: 'Marcar "Pedido feito" (fiz à mão)', icone: 'check', fn: () => executar(() => marcarAcaoGerencia(t, 'pedido_feito', quem)) });
    } else if (t.situacao === 'cd_sem') {
      if (t.acao !== 'cobrado') o.push({ rotulo: 'Cobrei o comprador', icone: 'phone', fn: () => executar(() => marcarAcaoGerencia(t, 'cobrado', quem)) });
    } else if (VAI_PARA_ENCARREGADO.includes(t.situacao)) {
      o.push({ rotulo: 'Enviar ao encarregado', icone: 'send', fn: () => setEnvio({ itens: [t], pedido: null }) });
      o.push({ rotulo: 'Já está resolvido', icone: 'check-circle', fn: () => executar(() => resolverManual(t, quem)) });
    } else if (t.situacao === 'parado') {
      o.push({ rotulo: 'Sem preço → encarregado', icone: 'tag', fn: () => setEnvio({ itens: [t], pedido: 'sem_preco' }) });
      o.push({ rotulo: 'Mal exposto → encarregado', icone: 'layout', fn: () => setEnvio({ itens: [t], pedido: 'mal_exposto' }) });
      o.push({ rotulo: 'Conferir validade → encarregado', icone: 'calendar', fn: () => setEnvio({ itens: [t], pedido: 'validade' }) });
      o.push({ rotulo: 'Está certo, só não vende', icone: 'check-circle', fn: () => executar(() => resolverManual(t, quem, 'Exposto corretamente, só não vende')) });
    }
    if (['ruptura', 'nunca_veio', 'cd_sem'].includes(t.situacao)) {
      o.push({ rotulo: 'Descontinuado', icone: 'slash', perigo: true, fn: () => setDescont(t) });
    }
    return o;
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

  const selecionadas = (aba === 'comprar' ? comprar : aba === 'verificar' ? verificar : abertas).filter((t) => marcadas.has(t.id));
  const selPedido = selecionadas.filter((t) => t.situacao === 'ruptura' && (cdAtual(t) ?? 0) > 0);
  const selEncarregado = aba === 'verificar' ? selecionadas : selecionadas.filter((t) => t.situacao !== 'ruptura');
  const listaDaAba = aba === 'abertas' ? abertas : aba === 'comprar' ? comprar : aba === 'verificar' ? verificar : aba === 'validar' ? paraValidar : aba === 'encarregado' ? comEncarregado : resolvidas.filter(passa);

  if (rota) return <RotaMapaScreen itens={rota} titulo="Rota das tratativas" onVoltar={() => setRota(null)} />;

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo="Tratativas" subtitulo="Produtos da ruptura até resolver" icone="check-square" onVoltar={onVoltar} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, minHeight: 56 }} contentContainerStyle={styles.abas}>
        {([
          ['comprar', '🛒 Precisa comprar', comprar.length],
          ['verificar', '📦 Verificar estoque', verificar.length],
          ['abertas', 'Outras', abertas.length],
          ['validar', 'Validar', paraValidar.length],
          ['encarregado', 'Encarregado', comEncarregado.length],
          ['resolvidas', 'Resolvidas', null],
        ] as [Aba, string, number | null][]).map(([k, r, n]) => (
          <TouchableOpacity key={k} style={[styles.aba, aba === k && styles.abaAtiva]} onPress={() => { setAba(k); setMarcadas(new Set()); }}>
            <Text style={[styles.abaTexto, aba === k && styles.abaTextoAtivo]} numberOfLines={1}>{r}</Text>
            {n != null && (
              <View style={[styles.abaNum, aba === k && styles.abaNumAtivo, k === 'validar' && n > 0 && aba !== k && { backgroundColor: '#C0352B' }]}>
                <Text style={[styles.abaNumTexto, (aba === k || (k === 'validar' && n > 0)) && { color: colors.white }]}>{n}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} refreshControl={<RefreshControl refreshing={carregando} onRefresh={() => carregar(true)} />}>
        {aviso && (
          <View style={styles.avisoAzul}>
            <Feather name="zap" size={16} color={AZUL} />
            <Text style={styles.avisoTexto}>{aviso}</Text>
          </View>
        )}
        <View style={styles.busca}>
          <Feather name="search" size={16} color={colors.gray400} />
          <TextInput
            style={styles.buscaInput}
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar produto, código ou código de barras"
            placeholderTextColor={colors.gray400}
            autoCorrect={false}
          />
          {busca ? (
            <TouchableOpacity onPress={() => setBusca('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color={colors.gray600} />
            </TouchableOpacity>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
          {listaDaAba.length > 0 && aba !== 'resolvidas' && (
            <TouchableOpacity style={[styles.chip, styles.chipRota]} onPress={() => setRota(paraRota(selecionadas.length ? selecionadas : listaDaAba))}>
              <Text style={[styles.chipTexto, { color: AZUL }]}>
                🧭 Rota{selecionadas.length && aba === 'abertas' ? ` (${selecionadas.length})` : ''}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.chip, painelFiltros || qtdFiltrosPainel ? styles.chipAtivo : null]} onPress={() => setPainelFiltros(!painelFiltros)}>
            <Text style={[styles.chipTexto, (painelFiltros || qtdFiltrosPainel > 0) && { color: colors.white }]}>
              ⚲ Filtros{qtdFiltrosPainel ? ` (${qtdFiltrosPainel})` : ''}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        {painelFiltros && (
          <View style={styles.painel}>
            <Text style={styles.painelRotulo}>Estoque e pedido</Text>
            <View style={styles.linhaChips}>
              <TouchableOpacity style={[styles.chip, soComEstoque && styles.chipAtivo]} onPress={() => setSoComEstoque(!soComEstoque)}>
                <Text style={[styles.chipTexto, soComEstoque && { color: colors.white }]}>📦 Tem estoque na loja</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.chip, soAguardando && styles.chipAtivo]} onPress={() => setSoAguardando(!soAguardando)}>
                <Text style={[styles.chipTexto, soAguardando && { color: colors.white }]}>🚚 Pedido feito · aguardando chegada</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.painelRotulo}>Tempo aberta</Text>
            <View style={styles.linhaChips}>
              {IDADES.map(([k, r]) => (
                <TouchableOpacity key={k} style={[styles.chip, idade === k && styles.chipAtivo]} onPress={() => setIdade(k)}>
                  <Text style={[styles.chipTexto, idade === k && { color: colors.white }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {setores.length > 1 && (
              <>
                <Text style={styles.painelRotulo}>Setor</Text>
                <View style={styles.linhaChips}>
                  {[null, ...setores].map((st) => (
                    <TouchableOpacity key={st ?? 'todos'} style={[styles.chip, filtroSetor === st && styles.chipAtivo]} onPress={() => setFiltroSetor(st)}>
                      <Text style={[styles.chipTexto, filtroSetor === st && { color: colors.white }]}>{st ? nomeSetor(st) : 'Todos'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <Text style={styles.painelRotulo}>Ordenar</Text>
            <View style={styles.linhaChips}>
              {ORDENS.map(([k, r]) => (
                <TouchableOpacity key={k} style={[styles.chip, ordem === k && styles.chipAtivo]} onPress={() => setOrdem(k)}>
                  <Text style={[styles.chipTexto, ordem === k && { color: colors.white }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {algumFiltro && (
          <View style={styles.resumoFiltro}>
            <Text style={styles.nota}>
              {aba === 'abertas' ? `${abertas.length} de ${totalAbertas} abertas` : 'Filtro ativo'}
            </Text>
            <TouchableOpacity onPress={limparFiltros}>
              <Text style={styles.link}>Limpar filtros</Text>
            </TouchableOpacity>
          </View>
        )}

        {aba === 'abertas' && (
          <>
            {abertas.length > 0 && <Text style={styles.nota}>Mais antiga: {maisAntiga} {maisAntiga === 1 ? 'dia' : 'dias'} aberta</Text>}
            {ORDEM.map((s) => {
              const its = abertas.filter((t) => t.situacao === s);
              if (!its.length) return null;
              const info = SITUACOES[s];
              const sel = VAI_PARA_ENCARREGADO.includes(s);
              const marcaveis = its;
              return (
                <View key={s} style={{ marginBottom: spacing.lg }}>
                  <View style={styles.secTopo}>
                    <Text style={[styles.secTitulo, { color: info.cor }]}>{info.emoji} {info.titulo} · {its.length}</Text>
                    {sel && marcaveis.length > 0 && (
                      <TouchableOpacity onPress={() => setMarcadas(new Set([...marcadas, ...marcaveis.map((t) => t.id)]))}>
                        <Text style={styles.link}>Marcar todos</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {s === 'ruptura' && (
                    <Text style={styles.nota}>Sem estoque no CD ou com estoque na loja. Os que dá para pedir estão em “🛒 Precisa comprar”.</Text>
                  )}
                  {its.map((t) => cartao(t, null, { selecionavel: sel, menu: opcoesAberta(t).length > 0, ocultarSituacao: true }))}
                </View>
              );
            })}
            {!carregando && !abertas.length && (
              <Text style={styles.vazio}>{algumFiltro && totalAbertas ? 'Nenhuma tratativa com esses filtros.' : 'Nenhuma tratativa aberta. Elas aparecem ao salvar uma coleta.'}</Text>
            )}
          </>
        )}

        {aba === 'verificar' && (
          <>
            <View style={styles.secResumo}>
              <Text style={styles.secResumoTexto}>
                {verificar.length} fora da área de venda com estoque na loja{marcadas.size ? ` · ${selecionadas.length} marcados` : ''}
              </Text>
              {verificar.length > 0 && (
                <TouchableOpacity onPress={() => setMarcadas(marcadas.size === verificar.length ? new Set() : new Set(verificar.map((t) => t.id)))}>
                  <Text style={styles.link}>{marcadas.size === verificar.length ? 'Desmarcar' : 'Marcar todos'}</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.nota}>Produto parado no estoque: mande ao encarregado conferir e levar para a loja.</Text>
            {[...new Set(verificar.map((t) => t.grupoNome ?? 'Sem grupo'))].map((g) => {
              const its = verificar.filter((t) => (t.grupoNome ?? 'Sem grupo') === g);
              const todos = its.every((t) => marcadas.has(t.id));
              return (
                <View key={g} style={{ marginBottom: spacing.md }}>
                  <View style={styles.secTopo}>
                    <Text style={[styles.secTitulo, { fontSize: 14, color: colors.navy700 }]}>{g} · {its.length}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const n = new Set(marcadas);
                        its.forEach((t) => (todos ? n.delete(t.id) : n.add(t.id)));
                        setMarcadas(n);
                      }}
                    >
                      <Text style={styles.link}>{todos ? 'Desmarcar' : 'Marcar grupo'}</Text>
                    </TouchableOpacity>
                  </View>
                  {its.map((t) => cartao(t, null, { selecionavel: true, menu: true }))}
                </View>
              );
            })}
            {!carregando && !verificar.length && <Text style={styles.vazio}>Nada para verificar agora. 👍</Text>}
          </>
        )}

        {aba === 'comprar' && (
          <>
            <View style={styles.secResumo}>
              <Text style={styles.secResumoTexto}>
                {comprar.length} sem estoque na loja e com estoque no CD{marcadas.size ? ` · ${selecionadas.length} marcados` : ''}
              </Text>
              {comprar.length > 0 && (
                <TouchableOpacity onPress={() => setMarcadas(marcadas.size === comprar.length ? new Set() : new Set(comprar.map((t) => t.id)))}>
                  <Text style={styles.link}>{marcadas.size === comprar.length ? 'Desmarcar' : 'Marcar todos'}</Text>
                </TouchableOpacity>
              )}
            </View>
            {[...new Set(comprar.map((t) => t.grupoNome ?? 'Sem grupo'))].map((g) => {
              const its = comprar.filter((t) => (t.grupoNome ?? 'Sem grupo') === g);
              const todos = its.every((t) => marcadas.has(t.id));
              return (
                <View key={g} style={{ marginBottom: spacing.md }}>
                  <View style={styles.secTopo}>
                    <Text style={[styles.secTitulo, { fontSize: 14, color: colors.navy700 }]}>{g} · {its.length}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const n = new Set(marcadas);
                        its.forEach((t) => (todos ? n.delete(t.id) : n.add(t.id)));
                        setMarcadas(n);
                      }}
                    >
                      <Text style={styles.link}>{todos ? 'Desmarcar' : 'Marcar grupo'}</Text>
                    </TouchableOpacity>
                  </View>
                  {its.map((t) => cartao(t, null, { selecionavel: true, menu: true, ocultarSituacao: true }))}
                </View>
              );
            })}
            {!carregando && !comprar.length && (
              <Text style={styles.vazio}>Nada para comprar agora. 👍 Tudo que está em ruptura com estoque no CD já foi pedido.</Text>
            )}
            {aguardando.length > 0 && (
              <View style={{ marginBottom: spacing.lg }}>
                <TouchableOpacity style={styles.secTopo} onPress={() => setVerAguardando(!verAguardando)}>
                  <Text style={[styles.secTitulo, { color: '#1D4ED8' }]}>🚚 Pedido feito · aguardando chegada · {aguardando.length}</Text>
                  <Feather name={verAguardando ? 'chevron-up' : 'chevron-down'} size={18} color="#1D4ED8" />
                </TouchableOpacity>
                <Text style={styles.nota}>Fecham sozinhos quando o produto volta a ter estoque na loja.</Text>
                {verAguardando && aguardando.map((t) => cartao(t, null, { menu: opcoesAberta(t).length > 0 }))}
              </View>
            )}

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
            {resolvidas.filter(doSetor).sort(ordenar).map((t) =>
              cartao(t, <Text style={styles.tag}>✅ {t.acao ? ROTULO_ACAO[t.acao] : 'Resolvida'} · {dataBR(t.resolvidaEm)}</Text>),
            )}
            {!carregando && !resolvidas.length && <Text style={styles.vazio}>Nenhuma resolvida nos últimos 7 dias.</Text>}
          </>
        )}
      </ScrollView>

      {(aba === 'abertas' || aba === 'comprar' || aba === 'verificar') && selecionadas.length > 0 && (
        <View style={[styles.rodape, { gap: spacing.sm }]}>
          {selPedido.length > 0 && (
            <TouchableOpacity style={[styles.btnGrande, { flex: 1, backgroundColor: VERDE_PEDIDO }]} onPress={() => setPedidoCD(selPedido)}>
              <Feather name="shopping-cart" size={16} color={colors.white} />
              <Text style={styles.btnGrandeTexto}>Enviar {selPedido.length} ao Pedido CD</Text>
            </TouchableOpacity>
          )}
          {selEncarregado.length > 0 && (
            <TouchableOpacity style={[styles.btnGrande, { flex: 1 }]} onPress={() => setEnvio({ itens: selEncarregado, pedido: null })}>
              <Feather name="send" size={16} color={colors.white} />
              <Text style={styles.btnGrandeTexto}>Enviar {selEncarregado.length} ao encarregado</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Menu ⋯ de um produto */}
      <Modal visible={!!menu} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <TouchableOpacity style={styles.modalFundo} activeOpacity={1} onPress={() => setMenu(null)}>
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitulo} numberOfLines={2}>{menu?.produto}</Text>
            <Text style={[styles.itemDet, { marginBottom: spacing.md }]}>{menu?.codigoInterno} · {menu ? SITUACOES[menu.situacao].titulo : ''}</Text>
            {menu &&
              opcoesAberta(menu).map((o) => (
                <TouchableOpacity
                  key={o.rotulo}
                  style={styles.opcaoMenu}
                  disabled={ocupado}
                  onPress={() => {
                    setMenu(null);
                    o.fn();
                  }}
                >
                  <Feather name={o.icone} size={18} color={o.perigo ? '#C0352B' : colors.navy700} />
                  <Text style={[styles.opcaoMenuTexto, o.perigo && { color: '#C0352B' }]}>{o.rotulo}</Text>
                </TouchableOpacity>
              ))}
            <TouchableOpacity onPress={() => setMenu(null)} style={{ marginTop: spacing.md, alignSelf: 'center' }}>
              <Text style={styles.link}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Confirmar envio ao Pedido CD automático */}
      <Modal visible={!!pedidoCD} transparent animationType="fade" onRequestClose={() => setPedidoCD(null)}>
        <View style={styles.modalFundo}>
          <View style={styles.modal}>
            <Text style={styles.modalTitulo}>Enviar ao Pedido CD</Text>
            <Text style={styles.modalTexto}>
              {pedidoCD?.length} {pedidoCD?.length === 1 ? 'produto vai' : 'produtos vão'} para o formulário MG SECOS do Portal 360.
              A quantidade é o giro semanal (mínimo 1 caixa). Só entra o que está no mix do CD com estoque.
              Quando terminar, você recebe o aviso "Pedido pronto" e as tratativas viram "Pedido feito".
            </Text>
            <ScrollView style={{ maxHeight: 220, marginBottom: spacing.md }}>
              {pedidoCD?.map((t) => (
                <Text key={t.id} style={styles.itemDet}>• {t.codigoInterno} – {t.produto}</Text>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[styles.btnGrande, { backgroundColor: VERDE_PEDIDO }]}
              disabled={ocupado}
              onPress={() => {
                const l = pedidoCD;
                setPedidoCD(null);
                if (l)
                  executar(async () => {
                    const r = await enviarAoPedidoCD(l, quem);
                    setAviso(
                      `${r.enviados} ${r.enviados === 1 ? 'produto enviado' : 'produtos enviados'} ao Pedido CD. Você recebe o aviso quando o pedido estiver pronto.` +
                        (r.semCd ? ` ${r.semCd} ${r.semCd === 1 ? 'ficou de fora' : 'ficaram de fora'}: o CD está sem estoque.` : ''),
                    );
                  });
              }}
            >
              <Feather name="shopping-cart" size={16} color={colors.white} />
              <Text style={styles.btnGrandeTexto}>Enviar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPedidoCD(null)} style={{ marginTop: spacing.md, alignSelf: 'center' }}>
              <Text style={styles.link}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  const [rota, setRota] = useState<ItemRota[] | null>(null);
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

  if (rota) return <RotaMapaScreen itens={rota} titulo="Rota para conferir" onVoltar={() => setRota(null)} />;

  return (
    <View style={styles.tela}>
      <CabecalhoTela titulo="Ruptura · tratativas" subtitulo="Responda produto por produto" icone="check-square" onVoltar={onVoltar} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}>
        {lista.length > 1 && (
          <TouchableOpacity style={styles.btnRota} onPress={() => setRota(paraRota(lista))}>
            <Feather name="navigation" size={16} color={AZUL} />
            <Text style={styles.btnRotaTexto}>Ver rota no mapa · {lista.length} produtos</Text>
          </TouchableOpacity>
        )}
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
  abas: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 2 },
  aba: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  abaAtiva: { backgroundColor: AZUL, borderColor: AZUL },
  abaTexto: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.navy700 },
  abaTextoAtivo: { color: colors.white },
  abaNum: { minWidth: 18, paddingHorizontal: 5, height: 18, borderRadius: 9, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  abaNumAtivo: { backgroundColor: 'rgba(255,255,255,0.25)' },
  abaNumTexto: { fontSize: 10.5, fontWeight: '800', color: colors.navy700 },
  chipRota: { backgroundColor: '#E3EDFF', borderColor: '#E3EDFF' },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  selo: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full, overflow: 'hidden' },
  seloVerde: { color: '#178553', backgroundColor: '#E6F6EE' },
  seloVermelho: { color: '#C0352B', backgroundColor: '#FDECEA' },
  seloCinza: { color: colors.gray600, backgroundColor: colors.gray50 },
  btnMenu: { paddingLeft: 8, paddingTop: 1 },
  secResumo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, paddingVertical: 8, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  secResumoTexto: { flex: 1, fontSize: 12.5, color: colors.gray600, fontWeight: '600' },
  btnPedirTodos: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: VERDE_PEDIDO, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  btnPedirTodosTexto: { color: colors.white, fontWeight: '800', fontSize: 12.5 },
  opcaoMenu: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  opcaoMenuTexto: { fontSize: 14, fontWeight: '600', color: colors.navy900 },
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
  btnRota: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E3EDFF', borderRadius: radius.md, paddingVertical: 11, marginBottom: spacing.md },
  btnRotaTexto: { color: colors.navy900, fontWeight: '800', fontSize: 13.5 },
  busca: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  buscaInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.gray900 },
  painel: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  painelRotulo: { fontSize: 11, fontWeight: '800', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4, marginBottom: 6 },
  linhaChips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, marginBottom: spacing.sm },
  resumoFiltro: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  seloAtrasada: { fontSize: 10.5, fontWeight: '800', color: '#C0352B', backgroundColor: '#FDECEA', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full, overflow: 'hidden' },
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
