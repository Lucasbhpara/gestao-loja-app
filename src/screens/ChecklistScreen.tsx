import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { visualDoSetor } from '../theme/setorVisual';
import { setores } from '../data/employees';
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
  const visual = visualDoSetor(usuarioAtual.setor);
  const nomeSetor = setores.find((x) => x.key === usuarioAtual.setor)?.nome ?? 'Meu setor';
  // Pendentes primeiro, feitos no fim.
  const ordenados = [...itens].sort((a, b) => Number(a.concluidoHoje) - Number(b.concluidoHoje));

  return (
    <View style={styles.flex}>
      <View style={styles.hero}>
        <TouchableOpacity onPress={onVoltar} style={styles.heroBotao} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="chevron-left" size={18} color={colors.white} />
          <Text style={styles.heroBotaoTexto}>Voltar</Text>
        </TouchableOpacity>
        <View style={styles.heroLinha}>
          <View style={styles.heroIcone}>
            <Feather name={visual.icone} size={22} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitulo}>Rotina do dia</Text>
            <Text style={styles.heroSub}>{nomeSetor}</Text>
          </View>
        </View>
        {total > 0 && (
          <View style={styles.heroProgresso}>
            <View style={styles.progressoTextos}>
              <Text style={styles.progressoPct}>{Math.round((feitos / total) * 100)}%</Text>
              <Text style={styles.progressoSubtitulo}>
                {feitos === total ? 'Tudo feito hoje 🎉' : `${feitos} de ${total} concluídos`}
              </Text>
            </View>
            <View style={styles.progressoTrilha}>
              <View style={[styles.progressoBarra, { width: `${(feitos / total) * 100}%` }]} />
            </View>
          </View>
        )}
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
        {total > 0 && !carregando && !erro && (
          <Text style={styles.secaoTitulo}>
            Itens de hoje
          </Text>
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
            {ordenados.map((item, i) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.linha, i !== ordenados.length - 1 && styles.linhaBorda]}
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
  heroIcone: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  heroTitulo: { color: colors.white, fontSize: 22, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  heroProgresso: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.lg },
  progressoTextos: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressoPct: { fontSize: 22, fontWeight: '800', color: colors.white },
  progressoSubtitulo: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  progressoTrilha: { height: 6, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: spacing.sm, overflow: 'hidden' },
  progressoBarra: { height: 6, borderRadius: radius.full, backgroundColor: '#4ADE80' },
  secaoTitulo: { fontSize: 13, fontWeight: '800', color: colors.navy900, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
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
