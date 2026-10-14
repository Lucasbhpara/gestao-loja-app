import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { setores } from '../data/employees';
import { ColaboradorLoja, buscarColaboradoresLoja } from '../data/colaboradoresLojaApi';
import { RegistroEscala, buscarFaltasEAtestadosDoMes, buscarFaltasEAtestadosDoColaborador } from '../data/escalaApi';
import CabecalhoTela from '../components/CabecalhoTela';

// Histórico de faltas (só administradores): todas as faltas e atestados do
// mês, com quem lançou e quando — e um resumo por encarregado. Mesma
// informação da aba "Histórico de faltas" do Portal.

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const hit = { top: 10, bottom: 10, left: 10, right: 10 };

function dataCurta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
function dataHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const nomeSetor = (k: string) => setores.find((s) => s.key === k)?.nome ?? k;

export default function HistoricoFaltasScreen({ onVoltar }: { onVoltar: () => void }) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [registros, setRegistros] = useState<RegistroEscala[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorLoja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroPor, setFiltroPor] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<'falta' | 'atestado' | null>(null);
  const [pessoa, setPessoa] = useState<ColaboradorLoja | null>(null);

  function carregar() {
    Promise.all([buscarFaltasEAtestadosDoMes(ano, mes), colaboradores.length ? Promise.resolve(colaboradores) : buscarColaboradoresLoja()])
      .then(([r, c]) => {
        setRegistros(r);
        setColaboradores(c);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar o histórico.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    setCarregando(true);
    carregar();
  }, [ano, mes]);

  function trocarMes(delta: number) {
    let m = mes + delta;
    let a = ano;
    if (m > 12) { m = 1; a += 1; }
    if (m < 1) { m = 12; a -= 1; }
    setMes(m);
    setAno(a);
  }

  const porId = useMemo(() => new Map(colaboradores.map((c) => [c.id, c])), [colaboradores]);
  const todos = useMemo(
    () => registros.map((r) => ({ ...r, por: r.registradoPorNome || '(sem nome)', colaborador: porId.get(r.colaboradorLojaId) })),
    [registros, porId]
  );
  const resumo = useMemo(() => {
    const m = new Map<string, { falta: number; atestado: number; pessoas: Set<string> }>();
    todos.forEach((r) => {
      const q = m.get(r.por) ?? { falta: 0, atestado: 0, pessoas: new Set<string>() };
      if (r.tipo === 'falta') q.falta += 1;
      else q.atestado += 1;
      q.pessoas.add(r.colaboradorLojaId);
      m.set(r.por, q);
    });
    return Array.from(m.entries()).sort((a, b) => b[1].falta + b[1].atestado - (a[1].falta + a[1].atestado));
  }, [todos]);
  const lista = todos.filter((r) => (!filtroPor || r.por === filtroPor) && (!filtroTipo || r.tipo === filtroTipo));
  const totalFaltas = todos.filter((r) => r.tipo === 'falta').length;
  const porPessoa = useMemo(() => {
    const m = new Map<string, { c: ColaboradorLoja | undefined; falta: number; atestado: number }>();
    todos.forEach((r) => {
      const q = m.get(r.colaboradorLojaId) ?? { c: r.colaborador, falta: 0, atestado: 0 };
      if (r.tipo === 'falta') q.falta += 1;
      else q.atestado += 1;
      m.set(r.colaboradorLojaId, q);
    });
    return Array.from(m.values())
      .filter((q) => q.c)
      .sort((a, b) => b.falta + b.atestado - (a.falta + a.atestado));
  }, [todos]);

  if (pessoa) return <HistoricoDoColaborador colaborador={pessoa} onVoltar={() => setPessoa(null)} />;

  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo="Histórico de faltas" icone="clock" onVoltar={onVoltar} />
      <View style={styles.mesNav}>
        <TouchableOpacity onPress={() => trocarMes(-1)} hitSlop={hit} style={styles.mesSeta} accessibilityLabel="Mês anterior">
          <Text style={styles.mesSetaTexto}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.mesTitulo}>{MESES[mes - 1]} de {ano}</Text>
        <TouchableOpacity onPress={() => trocarMes(1)} hitSlop={hit} style={styles.mesSeta} accessibilityLabel="Próximo mês">
          <Text style={styles.mesSetaTexto}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : (
          <>
            <View style={styles.kpis}>
              <View style={styles.kpi}>
                <Text style={styles.kpiValor}>{totalFaltas}</Text>
                <Text style={styles.kpiRotulo}>faltas</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValor}>{todos.length - totalFaltas}</Text>
                <Text style={styles.kpiRotulo}>atestados</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValor}>{new Set(todos.map((r) => r.colaboradorLojaId)).size}</Text>
                <Text style={styles.kpiRotulo}>pessoas</Text>
              </View>
            </View>

            {porPessoa.length > 0 && (
              <>
                <Text style={styles.secao}>Por colaborador</Text>
                <View style={styles.cartao}>
                  {porPessoa.map((q, i) => (
                    <TouchableOpacity
                      key={q.c!.id}
                      style={[styles.porLinha, i > 0 && styles.divisor]}
                      onPress={() => setPessoa(q.c!)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.porNome}>{q.c!.nome}</Text>
                        <Text style={styles.porSub}>
                          {nomeSetor(q.c!.setor)} · {q.falta} {q.falta === 1 ? 'falta' : 'faltas'} · {q.atestado} {q.atestado === 1 ? 'atestado' : 'atestados'}
                        </Text>
                      </View>
                      <Text style={styles.porSeta}>›</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {resumo.length > 0 && (
              <>
                <Text style={styles.secao}>Por encarregado</Text>
                <View style={styles.cartao}>
                  {resumo.map(([nome, q], i) => {
                    const ativo = filtroPor === nome;
                    return (
                      <TouchableOpacity
                        key={nome}
                        style={[styles.porLinha, i > 0 && styles.divisor, ativo && styles.porLinhaAtiva]}
                        onPress={() => setFiltroPor(ativo ? null : nome)}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.porNome}>{nome}</Text>
                          <Text style={styles.porSub}>
                            {q.pessoas.size} {q.pessoas.size === 1 ? 'pessoa' : 'pessoas'}
                          </Text>
                        </View>
                        <Text style={styles.porNumeros}>
                          {q.falta} {q.falta === 1 ? 'falta' : 'faltas'} · {q.atestado} {q.atestado === 1 ? 'atestado' : 'atestados'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.chips}>
              {([null, 'falta', 'atestado'] as const).map((t) => (
                <TouchableOpacity key={t ?? 'todos'} style={[styles.chip, filtroTipo === t && styles.chipAtivo]} onPress={() => setFiltroTipo(t)}>
                  <Text style={[styles.chipTexto, filtroTipo === t && styles.chipTextoAtivo]}>
                    {t === null ? 'Tudo' : t === 'falta' ? 'Só faltas' : 'Só atestados'}
                  </Text>
                </TouchableOpacity>
              ))}
              {filtroPor && (
                <TouchableOpacity style={[styles.chip, styles.chipAtivo]} onPress={() => setFiltroPor(null)}>
                  <Text style={[styles.chipTexto, styles.chipTextoAtivo]}>{filtroPor} ✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {lista.length === 0 ? (
              <Text style={styles.vazio}>{todos.length ? 'Nada com esses filtros.' : 'Nenhuma falta ou atestado lançado nesse mês.'}</Text>
            ) : (
              <View style={styles.cartao}>
                {lista.map((r, i) => {
                  const falta = r.tipo === 'falta';
                  return (
                    <View key={r.id} style={[styles.item, i > 0 && styles.divisor]}>
                      <View style={styles.itemTopo}>
                        <View style={{ flex: 1 }}>
                          <TouchableOpacity disabled={!r.colaborador} onPress={() => r.colaborador && setPessoa(r.colaborador)} hitSlop={hit}>
                            <Text style={styles.itemNome}>{r.colaborador?.nome ?? '(colaborador removido)'}</Text>
                          </TouchableOpacity>
                          {r.colaborador && <Text style={styles.itemSetor}>{nomeSetor(r.colaborador.setor)}</Text>}
                        </View>
                        <View style={[styles.badge, { backgroundColor: falta ? '#FBDEDC' : '#FBEBD4' }]}>
                          <Text style={[styles.badgeTexto, { color: falta ? colors.red500 : '#B5750E' }]}>{falta ? 'Falta' : 'Atestado'}</Text>
                        </View>
                      </View>
                      <Text style={styles.itemLinha}>Dia {dataCurta(r.data)}</Text>
                      <Text style={styles.itemLinha}>
                        Lançado por <Text style={{ fontWeight: '700', color: colors.gray900 }}>{r.por}</Text> · {dataHora(r.registradoEm ?? r.criadoEm)}
                      </Text>
                      {r.observacao ? <Text style={styles.itemObs}>{r.observacao}</Text> : null}
                      {r.fotoUrl ? (
                        <TouchableOpacity onPress={() => Linking.openURL(r.fotoUrl as string)} hitSlop={hit}>
                          <Text style={styles.link}>Ver foto</Text>
                        </TouchableOpacity>
                      ) : null}
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

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  mesNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  mesSeta: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mesSetaTexto: { fontSize: 26, color: colors.navy700 },
  mesTitulo: { fontSize: 15, fontWeight: '700', color: colors.navy900, minWidth: 150, textAlign: 'center' },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12 },
  kpis: { flexDirection: 'row', gap: 8, marginBottom: spacing.lg },
  kpi: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' },
  kpiValor: { fontSize: 22, fontWeight: '800', color: colors.navy900 },
  kpiRotulo: { fontSize: 11, color: colors.gray600, marginTop: 2 },
  secao: { fontSize: 13, fontWeight: '800', color: colors.gray600, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.4 },
  cartao: { backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  divisor: { borderTopWidth: 1, borderTopColor: colors.gray100 },
  porLinha: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.sm, minHeight: 44 },
  porLinhaAtiva: { backgroundColor: '#EEF4FF', marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg },
  porNome: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  porSub: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  porNumeros: { fontSize: 12, fontWeight: '700', color: colors.navy700 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 12, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  vazio: { textAlign: 'center', color: colors.gray600, fontSize: 13, marginTop: spacing.xl },
  item: { paddingVertical: spacing.md },
  itemTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: 4 },
  itemNome: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  itemSetor: { fontSize: 11.5, color: colors.gray400, marginTop: 1 },
  itemLinha: { fontSize: 12.5, color: colors.gray600, marginTop: 2 },
  itemObs: { fontSize: 12.5, color: colors.gray900, marginTop: 6, fontStyle: 'italic' },
  link: { color: '#2F7BFF', fontWeight: '700', fontSize: 12.5, marginTop: 6 },
  badge: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  badgeTexto: { fontSize: 11, fontWeight: '700' },
  porSeta: { fontSize: 22, color: colors.gray400 },
  pessoaSetor: { fontSize: 13, color: colors.gray600, marginBottom: spacing.md },
});

// Histórico completo de uma pessoa, agrupado por mês.
function HistoricoDoColaborador({ colaborador, onVoltar }: { colaborador: ColaboradorLoja; onVoltar: () => void }) {
  const [registros, setRegistros] = useState<RegistroEscala[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    buscarFaltasEAtestadosDoColaborador(colaborador.id)
      .then((r) => setRegistros(r))
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar o histórico.'))
      .finally(() => setCarregando(false));
  }, [colaborador.id]);

  const anoAtual = new Date().getFullYear();
  const doAno = registros.filter((r) => r.data.startsWith(String(anoAtual)));
  const meses = useMemo(() => {
    const m = new Map<string, RegistroEscala[]>();
    registros.forEach((r) => {
      const k = r.data.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), r]);
    });
    return Array.from(m.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [registros]);
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;

  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo={colaborador.nome} icone="user" onVoltar={onVoltar} />
      <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <Text style={styles.pessoaSetor}>{nomeSetor(colaborador.setor)} · histórico de faltas e atestados</Text>
        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}
        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : (
          <>
            <View style={styles.kpis}>
              <View style={styles.kpi}>
                <Text style={styles.kpiValor}>{doAno.filter((r) => r.tipo === 'falta').length}</Text>
                <Text style={styles.kpiRotulo}>faltas em {anoAtual}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValor}>{doAno.filter((r) => r.tipo === 'atestado').length}</Text>
                <Text style={styles.kpiRotulo}>atestados em {anoAtual}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValor}>{registros.length}</Text>
                <Text style={styles.kpiRotulo}>no total</Text>
              </View>
            </View>
            {registros.length === 0 ? (
              <Text style={styles.vazio}>Nenhuma falta ou atestado registrado para essa pessoa.</Text>
            ) : (
              meses.map(([k, itens]) => {
                const [a, m] = k.split('-');
                const f = itens.filter((r) => r.tipo === 'falta').length;
                return (
                  <View key={k}>
                    <Text style={styles.secao}>
                      {MESES[Number(m) - 1]} de {a} · {plural(f, 'falta')}, {plural(itens.length - f, 'atestado')}
                    </Text>
                    <View style={styles.cartao}>
                      {itens.map((r, i) => {
                        const falta = r.tipo === 'falta';
                        return (
                          <View key={r.id} style={[styles.item, i > 0 && styles.divisor]}>
                            <View style={styles.itemTopo}>
                              <Text style={[styles.itemNome, { flex: 1 }]}>Dia {dataCurta(r.data)}</Text>
                              <View style={[styles.badge, { backgroundColor: falta ? '#FBDEDC' : '#FBEBD4' }]}>
                                <Text style={[styles.badgeTexto, { color: falta ? colors.red500 : '#B5750E' }]}>{falta ? 'Falta' : 'Atestado'}</Text>
                              </View>
                            </View>
                            <Text style={styles.itemLinha}>
                              Lançado por <Text style={{ fontWeight: '700', color: colors.gray900 }}>{r.registradoPorNome || '(sem nome)'}</Text> ·{' '}
                              {dataHora(r.registradoEm ?? r.criadoEm)}
                            </Text>
                            {r.observacao ? <Text style={styles.itemObs}>{r.observacao}</Text> : null}
                            {r.fotoUrl ? (
                              <TouchableOpacity onPress={() => Linking.openURL(r.fotoUrl as string)} hitSlop={hit}>
                                <Text style={styles.link}>Ver foto</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
