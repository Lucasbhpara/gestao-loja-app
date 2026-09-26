import React, { useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { setores, SetorKey } from '../data/employees';
import {
  ColaboradorLoja,
  buscarColaboradoresLoja,
  atualizarColaboradorLoja,
} from '../data/colaboradoresLojaApi';

function formatarDataSimples(iso: string | null): string {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

export default function ColaboradoresScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  // Mesmo critério usado na Validade: quem enxerga (e aqui, edita/transfere)
  // a equipe de qualquer setor, não só o próprio.
  const podeGerenciarTudo =
    !!usuarioAtual && (usuarioAtual.isAdmin || usuarioAtual.funcao === 'A.P.P' || usuarioAtual.setor === 'promotores');

  const [colaboradores, setColaboradores] = useState<ColaboradorLoja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [setoresAbertos, setSetoresAbertos] = useState<Record<string, boolean>>({});

  const [editando, setEditando] = useState<ColaboradorLoja | null>(null);
  const [nomeEdit, setNomeEdit] = useState('');
  const [matriculaEdit, setMatriculaEdit] = useState('');
  const [cargoEdit, setCargoEdit] = useState('');
  const [setorEdit, setSetorEdit] = useState<SetorKey | null>(null);
  const [salvando, setSalvando] = useState(false);

  function carregar() {
    buscarColaboradoresLoja()
      .then((lista) => {
        setColaboradores(lista);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar os colaboradores.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
  }, []);

  if (!usuarioAtual) return null;

  const setoresComGente = useMemo(() => {
    const chaves = new Set(colaboradores.map((c) => c.setor));
    return setores.filter((s) => chaves.has(s.key));
  }, [colaboradores]);

  function colaboradoresDoSetor(setor: SetorKey) {
    return colaboradores.filter((c) => c.setor === setor);
  }

  function alternarSetor(key: string) {
    setSetoresAbertos((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function abrirEdicao(c: ColaboradorLoja) {
    setEditando(c);
    setNomeEdit(c.nome);
    setMatriculaEdit(c.matricula ?? '');
    setCargoEdit(c.cargo ?? '');
    setSetorEdit(c.setor);
  }

  function cancelarEdicao() {
    setEditando(null);
  }

  const formValido = !!nomeEdit.trim() && !!setorEdit;

  async function salvarEdicao() {
    if (!editando || !formValido || !setorEdit) return;
    setSalvando(true);
    try {
      const atualizado = await atualizarColaboradorLoja({
        id: editando.id,
        nome: nomeEdit.trim(),
        matricula: matriculaEdit.trim(),
        cargo: cargoEdit.trim(),
        setor: setorEdit,
      });
      setColaboradores((prev) => prev.map((c) => (c.id === atualizado.id ? atualizado : c)).sort((a, b) => a.nome.localeCompare(b.nome)));
      setEditando(null);
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tenta de novo em instantes.');
    } finally {
      setSalvando(false);
    }
  }

  // --- Tela de edição (transferir colaborador pra outro setor) -----------
  if (editando) {
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={cancelarEdicao} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.voltar}>‹ Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.titulo}>Editar colaborador</Text>
          <View style={{ width: 70 }} />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Nome</Text>
            <TextInput style={styles.input} value={nomeEdit} onChangeText={setNomeEdit} placeholder="Nome do colaborador" />

            <Text style={styles.formLabel}>Matrícula</Text>
            <TextInput style={styles.input} value={matriculaEdit} onChangeText={setMatriculaEdit} placeholder="Matrícula" keyboardType="numeric" />

            <Text style={styles.formLabel}>Cargo</Text>
            <TextInput style={styles.input} value={cargoEdit} onChangeText={setCargoEdit} placeholder="Cargo/função" />

            <Text style={styles.formLabel}>Setor (transferir pra outra equipe)</Text>
            <View style={styles.chipsWrap}>
              {setores.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.chip, setorEdit === s.key && styles.chipAtivo]}
                  onPress={() => setSetorEdit(s.key)}
                >
                  <Text style={[styles.chipTexto, setorEdit === s.key && styles.chipTextoAtivo]}>{s.nome}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.btnSalvar, (!formValido || salvando) && styles.btnSalvarDesabilitado]}
              onPress={salvarEdicao}
              disabled={!formValido || salvando}
            >
              <Text style={styles.btnSalvarTexto}>{salvando ? 'Salvando…' : 'Salvar alterações'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  // --- Lista principal -----------------------------------------------------
  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Colaboradores</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
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
        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : !podeGerenciarTudo ? (
          // Encarregado: vê só o próprio setor, direto, sem gaveta.
          colaboradoresDoSetor(usuarioAtual.setor).length === 0 ? (
            <View style={styles.vazio}>
              <Text style={styles.vazioTexto}>Nenhum colaborador cadastrado ainda no seu setor.</Text>
            </View>
          ) : (
            colaboradoresDoSetor(usuarioAtual.setor).map((c) => (
              <View key={c.id} style={styles.card}>
                <Text style={styles.cardNome}>{c.nome}</Text>
                <Text style={styles.cardInfo}>
                  {c.cargo || 'Sem cargo definido'}{c.matricula ? ` · Mat. ${c.matricula}` : ''}
                </Text>
                {!!c.admissao && <Text style={styles.cardInfo}>Desde {formatarDataSimples(c.admissao)}</Text>}
              </View>
            ))
          )
        ) : setoresComGente.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Nenhum colaborador cadastrado ainda.</Text>
          </View>
        ) : (
          setoresComGente.map((s) => {
            const equipe = colaboradoresDoSetor(s.key);
            const aberto = !!setoresAbertos[s.key];
            return (
              <View key={s.key} style={styles.setorCard}>
                <TouchableOpacity style={styles.setorTopo} onPress={() => alternarSetor(s.key)}>
                  <Text style={[styles.setorSeta, aberto && styles.setorSetaAberta]}>▶</Text>
                  <Text style={styles.setorNome}>{s.nome}</Text>
                  <View style={styles.setorContagem}>
                    <Text style={styles.setorContagemTexto}>{equipe.length}</Text>
                  </View>
                </TouchableOpacity>
                {aberto && (
                  <View style={styles.setorLista}>
                    {equipe.map((c) => (
                      <TouchableOpacity key={c.id} style={styles.colaboradorRow} onPress={() => abrirEdicao(c)}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardNome}>{c.nome}</Text>
                          <Text style={styles.cardInfo}>
                            {c.cargo || 'Sem cargo definido'}{c.matricula ? ` · Mat. ${c.matricula}` : ''}
                          </Text>
                        </View>
                        <Text style={styles.editarSeta}>Editar ›</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
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
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 19 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardNome: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  cardInfo: { fontSize: 11.5, color: colors.gray600, marginTop: 3, fontWeight: '600' },
  setorCard: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden' },
  setorTopo: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.sm },
  setorSeta: { fontSize: 10, color: colors.gray400 },
  setorSetaAberta: { transform: [{ rotate: '90deg' }] },
  setorNome: { fontSize: 14, fontWeight: '700', color: colors.gray900, flex: 1 },
  setorContagem: { backgroundColor: colors.gray50, borderRadius: radius.full, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  setorContagemTexto: { fontSize: 11.5, fontWeight: '700', color: colors.navy700 },
  setorLista: { borderTopWidth: 1, borderTopColor: colors.gray100 },
  colaboradorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  editarSeta: { fontSize: 11.5, color: colors.navy700, fontWeight: '700' },
  formCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  formLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginTop: spacing.md, marginBottom: 6 },
  input: { backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  btnSalvar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.xl },
  btnSalvarDesabilitado: { backgroundColor: colors.gray100 },
  btnSalvarTexto: { color: colors.white, fontSize: 13, fontWeight: '700' },
});
