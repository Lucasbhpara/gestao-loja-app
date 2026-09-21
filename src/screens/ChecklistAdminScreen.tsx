import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
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
export default function ChecklistAdminScreen({ onVoltar }: { onVoltar: () => void }) {
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

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Checklist</Text>
        <TouchableOpacity onPress={() => setMostrarForm((v) => !v)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.novoItem}>{mostrarForm ? 'Cancelar' : '+ Novo'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
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
              <Text style={styles.btnSalvarTexto}>{salvando ? 'Criando…' : 'Adicionar à checklist'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : itens.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>
              Nenhum item cadastrado ainda. Toque em "+ Novo" pra montar a rotina do primeiro setor.
            </Text>
          </View>
        ) : (
          itens.map((item) => {
            const feitoHoje = statusHoje.get(item.id);
            return (
              <View key={item.id} style={[styles.itemCard, !item.ativo && styles.itemCardInativo]}>
                <View style={styles.itemTopo}>
                  <Text style={styles.itemTitulo}>{item.titulo}</Text>
                  <View style={[styles.chipStatus, feitoHoje ? styles.chipConcluida : styles.chipPendente]}>
                    <Text style={styles.chipStatusTexto}>{feitoHoje ? 'Feito hoje' : 'Pendente'}</Text>
                  </View>
                </View>
                <Text style={styles.itemMeta}>{nomeSetor(item.setor)}</Text>
                {feitoHoje && <Text style={styles.itemFeitoPor}>Feito por {feitoHoje.concluidoPorNome}</Text>}

                <View style={styles.itemAcoes}>
                  <TouchableOpacity onPress={() => alternarAtivo(item)}>
                    <Text style={styles.btnAlternarTexto}>{item.ativo ? 'Desativar' : 'Reativar'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmarExclusao(item)}>
                    <Text style={styles.btnRemoverTexto}>Remover</Text>
                  </TouchableOpacity>
                </View>
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
  novoItem: { color: colors.navy700, fontSize: 14, fontWeight: '700' },
  formCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
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
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl },
  itemCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  itemCardInativo: { opacity: 0.55 },
  itemTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  itemTitulo: { fontSize: 14, fontWeight: '700', color: colors.gray900, flex: 1 },
  itemMeta: { fontSize: 11, color: colors.gray400, marginTop: 8 },
  itemFeitoPor: { fontSize: 11, color: colors.green500, marginTop: 4, fontWeight: '600' },
  itemAcoes: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  chipStatus: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipPendente: { backgroundColor: '#FBEBD4' },
  chipConcluida: { backgroundColor: '#DCF2E7' },
  chipStatusTexto: { fontSize: 10.5, fontWeight: '700', color: colors.gray900 },
  btnAlternarTexto: { fontSize: 11.5, color: colors.navy700, fontWeight: '600' },
  btnRemoverTexto: { fontSize: 11.5, color: colors.red500, fontWeight: '600' },
});
