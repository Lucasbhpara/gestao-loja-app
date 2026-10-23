import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Switch, Alert, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  Produto,
  ItemFicha,
  ConfigConf,
  GRUPOS_FICHA,
  CATEGORIAS_PRODUTO,
  custoUnidade,
  custoTotal,
  margemDe,
  precoSugerido,
  custoCalculado,
  numeroDigitado,
  numeroTexto,
  reais,
  normalizar,
  salvarProduto,
  excluirProduto,
  enviarFotoConf,
} from '../../data/confeitariaApi';
import { C, s, Topo, Cartao, Botao, Campo, Chips, Folha, Vazio, confirmar, pegarFoto, escolherOrigemFoto } from './ui';

type Props = {
  produtos: Produto[];
  config: ConfigConf;
  onVoltar: () => void;
  onRecarregar: () => Promise<void>;
};

type Rasc = {
  id?: string;
  nome: string;
  sabor: string;
  categoria: string;
  rendimento: string;
  tamanho: string;
  montagem: string;
  preco: string;
  fotoUrl: string | null;
  fotoLocal: string | null;
  descricao: string;
  ativo: boolean;
  ordem: number;
  itens: (ItemFicha & { custoTxt: string; precoTxt: string; chave: string })[];
};

const novaChave = () => Math.random().toString(36).slice(2);

function rascunhoDe(p?: Produto, ordem = 0): Rasc {
  return {
    id: p?.id,
    nome: p?.nome ?? '',
    sabor: p?.sabor ?? '',
    categoria: p?.categoria ?? 'Doces',
    rendimento: p ? numeroTexto(p.rendimento) : '',
    tamanho: p?.tamanho ?? '',
    montagem: p?.montagem ?? '',
    preco: p?.precoVenda != null ? numeroTexto(p.precoVenda) : '',
    fotoUrl: p?.fotoUrl ?? null,
    fotoLocal: null,
    descricao: p?.descricao ?? '',
    ativo: p?.ativo ?? true,
    ordem: p?.ordem ?? ordem,
    itens: (p?.itens ?? []).map((i) => ({ ...i, custoTxt: numeroTexto(i.custo, 4), precoTxt: i.precoEmbalagem != null ? numeroTexto(i.precoEmbalagem) : '', chave: novaChave() })),
  };
}

export function corMargem(m: number | null) {
  if (m == null) return { fundo: C.rosaClaro, cor: C.suave };
  if (m >= 0.5) return { fundo: C.mentaClaro, cor: C.menta };
  if (m >= 0.3) return { fundo: C.ouroClaro, cor: '#9A6B12' };
  return { fundo: C.vermelhoClaro, cor: C.vermelho };
}

export default function ProdutosConf({ produtos, config, onVoltar, onRecarregar }: Props) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [rasc, setRasc] = useState<Rasc | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const categorias = useMemo(() => Array.from(new Set([...CATEGORIAS_PRODUTO, ...produtos.map((p) => p.categoria)])).filter(Boolean), [produtos]);
  const lista = useMemo(() => {
    const b = normalizar(busca);
    return produtos.filter((p) => (!categoria || p.categoria === categoria) && (!b || normalizar(`${p.nome} ${p.sabor}`).includes(b)));
  }, [produtos, busca, categoria]);

  // ---------------------------------------------------------------- editor
  const prodDoRasc = (r: Rasc) => ({
    rendimento: numeroDigitado(r.rendimento) || 1,
    precoVenda: numeroDigitado(r.preco),
    itens: r.itens.map((i) => ({ ...i, custo: numeroDigitado(i.custoTxt) ?? 0 })),
  });

  function mudarItem(chave: string, parte: Partial<Rasc['itens'][number]>) {
    if (!rasc) return;
    setRasc({
      ...rasc,
      itens: rasc.itens.map((i) => {
        if (i.chave !== chave) return i;
        const novo = { ...i, ...parte };
        // recalcula o custo quando dá (ex.: "150 g" de uma embalagem de "2 kg" a R$ 7,00)
        if ('qtdTexto' in parte || 'embalagemTexto' in parte || 'precoTxt' in parte) {
          const preco = numeroDigitado(novo.precoTxt);
          novo.precoEmbalagem = preco;
          const c = custoCalculado(novo.qtdTexto, novo.embalagemTexto, preco);
          if (c != null) novo.custoTxt = numeroTexto(c, 2);
        }
        return novo;
      }),
    });
  }

  function addItem(grupo: string) {
    if (!rasc) return;
    const item = { grupo, nome: '', qtdTexto: '', embalagemTexto: '', precoEmbalagem: null, custo: 0, opcional: false, custoTxt: '', precoTxt: '', chave: novaChave() };
    const ultimoDoGrupo = rasc.itens.map((i) => i.grupo).lastIndexOf(grupo);
    const itens = [...rasc.itens];
    itens.splice(ultimoDoGrupo >= 0 ? ultimoDoGrupo + 1 : itens.length, 0, item);
    setRasc({ ...rasc, itens });
  }

  async function trocarFoto() {
    escolherOrigemFoto(async (o) => {
      const f = await pegarFoto(o);
      if (f && rasc) setRasc({ ...rasc, fotoLocal: f.uri });
    });
  }

  async function salvar() {
    if (!rasc) return;
    if (!rasc.nome.trim()) return Alert.alert('Falta o nome', 'Dê um nome para o produto.');
    const sem = rasc.itens.find((i) => !i.nome.trim());
    if (sem) return Alert.alert('Item sem nome', `Tem um item em "${sem.grupo}" sem nome. Preencha ou exclua.`);
    setSalvando(true);
    try {
      let fotoUrl = rasc.fotoUrl;
      if (rasc.fotoLocal) fotoUrl = await enviarFotoConf(rasc.fotoLocal, 'produtos');
      const base = prodDoRasc(rasc);
      await salvarProduto({
        id: rasc.id,
        nome: rasc.nome,
        sabor: rasc.sabor,
        categoria: rasc.categoria,
        rendimento: base.rendimento,
        tamanho: rasc.tamanho,
        montagem: rasc.montagem,
        precoVenda: base.precoVenda,
        fotoUrl,
        descricao: rasc.descricao,
        ativo: rasc.ativo,
        ordem: rasc.ordem,
        itens: base.itens.map(({ custoTxt, precoTxt, chave, ...i }) => i),
      });
      setRasc(null);
      await onRecarregar();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  function duplicar() {
    if (!rasc) return;
    setRasc({ ...rasc, id: undefined, sabor: rasc.sabor ? `${rasc.sabor} (cópia)` : 'Cópia', fotoUrl: rasc.fotoUrl, itens: rasc.itens.map((i) => ({ ...i, id: undefined, chave: novaChave() })) });
  }

  // ---------------------------------------------------------------- telas
  const editor = rasc
    ? (() => {
        const base = prodDoRasc(rasc);
        const cu = custoUnidade(base);
        const ct = custoTotal(base);
        const mg = margemDe(base);
        const sug = precoSugerido(base, config.margem);
        const cor = corMargem(mg);
        const grupos = Array.from(new Set([...GRUPOS_FICHA, ...rasc.itens.map((i) => i.grupo)]));
        return (
          <Folha
            visivel
            titulo={rasc.id ? 'Editar produto' : 'Novo produto'}
            onFechar={() => setRasc(null)}
            rodape={
              <>
                <View style={[s.linha, { justifyContent: 'space-between' }]}>
                  <View>
                    <Text style={s.sub}>Custo por unidade</Text>
                    <Text style={s.valor}>{reais(cu)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.sub}>{base.precoVenda ? `Lucro ${reais(base.precoVenda - cu)}` : 'Sem preço'}</Text>
                    <Text style={[s.pill, { backgroundColor: cor.fundo, color: cor.cor }]}>{mg == null ? '—' : `${Math.round(mg * 100)}% de margem`}</Text>
                  </View>
                </View>
                <Botao texto={salvando ? 'Salvando…' : 'Salvar produto'} icone="check" onPress={salvar} desativado={salvando} />
              </>
            }
          >
            <TouchableOpacity onPress={trocarFoto} activeOpacity={0.85} style={{ alignSelf: 'center' }}>
              {rasc.fotoLocal || rasc.fotoUrl ? (
                <Image source={{ uri: rasc.fotoLocal || rasc.fotoUrl! }} style={{ width: 220, height: 165, borderRadius: 22 }} />
              ) : (
                <View style={{ width: 220, height: 165, borderRadius: 22, backgroundColor: C.rosaClaro, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Feather name="camera" size={28} color={C.rosa} />
                  <Text style={{ color: C.rosaEsc, fontWeight: '700' }}>Foto do produto</Text>
                </View>
              )}
            </TouchableOpacity>
            <Campo rotulo="Produto" value={rasc.nome} onChangeText={(t) => setRasc({ ...rasc, nome: t })} placeholder="Ex.: Mini Pudim" />
            <Campo rotulo="Sabor" value={rasc.sabor} onChangeText={(t) => setRasc({ ...rasc, sabor: t })} placeholder="Ex.: Leite Ninho" />
            <Text style={s.rotulo}>Categoria</Text>
            <Chips opcoes={Array.from(new Set([...CATEGORIAS_PRODUTO, rasc.categoria]))} valor={rasc.categoria} onMudar={(v) => v && setRasc({ ...rasc, categoria: v })} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Rende (unid.)" value={rasc.rendimento} onChangeText={(t) => setRasc({ ...rasc, rendimento: t })} keyboardType="decimal-pad" placeholder="12" />
              </View>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Tamanho" value={rasc.tamanho} onChangeText={(t) => setRasc({ ...rasc, tamanho: t })} placeholder="200 ml" />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Preço de venda (R$)" value={rasc.preco} onChangeText={(t) => setRasc({ ...rasc, preco: t })} keyboardType="decimal-pad" placeholder="0,00" />
              </View>
              <TouchableOpacity onPress={() => setRasc({ ...rasc, preco: numeroTexto(sug) })} style={{ backgroundColor: C.ouroClaro, borderRadius: 14, padding: 10, minHeight: 46, justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, color: '#9A6B12', fontWeight: '700' }}>Sugerido ({Math.round(config.margem * 100)}%)</Text>
                <Text style={{ fontSize: 15, color: '#9A6B12', fontWeight: '800' }}>{reais(sug)}</Text>
              </TouchableOpacity>
            </View>
            <Campo rotulo="Montagem / modo de fazer" value={rasc.montagem} onChangeText={(t) => setRasc({ ...rasc, montagem: t })} multiline placeholder="Ex.: 600 g de massa + 500 g de recheio" />

            <Text style={s.secao}>Ficha técnica · {reais(ct)} a receita</Text>
            <Text style={s.dica}>
              Preencha quanto usa e a embalagem (ex.: 150 g de um pacote de 2 kg a R$ 7,00) que o custo é calculado. Se não der pra calcular, digite o custo direto.
            </Text>
            {grupos.map((g) => {
              const doGrupo = rasc.itens.filter((i) => i.grupo === g);
              if (!doGrupo.length && !GRUPOS_FICHA.includes(g)) return null;
              const soma = doGrupo.filter((i) => !i.opcional).reduce((a, i) => a + (numeroDigitado(i.custoTxt) ?? 0), 0);
              return (
                <View key={g} style={{ gap: 8 }}>
                  <View style={[s.linha, { justifyContent: 'space-between' }]}>
                    <Text style={[s.rotulo, { fontSize: 13 }]}>{g}</Text>
                    <Text style={{ color: C.suave, fontWeight: '700' }}>{reais(soma)}</Text>
                  </View>
                  {doGrupo.map((i) => (
                    <View key={i.chave} style={[s.cartao, { padding: 12, gap: 8 }, i.opcional && { opacity: 0.7 }]}>
                      <View style={s.linha}>
                        <TextInput style={[s.input, { flex: 1, paddingVertical: 8 }]} value={i.nome} onChangeText={(t) => mudarItem(i.chave, { nome: t })} placeholder="Ingrediente / embalagem" placeholderTextColor="#C4AEB5" />
                        <TouchableOpacity hitSlop={10} onPress={() => setRasc({ ...rasc, itens: rasc.itens.filter((x) => x.chave !== i.chave) })}>
                          <Feather name="trash-2" size={18} color={C.vermelho} />
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <MiniCampo rotulo="Usa" valor={i.qtdTexto} onMudar={(t) => mudarItem(i.chave, { qtdTexto: t })} ph="150 g" />
                        <MiniCampo rotulo="Embalagem" valor={i.embalagemTexto} onMudar={(t) => mudarItem(i.chave, { embalagemTexto: t })} ph="2 kg" />
                        <MiniCampo rotulo="Preço emb." valor={i.precoTxt} onMudar={(t) => mudarItem(i.chave, { precoTxt: t })} ph="7,00" num />
                        <MiniCampo rotulo="Custo" valor={i.custoTxt} onMudar={(t) => mudarItem(i.chave, { custoTxt: t })} ph="0,53" num destaque />
                      </View>
                      <View style={[s.linha, { justifyContent: 'space-between' }]}>
                        <Text style={s.dica}>Opcional (não entra no custo)</Text>
                        <Switch value={i.opcional} onValueChange={(v) => mudarItem(i.chave, { opcional: v })} trackColor={{ true: C.rosa, false: '#E8DADF' }} thumbColor="#fff" />
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity onPress={() => addItem(g)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 }}>
                    <Feather name="plus-circle" size={17} color={C.rosa} />
                    <Text style={{ color: C.rosaEsc, fontWeight: '700' }}>Adicionar em {g}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <View style={[s.linha, { justifyContent: 'space-between', marginTop: 6 }]}>
              <Text style={s.titulo}>Aparece na vitrine</Text>
              <Switch value={rasc.ativo} onValueChange={(v) => setRasc({ ...rasc, ativo: v })} trackColor={{ true: C.rosa, false: '#E8DADF' }} thumbColor="#fff" />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Botao texto="Duplicar" icone="copy" tipo="claro" onPress={duplicar} style={{ flex: 1 }} />
              {rasc.id ? (
                <Botao
                  texto="Excluir"
                  icone="trash-2"
                  tipo="perigo"
                  style={{ flex: 1 }}
                  onPress={() =>
                    confirmar('Excluir produto?', `${rasc.nome} ${rasc.sabor} e a ficha técnica dele serão apagados.`, async () => {
                      try {
                        await excluirProduto(rasc.id!);
                        setRasc(null);
                        await onRecarregar();
                      } catch (e: any) {
                        Alert.alert('Não consegui excluir', e?.message ?? '');
                      }
                    })
                  }
                />
              ) : null}
            </View>
          </Folha>
        );
      })()
    : null;

  return (
    <View style={s.tela}>
      <Topo titulo="Produtos e receitas" sub={`${produtos.length} fichas técnicas · toque para editar`} onVoltar={onVoltar} icone="book-open" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={async () => { setAtualizando(true); await onRecarregar(); setAtualizando(false); }} />}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput style={[s.busca, { marginTop: 0 }]} value={busca} onChangeText={setBusca} placeholder="Buscar produto ou sabor" placeholderTextColor="#C4AEB5" />
        <Chips opcoes={categorias} valor={categoria} onMudar={setCategoria} permitirVazio />
        {!lista.length ? <Vazio icone="book-open" texto="Nenhum produto aqui ainda. Toque em “Novo produto” para criar a primeira ficha." /> : null}
        {lista.map((p) => {
          const cu = custoUnidade(p);
          const mg = margemDe(p);
          const cor = corMargem(mg);
          return (
            <Cartao key={p.id} onPress={() => setRasc(rascunhoDe(p))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 } as any}>
              {p.fotoUrl ? (
                <Image source={{ uri: p.fotoUrl }} style={{ width: 64, height: 64, borderRadius: 16 }} />
              ) : (
                <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: C.rosaClaro, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="gift" size={24} color={C.rosa} />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.titulo, { flexShrink: 1 }]} numberOfLines={1}>
                    {p.nome}
                  </Text>
                  <Feather name="edit-2" size={13} color={C.rosa} />
                </View>
                {p.sabor ? (
                  <Text style={s.sub} numberOfLines={1}>
                    {p.sabor}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 12.5, color: C.suave, marginTop: 2 }}>
                  Custo {reais(cu)} · rende {numeroTexto(p.rendimento)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[s.valor, { fontSize: 17 }]}>{p.precoVenda ? reais(p.precoVenda) : '—'}</Text>
                <Text style={[s.pill, { backgroundColor: cor.fundo, color: cor.cor }]}>{mg == null ? 'sem preço' : `${Math.round(mg * 100)}%`}</Text>
              </View>
            </Cartao>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={s.fab} onPress={() => setRasc(rascunhoDe(undefined, produtos.length))} activeOpacity={0.85}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={s.fabTxt}>Novo produto</Text>
      </TouchableOpacity>
      {editor}
    </View>
  );
}

function MiniCampo({ rotulo, valor, onMudar, ph, num, destaque }: { rotulo: string; valor: string; onMudar: (t: string) => void; ph: string; num?: boolean; destaque?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: C.suave, textTransform: 'uppercase' }}>{rotulo}</Text>
      <TextInput
        style={[s.input, { paddingHorizontal: 8, paddingVertical: 7, fontSize: 13 }, destaque && { borderColor: C.rosa, fontWeight: '800' }]}
        value={valor}
        onChangeText={onMudar}
        placeholder={ph}
        placeholderTextColor="#D6C3C9"
        keyboardType={num ? 'decimal-pad' : 'default'}
      />
    </View>
  );
}
