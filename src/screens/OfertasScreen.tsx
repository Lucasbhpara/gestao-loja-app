import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  Image,
  Linking,
  Share,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { WebView } from 'react-native-webview';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import SeletorDataValidade from '../components/SeletorDataValidade';
import { setores } from '../data/employees';
import { CARD_OFERTA_HTML } from '../data/cardOfertaJs';
import {
  Oferta,
  ProdutoBusca,
  Sugestao,
  AgendaOferta,
  ResultadoOferta,
  DIAS_SEMANA,
  buscarProdutosParaOferta,
  buscarFotos,
  procurarFotoNaInternet,
  salvarFotoProduto,
  listarOfertas,
  salvarOferta,
  excluirOferta,
  marcarOfertasEnviadas,
  sugestoesDoGiro,
  sugestoesDaValidade,
  resultadoDaOferta,
  listarAgenda,
  salvarAgenda,
  excluirAgenda,
  textoWhatsApp,
  textoValidadeCard,
  buscarLogo,
  ofertaAtiva,
  hojeIso,
  somarDias,
  dataBr,
  dataBrCurta,
  reais,
} from '../data/ofertasApi';

// =============================================================================
// Ofertas no WhatsApp: monta a oferta, gera a imagem no padrão da loja e abre
// o WhatsApp pra escolher o grupo. Aberto pra todos os usuários.
// Ver ofertasApi.ts e cardOfertaJs.ts.
// =============================================================================

type Aba = 'ofertas' | 'sugestoes' | 'agenda' | 'resultados';
type Rascunho = Partial<Oferta> & { precoDeTexto?: string; precoPorTexto?: string };

const UNIDADES = [
  { k: 'un', r: 'Unidade' },
  { k: 'kg', r: 'Quilo' },
  { k: 'pct', r: 'Pacote' },
  { k: 'bdj', r: 'Bandeja' },
  { k: 'cx', r: 'Caixa' },
  { k: 'dz', r: 'Dúzia' },
];
const ORIGEM_ROTULO: Record<string, string> = { manual: 'Manual', giro: 'Giro', validade: 'Validade', jornal: 'Jornal' };

const numero = (t: string | undefined): number | null => {
  if (!t || !t.trim()) return null;
  const v = Number(t.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return isFinite(v) ? v : null;
};
const precoTexto = (v: number | null | undefined) => (v == null ? '' : v.toFixed(2).replace('.', ','));

function proximoDomingo(): string {
  const d = new Date();
  const faltam = (7 - d.getDay()) % 7 || 7;
  return somarDias(hojeIso(), faltam);
}
function horarioIso(diasAFrente: number, hora: number): string {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
}
const dataHoraBr = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function OfertasScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const quem = { nome: usuarioAtual?.nome ?? '', matricula: usuarioAtual?.matricula ? String(usuarioAtual.matricula) : null };
  const { width } = useWindowDimensions();

  const [aba, setAba] = useState<Aba>('ofertas');
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [verEncerradas, setVerEncerradas] = useState(false);

  // Editor
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [buscaProduto, setBuscaProduto] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState<ProdutoBusca[]>([]);
  const [buscandoProduto, setBuscandoProduto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [trabalhandoFoto, setTrabalhandoFoto] = useState(false);
  const [dataPersonalizada, setDataPersonalizada] = useState(false);

  // Sugestões
  const [tipoSugestao, setTipoSugestao] = useState<'giro' | 'validade'>('giro');
  const [sugestoes, setSugestoes] = useState<Record<string, Sugestao[] | null>>({ giro: null, validade: null });
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false);

  // Agenda
  const [agenda, setAgenda] = useState<AgendaOferta[] | null>(null);
  const [editAgenda, setEditAgenda] = useState<Partial<AgendaOferta> | null>(null);

  // Resultados
  const [resultados, setResultados] = useState<Record<string, ResultadoOferta | null | 'erro'>>({});

  // Prévia / envio
  const [previa, setPrevia] = useState<{ ofertas: Oferta[]; modo: 'unico' | 'lamina'; indice: number; titulo: string } | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [webPronta, setWebPronta] = useState(false);
  const [gerando, setGerando] = useState(false);
  const webRef = useRef<WebView>(null);

  // ---------------------------------------------------------------- carregar
  function carregar() {
    listarOfertas()
      .then(async (lista) => {
        setOfertas(lista);
        setErro(null);
        const f = await buscarFotos(lista.map((o) => o.codigo ?? '')).catch(() => ({}));
        setFotos((ant) => ({ ...ant, ...f }));
      })
      .catch((e) =>
        setErro(/ofertas|produto_fotos/.test(e?.message ?? '') ? 'A base das ofertas ainda não foi criada no Supabase (schema_ofertas_whatsapp.sql).' : e?.message ?? 'Não consegui carregar.'),
      )
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }
  useEffect(carregar, []);
  useEffect(() => {
    buscarLogo().then(setLogo);
  }, []);

  useEffect(() => {
    if (aba === 'sugestoes' && sugestoes[tipoSugestao] === null && !carregandoSugestoes) carregarSugestoes(tipoSugestao);
    if (aba === 'agenda' && agenda === null) listarAgenda().then(setAgenda).catch((e) => Alert.alert('Agenda', e?.message ?? ''));
    if (aba === 'resultados') carregarResultados();
  }, [aba, tipoSugestao]);

  async function carregarSugestoes(tipo: 'giro' | 'validade') {
    setCarregandoSugestoes(true);
    try {
      const lista = tipo === 'giro' ? await sugestoesDoGiro() : await sugestoesDaValidade();
      setSugestoes((s) => ({ ...s, [tipo]: lista }));
      const f = await buscarFotos(lista.map((x) => x.codigo ?? '')).catch(() => ({}));
      setFotos((ant) => ({ ...ant, ...f }));
    } catch (e: any) {
      Alert.alert('Sugestões', e?.message ?? 'Não consegui carregar.');
      setSugestoes((s) => ({ ...s, [tipo]: [] }));
    } finally {
      setCarregandoSugestoes(false);
    }
  }

  async function carregarResultados() {
    const enviadas = ofertas.filter((o) => o.enviadaEm && o.codigo && resultados[o.id] === undefined).slice(0, 40);
    for (const o of enviadas) {
      try {
        const r = await resultadoDaOferta(o);
        setResultados((ant) => ({ ...ant, [o.id]: r }));
      } catch {
        setResultados((ant) => ({ ...ant, [o.id]: 'erro' }));
      }
    }
  }

  const ativas = useMemo(() => ofertas.filter(ofertaAtiva), [ofertas]);
  const encerradas = useMemo(() => ofertas.filter((o) => !ofertaAtiva(o)), [ofertas]);
  const ofertaPorCodigo = useMemo(() => {
    const m: Record<string, Oferta> = {};
    ativas.forEach((o) => o.codigo && (m[o.codigo] = o));
    return m;
  }, [ativas]);

  // ---------------------------------------------------------------- editor
  function novaOferta(base?: Partial<Oferta>) {
    setRascunho({
      unidadeVenda: /\bKG\b/i.test(base?.produto ?? '') ? 'kg' : 'un',
      fim: somarDias(hojeIso(), 3),
      origem: 'manual',
      ...base,
      precoDeTexto: precoTexto(base?.precoDe ?? null),
      precoPorTexto: precoTexto(base?.precoPor ?? null),
    });
    setBuscaProduto('');
    setResultadosBusca([]);
    setDataPersonalizada(false);
  }

  function ofertaDaSugestao(s: Sugestao) {
    novaOferta({
      codigo: s.codigo,
      codigoBarras: s.codigoBarras,
      produto: s.produto,
      precoDe: s.preco,
      precoPor: s.precoSugerido ?? s.preco ?? undefined,
      origem: s.origem,
      fim: s.origem === 'validade' ? somarDias(hojeIso(), 2) : somarDias(hojeIso(), 7),
      observacao: s.motivo,
    });
  }

  useEffect(() => {
    if (!rascunho || rascunho.codigo || buscaProduto.trim().length < 2) {
      setResultadosBusca([]);
      return;
    }
    const t = setTimeout(() => {
      setBuscandoProduto(true);
      buscarProdutosParaOferta(buscaProduto)
        .then(setResultadosBusca)
        .catch(() => setResultadosBusca([]))
        .finally(() => setBuscandoProduto(false));
    }, 350);
    return () => clearTimeout(t);
  }, [buscaProduto, rascunho?.codigo]);

  function escolherProduto(p: ProdutoBusca) {
    if (!rascunho) return;
    setRascunho({
      ...rascunho,
      codigo: p.codigo,
      codigoBarras: p.codigoBarras,
      produto: p.produto,
      unidadeVenda: /\bKG\b/i.test(p.produto) ? 'kg' : rascunho.unidadeVenda,
      precoDeTexto: precoTexto(p.preco),
    });
    if (p.codigo) buscarFotos([p.codigo]).then((f) => setFotos((ant) => ({ ...ant, ...f }))).catch(() => {});
  }

  async function salvarRascunho(depois?: (o: Oferta) => void) {
    if (!rascunho) return;
    const precoPor = numero(rascunho.precoPorTexto);
    if (!rascunho.produto?.trim()) return Alert.alert('Produto', 'Escolha o produto (ou digite o nome).');
    if (!precoPor || precoPor <= 0) return Alert.alert('Preço', 'Informe o preço da oferta ("por").');
    const precoDe = numero(rascunho.precoDeTexto);
    if (precoDe != null && precoDe <= precoPor) return Alert.alert('Preço', 'O preço "de" precisa ser maior que o preço da oferta — ou deixe em branco.');
    setSalvando(true);
    try {
      const o = await salvarOferta({ ...rascunho, produto: rascunho.produto!, precoPor, precoDe }, quem);
      setRascunho(null);
      setOfertas((ant) => [o, ...ant.filter((x) => x.id !== o.id)]);
      if (aba !== 'ofertas') setAba('ofertas');
      depois?.(o);
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  function apagarOferta(o: Oferta) {
    Alert.alert('Excluir oferta?', o.produto, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () =>
          excluirOferta(o.id)
            .then(() => {
              setOfertas((ant) => ant.filter((x) => x.id !== o.id));
              setSelecionadas((s) => {
                const n = new Set(s);
                n.delete(o.id);
                return n;
              });
            })
            .catch((e) => Alert.alert('Erro', e?.message ?? '')),
      },
    ]);
  }

  // ---------------------------------------------------------------- fotos
  async function trocarFoto(alvo: { codigo: string | null; codigoBarras: string | null; produto: string }, origem: 'internet' | 'camera' | 'galeria') {
    if (!alvo.codigo) return Alert.alert('Foto', 'Escolha um produto cadastrado (com código) pra salvar a foto nele.');
    let uriOuUrl: string | null = null;
    try {
      setTrabalhandoFoto(true);
      if (origem === 'internet') {
        uriOuUrl = await procurarFotoNaInternet(alvo.codigoBarras);
        if (!uriOuUrl) {
          Alert.alert('Não achei na internet', 'Esse produto não tem foto na base pública. Tire uma foto pelo celular — fica salva pra próxima vez.');
          return;
        }
      } else {
        const perm = origem === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return Alert.alert('Sem permissão', 'Libere o acesso nas configurações do celular.');
        const opcoes: ImagePicker.ImagePickerOptions = { quality: 0.75, allowsEditing: true, aspect: [1, 1], mediaTypes: ImagePicker.MediaTypeOptions.Images };
        const r = origem === 'camera' ? await ImagePicker.launchCameraAsync(opcoes) : await ImagePicker.launchImageLibraryAsync(opcoes);
        if (r.canceled || !r.assets?.[0]) return;
        uriOuUrl = r.assets[0].uri;
      }
      const url = await salvarFotoProduto({ codigo: alvo.codigo, codigoBarras: alvo.codigoBarras, origem, uriOuUrl, por: quem.nome });
      setFotos((ant) => ({ ...ant, [alvo.codigo!]: url }));
    } catch (e: any) {
      Alert.alert('Foto', e?.message ?? 'Não consegui salvar a foto.');
    } finally {
      setTrabalhandoFoto(false);
    }
  }

  function menuFoto(alvo: { codigo: string | null; codigoBarras: string | null; produto: string }) {
    Alert.alert('Foto do produto', alvo.produto, [
      ...(alvo.codigoBarras ? [{ text: '🔎 Buscar na internet', onPress: () => trocarFoto(alvo, 'internet') }] : []),
      { text: '📷 Tirar foto', onPress: () => trocarFoto(alvo, 'camera') },
      { text: '🖼️ Escolher da galeria', onPress: () => trocarFoto(alvo, 'galeria') },
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  }

  // ---------------------------------------------------------------- prévia / envio
  function abrirPrevia(lista: Oferta[]) {
    if (!lista.length) return;
    setWebPronta(false);
    setPrevia({ ofertas: lista, modo: lista.length > 1 ? 'lamina' : 'unico', indice: 0, titulo: 'OFERTAS DO DIA' });
  }

  const ofertasDaImagem = (p: NonNullable<typeof previa>) =>
    p.modo === 'lamina' ? p.ofertas.slice(0, 6) : [p.ofertas[Math.min(p.indice, p.ofertas.length - 1)]];

  function dadosDoCard(p: NonNullable<typeof previa>) {
    const lista = ofertasDaImagem(p);
    return {
      modo: p.modo,
      titulo: p.titulo,
      logo,
      validade: textoValidadeCard(lista),
      ofertas: lista.map((o) => ({
        produto: o.produto,
        precoDe: o.precoDe,
        precoPor: o.precoPor,
        unidade: o.unidadeVenda,
        foto: o.codigo ? fotos[o.codigo] ?? null : null,
      })),
    };
  }

  function desenhar(exportar: boolean) {
    if (!previa || !webRef.current) return;
    webRef.current.injectJavaScript(`window.gerarCard(${JSON.stringify(dadosDoCard(previa))}, ${exportar}); true;`);
  }

  useEffect(() => {
    if (previa && webPronta) desenhar(false);
  }, [previa?.modo, previa?.indice, previa?.titulo, webPronta, logo]);

  async function aoMensagemWeb(ev: { nativeEvent: { data: string } }) {
    let m: any;
    try {
      m = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (m.tipo === 'carregado') setWebPronta(true);
    if (m.tipo === 'erro') {
      setGerando(false);
      Alert.alert('Não consegui gerar a imagem', m.mensagem);
    }
    if (m.tipo === 'png' && previa) {
      try {
        const FileSystem = await import('expo-file-system/legacy');
        const Sharing = await import('expo-sharing');
        const caminho = `${FileSystem.cacheDirectory}oferta_${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(caminho, m.base64, { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(caminho, { mimeType: 'image/jpeg', dialogTitle: 'Enviar oferta no WhatsApp', UTI: 'public.jpeg' });
        const enviadas = ofertasDaImagem(previa).filter((o) => !o.enviadaEm);
        await marcarOfertasEnviadas(enviadas.map((o) => o.id), quem.nome);
        const agora = new Date().toISOString();
        setOfertas((ant) => ant.map((o) => (enviadas.some((e) => e.id === o.id) ? { ...o, enviadaEm: agora, enviadaPor: quem.nome } : o)));
      } catch (e: any) {
        Alert.alert('Não consegui enviar', e?.message ?? 'Tente novamente.');
      } finally {
        setGerando(false);
      }
    }
  }

  async function enviarTexto() {
    if (!previa) return;
    const texto = textoWhatsApp(previa.modo === 'lamina' ? previa.ofertas : ofertasDaImagem(previa), previa.titulo);
    const url = `whatsapp://send?text=${encodeURIComponent(texto)}`;
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else await Share.share({ message: texto });
    } catch {
      await Share.share({ message: texto });
    }
  }

  // ---------------------------------------------------------------- render: blocos
  function Miniatura({ codigo, codigoBarras, produto, tamanho = 64 }: { codigo: string | null; codigoBarras: string | null; produto: string; tamanho?: number }) {
    const url = codigo ? fotos[codigo] : null;
    return (
      <TouchableOpacity onPress={() => menuFoto({ codigo, codigoBarras, produto })} style={[styles.mini, { width: tamanho, height: tamanho }]}>
        {url ? (
          <Image source={{ uri: url }} style={{ width: tamanho - 6, height: tamanho - 6 }} resizeMode="contain" />
        ) : (
          <>
            <Feather name="camera" size={18} color={colors.gray400} />
            <Text style={styles.miniTexto}>foto</Text>
          </>
        )}
      </TouchableOpacity>
    );
  }

  function CartaoOferta({ o }: { o: Oferta }) {
    const sel = selecionadas.has(o.id);
    return (
      <View style={[styles.card, sel && styles.cardSel]}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Miniatura codigo={o.codigo} codigoBarras={o.codigoBarras} produto={o.produto} />
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() =>
              setSelecionadas((s) => {
                const n = new Set(s);
                n.has(o.id) ? n.delete(o.id) : n.add(o.id);
                return n;
              })
            }
          >
            <Text style={styles.cardNome} numberOfLines={2}>
              {o.produto}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              {o.precoDe ? <Text style={styles.precoDe}>{reais(o.precoDe)}</Text> : null}
              <Text style={styles.precoPor}>
                {reais(o.precoPor)}
                {o.unidadeVenda === 'kg' ? '/kg' : ''}
              </Text>
            </View>
            <View style={styles.tags}>
              <Text style={styles.tag}>{ORIGEM_ROTULO[o.origem] ?? o.origem}</Text>
              {o.fim ? <Text style={styles.tag}>até {dataBrCurta(o.fim)}</Text> : null}
              {o.enviadaEm ? (
                <Text style={[styles.tag, styles.tagVerde]}>✓ enviada {dataBrCurta(o.enviadaEm)}</Text>
              ) : o.agendadaPara ? (
                <Text style={[styles.tag, styles.tagAmarela]}>⏰ {dataHoraBr(o.agendadaPara)}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              setSelecionadas((s) => {
                const n = new Set(s);
                n.has(o.id) ? n.delete(o.id) : n.add(o.id);
                return n;
              })
            }
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name={sel ? 'check-square' : 'square'} size={22} color={sel ? colors.navy700 : colors.gray400} />
          </TouchableOpacity>
        </View>
        <View style={styles.cardBotoes}>
          <TouchableOpacity style={styles.btnPrimario} onPress={() => abrirPrevia([o])}>
            <Feather name="send" size={13} color={colors.white} />
            <Text style={styles.btnPrimarioTexto}>Enviar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecundario} onPress={() => novaOferta(o)}>
            <Text style={styles.btnSecundarioTexto}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecundario} onPress={() => apagarOferta(o)}>
            <Feather name="trash-2" size={14} color={colors.red500} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------- render: abas
  function abaOfertas() {
    return (
      <>
        <TouchableOpacity style={styles.btnNova} onPress={() => novaOferta()}>
          <Feather name="plus" size={16} color={colors.white} />
          <Text style={styles.btnNovaTexto}>Nova oferta</Text>
        </TouchableOpacity>
        {ativas.length === 0 ? (
          <Text style={styles.vazio}>Nenhuma oferta ativa. Crie uma ou veja as Sugestões (produtos parados e perto de vencer).</Text>
        ) : (
          <>
            <Text style={styles.dica}>Marque várias ofertas para montar uma lâmina (até 6 por imagem).</Text>
            {ativas.map((o) => (
              <CartaoOferta key={o.id} o={o} />
            ))}
          </>
        )}
        {encerradas.length > 0 && (
          <TouchableOpacity onPress={() => setVerEncerradas((v) => !v)} style={{ marginTop: spacing.lg }}>
            <Text style={styles.link}>
              {verEncerradas ? '▾' : '▸'} Encerradas ({encerradas.length})
            </Text>
          </TouchableOpacity>
        )}
        {verEncerradas && encerradas.map((o) => <CartaoOferta key={o.id} o={o} />)}
      </>
    );
  }

  function abaSugestoes() {
    const lista = sugestoes[tipoSugestao];
    return (
      <>
        <View style={styles.segmento}>
          {(['giro', 'validade'] as const).map((t) => (
            <TouchableOpacity key={t} style={[styles.segItem, tipoSugestao === t && styles.segItemAtivo]} onPress={() => setTipoSugestao(t)}>
              <Text style={[styles.segTexto, tipoSugestao === t && styles.segTextoAtivo]}>
                {t === 'giro' ? '🐢 Parados (Giro)' : '⏳ Vencendo (Validade)'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.dica}>
          {tipoSugestao === 'giro'
            ? 'Produtos com estoque e 14+ dias sem venda, do maior valor parado pro menor. Preço sugerido: 15% abaixo, sem passar do custo + 5%.'
            : 'Produtos cadastrados na Validade que vencem nos próximos 10 dias. Desconto sugerido de 20% (30% se vence em até 3 dias).'}
        </Text>
        {carregandoSugestoes || lista === null ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : lista.length === 0 ? (
          <Text style={styles.vazio}>Nenhuma sugestão agora.</Text>
        ) : (
          lista.map((s, i) => {
            const jaTem = s.codigo ? ofertaPorCodigo[s.codigo] : undefined;
            return (
              <View key={(s.codigo ?? s.produto) + i} style={styles.card}>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <Miniatura codigo={s.codigo} codigoBarras={s.codigoBarras} produto={s.produto} tamanho={56} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardNome} numberOfLines={2}>
                      {s.produto}
                    </Text>
                    <Text style={styles.cardMeta}>{s.motivo}</Text>
                    <Text style={styles.cardMeta}>
                      Preço {reais(s.preco)}
                      {s.precoSugerido ? `  →  sugerido ${reais(s.precoSugerido)}` : ''}
                    </Text>
                  </View>
                </View>
                {jaTem ? (
                  <Text style={[styles.tag, styles.tagVerde, { alignSelf: 'flex-start', marginTop: spacing.sm }]}>Já em oferta por {reais(jaTem.precoPor)}</Text>
                ) : (
                  <TouchableOpacity style={[styles.btnPrimario, { alignSelf: 'flex-start', marginTop: spacing.md }]} onPress={() => ofertaDaSugestao(s)}>
                    <Feather name="plus" size={13} color={colors.white} />
                    <Text style={styles.btnPrimarioTexto}>Criar oferta</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
        {lista && lista.length > 0 ? (
          <TouchableOpacity onPress={() => carregarSugestoes(tipoSugestao)} style={{ marginTop: spacing.md }}>
            <Text style={styles.link}>↻ Atualizar sugestões</Text>
          </TouchableOpacity>
        ) : null}
      </>
    );
  }

  function abaAgenda() {
    return (
      <>
        <Text style={styles.dica}>
          Dias fixos de oferta no grupo. No dia e horário marcados, todo mundo recebe um aviso no celular para montar e enviar as ofertas.
        </Text>
        <TouchableOpacity style={styles.btnNova} onPress={() => setEditAgenda({ diaSemana: 2, hora: '09:00', titulo: '', ativo: true })}>
          <Feather name="plus" size={16} color={colors.white} />
          <Text style={styles.btnNovaTexto}>Novo dia de oferta</Text>
        </TouchableOpacity>
        {agenda === null ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : agenda.length === 0 ? (
          <Text style={styles.vazio}>Nenhum dia fixo ainda. Ex.: "Terça do FLV", "Quinta da Carne".</Text>
        ) : (
          agenda.map((a) => (
            <View key={a.id} style={[styles.card, !a.ativo && { opacity: 0.55 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={styles.diaBolha}>
                  <Text style={styles.diaBolhaTexto}>{DIAS_SEMANA[a.diaSemana].slice(0, 3)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardNome}>{a.titulo}</Text>
                  <Text style={styles.cardMeta}>
                    Toda {DIAS_SEMANA[a.diaSemana].toLowerCase()} às {a.hora}
                    {a.setor ? ` · ${a.setor}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setEditAgenda(a)}>
                  <Feather name="edit-2" size={17} color={colors.navy700} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </>
    );
  }

  async function salvarItemAgenda() {
    if (!editAgenda) return;
    if (!editAgenda.titulo?.trim()) return Alert.alert('Nome', 'Dê um nome, ex.: "Terça do FLV".');
    try {
      await salvarAgenda(editAgenda as any, quem.nome);
      setEditAgenda(null);
      setAgenda(await listarAgenda());
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    }
  }

  function abaResultados() {
    const enviadas = ofertas.filter((o) => o.enviadaEm);
    if (!enviadas.length) return <Text style={styles.vazio}>Assim que uma oferta for enviada no grupo, o resultado de venda aparece aqui.</Text>;
    return (
      <>
        <Text style={styles.dica}>
          Venda média por dia (R$) nos 14 dias antes do envio × do envio até o fim da oferta. Depende da última importação de vendas no Portal.
        </Text>
        {enviadas.map((o) => {
          const r = resultados[o.id];
          const v = r && r !== 'erro' ? r.variacaoPct : null;
          return (
            <View key={o.id} style={styles.card}>
              <Text style={styles.cardNome} numberOfLines={2}>
                {o.produto}
              </Text>
              <Text style={styles.cardMeta}>
                {reais(o.precoPor)} · enviada {dataBr(o.enviadaEm)}
                {o.enviadaPor ? ` por ${o.enviadaPor}` : ''}
              </Text>
              {!o.codigo ? (
                <Text style={styles.cardMeta}>Sem código interno — não dá pra medir.</Text>
              ) : r === undefined ? (
                <ActivityIndicator color={colors.navy700} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
              ) : r === 'erro' || r === null ? (
                <Text style={styles.cardMeta}>Não consegui calcular.</Text>
              ) : r.diasDepois === 0 || (r.ultimaData && r.ultimaData < o.enviadaEm!.slice(0, 10)) ? (
                <Text style={styles.cardMeta}>Aguardando importar as vendas depois do envio (última: {dataBr(r.ultimaData)}).</Text>
              ) : (
                <View style={styles.resultado}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resRotulo}>Antes</Text>
                    <Text style={styles.resValor}>{reais(r.mediaAntes)}/dia</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resRotulo}>Com a oferta ({r.diasDepois}d)</Text>
                    <Text style={styles.resValor}>{reais(r.mediaDepois)}/dia</Text>
                  </View>
                  <Text style={[styles.resPct, { color: v == null ? colors.gray600 : v >= 0 ? colors.green500 : colors.red500 }]}>
                    {v == null ? 'novo' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </>
    );
  }

  const abas: { k: Aba; r: string }[] = [
    { k: 'ofertas', r: 'Ofertas' },
    { k: 'sugestoes', r: 'Sugestões' },
    { k: 'agenda', r: 'Agenda' },
    { k: 'resultados', r: 'Resultado' },
  ];
  const selecionadasLista = ofertas.filter((o) => selecionadas.has(o.id));
  const larguraPrevia = Math.min(width - 40, 460);

  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo="Ofertas no WhatsApp" subtitulo="Monte a oferta e envie no grupo" icone="send" onVoltar={onVoltar}>
        <View style={styles.abas}>
          {abas.map((a) => (
            <TouchableOpacity key={a.k} style={[styles.aba, aba === a.k && styles.abaAtiva]} onPress={() => setAba(a.k)}>
              <Text style={[styles.abaTexto, aba === a.k && styles.abaTextoAtiva]}>{a.r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </CabecalhoTela>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              carregar();
              if (aba === 'sugestoes') carregarSugestoes(tipoSugestao);
            }}
          />
        }
      >
        {erro ? (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        ) : null}
        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : aba === 'ofertas' ? (
          abaOfertas()
        ) : aba === 'sugestoes' ? (
          abaSugestoes()
        ) : aba === 'agenda' ? (
          abaAgenda()
        ) : (
          abaResultados()
        )}
      </ScrollView>

      {aba === 'ofertas' && selecionadasLista.length > 0 && (
        <View style={styles.barraSel}>
          <TouchableOpacity onPress={() => setSelecionadas(new Set())}>
            <Text style={styles.barraLimpar}>Limpar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.barraBtn} onPress={() => abrirPrevia(selecionadasLista)}>
            <Feather name="image" size={16} color={colors.white} />
            <Text style={styles.barraBtnTexto}>
              Gerar card ({selecionadasLista.length} {selecionadasLista.length === 1 ? 'oferta' : 'ofertas'})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ----------------------------------------------------------- Editor */}
      <Modal visible={!!rascunho} transparent animationType="slide" onRequestClose={() => setRascunho(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalFundo}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setRascunho(null)} />
          <View style={styles.folha}>
            <View style={styles.folhaAlca} />
            {rascunho ? (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 640 }}>
                <Text style={styles.folhaTitulo}>{rascunho.id ? 'Editar oferta' : 'Nova oferta'}</Text>

                {rascunho.codigo || rascunho.id ? (
                  <View style={[styles.card, { backgroundColor: colors.gray50, marginTop: spacing.md }]}>
                    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                      <Miniatura codigo={rascunho.codigo ?? null} codigoBarras={rascunho.codigoBarras ?? null} produto={rascunho.produto ?? ''} tamanho={72} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardNome}>{rascunho.produto}</Text>
                        <Text style={styles.cardMeta}>
                          {rascunho.codigo ? `Cód. ${rascunho.codigo}` : 'Sem código'}
                          {rascunho.codigoBarras ? ` · ${rascunho.codigoBarras}` : ''}
                        </Text>
                        {trabalhandoFoto ? (
                          <Text style={styles.cardMeta}>Salvando foto…</Text>
                        ) : (
                          <Text style={styles.link} onPress={() => menuFoto({ codigo: rascunho.codigo ?? null, codigoBarras: rascunho.codigoBarras ?? null, produto: rascunho.produto ?? '' })}>
                            {rascunho.codigo && fotos[rascunho.codigo] ? 'Trocar foto' : '+ Adicionar foto'}
                          </Text>
                        )}
                      </View>
                      {!rascunho.id && (
                        <TouchableOpacity onPress={() => setRascunho({ ...rascunho, codigo: null, codigoBarras: null, produto: '' })}>
                          <Feather name="x" size={18} color={colors.gray400} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={styles.rotulo}>Produto</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Buscar por nome, código ou código de barras"
                      placeholderTextColor={colors.gray400}
                      value={buscaProduto}
                      onChangeText={(t) => {
                        setBuscaProduto(t);
                        setRascunho({ ...rascunho, produto: t });
                      }}
                      autoFocus
                    />
                    {buscandoProduto ? <ActivityIndicator color={colors.navy700} style={{ marginTop: 8 }} /> : null}
                    {resultadosBusca.map((p, i) => (
                      <TouchableOpacity key={(p.codigo ?? '') + i} style={styles.linhaBusca} onPress={() => escolherProduto(p)}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.linhaBuscaNome}>{p.produto}</Text>
                          <Text style={styles.cardMeta}>
                            {p.codigo ? `Cód. ${p.codigo}` : ''} {p.estoque != null ? `· estoque ${p.estoque.toLocaleString('pt-BR')}` : ''}
                          </Text>
                        </View>
                        <Text style={styles.linhaBuscaPreco}>{reais(p.preco)}</Text>
                      </TouchableOpacity>
                    ))}
                    {buscaProduto.trim().length >= 2 && !buscandoProduto && resultadosBusca.length === 0 ? (
                      <Text style={styles.dica}>Nada no estoque com esse nome — a oferta vai com o nome digitado (sem foto salva).</Text>
                    ) : null}
                  </>
                )}

                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rotulo}>De (opcional)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      placeholderTextColor={colors.gray400}
                      value={rascunho.precoDeTexto ?? ''}
                      onChangeText={(t) => setRascunho({ ...rascunho, precoDeTexto: t })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rotulo}>Por (oferta)</Text>
                    <TextInput
                      style={[styles.input, { borderColor: colors.red500, fontWeight: '800', color: colors.red500 }]}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      placeholderTextColor={colors.gray400}
                      value={rascunho.precoPorTexto ?? ''}
                      onChangeText={(t) => setRascunho({ ...rascunho, precoPorTexto: t })}
                    />
                  </View>
                </View>
                {rascunho.observacao && rascunho.origem !== 'manual' ? <Text style={styles.dica}>💡 {rascunho.observacao}</Text> : null}

                <Text style={styles.rotulo}>Vendido por</Text>
                <View style={styles.opcoesWrap}>
                  {UNIDADES.map((u) => (
                    <TouchableOpacity key={u.k} style={[styles.opcao, rascunho.unidadeVenda === u.k && styles.opcaoAtiva]} onPress={() => setRascunho({ ...rascunho, unidadeVenda: u.k })}>
                      <Text style={[styles.opcaoTexto, rascunho.unidadeVenda === u.k && styles.opcaoTextoAtivo]}>{u.r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.rotulo}>Válida até {rascunho.fim ? `· ${dataBr(rascunho.fim)}` : ''}</Text>
                <View style={styles.opcoesWrap}>
                  {[
                    { r: 'Hoje', v: hojeIso() },
                    { r: 'Amanhã', v: somarDias(hojeIso(), 1) },
                    { r: '3 dias', v: somarDias(hojeIso(), 3) },
                    { r: 'Domingo', v: proximoDomingo() },
                    { r: '7 dias', v: somarDias(hojeIso(), 7) },
                  ].map((op) => (
                    <TouchableOpacity
                      key={op.r}
                      style={[styles.opcao, !dataPersonalizada && rascunho.fim === op.v && styles.opcaoAtiva]}
                      onPress={() => {
                        setDataPersonalizada(false);
                        setRascunho({ ...rascunho, fim: op.v });
                      }}
                    >
                      <Text style={[styles.opcaoTexto, !dataPersonalizada && rascunho.fim === op.v && styles.opcaoTextoAtivo]}>{op.r}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.opcao, dataPersonalizada && styles.opcaoAtiva]} onPress={() => setDataPersonalizada(true)}>
                    <Text style={[styles.opcaoTexto, dataPersonalizada && styles.opcaoTextoAtivo]}>Outra data</Text>
                  </TouchableOpacity>
                </View>
                {dataPersonalizada ? (
                  <View style={{ marginTop: spacing.sm }}>
                    <SeletorDataValidade valor={rascunho.fim ?? hojeIso()} onSelecionar={(iso) => setRascunho({ ...rascunho, fim: iso })} />
                  </View>
                ) : null}

                <Text style={styles.rotulo}>Lembrar de postar</Text>
                <View style={styles.opcoesWrap}>
                  {[
                    { r: 'Não', v: null as string | null },
                    { r: 'Hoje 17h', v: horarioIso(0, 17) },
                    { r: 'Amanhã 8h', v: horarioIso(1, 8) },
                    { r: 'Amanhã 12h', v: horarioIso(1, 12) },
                    { r: 'Amanhã 17h', v: horarioIso(1, 17) },
                  ]
                    .filter((op) => !op.v || new Date(op.v).getTime() > Date.now())
                    .map((op) => {
                      const ativo = (rascunho.agendadaPara ?? null) === op.v || (!!op.v && !!rascunho.agendadaPara && Math.abs(new Date(rascunho.agendadaPara).getTime() - new Date(op.v).getTime()) < 60000);
                      return (
                        <TouchableOpacity key={op.r} style={[styles.opcao, ativo && styles.opcaoAtiva]} onPress={() => setRascunho({ ...rascunho, agendadaPara: op.v })}>
                          <Text style={[styles.opcaoTexto, ativo && styles.opcaoTextoAtivo]}>{op.r}</Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}>
                  <TouchableOpacity style={[styles.btnGrande, styles.btnGrandeSec, { flex: 1 }, salvando && { opacity: 0.6 }]} onPress={() => salvarRascunho()} disabled={salvando}>
                    <Text style={[styles.btnGrandeTexto, { color: colors.navy700 }]}>Salvar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnGrande, { flex: 1.4 }, salvando && { opacity: 0.6 }]} onPress={() => salvarRascunho((o) => abrirPrevia([o]))} disabled={salvando}>
                    <Text style={styles.btnGrandeTexto}>{salvando ? 'Salvando…' : 'Salvar e gerar card'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ----------------------------------------------------------- Agenda */}
      <Modal visible={!!editAgenda} transparent animationType="slide" onRequestClose={() => setEditAgenda(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalFundo}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setEditAgenda(null)} />
          <View style={styles.folha}>
            <View style={styles.folhaAlca} />
            {editAgenda ? (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 600 }}>
                <Text style={styles.folhaTitulo}>{editAgenda.id ? 'Editar dia de oferta' : 'Novo dia de oferta'}</Text>
                <Text style={styles.rotulo}>Nome</Text>
                <TextInput
                  style={styles.input}
                  placeholder='Ex.: "Terça do FLV"'
                  placeholderTextColor={colors.gray400}
                  value={editAgenda.titulo ?? ''}
                  onChangeText={(t) => setEditAgenda({ ...editAgenda, titulo: t })}
                />
                <Text style={styles.rotulo}>Dia da semana</Text>
                <View style={styles.opcoesWrap}>
                  {DIAS_SEMANA.map((d, i) => (
                    <TouchableOpacity key={d} style={[styles.opcao, editAgenda.diaSemana === i && styles.opcaoAtiva]} onPress={() => setEditAgenda({ ...editAgenda, diaSemana: i })}>
                      <Text style={[styles.opcaoTexto, editAgenda.diaSemana === i && styles.opcaoTextoAtivo]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.rotulo}>Horário do aviso</Text>
                <View style={styles.opcoesWrap}>
                  {['07:00', '08:00', '09:00', '11:00', '12:00', '15:00', '17:00', '18:00'].map((h) => (
                    <TouchableOpacity key={h} style={[styles.opcao, editAgenda.hora === h && styles.opcaoAtiva]} onPress={() => setEditAgenda({ ...editAgenda, hora: h })}>
                      <Text style={[styles.opcaoTexto, editAgenda.hora === h && styles.opcaoTextoAtivo]}>{h}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.rotulo}>Setor (opcional)</Text>
                <View style={styles.opcoesWrap}>
                  {[null, ...setores.filter((s) => ['acougue', 'flv', 'frios', 'padaria', 'mercearia'].includes(s.key)).map((s) => s.nome)].map((s) => (
                    <TouchableOpacity key={s ?? 'todos'} style={[styles.opcao, (editAgenda.setor ?? null) === s && styles.opcaoAtiva]} onPress={() => setEditAgenda({ ...editAgenda, setor: s })}>
                      <Text style={[styles.opcaoTexto, (editAgenda.setor ?? null) === s && styles.opcaoTextoAtivo]}>{s ?? 'Loja toda'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {editAgenda.id ? (
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
                    <TouchableOpacity style={styles.btnSecundario} onPress={() => setEditAgenda({ ...editAgenda, ativo: !editAgenda.ativo })}>
                      <Text style={styles.btnSecundarioTexto}>{editAgenda.ativo ? 'Pausar' : 'Reativar'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.btnSecundario}
                      onPress={() =>
                        excluirAgenda(editAgenda.id!)
                          .then(async () => {
                            setEditAgenda(null);
                            setAgenda(await listarAgenda());
                          })
                          .catch((e) => Alert.alert('Erro', e?.message ?? ''))
                      }
                    >
                      <Text style={[styles.btnSecundarioTexto, { color: colors.red500 }]}>Excluir</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <TouchableOpacity style={styles.btnGrande} onPress={salvarItemAgenda}>
                  <Text style={styles.btnGrandeTexto}>Salvar</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ----------------------------------------------------------- Prévia */}
      <Modal visible={!!previa} animationType="slide" onRequestClose={() => setPrevia(null)}>
        <View style={[styles.flex, { backgroundColor: colors.navy900 }]}>
          <View style={styles.previaTopo}>
            <TouchableOpacity onPress={() => setPrevia(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="x" size={20} color={colors.white} />
              <Text style={{ color: colors.white, fontWeight: '700' }}>Fechar</Text>
            </TouchableOpacity>
            <Text style={styles.previaTitulo}>Prévia do card</Text>
            <View style={{ width: 60 }} />
          </View>
          {previa ? (
            <ScrollView contentContainerStyle={{ alignItems: 'center', padding: spacing.lg, paddingBottom: 40 }}>
              {previa.ofertas.length > 1 && (
                <View style={[styles.segmento, { width: larguraPrevia, backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                  {(['lamina', 'unico'] as const).map((m) => (
                    <TouchableOpacity key={m} style={[styles.segItem, previa.modo === m && styles.segItemAtivo]} onPress={() => setPrevia({ ...previa, modo: m, indice: 0 })}>
                      <Text style={[styles.segTexto, { color: previa.modo === m ? colors.navy700 : colors.white }]}>
                        {m === 'lamina' ? `Lâmina (${Math.min(6, previa.ofertas.length)} juntas)` : 'Uma por imagem'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {previa.modo === 'lamina' && previa.ofertas.length > 1 ? (
                <TextInput
                  style={[styles.input, { width: larguraPrevia, marginBottom: spacing.md, backgroundColor: colors.white }]}
                  value={previa.titulo}
                  onChangeText={(t) => setPrevia({ ...previa, titulo: t })}
                  placeholder="Título da lâmina"
                />
              ) : null}
              <View style={{ width: larguraPrevia, height: larguraPrevia * (previa.modo === 'lamina' && previa.ofertas.length > 1 ? 1350 / 1080 : 1), borderRadius: 10, overflow: 'hidden', backgroundColor: '#E1EDF8' }}>
                <WebView
                  ref={webRef}
                  originWhitelist={['*']}
                  source={{ html: CARD_OFERTA_HTML }}
                  onMessage={aoMensagemWeb}
                  javaScriptEnabled
                  scrollEnabled={false}
                  style={{ backgroundColor: 'transparent' }}
                />
                {!webPronta ? <ActivityIndicator color={colors.navy700} style={StyleSheet.absoluteFill} /> : null}
              </View>
              {previa.modo === 'unico' && previa.ofertas.length > 1 ? (
                <View style={styles.navPrevia}>
                  <TouchableOpacity disabled={previa.indice === 0} onPress={() => setPrevia({ ...previa, indice: previa.indice - 1 })}>
                    <Feather name="chevron-left" size={26} color={previa.indice === 0 ? 'rgba(255,255,255,0.3)' : colors.white} />
                  </TouchableOpacity>
                  <Text style={{ color: colors.white, fontWeight: '700' }}>
                    {previa.indice + 1} de {previa.ofertas.length}
                  </Text>
                  <TouchableOpacity disabled={previa.indice >= previa.ofertas.length - 1} onPress={() => setPrevia({ ...previa, indice: previa.indice + 1 })}>
                    <Feather name="chevron-right" size={26} color={previa.indice >= previa.ofertas.length - 1 ? 'rgba(255,255,255,0.3)' : colors.white} />
                  </TouchableOpacity>
                </View>
              ) : null}
              {previa.ofertas.length > 6 && previa.modo === 'lamina' ? (
                <Text style={[styles.dica, { color: colors.gray100 }]}>A lâmina mostra as 6 primeiras. Use "Uma por imagem" para as demais.</Text>
              ) : null}
              {ofertasDaImagem(previa).some((o) => !o.codigo || !fotos[o.codigo]) ? (
                <Text style={[styles.dica, { color: colors.gray100, textAlign: 'center' }]}>
                  Produto sem foto aparece com a inicial. Feche e toque no quadrinho da foto para adicionar.
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.btnWhats, (!webPronta || gerando) && { opacity: 0.6 }]}
                disabled={!webPronta || gerando}
                onPress={() => {
                  setGerando(true);
                  desenhar(true);
                }}
              >
                <Feather name="share-2" size={18} color={colors.white} />
                <Text style={styles.btnWhatsTexto}>{gerando ? 'Gerando imagem…' : 'Enviar imagem no WhatsApp'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnTexto} onPress={enviarTexto}>
                <Feather name="message-circle" size={16} color={colors.white} />
                <Text style={styles.btnTextoTexto}>Enviar também a lista em texto</Text>
              </TouchableOpacity>
              <Text style={[styles.dica, { color: colors.gray100, textAlign: 'center', width: larguraPrevia }]}>
                Toque em "Enviar", escolha o WhatsApp e depois o grupo. A oferta fica marcada como enviada.
              </Text>
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  abas: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.full, padding: 3, marginTop: spacing.lg },
  aba: { flex: 1, paddingVertical: 8, borderRadius: radius.full, alignItems: 'center' },
  abaAtiva: { backgroundColor: colors.white },
  abaTexto: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 12 },
  abaTextoAtiva: { color: colors.navy700 },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12.5, lineHeight: 18 },
  btnNova: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.red500, borderRadius: radius.md, paddingVertical: 12, marginBottom: spacing.md },
  btnNovaTexto: { color: colors.white, fontWeight: '800', fontSize: 14 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1.5, borderColor: 'transparent' },
  cardSel: { borderColor: colors.navy700 },
  cardNome: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  cardMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 3, lineHeight: 16 },
  cardBotoes: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  precoDe: { fontSize: 12, color: colors.gray400, textDecorationLine: 'line-through' },
  precoPor: { fontSize: 17, fontWeight: '900', color: colors.red500 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  tag: { fontSize: 10.5, fontWeight: '700', color: colors.gray600, backgroundColor: colors.gray50, borderRadius: radius.full, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' },
  tagVerde: { color: colors.green500, backgroundColor: '#DFF3E9' },
  tagAmarela: { color: '#B4650E', backgroundColor: '#FBEBD4' },
  mini: { borderRadius: radius.md, backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  miniTexto: { fontSize: 9.5, color: colors.gray400, fontWeight: '700' },
  btnPrimario: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 14 },
  btnPrimarioTexto: { color: colors.white, fontWeight: '700', fontSize: 12.5 },
  btnSecundario: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12, justifyContent: 'center' },
  btnSecundarioTexto: { color: colors.navy700, fontWeight: '700', fontSize: 12.5 },
  vazio: { color: colors.gray600, fontSize: 13, textAlign: 'center', marginTop: spacing.xl, lineHeight: 19 },
  dica: { fontSize: 11.5, color: colors.gray400, marginTop: spacing.sm, marginBottom: spacing.sm, lineHeight: 16 },
  link: { color: colors.navy700, fontWeight: '700', fontSize: 12.5, marginTop: 4 },
  segmento: { flexDirection: 'row', backgroundColor: colors.gray100, borderRadius: radius.full, padding: 3, marginBottom: spacing.sm },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: radius.full, alignItems: 'center' },
  segItemAtivo: { backgroundColor: colors.white },
  segTexto: { fontSize: 12, fontWeight: '700', color: colors.gray600 },
  segTextoAtivo: { color: colors.navy700 },
  diaBolha: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' },
  diaBolhaTexto: { color: colors.white, fontWeight: '800', fontSize: 12.5 },
  resultado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.sm },
  resRotulo: { fontSize: 10.5, color: colors.gray400, fontWeight: '700' },
  resValor: { fontSize: 13, fontWeight: '800', color: colors.gray900, marginTop: 2 },
  resPct: { fontSize: 18, fontWeight: '900' },
  barraSel: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.sm, paddingLeft: spacing.lg, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 8 },
  barraLimpar: { color: colors.gray600, fontWeight: '700' },
  barraBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12 },
  barraBtnTexto: { color: colors.white, fontWeight: '800', fontSize: 13.5 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  folha: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: 36 },
  folhaAlca: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray100, alignSelf: 'center', marginBottom: spacing.md },
  folhaTitulo: { fontSize: 18, fontWeight: '800', color: colors.navy900 },
  rotulo: { fontSize: 11.5, fontWeight: '800', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: spacing.lg, marginBottom: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.gray900, backgroundColor: colors.gray50 },
  linhaBusca: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  linhaBuscaNome: { fontSize: 13, fontWeight: '700', color: colors.gray900 },
  linhaBuscaPreco: { fontSize: 13, fontWeight: '800', color: colors.navy700 },
  opcoesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  opcao: { borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white, borderRadius: radius.full, paddingVertical: 7, paddingHorizontal: 12 },
  opcaoAtiva: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  opcaoTexto: { fontSize: 12, fontWeight: '600', color: colors.gray900 },
  opcaoTextoAtivo: { color: colors.white },
  btnGrande: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xl },
  btnGrandeSec: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.navy700 },
  btnGrandeTexto: { color: colors.white, fontWeight: '800', fontSize: 14.5 },
  previaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  previaTitulo: { color: colors.white, fontWeight: '800', fontSize: 16 },
  navPrevia: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, marginTop: spacing.md },
  btnWhats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', borderRadius: radius.md, paddingVertical: 15, alignSelf: 'stretch', marginTop: spacing.xl },
  btnWhatsTexto: { color: colors.white, fontWeight: '900', fontSize: 15 },
  btnTexto: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: radius.md, paddingVertical: 12, alignSelf: 'stretch', marginTop: spacing.md },
  btnTextoTexto: { color: colors.white, fontWeight: '700', fontSize: 13.5 },
});
