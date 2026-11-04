import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, radius, spacing } from '../theme/colors';
import CabecalhoTela from '../components/CabecalhoTela';
import { supabase } from '../lib/supabase';
import { normalizarEan } from '../data/rupturaApi';
import { buscarAreasComCache, buscarAreasDosGrupos, ordenarRota } from '../data/rupturaMapaApi';
import RotaMapaScreen from './RotaMapaScreen';

// Ruptura sugerida — lista da planilha da Falcon que o gerente sobe no Portal
// (Operação › Ruptura sugerida). Aqui confere nos lugares certos, sem coletar
// o corredor inteiro: bipar = está na área de venda; botão = ruptura. No fim,
// as rupturas vão para o Pedido CD. Tabelas: supabase/ruptura_sugerida.sql.

const AZUL = '#2F7BFF';
const VERDE = '#178553';
const VERMELHO = '#C0352B';

type Status = 'pendente' | 'na_area' | 'ruptura';
interface ItemSug {
  id: string;
  codigoInterno: string;
  produto: string;
  secao: string | null;
  grupoId: string | null;
  grupoNome: string | null;
  areaId: string | null;
  eans: string[];
  saldo: number | null;
  estoqueCd: number | null;
  status: Status;
  enviado: boolean;
}
interface Lote { id: string; arquivo: string | null; criadoEm: string; totalItens: number; excluidos: { pedido_14_dias?: number; descontinuados?: number } }
type Filtro = 'pendente' | 'ruptura' | 'na_area' | 'todos';

export async function contarRupturaSugerida(): Promise<number> {
  const { data: l } = await supabase.from('ruptura_sugerida_lotes').select('id').eq('status', 'aberta').order('criado_em', { ascending: false }).limit(1);
  const id = l?.[0]?.id;
  if (!id) return 0;
  const { count } = await supabase.from('ruptura_sugerida_itens').select('id', { count: 'exact', head: true }).eq('lote_id', id).eq('status', 'pendente');
  return count ?? 0;
}

export default function RupturaSugeridaScreen({ quem, onVoltar }: { quem: string; onVoltar: () => void }) {
  const [lote, setLote] = useState<Lote | null>(null);
  const [itens, setItens] = useState<ItemSug[]>([]);
  // Ordem de visita das áreas do mapa (saindo da entrada) e o nome de cada área.
  const [rotaArea, setRotaArea] = useState<Map<string, { pos: number; nome: string }>>(new Map());
  const [verMapa, setVerMapa] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('pendente');
  const [busca, setBusca] = useState('');
  const [camera, setCamera] = useState(false);
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [flash, setFlash] = useState<{ texto: string; ok: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ultimo = useRef<{ ean: string; em: number }>({ ean: '', em: 0 });
  const itensRef = useRef(itens);
  itensRef.current = itens;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data: ls, error } = await supabase.from('ruptura_sugerida_lotes').select('*').eq('status', 'aberta').order('criado_em', { ascending: false }).limit(1);
      if (error) throw error;
      const l = ls?.[0];
      if (!l) { setLote(null); setItens([]); return; }
      setLote({ id: l.id, arquivo: l.arquivo, criadoEm: l.criado_em, totalItens: l.total_itens, excluidos: l.excluidos ?? {} });
      const { data: its, error: e2 } = await supabase.from('ruptura_sugerida_itens').select('*').eq('lote_id', l.id).limit(5000);
      if (e2) throw e2;
      setItens((its ?? []).map((i: any) => ({
        id: i.id, codigoInterno: i.codigo_interno, produto: i.produto ?? i.codigo_interno, secao: i.secao, grupoId: i.grupo_id, grupoNome: i.grupo_nome, areaId: i.area_id ?? null,
        eans: (i.eans ?? []).map((e: string) => normalizarEan(e)), saldo: i.saldo == null ? null : Number(i.saldo),
        estoqueCd: i.estoque_cd == null ? null : Number(i.estoque_cd), status: i.status, enviado: !!i.enviado_pedido_em,
      })));
      // Ordem da rota: áreas do mapa onde cada produto fica (conferência do jornal / coletas).
      try {
        const [areas, areaDoGrupo] = await Promise.all([buscarAreasComCache(), buscarAreasDosGrupos()]);
        const usadas = new Set<string>();
        (its ?? []).forEach((i: any) => {
          const a = i.area_id ?? (i.grupo_id ? areaDoGrupo[i.grupo_id] : null);
          if (a) usadas.add(a);
        });
        const rota = ordenarRota(areas.filter((a) => usadas.has(a.id)));
        setRotaArea(new Map(rota.map((a, i) => [a.id, { pos: i, nome: a.nome }])));
        // Sem local do produto: usa o local do grupo.
        setItens((l) => l.map((x) => (x.areaId || !x.grupoId || !areaDoGrupo[x.grupoId] ? x : { ...x, areaId: areaDoGrupo[x.grupoId] })));
      } catch {
        setRotaArea(new Map());
      }
    } catch (e: any) {
      Alert.alert('Não consegui carregar', e?.message ?? '');
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function mudarStatus(it: ItemSug, status: Status) {
    setItens((l) => l.map((x) => (x.id === it.id ? { ...x, status } : x)));
    const { error } = await supabase.from('ruptura_sugerida_itens')
      .update({ status, conferido_por: status === 'pendente' ? null : quem, conferido_em: status === 'pendente' ? null : new Date().toISOString() })
      .eq('id', it.id);
    if (error) {
      setItens((l) => l.map((x) => (x.id === it.id ? { ...x, status: it.status } : x)));
      Alert.alert('Não consegui salvar', error.message);
    }
  }

  function registrar(bruto: string) {
    const ean = normalizarEan(bruto);
    if (!ean) return;
    const agora = Date.now();
    if (ultimo.current.ean === ean && agora - ultimo.current.em < 2500) return;
    ultimo.current = { ean, em: agora };
    const it = itensRef.current.find((x) => x.eans.includes(ean) || x.codigoInterno === ean);
    if (!it) {
      Vibration.vibrate([0, 80, 80, 80]);
      setFlash({ texto: `Código ${ean} não está na lista`, ok: false });
      return;
    }
    Vibration.vibrate(60);
    if (it.status === 'na_area') {
      setFlash({ texto: `Já conferido: ${it.produto}`, ok: true });
      return;
    }
    mudarStatus(it, 'na_area');
    setFlash({ texto: `✓ Na área de venda: ${it.produto}`, ok: true });
  }

  const termo = busca.trim().toUpperCase();
  const visiveis = itens.filter((i) =>
    (filtro === 'todos' || i.status === filtro) &&
    (!termo || i.produto.toUpperCase().includes(termo) || i.codigoInterno.includes(termo) || i.eans.some((e) => e.includes(termo))),
  );
  // Agrupa por área do mapa, na ordem da rota (saindo da entrada). Sem lugar no mapa vai no fim, por grupo.
  const blocos = useMemo(() => {
    const m = new Map<string, { titulo: string; ordem: number; itens: ItemSug[] }>();
    for (const i of visiveis) {
      const ar = i.areaId ? rotaArea.get(i.areaId) : undefined;
      const k = ar ? `area:${i.areaId}` : `grupo:${i.grupoId ?? i.secao ?? ''}`;
      if (!m.has(k)) {
        m.set(k, ar
          ? { titulo: `${ar.pos + 1}º · ${ar.nome}`, ordem: ar.pos, itens: [] }
          : { titulo: `Sem lugar no mapa · ${i.grupoNome ?? i.secao ?? 'Sem grupo'}`, ordem: 10000, itens: [] });
      }
      m.get(k)!.itens.push(i);
    }
    return [...m.values()]
      .sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo))
      .map((b) => ({ ...b, itens: b.itens.sort((x, y) => (x.grupoNome ?? '').localeCompare(y.grupoNome ?? '') || x.produto.localeCompare(y.produto)) }));
  }, [visiveis, rotaArea]);

  const n = (s: Status) => itens.filter((i) => i.status === s).length;
  const paraPedido = itens.filter((i) => i.status === 'ruptura' && !i.enviado);

  async function enviarPedido() {
    if (!lote) return;
    setEnviando(true);
    try {
      const { data, error } = await supabase.rpc('ruptura_sugerida_enviar_pedido', { p_lote: lote.id, p_por: quem });
      if (error) throw error;
      const partes = [`${data.enviados} ${data.enviados === 1 ? 'produto foi' : 'produtos foram'} para o Pedido CD.`];
      if (data.sem_cd) partes.push(`${data.sem_cd} sem estoque no CD ficaram de fora.`);
      if (data.com_estoque_loja) partes.push(`${data.com_estoque_loja} têm estoque na loja: ficaram de fora (verificar depósito).`);
      if (data.enviados) partes.push('Você recebe o aviso quando o pedido estiver pronto.');
      Alert.alert('Pedido CD', partes.join('\n'));
      await carregar();
    } catch (e: any) {
      Alert.alert('Não consegui enviar', e?.message ?? '');
    } finally {
      setEnviando(false);
    }
  }

  function botoes(i: ItemSug) {
    if (i.status === 'na_area')
      return (
        <View style={styles.linhaBotoes}>
          <Text style={[styles.estado, { color: VERDE }]}>✓ Na área de venda</Text>
          <TouchableOpacity onPress={() => mudarStatus(i, 'pendente')}><Text style={styles.link}>Desfazer</Text></TouchableOpacity>
        </View>
      );
    if (i.status === 'ruptura')
      return (
        <View style={styles.linhaBotoes}>
          <Text style={[styles.estado, { color: VERMELHO }]}>🔴 Ruptura</Text>
          {!i.enviado && <TouchableOpacity onPress={() => mudarStatus(i, 'pendente')}><Text style={styles.link}>Desfazer</Text></TouchableOpacity>}
        </View>
      );
    return (
      <View style={styles.linhaBotoes}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#FDECEA' }]} onPress={() => mudarStatus(i, 'ruptura')}>
          <Text style={[styles.btnTexto, { color: VERMELHO }]}>🔴 Não está na área · ruptura</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#E6F6EE' }]} onPress={() => mudarStatus(i, 'na_area')}>
          <Text style={[styles.btnTexto, { color: VERDE }]}>✓ Está</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (verMapa) {
    const lista = itens.filter((i) => i.status === 'pendente' || filtro !== 'pendente');
    const porId = new Map(itens.map((i) => [i.id, i]));
    return (
      <RotaMapaScreen
        titulo="Ruptura sugerida · rota"
        itens={lista.map((i) => ({ codigoInterno: i.codigoInterno, produto: i.produto, grupoId: i.grupoId, detalhe: i.grupoNome ?? i.secao ?? '', chave: i.id }))}
        feito={(it) => (porId.get(it.chave ?? '')?.status ?? 'pendente') !== 'pendente'}
        acoes={(it) => { const i = porId.get(it.chave ?? ''); return i ? botoes(i) : null; }}
        onVoltar={() => setVerMapa(false)}
      />
    );
  }

  const FILTROS: [Filtro, string, number][] = [
    ['pendente', 'Para conferir', n('pendente')],
    ['ruptura', '🔴 Ruptura', n('ruptura')],
    ['na_area', '✓ Na área', n('na_area')],
    ['todos', 'Todos', itens.length],
  ];

  return (
    <View style={styles.tela}>
      <CabecalhoTela
        titulo="Ruptura sugerida"
        subtitulo={lote ? `${n('na_area') + n('ruptura')} de ${itens.length} conferidos · planilha de ${new Date(lote.criadoEm).toLocaleDateString('pt-BR')}` : 'Planilha da Falcon'}
        icone="list"
        onVoltar={onVoltar}
      />
      {!lote && !carregando ? (
        <View style={{ padding: spacing.lg }}>
          <Text style={styles.vazio}>Nenhuma lista aberta. Suba a planilha de ruptura da Falcon no Portal (Operação › Ruptura sugerida).</Text>
        </View>
      ) : (
        <>
          {camera ? (
            <View style={styles.areaCamera}>
              {!permissao?.granted ? (
                <TouchableOpacity style={styles.btnPermitir} onPress={pedirPermissao}>
                  <Text style={styles.btnTexto}>Permitir câmera</Text>
                </TouchableOpacity>
              ) : (
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  onBarcodeScanned={({ data }: { data: string }) => registrar(data)}
                  barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
                />
              )}
              {flash && (
                <View style={[styles.flash, { backgroundColor: flash.ok ? VERDE : VERMELHO }]}>
                  <Text style={styles.flashTexto} numberOfLines={2}>{flash.texto}</Text>
                </View>
              )}
            </View>
          ) : null}
          <View style={[styles.barra, { flexDirection: 'row', gap: spacing.sm }]}>
            <TouchableOpacity style={[styles.btnCamera, { flex: 1 }, camera && { backgroundColor: colors.navy700 }]} onPress={() => setCamera(!camera)}>
              <Feather name={camera ? 'x' : 'maximize'} size={16} color={camera ? colors.white : colors.navy700} />
              <Text style={[styles.btnCameraTexto, camera && { color: colors.white }]}>{camera ? 'Fechar câmera' : 'Bipar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnCamera, { flex: 1 }]} onPress={() => { setCamera(false); setVerMapa(true); }}>
              <Feather name="map" size={16} color={colors.navy700} />
              <Text style={styles.btnCameraTexto}>Rota no mapa</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, minHeight: 52 }} contentContainerStyle={styles.abas}>
            {FILTROS.map(([k, r, q]) => (
              <TouchableOpacity key={k} style={[styles.aba, filtro === k && styles.abaAtiva]} onPress={() => setFiltro(k)}>
                <Text style={[styles.abaTexto, filtro === k && { color: colors.white }]}>{r} · {q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 140 }} refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}>
            <View style={styles.busca}>
              <Feather name="search" size={16} color={colors.gray400} />
              <TextInput style={styles.buscaInput} value={busca} onChangeText={setBusca} placeholder="Buscar produto ou código" placeholderTextColor={colors.gray400} autoCorrect={false} />
            </View>
            {lote && ((lote.excluidos.pedido_14_dias ?? 0) > 0 || (lote.excluidos.descontinuados ?? 0) > 0) && (
              <Text style={styles.nota}>
                Fora da lista: {lote.excluidos.pedido_14_dias ?? 0} com pedido nos últimos 14 dias · {lote.excluidos.descontinuados ?? 0} descontinuados
              </Text>
            )}
            {carregando && !itens.length ? <ActivityIndicator color={AZUL} style={{ marginTop: spacing.xl }} /> : null}
            {blocos.map((b) => (
              <View key={b.titulo} style={{ marginBottom: spacing.md }}>
                <Text style={styles.secTitulo}>{b.titulo} · {b.itens.length}</Text>
                {b.itens.map((i) => (
                  <View key={i.id} style={[styles.item, i.status === 'ruptura' && { borderColor: '#F3B4AE' }, i.status === 'na_area' && { borderColor: '#B7E3CB' }]}>
                    <Text style={styles.itemNome} numberOfLines={2}>{i.produto}</Text>
                    <View style={styles.selos}>
                      <Text style={[styles.selo, styles.seloCinza]}>{i.codigoInterno}</Text>
                      {i.saldo != null && <Text style={[styles.selo, i.saldo > 0 ? styles.seloAmarelo : styles.seloVermelho]}>Loja {i.saldo}</Text>}
                      <Text style={[styles.selo, (i.estoqueCd ?? 0) > 0 ? styles.seloVerde : styles.seloVermelho]}>{(i.estoqueCd ?? 0) > 0 ? `CD ${i.estoqueCd}` : 'CD sem estoque'}</Text>
                      {i.enviado && <Text style={[styles.selo, { color: '#1D4ED8', backgroundColor: '#E3EDFF' }]}>🚚 No pedido</Text>}
                    </View>
                    {botoes(i)}
                  </View>
                ))}
              </View>
            ))}
            {!carregando && lote && !visiveis.length && <Text style={styles.vazio}>{filtro === 'pendente' ? 'Tudo conferido. 👍' : 'Nada aqui.'}</Text>}
          </ScrollView>
          {paraPedido.length > 0 && (
            <View style={styles.rodape}>
              <TouchableOpacity style={styles.btnGrande} onPress={enviarPedido} disabled={enviando}>
                {enviando ? <ActivityIndicator color={colors.white} /> : <Feather name="shopping-cart" size={18} color={colors.white} />}
                <Text style={styles.btnGrandeTexto}>Enviar {paraPedido.length} {paraPedido.length === 1 ? 'ruptura' : 'rupturas'} ao Pedido CD</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.gray50 },
  vazio: { textAlign: 'center', color: colors.gray600, marginTop: spacing.xl, lineHeight: 20 },
  nota: { fontSize: 12, color: colors.gray600, marginBottom: spacing.sm },
  areaCamera: { height: 200, backgroundColor: '#000', overflow: 'hidden' },
  btnPermitir: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flash: { position: 'absolute', left: 10, right: 10, bottom: 10, borderRadius: radius.md, padding: 10 },
  flashTexto: { color: colors.white, fontWeight: '800', fontSize: 13 },
  barra: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  btnCamera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E3EDFF', borderRadius: radius.md, paddingVertical: 12 },
  btnCameraTexto: { color: colors.navy700, fontWeight: '800', fontSize: 14 },
  abas: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: 2 },
  aba: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  abaAtiva: { backgroundColor: AZUL, borderColor: AZUL },
  abaTexto: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: colors.navy700 },
  busca: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  buscaInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.navy900 },
  secTitulo: { fontSize: 14, fontWeight: '800', color: colors.navy700, marginBottom: 6, marginTop: 4 },
  item: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: spacing.md, marginBottom: spacing.sm },
  itemNome: { fontSize: 14, fontWeight: '700', color: colors.navy900 },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  selo: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full, overflow: 'hidden' },
  seloVerde: { color: VERDE, backgroundColor: '#E6F6EE' },
  seloVermelho: { color: VERMELHO, backgroundColor: '#FDECEA' },
  seloAmarelo: { color: '#9A7A00', backgroundColor: '#FFF8D6' },
  seloCinza: { color: colors.gray600, backgroundColor: colors.gray50 },
  linhaBotoes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  btn: { borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9 },
  btnTexto: { fontSize: 13, fontWeight: '800', color: colors.navy700 },
  estado: { fontSize: 13, fontWeight: '800', marginRight: 6 },
  link: { color: AZUL, fontWeight: '700' },
  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.gray50, borderTopWidth: 1, borderTopColor: colors.gray100 },
  btnGrande: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1B5E20', borderRadius: radius.md, paddingVertical: 14 },
  btnGrandeTexto: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
