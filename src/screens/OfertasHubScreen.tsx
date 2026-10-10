import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, BackHandler } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import OfertasScreen from './OfertasScreen';
import EstoqueJornalScreen from './EstoqueJornalScreen';
import JornalOfertasScreen from './JornalOfertasScreen';
import { listarCampanhas, campanhaAtual, listarItens, ehAlerta } from '../data/jornalEstoqueApi';
import { supabase } from '../lib/supabase';

// Aba "Ofertas": junta o Jornal de Ofertas, o Estoque do Jornal e as
// Ofertas no WhatsApp num lugar só.

type Tela = 'hub' | 'whats' | 'estoque' | 'jornal';

export default function OfertasHubScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const [tela, setTela] = useState<Tela>('hub');
  const [alertasJornal, setAlertasJornal] = useState<number | null>(null);
  const [pendentes, setPendentes] = useState<number | null>(null);

  useEffect(() => {
    const voltar = () => {
      if (tela !== 'hub') {
        setTela('hub');
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', voltar);
    return () => sub.remove();
  }, [tela]);

  useEffect(() => {
    if (tela !== 'hub') return;
    listarCampanhas()
      .then(async (l) => {
        const c = campanhaAtual(l);
        setAlertasJornal(c ? (await listarItens(c.id)).filter(ehAlerta).length : 0);
      })
      .catch(() => setAlertasJornal(null));
    if (usuarioAtual?.isAdmin) {
      supabase
        .from('ofertas')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendente')
        .then(({ count }) => setPendentes(count ?? 0), () => setPendentes(null));
    }
  }, [tela]);

  if (tela === 'whats') return <OfertasScreen onVoltar={() => setTela('hub')} />;
  if (tela === 'estoque') return <EstoqueJornalScreen onVoltar={() => setTela('hub')} />;
  if (tela === 'jornal') return <JornalOfertasScreen onVoltar={() => setTela('hub')} />;

  const cards: { k: Tela; titulo: string; texto: string; icone: React.ComponentProps<typeof Feather>['name']; badge?: string | null; cor?: string }[] = [
    {
      k: 'jornal',
      titulo: 'Jornal de Ofertas',
      texto: 'O encarte da quinzena para consultar.',
      icone: 'book-open',
    },
    {
      k: 'estoque',
      titulo: 'Estoque do Jornal',
      texto: 'Quanto temos de cada produto do jornal e o que vai acabar antes do fim.',
      icone: 'package',
      badge: alertasJornal ? `${alertasJornal} alerta${alertasJornal === 1 ? '' : 's'}` : null,
      cor: colors.red500,
    },
    {
      k: 'whats',
      titulo: 'Ofertas no WhatsApp',
      texto: usuarioAtual?.isAdmin ? 'Valide as ofertas sugeridas e acompanhe o disparo no grupo.' : 'Sugira ofertas do seu setor para o grupo.',
      icone: 'send',
      badge: pendentes ? `${pendentes} para validar` : null,
      cor: '#B4650E',
    },
  ];

  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo="Ofertas" subtitulo="Jornal, estoque do jornal e WhatsApp" icone="tag" onVoltar={onVoltar} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        {cards.map((c) => (
          <TouchableOpacity key={c.k} style={styles.card} onPress={() => setTela(c.k)} activeOpacity={0.75}>
            <View style={styles.icone}>
              <Feather name={c.icone} size={20} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={styles.titulo}>{c.titulo}</Text>
                {c.badge ? (
                  <View style={[styles.badge, { backgroundColor: c.cor }]}>
                    <Text style={styles.badgeTexto}>{c.badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.texto}>{c.texto}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.gray400} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  icone: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 15, fontWeight: '800', color: colors.navy900 },
  texto: { fontSize: 12.5, color: colors.gray600, marginTop: 3, lineHeight: 17 },
  badge: { borderRadius: radius.full, paddingVertical: 2, paddingHorizontal: 8 },
  badgeTexto: { color: colors.white, fontSize: 10.5, fontWeight: '800' },
});
