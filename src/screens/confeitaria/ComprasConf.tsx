import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, Platform, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import LeitorCodigo from '../../components/LeitorCodigo';
import { cupomDoQr } from '../../data/olhoValidadeApi';
import {
  Compra,
  ConfigConf,
  NovaCompra,
  inserirCompras,
  atualizarCompra,
  excluirCompra,
  cupomJaLancado,
  JS_LER_NFCE,
  lerItensCupom,
  categoriaSugerida,
  lembrarNaLista,
  numeroDigitado,
  numeroTexto,
  reais,
  dataBr,
  hojeIso,
  normalizar,
} from '../../data/confeitariaApi';
import { C, s, Topo, Cartao, Botao, Campo, Chips, CampoComLista, Folha, Vazio, confirmar } from './ui';

type Props = { compras: Compra[]; config: ConfigConf; onConfig: (c: ConfigConf) => void; onVoltar: () => void; onRecarregar: () => Promise<void> };

type Linha = { chave: string; item: string; quantidade: string; unidade: string; valor: string; categoria: string };
const nova = (): Linha => ({ chave: Math.random().toString(36).slice(2), item: '', quantidade: '1', unidade: 'un', valor: '', categoria: 'Insumos' });

export default function ComprasConf({ compras, config, onConfig, onVoltar, onRecarregar }: Props) {
  const [busca, setBusca] = useState('');
  const [mes, setMes] = useState(hojeIso().slice(0, 7));
  const [lendoQr, setLendoQr] = useState(false);
  const [paginaCupom, setPaginaCupom] = useState<{ url: string; chave: string | null } | null>(null);
  const [lote, setLote] = useState<{ data: string; dataTxt?: string; fornecedor: string; cupomChave: string | null; linhas: Linha[]; aviso?: string } | null>(null);
  const [editando, setEditando] = useState<Compra | null>(null);
  const [salvando, setSalvando] = useState(false);
  const leuRef = useRef(false);

  const meses = useMemo(() => Array.from(new Set([hojeIso().slice(0, 7), ...compras.map((c) => c.data.slice(0, 7))])).sort().reverse().slice(0, 12), [compras]);
  const lista = useMemo(() => {
    const b = normalizar(busca);
    return compras.filter((c) => c.data.startsWith(mes) && (!b || normalizar(`${c.item} ${c.fornecedor ?? ''}`).includes(b)));
  }, [compras, mes, busca]);
  const totalMes = lista.reduce((a, c) => a + c.valorTotal, 0);
  const porDia = useMemo(() => {
    const m = new Map<string, Compra[]>();
    lista.forEach((c) => m.set(c.data, [...(m.get(c.data) ?? []), c]));
    return Array.from(m.entries());
  }, [lista]);

  // ------------------------------------------------------------ cupom (QR)
  async function aoLerQr(texto: string) {
    setLendoQr(false);
    const cupom = cupomDoQr(texto);
    if (!cupom.url) {
      Alert.alert('QR Code', 'Esse QR Code não é de cupom fiscal (NFC-e). Lance os itens à mão.');
      return;
    }
    if (cupom.chave && (await cupomJaLancado(cupom.chave))) {
      Alert.alert('Cupom já lançado', 'Esse cupom já foi lançado nas compras.');
      return;
    }
    leuRef.current = false;
    setPaginaCupom({ url: cupom.url, chave: cupom.chave });
  }

  function aoMensagemCupom(ev: { nativeEvent: { data: string } }) {
    let m: any;
    try {
      m = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (m.tipo !== 'nfce' || leuRef.current) return;
    const r = lerItensCupom(m.linhas || [], m.corpo || '');
    if (!r.itens.length) return; // página ainda carregando — tenta de novo no próximo aviso
    leuRef.current = true;
    const chave = paginaCupom?.chave ?? null;
    setPaginaCupom(null);
    setLote({
      data: r.data ?? hojeIso(),
      fornecedor: r.emitente ?? '',
      cupomChave: chave,
      aviso: r.total != null && Math.abs(r.total - r.itens.reduce((a, i) => a + i.valorTotal, 0)) > 0.05 ? `A soma dos itens não bate com o total do cupom (${reais(r.total)}). Confira.` : undefined,
      linhas: r.itens.map((i) => ({
        chave: Math.random().toString(36).slice(2),
        item: i.nome,
        quantidade: numeroTexto(i.quantidade, 3),
        unidade: i.unidade.toLowerCase(),
        valor: numeroTexto(i.valorTotal),
        categoria: categoriaSugerida(i.nome),
      })),
    });
  }

  async function salvarLote() {
    if (!lote) return;
    const linhas = lote.linhas.filter((l) => l.item.trim());
    if (!linhas.length) return Alert.alert('Sem itens', 'Adicione pelo menos um item.');
    const semValor = linhas.find((l) => numeroDigitado(l.valor) == null);
    if (semValor) return Alert.alert('Falta o valor', `Preencha o valor de "${semValor.item}".`);
    setSalvando(true);
    try {
      await inserirCompras(
        linhas.map((l) => ({
          data: lote.data,
          item: l.item,
          categoria: l.categoria,
          quantidade: numeroDigitado(l.quantidade),
          unidade: l.unidade || null,
          valorTotal: numeroDigitado(l.valor) ?? 0,
          fornecedor: lote.fornecedor || null,
          observacao: null,
          cupomChave: lote.cupomChave,
        })),
      );
      onConfig(await lembrarNaLista(config, 'fornecedores', lote.fornecedor));
      setLote(null);
      await onRecarregar();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    } finally {
      setSalvando(false);
    }
  }

  const mudarLinha = (chave: string, p: Partial<Linha>) => lote && setLote({ ...lote, linhas: lote.linhas.map((l) => (l.chave === chave ? { ...l, ...p } : l)) });
  const categorias = config.categoriasCompra.length ? config.categoriasCompra : ['Insumos', 'Embalagens', 'Outros'];
  const topoModal = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 50;

  return (
    <View style={s.tela}>
      <Topo titulo="Compras" sub={`${reais(totalMes)} em ${lista.length} itens`} onVoltar={onVoltar} icone="shopping-bag" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Botao texto="Ler cupom fiscal" icone="maximize" onPress={() => setLendoQr(true)} style={{ flex: 1 }} />
          <Botao texto="Lançar à mão" icone="edit-3" tipo="claro" onPress={() => setLote({ data: hojeIso(), fornecedor: '', cupomChave: null, linhas: [nova()] })} style={{ flex: 1 }} />
        </View>
        <Text style={s.dica}>No cupom, aponte a câmera para o QR Code: os produtos entram sozinhos e você confere, corrige ou exclui antes de salvar.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {meses.map((m) => (
            <TouchableOpacity key={m} onPress={() => setMes(m)} style={[s.chip, mes === m && s.chipAtivo]}>
              <Text style={[s.chipTxt, mes === m && s.chipTxtAtivo]}>{m.split('-').reverse().join('/')}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TextInput style={[s.busca, { marginTop: 0 }]} value={busca} onChangeText={setBusca} placeholder="Buscar item ou fornecedor" placeholderTextColor="#C4AEB5" />
        {!lista.length ? <Vazio icone="shopping-bag" texto="Nenhuma compra nesse mês." /> : null}
        {porDia.map(([dia, itens]) => (
          <View key={dia} style={{ gap: 8 }}>
            <View style={[s.linha, { justifyContent: 'space-between' }]}>
              <Text style={s.secao}>{dataBr(dia)}</Text>
              <Text style={{ color: C.suave, fontWeight: '700' }}>{reais(itens.reduce((a, c) => a + c.valorTotal, 0))}</Text>
            </View>
            <Cartao style={{ padding: 0, gap: 0 } as any}>
              {itens.map((c, k) => (
                <TouchableOpacity key={c.id} onPress={() => setEditando(c)} style={[{ padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }, k > 0 && { borderTopWidth: 1, borderTopColor: C.rosaBorda }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.texto, fontWeight: '700' }} numberOfLines={2}>
                      {c.item}
                    </Text>
                    <Text style={s.dica}>
                      {[c.quantidade != null ? `${numeroTexto(c.quantidade, 3)} ${c.unidade ?? ''}`.trim() : null, c.fornecedor, c.categoria].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={{ color: C.chocolate, fontWeight: '800' }}>{reais(c.valorTotal)}</Text>
                </TouchableOpacity>
              ))}
            </Cartao>
          </View>
        ))}
      </ScrollView>

      <LeitorCodigo visivel={lendoQr} modo="qr" onLido={aoLerQr} onCancelar={() => setLendoQr(false)} />

      {/* página da Fazenda carregando (os itens são lidos sozinhos) */}
      <Modal visible={!!paginaCupom} animationType="slide" onRequestClose={() => setPaginaCupom(null)}>
        <View style={{ flex: 1, backgroundColor: C.fundo, paddingTop: topoModal }}>
          <View style={[s.linha, { padding: 14 }]}>
            <ActivityIndicator color={C.rosa} />
            <Text style={[s.titulo, { flex: 1 }]}>Lendo os produtos do cupom…</Text>
            <TouchableOpacity onPress={() => setPaginaCupom(null)} hitSlop={12}>
              <Feather name="x" size={22} color={C.rosaEsc} />
            </TouchableOpacity>
          </View>
          <Text style={[s.dica, { paddingHorizontal: 14, paddingBottom: 8 }]}>
            Se a página pedir alguma confirmação, toque nela. Quando os produtos aparecerem, eles são copiados sozinhos.
          </Text>
          {paginaCupom ? (
            <WebView
              source={{ uri: paginaCupom.url }}
              onMessage={aoMensagemCupom}
              injectedJavaScript={JS_LER_NFCE}
              onLoadEnd={() => setTimeout(() => {}, 0)}
              javaScriptEnabled
              domStorageEnabled
              style={{ flex: 1 }}
              onNavigationStateChange={() => {}}
              injectedJavaScriptBeforeContentLoaded={`setInterval(function(){ try { ${JS_LER_NFCE.replace(/\n/g, ' ')} } catch(e){} }, 2500); true;`}
            />
          ) : null}
          <View style={{ padding: 14 }}>
            <Botao
              texto="Não leu? Lançar à mão"
              tipo="claro"
              icone="edit-3"
              onPress={() => {
                const chave = paginaCupom?.chave ?? null;
                setPaginaCupom(null);
                setLote({ data: hojeIso(), fornecedor: '', cupomChave: chave, linhas: [nova()] });
              }}
            />
          </View>
        </View>
      </Modal>

      {/* conferir / lançar itens */}
      <Folha
        visivel={!!lote}
        titulo={lote?.cupomChave ? 'Itens do cupom' : 'Nova compra'}
        onFechar={() => setLote(null)}
        rodape={
          lote ? (
            <>
              <View style={[s.linha, { justifyContent: 'space-between' }]}>
                <Text style={s.sub}>{lote.linhas.length} itens</Text>
                <Text style={s.valor}>{reais(lote.linhas.reduce((a, l) => a + (numeroDigitado(l.valor) ?? 0), 0))}</Text>
              </View>
              <Botao texto={salvando ? 'Salvando…' : 'Salvar compra'} icone="check" onPress={salvarLote} desativado={salvando} />
            </>
          ) : null
        }
      >
        {lote ? (
          <>
            {lote.aviso ? <Text style={[s.pill, { backgroundColor: C.ouroClaro, color: '#9A6B12', alignSelf: 'stretch' }]}>{lote.aviso}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Data" value={lote.dataTxt ?? dataBr(lote.data)} onChangeText={(t) => {
                  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                  setLote({ ...lote, dataTxt: t, data: m ? `${m[3]}-${m[2]}-${m[1]}` : lote.data });
                }} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
              </View>
            </View>
            <CampoComLista rotulo="Onde comprou" valor={lote.fornecedor} onMudar={(t) => setLote({ ...lote, fornecedor: t })} lista={config.fornecedores} placeholder="Ex.: Super. BH" />
            {lote.linhas.map((l) => (
              <Cartao key={l.chave} style={{ padding: 12, gap: 8 } as any}>
                <View style={s.linha}>
                  <TextInput style={[s.input, { flex: 1, paddingVertical: 8 }]} value={l.item} onChangeText={(t) => mudarLinha(l.chave, { item: t })} placeholder="Produto" placeholderTextColor="#C4AEB5" />
                  <TouchableOpacity hitSlop={10} onPress={() => setLote({ ...lote, linhas: lote.linhas.filter((x) => x.chave !== l.chave) })}>
                    <Feather name="trash-2" size={18} color={C.vermelho} />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[s.input, { flex: 1, paddingVertical: 8 }]} value={l.quantidade} onChangeText={(t) => mudarLinha(l.chave, { quantidade: t })} keyboardType="decimal-pad" placeholder="Qtd" placeholderTextColor="#C4AEB5" />
                  <TextInput style={[s.input, { width: 70, paddingVertical: 8 }]} value={l.unidade} onChangeText={(t) => mudarLinha(l.chave, { unidade: t })} placeholder="un" placeholderTextColor="#C4AEB5" />
                  <TextInput style={[s.input, { flex: 1.3, paddingVertical: 8, fontWeight: '800' }]} value={l.valor} onChangeText={(t) => mudarLinha(l.chave, { valor: t })} keyboardType="decimal-pad" placeholder="R$ total" placeholderTextColor="#C4AEB5" />
                </View>
                <Chips opcoes={categorias} valor={l.categoria} onMudar={(v) => v && mudarLinha(l.chave, { categoria: v })} />
              </Cartao>
            ))}
            <Botao texto="Adicionar item" icone="plus" tipo="claro" onPress={() => setLote({ ...lote, linhas: [...lote.linhas, nova()] })} />
          </>
        ) : null}
      </Folha>

      {/* editar uma compra lançada */}
      {editando ? (
        <EditarCompra
          compra={editando}
          categorias={categorias}
          fornecedores={config.fornecedores}
          onFechar={() => setEditando(null)}
          onSalvo={async () => {
            setEditando(null);
            await onRecarregar();
          }}
        />
      ) : null}
    </View>
  );
}

function EditarCompra({ compra, categorias, fornecedores, onFechar, onSalvo }: { compra: Compra; categorias: string[]; fornecedores: string[]; onFechar: () => void; onSalvo: () => void }) {
  const [c, setC] = useState({ ...compra, qtdTxt: numeroTexto(compra.quantidade, 3), valorTxt: numeroTexto(compra.valorTotal), dataTxt: dataBr(compra.data) });
  async function salvar() {
    const m = c.dataTxt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const dados: NovaCompra = {
      data: m ? `${m[3]}-${m[2]}-${m[1]}` : compra.data,
      item: c.item,
      categoria: c.categoria,
      quantidade: numeroDigitado(c.qtdTxt),
      unidade: c.unidade,
      valorTotal: numeroDigitado(c.valorTxt) ?? 0,
      fornecedor: c.fornecedor,
      observacao: c.observacao,
      cupomChave: compra.cupomChave,
    };
    try {
      await atualizarCompra(compra.id, dados);
      onSalvo();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    }
  }
  return (
    <Folha visivel titulo="Editar compra" onFechar={onFechar} rodape={<Botao texto="Salvar" icone="check" onPress={salvar} />}>
      <Campo rotulo="Produto" value={c.item} onChangeText={(t) => setC({ ...c, item: t })} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Quantidade" value={c.qtdTxt} onChangeText={(t) => setC({ ...c, qtdTxt: t })} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Campo rotulo="Unidade" value={c.unidade ?? ''} onChangeText={(t) => setC({ ...c, unidade: t })} />
        </View>
      </View>
      <Campo rotulo="Valor total (R$)" value={c.valorTxt} onChangeText={(t) => setC({ ...c, valorTxt: t })} keyboardType="decimal-pad" />
      <Campo rotulo="Data" value={c.dataTxt} onChangeText={(t) => setC({ ...c, dataTxt: t })} placeholder="dd/mm/aaaa" />
      <CampoComLista rotulo="Onde comprou" valor={c.fornecedor ?? ''} onMudar={(t) => setC({ ...c, fornecedor: t })} lista={fornecedores} />
      <Text style={s.rotulo}>Categoria</Text>
      <Chips opcoes={categorias} valor={c.categoria} onMudar={(v) => setC({ ...c, categoria: v })} />
      <Botao
        texto="Excluir compra"
        icone="trash-2"
        tipo="perigo"
        onPress={() =>
          confirmar('Excluir?', c.item, async () => {
            await excluirCompra(compra.id).catch((e) => Alert.alert('Erro', e?.message ?? ''));
            onSalvo();
          })
        }
      />
    </Folha>
  );
}
