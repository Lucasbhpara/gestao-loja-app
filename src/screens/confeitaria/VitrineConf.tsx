import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator, useWindowDimensions, Linking, Share } from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import { Produto, ConfigConf, nomeCompleto, reais, normalizar, numeroDigitado, numeroTexto, atualizarFotoProduto, enviarFotoConf } from '../../data/confeitariaApi';
import { CARD_CONF_HTML } from '../../data/confeitariaCard';
import { LOGO_CONFEITARIA } from '../../data/confeitariaLogo';
import { C, s, Topo, Cartao, Botao, Campo, Folha, Chips, pegarFoto, escolherOrigemFoto } from './ui';

type Props = { produtos: Produto[]; config: ConfigConf; onVoltar: () => void; onRecarregar: () => Promise<void> };
type ItemCard = { id: string; nome: string; sabor: string; preco: number | null; precoTxt: string; foto: string | null };

export default function VitrineConf({ produtos, config, onVoltar, onRecarregar }: Props) {
  const { width } = useWindowDimensions();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [previa, setPrevia] = useState<{ modo: 'produto' | 'cardapio'; itens: ItemCard[]; indice: number; titulo: string } | null>(null);
  const [webPronta, setWebPronta] = useState(false);
  const [gerando, setGerando] = useState(false);
  const webRef = useRef<WebView>(null);

  const ativos = useMemo(() => produtos.filter((p) => p.ativo && p.categoria !== 'Base / recheio'), [produtos]);
  const lista = ativos.filter((p) => !busca || normalizar(nomeCompleto(p)).includes(normalizar(busca)));
  const alternar = (id: string) => setSelecionados((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const itensSel = (): ItemCard[] =>
    selecionados
      .map((id) => ativos.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => ({ id: p!.id, nome: p!.nome, sabor: p!.sabor, preco: p!.precoVenda, precoTxt: numeroTexto(p!.precoVenda), foto: p!.fotoUrl }));

  function abrir(modo: 'produto' | 'cardapio') {
    if (!selecionados.length) return Alert.alert('Escolha os produtos', 'Toque nos produtos que vão na imagem.');
    setWebPronta(false);
    setPrevia({ modo, itens: itensSel(), indice: 0, titulo: 'Cardápio' });
  }

  const dados = (p: NonNullable<typeof previa>) => ({
    modo: p.modo,
    marca: config.marca,
    logo: config.logoUrl || LOGO_CONFEITARIA,
    contato: config.whatsapp,
    instagram: config.instagram,
    titulo: p.titulo,
    produtos: (p.modo === 'produto' ? [p.itens[p.indice]] : p.itens).map((i) => ({ nome: i.nome, sabor: i.sabor, preco: i.preco, foto: i.foto })),
  });
  const desenhar = (exportar: boolean) => previa && webRef.current?.injectJavaScript(`window.gerarCard(${JSON.stringify(dados(previa))}, ${exportar}); true;`);
  useEffect(() => {
    if (previa && webPronta) desenhar(false);
  }, [previa, webPronta]);

  async function aoMensagem(ev: { nativeEvent: { data: string } }) {
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
    if (m.tipo === 'imagem') {
      try {
        const FileSystem = await import('expo-file-system/legacy');
        const Sharing = await import('expo-sharing');
        const caminho = `${FileSystem.cacheDirectory}vitrine_${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(caminho, m.base64, { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(caminho, { mimeType: 'image/jpeg', dialogTitle: 'Enviar no WhatsApp', UTI: 'public.jpeg' });
      } catch (e: any) {
        Alert.alert('Não consegui enviar', e?.message ?? '');
      } finally {
        setGerando(false);
      }
    }
  }

  // foto na hora (vai pra imagem e fica salva no produto)
  function fotoNaHora() {
    if (!previa || previa.modo !== 'produto') return;
    const item = previa.itens[previa.indice];
    escolherOrigemFoto(async (o) => {
      const f = await pegarFoto(o, true);
      if (!f) return;
      const dataUrl = f.base64 ? `data:image/jpeg;base64,${f.base64}` : f.uri;
      setPrevia({ ...previa, itens: previa.itens.map((x, k) => (k === previa.indice ? { ...x, foto: dataUrl } : x)) });
      try {
        const url = await enviarFotoConf(f.uri, 'produtos');
        await atualizarFotoProduto(item.id, url);
        onRecarregar();
      } catch {
        // a imagem sai do mesmo jeito; só não ficou salva no produto
      }
    });
  }

  function mudarPreco(t: string) {
    if (!previa) return;
    const v = numeroDigitado(t);
    setPrevia({ ...previa, itens: previa.itens.map((x, k) => (k === previa.indice ? { ...x, preco: v, precoTxt: t } : x)) });
  }

  async function enviarTexto() {
    const itens = previa?.itens ?? itensSel();
    const texto = `*${config.marca}* 💗\n\n${itens.map((i) => `• ${i.nome}${i.sabor ? ` (${i.sabor})` : ''}${i.preco ? ` — ${reais(i.preco)}` : ''}`).join('\n')}\n\n${config.whatsapp ? `Encomendas: ${config.whatsapp}` : 'Faça sua encomenda!'}`;
    const url = `whatsapp://send?text=${encodeURIComponent(texto)}`;
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else await Share.share({ message: texto });
    } catch {
      await Share.share({ message: texto });
    }
  }

  const larg = Math.min(width - 32, 420);
  const atual = previa?.itens[previa.indice];

  return (
    <View style={s.tela}>
      <Topo titulo="Vitrine" sub="Monte a imagem e mande no WhatsApp" onVoltar={onVoltar} icone="send" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 170 }} keyboardShouldPersistTaps="handled">
        <Text style={s.dica}>Toque nos produtos para escolher. “Um por imagem” usa a foto de cada produto; “Cardápio” junta todos com os preços.</Text>
        <TextInput style={[s.busca, { marginTop: 0 }]} value={busca} onChangeText={setBusca} placeholder="Buscar produto" placeholderTextColor="#C4AEB5" />
        {lista.map((p) => {
          const sel = selecionados.includes(p.id);
          return (
            <Cartao key={p.id} onPress={() => alternar(p.id)} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }, sel && { borderColor: C.rosa, backgroundColor: '#FFF2F6' }] as any}>
              {p.fotoUrl ? (
                <Image source={{ uri: p.fotoUrl }} style={{ width: 54, height: 54, borderRadius: 14 }} />
              ) : (
                <View style={{ width: 54, height: 54, borderRadius: 14, backgroundColor: C.rosaClaro, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="camera-off" size={18} color={C.rosa} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[s.titulo, { fontSize: 15 }]} numberOfLines={1}>
                  {p.nome}
                </Text>
                {p.sabor ? (
                  <Text style={s.dica} numberOfLines={1}>
                    {p.sabor}
                  </Text>
                ) : null}
              </View>
              <Text style={{ color: C.rosaEsc, fontWeight: '800' }}>{p.precoVenda ? reais(p.precoVenda) : '—'}</Text>
              <Feather name={sel ? 'check-circle' : 'circle'} size={22} color={sel ? C.rosa : C.rosaBorda} />
            </Cartao>
          );
        })}
      </ScrollView>
      <View style={[s.folhaRodape, { position: 'absolute', left: 0, right: 0, bottom: 0 }]}>
        <Text style={s.sub}>{selecionados.length} escolhidos</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Botao texto="Um por imagem" icone="image" onPress={() => abrir('produto')} style={{ flex: 1 }} />
          <Botao texto="Cardápio" icone="list" tipo="claro" onPress={() => abrir('cardapio')} style={{ flex: 1 }} />
        </View>
      </View>

      <Folha
        visivel={!!previa}
        titulo={previa?.modo === 'cardapio' ? 'Cardápio' : `Imagem ${previa ? previa.indice + 1 : 0} de ${previa?.itens.length ?? 0}`}
        onFechar={() => setPrevia(null)}
        rodape={
          <>
            <Botao
              texto={gerando ? 'Gerando…' : 'Enviar imagem no WhatsApp'}
              icone="send"
              desativado={gerando || !webPronta}
              onPress={() => {
                setGerando(true);
                desenhar(true);
              }}
            />
            <Botao texto="Mandar só o texto com os preços" icone="message-circle" tipo="claro" onPress={enviarTexto} />
          </>
        }
      >
        {previa ? (
          <>
            <View style={{ width: larg, height: (larg * 1350) / 1080, alignSelf: 'center', borderRadius: 12, overflow: 'hidden', backgroundColor: C.rosaClaro }}>
              <WebView ref={webRef} originWhitelist={['*']} source={{ html: CARD_CONF_HTML }} onMessage={aoMensagem} javaScriptEnabled scrollEnabled={false} style={{ backgroundColor: 'transparent' }} />
              {!webPronta ? <ActivityIndicator color={C.rosa} style={{ position: 'absolute', top: '45%', alignSelf: 'center' }} /> : null}
            </View>
            {previa.modo === 'produto' ? (
              <>
                {previa.itens.length > 1 ? (
                  <View style={[s.linha, { justifyContent: 'center', gap: 24 }]}>
                    <TouchableOpacity disabled={previa.indice === 0} onPress={() => setPrevia({ ...previa, indice: previa.indice - 1 })}>
                      <Feather name="chevron-left" size={30} color={previa.indice === 0 ? C.rosaBorda : C.rosa} />
                    </TouchableOpacity>
                    <Text style={s.titulo}>
                      {previa.indice + 1} de {previa.itens.length}
                    </Text>
                    <TouchableOpacity disabled={previa.indice >= previa.itens.length - 1} onPress={() => setPrevia({ ...previa, indice: previa.indice + 1 })}>
                      <Feather name="chevron-right" size={30} color={previa.indice >= previa.itens.length - 1 ? C.rosaBorda : C.rosa} />
                    </TouchableOpacity>
                  </View>
                ) : null}
                <Botao texto={atual?.foto ? 'Trocar a foto' : 'Tirar foto do produto'} icone="camera" tipo="claro" onPress={fotoNaHora} />
                <Campo rotulo="Preço nesta imagem (R$)" value={atual?.precoTxt ?? ''} onChangeText={mudarPreco} keyboardType="decimal-pad" dica="Muda só a imagem; o preço do produto continua o mesmo." />
              </>
            ) : (
              <Campo rotulo="Título" value={previa.titulo} onChangeText={(t) => setPrevia({ ...previa, titulo: t })} placeholder="Cardápio da semana" />
            )}
          </>
        ) : null}
      </Folha>
    </View>
  );
}
