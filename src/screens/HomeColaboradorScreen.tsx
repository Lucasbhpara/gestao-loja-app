import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image, Alert, BackHandler } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { setores } from '../data/employees';
import { Tarefa, buscarTarefasDoSetor, concluirTarefa } from '../data/tarefasApi';
import { Aviso, buscarAvisosDoSetor } from '../data/avisosApi';
import { Validade, buscarValidadesDoSetor } from '../data/validadeApi';
import { diasRestantes, formatarData, statusPrazo } from '../lib/validadeUtils';
import PerdasSetorScreen from './PerdasSetorScreen';
import ValidadeScreen from './ValidadeScreen';
import AvisosScreen from './AvisosScreen';
import SobreScreen from './SobreScreen';
import OcorrenciaScreen from './OcorrenciaScreen';
import ConferenciaScreen from './ConferenciaScreen';
import PedidosScreen from './PedidosScreen';
import MapaLojaScreen from './MapaLojaScreen';
import PontasExtrasScreen from './PontasExtrasScreen';
import JornalOfertasScreen from './JornalOfertasScreen';
import ChecklistScreen from './ChecklistScreen';

const FRASES_DO_DIA = [
  'Pequenas melhorias todos os dias constroem grandes resultados.',
  'Quem cuida dos detalhes, cuida do resultado.',
  'Um time alinhado resolve qualquer ruptura mais rápido.',
];

function saudacao(): string {
  const hora = new Date().getHours();
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomeColaboradorScreen() {
  const { usuarioAtual, logout } = useAuth();
  const [tela, setTela] = useState<
    | 'home'
    | 'perdas'
    | 'validade'
    | 'avisos'
    | 'sobre'
    | 'ocorrencia'
    | 'conferencia'
    | 'pedidos'
    | 'mapaLoja'
    | 'pontasExtras'
    | 'jornalOfertas'
    | 'checklist'
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

  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [carregandoTarefas, setCarregandoTarefas] = useState(true);
  const [atualizandoTarefas, setAtualizandoTarefas] = useState(false);
  const [erroTarefas, setErroTarefas] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState<string | null>(null);

  const [avisosUrgentes, setAvisosUrgentes] = useState<Aviso[]>([]);
  const [validadesProximas, setValidadesProximas] = useState<Validade[]>([]);
  const [carregandoResumo, setCarregandoResumo] = useState(true);

  function carregarTarefas() {
    if (!usuarioAtual) return;
    buscarTarefasDoSetor(usuarioAtual.setor)
      .then((lista) => {
        setTarefas(lista);
        setErroTarefas(null);
      })
      .catch((e) => setErroTarefas(e?.message ?? 'Não consegui carregar as prioridades.'))
      .finally(() => {
        setCarregandoTarefas(false);
        setAtualizandoTarefas(false);
      });
  }

  useEffect(() => {
    carregarTarefas();
  }, [usuarioAtual?.setor]);

  useEffect(() => {
    if (!usuarioAtual) return;
    setCarregandoResumo(true);
    Promise.all([buscarAvisosDoSetor(usuarioAtual.setor), buscarValidadesDoSetor(usuarioAtual.setor)])
      .then(([avisos, validades]) => {
        setAvisosUrgentes(avisos.filter((a) => a.urgente).slice(0, 5));
        setValidadesProximas([...validades].sort((a, b) => (a.dataValidade < b.dataValidade ? -1 : 1)).slice(0, 5));
      })
      .catch(() => {})
      .finally(() => setCarregandoResumo(false));
  }, [usuarioAtual?.setor]);

  if (!usuarioAtual) return null;

  function confirmarSaida() {
    Alert.alert('Sair da conta?', 'Você vai precisar entrar de novo com matrícula e senha.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ]);
  }

  const somenteValidade = usuarioAtual.setor === 'promotores';
  const ehFlv = usuarioAtual.setor === 'flv';
  // Conferência também é usada pelo CPD (ex.: "Conferência Jornal", pra
  // checar os produtos do tabloide de ofertas) e pelo Açougue (conferência
  // de NF de carnes/cortes) — não só pelo FLV.
  const podeConferir = usuarioAtual.setor === 'flv' || usuarioAtual.setor === 'cpd' || usuarioAtual.setor === 'acougue';
  // Ferramentas que o administrador escondeu especificamente pra esse
  // colaborador, lá na aba Equipe do portal — filtra a grade de "Acesso
  // rápido" abaixo. Sem nada configurado (padrão), enxerga tudo normalmente.
  const bloqueadas = usuarioAtual.ferramentasBloqueadas ?? [];

  if (tela === 'perdas') {
    return <PerdasSetorScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'validade') {
    return <ValidadeScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'avisos') {
    return <AvisosScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'sobre') {
    return <SobreScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'ocorrencia') {
    return <OcorrenciaScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'conferencia') {
    return <ConferenciaScreen onVoltar={() => setTela('home')} />;
  }
  if (tela === 'pedidos') {
    return <PedidosScreen onVoltar={() => setTela('home')} />;
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
    return <ChecklistScreen onVoltar={() => setTela('home')} />;
  }

  const nomeSetor = setores.find((s) => s.key === usuarioAtual.setor)?.nome ?? usuarioAtual.setor;
  const frase = FRASES_DO_DIA[new Date().getDate() % FRASES_DO_DIA.length];

  async function marcarConcluida(tarefa: Tarefa) {
    if (!usuarioAtual) return;
    setConcluindo(tarefa.id);
    try {
      await concluirTarefa(tarefa.id, usuarioAtual.nome);
      setTarefas((prev) => prev.filter((t) => t.id !== tarefa.id));
    } catch (e: any) {
      setErroTarefas(e?.message ?? 'Não consegui marcar como concluída.');
    } finally {
      setConcluindo(null);
    }
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={atualizandoTarefas}
          onRefresh={() => {
            setAtualizandoTarefas(true);
            carregarTarefas();
          }}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.greeting}>{saudacao()}, {usuarioAtual.nome}</Text>
            <View style={styles.sectorBadge}>
              <Text style={styles.sectorBadgeText}>Setor: {nomeSetor}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={confirmarSaida} style={styles.avatar}>
            <Image source={require('../../assets/icon.png')} style={styles.avatarImagem} />
          </TouchableOpacity>
        </View>

        <View style={styles.quoteCard}>
          <Text style={styles.quoteText}>“{frase}”</Text>
          <Text style={styles.quoteAuthor}>Frase do dia</Text>
        </View>
      </View>

      {!carregandoResumo && avisosUrgentes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚠ Avisos urgentes</Text>
          <View style={styles.listCard}>
            {avisosUrgentes.map((a, i) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.rowUrgente, i !== avisosUrgentes.length - 1 && styles.rowBorder]}
                onPress={() => setTela('avisos')}
              >
                <Text style={styles.rowTitle}>{a.titulo}</Text>
                <Text style={styles.rowSubtitle} numberOfLines={2}>{a.mensagem}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {!carregandoResumo && validadesProximas.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Produtos vencendo</Text>
            <TouchableOpacity onPress={() => setTela('validade')}>
              <Text style={styles.verMaisTexto}>Ver todos ›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.listCard}>
            {validadesProximas.map((v, i) => {
              const status = statusPrazo(diasRestantes(v.dataValidade));
              return (
                <View key={v.id} style={[styles.row, i !== validadesProximas.length - 1 && styles.rowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{v.produto}</Text>
                    <Text style={styles.rowSubtitle}>Vence em {formatarData(v.dataValidade)}</Text>
                  </View>
                  <View style={[styles.chipStatus, { backgroundColor: status.fundo }]}>
                    <Text style={[styles.chipStatusTexto, { color: status.cor }]}>{status.texto}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {!somenteValidade && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Prioridades de hoje</Text>

        {carregandoTarefas ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.lg }} />
        ) : erroTarefas ? (
          <View style={styles.erroCard}>
            <Text style={styles.erroText}>{erroTarefas}</Text>
          </View>
        ) : tarefas.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Nenhuma prioridade lançada ainda. Assim que a gerência criar uma tarefa para o setor{' '}
              {nomeSetor}, ela aparece aqui.
            </Text>
          </View>
        ) : (
          tarefas.map((t) => (
            <View key={t.id} style={styles.tarefaCard}>
              <Text style={styles.tarefaTitulo}>{t.titulo}</Text>
              {!!t.descricao && <Text style={styles.tarefaDescricao}>{t.descricao}</Text>}
              {!!t.prazo && <Text style={styles.tarefaPrazo}>Prazo: {t.prazo}</Text>}
              <TouchableOpacity
                style={[styles.btnConcluir, concluindo === t.id && styles.btnConcluirDesabilitado]}
                onPress={() => marcarConcluida(t)}
                disabled={concluindo === t.id}
              >
                <Text style={styles.btnConcluirTexto}>{concluindo === t.id ? 'Concluindo…' : 'Marcar como concluída'}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Acesso rápido</Text>
        <View style={styles.grid}>
          {(somenteValidade
            ? [
                { label: 'Checklist', icone: 'check-square' as const, chave: 'checklist', onPress: () => setTela('checklist') },
                { label: 'Validade', icone: 'calendar' as const, chave: 'validade', onPress: () => setTela('validade') },
                { label: 'Mapa da Loja', icone: 'map' as const, chave: 'mapaLoja', onPress: () => setTela('mapaLoja') },
                { label: 'Pontas e Pontos Extras', icone: 'layers' as const, chave: 'pontasExtras', onPress: () => setTela('pontasExtras') },
                { label: 'Jornal de Ofertas', icone: 'file-text' as const, chave: 'jornalOfertas', onPress: () => setTela('jornalOfertas') },
                { label: 'Sobre', icone: 'info' as const, chave: null, onPress: () => setTela('sobre') },
              ]
            : [
                { label: 'Checklist', icone: 'check-square' as const, chave: 'checklist', onPress: () => setTela('checklist') },
                { label: 'Perdas do Setor', icone: 'trending-down' as const, chave: 'perdas', onPress: () => setTela('perdas') },
                { label: 'Validade', icone: 'calendar' as const, chave: 'validade', onPress: () => setTela('validade') },
                { label: 'Inventário', icone: 'package' as const, chave: null, onPress: undefined },
                { label: 'Mural de Avisos', icone: 'bell' as const, chave: 'avisos', onPress: () => setTela('avisos') },
                { label: 'Abrir ocorrência', icone: 'alert-triangle' as const, chave: 'ocorrencia', onPress: () => setTela('ocorrencia') },
                ...(podeConferir
                  ? [{ label: 'Conferência', icone: 'clipboard' as const, chave: 'conferencia', onPress: () => setTela('conferencia') }]
                  : []),
                ...(ehFlv
                  ? [{ label: 'Pedidos', icone: 'shopping-cart' as const, chave: 'pedidos', onPress: () => setTela('pedidos') }]
                  : []),
                { label: 'Mapa da Loja', icone: 'map' as const, chave: 'mapaLoja', onPress: () => setTela('mapaLoja') },
                { label: 'Pontas e Pontos Extras', icone: 'layers' as const, chave: 'pontasExtras', onPress: () => setTela('pontasExtras') },
                { label: 'Jornal de Ofertas', icone: 'file-text' as const, chave: 'jornalOfertas', onPress: () => setTela('jornalOfertas') },
                { label: 'Sobre', icone: 'info' as const, chave: null, onPress: () => setTela('sobre') },
              ]
          )
            .filter((acao) => !acao.chave || !bloqueadas.includes(acao.chave))
            .map((acao) => (
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray100, paddingTop: 56, paddingBottom: 24, paddingHorizontal: spacing.xl },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: 19, fontWeight: '700', color: colors.navy900 },
  sectorBadge: { backgroundColor: colors.navy700, borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 10, marginTop: 6, alignSelf: 'flex-start' },
  sectorBadgeText: { color: colors.white, fontSize: 11, fontWeight: '600' },
  avatar: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.gray100, overflow: 'hidden' },
  avatarImagem: { width: '100%', height: '100%' },
  quoteCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.xl },
  quoteText: { color: colors.navy900, fontSize: 13, fontWeight: '600' },
  quoteAuthor: { color: colors.gray400, fontSize: 11, marginTop: 4 },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.gray900, marginBottom: spacing.md },
  verMaisTexto: { fontSize: 12.5, fontWeight: '700', color: colors.navy700 },
  listCard: { backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 12 },
  rowUrgente: { paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  rowTitle: { fontSize: 13, fontWeight: '600', color: colors.gray900 },
  rowSubtitle: { fontSize: 11, color: colors.gray600, marginTop: 2 },
  chipStatus: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipStatusTexto: { fontSize: 10, fontWeight: '700' },
  emptyCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  emptyText: { color: colors.gray600, fontSize: 12, lineHeight: 18 },
  erroCard: { backgroundColor: '#FBDEDC', borderRadius: radius.lg, padding: spacing.lg },
  erroText: { color: colors.red500, fontSize: 12, lineHeight: 18 },
  tarefaCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  tarefaTitulo: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  tarefaDescricao: { fontSize: 12.5, color: colors.gray600, marginTop: 6, lineHeight: 18 },
  tarefaPrazo: { fontSize: 11, color: colors.gray400, marginTop: 8 },
  btnConcluir: { backgroundColor: colors.green500, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', marginTop: spacing.md },
  btnConcluirDesabilitado: { opacity: 0.6 },
  btnConcluirTexto: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47%', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  tileDot: { width: 34, height: 34, borderRadius: radius.full, backgroundColor: colors.navy700, marginBottom: spacing.md, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 12, fontWeight: '600', color: colors.gray900 },
  tileEmBreve: { fontSize: 9.5, fontWeight: '700', color: colors.gray400, marginTop: 4, textTransform: 'uppercase' },
});
