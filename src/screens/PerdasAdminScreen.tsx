import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { setores, SetorKey } from '../data/employees';
import { Perda, buscarTodasPerdas, buscarVendaSetores, vendaDoSetor, VendaSetores } from '../data/perdasApi';
import CabecalhoTela from '../components/CabecalhoTela';

function formatarReais(valor: number): string {
  return 'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarPct(v: number, casas = 1): string {
  return v.toFixed(casas).replace('.', ',') + '%';
}

// Cor da quebra geral do setor (bem menor que a % de um produto sozinho).
function corQuebraSetor(pct: number): { cor: string; fundo: string } {
  if (pct >= 3) return { cor: colors.red500, fundo: '#FBDEDC' };
  if (pct >= 1) return { cor: '#B4650E', fundo: '#FBEBD4' };
  return { cor: colors.green500, fundo: '#DFF3E9' };
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function corPct(pct: number | null): { cor: string; fundo: string } {
  if (pct === null) return { cor: colors.gray600, fundo: colors.gray50 };
  if (pct >= 100) return { cor: colors.red500, fundo: '#FBDEDC' };
  if (pct >= 30) return { cor: '#B4650E', fundo: '#FBEBD4' };
  return { cor: colors.green500, fundo: '#DFF3E9' };
}

export default function PerdasAdminScreen({ onVoltar }: { onVoltar: () => void }) {
  const [perdas, setPerdas] = useState<Perda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [setorFiltro, setSetorFiltro] = useState<SetorKey | null>(null);
  const [vendas, setVendas] = useState<VendaSetores | null>(null);

  function carregar() {
    buscarTodasPerdas()
      .then(async (lista) => {
        setPerdas(lista);
        setErro(null);
        if (lista[0]) {
          // Sem venda, a quebra aparece só em valor — não é erro.
          setVendas(await buscarVendaSetores(lista[0].periodoInicio, lista[0].periodoFim).catch(() => null));
        }
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar as perdas.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
  }, []);

  function nomeSetor(key: SetorKey) {
    return setores.find((s) => s.key === key)?.nome ?? key;
  }

  const perdasFiltradas = useMemo(
    () => (setorFiltro ? perdas.filter((p) => p.setor === setorFiltro) : perdas),
    [perdas, setorFiltro]
  );

  const totalPerdido = useMemo(
    () => perdasFiltradas.reduce((soma, p) => soma + p.valorPerdido, 0),
    [perdasFiltradas]
  );

  const periodo = perdas[0];

  // Quebra geral de cada setor: total perdido, venda do setor e % sobre a venda.
  const resumoSetores = useMemo(() => {
    const total = perdas.reduce((s, p) => s + p.valorPerdido, 0);
    const mapa = new Map<SetorKey, { perdido: number; itens: number; sorts: Map<string, { perdido: number; itens: number }> }>();
    perdas.forEach((p) => {
      const r = mapa.get(p.setor) ?? { perdido: 0, itens: 0, sorts: new Map() };
      r.perdido += p.valorPerdido;
      r.itens += 1;
      const k = p.sortimento || '(sem sortimento)';
      const so = r.sorts.get(k) ?? { perdido: 0, itens: 0 };
      so.perdido += p.valorPerdido;
      so.itens += 1;
      r.sorts.set(k, so);
      mapa.set(p.setor, r);
    });
    return Array.from(mapa.entries())
      .map(([setor, r]) => {
        const venda = vendaDoSetor(setor, vendas);
        return {
          setor,
          perdido: r.perdido,
          itens: r.itens,
          venda,
          pctVenda: venda ? (r.perdido / venda) * 100 : null,
          participacao: total ? (r.perdido / total) * 100 : 0,
          sortimentos: Array.from(r.sorts.entries())
            .map(([nome, so]) => ({ nome, ...so }))
            .sort((a, b) => b.perdido - a.perdido),
        };
      })
      .sort((a, b) => b.perdido - a.perdido);
  }, [perdas, vendas]);

  const setorAtual = setorFiltro ? resumoSetores.find((r) => r.setor === setorFiltro) ?? null : null;
  const vendaTotal = resumoSetores.length && resumoSetores.every((r) => r.venda) ? resumoSetores.reduce((s, r) => s + (r.venda ?? 0), 0) : null;
  const notaVenda = vendas
    ? `Venda do setor de ${periodo ? formatarData(periodo.periodoInicio) : '—'} até ${vendas.ate ? formatarData(vendas.ate) : '—'} (última venda carregada).`
    : 'Venda do setor indisponível — a quebra aparece só em valor.';

  // Só os setores que já têm alguma perda importada aparecem como filtro.
  const setoresComPerda = useMemo(() => {
    const chaves = new Set(perdas.map((p) => p.setor));
    return setores.filter((s) => chaves.has(s.key));
  }, [perdas]);

  return (
    <View style={styles.flex}>
      <CabecalhoTela
        titulo="Perdas e Desperdício"
        icone="trending-down"
        onVoltar={onVoltar}
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              carregar();
            }}
          />
        }
      >
        <View style={styles.resumoCard}>
          <Text style={styles.resumoLabel}>{setorFiltro ? nomeSetor(setorFiltro) : 'Todos os setores'}</Text>
          <Text style={styles.resumoValor}>{formatarReais(totalPerdido)}</Text>
          <Text style={styles.resumoSub}>
            {periodo
              ? `${formatarData(periodo.periodoInicio)} a ${formatarData(periodo.periodoFim)} · ${
                  perdasFiltradas.length
                } ${perdasFiltradas.length === 1 ? 'produto' : 'produtos'}`
              : 'Nenhum relatório importado ainda'}
          </Text>
          {!setorFiltro && vendaTotal ? (
            <Text style={styles.resumoSub}>Quebra sobre a venda da loja: {formatarPct((totalPerdido / vendaTotal) * 100, 2)}</Text>
          ) : null}
        </View>

        {setoresComPerda.length > 0 && (
          <View style={styles.chipsWrap}>
            <TouchableOpacity
              style={[styles.chip, setorFiltro === null && styles.chipAtivo]}
              onPress={() => setSetorFiltro(null)}
            >
              <Text style={[styles.chipTexto, setorFiltro === null && styles.chipTextoAtivo]}>Todos</Text>
            </TouchableOpacity>
            {setoresComPerda.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.chip, setorFiltro === s.key && styles.chipAtivo]}
                onPress={() => setSetorFiltro(s.key)}
              >
                <Text style={[styles.chipTexto, setorFiltro === s.key && styles.chipTextoAtivo]}>{s.nome}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!carregando && !setorFiltro && resumoSetores.length > 0 && (
          <View style={styles.bloco}>
            <Text style={styles.blocoTitulo}>Quebra geral por setor</Text>
            <Text style={styles.blocoDica}>Toque num setor pra ver o detalhe</Text>
            {resumoSetores.map((r) => {
              const c = r.pctVenda !== null ? corQuebraSetor(r.pctVenda) : null;
              return (
                <TouchableOpacity key={r.setor} style={styles.setorLinha} onPress={() => setSetorFiltro(r.setor)} activeOpacity={0.7}>
                  <View style={styles.setorTopo}>
                    <Text style={styles.setorNome}>{nomeSetor(r.setor)}</Text>
                    <Text style={styles.setorValor}>{formatarReais(r.perdido)}</Text>
                  </View>
                  <View style={styles.barra}>
                    <View style={[styles.barraCheia, { width: `${Math.max(2, r.participacao)}%` }]} />
                  </View>
                  <View style={styles.setorRodape}>
                    <Text style={styles.setorSub}>{formatarPct(r.participacao)} das perdas</Text>
                    {c && r.pctVenda !== null && (
                      <View style={[styles.chipPct, { backgroundColor: c.fundo }]}>
                        <Text style={[styles.chipPctTexto, { color: c.cor }]}>{formatarPct(r.pctVenda, 2)} da venda</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.nota}>{notaVenda}</Text>
          </View>
        )}

        {!carregando && setorAtual && (
          <View style={styles.bloco}>
            <View style={styles.setorTopo}>
              <Text style={styles.blocoTitulo}>Quebra geral · {nomeSetor(setorAtual.setor)}</Text>
              <TouchableOpacity onPress={() => setSetorFiltro(null)} hitSlop={10}>
                <Text style={styles.link}>Todos</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.kpis}>
              <View style={styles.kpi}>
                <Text style={styles.kpiRotulo}>Quebra total</Text>
                <Text style={styles.kpiValor}>{formatarReais(setorAtual.perdido)}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiRotulo}>Venda do setor</Text>
                <Text style={styles.kpiValor}>{setorAtual.venda ? formatarReais(setorAtual.venda) : '—'}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiRotulo}>Quebra sobre a venda</Text>
                <Text style={[styles.kpiValor, setorAtual.pctVenda !== null && { color: corQuebraSetor(setorAtual.pctVenda).cor }]}>
                  {setorAtual.pctVenda !== null ? formatarPct(setorAtual.pctVenda, 2) : '—'}
                </Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiRotulo}>Das perdas da loja</Text>
                <Text style={styles.kpiValor}>{formatarPct(setorAtual.participacao)}</Text>
              </View>
            </View>
            <Text style={styles.subTitulo}>POR SORTIMENTO</Text>
            {setorAtual.sortimentos.map((so) => {
              const parte = setorAtual.perdido ? (so.perdido / setorAtual.perdido) * 100 : 0;
              return (
                <View key={so.nome} style={styles.sortLinha}>
                  <View style={styles.setorTopo}>
                    <Text style={styles.sortNome}>{so.nome}</Text>
                    <Text style={styles.sortValor}>{formatarReais(so.perdido)}</Text>
                  </View>
                  <View style={styles.barra}>
                    <View style={[styles.barraCheia, { width: `${Math.max(2, parte)}%` }]} />
                  </View>
                  <Text style={styles.setorSub}>
                    {so.itens} {so.itens === 1 ? 'produto' : 'produtos'} · {formatarPct(parte)} do setor
                  </Text>
                </View>
              );
            })}
            <Text style={styles.nota}>{notaVenda}</Text>
          </View>
        )}

        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : perdasFiltradas.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Nenhum relatório de perdas importado ainda.</Text>
          </View>
        ) : (
          perdasFiltradas.map((p) => {
            const badge = corPct(p.pctPerda);
            return (
              <View key={p.id} style={styles.perdaCard}>
                <View style={styles.perdaTopo}>
                  <Text style={styles.perdaProduto}>{p.produto}</Text>
                  {p.pctPerda !== null && (
                    <View style={[styles.chipPct, { backgroundColor: badge.fundo }]}>
                      <Text style={[styles.chipPctTexto, { color: badge.cor }]}>
                        {p.pctPerda.toFixed(1).replace('.', ',')}%
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.perdaSortimento}>{p.sortimento}</Text>
                <Text style={styles.perdaQtd}>
                  {p.quantidade} {p.unidade} · {formatarReais(p.valorPerdido)}
                </Text>
                <Text style={styles.perdaMeta}>{nomeSetor(p.setor)}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  voltar: { color: colors.navy700, fontSize: 15, fontWeight: '600' },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.navy900 },
  resumoCard: { backgroundColor: colors.navy900, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  resumoLabel: { color: colors.gray100, fontSize: 12, fontWeight: '600' },
  resumoValor: { color: colors.white, fontSize: 26, fontWeight: '700', marginTop: 4 },
  resumoSub: { color: colors.gray100, fontSize: 11, marginTop: 4 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl },
  perdaCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  perdaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  perdaProduto: { fontSize: 14, fontWeight: '700', color: colors.gray900, flex: 1 },
  perdaSortimento: { fontSize: 11, color: colors.gray400, marginTop: 4, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  perdaQtd: { fontSize: 12.5, color: colors.gray600, marginTop: 6, fontWeight: '600' },
  perdaMeta: { fontSize: 11, color: colors.gray400, marginTop: 8 },
  chipPct: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipPctTexto: { fontSize: 11, fontWeight: '700' },
  bloco: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  blocoTitulo: { fontSize: 15, fontWeight: '800', color: colors.navy900, flexShrink: 1 },
  blocoDica: { fontSize: 11.5, color: colors.gray400, marginTop: 2, marginBottom: spacing.sm },
  setorLinha: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray100 },
  setorTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  setorNome: { fontSize: 13.5, fontWeight: '700', color: colors.gray900, flexShrink: 1 },
  setorValor: { fontSize: 14.5, fontWeight: '800', color: colors.navy900 },
  setorRodape: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  setorSub: { fontSize: 11.5, color: colors.gray600, fontWeight: '600', marginTop: 4 },
  barra: { height: 7, backgroundColor: colors.gray50, borderRadius: radius.full, overflow: 'hidden', marginTop: 8 },
  barraCheia: { height: '100%', backgroundColor: '#2F7BFF', borderRadius: radius.full },
  nota: { fontSize: 11, color: colors.gray400, marginTop: spacing.md },
  link: { color: '#2F7BFF', fontWeight: '700', fontSize: 13 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  kpi: { flexBasis: '48%', flexGrow: 1, backgroundColor: colors.gray50, borderRadius: radius.md, padding: spacing.md },
  kpiRotulo: { fontSize: 11, color: colors.gray600, fontWeight: '600' },
  kpiValor: { fontSize: 16, fontWeight: '800', color: colors.navy900, marginTop: 4 },
  subTitulo: { fontSize: 11, fontWeight: '800', color: colors.gray400, letterSpacing: 0.4, marginTop: spacing.lg, marginBottom: 2 },
  sortLinha: { paddingVertical: spacing.sm + 2, borderTopWidth: 1, borderTopColor: colors.gray100 },
  sortNome: { fontSize: 12.5, fontWeight: '700', color: colors.gray900, flexShrink: 1 },
  sortValor: { fontSize: 13, fontWeight: '800', color: colors.navy900 },
});
