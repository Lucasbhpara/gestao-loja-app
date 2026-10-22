import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, BackHandler } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import {
  buscarUltimaChegada,
  marcarAbastecido,
  ItemChegada,
  NotaChegada,
  chegadaEhDoEstoque,
  GrupoChegada,
  NOME_SETOR_CHEGADA,
} from '../data/chegadasApi';

// "Chegou hoje": o que entrou no estoque da loja (comparando uma importação
// do Estoque Loja com a anterior) e/ou o que veio nas notas subidas no
// portal (Ofertas › Mercadoria que chegou), separado pelo que importa para a
// gôndola: estava em falta, produto novo (sem cadastro), estoque baixo e
// saldo negativo no sistema. Qualquer colaborador vê; cada um marca o ✓
// quando o produto já está exposto.

type Icone = React.ComponentProps<typeof Feather>['name'];
const G: Record<GrupoChegada, { nome: string; desc: string; cor: string; fundo: string; icone: Icone }> = {
  falta: { nome: 'Estava em falta', desc: 'Saldo zerado na loja — leve primeiro para a área de vendas', cor: '#C0392B', fundo: '#FBDEDC', icone: 'alert-triangle' },
  novo: { nome: 'Produto novo', desc: 'Primeira vez no estoque — a loja ainda não vendia', cor: '#5B3FC4', fundo: '#ECE7FB', icone: 'plus-square' },
  baixo: { nome: 'Estoque baixo', desc: 'Tinha menos de 5 unidades', cor: '#B5750E', fundo: '#FFF1DB', icone: 'trending-down' },
  negativo: { nome: 'Saldo negativo no sistema', desc: 'Estoque provavelmente errado — conferir', cor: '#A35F00', fundo: '#FFF6D6', icone: 'alert-circle' },
  normal: { nome: 'Estoque normal', desc: 'Só repor quando abrir espaço', cor: '#1E8E5A', fundo: '#DFF3E8', icone: 'check' },
};
const ORDEM: GrupoChegada[] = ['falta', 'novo', 'baixo', 'negativo', 'normal'];
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function tituloDia(dia: string | null) {
  if (!dia) return '';
  const [a, m, d] = dia.split('-').map(Number);
  const dt = new Date(a, m - 1, d);
  return `${DIAS[dt.getDay()]}, ${d} de ${MESES[m - 1]}`;
}
function brl(v: number | null) {
  return v == null ? 'Sem preço' : 'R$ ' + v.toFixed(2).replace('.', ',');
}
function nomeBonito(p: string) {
  return p.replace(/\s+(FR|TP|GF|LT|PT|EV)$/, '').replace(/\.(?=[A-Z])/g, '. ').replace(/\s+/g, ' ');
}
function chegouTexto(i: ItemChegada) {
  const q = i.quantidade ?? 0;
  if (i.embalagem === 'un' || i.embalagem === 'kg') return `Entrou ${String(q).replace('.', ',')} ${i.embalagem}`;
  const un = i.embalagem === 'FD' ? (q === 1 ? 'fardo' : 'fardos') : i.embalagem === 'CX' ? (q === 1 ? 'caixa' : 'caixas') : (i.embalagem ?? '').toLowerCase();
  return `Chegou ${String(q).replace('.', ',')} ${un}`.trim();
}

export default function ChegadasScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [notas, setNotas] = useState<NotaChegada[]>([]);
  const [itens, setItens] = useState<ItemChegada[]>([]);
  const [setor, setSetor] = useState<string>('todos');
  const [aberto, setAberto] = useState<GrupoChegada | null>(null);
  const [filtroFalta, setFiltroFalta] = useState<'falta' | 'baixo'>('falta');

  const carregar = useCallback(() => {
    buscarUltimaChegada()
      .then((r) => {
        setDia(r.dia);
        setNotas(r.notas);
        setItens(r.itens);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }, []);
  useEffect(carregar, [carregar]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (aberto) {
        setAberto(null);
        return true;
      }
      onVoltar();
      return true;
    });
    return () => sub.remove();
  }, [aberto, onVoltar]);

  const setoresPresentes = useMemo(() => {
    const s = new Set(itens.map((i) => i.setor ?? 'outros'));
    return Array.from(s).sort();
  }, [itens]);
  const doSetor = useMemo(() => (setor === 'todos' ? itens : itens.filter((i) => (i.setor ?? 'outros') === setor)), [itens, setor]);
  const porGrupo = useMemo(() => {
    const m: Record<GrupoChegada, ItemChegada[]> = { falta: [], novo: [], baixo: [], negativo: [], normal: [] };
    doSetor.forEach((i) => m[i.grupo]?.push(i));
    (Object.keys(m) as GrupoChegada[]).forEach((k) => m[k].sort((a, b) => a.produto.localeCompare(b.produto)));
    return m;
  }, [doSetor]);
  const paraGondola = [...porGrupo.falta, ...porGrupo.novo, ...porGrupo.baixo, ...porGrupo.negativo];
  const feitos = paraGondola.filter((i) => i.abastecidoEm).length;

  function alternar(i: ItemChegada) {
    const novo = !i.abastecidoEm;
    const antes = itens;
    setItens((l) => l.map((x) => (x.id === i.id ? { ...x, abastecidoEm: novo ? new Date().toISOString() : null, abastecidoPor: novo ? usuarioAtual?.nome ?? null : null } : x)));
    marcarAbastecido(i.id, usuarioAtual?.nome ?? null, novo).catch((e) => {
      setItens(antes);
      Alert.alert('Não deu certo', e?.message ?? 'Verifique a internet e tente de novo.');
    });
  }

  function marcarTodos(lista: ItemChegada[]) {
    const pendentes = lista.filter((i) => !i.abastecidoEm);
    if (pendentes.length === 0) return;
    Alert.alert('Marcar todos?', `Marcar ${pendentes.length} produto(s) como já na área de vendas?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Marcar',
        onPress: async () => {
          const agora = new Date().toISOString();
          setItens((l) => l.map((x) => (pendentes.some((p) => p.id === x.id) ? { ...x, abastecidoEm: agora, abastecidoPor: usuarioAtual?.nome ?? null } : x)));
          try {
            for (const p of pendentes) await marcarAbastecido(p.id, usuarioAtual?.nome ?? null, true);
          } catch (e: any) {
            Alert.alert('Não deu certo', e?.message ?? 'Verifique a internet.');
            carregar();
          }
        },
      },
    ]);
  }

  const chipsSetor = setoresPresentes.length > 1 && (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {['todos', ...setoresPresentes].map((s) => (
        <TouchableOpacity key={s} style={[styles.chip, setor === s && styles.chipOn]} onPress={() => setSetor(s)}>
          <Text style={[styles.chipTxt, setor === s && styles.chipTxtOn]}>
            {s === 'todos' ? 'Todos os setores' : NOME_SETOR_CHEGADA[s] ?? 'Outros'}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const ehHoje = dia === hojeIso();
  const subtitulo = dia ? `${ehHoje ? 'Hoje · ' : 'Última chegada · '}${tituloDia(dia)}` : 'Entradas no estoque da loja';

  // ---------- Lista de um grupo ----------
  if (aberto) {
    const g = G[aberto];
    const lista = aberto === 'falta' ? porGrupo[filtroFalta] : porGrupo[aberto];
    const podeMarcar = true;
    const semPreco = lista.filter((i) => i.precoVenda == null && i.grupo !== 'novo');
    return (
      <View style={styles.flex}>
        <CabecalhoTela
          titulo={aberto === 'falta' ? 'Estava em falta' : g.nome}
          subtitulo="Toque no ✓ quando o produto estiver na área de vendas"
          icone={g.icone}
          onVoltar={() => setAberto(null)}
        />
        <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 110, gap: 10 }}>
          {chipsSetor}
          {aberto === 'falta' && (
            <View style={styles.chips}>
              {(['falta', 'baixo'] as const).map((k) => (
                <TouchableOpacity key={k} style={[styles.chip, filtroFalta === k && styles.chipOn]} onPress={() => setFiltroFalta(k)}>
                  <Text style={[styles.chipTxt, filtroFalta === k && styles.chipTxtOn]}>
                    {k === 'falta' ? 'Zerados' : 'Estoque baixo'} {porGrupo[k].length}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {aberto === 'novo' && (
            <View style={[styles.aviso, { backgroundColor: '#ECE7FB' }]}>
              <Feather name="tag" size={17} color="#3E2A8C" />
              <Text style={[styles.avisoTxt, { color: '#3E2A8C' }]}>Produtos que a loja ainda não vendia. Confira se já estão com preço na gôndola.</Text>
            </View>
          )}
          {aberto === 'negativo' && (
            <View style={[styles.aviso, { backgroundColor: '#FFF6D6' }]}>
              <Feather name="alert-circle" size={17} color="#6B5200" />
              <Text style={[styles.avisoTxt, { color: '#6B5200' }]}>
                O sistema mostra saldo negativo, então não dá para saber se faltava de verdade. Confira a gôndola e o depósito.
              </Text>
            </View>
          )}
          {semPreco.length > 0 && (
            <View style={[styles.aviso, { backgroundColor: '#FFF6D6' }]}>
              <Feather name="alert-triangle" size={17} color="#6B5200" />
              <Text style={[styles.avisoTxt, { color: '#6B5200' }]}>
                <Text style={{ fontWeight: '800' }}>Sem preço no sistema:</Text> {semPreco.map((i) => nomeBonito(i.produto)).join(', ')}.
              </Text>
            </View>
          )}
          {lista.length === 0 && <Text style={styles.vazio}>Nada nesse grupo{setor !== 'todos' ? ' para esse setor' : ''}.</Text>}
          {lista.map((i) => {
            const feito = !!i.abastecidoEm;
            return (
              <View key={i.id} style={[styles.item, feito && { opacity: 0.55 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNome}>{nomeBonito(i.produto)}</Text>
                  <View style={styles.tags}>
                    <Text style={[styles.tag, { backgroundColor: '#E3EDFF', color: '#1F5FD6' }]}>{chegouTexto(i)}</Text>
                    {i.grupo !== 'novo' && i.saldoLoja != null && (
                      <Text style={[styles.tag, { backgroundColor: g.fundo, color: g.cor }]}>Loja tinha {String(i.saldoLoja).replace('.', ',')}</Text>
                    )}
                    {i.grupo === 'novo' ? (
                      <Text style={[styles.tag, { backgroundColor: '#ECE7FB', color: '#5B3FC4' }]}>Produto novo</Text>
                    ) : (
                      <Text style={[styles.tag, { backgroundColor: '#EEF1F6', color: '#3A4558' }]}>{brl(i.precoVenda)}</Text>
                    )}
                  </View>
                  {feito && !!i.abastecidoPor && <Text style={styles.feitoPor}>✓ {i.abastecidoPor}</Text>}
                </View>
                {podeMarcar && (
                  <TouchableOpacity style={[styles.btn, feito && styles.btnOk]} onPress={() => alternar(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Feather name="check" size={20} color={feito ? colors.white : '#9AA3B2'} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
        {podeMarcar && lista.some((i) => !i.abastecidoEm) && (
          <View style={styles.rodape}>
            <TouchableOpacity style={styles.botaoGrande} onPress={() => marcarTodos(lista)}>
              <Text style={styles.botaoGrandeTxt}>Marcar todos como na área de vendas</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ---------- Painel ----------
  const totalItens = doSetor.length;
  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo="Chegou hoje" subtitulo={subtitulo} icone="truck" onVoltar={onVoltar}>
        {paraGondola.length > 0 && (
          <View style={styles.progresso}>
            <Text style={styles.progTxt}>Na área de vendas</Text>
            <View style={styles.trilho}>
              <View style={[styles.trilhoCheio, { width: `${Math.round((feitos / paraGondola.length) * 100)}%` }]} />
            </View>
            <Text style={styles.progNum}>
              {feitos} de {paraGondola.length}
            </Text>
          </View>
        )}
      </CabecalhoTela>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: 12 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: 40 }} />
        ) : erro ? (
          <Text style={styles.vazio}>{/chegadas|relation|schema/i.test(erro) ? 'A ferramenta ainda não foi ativada no banco.' : erro}</Text>
        ) : notas.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Nenhuma entrada nos últimos dias</Text>
            <Text style={styles.cardSub}>Assim que o estoque da loja for importado no portal, o que entrou aparece aqui (ou suba a nota do CD em Ofertas › Mercadoria que chegou).</Text>
          </View>
        ) : (
          <>
            <View style={[styles.card, styles.notas]}>
              <View style={[styles.bolha, { backgroundColor: '#E3EDFF' }]}>
                <Feather name="truck" size={20} color="#2F7BFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitulo}>
                  {totalItens} itens{setor !== 'todos' ? ` de ${NOME_SETOR_CHEGADA[setor] ?? 'outros'}` : ''}
                </Text>
                <Text style={styles.cardSub}>
                  {[
                    notas.some(chegadaEhDoEstoque) ? 'Pelo estoque da loja' : null,
                    notas.some((n) => !chegadaEhDoEstoque(n)) ? 'NF ' + notas.filter((n) => !chegadaEhDoEstoque(n)).map((n) => n.numero).join(', ') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
            {chipsSetor}
            <Text style={styles.secao}>O que precisa de atenção</Text>
            {ORDEM.map((k) => {
              const g = G[k];
              const n = porGrupo[k].length;
              const pct = totalItens ? Math.max(4, Math.round((n / totalItens) * 100)) : 0;
              return (
                <TouchableOpacity key={k} style={[styles.card, styles.grupo, k === 'normal' && { opacity: 0.85 }]} onPress={() => setAberto(k)} activeOpacity={0.8}>
                  <View style={[styles.bolha, { backgroundColor: g.fundo, width: 46, height: 46 }]}>
                    <Feather name={g.icone} size={22} color={g.cor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitulo}>{g.nome}</Text>
                    <Text style={styles.cardSub}>{g.desc}</Text>
                    {k !== 'normal' && (
                      <View style={styles.barra}>
                        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: g.cor, borderRadius: 6 }} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.grupoNum, { color: g.cor }]}>{n}</Text>
                  <Feather name="chevron-right" size={18} color="#9AA3B2" />
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F3F5F9' },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 14, shadowColor: '#0E1B2C', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  notas: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bolha: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: '#0E1B2C' },
  cardSub: { fontSize: 12, color: '#5B6577', marginTop: 2 },
  secao: { fontSize: 12.5, fontWeight: '800', color: '#5B6577', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4, marginLeft: 4 },
  grupo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grupoNum: { fontSize: 26, fontWeight: '800', minWidth: 40, textAlign: 'right' },
  barra: { height: 6, borderRadius: 6, backgroundColor: '#EEF1F6', marginTop: 8, overflow: 'hidden' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: '#E1E6EE' },
  chipOn: { backgroundColor: '#0E1B2C', borderColor: '#0E1B2C' },
  chipTxt: { fontSize: 12.5, fontWeight: '700', color: '#3A4558' },
  chipTxtOn: { color: colors.white },
  item: { backgroundColor: colors.white, borderRadius: 16, padding: 12, paddingLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 1, shadowColor: '#0E1B2C', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  itemNome: { fontSize: 13.5, fontWeight: '700', color: '#0E1B2C' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { fontSize: 11, fontWeight: '700', paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.full, overflow: 'hidden' },
  feitoPor: { fontSize: 11, color: '#1E8E5A', fontWeight: '700', marginTop: 5 },
  btn: { width: 46, height: 46, borderRadius: 13, borderWidth: 1.5, borderColor: '#D5DBE5', alignItems: 'center', justifyContent: 'center' },
  btnOk: { backgroundColor: '#1E8E5A', borderColor: '#1E8E5A' },
  aviso: { flexDirection: 'row', gap: 10, borderRadius: 14, padding: 12 },
  avisoTxt: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  vazio: { textAlign: 'center', color: '#5B6577', marginTop: 24 },
  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, paddingBottom: 24, backgroundColor: 'rgba(243,245,249,0.96)' },
  botaoGrande: { backgroundColor: '#2F7BFF', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  botaoGrandeTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },
  progresso: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  progTxt: { fontSize: 12.5, color: '#B9C3D3' },
  trilho: { flex: 1, height: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 10, overflow: 'hidden' },
  trilhoCheio: { height: '100%', backgroundColor: '#4ADE80', borderRadius: 6 },
  progNum: { fontSize: 12.5, color: colors.white, fontWeight: '800' },
});
