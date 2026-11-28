import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Share, Linking, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import CabecalhoTela from '../components/CabecalhoTela';
import { useAuth } from '../context/AuthContext';
import {
  ModeloContagem, ContagemAberta, ResumoContagem, listarModelos, listarLojas, listarAbertas,
  criarContagem, resumoContagem, encerrarContagem, linkLoja, linkPainel,
  respostasContagem, itensDaLoja, textoLoja, textoRupturasGeral, ItemLoja, StatusItem,
} from '../data/contagemFocoApi';

// =============================================================================
// Contagem de itens foco nas lojas (supervisor / donos).
// 1) Lista as contagens abertas  2) Nova: escolhe lista(s) e lojas, cria e
// compartilha o link  3) Acompanhar: progresso por loja em tempo real.
// =============================================================================

const VERDE = '#178553';
const VERMELHO = '#D0342C';
const AMARELO = '#B7791F';

type Modo = { tipo: 'lista' } | { tipo: 'nova' } | { tipo: 'acompanhar'; id: string } | { tipo: 'loja'; id: string; titulo: string; loja: string };

function dataCurta(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

async function compartilharLinks(id: string, titulo: string, qual: 'loja' | 'painel') {
  const msg = qual === 'loja'
    ? `📋 *Contagem de itens foco — ${titulo}*\nAbra o link, escolha a sua loja e marque cada item: *Tem*, *Pouco* ou *Ruptura*.\n${linkLoja(id)}`
    : `📈 Painel da contagem — ${titulo}\n${linkPainel(id)}`;
  try { await Share.share({ message: msg }); } catch { /* cancelado */ }
}

export default function ContagemFocoScreen({ onVoltar }: { onVoltar: () => void }) {
  const [modo, setModo] = useState<Modo>({ tipo: 'lista' });
  if (modo.tipo === 'nova') return <Nova onVoltar={() => setModo({ tipo: 'lista' })} onCriada={(id) => setModo({ tipo: 'acompanhar', id })} />;
  if (modo.tipo === 'loja') return <DetalheLoja id={modo.id} titulo={modo.titulo} loja={modo.loja} onVoltar={() => setModo({ tipo: 'acompanhar', id: modo.id })} />;
  if (modo.tipo === 'acompanhar') return <Acompanhar id={modo.id} onVoltar={() => setModo({ tipo: 'lista' })} onLoja={(titulo, loja) => setModo({ tipo: 'loja', id: modo.id, titulo, loja })} />;
  return <Lista onVoltar={onVoltar} onNova={() => setModo({ tipo: 'nova' })} onAbrir={(id) => setModo({ tipo: 'acompanhar', id })} />;
}

// ---------------------------------------------------------------------------
function Lista({ onVoltar, onNova, onAbrir }: { onVoltar: () => void; onNova: () => void; onAbrir: (id: string) => void }) {
  const [abertas, setAbertas] = useState<ContagemAberta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const carregar = useCallback(() => {
    listarAbertas(15).then((l) => { setAbertas(l); setErro(null); }).catch((e) => setErro(e.message)).finally(() => setAtualizando(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <View style={s.flex}>
      <CabecalhoTela titulo="Contagem nas lojas" subtitulo="Itens foco: manda o link e acompanha em tempo real" icone="radio" onVoltar={onVoltar} />
      <ScrollView style={s.flex} contentContainerStyle={s.conteudo}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}>
        <TouchableOpacity style={s.botao} onPress={onNova}>
          <Feather name="plus" size={18} color={colors.white} />
          <Text style={s.botaoTxt}>Nova contagem</Text>
        </TouchableOpacity>
        <Text style={s.secao}>CONTAGENS ABERTAS</Text>
        {abertas === null && !erro ? <ActivityIndicator color={colors.navy700} style={{ marginTop: 30 }} />
          : erro ? <Text style={s.vazio}>{erro}</Text>
          : abertas!.length === 0 ? <Text style={s.vazio}>Nenhuma contagem aberta. Toque em “Nova contagem”.</Text>
          : abertas!.map((c) => {
            const p = pct(c.marcados, c.total);
            return (
              <TouchableOpacity key={c.id} style={s.card} onPress={() => onAbrir(c.id)}>
                <Text style={s.cardTitulo}>{c.titulo}</Text>
                <Text style={s.legenda}>{dataCurta(c.criado_em)}{c.criado_por ? ` · ${c.criado_por}` : ''}</Text>
                <View style={s.barra}><View style={[s.barraCheia, { width: `${p}%` }]} /></View>
                <Text style={s.legenda}>{p}% · {c.lojas_iniciadas}/{c.total_lojas} lojas começaram</Text>
              </TouchableOpacity>
            );
          })}
        <Text style={s.dica}>Dica: pelo Robô Ulva também dá — mande “quero um dado” e escolha a opção 8.</Text>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
function Nova({ onVoltar, onCriada }: { onVoltar: () => void; onCriada: (id: string) => void }) {
  const { usuarioAtual } = useAuth();
  const [modelos, setModelos] = useState<ModeloContagem[] | null>(null);
  const [lojas, setLojas] = useState<string[]>([]);
  const [selModelos, setSelModelos] = useState<Set<string>>(new Set());
  const [selLojas, setSelLojas] = useState<Set<string>>(new Set());
  const [titulo, setTitulo] = useState('');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarModelos(), listarLojas()])
      .then(([m, l]) => { setModelos(m); setLojas(l); setSelLojas(new Set(l)); })
      .catch((e) => setErro(e.message));
  }, []);

  const alternar = (set: Set<string>, v: string, fn: (x: Set<string>) => void) => {
    const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); fn(n);
  };
  const totalItens = (modelos ?? []).filter((m) => selModelos.has(m.nome)).reduce((a, m) => a + m.qtd, 0);

  async function criar() {
    if (!selModelos.size) { Alert.alert('Escolha a lista', 'Marque pelo menos uma lista de itens.'); return; }
    if (!selLojas.size) { Alert.alert('Escolha as lojas', 'Marque pelo menos uma loja.'); return; }
    setCriando(true);
    try {
      const nomes = (modelos ?? []).map((m) => m.nome).filter((n) => selModelos.has(n));
      const hoje = new Date();
      const t = titulo.trim() || `${nomes.join(' + ')} · ${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}`;
      const todas = selLojas.size === lojas.length;
      const id = await criarContagem(t, nomes, todas ? null : lojas.filter((l) => selLojas.has(l)), usuarioAtual?.nome ?? null);
      Alert.alert('Contagem criada ✅', 'Agora mande o link para as lojas.', [
        { text: 'Depois', style: 'cancel', onPress: () => onCriada(id) },
        { text: 'Mandar link', onPress: async () => { await compartilharLinks(id, t, 'loja'); onCriada(id); } },
      ]);
    } catch (e: any) {
      Alert.alert('Não deu certo', e?.message ?? 'Não consegui criar a contagem.');
    } finally {
      setCriando(false);
    }
  }

  return (
    <View style={s.flex}>
      <CabecalhoTela titulo="Nova contagem" subtitulo="Escolha a lista e as lojas" icone="plus-circle" onVoltar={onVoltar} />
      <ScrollView style={s.flex} contentContainerStyle={s.conteudo} keyboardShouldPersistTaps="handled">
        {erro ? <Text style={s.vazio}>{erro}</Text> : modelos === null ? <ActivityIndicator color={colors.navy700} style={{ marginTop: 30 }} /> : (
          <>
            <Text style={s.secao}>1. LISTA DE ITENS</Text>
            <View style={s.card}>
              {modelos.map((m, i) => {
                const on = selModelos.has(m.nome);
                return (
                  <TouchableOpacity key={m.nome} style={[s.linha, i > 0 && s.linhaBorda]} onPress={() => alternar(selModelos, m.nome, setSelModelos)}>
                    <Feather name={on ? 'check-square' : 'square'} size={22} color={on ? colors.navy700 : colors.gray400} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.linhaTitulo}>{m.nome}</Text>
                      <Text style={s.legenda}>{m.qtd} itens</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.secaoLinha}>
              <Text style={s.secao}>2. LOJAS · {selLojas.size} de {lojas.length}</Text>
              <TouchableOpacity onPress={() => setSelLojas(selLojas.size === lojas.length ? new Set() : new Set(lojas))}>
                <Text style={s.link}>{selLojas.size === lojas.length ? 'Desmarcar todas' : 'Marcar todas'}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.chips}>
              {lojas.map((l) => {
                const on = selLojas.has(l);
                return (
                  <TouchableOpacity key={l} style={[s.chip, on && s.chipOn]} onPress={() => alternar(selLojas, l, setSelLojas)}>
                    <Text style={[s.chipTxt, on && s.chipTxtOn]}>{l.replace('Loja ', '')}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.secao}>3. NOME (OPCIONAL)</Text>
            <TextInput style={s.input} value={titulo} onChangeText={setTitulo} placeholder="Se deixar em branco, uso o nome da lista + data" placeholderTextColor={colors.gray400} />

            <TouchableOpacity style={[s.botao, criando && { opacity: 0.6 }]} onPress={criar} disabled={criando}>
              {criando ? <ActivityIndicator color={colors.white} /> : <Feather name="send" size={18} color={colors.white} />}
              <Text style={s.botaoTxt}>Criar{totalItens ? ` · ${totalItens} itens` : ''} e mandar link</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
async function compartilharTexto(msg: string) {
  try { await Share.share({ message: msg }); } catch { /* cancelado */ }
}

function Acompanhar({ id, onVoltar, onLoja }: { id: string; onVoltar: () => void; onLoja: (titulo: string, loja: string) => void }) {
  const [compartilhando, setCompartilhando] = useState(false);
  async function compartilharRupturas() {
    if (!r) return;
    setCompartilhando(true);
    try {
      const dados = await respostasContagem(id);
      await compartilharTexto(textoRupturasGeral(r.titulo, r.lojas.map((l) => l.loja), dados));
    } catch (e: any) {
      Alert.alert('Não deu certo', e?.message ?? '');
    } finally {
      setCompartilhando(false);
    }
  }
  const [r, setR] = useState<ResumoContagem | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [quando, setQuando] = useState<Date | null>(null);

  const carregar = useCallback(() => {
    resumoContagem(id).then((d) => { setR(d); setErro(null); setQuando(new Date()); })
      .catch((e) => setErro(e.message)).finally(() => setAtualizando(false));
  }, [id]);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 15000); // tempo real: atualiza a cada 15 s
    return () => clearInterval(t);
  }, [carregar]);

  function encerrar() {
    Alert.alert('Encerrar contagem?', 'Ela sai da lista de abertas. As respostas continuam salvas e o painel continua abrindo.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Encerrar', style: 'destructive', onPress: async () => {
        try { await encerrarContagem(id); onVoltar(); } catch (e: any) { Alert.alert('Não deu certo', e?.message ?? ''); }
      } },
    ]);
  }

  const total = r ? r.total_itens * r.total_lojas : 0;
  const p = r ? pct(r.marcados, total) : 0;
  const lojas = [...(r?.lojas ?? [])].sort((a, b) => (b.feitos - a.feitos) || a.loja.localeCompare(b.loja, 'pt-BR', { numeric: true }));
  const concluidas = lojas.filter((l) => r && l.feitos >= r.total_itens).length;

  return (
    <View style={s.flex}>
      <CabecalhoTela titulo="Acompanhar" subtitulo={r?.titulo ?? 'Carregando…'} icone="activity" onVoltar={onVoltar} />
      <ScrollView style={s.flex} contentContainerStyle={s.conteudo}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}>
        {erro && !r ? <Text style={s.vazio}>{erro}</Text> : !r ? <ActivityIndicator color={colors.navy700} style={{ marginTop: 30 }} /> : (
          <>
            <View style={s.botoes}>
              <TouchableOpacity style={[s.botao, { flex: 1 }]} onPress={() => compartilharLinks(r.id, r.titulo, 'loja')}>
                <Feather name="share-2" size={16} color={colors.white} />
                <Text style={s.botaoTxt}>Link das lojas</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.botaoSec, { flex: 1 }]} onPress={() => Linking.openURL(linkPainel(r.id))}>
                <Feather name="external-link" size={16} color={colors.navy700} />
                <Text style={s.botaoSecTxt}>Painel completo</Text>
              </TouchableOpacity>
            </View>

            <View style={s.kpis}>
              <View style={s.kpi}><Text style={s.kpiNum}>{p}%</Text><Text style={s.kpiRot}>marcado</Text></View>
              <View style={s.kpi}><Text style={[s.kpiNum, { color: VERDE }]}>{concluidas}/{r.total_lojas}</Text><Text style={s.kpiRot}>lojas concluídas</Text></View>
              <View style={s.kpi}><Text style={[s.kpiNum, { color: VERMELHO }]}>{r.rupturas}</Text><Text style={s.kpiRot}>rupturas</Text></View>
            </View>
            <Text style={s.legenda}>{r.total_itens} itens × {r.total_lojas} lojas · atualiza sozinho a cada 15 s{quando ? ` · ${dataCurta(quando.toISOString()).slice(6)}` : ''}</Text>

            <TouchableOpacity style={[s.botaoSec, compartilhando && { opacity: 0.6 }]} onPress={compartilharRupturas} disabled={compartilhando}>
              {compartilhando ? <ActivityIndicator color={colors.navy700} /> : <Feather name="send" size={16} color={colors.navy700} />}
              <Text style={s.botaoSecTxt}>Compartilhar rupturas de todas as lojas</Text>
            </TouchableOpacity>

            <Text style={s.secao}>PROGRESSO POR LOJA · TOQUE PARA VER OS ITENS</Text>
            <View style={s.card}>
              {lojas.map((l, i) => {
                const lp = pct(l.feitos, r.total_itens);
                const cor = lp >= 100 ? VERDE : lp > 0 ? AMARELO : colors.gray400;
                return (
                  <TouchableOpacity key={l.loja} onPress={() => onLoja(r.titulo, l.loja)} style={[{ paddingVertical: 10, gap: 4 }, i > 0 && s.linhaBorda]}>
                    <View style={s.secaoLinha}>
                      <Text style={s.linhaTitulo}>{l.loja}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[s.linhaTitulo, { color: cor }]}>{lp >= 100 ? 'Concluída' : `${l.feitos}/${r.total_itens}`}</Text>
                        <Feather name="chevron-right" size={18} color={colors.gray400} />
                      </View>
                    </View>
                    <View style={s.barra}><View style={[s.barraCheia, { width: `${lp}%`, backgroundColor: cor }]} /></View>
                    <Text style={s.legenda}>
                      {l.feitos ? `${l.quem ?? '—'} · ${dataCurta(l.ultima)}` : 'Não começou'}
                      {l.rupturas ? `  ·  🔴 ${l.rupturas} ruptura${l.rupturas > 1 ? 's' : ''}` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {r.itens_ruptura?.length ? (
              <>
                <Text style={s.secao}>ITENS COM RUPTURA</Text>
                <View style={s.card}>
                  {r.itens_ruptura.slice(0, 30).map((it, i) => (
                    <View key={it.cod} style={[s.secaoLinha, { paddingVertical: 8 }, i > 0 && s.linhaBorda]}>
                      <Text style={[s.legenda, { flex: 1, color: colors.gray900 }]}>{it.nome ?? it.cod}</Text>
                      <Text style={[s.linhaTitulo, { color: VERMELHO }]}>{it.lojas} loja{it.lojas > 1 ? 's' : ''}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <TouchableOpacity onPress={encerrar} style={{ alignSelf: 'center', padding: 12 }}>
              <Text style={[s.link, { color: VERMELHO }]}>Encerrar contagem</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Itens de UMA loja: o que tem, pouco, ruptura e o que falta conferir.
const ROTULO: Record<string, { txt: string; cor: string; fundo: string }> = {
  ruptura: { txt: 'Ruptura', cor: VERMELHO, fundo: '#FDE8E7' },
  baixo: { txt: 'Pouco', cor: AMARELO, fundo: '#FDF3DC' },
  tem: { txt: 'Tem', cor: VERDE, fundo: '#DFF3E8' },
  nada: { txt: 'Não conferido', cor: colors.gray600, fundo: colors.gray100 },
};
type Filtro = 'ruptura' | 'baixo' | 'nada' | 'tem' | 'todos';

function DetalheLoja({ id, titulo, loja, onVoltar }: { id: string; titulo: string; loja: string; onVoltar: () => void }) {
  const [itens, setItens] = useState<ItemLoja[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('ruptura');
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(() => {
    respostasContagem(id).then((d) => { setItens(itensDaLoja(d, loja)); setErro(null); })
      .catch((e) => setErro(e.message)).finally(() => setAtualizando(false));
  }, [id, loja]);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 15000);
    return () => clearInterval(t);
  }, [carregar]);

  const chave = (st: StatusItem) => (st ?? 'nada') as Exclude<Filtro, 'todos'>;
  const qtd = (f: Filtro) => (itens ?? []).filter((i) => f === 'todos' || chave(i.status) === f).length;
  const lista = (itens ?? []).filter((i) => filtro === 'todos' || chave(i.status) === filtro);
  const quem = [...new Set((itens ?? []).map((i) => i.por).filter(Boolean))].join(', ');

  return (
    <View style={s.flex}>
      <CabecalhoTela titulo={loja} subtitulo={titulo} icone="home" onVoltar={onVoltar} />
      <ScrollView style={s.flex} contentContainerStyle={s.conteudo}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}>
        {erro && !itens ? <Text style={s.vazio}>{erro}</Text> : !itens ? <ActivityIndicator color={colors.navy700} style={{ marginTop: 30 }} /> : (
          <>
            <TouchableOpacity style={s.botao} onPress={() => compartilharTexto(textoLoja(titulo, loja, itens))}>
              <Feather name="share-2" size={18} color={colors.white} />
              <Text style={s.botaoTxt}>Compartilhar itens desta loja</Text>
            </TouchableOpacity>
            <Text style={s.legenda}>
              {itens.length - qtd('nada')}/{itens.length} conferidos{quem ? ` · por ${quem}` : ''}
            </Text>
            <View style={s.chips}>
              {(['ruptura', 'baixo', 'nada', 'tem', 'todos'] as Filtro[]).map((f) => {
                const on = filtro === f;
                const rot = f === 'todos' ? 'Todos' : ROTULO[f].txt;
                return (
                  <TouchableOpacity key={f} style={[s.chip, on && s.chipOn]} onPress={() => setFiltro(f)}>
                    <Text style={[s.chipTxt, on && s.chipTxtOn]}>{rot} ({qtd(f)})</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {lista.length === 0 ? <Text style={s.vazio}>Nenhum item aqui.</Text> : (
              <View style={s.card}>
                {lista.map((it, i) => {
                  const r = ROTULO[chave(it.status)];
                  return (
                    <View key={it.cod} style={[s.secaoLinha, { paddingVertical: 9, alignItems: 'flex-start' }, i > 0 && s.linhaBorda]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.legenda, { color: colors.gray900, fontWeight: '600' }]}>{it.nome}</Text>
                        <Text style={s.legenda}>{it.cod}{it.qtd != null ? ` · qtd ${it.qtd}` : ''}{it.obs ? ` · ${it.obs}` : ''}</Text>
                      </View>
                      <View style={{ backgroundColor: r.fundo, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 }}>
                        <Text style={{ color: r.cor, fontWeight: '700', fontSize: 12 }}>{r.txt}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  conteudo: { padding: spacing.lg, paddingBottom: 60, gap: 12 },
  secao: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: colors.gray600, marginTop: 6 },
  secaoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.gray100, gap: 4 },
  cardTitulo: { fontSize: 16, fontWeight: '700', color: colors.gray900 },
  legenda: { fontSize: 13, color: colors.gray600 },
  vazio: { textAlign: 'center', color: colors.gray600, marginTop: 30 },
  dica: { textAlign: 'center', color: colors.gray400, fontSize: 12, marginTop: 8 },
  barra: { height: 8, borderRadius: 4, backgroundColor: colors.gray100, overflow: 'hidden', marginVertical: 4 },
  barraCheia: { height: 8, borderRadius: 4, backgroundColor: '#2F7BFF' },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2F7BFF', borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 12 },
  botaoTxt: { color: colors.white, fontWeight: '700', fontSize: 15 },
  botaoSec: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E3EDFF', borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 12 },
  botaoSecTxt: { color: colors.navy700, fontWeight: '700', fontSize: 15 },
  botoes: { flexDirection: 'row', gap: 10 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  linhaBorda: { borderTopWidth: 1, borderTopColor: colors.gray100 },
  linhaTitulo: { fontSize: 15, fontWeight: '700', color: colors.gray900 },
  link: { color: '#2F7BFF', fontWeight: '700', fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.full, borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white },
  chipOn: { backgroundColor: '#2F7BFF', borderColor: '#2F7BFF' },
  chipTxt: { fontWeight: '700', color: colors.gray600 },
  chipTxtOn: { color: colors.white },
  input: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: 14, fontSize: 15, color: colors.gray900 },
  kpis: { flexDirection: 'row', gap: 10 },
  kpi: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: 12, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center' },
  kpiNum: { fontSize: 22, fontWeight: '800', color: colors.gray900 },
  kpiRot: { fontSize: 11, color: colors.gray600, textAlign: 'center' },
});
