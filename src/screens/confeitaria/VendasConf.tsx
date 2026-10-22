import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Switch } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  Venda,
  NovaVenda,
  Produto,
  ConfigConf,
  inserirVendas,
  atualizarVenda,
  marcarRecebido,
  excluirVenda,
  lembrarNaLista,
  nomeCompleto,
  numeroDigitado,
  numeroTexto,
  reais,
  dataBr,
  hojeIso,
  normalizar,
} from '../../data/confeitariaApi';
import { C, s, Topo, Cartao, Botao, Campo, Chips, CampoComLista, Folha, Vazio, confirmar } from './ui';

type Props = { vendas: Venda[]; produtos: Produto[]; config: ConfigConf; onConfig: (c: ConfigConf) => void; onVoltar: () => void; onRecarregar: () => Promise<void> };

type LinhaVenda = { chave: string; produtoId: string | null; produto: string; qtd: string; preco: string };
type Rasc = { id?: string; data: string; dataTxt?: string; cliente: string; forma: string | null; recebido: boolean; obs: string; linhas: LinhaVenda[] };

const chaveNova = () => Math.random().toString(36).slice(2);

export default function VendasConf({ vendas, produtos, config, onConfig, onVoltar, onRecarregar }: Props) {
  const [filtro, setFiltro] = useState<'mes' | 'receber' | 'tudo'>('mes');
  const [busca, setBusca] = useState('');
  const [rasc, setRasc] = useState<Rasc | null>(null);
  const [escolhendo, setEscolhendo] = useState<string | null>(null); // chave da linha
  const [buscaProd, setBuscaProd] = useState('');
  const [salvando, setSalvando] = useState(false);
  const mes = hojeIso().slice(0, 7);

  const lista = useMemo(() => {
    const b = normalizar(busca);
    return vendas.filter(
      (v) =>
        (filtro === 'tudo' || (filtro === 'mes' ? v.data.startsWith(mes) : !v.recebido)) &&
        (!b || normalizar(`${v.cliente ?? ''} ${v.produto}`).includes(b)),
    );
  }, [vendas, filtro, busca, mes]);
  const total = lista.reduce((a, v) => a + v.quantidade * v.precoUnitario, 0);
  const aReceber = vendas.filter((v) => !v.recebido).reduce((a, v) => a + v.quantidade * v.precoUnitario, 0);

  const ativos = produtos.filter((p) => p.ativo && p.precoVenda);
  const prodFiltrados = ativos.filter((p) => !buscaProd || normalizar(nomeCompleto(p)).includes(normalizar(buscaProd)));

  function novaVenda() {
    setRasc({ data: hojeIso(), cliente: '', forma: config.formas[0] ?? 'Pix', recebido: true, obs: '', linhas: [{ chave: chaveNova(), produtoId: null, produto: '', qtd: '1', preco: '' }] });
  }
  function editar(v: Venda) {
    setRasc({ id: v.id, data: v.data, cliente: v.cliente ?? '', forma: v.formaPagamento, recebido: v.recebido, obs: v.observacao ?? '', linhas: [{ chave: chaveNova(), produtoId: v.produtoId, produto: v.produto, qtd: numeroTexto(v.quantidade, 3), preco: numeroTexto(v.precoUnitario) }] });
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
      if (rasc.id) await atualizarVenda(rasc.id, base(linhas[0]));
      else await inserirVendas(linhas.map(base));
      onConfig(await lembrarNaLista(config, 'clientes', rasc.cliente));
      setRasc(null);
      await onRecarregar();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarRecebido(v: Venda) {
    try {
      await marcarRecebido(v.id, !v.recebido);
      await onRecarregar();
    } catch (e: any) {
      Alert.alert('Erro', e?.message ?? '');
    }
  }

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
        <Cartao style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as any}>
          <Text style={s.sub}>{lista.length} vendas</Text>
          <Text style={s.valor}>{reais(total)}</Text>
        </Cartao>
        {!lista.length ? <Vazio icone="dollar-sign" texto="Nenhuma venda aqui." /> : null}
        {lista.map((v) => (
          <Cartao key={v.id} onPress={() => editar(v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 } as any}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.titulo} numberOfLines={1}>
                {v.cliente || 'Sem nome'}
              </Text>
              <Text style={s.sub} numberOfLines={2}>
                {numeroTexto(v.quantidade, 3)}× {v.produto}
              </Text>
              <Text style={s.dica}>
                {dataBr(v.data)}
                {v.formaPagamento ? ` · ${v.formaPagamento}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Text style={[s.valor, { fontSize: 17 }]}>{reais(v.quantidade * v.precoUnitario)}</Text>
              <TouchableOpacity onPress={() => alternarRecebido(v)} hitSlop={8}>
                <Text style={[s.pill, v.recebido ? { backgroundColor: C.mentaClaro, color: C.menta } : { backgroundColor: C.ouroClaro, color: '#9A6B12' }]}>
                  {v.recebido ? '✓ Recebido' : 'A receber'}
                </Text>
              </TouchableOpacity>
            </View>
          </Cartao>
        ))}
      </ScrollView>
      <TouchableOpacity style={s.fab} onPress={novaVenda} activeOpacity={0.85}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={s.fabTxt}>Nova venda</Text>
      </TouchableOpacity>

      <Folha
        visivel={!!rasc && !escolhendo}
        titulo={rasc?.id ? 'Editar venda' : 'Nova venda'}
        onFechar={() => setRasc(null)}
        rodape={
          rasc ? (
            <>
              <View style={[s.linha, { justifyContent: 'space-between' }]}>
                <Text style={s.sub}>Total</Text>
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
            <Campo rotulo="Data" value={rasc.dataTxt ?? dataBr(rasc.data)} onChangeText={(t) => {
              const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
              setRasc({ ...rasc, dataTxt: t, data: m ? `${m[3]}-${m[2]}-${m[1]}` : rasc.data });
            }} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
            {rasc.linhas.map((l) => (
              <Cartao key={l.chave} style={{ padding: 12, gap: 8 } as any}>
                <TouchableOpacity onPress={() => { setBuscaProd(''); setEscolhendo(l.chave); }} style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                  <Feather name="gift" size={16} color={C.rosa} />
                  <Text style={{ flex: 1, color: l.produto ? C.texto : '#C4AEB5', fontSize: 15 }} numberOfLines={2}>
                    {l.produto || 'Escolher produto'}
                  </Text>
                  <Feather name="chevron-down" size={16} color={C.suave} />
                </TouchableOpacity>
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
            {!rasc.id ? <Botao texto="Mais um produto" icone="plus" tipo="claro" onPress={() => setRasc({ ...rasc, linhas: [...rasc.linhas, { chave: chaveNova(), produtoId: null, produto: '', qtd: '1', preco: '' }] })} /> : null}
            <Text style={s.rotulo}>Pagamento</Text>
            <Chips opcoes={config.formas} valor={rasc.forma} onMudar={(v) => setRasc({ ...rasc, forma: v })} />
            <View style={[s.linha, { justifyContent: 'space-between' }]}>
              <Text style={s.titulo}>Já recebi</Text>
              <Switch value={rasc.recebido} onValueChange={(v) => setRasc({ ...rasc, recebido: v })} trackColor={{ true: C.menta, false: '#E8DADF' }} thumbColor="#fff" />
            </View>
            <Campo rotulo="Observação" value={rasc.obs} onChangeText={(t) => setRasc({ ...rasc, obs: t })} multiline placeholder="Ex.: entregar sábado" />
            {rasc.id ? (
              <Botao
                texto="Excluir venda"
                icone="trash-2"
                tipo="perigo"
                onPress={() =>
                  confirmar('Excluir venda?', rasc.linhas[0]?.produto ?? '', async () => {
                    await excluirVenda(rasc.id!).catch((e) => Alert.alert('Erro', e?.message ?? ''));
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
