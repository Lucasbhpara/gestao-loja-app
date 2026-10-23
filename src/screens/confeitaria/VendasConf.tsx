import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import {
  Venda,
  NovaVenda,
  Pedido,
  Produto,
  ConfigConf,
  inserirVendas,
  atualizarVenda,
  marcarRecebidoVarios,
  excluirVendas,
  agruparPedidos,
  pendenciasDoCliente,
  lembrarNaLista,
  nomeCompleto,
  numeroDigitado,
  numeroTexto,
  reais,
  dataBr,
  hojeIso,
  normalizar,
} from '../../data/confeitariaApi';
import { dadosCobranca, compartilharMensagem } from '../../data/confeitariaCobranca';
import { CARD_CONF_HTML } from '../../data/confeitariaCard';
import { C, s, Topo, Cartao, Botao, Campo, Chips, CampoComLista, Folha, Vazio, confirmar } from './ui';

// Vendas da confeitaria. Uma venda pode ter vários produtos (pedido) — ficam
// salvos como linhas com o mesmo cliente, data e criado_em. Tocar no nome da
// cliente abre a ficha dela: o que ainda deve (de vários dias), "Nova venda
// para ela" e "Compartilhar dívida" (imagem com a marca + mensagem delicada,
// desenhada no mesmo canvas da Vitrine).

type Props = {
  vendas: Venda[];
  produtos: Produto[];
  config: ConfigConf;
  onConfig: (c: ConfigConf) => void;
  onVoltar: () => void;
  onRecarregar: () => Promise<void>;
  clienteInicial?: string | null;
};

type LinhaVenda = { chave: string; id?: string; produtoId: string | null; produto: string; qtd: string; preco: string };
type Rasc = { pedido?: Pedido; data: string; dataTxt?: string; cliente: string; forma: string | null; recebido: boolean; obs: string; linhas: LinhaVenda[] };

const chaveNova = () => Math.random().toString(36).slice(2);
const linhaVazia = (): LinhaVenda => ({ chave: chaveNova(), produtoId: null, produto: '', qtd: '1', preco: '' });

export default function VendasConf({ vendas, produtos, config, onConfig, onVoltar, onRecarregar, clienteInicial }: Props) {
  const [filtro, setFiltro] = useState<'mes' | 'receber' | 'tudo'>('mes');
  const [busca, setBusca] = useState('');
  const [rasc, setRasc] = useState<Rasc | null>(null);
  const [escolhendo, setEscolhendo] = useState<string | null>(null); // chave da linha
  const [buscaProd, setBuscaProd] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ficha, setFicha] = useState<string | null>(clienteInicial ?? null);
  const [enviando, setEnviando] = useState(false);
  const [webPronta, setWebPronta] = useState(false);
  const webRef = useRef<WebView>(null);
  const pedidoImagem = useRef(false);
  const mes = hojeIso().slice(0, 7);

  useEffect(() => {
    if (clienteInicial) setFicha(clienteInicial);
  }, [clienteInicial]);

  const pedidos = useMemo(() => agruparPedidos(vendas), [vendas]);
  const lista = useMemo(() => {
    const b = normalizar(busca);
    return pedidos.filter(
      (p) =>
        (filtro === 'tudo' || (filtro === 'mes' ? p.data.startsWith(mes) : !p.recebido)) &&
        (!b || normalizar(`${p.cliente ?? ''} ${p.itens.map((i) => i.produto).join(' ')}`).includes(b)),
    );
  }, [pedidos, filtro, busca, mes]);
  const total = lista.reduce((a, p) => a + p.total, 0);
  const aReceber = vendas.filter((v) => !v.recebido).reduce((a, v) => a + v.quantidade * v.precoUnitario, 0);

  // Quem deve (pra aba "A receber")
  const devendo = useMemo(() => {
    const m = new Map<string, { cliente: string; valor: number; compras: number }>();
    vendas
      .filter((v) => !v.recebido)
      .forEach((v) => {
        const nome = v.cliente || 'Sem nome';
        const k = normalizar(nome);
        const r = m.get(k) ?? { cliente: nome, valor: 0, compras: 0 };
        r.valor += v.quantidade * v.precoUnitario;
        r.compras += 1;
        m.set(k, r);
      });
    return Array.from(m.values()).sort((a, b) => b.valor - a.valor);
  }, [vendas]);

  const ativos = produtos.filter((p) => p.ativo && p.precoVenda);
  const prodFiltrados = ativos.filter((p) => !buscaProd || normalizar(nomeCompleto(p)).includes(normalizar(buscaProd)));

  const pendFicha = useMemo(() => (ficha ? pendenciasDoCliente(vendas, ficha) : []), [vendas, ficha]);
  const totalFicha = pendFicha.reduce((a, v) => a + v.quantidade * v.precoUnitario, 0);
  const historicoFicha = useMemo(
    () => (ficha ? pedidos.filter((p) => normalizar(p.cliente || 'Sem nome') === normalizar(ficha) && p.recebido).slice(0, 5) : []),
    [pedidos, ficha],
  );

  function novaVenda(cliente = '') {
    setRasc({ data: hojeIso(), cliente, forma: config.formas[0] ?? 'Pix', recebido: !cliente, obs: '', linhas: [linhaVazia()] });
  }
  function editar(p: Pedido) {
    setRasc({
      pedido: p,
      data: p.data,
      cliente: p.cliente ?? '',
      forma: p.formaPagamento,
      recebido: p.recebido,
      obs: p.observacao ?? '',
      linhas: p.itens.map((v) => ({ chave: chaveNova(), id: v.id, produtoId: v.produtoId, produto: v.produto, qtd: numeroTexto(v.quantidade, 3), preco: numeroTexto(v.precoUnitario) })),
    });
  }
  const mudar = (chave: string, p: Partial<LinhaVenda>) => rasc && setRasc({ ...rasc, linhas: rasc.linhas.map((l) => (l.chave === chave ? { ...l, ...p } : l)) });

  async function salvar() {
    if (!rasc) return;
    const linhas = rasc.linhas.filter((l) => l.produto.trim());
    if (!linhas.length) return Alert.alert('Falta o produto', 'Escolha o que foi vendido.');
    const base = (l: LinhaVenda): NovaVenda => ({
      data: rasc.data,
      cliente: rasc.cliente,
      produtoId: l.produtoId,
      produto: l.produto,
      quantidade: numeroDigitado(l.qtd) ?? 1,
      precoUnitario: numeroDigitado(l.preco) ?? 0,
      formaPagamento: rasc.forma,
      recebido: rasc.recebido,
      observacao: rasc.obs,
    });
    setSalvando(true);
    try {
      if (rasc.pedido) {
        const ficam = new Set(linhas.filter((l) => l.id).map((l) => l.id!));
        const sairam = rasc.pedido.itens.filter((v) => !ficam.has(v.id)).map((v) => v.id);
        for (const l of linhas.filter((x) => x.id)) await atualizarVenda(l.id!, base(l));
        const novas = linhas.filter((x) => !x.id);
        if (novas.length) await inserirVendas(novas.map((l) => ({ ...base(l), criadoEm: rasc.pedido!.criadoEm })));
        await excluirVendas(sairam);
      } else {
        await inserirVendas(linhas.map(base));
      }
      onConfig(await lembrarNaLista(config, 'clientes', rasc.cliente));
      setRasc(null);
      await onRecarregar();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarRecebido(p: Pedido) {
    try {
      await marcarRecebidoVarios(
        p.itens.map((i) => i.id),
        !p.recebido,
      );
      await onRecarregar();
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? '');
    }
  }

  function gerarImagem() {
    if (!ficha || !webRef.current) return;
    pedidoImagem.current = false;
    webRef.current.injectJavaScript(`window.gerarCard(${JSON.stringify(dadosCobranca(ficha, pendFicha, config))}, true); true;`);
  }

  async function enviar(tipo: 'imagem' | 'texto') {
    if (!ficha || !pendFicha.length || enviando) return;
    if (tipo === 'texto') {
      try {
        await compartilharMensagem(ficha, pendFicha, config);
      } catch (e: any) {
        Alert.alert('Não consegui compartilhar', e?.message ?? '');
      }
      return;
    }
    setEnviando(true);
    if (webPronta) gerarImagem();
    else pedidoImagem.current = true; // gera assim que a página do desenho carregar
  }

  async function aoMensagemImagem(ev: { nativeEvent: { data: string } }) {
    let m: any;
    try {
      m = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (m.tipo === 'carregado') {
      setWebPronta(true);
      if (pedidoImagem.current) gerarImagem();
    }
    if (m.tipo === 'erro') {
      setEnviando(false);
      Alert.alert('Não consegui gerar a imagem', m.mensagem);
    }
    if (m.tipo === 'imagem') {
      try {
        const FileSystem = await import('expo-file-system/legacy');
        const Sharing = await import('expo-sharing');
        const nome = normalizar(ficha ?? 'cliente').replace(/[^a-z0-9]+/g, '-') || 'cliente';
        const caminho = `${FileSystem.cacheDirectory}cobranca-${nome}-${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(caminho, m.base64, { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(caminho, { mimeType: 'image/jpeg', dialogTitle: 'Compartilhar com a cliente', UTI: 'public.jpeg' });
      } catch (e: any) {
        Alert.alert('Não consegui compartilhar', e?.message ?? '');
      } finally {
        setEnviando(false);
      }
    }
  }

  function quitarTudo() {
    if (!ficha) return;
    confirmar(
      `${ficha} pagou tudo?`,
      `Marca ${reais(totalFicha)} como recebido.`,
      async () => {
        try {
          await marcarRecebidoVarios(
            pendFicha.map((v) => v.id),
            true,
          );
          await onRecarregar();
        } catch (e: any) {
          Alert.alert('Erro', e?.message ?? '');
        }
      },
      'Sim, recebi',
    );
  }

  const resumoItens = (p: Pedido) => p.itens.map((i) => `${numeroTexto(i.quantidade, 3)}× ${i.produto}`).join(' · ');

  return (
    <View style={s.tela}>
      <Topo titulo="Vendas" sub={aReceber > 0 ? `${reais(aReceber)} a receber` : 'Tudo recebido'} onVoltar={onVoltar} icone="dollar-sign" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <Chips
          opcoes={['Este mês', 'A receber', 'Todas']}
          valor={filtro === 'mes' ? 'Este mês' : filtro === 'receber' ? 'A receber' : 'Todas'}
          onMudar={(v) => setFiltro(v === 'A receber' ? 'receber' : v === 'Todas' ? 'tudo' : 'mes')}
        />
        <TextInput style={[s.busca, { marginTop: 0 }]} value={busca} onChangeText={setBusca} placeholder="Buscar cliente ou produto" placeholderTextColor="#C4AEB5" />

        {filtro === 'receber' && devendo.length ? (
          <Cartao style={{ gap: 4 } as any}>
            <Text style={s.titulo}>Quem falta pagar</Text>
            <Text style={s.dica}>Toque no nome para ver a ficha, vender de novo ou compartilhar a dívida.</Text>
            {devendo.map((d) => (
              <TouchableOpacity key={d.cliente} onPress={() => setFicha(d.cliente)} style={[s.linha, { justifyContent: 'space-between', paddingVertical: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Feather name="user" size={15} color={C.rosa} />
                  <Text style={{ color: C.texto, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {d.cliente}
                  </Text>
                </View>
                <Text style={{ color: '#B7791F', fontWeight: '800' }}>{reais(d.valor)}</Text>
                <Feather name="chevron-right" size={16} color={C.suave} />
              </TouchableOpacity>
            ))}
          </Cartao>
        ) : null}

        <Cartao style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as any}>
          <Text style={s.sub}>
            {lista.length} {lista.length === 1 ? 'venda' : 'vendas'}
          </Text>
          <Text style={s.valor}>{reais(total)}</Text>
        </Cartao>
        {!lista.length ? <Vazio icone="dollar-sign" texto="Nenhuma venda aqui." /> : null}
        {lista.map((p) => (
          <Cartao key={p.chave} onPress={() => editar(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 } as any}>
            <View style={{ flex: 1, gap: 2 }}>
              <TouchableOpacity onPress={() => setFicha(p.cliente || 'Sem nome')} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
                <Text style={[s.titulo, { textDecorationLine: 'underline', textDecorationColor: C.rosaBorda }]} numberOfLines={1}>
                  {p.cliente || 'Sem nome'}
                </Text>
              </TouchableOpacity>
              <Text style={s.sub} numberOfLines={3}>
                {resumoItens(p)}
              </Text>
              <Text style={s.dica}>
                {dataBr(p.data)}
                {p.formaPagamento ? ` · ${p.formaPagamento}` : ''}
                {p.itens.length > 1 ? ` · ${p.itens.length} produtos` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={[s.valor, { fontSize: 17 }]}>{reais(p.total)}</Text>
              <TouchableOpacity onPress={() => alternarRecebido(p)} hitSlop={8}>
                <Text style={[s.pill, p.recebido ? { backgroundColor: C.mentaClaro, color: C.menta } : { backgroundColor: C.ouroClaro, color: '#9A6B12' }]}>
                  {p.recebido ? '✓ Recebido' : 'A receber'}
                </Text>
              </TouchableOpacity>
            </View>
          </Cartao>
        ))}
      </ScrollView>
      <TouchableOpacity style={s.fab} onPress={() => novaVenda()} activeOpacity={0.85}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={s.fabTxt}>Nova venda</Text>
      </TouchableOpacity>

      {/* Ficha da cliente */}
      <Folha
        visivel={!!ficha && !rasc && !escolhendo}
        titulo={ficha ?? ''}
        onFechar={() => {
          setFicha(null);
          setWebPronta(false);
          setEnviando(false);
        }}
        rodape={
          ficha ? (
            <>
              <Botao texto={`Nova venda para ${ficha.split(' ')[0]}`} icone="plus" onPress={() => novaVenda(ficha === 'Sem nome' ? '' : ficha)} />
              {pendFicha.length ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Botao texto={enviando ? 'Gerando…' : 'Compartilhar dívida'} icone="image" tipo="claro" onPress={() => enviar('imagem')} desativado={enviando} style={{ flex: 1 }} />
                  <Botao texto="Mensagem" icone="message-circle" tipo="claro" onPress={() => enviar('texto')} desativado={enviando} style={{ flex: 0.8 }} />
                </View>
              ) : null}
            </>
          ) : null
        }
      >
        {ficha ? (
          <>
            {/* desenho da imagem de cobrança (fica invisível) */}
            <View style={{ position: 'absolute', width: 2, height: 2, opacity: 0, overflow: 'hidden' }} pointerEvents="none">
              <WebView ref={webRef} originWhitelist={['*']} source={{ html: CARD_CONF_HTML }} onMessage={aoMensagemImagem} javaScriptEnabled style={{ width: 2, height: 2 }} />
            </View>
            <Cartao style={{ backgroundColor: pendFicha.length ? C.ouroClaro : C.mentaClaro, gap: 2 } as any}>
              <Text style={s.sub}>{pendFicha.length ? 'Em aberto' : 'Nada em aberto'}</Text>
              <Text style={[s.valor, { fontSize: 26, color: pendFicha.length ? '#9A6B12' : C.menta }]}>{reais(totalFicha)}</Text>
              {pendFicha.length ? (
                <Text style={s.dica}>
                  {pendFicha.length} {pendFicha.length === 1 ? 'produto' : 'produtos'} desde {dataBr(pendFicha[0].data)}
                </Text>
              ) : null}
            </Cartao>
            {pendFicha.length ? (
              <Cartao style={{ gap: 2 } as any}>
                <Text style={s.titulo}>O que ficou em aberto</Text>
                {pendFicha.map((v) => (
                  <View key={v.id} style={[s.linha, { justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.rosaBorda }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.texto, fontWeight: '600' }} numberOfLines={2}>
                        {numeroTexto(v.quantidade, 3)}× {v.produto}
                      </Text>
                      <Text style={s.dica}>{dataBr(v.data)}</Text>
                    </View>
                    <Text style={{ color: C.chocolate, fontWeight: '800' }}>{reais(v.quantidade * v.precoUnitario)}</Text>
                  </View>
                ))}
                <TouchableOpacity onPress={quitarTudo} style={{ alignSelf: 'flex-start', marginTop: 8 }} hitSlop={8}>
                  <Text style={{ color: C.menta, fontWeight: '800' }}>✓ Ela pagou tudo</Text>
                </TouchableOpacity>
              </Cartao>
            ) : null}
            {pendFicha.length ? (
              <Text style={s.dica}>
                “Compartilhar dívida” gera uma imagem com a sua logo, um bilhetinho carinhoso, a lista acima e o Pix. “Mensagem” manda só o texto, se quiser enviar junto.
                {config.pix ? '' : ' Dica: coloque sua chave Pix em Minha marca para ela aparecer na cobrança.'}
              </Text>
            ) : null}
            {historicoFicha.length ? (
              <Cartao style={{ gap: 2 } as any}>
                <Text style={s.titulo}>Últimas compras pagas</Text>
                {historicoFicha.map((p) => (
                  <View key={p.chave} style={[s.linha, { justifyContent: 'space-between', paddingVertical: 6 }]}>
                    <Text style={[s.sub, { flex: 1 }]} numberOfLines={1}>
                      {dataBr(p.data)} · {resumoItens(p)}
                    </Text>
                    <Text style={{ color: C.menta, fontWeight: '800' }}>{reais(p.total)}</Text>
                  </View>
                ))}
              </Cartao>
            ) : null}
          </>
        ) : null}
      </Folha>

      <Folha
        visivel={!!rasc && !escolhendo}
        titulo={rasc?.pedido ? 'Editar venda' : rasc?.cliente ? `Nova venda · ${rasc.cliente}` : 'Nova venda'}
        onFechar={() => setRasc(null)}
        rodape={
          rasc ? (
            <>
              <View style={[s.linha, { justifyContent: 'space-between' }]}>
                <Text style={s.sub}>
                  Total · {rasc.linhas.filter((l) => l.produto).length} {rasc.linhas.filter((l) => l.produto).length === 1 ? 'produto' : 'produtos'}
                </Text>
                <Text style={s.valor}>{reais(rasc.linhas.reduce((a, l) => a + (numeroDigitado(l.qtd) ?? 0) * (numeroDigitado(l.preco) ?? 0), 0))}</Text>
              </View>
              <Botao texto={salvando ? 'Salvando…' : 'Salvar venda'} icone="check" onPress={salvar} desativado={salvando} />
            </>
          ) : null
        }
      >
        {rasc ? (
          <>
            <CampoComLista rotulo="Cliente" valor={rasc.cliente} onMudar={(t) => setRasc({ ...rasc, cliente: t })} lista={config.clientes} placeholder="Nome do cliente" />
            <Campo
              rotulo="Data"
              value={rasc.dataTxt ?? dataBr(rasc.data)}
              onChangeText={(t) => {
                const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                setRasc({ ...rasc, dataTxt: t, data: m ? `${m[3]}-${m[2]}-${m[1]}` : rasc.data });
              }}
              placeholder="dd/mm/aaaa"
              keyboardType="numbers-and-punctuation"
            />
            <Text style={s.rotulo}>Produtos</Text>
            {rasc.linhas.map((l, i) => (
              <Cartao key={l.chave} style={{ padding: 12, gap: 8 } as any}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: C.rosa, fontWeight: '800', width: 18 }}>{i + 1}</Text>
                  <TouchableOpacity onPress={() => { setBuscaProd(''); setEscolhendo(l.chave); }} style={[s.input, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <Feather name="gift" size={16} color={C.rosa} />
                    <Text style={{ flex: 1, color: l.produto ? C.texto : '#C4AEB5', fontSize: 15 }} numberOfLines={2}>
                      {l.produto || 'Escolher produto'}
                    </Text>
                    <Feather name="chevron-down" size={16} color={C.suave} />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput style={[s.input, { flex: 1, paddingVertical: 8 }]} value={l.qtd} onChangeText={(t) => mudar(l.chave, { qtd: t })} keyboardType="decimal-pad" placeholder="Qtd" placeholderTextColor="#C4AEB5" />
                  <Text style={{ color: C.suave }}>×</Text>
                  <TextInput style={[s.input, { flex: 1.3, paddingVertical: 8 }]} value={l.preco} onChangeText={(t) => mudar(l.chave, { preco: t })} keyboardType="decimal-pad" placeholder="R$ unid." placeholderTextColor="#C4AEB5" />
                  {rasc.linhas.length > 1 ? (
                    <TouchableOpacity hitSlop={10} onPress={() => setRasc({ ...rasc, linhas: rasc.linhas.filter((x) => x.chave !== l.chave) })}>
                      <Feather name="trash-2" size={18} color={C.vermelho} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </Cartao>
            ))}
            <Botao texto="Adicionar outro produto" icone="plus-circle" tipo="claro" onPress={() => setRasc({ ...rasc, linhas: [...rasc.linhas, linhaVazia()] })} />
            <Text style={s.rotulo}>Pagamento</Text>
            <Chips opcoes={config.formas} valor={rasc.forma} onMudar={(v) => setRasc({ ...rasc, forma: v })} />
            <View style={[s.linha, { justifyContent: 'space-between' }]}>
              <Text style={s.titulo}>Já recebi</Text>
              <Switch value={rasc.recebido} onValueChange={(v) => setRasc({ ...rasc, recebido: v })} trackColor={{ true: C.menta, false: '#E8DADF' }} thumbColor="#fff" />
            </View>
            <Campo rotulo="Observação" value={rasc.obs} onChangeText={(t) => setRasc({ ...rasc, obs: t })} multiline placeholder="Ex.: entregar sábado" />
            {rasc.pedido ? (
              <Botao
                texto="Excluir venda"
                icone="trash-2"
                tipo="perigo"
                onPress={() =>
                  confirmar('Excluir venda?', resumoItens(rasc.pedido!), async () => {
                    await excluirVendas(rasc.pedido!.itens.map((i) => i.id)).catch((e) => Alert.alert('Erro', e?.message ?? ''));
                    setRasc(null);
                    await onRecarregar();
                  })
                }
              />
            ) : null}
          </>
        ) : null}
      </Folha>

      <Folha visivel={!!escolhendo} titulo="Escolher produto" onFechar={() => setEscolhendo(null)}>
        <TextInput style={[s.busca, { marginTop: 0 }]} value={buscaProd} onChangeText={setBuscaProd} placeholder="Buscar" placeholderTextColor="#C4AEB5" autoFocus />
        {prodFiltrados.map((p) => (
          <Cartao
            key={p.id}
            onPress={() => {
              if (escolhendo) mudar(escolhendo, { produtoId: p.id, produto: nomeCompleto(p), preco: numeroTexto(p.precoVenda) });
              setEscolhendo(null);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 } as any}
          >
            <Text style={[s.titulo, { flex: 1, fontSize: 15 }]}>{nomeCompleto(p)}</Text>
            <Text style={{ color: C.rosaEsc, fontWeight: '800' }}>{reais(p.precoVenda)}</Text>
          </Cartao>
        ))}
        {buscaProd.trim() ? (
          <Botao
            texto={`Usar "${buscaProd.trim()}"`}
            tipo="claro"
            onPress={() => {
              if (escolhendo) mudar(escolhendo, { produtoId: null, produto: buscaProd.trim() });
              setEscolhendo(null);
            }}
          />
        ) : null}
      </Folha>
    </View>
  );
}
