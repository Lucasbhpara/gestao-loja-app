import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
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
      <View style={styles.hero}>
        <TouchableOpacity onPress={onVoltar} style={styles.heroBotao} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="chevron-left" size={18} color={colors.white} />
          <Text style={styles.heroBotaoTexto}>Voltar</Text>
        </TouchableOpacity>
        <View style={styles.heroLinha}>
          <View style={styles.heroIcone}>
            <Feather name="clipboard" size={22} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitulo}>Checklist</Text>
            <Text style={styles.heroSub}>
              {aba === 'rotina' ? 'Itens do dia a dia de cada turno' : 'Auditoria de conformidade por setor'}
            </Text>
          </View>
        </View>

        <View style={styles.abasWrap}>
          {(
            [
              { k: 'rotina', rotulo: 'Rotina do dia', icone: 'sun' },
              { k: 'avaliacao', rotulo: 'Avaliação de Setor', icone: 'check-square' },
            ] as const
          ).map((a) => {
            const ativa = aba === a.k;
            return (
              <TouchableOpacity key={a.k} style={[styles.aba, ativa && styles.abaAtiva]} onPress={() => setAba(a.k)}>
                <Feather name={a.icone} size={14} color={ativa ? colors.navy700 : 'rgba(255,255,255,0.85)'} />
                <Text style={[styles.abaTexto, ativa && styles.abaTextoAtivo]}>{a.rotulo}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
  heroLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  heroIcone: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitulo: { color: colors.white, fontSize: 22, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  abasWrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
    padding: 4,
  },
  aba: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 9,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abaAtiva: { backgroundColor: colors.white },
  abaTexto: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  abaTextoAtivo: { color: colors.navy700 },
});
