import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import ChecklistAdminScreen from './ChecklistAdminScreen';
import ChecklistSetorScreen from './ChecklistSetorScreen';

// Ponto único de entrada da aba "Checklist" na Home do administrador.
//
// Antes existiam duas abas separadas ("Checklist" e "Checklist de Setor")
// que por fora pareciam a mesma coisa mas por dentro são duas ferramentas
// diferentes — nenhuma das duas foi removida, só juntamos elas aqui numa
// aba só, com uma faixa de abas internas, pra não confundir na Home:
//
// - "Rotina do dia" (ChecklistAdminScreen) — itens fixos por turno que o
//   colaborador marca como feito no dia a dia (abertura/fechamento, etc.),
//   sem foto, reseta sozinho todo dia.
// - "Avaliação de Setor" (ChecklistSetorScreen) — auditoria de conformidade
//   feita pela gerência, com perguntas, pontuação, foto obrigatória em não
//   conformidade e geração automática de tarefa pro encarregado.
export default function ChecklistHubScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const [aba, setAba] = useState<'rotina' | 'avaliacao'>('rotina');

  if (!usuarioAtual) return null;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Checklist</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.abasWrap}>
        <TouchableOpacity
          style={[styles.aba, aba === 'rotina' && styles.abaAtiva]}
          onPress={() => setAba('rotina')}
        >
          <Text style={[styles.abaTexto, aba === 'rotina' && styles.abaTextoAtivo]}>Rotina do dia</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.aba, aba === 'avaliacao' && styles.abaAtiva]}
          onPress={() => setAba('avaliacao')}
        >
          <Text style={[styles.abaTexto, aba === 'avaliacao' && styles.abaTextoAtivo]}>Avaliação de Setor</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.flex}>
        {aba === 'rotina' ? (
          <ChecklistAdminScreen embutido />
        ) : (
          <ChecklistSetorScreen embutido usuarioNome={usuarioAtual.nome} />
        )}
      </View>
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
  abasWrap: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  aba: { flex: 1, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.gray50, alignItems: 'center' },
  abaAtiva: { backgroundColor: colors.navy700 },
  abaTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  abaTextoAtivo: { color: colors.white },
});
