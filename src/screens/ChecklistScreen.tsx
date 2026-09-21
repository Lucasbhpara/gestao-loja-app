import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import {
  ChecklistItemComStatus,
  buscarChecklistDoSetor,
  marcarItemFeito,
  desmarcarItemFeito,
} from '../data/checklistApi';

// Rotina fixa por turno: os itens são cadastrados pelo administrador (aba
// "Checklist" dentro de Ações rápidas) e cada colaborador do setor marca
// aqui o que já fez. A lista "reseta" sozinha todo dia — não precisa fazer
// nada manualmente, a marcação de hoje simplesmente ainda não existe amanhã.
export default function ChecklistScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const [itens, setItens] = useState<ChecklistItemComStatus[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);

  const carregar = useCallback(() => {
    if (!usuarioAtual) return;
    buscarChecklistDoSetor(usuarioAtual.setor)
      .then((lista) => {
        setItens(lista);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar a checklist.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }, [usuarioAtual?.setor]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!usuarioAtual) return null;

  async function alternar(item: ChecklistItemComStatus) {
    if (!usuarioAtual) return;
    setMarcando(item.id);
    // Otimista: já vira na tela, e desfaz se der erro — a rotina é usada
    // durante o corre-corre do turno, não pode ficar travando por um
    // toque a mais.
    const proximoEstado = !item.concluidoHoje;
    setItens((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              concluidoHoje: proximoEstado,
              concluidoPorNome: proximoEstado ? usuarioAtual.nome : null,
              concluidoEm: proximoEstado ? new Date().toISOString() : null,
            }
          : i
      )
    );
    try {
      if (proximoEstado) {
        await marcarItemFeito(item.id, usuarioAtual.nome);
      } else {
        await desmarcarItemFeito(item.id);
      }
    } catch (e: any) {
      // Desfaz o otimismo e mostra o estado real vindo do banco.
      carregar();
      setErro(e?.message ?? 'Não consegui salvar. Tenta de novo.');
    } finally {
      setMarcando(null);
    }
  }

  const feitos = itens.filter((i) => i.concluidoHoje).length;
  const total = itens.length;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Checklist</Text>
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
        {total > 0 && (
          <View style={styles.progressoCard}>
            <View style={styles.progressoTextos}>
              <Text style={styles.progressoTitulo}>Rotina de hoje</Text>
              <Text style={styles.progressoSubtitulo}>{feitos} de {total} concluídos</Text>
            </View>
            <View style={styles.progressoTrilha}>
              <View style={[styles.progressoBarra, { width: `${total === 0 ? 0 : (feitos / total) * 100}%` }]} />
            </View>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : erro ? (
          <View style={styles.erroCard}>
            <Text style={styles.erroText}>{erro}</Text>
          </View>
        ) : itens.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Nenhum item de rotina cadastrado ainda pro seu setor. Assim que a gerência cadastrar a
              checklist, ela aparece aqui.
            </Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {itens.map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.linha, i !== itens.length - 1 && styles.linhaBorda]}
                onPress={() => alternar(item)}
                disabled={marcando === item.id}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, item.concluidoHoje && styles.checkboxMarcado]}>
                  {item.concluidoHoje && <Feather name="check" size={14} color={colors.white} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitulo, item.concluidoHoje && styles.itemTituloFeito]}>
                    {item.titulo}
                  </Text>
                  {item.concluidoHoje && !!item.concluidoPorNome && (
                    <Text style={styles.itemFeitoPor}>Feito por {item.concluidoPorNome}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
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
  progressoCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  progressoTextos: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressoTitulo: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  progressoSubtitulo: { fontSize: 12, fontWeight: '600', color: colors.gray600 },
  progressoTrilha: { height: 6, borderRadius: radius.full, backgroundColor: colors.gray100, marginTop: spacing.md, overflow: 'hidden' },
  progressoBarra: { height: 6, borderRadius: radius.full, backgroundColor: colors.green500 },
  emptyCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  emptyText: { color: colors.gray600, fontSize: 12, lineHeight: 18 },
  erroCard: { backgroundColor: '#FBDEDC', borderRadius: radius.lg, padding: spacing.lg },
  erroText: { color: colors.red500, fontSize: 12, lineHeight: 18 },
  listCard: { backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  linhaBorda: { borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMarcado: { backgroundColor: colors.green500, borderColor: colors.green500 },
  itemTitulo: { fontSize: 13.5, fontWeight: '600', color: colors.gray900 },
  itemTituloFeito: { color: colors.gray400, textDecorationLine: 'line-through' },
  itemFeitoPor: { fontSize: 11, color: colors.gray400, marginTop: 2 },
});
