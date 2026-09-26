import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { setores, SetorKey } from '../data/employees';
import { useAuth } from '../context/AuthContext';
import { Tarefa, PrioridadeTarefa, buscarTodasTarefas, criarTarefa, removerTarefa } from '../data/tarefasApi';

// Confere se o texto digitado é uma data real no formato AAAA-MM-DD.
// Campo vazio é válido (o prazo é opcional).
function prazoValido(valor: string): boolean {
  const texto = valor.trim();
  if (!texto) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!match) return false;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = new Date(ano, mes - 1, dia);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

export default function TarefasAdminScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [setorSelecionado, setSetorSelecionado] = useState<SetorKey | null>(null);
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>('normal');
  const [salvando, setSalvando] = useState(false);
  const prazoTemErro = prazo.trim().length > 0 && !prazoValido(prazo);

  async function carregar() {
    try {
      setErro(null);
      const lista = await buscarTodasTarefas();
      setTarefas(lista);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui carregar as tarefas.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarTarefa() {
    if (!titulo.trim() || !usuarioAtual || prazoTemErro) return;
    setSalvando(true);
    try {
      const nova = await criarTarefa({
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        setor: setorSelecionado,
        prazo: prazo.trim() || null,
        criadoPorNome: usuarioAtual.nome,
        prioridade,
      });
      setTarefas((prev) => [nova, ...prev]);
      setTitulo('');
      setDescricao('');
      setSetorSelecionado(null);
      setPrazo('');
      setPrioridade('normal');
      setMostrarForm(false);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui criar a tarefa.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    try {
      await removerTarefa(id);
      setTarefas((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui remover.');
    }
  }

  function confirmarExclusao(tarefa: Tarefa) {
    Alert.alert(
      'Remover tarefa',
      `Tem certeza que deseja remover "${tarefa.titulo}"? Essa ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Remover', style: 'destructive', onPress: () => excluir(tarefa.id) },
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
        <Text style={styles.titulo}>Tarefas</Text>
        <TouchableOpacity onPress={() => setMostrarForm((v) => !v)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.novaTarefa}>{mostrarForm ? 'Cancelar' : '+ Nova'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
        {mostrarForm && (
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Título</Text>
            <TextInput style={styles.input} placeholder="Ex: Repor gôndola de bebidas" value={titulo} onChangeText={setTitulo} />

            <Text style={styles.formLabel}>Descrição (opcional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultilinha]}
              placeholder="Detalhes da tarefa"
              value={descricao}
              onChangeText={setDescricao}
              multiline
            />

            <Text style={styles.formLabel}>Prazo (opcional)</Text>
            <TextInput
              style={[styles.input, prazoTemErro && styles.inputErro]}
              placeholder="AAAA-MM-DD"
              value={prazo}
              onChangeText={setPrazo}
              maxLength={10}
            />
            {prazoTemErro && (
              <Text style={styles.campoErroTexto}>Use o formato AAAA-MM-DD com uma data válida (ex: 2026-09-01).</Text>
            )}

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

            <Text style={styles.formLabel}>Prioridade</Text>
            <View style={styles.chipsWrap}>
              <TouchableOpacity
                style={[styles.chip, prioridade === 'normal' && styles.chipAtivo]}
                onPress={() => setPrioridade('normal')}
              >
                <Text style={[styles.chipTexto, prioridade === 'normal' && styles.chipTextoAtivo]}>Normal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, prioridade === 'alta' && styles.chipAtivoAlta]}
                onPress={() => setPrioridade('alta')}
              >
                <Text style={[styles.chipTexto, prioridade === 'alta' && styles.chipTextoAtivo]}>🔴 Muito importante</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.formAjuda}>
              Toda tarefa exige foto do encarregado pra ser concluída. "Muito importante" só destaca a tarefa na lista dele.
            </Text>

            <TouchableOpacity
              style={[styles.btnSalvar, (!titulo.trim() || salvando || prazoTemErro) && styles.btnSalvarDesabilitado]}
              onPress={salvarTarefa}
              disabled={!titulo.trim() || salvando || prazoTemErro}
            >
              <Text style={styles.btnSalvarTexto}>{salvando ? 'Criando…' : 'Criar tarefa'}</Text>
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
        ) : tarefas.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Nenhuma tarefa criada ainda. Toque em "+ Nova" pra criar a primeira.</Text>
          </View>
        ) : (
          tarefas.map((t) => (
            <View key={t.id} style={[styles.tarefaCard, t.prioridade === 'alta' && styles.tarefaCardAlta]}>
              <View style={styles.tarefaTopo}>
                <Text style={styles.tarefaTitulo}>
                  {t.prioridade === 'alta' ? '🔴 ' : ''}
                  {t.titulo}
                </Text>
                <View style={[styles.chipStatus, t.concluida ? styles.chipConcluida : styles.chipPendente]}>
                  <Text style={styles.chipStatusTexto}>{t.concluida ? 'Concluída' : 'Pendente'}</Text>
                </View>
              </View>
              {!!t.descricao && <Text style={styles.tarefaDescricao}>{t.descricao}</Text>}
              <Text style={styles.tarefaMeta}>
                {nomeSetor(t.setor)}
                {t.prazo ? ` · prazo ${t.prazo}` : ''}
              </Text>
              {t.concluida && t.concluidaPorNome && (
                <Text style={styles.tarefaConcluidaPor}>
                  Concluída por {t.concluidaPorNome}
                  {t.fotoUrl ? ' · com foto' : ''}
                </Text>
              )}
              <TouchableOpacity onPress={() => confirmarExclusao(t)} style={styles.btnRemover}>
                <Text style={styles.btnRemoverTexto}>Remover</Text>
              </TouchableOpacity>
            </View>
          ))
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
  novaTarefa: { color: colors.navy700, fontSize: 14, fontWeight: '700' },
  formCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  formLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginTop: spacing.md, marginBottom: 6 },
  input: { backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900 },
  inputMultilinha: { minHeight: 70, textAlignVertical: 'top' },
  inputErro: { borderWidth: 1, borderColor: colors.red500 },
  campoErroTexto: { color: colors.red500, fontSize: 11, marginTop: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipAtivoAlta: { backgroundColor: colors.red500, borderColor: colors.red500 },
  chipTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  formAjuda: { fontSize: 11, color: colors.gray400, marginTop: 8, lineHeight: 15 },
  btnSalvar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.lg },
  btnSalvarDesabilitado: { backgroundColor: colors.gray100 },
  btnSalvarTexto: { color: colors.white, fontSize: 13, fontWeight: '700' },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl },
  tarefaCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  tarefaCardAlta: { borderWidth: 1, borderColor: '#F3B4AE' },
  tarefaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  tarefaTitulo: { fontSize: 14, fontWeight: '700', color: colors.gray900, flex: 1 },
  tarefaDescricao: { fontSize: 12.5, color: colors.gray600, marginTop: 6, lineHeight: 18 },
  tarefaMeta: { fontSize: 11, color: colors.gray400, marginTop: 8 },
  tarefaConcluidaPor: { fontSize: 11, color: colors.green500, marginTop: 4, fontWeight: '600' },
  chipStatus: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipPendente: { backgroundColor: '#FBEBD4' },
  chipConcluida: { backgroundColor: '#DCF2E7' },
  chipStatusTexto: { fontSize: 10.5, fontWeight: '700', color: colors.gray900 },
  btnRemover: { alignSelf: 'flex-start', marginTop: spacing.sm },
  btnRemoverTexto: { fontSize: 11.5, color: colors.red500, fontWeight: '600' },
});
