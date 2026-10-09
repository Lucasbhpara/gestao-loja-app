import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { visualDoSetor } from '../theme/setorVisual';
import { setores, SetorKey } from '../data/employees';
import { useAuth } from '../context/AuthContext';
import {
  ChecklistItem,
  buscarTodosItensChecklist,
  criarItemChecklist,
  alternarAtivoItemChecklist,
  removerItemChecklist,
  buscarStatusHojeTodosItens,
} from '../data/checklistApi';

// Onde o administrador monta a rotina fixa por turno: cadastra os itens que
// vão aparecer pra cada setor marcar como feito, todo dia, na aba
// "Checklist" do colaborador. Também mostra de relance o que já foi feito
// hoje, item por item.
export default function ChecklistAdminScreen({
  onVoltar,
  embutido,
}: {
  onVoltar?: () => void;
  // true quando essa tela vive dentro da aba "Rotina do dia" do
  // ChecklistHubScreen (ver esse arquivo) — nesse caso o Hub já desenha o
  // cabeçalho "‹ Voltar / Checklist", então aqui a gente esconde o próprio
  // cabeçalho (mantendo só o botão "+ Novo" numa faixa mais discreta) pra
  // não duplicar.
  embutido?: boolean;
}) {
  const { usuarioAtual } = useAuth();
  const [itens, setItens] = useState<ChecklistItem[]>([]);
  const [statusHoje, setStatusHoje] = useState<Map<string, { concluidoPorNome: string; concluidoEm: string }>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [setorSelecionado, setSetorSelecionado] = useState<SetorKey | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gavetaAberta, setGavetaAberta] = useState<string | null>(null);

  async function carregar() {
    try {
      setErro(null);
      const [listaItens, mapaStatus] = await Promise.all([buscarTodosItensChecklist(), buscarStatusHojeTodosItens()]);
      setItens(listaItens);
      setStatusHoje(mapaStatus);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui carregar a checklist.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarItem() {
    if (!titulo.trim() || !usuarioAtual) return;
    setSalvando(true);
    try {
      const novo = await criarItemChecklist({
        titulo: titulo.trim(),
        setor: setorSelecionado,
        ordem: itens.length,
        criadoPorNome: usuarioAtual.nome,
      });
      setItens((prev) => [...prev, novo]);
      setTitulo('');
      setSetorSelecionado(null);
      setMostrarForm(false);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui criar o item.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(item: ChecklistItem) {
    const novoAtivo = !item.ativo;
    setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, ativo: novoAtivo } : i)));
    try {
      await alternarAtivoItemChecklist(item.id, novoAtivo);
    } catch (e: any) {
      setItens((prev) => prev.map((i) => (i.id === item.id ? { ...i, ativo: item.ativo } : i)));
      setErro(e?.message ?? 'Não consegui atualizar.');
    }
  }

  async function excluir(id: string) {
    try {
      await removerItemChecklist(id);
      setItens((prev) => prev.filter((i) => i.id !== id));
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui remover.');
    }
  }

  function confirmarExclusao(item: ChecklistItem) {
    Alert.alert(
      'Remover item da checklist',
      `Tem certeza que deseja remover "${item.titulo}"? Essa ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => excluir(item.id) },
      ]
    );
  }

  function nomeSetor(key: SetorKey | null) {
    if (!key) return 'Todos os setores';
    return setores.find((s) => s.key === key)?.nome ?? key;
  }

  // Agrupa os itens por setor (null = "Todos os setores"), na ordem da lista
  // de setores — cada grupo vira uma gaveta, igual à Visita Técnica.
  const ativos = itens.filter((i) => i.ativo);
  const feitosHoje = ativos.filter((i) => statusHoje.has(i.id)).length;
  const grupos: { chave: string; setor: SetorKey | null; itens: ChecklistItem[] }[] = [];
  const ordem: (SetorKey | null)[] = [null, ...setores.map((s) => s.key)];
  for (const k of ordem) {
    const doGrupo = itens.filter((i) => (i.setor ?? null) === k);
    if (doGrupo.length) grupos.push({ chave: k ?? 'todos', setor: k, itens: doGrupo });
  }
  const conhecidos = new Set(ordem);
  const outros = itens.filter((i) => !conhecidos.has(i.setor ?? null));
  if (outros.length) grupos.push({ chave: 'outros', setor: null, itens: outros });

  return (
    <View style={styles.flex}>
      {!embutido && (
        <View style={styles.hero}>
          <TouchableOpacity onPress={onVoltar} style={styles.heroBotao} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="chevron-left" size={18} color={colors.white} />
            <Text style={styles.heroBotaoTexto}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitulo}>Rotina do dia</Text>
        </View>
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
        {/* Resumo de hoje */}
        <View style={styles.statsCard}>
          <View style={styles.stat}>
            <Text style={[styles.statValor, { color: colors.green500 }]}>{feitosHoje}</Text>
            <Text style={styles.statRotulo}>feitos hoje</Text>
          </View>
          <View style={styles.statDivisor} />
          <View style={styles.stat}>
            <Text style={[styles.statValor, ativos.length - feitosHoje > 0 && { color: '#B4650E' }]}>
              {ativos.length - feitosHoje}
            </Text>
            <Text style={styles.statRotulo}>pendentes</Text>
          </View>
          <View style={styles.statDivisor} />
          <View style={styles.stat}>
            <Text style={styles.statValor}>{ativos.length ? `${Math.round((feitosHoje / ativos.length) * 100)}%` : '—'}</Text>
            <Text style={styles.statRotulo}>da rotina</Text>
          </View>
        </View>

        {/* Novo item */}
        <TouchableOpacity
          style={[styles.novoCard, mostrarForm && styles.novoCardAberto]}
          onPress={() => setMostrarForm((v) => !v)}
          activeOpacity={0.8}
        >
          <View style={styles.novoIcone}>
            <Feather name={mostrarForm ? 'x' : 'plus'} size={18} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.novoTitulo}>{mostrarForm ? 'Cancelar' : 'Novo item da rotina'}</Text>
            {!mostrarForm && <Text style={styles.novoSub}>Aparece todo dia pro setor marcar como feito</Text>}
          </View>
        </TouchableOpacity>

        {mostrarForm && (
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Item da rotina</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Conferir geladeiras da seção"
              value={titulo}
              onChangeText={setTitulo}
            />

            <Text style={styles.formLabel}>Setor</Text>
            <View style={styles.chipsWrap}>
              <TouchableOpacity
                style={[styles.chip, setorSelecionado === null && styles.chipAtivo]}
                onPress={() => setSetorSelecionado(null)}
              >
                <Text style={[styles.chipTexto, setorSelecionado === null && styles.chipTextoAtivo]}>Todos</Text>
              </TouchableOpacity>
              {setores.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.chip, setorSelecionado === s.key && styles.chipAtivo]}
                  onPress={() => setSetorSelecionado(s.key)}
                >
                  <Text style={[styles.chipTexto, setorSelecionado === s.key && styles.chipTextoAtivo]}>{s.nome}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.btnSalvar, (!titulo.trim() || salvando) && styles.btnSalvarDesabilitado]}
              onPress={salvarItem}
              disabled={!titulo.trim() || salvando}
            >
              <Text style={styles.btnSalvarTexto}>{salvando ? 'Criando…' : 'Adicionar à rotina'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        <Text style={styles.secaoTitulo}>Setores</Text>

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : grupos.length === 0 ? (
          <View style={styles.vazio}>
            <Feather name="clipboard" size={28} color={colors.gray400} />
            <Text style={styles.vazioTexto}>
              Nenhum item cadastrado ainda. Toque em "Novo item da rotina" pra montar a rotina do primeiro setor.
            </Text>
          </View>
        ) : (
          grupos.map((g) => {
            const visual = visualDoSetor(g.setor);
            const ativosG = g.itens.filter((i) => i.ativo);
            const feitosG = ativosG.filter((i) => statusHoje.has(i.id)).length;
            const pct = ativosG.length ? feitosG / ativosG.length : 0;
            const completo = ativosG.length > 0 && feitosG === ativosG.length;
            const aberto = gavetaAberta === g.chave;
            return (
              <View key={g.chave} style={styles.gaveta}>
                <TouchableOpacity
                  style={styles.gavetaTopo}
                  onPress={() => setGavetaAberta(aberto ? null : g.chave)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.gavetaIcone, { backgroundColor: visual.fundo }]}>
                    <Feather name={visual.icone} size={18} color={visual.cor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gavetaTitulo}>{g.chave === 'outros' ? 'Outros' : nomeSetor(g.setor)}</Text>
                    <Text style={styles.gavetaSub}>
                      {feitosG} de {ativosG.length} feitos hoje
                      {g.itens.length > ativosG.length ? ` · ${g.itens.length - ativosG.length} desativado(s)` : ''}
                    </Text>
                    <View style={styles.trilha}>
                      <View
                        style={[
                          styles.barra,
                          { width: `${pct * 100}%`, backgroundColor: completo ? colors.green500 : visual.cor },
                        ]}
                      />
                    </View>
                  </View>
                  {completo ? (
                    <View style={styles.seloOk}>
                      <Feather name="check" size={13} color={colors.white} />
                    </View>
                  ) : null}
                  <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray600} />
                </TouchableOpacity>

                {aberto &&
                  g.itens.map((item) => {
                    const feitoHoje = statusHoje.get(item.id);
                    return (
                      <View key={item.id} style={[styles.itemLinha, !item.ativo && styles.itemCardInativo]}>
                        <View style={[styles.itemBolinha, feitoHoje && styles.itemBolinhaFeita]}>
                          {feitoHoje && <Feather name="check" size={12} color={colors.white} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemTitulo}>{item.titulo}</Text>
                          <Text style={feitoHoje ? styles.itemFeitoPor : styles.itemMeta}>
                            {!item.ativo
                              ? 'Desativado'
                              : feitoHoje
                              ? `Feito por ${feitoHoje.concluidoPorNome}`
                              : 'Pendente hoje'}
                          </Text>
                          <View style={styles.itemAcoes}>
                            <TouchableOpacity onPress={() => alternarAtivo(item)} style={styles.acaoBotao}>
                              <Feather name={item.ativo ? 'pause-circle' : 'play-circle'} size={13} color={colors.navy700} />
                              <Text style={styles.btnAlternarTexto}>{item.ativo ? 'Desativar' : 'Reativar'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => confirmarExclusao(item)} style={styles.acaoBotao}>
                              <Feather name="trash-2" size={13} color={colors.red500} />
                              <Text style={styles.btnRemoverTexto}>Remover</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })}
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
  hero: {
    backgroundColor: colors.navy700,
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroBotao: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2 },
  heroBotaoTexto: { color: colors.white, fontSize: 15, fontWeight: '600' },
  heroTitulo: { color: colors.white, fontSize: 22, fontWeight: '800', marginTop: spacing.md },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValor: { fontSize: 22, fontWeight: '800', color: colors.navy900 },
  statRotulo: { fontSize: 11, color: colors.gray600, marginTop: 2 },
  statDivisor: { width: 1, backgroundColor: colors.gray100 },
  novoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.navy700,
    borderStyle: 'dashed',
  },
  novoCardAberto: { borderStyle: 'solid', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  novoIcone: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' },
  novoTitulo: { fontSize: 14, fontWeight: '700', color: colors.navy700 },
  novoSub: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  formCard: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    padding: spacing.lg,
    paddingTop: 0,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: colors.navy700,
  },
  formLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginTop: spacing.md, marginBottom: 6 },
  input: { backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  btnSalvar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.lg },
  btnSalvarDesabilitado: { backgroundColor: colors.gray100 },
  btnSalvarTexto: { color: colors.white, fontSize: 13, fontWeight: '700' },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  secaoTitulo: { fontSize: 13, fontWeight: '800', color: colors.navy900, marginTop: spacing.xl, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  vazio: { paddingTop: spacing.xl, alignItems: 'center', gap: spacing.md },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl },
  gaveta: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden' },
  gavetaTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  gavetaIcone: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  gavetaTitulo: { fontSize: 14.5, fontWeight: '700', color: colors.gray900 },
  gavetaSub: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  trilha: { height: 5, borderRadius: radius.full, backgroundColor: colors.gray100, marginTop: 6, overflow: 'hidden' },
  barra: { height: 5, borderRadius: radius.full },
  seloOk: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.green500, alignItems: 'center', justifyContent: 'center' },
  itemLinha: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
  },
  itemCardInativo: { opacity: 0.55 },
  itemBolinha: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  itemBolinhaFeita: { backgroundColor: colors.green500, borderColor: colors.green500 },
  itemTitulo: { fontSize: 13.5, fontWeight: '600', color: colors.gray900 },
  itemMeta: { fontSize: 11, color: '#B4650E', marginTop: 3, fontWeight: '600' },
  itemFeitoPor: { fontSize: 11, color: colors.green500, marginTop: 3, fontWeight: '600' },
  itemAcoes: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  acaoBotao: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnAlternarTexto: { fontSize: 11.5, color: colors.navy700, fontWeight: '600' },
  btnRemoverTexto: { fontSize: 11.5, color: colors.red500, fontWeight: '600' },
});
