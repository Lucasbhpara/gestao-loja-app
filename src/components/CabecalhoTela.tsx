import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';

type IconeFeather = React.ComponentProps<typeof Feather>['name'];

// Cabeçalho padrão das ferramentas — o mesmo visual da Visita Técnica:
// faixa azul com cantos arredondados, "Voltar" em cima, ícone + título
// grande e, opcionalmente, uma ação à direita (ex.: "+ Novo") e conteúdo
// extra embaixo (busca, abas...).
// Tem algo de verdade pra mostrar? (um fragmento com só "null" dentro não conta)
function temConteudo(no: React.ReactNode): boolean {
  if (no == null || no === false) return false;
  if (React.isValidElement(no) && no.type === React.Fragment) {
    return React.Children.toArray((no.props as { children?: React.ReactNode }).children).length > 0;
  }
  return true;
}

export default function CabecalhoTela({
  titulo,
  subtitulo,
  icone = 'grid',
  onVoltar,
  rotuloVoltar = 'Voltar',
  acao,
  children,
}: {
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  icone?: IconeFeather;
  onVoltar?: () => void;
  rotuloVoltar?: string;
  acao?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.topo}>
        {onVoltar ? (
          <TouchableOpacity onPress={onVoltar} style={styles.voltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name={rotuloVoltar === 'Voltar' ? 'chevron-left' : 'x'} size={18} color={colors.white} />
            <Text style={styles.voltarTexto}>{rotuloVoltar}</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        {temConteudo(acao) ? <View style={styles.acao}>{acao}</View> : null}
      </View>
      <View style={styles.linha}>
        <View style={styles.icone}>
          <Feather name={icone} size={20} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo} numberOfLines={2}>
            {titulo}
          </Text>
          {subtitulo ? <Text style={styles.subtitulo}>{subtitulo}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.navy700,
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  voltarTexto: { color: colors.white, fontSize: 15, fontWeight: '600' },
  acao: { backgroundColor: colors.white, borderRadius: radius.full, paddingVertical: 6, paddingHorizontal: 12 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  icone: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: { color: colors.white, fontSize: 22, fontWeight: '800' },
  subtitulo: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
});
