import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import AreaTeclado from '../components/AreaTeclado';
import {
  BaseSugestao,
  ItemSugestao,
  calcularSugestao,
  carregarBaseSugestao,
  dataCurta,
  enviarPedidoFlv,
  formatarNumero,
  proximosPedidos,
  rotuloSugestao,
  salvarContagem,
  salvarMargem,
  textoPedido,
} from '../data/pedidoFlvApi';

// Pedido FLV — sugestão automática pela venda do mês passado.
// Fluxo: escolhe o dia do pedido → conta as caixas da câmara → confere a
// sugestão (dá pra ajustar item a item) → envia o pedido / manda no WhatsApp.

type Filtro = 'venda' | 'todos';

const paraNumero = (t: string | undefined): number | null => {
  if (t === undefined) return null;
  const s = t.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export default function PedidoFlvScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const datas = useMemo(() => proximosPedidos(3), []);
  const [dataPedido, setDataPedido] = useState(datas[0]);
  const [base, setBase] = useState<BaseSugestao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [margemTxt, setMargemTxt] = useState('');
  const [contagemTxt, setContagemTxt] = useState<Record<string, string>>({});
  const [ajustes, setAjustes] = useState<Record<string, string>>({});
  const [pesquisa, setPesquisa] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('venda');
  const [enviando, setEnviando] = useState(false);

  function carregar(d: string) {
    setCarregando(true);
    setErro(null);
    carregarBaseSugestao(d)
      .then((b) => {
        setBase(b);
        setMargemTxt(String(b.margem).replace('.', ','));
        const c: Record<string, string> = {};
        Object.entries(b.contagem).forEach(([k, v]) => (c[k] = String(v).replace('.', ',')));
        setContagemTxt(c);
        setAjustes({});
      })
      .catch((e: any) => {
        const msg = String(e?.message ?? '');
        setErro(
          /flv_conversao|flv_contagem_camara|does not exist|schema cache/i.test(msg)
            ? 'As tabelas do Pedido FLV ainda não existem no banco. Rode o script supabase/pedido_flv_sugestao.sql no SQL Editor do Supabase e abra de novo.'
            : 'Não consegui carregar a sugestão. Verifique a internet e tente de novo.',
        );
      })
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar(dataPedido);
  }, [dataPedido]);

  const margem = paraNumero(margemTxt) ?? base?.margem ?? 4;
  const contagem = useMemo(() => {
    const r: Record<string, number> = {};
    Object.entries(contagemTxt).forEach(([k, v]) => {
      const n = paraNumero(v);
      if (n !== null) r[k] = n;
    });
    return r;
  }, [contagemTxt]);

  const itens = useMemo(() => (base ? calcularSugestao(base, margem, contagem) : []), [base, margem, contagem]);
  const qtdFinal = (i: ItemSugestao) => {
    const a = paraNumero(ajustes[i.codigo]);
    return a !== null ? a : i.sugestao;
  };

  const visiveis = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase();
    return itens
      .filter((i) => filtro === 'todos' || i.vendaBase > 0 || (contagem[i.codigo] ?? 0) > 0)
      .filter((i) => !termo || i.produto.toLowerCase().includes(termo) || i.codigo.includes(termo));
  }, [itens, filtro, pesquisa, contagem]);

  const paraEnviar = itens.map((item) => ({ item, qtd: qtdFinal(item) })).filter((x) => x.qtd > 0);
  const semConversao = itens.filter((i) => !i.fator && i.vendaBase > 0).length;
  const semPreco = itens.filter((i) => !i.preco).length;

  function salvarCampoContagem(codigo: string) {
    if (!usuarioAtual) return;
    salvarContagem(dataPedido, codigo, paraNumero(contagemTxt[codigo]), usuarioAtual.nome).catch(() =>
      Alert.alert('Não salvei a contagem', 'Verifique a internet. O número continua na tela.'),
    );
  }

  function salvarCampoMargem() {
    const n = paraNumero(margemTxt);
    if (n === null || n > 50) {
      setMargemTxt(String(base?.margem ?? 4).replace('.', ','));
      return;
    }
    if (base && n !== base.margem) {
      salvarMargem(n)
        .then(() => setBase({ ...base, margem: n }))
        .catch(() => Alert.alert('Não salvei a margem', 'Ela vale só nesta tela até salvar.'));
    }
  }

  async function compartilhar() {
    if (!base || paraEnviar.length === 0) return;
    await Share.share({ message: textoPedido(base.janela, paraEnviar) }).catch(() => {});
  }

  function confirmarEnvio() {
    if (!base || paraEnviar.length === 0) return;
    Alert.alert('Enviar pedido FLV', `Pedido de ${dataCurta(dataPedido)} com ${paraEnviar.length} itens. Confirma?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Enviar',
        onPress: async () => {
          if (!usuarioAtual) return;
          setEnviando(true);
          try {
            await enviarPedidoFlv(base.janela, paraEnviar, usuarioAtual.nome);
            Alert.alert('Pedido enviado', 'Ficou salvo no histórico de Pedidos. Quer mandar no WhatsApp também?', [
              { text: 'Agora não', style: 'cancel' },
              { text: 'Compartilhar', onPress: compartilhar },
            ]);
          } catch (e: any) {
            Alert.alert('Não consegui enviar', e?.message ?? 'Tente de novo em alguns instantes.');
          } finally {
            setEnviando(false);
          }
        },
      },
    ]);
  }

  const janela = base?.janela;

  return (
    <AreaTeclado style={s.flex}>
      <CabecalhoTela titulo="Pedido FLV" subtitulo="Sugestão pela venda do mês passado" icone="shopping-cart" onVoltar={onVoltar}>
        <View style={s.chips}>
          {datas.map((d) => (
            <TouchableOpacity key={d} style={[s.chip, d === dataPedido && s.chipAtivo]} onPress={() => setDataPedido(d)}>
              <Text style={[s.chipTxt, d === dataPedido && s.chipTxtAtivo]}>Pedido {dataCurta(d)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </CabecalhoTela>

      <ScrollView style={s.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : erro ? (
          <View style={s.aviso}>
            <Text style={s.avisoTxt}>{erro}</Text>
            <TouchableOpacity onPress={() => carregar(dataPedido)}>
              <Text style={s.link}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        ) : janela && base ? (
          <>
            <View style={s.card}>
              <Text style={s.resumoTitulo}>
                Entrega {dataCurta(janela.entrega)} · cobre até {dataCurta(janela.proximaEntrega)}
              </Text>
              <Text style={s.resumoLinha}>
                Base (mês passado):{' '}
                {janela.dias.map((d) => `${dataCurta(d.base)}${d.trocouFeriado ? '*' : ''}`).join(', ')}
              </Text>
              {janela.dias.some((d) => d.trocouFeriado) && (
                <Text style={s.resumoNota}>* feriado no mês passado: usei o mesmo dia da semana anterior.</Text>
              )}
              <View style={s.margemLinha}>
                <Text style={s.resumoLinha}>Margem de quebra</Text>
                <TextInput
                  style={s.margemInput}
                  value={margemTxt}
                  onChangeText={setMargemTxt}
                  onBlur={salvarCampoMargem}
                  keyboardType="decimal-pad"
                  maxLength={4}
                />
                <Text style={s.resumoLinha}>%</Text>
              </View>
              {base.diasBaseSemDados.length > 0 && (
                <Text style={s.alerta}>Ainda não tem venda carregada de {base.diasBaseSemDados.map(dataCurta).join(', ')}.</Text>
              )}
              {semConversao > 0 && (
                <Text style={s.resumoNota}>
                  {semConversao} itens sem conversão de caixa: a sugestão sai em kg/unidade até preencher a tabela.
                </Text>
              )}
              {semPreco > 0 && <Text style={s.resumoNota}>{semPreco} itens sem preço de venda: ficam sem sugestão.</Text>}
              <Text style={s.resumoNota}>
                Conte na câmara só caixas fechadas (caixa aberta = 0). Volume vendido ≈ valor vendido ÷ preço atual.
              </Text>
            </View>

            <TextInput
              style={s.pesquisa}
              placeholder="Pesquisar produto ou código…"
              placeholderTextColor={colors.gray400}
              value={pesquisa}
              onChangeText={setPesquisa}
            />
            <View style={s.filtros}>
              {(['venda', 'todos'] as Filtro[]).map((f) => (
                <TouchableOpacity key={f} style={[s.filtro, filtro === f && s.filtroAtivo]} onPress={() => setFiltro(f)}>
                  <Text style={[s.filtroTxt, filtro === f && s.filtroTxtAtivo]}>{f === 'venda' ? 'Vendeu no mês passado' : 'Todos'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {visiveis.length === 0 ? (
              <Text style={s.vazio}>Nenhum produto aqui.</Text>
            ) : (
              visiveis.map((i) => {
                const unidadeContagem = i.fator ? 'cx' : i.unidade;
                const ajustado = ajustes[i.codigo] !== undefined && paraNumero(ajustes[i.codigo]) !== i.sugestao;
                return (
                  <View key={i.codigo} style={s.card}>
                    <Text style={s.produto}>
                      {i.codigo} · {i.produto}
                    </Text>
                    <Text style={s.info}>
                      {i.fator ? `${i.embalagem ?? 'Caixa'} · ${formatarNumero(i.fator)} ${i.unidade}/cx` : 'Sem conversão de caixa'}
                    </Text>
                    <Text style={s.info}>
                      Vendeu {formatarNumero(i.vendaBase)} {i.unidade} ({i.vendaPorDia.map((v) => formatarNumero(v, 0)).join(' + ')}) · com
                      margem {formatarNumero(i.necessidade)} {i.unidade}
                    </Text>
                    <View style={s.linhaCampos}>
                      <View style={s.campo}>
                        <Text style={s.campoRotulo}>Câmara ({unidadeContagem})</Text>
                        <TextInput
                          style={s.campoInput}
                          placeholder="0"
                          placeholderTextColor={colors.gray400}
                          keyboardType="decimal-pad"
                          value={contagemTxt[i.codigo] ?? ''}
                          onChangeText={(v) => setContagemTxt((p) => ({ ...p, [i.codigo]: v }))}
                          onBlur={() => salvarCampoContagem(i.codigo)}
                        />
                      </View>
                      <Feather name="arrow-right" size={16} color={colors.gray400} style={{ marginTop: 18 }} />
                      <View style={s.campo}>
                        <Text style={s.campoRotulo}>Pedir ({unidadeContagem})</Text>
                        <TextInput
                          style={[s.campoInput, s.pedirInput, ajustado && s.pedirAjustado]}
                          keyboardType="decimal-pad"
                          value={ajustes[i.codigo] ?? String(i.sugestao)}
                          onChangeText={(v) => setAjustes((p) => ({ ...p, [i.codigo]: v }))}
                        />
                      </View>
                    </View>
                    {ajustado && (
                      <TouchableOpacity onPress={() => setAjustes((p) => { const n = { ...p }; delete n[i.codigo]; return n; })}>
                        <Text style={s.link}>Voltar para a sugestão ({rotuloSugestao(i)})</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </>
        ) : null}
      </ScrollView>

      {!carregando && !erro && (
        <View style={s.rodape}>
          <TouchableOpacity style={[s.btn, s.btnSec]} onPress={compartilhar} disabled={paraEnviar.length === 0}>
            <Feather name="share-2" size={16} color={colors.navy700} />
            <Text style={s.btnSecTxt}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.btnPri, (paraEnviar.length === 0 || enviando) && { opacity: 0.5 }]}
            onPress={confirmarEnvio}
            disabled={paraEnviar.length === 0 || enviando}
          >
            <Text style={s.btnPriTxt}>{enviando ? 'Enviando…' : `Enviar pedido (${paraEnviar.length})`}</Text>
          </TouchableOpacity>
        </View>
      )}
    </AreaTeclado>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.15)' },
  chipAtivo: { backgroundColor: colors.white },
  chipTxt: { color: colors.white, fontSize: 12, fontWeight: '700' },
  chipTxtAtivo: { color: colors.navy700 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  aviso: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  avisoTxt: { color: colors.gray900, fontSize: 13, lineHeight: 19 },
  resumoTitulo: { fontSize: 15, fontWeight: '800', color: colors.navy900 },
  resumoLinha: { fontSize: 12, color: colors.gray600, marginTop: 4, fontWeight: '600' },
  resumoNota: { fontSize: 11, color: colors.gray600, marginTop: 6, lineHeight: 16 },
  alerta: { fontSize: 12, color: colors.red500, marginTop: 6, fontWeight: '700' },
  margemLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  margemInput: {
    backgroundColor: colors.gray50,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 48,
    textAlign: 'center',
    fontWeight: '800',
    color: colors.navy900,
    marginTop: 4,
  },
  pesquisa: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.gray900,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  filtros: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md },
  filtro: { borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.gray100 },
  filtroAtivo: { backgroundColor: colors.navy700 },
  filtroTxt: { fontSize: 12, fontWeight: '700', color: colors.gray600 },
  filtroTxtAtivo: { color: colors.white },
  vazio: { color: colors.gray600, textAlign: 'center', marginTop: spacing.xl },
  produto: { fontSize: 13, fontWeight: '800', color: colors.gray900 },
  info: { fontSize: 11, color: colors.gray600, marginTop: 3 },
  linhaCampos: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginTop: spacing.md },
  campo: { flex: 1 },
  campoRotulo: { fontSize: 10, fontWeight: '800', color: colors.navy700, textTransform: 'uppercase', letterSpacing: 0.4 },
  campoInput: {
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy900,
    textAlign: 'right',
    marginTop: 4,
  },
  pedirInput: { backgroundColor: '#E3EDFF' },
  pedirAjustado: { backgroundColor: '#FFF4E0' },
  link: { color: colors.navy500, fontSize: 12, fontWeight: '700', marginTop: spacing.sm },
  rodape: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
  },
  btn: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnSec: { backgroundColor: colors.gray100, paddingHorizontal: spacing.lg },
  btnSecTxt: { color: colors.navy700, fontWeight: '800', fontSize: 14 },
  btnPri: { flex: 1, backgroundColor: colors.navy700 },
  btnPriTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
