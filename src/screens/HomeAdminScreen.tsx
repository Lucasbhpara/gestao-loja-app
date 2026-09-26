import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert, BackHandler } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { Validade, buscarTodasValidades } from '../data/validadeApi';
import { diasRestantes, formatarData, statusPrazo } from '../lib/validadeUtils';
import ChatIAScreen from './ChatIAScreen';
import TarefasAdminScreen from './TarefasAdminScreen';
import PerdasAdminScreen from './PerdasAdminScreen';
import ValidadeScreen from './ValidadeScreen';
import InventarioScreen from './InventarioScreen';
import AvisosScreen from './AvisosScreen';
import SobreScreen from './SobreScreen';
import OcorrenciaAdminScreen from './OcorrenciaAdminScreen';
import ConferenciaScreen from './ConferenciaScreen';
import PedidosScreen from './PedidosScreen';
import EstoqueLojaScreen from './EstoqueLojaScreen';
import PainelResultadosScreen from './PainelResultadosScreen';
import MapaLojaScreen from './MapaLojaScreen';
import PontasExtrasScreen from './PontasExtrasScreen';
import JornalOfertasScreen from './JornalOfertasScreen';
import ChecklistAdminScreen from './ChecklistAdminScreen';
import ColaboradoresScreen from './ColaboradoresScreen';
import ChecklistSetorScreen from './ChecklistSetorScreen';

// Aba de chat com a IA visível só nesse login específico (Lucas), não pros
// demais administradores. Identificado pela matrícula (e não pelo id),
// porque o id muda de formato ao migrar para o Supabase.
const MATRICULA_DONO_DA_ABA_IA = '7990353';

export default function HomeAdminScreen() {
  const { usuarioAtual, logout, usandoNuvem } = useAuth();
  const [tela, setTela] = useState<
    | 'home'
    | 'chatIA'
    | 'tarefas'
    | 'perdas'
    | 'validade'
    | 'inventario'
    | 'avisos'
    | 'sobre'
    | 'ocorrencias'
    | 'conferencias'
    | 'pedidos'
    | 'estoqueLoja'
    | 'painelResultados'
    | 'mapaLoja'
    | 'pontasExtras'
    | 'jornalOfertas'
    | 'checklist'
    | 'colaboradores'
    | 'checklistSetor'
  >('home');

  // Seta/gesto nativo de voltar do Android: sem isso, como as telas aqui não
  // usam uma pilha de navegação, o Android trata o botão físico como "sair
  // do app" em qualquer tela. Interceptamos e fazemos a mesma coisa que o
  // botão "‹ Voltar" de cada tela — volta pra Home. Só na própria Home é que
  // deixamos o comportamento padrão do Android acontecer (fechar o app).
  useEffect(() => {
    const aoVoltar = () => {
      if (tela !== 'home') {
        setTela('home');
        return true;
      }
      return false;
    };
    const assinatura = BackHandler.addEventListener('hardwareBackPress', aoVoltar);
    return () => assinatura.remove();
  }, [tela]);

  const [validades, setValidades] = useState<Validade[]>([]);
  const [carregandoValidades, setCarregandoValidades] = useState(true);

  useEffect(() => {
    if (!usuarioAtual) return;
    buscarTodasValidades()
      .then(setValidades)
      .catch(() => {})
      .finally(() => setCarregandoValidades(false));
  }, [usuarioAtual?.id]);

  if (!usuarioAtual) return null;

  function confirmarSaida() {
    Alert.alert('Sair da conta?', 'Você vai precisar entrar de novo com matrícula e senha.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ]);
  }

  const podeUsarChatIA = usuarioAtual.matricula === MATRICULA_DONO_DA_ABA_IA;
  const top5Vencendo = [...validades]
    .sort((a, b) => (a.dataValidade < b.dataValidade ? -1 : 1))
    .slice(0, 5);

  if (tela === 'chatIA') {
    return <ChatIAScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'tarefas') {
    return <TarefasAdminScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'perdas') {
    return <PerdasAdminScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'validade') {
    return <ValidadeScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'inventario') {
    return <InventarioScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'avisos') {
    return <AvisosScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'sobre') {
    return <SobreScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'ocorrencias') {
    return <OcorrenciaAdminScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'conferencias') {
    // Antes era só leitura (ConferenciaAdminScreen); agora o administrador
    // também consegue criar e conduzir a conferência, igual o encarregado.
    return <ConferenciaScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'pedidos') {
    return <PedidosScreen onVoltar={() => setTela('home')} setorPedido="flv" />;
  }
  if (tela === 'estoqueLoja') {
    return <EstoqueLojaScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'painelResultados') {
    // Só existe dentro do HomeAdminScreen — quem não é admin nunca vê essa
    // opção (ver HomeColaboradorScreen), então o acesso já é restrito. O
    // seletor de setor (FLV, Açougue, ...) fica dentro do próprio painel.
    return <PainelResultadosScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'mapaLoja') {
    return <MapaLojaScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'pontasExtras') {
    return <PontasExtrasScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'jornalOfertas') {
    return <JornalOfertasScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'checklist') {
    return <ChecklistAdminScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'colaboradores') {
    return <ColaboradoresScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'checklistSetor') {
    return <ChecklistSetorScreen onVoltar={() => setTela('home')} usuarioNome={usuarioAtual.nome} />;
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.greeting}>Olá, {usuarioAtual.nome}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>Administrador — acesso total</Text>
              </View>
              <View style={[styles.dadosBadge, usandoNuvem ? styles.dadosBadgeNuvem : styles.dadosBadgeLocal]}>
                <Text style={styles.dadosBadgeText}>{usandoNuvem ? '☁ Dados na nuvem' : '📱 Dados só neste celular'}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={confirmarSaida} style={styles.avatar}>
            <Image source={require('../../assets/icon.png')} style={styles.avatarImagem} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Produtos vencendo</Text>
          {validades.length > 0 && (
            <TouchableOpacity onPress={() => setTela('validade')}>
              <Text style={styles.verMaisTexto}>Ver todos ›</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.listCard}>
          {carregandoValidades ? (
            <ActivityIndicator color={colors.navy700} style={{ paddingVertical: spacing.xl }} />
          ) : top5Vencendo.length === 0 ? (
            <Text style={styles.vazioProdutosTexto}>Nenhum produto com validade cadastrado ainda.</Text>
          ) : (
            top5Vencendo.map((v, i) => {
              const dias = diasRestantes(v.dataValidade);
              const status = statusPrazo(dias);
              return (
                <View key={v.id} style={[styles.row, i !== top5Vencendo.length - 1 && styles.rowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{dias < 5 ? '⚠ ' : ''}{v.produto}</Text>
                    <Text style={styles.rowSubtitle}>Vence em {formatarData(v.dataValidade)}</Text>
                  </View>
                  <View style={[styles.chipStatus, { backgroundColor: status.fundo }]}>
                    <Text style={[styles.chipStatusTexto, { color: status.cor }]}>{status.texto}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ações rápidas</Text>
        <View style={styles.grid}>
          {[
            { label: 'Checklist', icone: 'check-square' as const, onPress: () => setTela('checklist') },
            { label: 'Checklist de Setor', icone: 'clipboard' as const, onPress: () => setTela('checklistSetor') },
            { label: 'Colaboradores', icone: 'users' as const, onPress: () => setTela('colaboradores') },
            { label: 'Criar tarefa', icone: 'edit-3' as const, onPress: () => setTela('tarefas') },
            { label: 'Perdas e Desperdício', icone: 'trending-down' as const, onPress: () => setTela('perdas') },
            { label: 'Validade', icone: 'calendar' as const, onPress: () => setTela('validade') },
            { label: 'Inventário', icone: 'package' as const, onPress: () => setTela('inventario') },
            { label: 'Estoque Loja', icone: 'archive' as const, onPress: () => setTela('estoqueLoja') },
            { label: 'Mural de Avisos', icone: 'bell' as const, onPress: () => setTela('avisos') },
            { label: 'Ocorrências', icone: 'alert-triangle' as const, onPress: () => setTela('ocorrencias') },
            { label: 'Conferência', icone: 'clipboard' as const, onPress: () => setTela('conferencias') },
            { label: 'Pedidos', icone: 'shopping-cart' as const, onPress: () => setTela('pedidos') },
            { label: 'Painel Resultados', icone: 'bar-chart-2' as const, onPress: () => setTela('painelResultados') },
            { label: 'Mapa da Loja', icone: 'map' as const, onPress: () => setTela('mapaLoja') },
            { label: 'Pontas e Pontos Extras', icone: 'layers' as const, onPress: () => setTela('pontasExtras') },
            // Jornal de Ofertas: tile removido — o balão flutuante
            // (JornalOfertasFlutuante, ver App.tsx) já cobre esse acesso em
            // qualquer tela, então essa aba ficava redundante.
            { label: 'Sobre', icone: 'info' as const, onPress: () => setTela('sobre') },
          ].map((acao) => (
            <TouchableOpacity key={acao.label} style={styles.tile} onPress={acao.onPress} disabled={!acao.onPress}>
              <View style={styles.tileDot}>
                <Feather name={acao.icone} size={17} color={colors.white} />
              </View>
              <Text style={styles.tileLabel}>{acao.label}</Text>
              {!acao.onPress && <Text style={styles.tileEmBreve}>Em breve</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {podeUsarChatIA && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Só pra você</Text>
          <TouchableOpacity style={styles.chatIACard} onPress={() => setTela('chatIA')}>
            <View style={styles.tileDot}>
              <Feather name="message-circle" size={17} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Falar com a IA</Text>
              <Text style={styles.rowSubtitle}>Tire dúvidas sobre o projeto direto pelo celular</Text>
            </View>
            <Text style={styles.chatIASeta}>›</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray100, paddingTop: 56, paddingBottom: 24, paddingHorizontal: spacing.xl },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: 19, fontWeight: '700', color: colors.navy900 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  roleBadge: { backgroundColor: colors.navy900, borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 10, alignSelf: 'flex-start' },
  roleBadgeText: { color: colors.white, fontSize: 11, fontWeight: '600' },
  dadosBadge: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 10, alignSelf: 'flex-start' },
  dadosBadgeNuvem: { backgroundColor: '#DCF2E7' },
  dadosBadgeLocal: { backgroundColor: '#FBEBD4' },
  dadosBadgeText: { fontSize: 11, fontWeight: '600', color: colors.gray900 },
  avatar: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.gray100, overflow: 'hidden' },
  avatarImagem: { width: '100%', height: '100%' },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.gray900 },
  verMaisTexto: { fontSize: 12.5, fontWeight: '700', color: colors.navy700 },
  listCard: { backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  vazioProdutosTexto: { fontSize: 12.5, color: colors.gray600, paddingVertical: spacing.lg, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  rowTitle: { fontSize: 13, fontWeight: '600', color: colors.gray900 },
  rowSubtitle: { fontSize: 11, color: colors.gray600, marginTop: 2 },
  chipStatus: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipStatusTexto: { fontSize: 10, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47%', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  tileDot: { width: 34, height: 34, borderRadius: radius.full, backgroundColor: colors.navy700, marginBottom: spacing.md, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 12, fontWeight: '600', color: colors.gray900 },
  tileEmBreve: { fontSize: 9.5, fontWeight: '700', color: colors.gray400, marginTop: 4, textTransform: 'uppercase' },
  chatIACard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  chatIASeta: { fontSize: 20, color: colors.gray400 },
});
