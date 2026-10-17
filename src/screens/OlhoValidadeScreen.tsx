import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import CabecalhoTela from '../components/CabecalhoTela';
import LeitorCodigo from '../components/LeitorCodigo';
import SeletorDataValidade from '../components/SeletorDataValidade';
import { PadAssinatura, VisualAssinatura } from '../components/AssinaturaDedo';
import { useAuth } from '../context/AuthContext';
import { useTeclado } from '../lib/useTeclado';
import { colors, radius } from '../theme/colors';
import {
  AssinaturaOlho,
  buscarProdutoPorCodigo,
  CAIXAS_OLHO,
  cnpjFormatado,
  CupomQr,
  cupomDoQr,
  ItemOlho,
  listarOcorrenciasOlho,
  numeroDigitado,
  OcorrenciaOlho,
  PAPEIS_OLHO,
  PapelOlho,
  reais,
  salvarOcorrenciaOlho,
  SETORES_OLHO,
} from '../data/olhoValidadeApi';

// ============================================================================
// DE OLHO NA VALIDADE — cliente encontrou produto vencido e a loja registra.
// Um cupom pode ter vários produtos vencidos: cada um com validade
// (calendário), lote, foto, retirada da área de venda e blitz. A ocorrência
// guarda também o caixa que passou, "Por que aconteceu?" e 3 assinaturas.
// (Copiado do Prevenção SBH. Versão leve: o QR Code do cupom traz número,
// série, CNPJ e chave; o produto vem do código de barras + Estoque Loja.)
// ============================================================================

const AZUL = '#2F7BFF';
const NAVY = '#0E1B2C';
const VERDE = '#1E8E5A';
const VERMELHO = '#D93A2F';
const MAX_FOTOS = 3;

type Tela = { tipo: 'lista' } | { tipo: 'nova' } | { tipo: 'detalhe'; o: OcorrenciaOlho };

const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const diaBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const textoNum = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

export default function OlhoValidadeScreen({ onVoltar }: { onVoltar: () => void }) {
  const [tela, setTela] = useState<Tela>({ tipo: 'lista' });
  const [lista, setLista] = useState<OcorrenciaOlho[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setLista(await listarOcorrenciasOlho());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
      setLista((x) => x ?? []);
    } finally {
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tela.tipo === 'lista') onVoltar();
      else if (tela.tipo === 'nova') descartar();
      else setTela({ tipo: 'lista' });
      return true;
    });
    return () => sub.remove();
  }, [tela, onVoltar]);

  function descartar() {
    Alert.alert('Descartar ocorrência?', 'O que foi preenchido será perdido.', [
      { text: 'Continuar preenchendo', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => setTela({ tipo: 'lista' }) },
    ]);
  }

  if (tela.tipo === 'nova')
    return (
      <NovaOcorrencia
        onCancelar={descartar}
        onSalva={() => {
          setTela({ tipo: 'lista' });
          carregar();
        }}
      />
    );
  if (tela.tipo === 'detalhe') return <Detalhe o={tela.o} onVoltar={() => setTela({ tipo: 'lista' })} />;

  const agora = new Date();
  const doMes = (lista ?? []).filter((o) => {
    const d = new Date(o.criado_em);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  });
  const valorMes = doMes.reduce((a, o) => a + o.valor_total, 0);
  const naBlitz = doMes.reduce((a, o) => a + o.itens.filter((i) => i.estava_na_blitz).length, 0);

  return (
    <View style={st.flex}>
      <CabecalhoTela titulo="De olho na validade" subtitulo="Cliente encontrou produto vencido" icone="eye" onVoltar={onVoltar}>
        <View style={st.stats}>
          <Stat valor={String(doMes.length)} rotulo="no mês" />
          <Stat valor={reais(valorMes)} rotulo="retirado no mês" />
          <Stat valor={String(naBlitz)} rotulo="estavam na blitz" alerta={naBlitz > 0} />
        </View>
      </CabecalhoTela>
      <ScrollView
        style={st.flex}
        contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 10 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
        {erro ? <Text style={st.erro}>{erro}</Text> : null}
        <Text style={st.secao}>Ocorrências</Text>
        {!lista ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: 24 }} />
        ) : !lista.length ? (
          <View style={st.card}>
            <Text style={st.cardTitulo}>Nenhuma ocorrência registrada</Text>
            <Text style={st.cardSub}>Quando um cliente trouxer um produto vencido, toque em "Nova ocorrência".</Text>
          </View>
        ) : (
          lista.map((o) => {
            const primeiro = o.itens[0]?.descricao ?? 'Produto';
            const blitz = o.itens.some((i) => i.estava_na_blitz);
            return (
              <TouchableOpacity key={o.id} style={[st.card, st.linha]} onPress={() => setTela({ tipo: 'detalhe', o })} activeOpacity={0.8}>
                <View style={[st.bolha, { backgroundColor: '#FBE4E2' }]}>
                  <Feather name="alert-triangle" size={18} color={VERMELHO} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.itemNome} numberOfLines={2}>
                    {primeiro}
                    {o.itens.length > 1 ? ` + ${o.itens.length - 1}` : ''}
                  </Text>
                  <Text style={st.cardSub}>
                    {dataBR(o.criado_em)} · {o.setores.join(', ') || '—'}
                    {o.caixa_numero ? ` · caixa ${o.caixa_numero}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={st.valor}>{reais(o.valor_total)}</Text>
                  {blitz ? <Text style={[st.tag, { backgroundColor: '#FBE4E2', color: VERMELHO }]}>Na blitz</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
      <View style={st.rodape}>
        <TouchableOpacity style={st.botaoGrande} onPress={() => setTela({ tipo: 'nova' })} activeOpacity={0.85}>
          <Feather name="plus" size={18} color={colors.white} />
          <Text style={st.botaoGrandeTxt}>Nova ocorrência</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({ valor, rotulo, alerta }: { valor: string; rotulo: string; alerta?: boolean }) {
  return (
    <View style={st.stat}>
      <Text style={[st.statValor, alerta && { color: '#FF8A80' }]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
      <Text style={st.statRotulo}>{rotulo}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
function SimNao({ valor, onChange }: { valor: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[true, false].map((v) => (
        <Pressable
          key={String(v)}
          onPress={() => onChange(v)}
          style={[st.chip, { flex: 1, alignItems: 'center' }, valor === v && { backgroundColor: v ? VERDE : VERMELHO, borderColor: v ? VERDE : VERMELHO }]}
        >
          <Text style={[st.chipTxt, valor === v && { color: colors.white }]}>{v ? 'Sim' : 'Não'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Rotulo({ texto }: { texto: string }) {
  return <Text style={st.rotulo}>{texto}</Text>;
}

async function escolherFoto(origem: 'camera' | 'galeria'): Promise<string | null> {
  try {
    const perm = origem === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão', origem === 'camera' ? 'Libere a câmera para tirar a foto.' : 'Libere o acesso às fotos.');
      return null;
    }
    const r =
      origem === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.5 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    return !r.canceled && r.assets?.[0]?.uri ? r.assets[0].uri : null;
  } catch (e) {
    Alert.alert('Foto', (e as Error).message);
    return null;
  }
}

// Fotos com câmera/galeria; segurar a foto tira ela.
function Fotos({ fotos, onMudar, dica }: { fotos: string[]; onMudar: (f: string[]) => void; dica: string }) {
  async function adicionar(origem: 'camera' | 'galeria') {
    const uri = await escolherFoto(origem);
    if (uri) onMudar([...fotos, uri].slice(0, MAX_FOTOS));
  }
  return (
    <View style={{ gap: 10 }}>
      {fotos.length ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {fotos.map((f, i) => (
            <Pressable key={f} onLongPress={() => onMudar(fotos.filter((_, k) => k !== i))}>
              <Image source={{ uri: f }} style={st.foto} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={st.cardSub}>{dica}</Text>
      )}
      {fotos.length < MAX_FOTOS ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[st.botaoClaro, { flex: 1 }]} onPress={() => adicionar('camera')}>
            <Feather name="camera" size={16} color={colors.navy700} />
            <Text style={st.botaoClaroTxt}>Câmera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.botaoClaro, { flex: 1 }]} onPress={() => adicionar('galeria')}>
            <Feather name="image" size={16} color={colors.navy700} />
            <Text style={st.botaoClaroTxt}>Galeria</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {fotos.length ? <Text style={st.cardSub}>Segure a foto para tirar.</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Um produto vencido (o cupom pode ter vários)
type Rascunho = {
  descricao: string;
  codigo: string;
  unitario: string;
  validade: string; // AAAA-MM-DD
  lote: string;
  setor: string | null;
  retirado: boolean | null;
  qtd: string;
  valor: string;
  valorEditado: boolean;
  blitz: boolean | null;
  fotos: string[];
  doEstoque: boolean;
};

const RASCUNHO_VAZIO: Rascunho = {
  descricao: '',
  codigo: '',
  unitario: '',
  validade: '',
  lote: '',
  setor: null,
  retirado: null,
  qtd: '',
  valor: '',
  valorEditado: false,
  blitz: null,
  fotos: [],
  doEstoque: false,
};

const rascunhoDoItem = (i: ItemOlho): Rascunho => ({
  descricao: i.descricao,
  codigo: i.codigo ?? '',
  unitario: textoNum(i.valor_unitario),
  validade: i.data_validade ?? '',
  lote: i.lote ?? '',
  setor: i.setor,
  retirado: i.restante_retirado,
  qtd: textoNum(i.qtd_encontrada),
  valor: textoNum(i.valor_retirado),
  valorEditado: true,
  blitz: i.estava_na_blitz,
  fotos: i.fotos,
  doEstoque: false,
});

function faltasDoRascunho(r: Rascunho): string[] {
  const f: string[] = [];
  if (!r.descricao.trim()) f.push('produto');
  if (!r.setor) f.push('setor');
  if (!r.validade) f.push('data de validade');
  if (r.retirado == null) f.push('restante retirado');
  if (numeroDigitado(r.qtd) == null) f.push('quantidade');
  if (numeroDigitado(r.valor) == null) f.push('valor retirado');
  if (r.blitz == null) f.push('blitz');
  if (!r.fotos.length) f.push('foto do produto');
  return f;
}

function EditorItem({
  inicial,
  numero,
  onSalvar,
  onCancelar,
  podeCancelar,
}: {
  inicial: Rascunho;
  numero: number;
  onSalvar: (i: ItemOlho) => void;
  onCancelar: () => void;
  podeCancelar: boolean;
}) {
  const [r, setR] = useState<Rascunho>(inicial);
  const [lendo, setLendo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const mudar = (p: Partial<Rascunho>) => setR((x) => ({ ...x, ...p }));

  // valor retirado = quantidade encontrada × valor unitário (pode ser corrigido)
  useEffect(() => {
    if (r.valorEditado) return;
    const q = numeroDigitado(r.qtd);
    const u = numeroDigitado(r.unitario);
    const v = q != null && u != null ? textoNum(Math.round(q * u * 100) / 100) : '';
    setR((x) => (x.valor === v ? x : { ...x, valor: v }));
  }, [r.qtd, r.unitario, r.valorEditado]);

  async function aplicarCodigo(texto: string) {
    mudar({ codigo: texto });
    setBuscando(true);
    try {
      const p = await buscarProdutoPorCodigo(texto);
      if (!p) {
        mudar({ doEstoque: false });
        Alert.alert('Produto não encontrado', 'Esse código não está no Estoque Loja. Digite a descrição e o valor à mão.');
        return;
      }
      setR((x) => ({
        ...x,
        descricao: p.descricao,
        unitario: p.precoVenda != null ? textoNum(p.precoVenda) : x.unitario,
        setor: p.setor ?? x.setor,
        doEstoque: true,
      }));
    } finally {
      setBuscando(false);
    }
  }

  const faltas = faltasDoRascunho(r);

  function confirmar() {
    if (faltas.length) {
      Alert.alert('Falta preencher', faltas.join(', '));
      return;
    }
    onSalvar({
      descricao: r.descricao.trim(),
      codigo: r.codigo.trim() || null,
      setor: r.setor!,
      valor_unitario: numeroDigitado(r.unitario),
      data_validade: r.validade,
      lote: r.lote.trim() || null,
      qtd_encontrada: numeroDigitado(r.qtd) ?? 0,
      valor_retirado: numeroDigitado(r.valor) ?? 0,
      restante_retirado: !!r.retirado,
      estava_na_blitz: !!r.blitz,
      fotos: r.fotos,
    });
  }

  return (
    <View style={[st.card, { gap: 10, borderWidth: 1.5, borderColor: '#C9D8FF' }]}>
      <Text style={st.cardTitulo}>Produto {numero}</Text>
      <TouchableOpacity style={st.botaoClaro} onPress={() => setLendo(true)} disabled={buscando}>
        {buscando ? <ActivityIndicator color={colors.navy700} /> : <Feather name="camera" size={16} color={colors.navy700} />}
        <Text style={st.botaoClaroTxt}>Ler código de barras do produto</Text>
      </TouchableOpacity>
      {r.doEstoque ? <Text style={[st.cardSub, { color: VERDE }]}>✓ Preenchido pelo Estoque Loja (preço oficial da loja)</Text> : null}

      <Rotulo texto="Produto" />
      <TextInput style={st.input} value={r.descricao} onChangeText={(t) => mudar({ descricao: t })} placeholder="Descrição do produto" placeholderTextColor={colors.gray400} />

      <Rotulo texto="Código (opcional)" />
      <TextInput
        style={st.input}
        value={r.codigo}
        onChangeText={(t) => mudar({ codigo: t })}
        onBlur={() => { if (r.codigo.trim().length >= 8 && !r.doEstoque) aplicarCodigo(r.codigo.trim()); }}
        onSubmitEditing={() => { if (r.codigo.trim().length >= 8) aplicarCodigo(r.codigo.trim()); }}
        returnKeyType="search"
        keyboardType="number-pad"
        placeholder="Código de barras"
        placeholderTextColor={colors.gray400}
      />

      <Rotulo texto="Data de validade" />
      <SeletorDataValidade valor={r.validade} onSelecionar={(iso) => mudar({ validade: iso })} />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Rotulo texto="Lote" />
          <TextInput style={st.input} value={r.lote} onChangeText={(t) => mudar({ lote: t })} autoCapitalize="characters" placeholder="ex.: L2409A" placeholderTextColor={colors.gray400} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Rotulo texto="Valor unitário (R$)" />
          <TextInput style={st.input} value={r.unitario} onChangeText={(t) => mudar({ unitario: t })} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={colors.gray400} />
        </View>
      </View>

      <Rotulo texto="Setor" />
      <View style={st.chips}>
        {SETORES_OLHO.map((x) => (
          <Pressable key={x} onPress={() => mudar({ setor: x })} style={[st.chip, r.setor === x && st.chipOn]}>
            <Text style={[st.chipTxt, r.setor === x && { color: colors.white }]}>{x}</Text>
          </Pressable>
        ))}
      </View>

      <Rotulo texto="O restante da mercadoria foi retirado da área de venda?" />
      <SimNao valor={r.retirado} onChange={(v) => mudar({ retirado: v })} />
      <Rotulo texto="Quantidade encontrada na área de venda" />
      <TextInput style={st.input} value={r.qtd} onChangeText={(t) => mudar({ qtd: t })} keyboardType="decimal-pad" placeholder="ex.: 6" placeholderTextColor={colors.gray400} />
      <Rotulo texto="Valor de tudo que foi retirado (R$)" />
      <TextInput
        style={st.input}
        value={r.valor}
        onChangeText={(t) => mudar({ valor: t, valorEditado: true })}
        keyboardType="decimal-pad"
        placeholder="0,00"
        placeholderTextColor={colors.gray400}
      />
      {!r.valorEditado ? <Text style={st.cardSub}>Calculado: quantidade × valor unitário. Pode corrigir.</Text> : null}
      <Rotulo texto="O produto estava na blitz de validade?" />
      <SimNao valor={r.blitz} onChange={(v) => mudar({ blitz: v })} />

      <Rotulo texto="Foto do produto (pelo menos 1)" />
      <Fotos fotos={r.fotos} onMudar={(f) => mudar({ fotos: f })} dica="Fotografe o produto mostrando a data de validade e o lote." />

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        {podeCancelar ? (
          <TouchableOpacity style={[st.botaoClaro, { flex: 1 }]} onPress={onCancelar}>
            <Text style={st.botaoClaroTxt}>Cancelar</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={[st.botaoAzul, { flex: 2, backgroundColor: faltas.length ? '#9AA6BA' : AZUL }]} onPress={confirmar}>
          <Feather name="check" size={18} color={colors.white} />
          <Text style={st.botaoAzulTxt}>Salvar produto</Text>
        </TouchableOpacity>
      </View>

      <LeitorCodigo visivel={lendo} modo="barras" onLido={(t) => { setLendo(false); aplicarCodigo(t); }} onCancelar={() => setLendo(false)} />
    </View>
  );
}

function ResumoItem({ i, numero, onEditar, onRemover }: { i: ItemOlho; numero: number; onEditar?: () => void; onRemover?: () => void }) {
  return (
    <View style={[st.card, { gap: 8 }]}>
      <View style={st.linha}>
        {i.fotos[0] ? <Image source={{ uri: i.fotos[0] }} style={st.fotoMini} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={st.itemNome} numberOfLines={2}>
            {numero}. {i.descricao}
          </Text>
          <Text style={st.cardSub}>
            {i.setor} · validade {diaBR(i.data_validade)}
            {i.lote ? ` · lote ${i.lote}` : ''}
          </Text>
          <Text style={st.cardSub}>
            {textoNum(i.qtd_encontrada)} un. · {reais(i.valor_retirado)} · retirado: {i.restante_retirado ? 'sim' : 'não'} · blitz: {i.estava_na_blitz ? 'sim' : 'não'}
          </Text>
        </View>
      </View>
      {onEditar || onRemover ? (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {onEditar ? (
            <Pressable onPress={onEditar}>
              <Text style={st.link}>Editar</Text>
            </Pressable>
          ) : null}
          {onRemover ? (
            <Pressable onPress={onRemover}>
              <Text style={[st.link, { color: VERMELHO }]}>Remover</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
function NovaOcorrencia({ onCancelar, onSalva }: { onCancelar: () => void; onSalva: () => void }) {
  const { usuarioAtual } = useAuth();
  const teclado = useTeclado();
  const [lendoQr, setLendoQr] = useState(false);
  const [cupom, setCupom] = useState<CupomQr | null>(null);
  const [semCupom, setSemCupom] = useState(false);
  const [caixa, setCaixa] = useState<string | null>(null);
  const [caixaOutro, setCaixaOutro] = useState(false);

  const [itens, setItens] = useState<ItemOlho[]>([]);
  // índice do produto em edição: itens.length = produto novo; null = nenhum
  const [editando, setEditando] = useState<number | null>(0);

  const [motivo, setMotivo] = useState('');

  const [nomes, setNomes] = useState<Record<PapelOlho, string>>({ registrou: usuarioAtual?.nome ?? '', gerente: '', responsavel_setor: '' });
  const [assinaturas, setAssinaturas] = useState<Partial<Record<PapelOlho, AssinaturaOlho>>>({});
  const [assinando, setAssinando] = useState<PapelOlho | null>(null);
  const [salvando, setSalvando] = useState(false);

  function aoLerQr(texto: string) {
    setLendoQr(false);
    const c = cupomDoQr(texto);
    if (!c.chave) {
      Alert.alert('QR Code não reconhecido', 'Esse QR Code não parece ser de um cupom fiscal. Tente de novo ou marque "cliente sem cupom".');
      return;
    }
    setCupom(c);
    setSemCupom(false);
  }

  function salvarItem(i: ItemOlho) {
    setItens((x) => {
      if (editando == null || editando >= x.length) return [...x, i];
      return x.map((y, k) => (k === editando ? i : y));
    });
    setEditando(null);
  }

  function removerItem(k: number) {
    Alert.alert('Remover produto?', itens[k]?.descricao ?? '', [
      { text: 'Manter', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => setItens((x) => x.filter((_, j) => j !== k)) },
    ]);
  }

  const setoresItens = Array.from(new Set(itens.map((i) => i.setor)));
  const valorTotal = itens.reduce((a, i) => a + i.valor_retirado, 0);

  const faltas: string[] = [];
  if (!cupom && !semCupom) faltas.push('cupom');
  if (!caixa) faltas.push('caixa');
  if (!itens.length) faltas.push('produto');
  if (editando != null) faltas.push('salvar o produto aberto');
  if (motivo.trim().length < 3) faltas.push('por que aconteceu');
  const faltamAss = PAPEIS_OLHO.filter((p) => !assinaturas[p.papel] || !nomes[p.papel].trim());
  if (faltamAss.length) faltas.push(`${faltamAss.length} assinatura(s)`);

  async function salvar() {
    if (faltas.length || salvando) return;
    setSalvando(true);
    try {
      await salvarOcorrenciaOlho({
        matricula: String(usuarioAtual?.matricula ?? ''),
        nome: usuarioAtual?.nome ?? '',
        cupom,
        caixa,
        itens,
        motivo,
        assinaturas: PAPEIS_OLHO.map((p) => ({ ...assinaturas[p.papel]!, nome: nomes[p.papel].trim() })),
      });
      Alert.alert('Ocorrência registrada', 'Já aparece no painel do portal e os administradores foram avisados.');
      onSalva();
    } catch (e) {
      Alert.alert('Não foi possível salvar', `${(e as Error).message}\n\nConfira a internet e tente de novo; nada foi perdido nesta tela.`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={st.flex}>
      <CabecalhoTela titulo="Nova ocorrência" subtitulo="De olho na validade" icone="eye" onVoltar={onCancelar} />
      <ScrollView
        ref={teclado.scrollRef}
        style={st.flex}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 120 + teclado.espacoExtra, gap: 10 }}
      >
        {/* 1. Cupom e caixa */}
        <Text style={st.secao}>1. Cupom fiscal e caixa</Text>
        <View style={[st.card, { gap: 12 }]}>
          {cupom ? (
            <>
              <View style={st.linha}>
                <View style={[st.bolha, { backgroundColor: '#DCF2E7' }]}>
                  <Feather name="file-text" size={18} color={VERDE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.cardTitulo}>Cupom nº {cupom.numero ?? '—'} · série {cupom.serie ?? '—'}</Text>
                  <Text style={st.cardSub}>
                    {cupom.emissao ? dataBR(cupom.emissao) : `emitido em ${cupom.anoMes?.split('-').reverse().join('/') ?? '—'}`}
                    {cupom.total != null ? ` · total ${reais(cupom.total)}` : ''}
                  </Text>
                  <Text style={st.cardSub}>CNPJ {cnpjFormatado(cupom.cnpj)}</Text>
                </View>
              </View>
              <TouchableOpacity style={st.botaoClaro} onPress={() => setLendoQr(true)}>
                <Feather name="maximize" size={16} color={colors.navy700} />
                <Text style={st.botaoClaroTxt}>Ler outro QR Code</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={st.botaoAzul} onPress={() => setLendoQr(true)}>
                <Feather name="maximize" size={18} color={colors.white} />
                <Text style={st.botaoAzulTxt}>Ler QR Code do cupom</Text>
              </TouchableOpacity>
              <Text style={st.cardSub}>Guarda o número, a série, o CNPJ e a chave do cupom.</Text>
              <Pressable onPress={() => setSemCupom((x) => !x)}>
                <Text style={st.link}>{semCupom ? '✓ Cliente sem cupom' : 'Cliente sem cupom? Toque aqui'}</Text>
              </Pressable>
            </>
          )}
          <Rotulo texto="Número do caixa que passou" />
          <View style={st.chips}>
            {CAIXAS_OLHO.map((c) => (
              <Pressable key={c} onPress={() => { setCaixa(c); setCaixaOutro(false); }} style={[st.chipCaixa, caixa === c && !caixaOutro && st.chipOn]}>
                <Text style={[st.chipTxt, caixa === c && !caixaOutro && { color: colors.white }]}>{c}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => { setCaixaOutro(true); setCaixa(null); }} style={[st.chip, caixaOutro && st.chipOn]}>
              <Text style={[st.chipTxt, caixaOutro && { color: colors.white }]}>Outro</Text>
            </Pressable>
          </View>
          {caixaOutro ? (
            <TextInput
              style={st.input}
              value={caixa ?? ''}
              onChangeText={(t) => setCaixa(t.replace(/\D/g, '').slice(0, 3) || null)}
              keyboardType="number-pad"
              placeholder="Número do caixa"
              placeholderTextColor={colors.gray400}
            />
          ) : null}
        </View>

        {/* 2. Produtos */}
        <Text style={st.secao}>2. Produtos vencidos ({itens.length})</Text>
        {itens.map((i, k) =>
          editando === k ? (
            <EditorItem
              key={`ed-${k}`}
              inicial={rascunhoDoItem(i)}
              numero={k + 1}
              onSalvar={salvarItem}
              onCancelar={() => setEditando(null)}
              podeCancelar
            />
          ) : (
            <ResumoItem
              key={`it-${k}`}
              i={i}
              numero={k + 1}
              onEditar={editando == null ? () => setEditando(k) : undefined}
              onRemover={editando == null ? () => removerItem(k) : undefined}
            />
          ),
        )}
        {editando != null && editando >= itens.length ? (
          <EditorItem
            key={`novo-${itens.length}`}
            inicial={RASCUNHO_VAZIO}
            numero={itens.length + 1}
            onSalvar={salvarItem}
            onCancelar={() => setEditando(null)}
            podeCancelar={itens.length > 0}
          />
        ) : null}
        {editando == null ? (
          <TouchableOpacity style={st.botaoClaro} onPress={() => setEditando(itens.length)}>
            <Feather name="plus" size={16} color={colors.navy700} />
            <Text style={st.botaoClaroTxt}>{itens.length ? 'Adicionar outro produto deste cupom' : 'Adicionar produto'}</Text>
          </TouchableOpacity>
        ) : null}
        {itens.length > 1 ? <Text style={[st.cardSub, { marginLeft: 4 }]}>Total retirado: {reais(valorTotal)}</Text> : null}

        {/* 3. Por que aconteceu */}
        <Text style={st.secao}>3. Por que aconteceu?</Text>
        <View style={[st.card, { gap: 10 }]}>
          <TextInput
            style={[st.input, { minHeight: 90, textAlignVertical: 'top' }]}
            value={motivo}
            onChangeText={setMotivo}
            multiline
            placeholder="Ex.: produto ficou no fundo da gôndola e não entrou na blitz da semana"
            placeholderTextColor={colors.gray400}
          />
        </View>

        {/* 4. Assinaturas */}
        <Text style={st.secao}>4. Assinaturas</Text>
        {PAPEIS_OLHO.map((p) => {
          const a = assinaturas[p.papel];
          const ok = !!a && !!nomes[p.papel].trim();
          return (
            <View key={p.papel} style={[st.card, { gap: 10 }, ok && { borderWidth: 1.5, borderColor: '#BFE5CF' }]}>
              <View style={st.linha}>
                <View style={[st.bolha, { backgroundColor: '#E3E7F5', width: 34, height: 34 }]}>
                  <Feather name="user" size={16} color={colors.navy700} />
                </View>
                <Text style={[st.cardTitulo, { flex: 1 }]}>
                  {p.titulo}
                  {p.papel === 'responsavel_setor' && setoresItens.length ? ` · ${setoresItens.join(', ')}` : ''}
                </Text>
                {ok ? <Feather name="check-circle" size={20} color={VERDE} /> : null}
              </View>
              <TextInput
                style={st.input}
                placeholder="Nome de quem assina"
                placeholderTextColor={colors.gray400}
                value={nomes[p.papel]}
                onChangeText={(t) => setNomes((x) => ({ ...x, [p.papel]: t }))}
                onFocus={p.papel === 'responsavel_setor' ? teclado.focarNoFim : undefined}
                autoCapitalize="words"
              />
              {a ? (
                <Pressable onPress={() => setAssinando(p.papel)}>
                  <VisualAssinatura desenho={a} />
                  <Text style={[st.link, { marginTop: 6 }]}>Refazer assinatura</Text>
                </Pressable>
              ) : (
                <TouchableOpacity
                  style={st.botaoClaro}
                  onPress={() =>
                    nomes[p.papel].trim() ? setAssinando(p.papel) : Alert.alert('Falta o nome', `Escreva o nome de quem vai assinar (${p.titulo}).`)
                  }
                >
                  <Feather name="edit-3" size={16} color={colors.navy700} />
                  <Text style={st.botaoClaroTxt}>Assinar</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={st.rodape}>
        <TouchableOpacity
          style={[st.botaoGrande, { backgroundColor: faltas.length ? '#9AA6BA' : VERDE }]}
          onPress={salvar}
          disabled={faltas.length > 0 || salvando}
          activeOpacity={0.85}
        >
          {salvando ? <ActivityIndicator color={colors.white} /> : <Feather name={faltas.length ? 'alert-circle' : 'check-circle'} size={18} color={colors.white} />}
          <Text style={st.botaoGrandeTxt} numberOfLines={1}>
            {faltas.length ? `Falta: ${faltas.slice(0, 2).join(', ')}${faltas.length > 2 ? '…' : ''}` : 'Salvar ocorrência'}
          </Text>
        </TouchableOpacity>
      </View>

      <LeitorCodigo visivel={lendoQr} modo="qr" onLido={aoLerQr} onCancelar={() => setLendoQr(false)} />
      <PadAssinatura
        visivel={!!assinando}
        titulo={assinando ? `Assinatura · ${PAPEIS_OLHO.find((p) => p.papel === assinando)!.titulo}` : ''}
        subtitulo={assinando ? nomes[assinando] : ''}
        onCancelar={() => setAssinando(null)}
        onSalvar={(d) => {
          if (assinando)
            setAssinaturas((x) => ({ ...x, [assinando]: { ...d, papel: assinando, nome: nomes[assinando].trim(), assinada_em: new Date().toISOString() } }));
          setAssinando(null);
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
function Detalhe({ o, onVoltar }: { o: OcorrenciaOlho; onVoltar: () => void }) {
  const linhas: [string, string][] = [
    ['Cupom', o.cupom_numero ? `nº ${o.cupom_numero}${o.cupom_serie ? ` · série ${o.cupom_serie}` : ''}${o.cupom_total != null ? ` · ${reais(o.cupom_total)}` : ''}` : 'Sem cupom'],
    ['Caixa', o.caixa_numero ?? '—'],
    ['Produtos', String(o.itens.length)],
    ['Valor retirado', reais(o.valor_total)],
    ['Registrado por', `${o.registrado_por_nome ?? '—'} · ${new Date(o.criado_em).toLocaleString('pt-BR')}`],
  ];
  const titulo = o.itens[0]?.descricao ?? 'Ocorrência';
  return (
    <View style={st.flex}>
      <CabecalhoTela titulo={titulo} subtitulo="De olho na validade" icone="eye" onVoltar={onVoltar} />
      <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        <View style={[st.card, { gap: 10 }]}>
          {linhas.map(([r, v]) => (
            <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={[st.cardSub, { flex: 1, marginTop: 0 }]}>{r}</Text>
              <Text style={[st.cardTitulo, { fontSize: 13.5, flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={st.secao}>Por que aconteceu?</Text>
        <View style={st.card}>
          <Text style={[st.cardTitulo, { fontWeight: '500', fontSize: 14 }]}>{o.motivo}</Text>
        </View>

        <Text style={st.secao}>Produtos</Text>
        {o.itens.map((i, k) => (
          <View key={k} style={{ gap: 8 }}>
            <ResumoItem i={i} numero={k + 1} />
            {i.fotos.length ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {i.fotos.map((f) => (
                  <Image key={f} source={{ uri: f }} style={st.foto} />
                ))}
              </View>
            ) : null}
          </View>
        ))}

        <Text style={st.secao}>Assinaturas</Text>
        {o.assinaturas.map((a) => (
          <View key={a.papel} style={[st.card, { gap: 6 }]}>
            <Text style={st.cardTitulo}>{a.nome}</Text>
            <Text style={[st.cardSub, { marginTop: 0 }]}>{PAPEIS_OLHO.find((p) => p.papel === a.papel)?.titulo}</Text>
            <VisualAssinatura desenho={a} altura={70} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F3F5F9' },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 14, shadowColor: NAVY, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bolha: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: NAVY },
  cardSub: { fontSize: 12.5, color: '#5B6577', marginTop: 2 },
  itemNome: { fontSize: 14, fontWeight: '700', color: NAVY },
  valor: { fontSize: 14, fontWeight: '800', color: NAVY },
  tag: { fontSize: 11, fontWeight: '700', paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.full, overflow: 'hidden' },
  secao: { fontSize: 12.5, fontWeight: '800', color: '#5B6577', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6, marginLeft: 4 },
  erro: { color: '#B5520E', fontSize: 13, backgroundColor: '#FFF1E0', padding: 12, borderRadius: 12 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 14 },
  stat: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8 },
  statValor: { color: colors.white, fontSize: 17, fontWeight: '800' },
  statRotulo: { color: '#B9C3D3', fontSize: 11, marginTop: 2 },
  rotulo: { fontSize: 12.5, fontWeight: '700', color: colors.navy700 },
  input: { borderWidth: 1, borderColor: '#D5DBE5', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: NAVY, backgroundColor: colors.white },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1.5, borderColor: '#E1E6EE' },
  chipCaixa: { width: 44, paddingVertical: 8, alignItems: 'center', borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1.5, borderColor: '#E1E6EE' },
  chipOn: { backgroundColor: NAVY, borderColor: NAVY },
  chipTxt: { fontSize: 13, fontWeight: '700', color: '#3A4558' },
  foto: { width: 96, height: 96, borderRadius: 12, backgroundColor: '#E1E6EE' },
  fotoMini: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#E1E6EE' },
  link: { color: AZUL, fontWeight: '700', fontSize: 13.5 },
  botaoAzul: { backgroundColor: AZUL, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  botaoAzulTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },
  botaoClaro: { backgroundColor: '#E3E7F5', borderRadius: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  botaoClaroTxt: { color: colors.navy700, fontWeight: '700', fontSize: 14 },
  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: 24, backgroundColor: 'rgba(243,245,249,0.96)' },
  botaoGrande: { backgroundColor: AZUL, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  botaoGrandeTxt: { color: colors.white, fontWeight: '800', fontSize: 15, flexShrink: 1 },
});
