import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  Producao,
  Investimento,
  Produto,
  ConfigConf,
  Insumo,
  insumosDasFichas,
  atualizarPrecoInsumo,
  inserirProducao,
  ItemEstoque,
  darBaixaDoLote,
  qtdEstoqueTexto,
  atualizarProducao,
  excluirProducao,
  inserirInvestimento,
  atualizarInvestimento,
  excluirInvestimento,
  salvarConfig,
  enviarFotoConf,
  custoUnidade,
  nomeCompleto,
  numeroDigitado,
  numeroTexto,
  reais,
  dataBr,
  hojeIso,
  normalizar,
} from '../../data/confeitariaApi';
import { LOGO_CONFEITARIA } from '../../data/confeitariaLogo';
import { C, s, Topo, Cartao, Botao, Campo, Chips, Folha, Vazio, confirmar, pegarFoto, escolherOrigemFoto } from './ui';

const dataDigitada = (t: string, atual: string) => {
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : atual;
};

// =============================================================== PRODUÇÃO
export function ProducaoConf({ producao, produtos, estoque, onVoltar, onRecarregar }: { producao: Producao[]; produtos: Produto[]; estoque: ItemEstoque[]; onVoltar: () => void; onRecarregar: () => Promise<void> }) {
  const [r, setR] = useState<{ id?: string; data: string; dataTxt: string; produtoId: string | null; produto: string; qtd: string; custo: string; obs: string } | null>(null);
  const [escolher, setEscolher] = useState(false);
  const [busca, setBusca] = useState('');
  const mes = hojeIso().slice(0, 7);
  const doMes = producao.filter((p) => p.data.startsWith(mes));
  const unidadesMes = doMes.reduce((a, p) => a + p.quantidade, 0);
  const custoMes = doMes.reduce((a, p) => a + p.quantidade * (p.custoUnitario ?? 0), 0);

  async function salvar() {
    if (!r || !r.produto.trim()) return Alert.alert('Falta o produto', 'Escolha o que foi produzido.');
    const dados = { data: dataDigitada(r.dataTxt, r.data), produtoId: r.produtoId, produto: r.produto, quantidade: numeroDigitado(r.qtd) ?? 1, custoUnitario: numeroDigitado(r.custo), observacao: r.obs };
    try {
      let aviso: string | null = null;
      if (r.id) await atualizarProducao(r.id, dados);
      else {
        const id = await inserirProducao(dados);
        // tira do estoque o que a receita usa
        const prod = produtos.find((p) => p.id === r.produtoId);
        if (prod && estoque.length) {
          const b = await darBaixaDoLote(id, prod, dados.quantidade, estoque);
          aviso = `${b.baixadas} ${b.baixadas === 1 ? 'item saiu' : 'itens saíram'} do estoque.` + (b.semEstoque.length ? `\n\nNão achei no estoque: ${b.semEstoque.join(', ')}.` : '');
        }
      }
      setR(null);
      await onRecarregar();
      if (aviso) Alert.alert('Lote salvo', aviso);
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    }
  }

  return (
    <View style={s.tela}>
      <Topo titulo="Produção" sub={`Este mês: ${numeroTexto(unidadesMes)} unidades · custo ${reais(custoMes)}`} onVoltar={onVoltar} icone="layers" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}>
        {!producao.length ? <Vazio icone="layers" texto="Nenhum lote lançado." /> : null}
        {producao.map((p) => (
          <Cartao
            key={p.id}
            onPress={() => setR({ id: p.id, data: p.data, dataTxt: dataBr(p.data), produtoId: p.produtoId, produto: p.produto, qtd: numeroTexto(p.quantidade, 3), custo: numeroTexto(p.custoUnitario), obs: p.observacao ?? '' })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12 } as any}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.titulo} numberOfLines={2}>
                {p.produto}
              </Text>
              <Text style={s.dica}>
                {dataBr(p.data)} · custo {reais(p.custoUnitario)} por unidade
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.valor}>{numeroTexto(p.quantidade)} un</Text>
              <Text style={s.dica}>{reais(p.quantidade * (p.custoUnitario ?? 0))}</Text>
            </View>
          </Cartao>
        ))}
      </ScrollView>
      <TouchableOpacity style={s.fab} onPress={() => setR({ data: hojeIso(), dataTxt: dataBr(hojeIso()), produtoId: null, produto: '', qtd: '', custo: '', obs: '' })}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={s.fabTxt}>Novo lote</Text>
      </TouchableOpacity>
      <Folha visivel={!!r && !escolher} titulo={r?.id ? 'Editar lote' : 'Novo lote'} onFechar={() => setR(null)} rodape={<Botao texto="Salvar" icone="check" onPress={salvar} />}>
        {r ? (
          <>
            <TouchableOpacity onPress={() => { setBusca(''); setEscolher(true); }} style={[s.input, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
              <Feather name="gift" size={16} color={C.rosa} />
              <Text style={{ flex: 1, color: r.produto ? C.texto : '#C4AEB5', fontSize: 15 }}>{r.produto || 'Escolher produto'}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Quantidade" value={r.qtd} onChangeText={(t) => setR({ ...r, qtd: t })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Custo / unid. (R$)" value={r.custo} onChangeText={(t) => setR({ ...r, custo: t })} keyboardType="decimal-pad" dica="Vem da ficha" />
              </View>
            </View>
            <Campo rotulo="Data" value={r.dataTxt} onChangeText={(t) => setR({ ...r, dataTxt: t })} placeholder="dd/mm/aaaa" />
            <Campo rotulo="Observação" value={r.obs} onChangeText={(t) => setR({ ...r, obs: t })} />
            {!r.id && r.produtoId && estoque.length ? <Text style={s.dica}>Ao salvar, o que a receita usa sai do estoque automaticamente.</Text> : null}
            {r.id ? <Text style={s.dica}>Mudar a quantidade aqui não mexe no estoque. Para corrigir, exclua o lote (o estoque volta) e lance de novo.</Text> : null}
            {r.id ? (
              <Botao texto="Excluir lote" icone="trash-2" tipo="perigo" onPress={() => confirmar('Excluir lote?', r.produto, async () => { await excluirProducao(r.id!); setR(null); await onRecarregar(); })} />
            ) : null}
          </>
        ) : null}
      </Folha>
      <Folha visivel={escolher} titulo="Qual produto?" onFechar={() => setEscolher(false)}>
        <TextInput style={[s.busca, { marginTop: 0 }]} value={busca} onChangeText={setBusca} placeholder="Buscar" placeholderTextColor="#C4AEB5" />
        {produtos
          .filter((p) => !busca || normalizar(nomeCompleto(p)).includes(normalizar(busca)))
          .map((p) => (
            <Cartao
              key={p.id}
              onPress={() => {
                if (r) setR({ ...r, produtoId: p.id, produto: nomeCompleto(p), custo: numeroTexto(custoUnidade(p)), qtd: r.qtd || numeroTexto(p.rendimento) });
                setEscolher(false);
              }}
              style={{ flexDirection: 'row', gap: 10, padding: 12 } as any}
            >
              <Text style={[s.titulo, { flex: 1, fontSize: 15 }]}>{nomeCompleto(p)}</Text>
              <Text style={s.dica}>custo {reais(custoUnidade(p))}</Text>
            </Cartao>
          ))}
      </Folha>
    </View>
  );
}

// ========================================================== INVESTIMENTOS
export function InvestimentosConf({ investimentos, config, onVoltar, onRecarregar }: { investimentos: Investimento[]; config: ConfigConf; onVoltar: () => void; onRecarregar: () => Promise<void> }) {
  const [r, setR] = useState<{ id?: string; data: string; dataTxt: string; item: string; categoria: string | null; qtd: string; valor: string; forma: string | null; obs: string } | null>(null);
  const total = investimentos.reduce((a, i) => a + i.valorTotal, 0);
  const cats = Array.from(new Set(['Equipamentos', 'Periféricos', 'Utensílios', 'Marketing', ...investimentos.map((i) => i.categoria ?? '').filter(Boolean)]));
  async function salvar() {
    if (!r || !r.item.trim()) return Alert.alert('Falta o item', 'O que foi comprado?');
    const dados = { data: dataDigitada(r.dataTxt, r.data), item: r.item, categoria: r.categoria, quantidade: numeroDigitado(r.qtd), valorTotal: numeroDigitado(r.valor) ?? 0, formaPagamento: r.forma, observacao: r.obs };
    try {
      if (r.id) await atualizarInvestimento(r.id, dados);
      else await inserirInvestimento(dados);
      setR(null);
      await onRecarregar();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    }
  }
  return (
    <View style={s.tela}>
      <Topo titulo="Investimentos" sub={`${reais(total)} em equipamentos e utensílios`} onVoltar={onVoltar} icone="tool" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}>
        <Text style={s.dica}>Formas, batedeira, forno, utensílios… tudo que dura. Ingrediente e embalagem vão em Compras.</Text>
        {!investimentos.length ? <Vazio icone="tool" texto="Nenhum investimento lançado." /> : null}
        {investimentos.map((i) => (
          <Cartao
            key={i.id}
            onPress={() => setR({ id: i.id, data: i.data, dataTxt: dataBr(i.data), item: i.item, categoria: i.categoria, qtd: numeroTexto(i.quantidade, 3), valor: numeroTexto(i.valorTotal), forma: i.formaPagamento, obs: i.observacao ?? '' })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12 } as any}
          >
            <View style={{ flex: 1 }}>
              <Text style={[s.titulo, { fontSize: 15 }]} numberOfLines={2}>
                {i.item}
              </Text>
              <Text style={s.dica}>{[dataBr(i.data), i.categoria, i.quantidade != null ? `${numeroTexto(i.quantidade)} un` : null].filter(Boolean).join(' · ')}</Text>
            </View>
            <Text style={{ color: C.chocolate, fontWeight: '800' }}>{reais(i.valorTotal)}</Text>
          </Cartao>
        ))}
      </ScrollView>
      <TouchableOpacity style={s.fab} onPress={() => setR({ data: hojeIso(), dataTxt: dataBr(hojeIso()), item: '', categoria: 'Equipamentos', qtd: '1', valor: '', forma: config.formas[0] ?? null, obs: '' })}>
        <Feather name="plus" size={20} color="#fff" />
        <Text style={s.fabTxt}>Novo</Text>
      </TouchableOpacity>
      <Folha visivel={!!r} titulo={r?.id ? 'Editar investimento' : 'Novo investimento'} onFechar={() => setR(null)} rodape={<Botao texto="Salvar" icone="check" onPress={salvar} />}>
        {r ? (
          <>
            <Campo rotulo="Item" value={r.item} onChangeText={(t) => setR({ ...r, item: t })} placeholder="Ex.: Batedeira planetária" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Campo rotulo="Quantidade" value={r.qtd} onChangeText={(t) => setR({ ...r, qtd: t })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1.3 }}>
                <Campo rotulo="Valor total (R$)" value={r.valor} onChangeText={(t) => setR({ ...r, valor: t })} keyboardType="decimal-pad" />
              </View>
            </View>
            <Campo rotulo="Data" value={r.dataTxt} onChangeText={(t) => setR({ ...r, dataTxt: t })} placeholder="dd/mm/aaaa" />
            <Text style={s.rotulo}>Categoria</Text>
            <Chips opcoes={cats} valor={r.categoria} onMudar={(v) => setR({ ...r, categoria: v })} />
            <Text style={s.rotulo}>Pagamento</Text>
            <Chips opcoes={config.formas} valor={r.forma} onMudar={(v) => setR({ ...r, forma: v })} />
            <Campo rotulo="Observação" value={r.obs} onChangeText={(t) => setR({ ...r, obs: t })} />
            {r.id ? <Botao texto="Excluir" icone="trash-2" tipo="perigo" onPress={() => confirmar('Excluir?', r.item, async () => { await excluirInvestimento(r.id!); setR(null); await onRecarregar(); })} /> : null}
          </>
        ) : null}
      </Folha>
    </View>
  );
}

// ================================================================ INSUMOS
export function InsumosConf({ produtos, onVoltar, onRecarregar }: { produtos: Produto[]; onVoltar: () => void; onRecarregar: () => Promise<void> }) {
  const [busca, setBusca] = useState('');
  const [ed, setEd] = useState<{ ins: Insumo; preco: string; emb: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const insumos = useMemo(() => insumosDasFichas(produtos), [produtos]);
  const lista = insumos.filter((i) => !busca || i.chave.includes(normalizar(busca)));
  async function salvar() {
    if (!ed) return;
    const preco = numeroDigitado(ed.preco);
    if (preco == null || preco <= 0) return Alert.alert('Preço', 'Digite o preço da embalagem.');
    setSalvando(true);
    try {
      const n = await atualizarPrecoInsumo(ed.ins, preco, ed.emb);
      setEd(null);
      await onRecarregar();
      Alert.alert('Preço atualizado', `${n} ${n === 1 ? 'item de ficha foi atualizado' : 'itens de fichas foram atualizados'}. O custo dos produtos já mudou.`);
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    } finally {
      setSalvando(false);
    }
  }
  return (
    <View style={s.tela}>
      <Topo titulo="Preços dos insumos" sub={`${insumos.length} ingredientes e embalagens`} onVoltar={onVoltar} icone="tag" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Text style={s.dica}>Mudou o preço? Atualize aqui e todas as receitas que usam esse item recalculam o custo sozinhas.</Text>
        <TextInput style={[s.busca, { marginTop: 0 }]} value={busca} onChangeText={setBusca} placeholder="Buscar insumo" placeholderTextColor="#C4AEB5" />
        {lista.map((i) => (
          <Cartao key={i.chave} onPress={() => setEd({ ins: i, preco: numeroTexto(i.precoEmbalagem), emb: i.embalagemTexto })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 } as any}>
            <View style={{ flex: 1 }}>
              <Text style={[s.titulo, { fontSize: 15 }]} numberOfLines={1}>
                {i.nome}
              </Text>
              <Text style={s.dica}>
                {i.embalagemTexto ? `Embalagem: ${i.embalagemTexto} · ` : ''}usado em {new Set(i.usos.map((u) => u.produto.id)).size} {new Set(i.usos.map((u) => u.produto.id)).size === 1 ? 'receita' : 'receitas'}
              </Text>
            </View>
            <Text style={{ color: C.rosaEsc, fontWeight: '800' }}>{i.precoEmbalagem != null ? reais(i.precoEmbalagem) : '—'}</Text>
          </Cartao>
        ))}
      </ScrollView>
      <Folha visivel={!!ed} titulo={ed?.ins.nome ?? ''} onFechar={() => setEd(null)} rodape={<Botao texto={salvando ? 'Atualizando…' : 'Atualizar em todas as receitas'} icone="refresh-cw" onPress={salvar} desativado={salvando} />}>
        {ed ? (
          <>
            <Campo rotulo="Preço da embalagem (R$)" value={ed.preco} onChangeText={(t) => setEd({ ...ed, preco: t })} keyboardType="decimal-pad" />
            <Campo rotulo="Tamanho da embalagem" value={ed.emb} onChangeText={(t) => setEd({ ...ed, emb: t })} placeholder="Ex.: 395 g, 1 kg, 50 un" />
            <Text style={s.secao}>Usado em</Text>
            {ed.ins.usos.map((u, k) => (
              <Text key={k} style={s.sub}>
                • {nomeCompleto(u.produto)} — {u.item.qtdTexto || 'qtd. não informada'} ({reais(u.item.custo)})
              </Text>
            ))}
          </>
        ) : null}
      </Folha>
    </View>
  );
}

// ================================================================ AJUSTES
export function AjustesConf({ config, onConfig, onVoltar }: { config: ConfigConf; onConfig: (c: ConfigConf) => void; onVoltar: () => void }) {
  const [c, setC] = useState({ ...config, margemTxt: String(Math.round(config.margem * 100)) });
  const [salvando, setSalvando] = useState(false);
  async function trocarLogo() {
    escolherOrigemFoto(async (o) => {
      const f = await pegarFoto(o);
      if (!f) return;
      try {
        const url = await enviarFotoConf(f.uri, 'logo');
        setC({ ...c, logoUrl: url });
      } catch (e: any) {
        Alert.alert('Não consegui enviar', e?.message ?? '');
      }
    });
  }
  async function salvar() {
    setSalvando(true);
    try {
      const nova = { marca: c.marca.trim() || 'Sabores da Pri', logoUrl: c.logoUrl, whatsapp: c.whatsapp.trim(), instagram: c.instagram.trim(), pix: (c.pix ?? '').trim(), margem: Math.min(0.95, Math.max(0, (numeroDigitado(c.margemTxt) ?? 60) / 100)) };
      await salvarConfig(nova);
      onConfig({ ...config, ...nova });
      onVoltar();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? '');
    } finally {
      setSalvando(false);
    }
  }
  return (
    <View style={s.tela}>
      <Topo titulo="Minha marca" sub="Logo, contatos e margem" onVoltar={onVoltar} icone="settings" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={trocarLogo} style={{ alignSelf: 'center', alignItems: 'center', gap: 8 }}>
          <Image source={{ uri: c.logoUrl || LOGO_CONFEITARIA }} style={{ width: 130, height: 130, borderRadius: 65 }} />
          <Text style={{ color: C.rosaEsc, fontWeight: '700' }}>Trocar logo</Text>
        </TouchableOpacity>
        {c.logoUrl ? <Botao texto="Voltar para a logo original" tipo="claro" onPress={() => setC({ ...c, logoUrl: null })} /> : null}
        <Campo rotulo="Nome da marca" value={c.marca} onChangeText={(t) => setC({ ...c, marca: t })} />
        <Campo rotulo="WhatsApp para encomendas" value={c.whatsapp} onChangeText={(t) => setC({ ...c, whatsapp: t })} keyboardType="phone-pad" placeholder="(31) 9 9999-9999" dica="Aparece no rodapé das imagens da vitrine." />
        <Campo rotulo="Instagram" value={c.instagram} onChangeText={(t) => setC({ ...c, instagram: t })} placeholder="@saboresdapri" autoCapitalize="none" />
        <Campo rotulo="Chave Pix" value={c.pix ?? ''} onChangeText={(t) => setC({ ...c, pix: t })} placeholder="CPF, celular, e-mail ou chave aleatória" autoCapitalize="none" dica="Aparece na cobrança que você compartilha com a cliente." />
        <Campo rotulo="Margem de lucro desejada (%)" value={c.margemTxt} onChangeText={(t) => setC({ ...c, margemTxt: t })} keyboardType="number-pad" dica="Usada no “preço sugerido” de cada produto." />
        <Botao texto={salvando ? 'Salvando…' : 'Salvar'} icone="check" onPress={salvar} desativado={salvando} />
      </ScrollView>
    </View>
  );
}
