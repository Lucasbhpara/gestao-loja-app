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
import { PadAssinatura, VisualAssinatura } from '../components/AssinaturaDedo';
import { useAuth } from '../context/AuthContext';
import { useTeclado } from '../lib/useTeclado';
import { colors, radius } from '../theme/colors';
import {
  AssinaturaOlho,
  buscarProdutoPorCodigo,
  cnpjFormatado,
  CupomQr,
  cupomDoQr,
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
// (Copiado do Prevenção SBH. Versão leve: o QR Code do cupom traz número,
// série, CNPJ e chave; o produto vem do código de barras + Estoque Loja.)
// ============================================================================

const AZUL = '#2F7BFF';
const NAVY = '#0E1B2C';
const VERDE = '#1E8E5A';
const VERMELHO = '#D93A2F';

type Tela = { tipo: 'lista' } | { tipo: 'nova' } | { tipo: 'detalhe'; o: OcorrenciaOlho };

const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

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
  const valorMes = doMes.reduce((a, o) => a + o.valor_retirado, 0);
  const naBlitz = doMes.filter((o) => o.estava_na_blitz).length;

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
          lista.map((o) => (
            <TouchableOpacity key={o.id} style={[st.card, st.linha]} onPress={() => setTela({ tipo: 'detalhe', o })} activeOpacity={0.8}>
              <View style={[st.bolha, { backgroundColor: '#FBE4E2' }]}>
                <Feather name="alert-triangle" size={18} color={VERMELHO} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.itemNome} numberOfLines={2}>{o.produto_descricao}</Text>
                <Text style={st.cardSub}>
                  {dataBR(o.criado_em)} · {o.setor} · {String(o.qtd_encontrada).replace('.', ',')} un. retiradas
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={st.valor}>{reais(o.valor_retirado)}</Text>
                {o.estava_na_blitz ? <Text style={[st.tag, { backgroundColor: '#FBE4E2', color: VERMELHO }]}>Na blitz</Text> : null}
              </View>
            </TouchableOpacity>
          ))
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

const dataParaIso = (t: string) => {
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`);
  return isNaN(d.getTime()) || d.getDate() !== Number(m[1]) ? null : `${m[3]}-${m[2]}-${m[1]}`;
};
const mascaraData = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
};
const textoNum = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

function Rotulo({ texto }: { texto: string }) {
  return <Text style={st.rotulo}>{texto}</Text>;
}

function NovaOcorrencia({ onCancelar, onSalva }: { onCancelar: () => void; onSalva: () => void }) {
  const { usuarioAtual } = useAuth();
  const teclado = useTeclado();
  const [leitor, setLeitor] = useState<'qr' | 'barras' | null>(null);
  const [cupom, setCupom] = useState<CupomQr | null>(null);
  const [semCupom, setSemCupom] = useState(false);
  const [buscandoProduto, setBuscandoProduto] = useState(false);
  const [doEstoque, setDoEstoque] = useState(false);

  const [descricao, setDescricao] = useState('');
  const [codigo, setCodigo] = useState('');
  const [unitario, setUnitario] = useState('');
  const [validade, setValidade] = useState('');
  const [setor, setSetor] = useState<string | null>(null);

  const [retirado, setRetirado] = useState<boolean | null>(null);
  const [qtdEncontrada, setQtdEncontrada] = useState('');
  const [valorRetirado, setValorRetirado] = useState('');
  const [valorEditado, setValorEditado] = useState(false);
  const [blitz, setBlitz] = useState<boolean | null>(null);
  const [obs, setObs] = useState('');

  const [fotos, setFotos] = useState<string[]>([]);
  const [nomes, setNomes] = useState<Record<PapelOlho, string>>({ registrou: usuarioAtual?.nome ?? '', gerente: '', responsavel_setor: '' });
  const [assinaturas, setAssinaturas] = useState<Partial<Record<PapelOlho, AssinaturaOlho>>>({});
  const [assinando, setAssinando] = useState<PapelOlho | null>(null);
  const [salvando, setSalvando] = useState(false);

  // valor retirado = quantidade encontrada × valor unitário (pode ser corrigido)
  useEffect(() => {
    if (valorEditado) return;
    const q = numeroDigitado(qtdEncontrada);
    const u = numeroDigitado(unitario);
    setValorRetirado(q != null && u != null ? textoNum(Math.round(q * u * 100) / 100) : '');
  }, [qtdEncontrada, unitario, valorEditado]);

  function aoLer(texto: string) {
    const modo = leitor;
    setLeitor(null);
    if (modo === 'qr') {
      const c = cupomDoQr(texto);
      if (!c.chave) {
        Alert.alert('QR Code não reconhecido', 'Esse QR Code não parece ser de um cupom fiscal. Tente de novo ou marque "cliente sem cupom".');
        return;
      }
      setCupom(c);
      setSemCupom(false);
    } else if (modo === 'barras') {
      aplicarCodigo(texto);
    }
  }

  async function aplicarCodigo(texto: string) {
    setCodigo(texto);
    setBuscandoProduto(true);
    try {
      const p = await buscarProdutoPorCodigo(texto);
      if (!p) {
        setDoEstoque(false);
        Alert.alert('Produto não encontrado', 'Esse código não está no Estoque Loja. Digite a descrição e o valor à mão.');
        return;
      }
      setDescricao(p.descricao);
      if (p.precoVenda != null) setUnitario(textoNum(p.precoVenda));
      if (p.setor) setSetor(p.setor);
      setDoEstoque(true);
    } finally {
      setBuscandoProduto(false);
    }
  }

  async function foto(origem: 'camera' | 'galeria') {
    try {
      const perm = origem === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão', origem === 'camera' ? 'Libere a câmera para tirar a foto.' : 'Libere o acesso às fotos.');
        return;
      }
      const r =
        origem === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.5 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!r.canceled && r.assets?.[0]?.uri) setFotos((x) => [...x, r.assets[0].uri].slice(0, 3));
    } catch (e) {
      Alert.alert('Foto', (e as Error).message);
    }
  }

  const iso = dataParaIso(validade);
  const faltas: string[] = [];
  if (!cupom && !semCupom) faltas.push('cupom');
  if (!descricao.trim()) faltas.push('produto');
  if (!setor) faltas.push('setor');
  if (validade && !iso) faltas.push('data de validade');
  if (retirado == null) faltas.push('restante retirado');
  if (numeroDigitado(qtdEncontrada) == null) faltas.push('quantidade');
  if (numeroDigitado(valorRetirado) == null) faltas.push('valor retirado');
  if (blitz == null) faltas.push('blitz');
  if (!fotos.length) faltas.push('foto');
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
        produto: { descricao, codigo: codigo.trim() || null, valorUnitario: numeroDigitado(unitario) },
        setor: setor!,
        dataValidade: iso,
        restanteRetirado: !!retirado,
        qtdEncontrada: numeroDigitado(qtdEncontrada) ?? 0,
        valorRetirado: numeroDigitado(valorRetirado) ?? 0,
        estavaNaBlitz: !!blitz,
        observacao: obs,
        fotos,
        assinaturas: PAPEIS_OLHO.map((p) => ({ ...assinaturas[p.papel]!, nome: nomes[p.papel].trim() })),
      });
      Alert.alert('Ocorrência registrada', 'Já aparece no painel do portal.');
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
        {/* 1. Cupom */}
        <Text style={st.secao}>1. Cupom fiscal do cliente</Text>
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
              <TouchableOpacity style={st.botaoClaro} onPress={() => setLeitor('qr')}>
                <Feather name="maximize" size={16} color={colors.navy700} />
                <Text style={st.botaoClaroTxt}>Ler outro QR Code</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={st.botaoAzul} onPress={() => setLeitor('qr')}>
                <Feather name="maximize" size={18} color={colors.white} />
                <Text style={st.botaoAzulTxt}>Ler QR Code do cupom</Text>
              </TouchableOpacity>
              <Text style={st.cardSub}>Guarda o número, a série, o CNPJ e a chave do cupom.</Text>
              <Pressable onPress={() => setSemCupom((x) => !x)}>
                <Text style={st.link}>{semCupom ? '✓ Cliente sem cupom' : 'Cliente sem cupom? Toque aqui'}</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* 2. Produto */}
        <Text style={st.secao}>2. Produto vencido</Text>
        <View style={[st.card, { gap: 10 }]}>
          <TouchableOpacity style={st.botaoClaro} onPress={() => setLeitor('barras')} disabled={buscandoProduto}>
            {buscandoProduto ? <ActivityIndicator color={colors.navy700} /> : <Feather name="camera" size={16} color={colors.navy700} />}
            <Text style={st.botaoClaroTxt}>Ler código de barras do produto</Text>
          </TouchableOpacity>
          {doEstoque ? <Text style={[st.cardSub, { color: VERDE }]}>✓ Preenchido pelo Estoque Loja (preço oficial da loja)</Text> : null}
          <Rotulo texto="Produto" />
          <TextInput style={st.input} value={descricao} onChangeText={setDescricao} placeholder="Descrição do produto" placeholderTextColor={colors.gray400} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Rotulo texto="Valor unitário (R$)" />
              <TextInput style={st.input} value={unitario} onChangeText={setUnitario} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={colors.gray400} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Rotulo texto="Validade" />
              <TextInput style={st.input} value={validade} onChangeText={(t) => setValidade(mascaraData(t))} keyboardType="number-pad" placeholder="dd/mm/aaaa" placeholderTextColor={colors.gray400} />
            </View>
          </View>
          <Rotulo texto="Código (opcional)" />
          <TextInput
            style={st.input}
            value={codigo}
            onChangeText={setCodigo}
            onBlur={() => { if (codigo.trim().length >= 8 && !doEstoque) aplicarCodigo(codigo.trim()); }}
            onSubmitEditing={() => { if (codigo.trim().length >= 8) aplicarCodigo(codigo.trim()); }}
            returnKeyType="search"
            keyboardType="number-pad"
            placeholder="Código de barras"
            placeholderTextColor={colors.gray400}
          />
          <Rotulo texto="Setor" />
          <View style={st.chips}>
            {SETORES_OLHO.map((x) => (
              <Pressable key={x} onPress={() => setSetor(x)} style={[st.chip, setor === x && st.chipOn]}>
                <Text style={[st.chipTxt, setor === x && { color: colors.white }]}>{x}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 3. Perguntas */}
        <Text style={st.secao}>3. Retirada da área de venda</Text>
        <View style={[st.card, { gap: 10 }]}>
          <Rotulo texto="O restante da mercadoria foi retirado da área de venda?" />
          <SimNao valor={retirado} onChange={setRetirado} />
          <Rotulo texto="Quantidade encontrada na área de venda" />
          <TextInput style={st.input} value={qtdEncontrada} onChangeText={setQtdEncontrada} keyboardType="decimal-pad" placeholder="ex.: 6" placeholderTextColor={colors.gray400} />
          <Rotulo texto="Valor de tudo que foi retirado (R$)" />
          <TextInput
            style={st.input}
            value={valorRetirado}
            onChangeText={(t) => {
              setValorEditado(true);
              setValorRetirado(t);
            }}
            keyboardType="decimal-pad"
            placeholder="0,00"
            placeholderTextColor={colors.gray400}
          />
          {!valorEditado ? <Text style={st.cardSub}>Calculado: quantidade × valor unitário. Pode corrigir.</Text> : null}
          <Rotulo texto="O produto estava na blitz de validade?" />
          <SimNao valor={blitz} onChange={setBlitz} />
          <Rotulo texto="Observação (opcional)" />
          <TextInput
            style={[st.input, { minHeight: 70, textAlignVertical: 'top' }]}
            value={obs}
            onChangeText={setObs}
            onFocus={teclado.focarNoFim}
            multiline
            placeholder="Algo a mais?"
            placeholderTextColor={colors.gray400}
          />
        </View>

        {/* 4. Fotos */}
        <Text style={st.secao}>4. Fotos (pelo menos 1)</Text>
        <View style={[st.card, { gap: 10 }]}>
          {fotos.length ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {fotos.map((f, i) => (
                <Pressable key={f} onLongPress={() => setFotos((x) => x.filter((_, k) => k !== i))}>
                  <Image source={{ uri: f }} style={st.foto} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={st.cardSub}>Fotografe o produto mostrando a data de validade.</Text>
          )}
          {fotos.length < 3 ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[st.botaoClaro, { flex: 1 }]} onPress={() => foto('camera')}>
                <Feather name="camera" size={16} color={colors.navy700} />
                <Text style={st.botaoClaroTxt}>Câmera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.botaoClaro, { flex: 1 }]} onPress={() => foto('galeria')}>
                <Feather name="image" size={16} color={colors.navy700} />
                <Text style={st.botaoClaroTxt}>Galeria</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {fotos.length ? <Text style={st.cardSub}>Segure a foto para tirar.</Text> : null}
        </View>

        {/* 5. Assinaturas */}
        <Text style={st.secao}>5. Assinaturas</Text>
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
                  {p.papel === 'responsavel_setor' && setor ? ` · ${setor}` : ''}
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

      <LeitorCodigo visivel={!!leitor} modo={leitor ?? 'qr'} onLido={aoLer} onCancelar={() => setLeitor(null)} />
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
    ['Setor', o.setor],
    ['Validade do produto', o.data_validade ? o.data_validade.split('-').reverse().join('/') : '—'],
    ['Valor unitário', reais(o.valor_unitario)],
    ['Restante retirado da área de venda', o.restante_retirado ? 'Sim' : 'Não'],
    ['Quantidade encontrada', String(o.qtd_encontrada).replace('.', ',')],
    ['Valor retirado', reais(o.valor_retirado)],
    ['Estava na blitz de validade', o.estava_na_blitz ? 'Sim' : 'Não'],
    ['Cupom', o.cupom_numero ? `nº ${o.cupom_numero}${o.cupom_total != null ? ` · ${reais(o.cupom_total)}` : ''}` : 'Sem cupom'],
    ['Registrado por', `${o.registrado_por_nome ?? '—'} · ${new Date(o.criado_em).toLocaleString('pt-BR')}`],
  ];
  return (
    <View style={st.flex}>
      <CabecalhoTela titulo={o.produto_descricao} subtitulo="De olho na validade" icone="eye" onVoltar={onVoltar} />
      <ScrollView style={st.flex} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        <View style={[st.card, { gap: 10 }]}>
          {linhas.map(([r, v]) => (
            <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text style={[st.cardSub, { flex: 1, marginTop: 0 }]}>{r}</Text>
              <Text style={[st.cardTitulo, { fontSize: 13.5, flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
            </View>
          ))}
          {o.observacao ? <Text style={st.cardSub}>Obs.: {o.observacao}</Text> : null}
        </View>
        {o.fotos.length ? (
          <>
            <Text style={st.secao}>Fotos</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {o.fotos.map((f) => (
                <Image key={f} source={{ uri: f }} style={st.foto} />
              ))}
            </View>
          </>
        ) : null}
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
  chipOn: { backgroundColor: NAVY, borderColor: NAVY },
  chipTxt: { fontSize: 13, fontWeight: '700', color: '#3A4558' },
  foto: { width: 96, height: 96, borderRadius: 12, backgroundColor: '#E1E6EE' },
  link: { color: AZUL, fontWeight: '700', fontSize: 13.5 },
  botaoAzul: { backgroundColor: AZUL, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  botaoAzulTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },
  botaoClaro: { backgroundColor: '#E3E7F5', borderRadius: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  botaoClaroTxt: { color: colors.navy700, fontWeight: '700', fontSize: 14 },
  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: 24, backgroundColor: 'rgba(243,245,249,0.96)' },
  botaoGrande: { backgroundColor: AZUL, borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12 },
  botaoGrandeTxt: { color: colors.white, fontWeight: '800', fontSize: 15, flexShrink: 1 },
});
