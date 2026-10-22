import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Alert, BackHandler, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  ConfigConf,
  Produto,
  Compra,
  Venda,
  Producao,
  Investimento,
  carregarConfig,
  listarProdutos,
  listarCompras,
  listarVendas,
  listarProducao,
  listarInvestimentos,
  ItemEstoque,
  listarEstoque,
  statusEstoque,
  qtdEstoqueTexto,
  montarResumo,
  margemDe,
  nomeCompleto,
  reais,
  numeroTexto,
  hojeIso,
} from '../../data/confeitariaApi';
import { LOGO_CONFEITARIA } from '../../data/confeitariaLogo';
import { C, s, Cartao } from './ui';
import ProdutosConf from './ProdutosConf';
import ComprasConf from './ComprasConf';
import VendasConf from './VendasConf';
import VitrineConf from './VitrineConf';
import { ProducaoConf, InvestimentosConf, InsumosConf, AjustesConf } from './OutrosConf';
import EstoqueConf from './EstoqueConf';

// Início da Confeitaria (Sabores da Pri). Só aparece para quem tem
// setor = 'confeitaria' no cadastro (ver App.tsx). Nada da loja aparece aqui.

type Tela = 'inicio' | 'estoque' | 'produtos' | 'vitrine' | 'compras' | 'vendas' | 'producao' | 'investimentos' | 'insumos' | 'ajustes';
type Icone = React.ComponentProps<typeof Feather>['name'];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export default function ConfeitariaScreen() {
  const { usuarioAtual, logout } = useAuth();
  const [tela, setTela] = useState<Tela>('inicio');
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigConf | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [producao, setProducao] = useState<Producao[]>([]);
  const [invest, setInvest] = useState<Investimento[]>([]);
  const [estoque, setEstoque] = useState<ItemEstoque[]>([]);

  const carregar = useCallback(async () => {
    try {
      const [cfg, ps, cs, vs, pr, iv] = await Promise.all([carregarConfig(), listarProdutos(), listarCompras(), listarVendas(), listarProducao(), listarInvestimentos()]);
      setConfig(cfg);
      setProdutos(ps);
      setCompras(cs);
      setVendas(vs);
      setProducao(pr);
      setInvest(iv);
      // estoque é opcional (precisa do confeitaria_estoque.sql)
      setEstoque(await listarEstoque().catch(() => []));
      setErro(null);
    } catch (e: any) {
      setErro(/conf_|relation|schema/i.test(e?.message ?? '') ? 'A Confeitaria ainda não foi ativada no banco (rodar supabase/confeitaria.sql).' : e?.message ?? 'Não consegui carregar.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tela !== 'inicio') {
        setTela('inicio');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [tela]);

  const resumo = useMemo(() => montarResumo(vendas, compras, producao, invest), [vendas, compras, producao, invest]);
  const paraComprar = useMemo(() => estoque.filter((i) => i.minimo > 0 && ['zerado', 'baixo'].includes(statusEstoque(i))), [estoque]);
  const atencao = useMemo(() => produtos.filter((p) => p.ativo && p.precoVenda && (margemDe(p) ?? 1) < 0.3), [produtos]);

  if (carregando || !config) {
    return (
      <View style={[s.tela, { alignItems: 'center', justifyContent: 'center', gap: 14 }]}>
        <Image source={{ uri: LOGO_CONFEITARIA }} style={{ width: 120, height: 120, borderRadius: 60 }} />
        {erro ? <Text style={{ color: C.vermelho, textAlign: 'center', paddingHorizontal: 30 }}>{erro}</Text> : <ActivityIndicator color={C.rosa} />}
        {erro ? (
          <TouchableOpacity onPress={() => { setCarregando(true); carregar(); }}>
            <Text style={{ color: C.rosaEsc, fontWeight: '800' }}>Tentar de novo</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const voltar = () => setTela('inicio');
  const recarregar = async () => {
    await carregar();
  };
  if (tela === 'produtos') return <ProdutosConf produtos={produtos} config={config} onVoltar={voltar} onRecarregar={recarregar} />;
  if (tela === 'vitrine') return <VitrineConf produtos={produtos} config={config} onVoltar={voltar} onRecarregar={recarregar} />;
  if (tela === 'compras') return <ComprasConf compras={compras} estoque={estoque} config={config} onConfig={setConfig} onVoltar={voltar} onRecarregar={recarregar} />;
  if (tela === 'vendas') return <VendasConf vendas={vendas} produtos={produtos} config={config} onConfig={setConfig} onVoltar={voltar} onRecarregar={recarregar} />;
  if (tela === 'estoque') return <EstoqueConf estoque={estoque} produtos={produtos} onVoltar={voltar} onRecarregar={recarregar} />;
  if (tela === 'producao') return <ProducaoConf producao={producao} produtos={produtos} estoque={estoque} onVoltar={voltar} onRecarregar={recarregar} />;
  if (tela === 'investimentos') return <InvestimentosConf investimentos={invest} config={config} onVoltar={voltar} onRecarregar={recarregar} />;
  if (tela === 'insumos') return <InsumosConf produtos={produtos} onVoltar={voltar} onRecarregar={recarregar} />;
  if (tela === 'ajustes') return <AjustesConf config={config} onConfig={setConfig} onVoltar={voltar} />;

  const primeiroNome = (usuarioAtual?.nome ?? '').split(' ')[0];
  const hoje = new Date();
  const mesNome = MESES[hoje.getMonth()];
  const atalhos: { tela: Tela; nome: string; desc: string; icone: Icone; cor: string; fundo: string }[] = [
    { tela: 'vendas', nome: 'Vendas', desc: 'Pedidos e quem falta pagar', icone: 'dollar-sign', cor: C.menta, fundo: C.mentaClaro },
    { tela: 'vitrine', nome: 'Vitrine', desc: 'Imagem para o WhatsApp', icone: 'send', cor: C.rosa, fundo: C.rosaClaro },
    { tela: 'produtos', nome: 'Produtos e receitas', desc: `${produtos.length} fichas · custo e preço`, icone: 'book-open', cor: C.lilas, fundo: C.lilasClaro },
    { tela: 'estoque', nome: 'Estoque', desc: paraComprar.length ? `${paraComprar.length} para comprar` : 'Contagem e mínimos', icone: 'archive', cor: '#2F8F83', fundo: '#DDF2EE' },
    { tela: 'compras', nome: 'Compras', desc: 'Lê o cupom fiscal', icone: 'shopping-bag', cor: '#B7791F', fundo: C.ouroClaro },
    { tela: 'producao', nome: 'Produção', desc: 'Lotes feitos', icone: 'layers', cor: C.rosaEsc, fundo: '#F8E1E8' },
    { tela: 'insumos', nome: 'Preços dos insumos', desc: 'Atualiza todas as receitas', icone: 'tag', cor: '#3F8FA8', fundo: '#E1F1F6' },
    { tela: 'investimentos', nome: 'Investimentos', desc: 'Formas, equipamentos…', icone: 'tool', cor: '#7A6A5E', fundo: '#F1EBE6' },
    { tela: 'ajustes', nome: 'Minha marca', desc: 'Logo, WhatsApp e margem', icone: 'settings', cor: C.suave, fundo: '#F3ECEE' },
  ];

  return (
    <ScrollView style={s.tela} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}>
      <View style={st.topo}>
        <View style={st.topoLinha}>
          <Image source={{ uri: config.logoUrl || LOGO_CONFEITARIA }} style={st.logo} />
          <TouchableOpacity
            onPress={() => Alert.alert('Sair da conta?', 'Você vai precisar entrar de novo com seu nome e senha.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sair', style: 'destructive', onPress: logout }])}
            style={st.sair}
            hitSlop={8}
          >
            <Feather name="log-out" size={16} color={C.rosaEsc} />
            <Text style={{ color: C.rosaEsc, fontWeight: '700' }}>Sair</Text>
          </TouchableOpacity>
        </View>
        <Text style={st.ola}>Olá, {primeiroNome} 💗</Text>
        <Text style={st.marca}>{config.marca}</Text>
      </View>

      <View style={{ paddingHorizontal: 16, marginTop: -26, gap: 12 }}>
        <Cartao style={{ gap: 12 } as any}>
          <Text style={[s.rotulo, { fontSize: 11 }]}>Resumo de {mesNome}</Text>
          <View style={st.grade}>
            <Numero rotulo="Vendido" valor={reais(resumo.vendidoMes)} cor={C.menta} />
            <Numero rotulo="A receber" valor={reais(resumo.aReceber)} cor={resumo.aReceber > 0 ? '#B7791F' : C.suave} />
            <Numero rotulo="Compras" valor={reais(resumo.comprasMes)} cor={C.rosaEsc} />
            <Numero rotulo="Lucro estimado" valor={reais(resumo.lucroEstimadoMes)} cor={resumo.lucroEstimadoMes >= 0 ? C.menta : C.vermelho} dica="vendas − custo do que produziu" />
          </View>
        </Cartao>

        <View style={st.atalhos}>
          {atalhos.map((a) => (
            <TouchableOpacity key={a.tela} style={st.atalho} onPress={() => setTela(a.tela)} activeOpacity={0.85}>
              <View style={[st.atalhoIcone, { backgroundColor: a.fundo }]}>
                <Feather name={a.icone} size={21} color={a.cor} />
              </View>
              <Text style={st.atalhoNome}>{a.nome}</Text>
              <Text style={st.atalhoDesc}>{a.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {paraComprar.length ? (
          <Cartao onPress={() => setTela('estoque')} style={{ backgroundColor: '#FFF8F0', borderColor: '#F2D9B0' } as any}>
            <Text style={s.titulo}>🛒 Lista de compras ({paraComprar.length})</Text>
            {paraComprar.slice(0, 6).map((i) => (
              <View key={i.id} style={[s.linha, { justifyContent: 'space-between' }]}>
                <Text style={{ color: C.texto, flex: 1 }} numberOfLines={1}>
                  {i.nome}
                </Text>
                <Text style={{ color: i.quantidade <= 0 ? C.vermelho : '#9A6B12', fontWeight: '800' }}>{qtdEstoqueTexto(i.quantidade, i.unidade)}</Text>
              </View>
            ))}
            {paraComprar.length > 6 ? <Text style={s.dica}>e mais {paraComprar.length - 6}…</Text> : null}
          </Cartao>
        ) : null}

        {resumo.clientesDevendo.length ? (
          <Cartao onPress={() => setTela('vendas')}>
            <Text style={s.titulo}>Quem falta pagar</Text>
            {resumo.clientesDevendo.slice(0, 5).map((c) => (
              <View key={c.cliente} style={[s.linha, { justifyContent: 'space-between' }]}>
                <Text style={{ color: C.texto }}>{c.cliente}</Text>
                <Text style={{ color: '#B7791F', fontWeight: '800' }}>{reais(c.valor)}</Text>
              </View>
            ))}
          </Cartao>
        ) : null}

        {resumo.topProdutos.length ? (
          <Cartao>
            <Text style={s.titulo}>Mais vendidos em {mesNome}</Text>
            {resumo.topProdutos.map((p, k) => (
              <View key={p.produto} style={[s.linha, { justifyContent: 'space-between' }]}>
                <Text style={{ color: C.texto, flex: 1 }} numberOfLines={1}>
                  {k + 1}. {p.produto}
                </Text>
                <Text style={{ color: C.suave }}>{numeroTexto(p.qtd)} un · </Text>
                <Text style={{ color: C.chocolate, fontWeight: '800' }}>{reais(p.valor)}</Text>
              </View>
            ))}
          </Cartao>
        ) : null}

        {atencao.length ? (
          <Cartao onPress={() => setTela('produtos')} style={{ backgroundColor: '#FFF8F0' } as any}>
            <Text style={s.titulo}>⚠ Margem baixa (menos de 30%)</Text>
            {atencao.slice(0, 5).map((p) => (
              <Text key={p.id} style={s.sub}>
                • {nomeCompleto(p)} — {Math.round((margemDe(p) ?? 0) * 100)}%
              </Text>
            ))}
          </Cartao>
        ) : null}

        <Cartao>
          <Text style={s.titulo}>Desde o começo</Text>
          <Linha rotulo="Total vendido" valor={reais(resumo.vendidoTotal)} />
          <Linha rotulo="Compras de insumos" valor={reais(resumo.comprasTotal)} />
          <Linha rotulo="Investimentos" valor={reais(resumo.investidoTotal)} />
          <View style={{ height: 1, backgroundColor: C.rosaBorda }} />
          <Linha rotulo="Saldo (vendas − compras − investimentos)" valor={reais(resumo.saldoGeral)} forte cor={resumo.saldoGeral >= 0 ? C.menta : C.vermelho} />
        </Cartao>
        <Text style={{ textAlign: 'center', color: C.suave, fontSize: 11, marginTop: 6 }}>{config.marca} · feito com amor · {hojeIso().slice(0, 4)}</Text>
      </View>
    </ScrollView>
  );
}

function Numero({ rotulo, valor, cor, dica }: { rotulo: string; valor: string; cor: string; dica?: string }) {
  return (
    <View style={st.numero}>
      <Text style={{ fontSize: 12, color: C.suave, fontWeight: '700' }}>{rotulo}</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: cor }}>{valor}</Text>
      {dica ? <Text style={{ fontSize: 10, color: C.suave }}>{dica}</Text> : null}
    </View>
  );
}
function Linha({ rotulo, valor, forte, cor }: { rotulo: string; valor: string; forte?: boolean; cor?: string }) {
  return (
    <View style={[s.linha, { justifyContent: 'space-between' }]}>
      <Text style={{ color: C.texto, flex: 1, fontWeight: forte ? '800' : '400' }}>{rotulo}</Text>
      <Text style={{ color: cor ?? C.chocolate, fontWeight: '800' }}>{valor}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  topo: { backgroundColor: C.rosaClaro, paddingTop: 50, paddingHorizontal: 20, paddingBottom: 44, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  topoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: '#fff' },
  sair: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  ola: { fontSize: 26, fontWeight: '800', color: C.chocolate, marginTop: 14 },
  marca: { fontSize: 14, color: C.rosaEsc, fontWeight: '700', marginTop: 2 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  numero: { width: '47%', flexGrow: 1, backgroundColor: C.fundo, borderRadius: 14, padding: 12, gap: 2 },
  atalhos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  atalho: { width: '47.5%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 20, padding: 14, borderWidth: 1, borderColor: C.rosaBorda, gap: 6 },
  atalhoIcone: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  atalhoNome: { fontSize: 15, fontWeight: '800', color: C.chocolate },
  atalhoDesc: { fontSize: 12, color: C.suave },
});
