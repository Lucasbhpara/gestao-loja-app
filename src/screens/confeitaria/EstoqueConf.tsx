import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  ItemEstoque,
  MovEstoque,
  Produto,
  listarMovimentos,
  salvarItemEstoque,
  excluirItemEstoque,
  movimentar,
  criarEstoqueDasFichas,
  qtdEstoqueTexto,
  statusEstoque,
  medida,
  numeroDigitado,
  numeroTexto,
  normalizar,
} from '../../data/confeitariaApi';
import { C, s, Topo, Cartao, Botao, Campo, Chips, Folha, Vazio, confirmar } from './ui';

type Props = { estoque: ItemEstoque[]; produtos: Produto[]; onVoltar: () => void; onRecarregar: () => Promise<void> };

const COR_STATUS = {
  zerado: { texto: 'Zerado', fundo: C.vermelhoClaro, cor: C.vermelho },
  baixo: { texto: 'Baixo', fundo: C.ouroClaro, cor: '#9A6B12' },
  ok: { texto: 'OK', fundo: C.mentaClaro, cor: C.menta },
  sem_minimo: { texto: 'Sem mínimo', fundo: '#F3ECEE', cor: C.suave },
};

// "1,5 kg" → 1500 (g) · "750" → 750 · "2 cx" de 395 g → 790
export function qtdDigitada(t: string, it: Pick<ItemEstoque, 'unidade' | 'embalagemQtd'>): number | null {
  const m = medida(t);
  if (m && m.base === it.unidade) return m.valor;
  if (m && m.base === 'un' && it.embalagemQtd && /[a-z]/i.test(t)) return m.valor * it.embalagemQtd;
  return numeroDigitado(t);
}

export default function EstoqueConf({ estoque, produtos, onVoltar, onRecarregar }: Props) {
  const [filtro, setFiltro] = useState<string>('Todos');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<ItemEstoque | 'novo' | null>(null);
  const [contando, setContando] = useState<Record<string, string> | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const baixos = estoque.filter((i) => ['zerado', 'baixo'].includes(statusEstoque(i)) && i.minimo > 0);
  const lista = useMemo(() => {
    const b = normalizar(busca);
    return estoque.filter((i) => {
      const st = statusEstoque(i);
      if (filtro === 'Comprar' && !(i.minimo > 0 && (st === 'baixo' || st === 'zerado'))) return false;
      if (filtro === 'Zerados' && st !== 'zerado') return false;
      if (filtro === 'Sem mínimo' && i.minimo > 0) return false;
      return !b || i.chave.includes(b);
    });
  }, [estoque, filtro, busca]);

  async function gerarDasFichas() {
    setTrabalhando(true);
    try {
      const n = await criarEstoqueDasFichas(produtos, estoque);
      await onRecarregar();
      Alert.alert('Pronto', n ? `${n} ingredientes e embalagens das suas receitas entraram no estoque. Agora faça a contagem inicial.` : 'Todos os itens das receitas já estão no estoque.');
    } catch (e: any) {
      Alert.alert('Não consegui criar', e?.message ?? '');
    } finally {
      setTrabalhando(false);
    }
  }

  async function salvarContagem() {
    if (!contando) return;
    const mudou = estoque.filter((i) => contando[i.id] != null && contando[i.id].trim() !== '');
    if (!mudou.length) return setContando(null);
    setTrabalhando(true);
    try {
      for (const i of mudou) {
        const v = qtdDigitada(contando[i.id], i);
        if (v == null) continue;
        await movimentar(i.id, 'contagem', v, 'Contagem');
      }
      setContando(null);
      await onRecarregar();
      Alert.alert('Contagem salva', `${mudou.length} ${mudou.length === 1 ? 'item atualizado' : 'itens atualizados'}.`);
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    } finally {
      setTrabalhando(false);
    }
  }

  // ------------------------------------------------------------ contagem
  if (contando) {
    return (
      <View style={s.tela}>
        <Topo titulo="Contagem" sub="Digite quanto tem de cada item agora" onVoltar={() => setContando(null)} icone="clipboard" />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
          <Text style={s.dica}>Deixe em branco o que não contou. Pode digitar em kg/L (ex.: “1,5 kg”) ou em caixas (ex.: “2 cx”) que o app converte.</Text>
          <TextInput style={[s.busca, { marginTop: 0 }]} value={busca} onChangeText={setBusca} placeholder="Buscar item" placeholderTextColor="#C4AEB5" />
          {lista.map((i) => (
            <View key={i.id} style={[s.cartao, { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.texto }} numberOfLines={2}>
                  {i.nome}
                </Text>
                <Text style={s.dica}>Agora: {qtdEstoqueTexto(i.quantidade, i.unidade)}</Text>
              </View>
              <TextInput
                style={[s.input, { width: 110, paddingVertical: 8, textAlign: 'right', fontWeight: '800' }]}
                value={contando[i.id] ?? ''}
                onChangeText={(t) => setContando({ ...contando, [i.id]: t })}
                placeholder={i.unidade}
                placeholderTextColor="#C4AEB5"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          ))}
        </ScrollView>
        <View style={[s.folhaRodape, { position: 'absolute', left: 0, right: 0, bottom: 0 }]}>
          <Botao texto={trabalhando ? 'Salvando…' : 'Salvar contagem'} icone="check" onPress={salvarContagem} desativado={trabalhando} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.tela}>
      <Topo titulo="Estoque" sub={baixos.length ? `${baixos.length} ${baixos.length === 1 ? 'item para comprar' : 'itens para comprar'}` : `${estoque.length} itens`} onVoltar={onVoltar} icone="archive" />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={async () => { setAtualizando(true); await onRecarregar(); setAtualizando(false); }} />}
      >
        {!estoque.length ? (
          <Cartao style={{ gap: 12 } as any}>
            <Text style={s.titulo}>Vamos começar o estoque?</Text>
            <Text style={s.sub}>O app cria os itens com os ingredientes e embalagens das suas receitas. Depois é só fazer a contagem inicial e definir o mínimo de cada um.</Text>
            <Botao texto={trabalhando ? 'Criando…' : 'Criar a partir das receitas'} icone="zap" onPress={gerarDasFichas} desativado={trabalhando} />
          </Cartao>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Botao texto="Fazer contagem" icone="clipboard" onPress={() => setContando({})} style={{ flex: 1 }} />
              <Botao texto="Puxar receitas" icone="refresh-cw" tipo="claro" onPress={gerarDasFichas} style={{ flex: 1 }} desativado={trabalhando} />
            </View>
            <Text style={s.dica}>
              Produção lançada tira do estoque o que a receita usa; compra lançada põe no estoque. Todo dia às 16:30 chega um aviso se algum item estiver abaixo do mínimo.
            </Text>
          </>
        )}
        <Chips opcoes={['Todos', 'Comprar', 'Zerados', 'Sem mínimo']} valor={filtro} onMudar={(v) => setFiltro(v ?? 'Todos')} />
        <TextInput style={[s.busca, { marginTop: 0 }]} value={busca} onChangeText={setBusca} placeholder="Buscar item" placeholderTextColor="#C4AEB5" />
        {estoque.length && !lista.length ? <Vazio icone="archive" texto="Nada aqui." /> : null}
        {lista.map((i) => {
          const st = COR_STATUS[statusEstoque(i)];
          const pct = i.minimo > 0 ? Math.min(1, i.quantidade / (i.minimo * 2)) : null;
          return (
            <Cartao key={i.id} onPress={() => setAberto(i)} style={{ padding: 12, gap: 6 } as any}>
              <View style={s.linha}>
                <Text style={[s.titulo, { flex: 1, fontSize: 15 }]} numberOfLines={1}>
                  {i.nome}
                </Text>
                <Text style={[s.pill, { backgroundColor: st.fundo, color: st.cor }]}>{st.texto}</Text>
              </View>
              <View style={[s.linha, { justifyContent: 'space-between' }]}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: C.chocolate }}>{qtdEstoqueTexto(i.quantidade, i.unidade)}</Text>
                <Text style={s.dica}>{i.minimo > 0 ? `mínimo ${qtdEstoqueTexto(i.minimo, i.unidade)}` : 'defina o mínimo'}</Text>
              </View>
              {pct != null ? (
                <View style={{ height: 6, borderRadius: 3, backgroundColor: '#F3E6EA', overflow: 'hidden' }}>
                  <View style={{ width: `${Math.max(3, pct * 100)}%`, height: '100%', backgroundColor: st.cor }} />
                </View>
              ) : null}
            </Cartao>
          );
        })}
      </ScrollView>
      <TouchableOpacity style={s.fab} onPress={() => setAberto('novo')}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={s.fabTxt}>Novo item</Text>
      </TouchableOpacity>
      {aberto ? (
        <ItemFolha
          item={aberto === 'novo' ? null : aberto}
          onFechar={() => setAberto(null)}
          onSalvo={async () => {
            setAberto(null);
            await onRecarregar();
          }}
        />
      ) : null}
    </View>
  );
}

function ItemFolha({ item, onFechar, onSalvo }: { item: ItemEstoque | null; onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(item?.nome ?? '');
  const [unidade, setUnidade] = useState<string>(item?.unidade ?? 'un');
  const [emb, setEmb] = useState(item?.embalagemTexto ?? '');
  const [minimo, setMinimo] = useState(item && item.minimo ? numeroTexto(item.minimo, 3) : '');
  const [contagem, setContagem] = useState('');
  const [mov, setMov] = useState<MovEstoque[] | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (item) listarMovimentos(item.id).then(setMov).catch(() => setMov([]));
  }, [item?.id]);

  const embMedida = medida(emb);
  const base = { unidade: unidade as ItemEstoque['unidade'], embalagemQtd: embMedida && embMedida.base === unidade ? embMedida.valor : null };

  async function salvar() {
    if (!nome.trim()) return Alert.alert('Falta o nome', 'Como se chama esse item?');
    setSalvando(true);
    try {
      const id = await salvarItemEstoque({ id: item?.id, nome, unidade, minimo: qtdDigitada(minimo, base) ?? 0, embalagemQtd: base.embalagemQtd, embalagemTexto: emb });
      const v = contagem.trim() ? qtdDigitada(contagem, base) : null;
      if (v != null) await movimentar(id, 'contagem', v, item ? 'Contagem' : 'Contagem inicial');
      onSalvo();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', /duplicate|unique/i.test(e?.message ?? '') ? 'Já existe um item com esse nome.' : e?.message ?? '');
    } finally {
      setSalvando(false);
    }
  }

  const nomeTipo: Record<string, string> = { contagem: 'Contagem', compra: 'Compra', producao: 'Produção', ajuste: 'Ajuste', estorno: 'Estorno' };
  return (
    <Folha visivel titulo={item ? item.nome : 'Novo item'} onFechar={onFechar} rodape={<Botao texto={salvando ? 'Salvando…' : 'Salvar'} icone="check" onPress={salvar} desativado={salvando} />}>
      {item ? (
        <Cartao style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as any}>
          <Text style={s.sub}>Tem agora</Text>
          <Text style={s.valor}>{qtdEstoqueTexto(item.quantidade, item.unidade)}</Text>
        </Cartao>
      ) : null}
      <Campo rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Ex.: Leite condensado" dica="Use o mesmo nome da receita para a baixa automática funcionar." />
      <Text style={s.rotulo}>Controlar em</Text>
      <Chips opcoes={['g', 'ml', 'un']} valor={unidade} onMudar={(v) => v && setUnidade(v)} />
      <Campo rotulo="Tamanho da embalagem" value={emb} onChangeText={setEmb} placeholder="Ex.: 395 g, 1 kg, 50 un" dica={base.embalagemQtd ? `Cada embalagem = ${qtdEstoqueTexto(base.embalagemQtd, unidade)}` : 'Ajuda a converter “1 cx” e as compras.'} />
      <Campo rotulo={`Estoque mínimo (${unidade})`} value={minimo} onChangeText={setMinimo} keyboardType="numbers-and-punctuation" placeholder="Ex.: 2 cx, 500 g" dica="Abaixo disso, entra no aviso das 16:30." />
      <Campo rotulo={item ? 'Contar de novo (opcional)' : 'Quanto tem agora'} value={contagem} onChangeText={setContagem} keyboardType="numbers-and-punctuation" placeholder={`Ex.: 3 cx, 1,2 kg, 790 ${unidade}`} />
      {item ? (
        <>
          <Text style={s.secao}>Últimas movimentações</Text>
          {mov == null ? <ActivityIndicator color={C.rosa} /> : !mov.length ? <Text style={s.dica}>Nenhuma ainda.</Text> : null}
          {(mov ?? []).map((m) => (
            <View key={m.id} style={[s.linha, { justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: C.rosaBorda, paddingVertical: 6 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.texto, fontWeight: '700' }}>{nomeTipo[m.tipo] ?? m.tipo}</Text>
                <Text style={s.dica} numberOfLines={1}>
                  {new Date(m.criadoEm).toLocaleDateString('pt-BR')} · {m.referencia ?? ''}
                </Text>
              </View>
              <Text style={{ fontWeight: '800', color: m.tipo === 'contagem' ? C.chocolate : m.quantidade >= 0 ? C.menta : C.vermelho }}>
                {m.tipo === 'contagem' ? '= ' : m.quantidade >= 0 ? '+' : ''}
                {qtdEstoqueTexto(m.quantidade, item.unidade)}
              </Text>
            </View>
          ))}
          <Botao
            texto="Excluir item do estoque"
            icone="trash-2"
            tipo="perigo"
            onPress={() =>
              confirmar('Excluir item?', `${item.nome} sai do estoque (as receitas não mudam).`, async () => {
                await excluirItemEstoque(item.id).catch((e) => Alert.alert('Erro', e?.message ?? ''));
                onSalvo();
              })
            }
          />
        </>
      ) : null}
    </Folha>
  );
}
