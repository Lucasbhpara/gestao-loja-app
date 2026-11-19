// Histórico da loja (Visita Técnica): digita o número da loja e vê todas as
// visitas dela, agrupadas por dia — setores, nota, não conformidades e como
// ficou a correção (tarefa no app na 327, link da loja nas demais).
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { supabase } from '../lib/supabase';
import { SETORES_VISITA, VisitaTecnica, buscarVisitasFinalizadas, faixaNotaLivre, nomeDoSetorVisita } from '../data/visitaTecnicaApi';
import { classificacao, formatarNumero } from '../lib/contextoRelatorio';
import { compartilharVisitaCompleta } from '../lib/visitaTecnicaPdf';
import AreaTeclado from '../components/AreaTeclado';

const CHAVE_BUSCA = '@ulva/historico-loja-ultima';

type Correcao = { texto: string; cor: string; fundo: string; aberta: boolean };
const VERDE = { cor: '#15803D', fundo: '#E7F6EC' };
const LARANJA = { cor: '#B45309', fundo: '#FFF6E5' };
const VERMELHO = { cor: '#B42318', fundo: '#FEECEB' };

function dataBr(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}
function diaPorExtenso(iso: string): string {
  const t = new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function notaDe(v: VisitaTecnica): { texto: string; cor: string; fundo: string } {
  if (v.aproveitamento == null) return { texto: `Sem nota · ${v.naoConformidades ?? 0} apont.`, cor: colors.gray600, fundo: colors.gray100 };
  if (v.modelo === 'livre') {
    const f = faixaNotaLivre(v.aproveitamento);
    return { texto: `${String(v.aproveitamento).replace('.', ',')} · ${f.texto}`, cor: f.cor, fundo: f.fundo };
  }
  const c = classificacao(v.aproveitamento);
  return { texto: `${String(v.aproveitamento).replace('.', ',')}% · ${c.texto}`, cor: c.cor, fundo: c.fundo };
}
function media(vs: VisitaTecnica[]): number | null {
  const n = vs.filter((v) => v.aproveitamento != null);
  return n.length ? n.reduce((s, v) => s + (v.aproveitamento ?? 0), 0) / n.length : null;
}

async function carregarCorrecoes(vs: VisitaTecnica[]): Promise<Map<string, Correcao>> {
  const mapa = new Map<string, Correcao>();
  const comNc = vs.filter((v) => (v.naoConformidades ?? 0) > 0);
  const tarefas = comNc.map((v) => v.tarefaId).filter(Boolean) as string[];
  const semTarefa = comNc.filter((v) => !v.tarefaId).map((v) => v.id);
  const [t, c] = await Promise.all([
    tarefas.length ? supabase.from('tarefas').select('id, concluida, correcao_status').in('id', tarefas) : Promise.resolve({ data: [] as any[] }),
    semTarefa.length ? supabase.from('vt_correcao_loja').select('visita_id, avaliacao').in('visita_id', semTarefa) : Promise.resolve({ data: [] as any[] }),
  ]);
  const porTarefa = new Map(((t as any).data ?? []).map((x: any) => [x.id, x]));
  const porVisita = new Map<string, any[]>();
  ((c as any).data ?? []).forEach((x: any) => porVisita.set(x.visita_id, [...(porVisita.get(x.visita_id) ?? []), x]));
  vs.forEach((v) => {
    const nc = v.naoConformidades ?? 0;
    if (!nc) return mapa.set(v.id, { texto: 'Sem pendência', ...VERDE, aberta: false });
    if (v.tarefaId) {
      const x: any = porTarefa.get(v.tarefaId);
      if (x && (x.correcao_status === 'aprovada' || x.concluida)) return mapa.set(v.id, { texto: 'Concluída', ...VERDE, aberta: false });
      if (x?.correcao_status === 'enviada') return mapa.set(v.id, { texto: 'Aguardando aprovação', ...LARANJA, aberta: true });
      if (x?.correcao_status === 'devolvida') return mapa.set(v.id, { texto: 'Devolvida', ...VERMELHO, aberta: true });
      return mapa.set(v.id, { texto: 'Pendente', ...VERMELHO, aberta: true });
    }
    const cs = porVisita.get(v.id) ?? [];
    const aprov = cs.filter((x) => x.avaliacao === 'aprovado').length;
    const aguard = cs.filter((x) => !x.avaliacao).length;
    if (aprov >= nc) return mapa.set(v.id, { texto: 'Concluída', ...VERDE, aberta: false });
    if (aguard) return mapa.set(v.id, { texto: `${aguard} para conferir · ${cs.length}/${nc}`, ...LARANJA, aberta: true });
    if (cs.length) return mapa.set(v.id, { texto: `${cs.length} de ${nc} respondidos`, ...LARANJA, aberta: true });
    mapa.set(v.id, { texto: 'Sem resposta da loja', ...VERMELHO, aberta: true });
  });
  return mapa;
}

export default function HistoricoLojaScreen({ onVoltar, lojaInicial }: { onVoltar: () => void; lojaInicial?: string | null }) {
  const [numero, setNumero] = useState(lojaInicial ?? '');
  const [loja, setLoja] = useState<string | null>(null);
  const [nomeLoja, setNomeLoja] = useState<string | null>(null);
  const [visitas, setVisitas] = useState<VisitaTecnica[] | null>(null);
  const [correcoes, setCorrecoes] = useState<Map<string, Correcao>>(new Map());
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);

  useEffect(() => {
    if (lojaInicial) return;
    AsyncStorage.getItem(CHAVE_BUSCA).then((u) => u && setNumero(u)).catch(() => {});
  }, [lojaInicial]);

  async function buscar() {
    const u = String(Number(numero.trim()));
    if (!/^\d{1,5}$/.test(numero.trim())) return;
    AsyncStorage.setItem(CHAVE_BUSCA, u).catch(() => {});
    setCarregando(true);
    setLoja(u);
    try {
      const [vs, l] = await Promise.all([
        buscarVisitasFinalizadas(u, 300),
        supabase.from('vt_lojas').select('nome').eq('numero', u).maybeSingle(),
      ]);
      setNomeLoja((l as any).data?.nome ?? null);
      setVisitas(vs);
      setCorrecoes(await carregarCorrecoes(vs));
    } catch (e: any) {
      Alert.alert('Não consegui carregar', 'Confira a internet e tente de novo.');
      setVisitas(null);
    } finally {
      setCarregando(false);
    }
  }

  async function pdfDoDia(lista: VisitaTecnica[], chave: string) {
    setGerando(chave);
    try {
      await compartilharVisitaCompleta(lista);
    } catch (e: any) {
      Alert.alert('Não consegui gerar o PDF', e?.message ?? 'Tente de novo.');
    } finally {
      setGerando(null);
    }
  }

  // Agrupa por dia (mais recente primeiro); dentro do dia, na ordem dos setores.
  const dias: { chave: string; lista: VisitaTecnica[] }[] = [];
  (visitas ?? []).forEach((v) => {
    const chave = new Date(v.finalizadaEm ?? v.iniciadaEm).toDateString();
    let d = dias.find((x) => x.chave === chave);
    if (!d) dias.push((d = { chave, lista: [] }));
    d.lista.push(v);
  });
  const ordem = (s: string) => SETORES_VISITA.findIndex((x) => x.key === s);
  dias.forEach((d) => d.lista.sort((a, b) => ordem(a.setor) - ordem(b.setor)));

  const m = visitas ? media(visitas) : null;
  const nc = (visitas ?? []).reduce((s, v) => s + (v.naoConformidades ?? 0), 0);
  const abertas = (visitas ?? []).filter((v) => correcoes.get(v.id)?.aberta).length;

  return (
    <AreaTeclado style={{ flex: 1 }}>
      <View style={st.topo}>
        <TouchableOpacity onPress={onVoltar} style={st.voltar}>
          <Feather name="chevron-left" size={18} color={colors.white} />
          <Text style={st.voltarTxt}>Voltar</Text>
        </TouchableOpacity>
        <Text style={st.titulo}>Histórico da loja</Text>
        <Text style={st.sub}>Quando foi cada visita, como foi e se a loja corrigiu.</Text>
        <View style={st.buscaLinha}>
          <Text style={st.prefixo}>Loja</Text>
          <TextInput
            style={st.input}
            value={numero}
            onChangeText={(t) => setNumero(t.replace(/\D/g, '').slice(0, 5))}
            keyboardType="number-pad"
            placeholder="327"
            placeholderTextColor={colors.gray400}
            returnKeyType="search"
            onSubmitEditing={buscar}
          />
          <TouchableOpacity style={st.btnBuscar} onPress={buscar}>
            <Feather name="search" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {carregando ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy700} />
        ) : !loja ? (
          <Text style={st.vazio}>Digite o número da loja e toque na lupa.</Text>
        ) : visitas && !visitas.length ? (
          <Text style={st.vazio}>A loja {loja} ainda não teve Visita Técnica.</Text>
        ) : visitas ? (
          <>
            <Text style={st.lojaNome}>Loja {loja}{nomeLoja ? ` · ${nomeLoja}` : ''}</Text>
            <View style={st.kpis}>
              <Kpi rotulo="Visitas" valor={String(visitas.length)} />
              <Kpi rotulo="Média" valor={m == null ? '—' : `${m.toFixed(1).replace('.', ',')}`} />
              <Kpi rotulo="Problemas" valor={String(nc)} cor={nc ? VERMELHO.cor : VERDE.cor} />
              <Kpi rotulo="Correções abertas" valor={String(abertas)} cor={abertas ? VERMELHO.cor : VERDE.cor} />
            </View>
            <Text style={st.ultima}>Última visita: {dataBr(visitas[0]?.finalizadaEm ?? null)}</Text>

            {dias.map((d) => {
              const v0 = d.lista[0];
              const md = media(d.lista);
              return (
                <View key={d.chave} style={st.dia}>
                  <View style={st.diaTopo}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.diaTitulo}>{diaPorExtenso(v0.finalizadaEm ?? v0.iniciadaEm)}</Text>
                      <Text style={st.diaSub}>
                        {v0.veterinarioNome} · {d.lista.length} {d.lista.length === 1 ? 'setor' : 'setores'}
                        {md != null ? ` · média ${md.toFixed(1).replace('.', ',')}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity style={st.btnPdf} onPress={() => pdfDoDia(d.lista, d.chave)} disabled={!!gerando}>
                      {gerando === d.chave ? <ActivityIndicator color={colors.white} size="small" /> : <Feather name="file-text" size={14} color={colors.white} />}
                      <Text style={st.btnPdfTxt}>PDF do dia</Text>
                    </TouchableOpacity>
                  </View>
                  {d.lista.map((v) => {
                    const n = notaDe(v);
                    const c = correcoes.get(v.id);
                    return (
                      <View key={v.id} style={st.linha}>
                        <View style={{ flex: 1 }}>
                          <Text style={st.setor}>{nomeDoSetorVisita(v.setor)}</Text>
                          <Text style={st.numero}>
                            {formatarNumero('VT', v.numero, v.finalizadaEm) ?? ''}
                            {(v.naoConformidades ?? 0) ? ` · ${v.naoConformidades} problema(s)` : ''}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Text style={[st.pill, { color: n.cor, backgroundColor: n.fundo }]}>{n.texto}</Text>
                          {c ? <Text style={[st.pill, { color: c.cor, backgroundColor: c.fundo }]}>{c.texto}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </AreaTeclado>
  );
}

function Kpi({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <View style={st.kpi}>
      <Text style={st.kpiRot}>{rotulo}</Text>
      <Text style={[st.kpiVal, cor ? { color: cor } : null]}>{valor}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  topo: { backgroundColor: colors.navy900, paddingTop: 48, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  voltarTxt: { color: colors.white, fontWeight: '700' },
  titulo: { color: colors.white, fontSize: 22, fontWeight: '800', marginTop: spacing.sm },
  sub: { color: '#C9D2DE', fontSize: 13, marginTop: 2 },
  buscaLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, paddingLeft: 14 },
  prefixo: { fontWeight: '800', color: colors.gray600, fontSize: 16 },
  input: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.gray900, paddingVertical: 10 },
  btnBuscar: { backgroundColor: colors.navy700, width: 48, height: 48, borderTopRightRadius: radius.md, borderBottomRightRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  vazio: { textAlign: 'center', color: colors.gray600, marginTop: 40, fontSize: 14.5 },
  lojaNome: { fontSize: 19, fontWeight: '800', color: colors.gray900 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  kpi: { flexGrow: 1, flexBasis: '45%', backgroundColor: colors.white, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.gray100 },
  kpiRot: { fontSize: 12, color: colors.gray600, fontWeight: '600' },
  kpiVal: { fontSize: 20, fontWeight: '800', color: colors.gray900, marginTop: 2 },
  ultima: { color: colors.gray600, fontSize: 12.5, marginTop: spacing.sm, marginBottom: spacing.sm },
  dia: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.gray100 },
  diaTopo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  diaTitulo: { fontWeight: '800', color: colors.gray900, fontSize: 14.5 },
  diaSub: { color: colors.gray600, fontSize: 12.5, marginTop: 2 },
  btnPdf: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.navy700, borderRadius: 18, paddingHorizontal: 12, height: 34 },
  btnPdfTxt: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.gray100 },
  setor: { fontWeight: '700', color: colors.gray900, fontSize: 14 },
  numero: { color: colors.gray600, fontSize: 11.5, marginTop: 2 },
  pill: { fontSize: 11.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
});
