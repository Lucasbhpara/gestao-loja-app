import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, RefreshControl, Linking, Share } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import RotaMapaScreen, { ItemRota } from './RotaMapaScreen';
import {
  ItemFoco,
  StatusFoco,
  SituacaoCd,
  ResultadoDisponibilidade,
  listarItensFoco,
  marcarItemFoco,
  reiniciarItensFoco,
  buscarDisponibilidade,
  disponibilidadeDe,
  ConferenciaFoco,
  SolicitacaoPedido,
  salvarConferenciaFoco,
  listarConferenciasFoco,
  enviarFocoAoPedidoCD,
  buscarSolicitacoes,
  rodapePedido,
} from '../data/itensFocoApi';

// Itens Foco: a lista do supervisor com os produtos que cada representante
// cobra na loja. Três abas (a 3ª é o Histórico das conferências):
//  • Conferência — igual à do folheto: OK / Ruptura item a item, filtro por
//    responsável, rota no mapa da loja (sai da entrada e segue os números) e
//    relatório no WhatsApp separado por responsável.
//  • Disponível no CD — estoque da loja x estoque do CD (formulário do CD
//    importado na Ruptura), com o que dá para pedir já e o que o CD não tem.
//    "Enviar ao Pedido CD" põe na fila do Assistente ULVA (extensão do Chrome),
//    e os relatórios terminam com "Pedido realizado no dia … às …".

const AZUL = '#2F7BFF';
const VERDE = '#1E8E5A';
const LARANJA = '#A86200';
const VERMELHO = '#D23C33';

type Aba = 'conferencia' | 'cd' | 'historico';
type Filtro = 'pendentes' | 'feitos' | 'todos';
type FiltroCd = 'pedir' | SituacaoCd | 'todos';

const STATUS: Record<StatusFoco, { texto: string; cor: string; fundo: string }> = {
  ok: { texto: '✓ OK', cor: colors.green500, fundo: '#DFF3E9' },
  ruptura: { texto: '⚠ Ruptura', cor: colors.red500, fundo: '#FBDEDC' },
};
const SIT_CD: Record<SituacaoCd, { texto: string; cor: string }> = {
  cd_tem: { texto: 'CD tem', cor: VERDE },
  cd_zerado: { texto: 'CD zerado', cor: VERMELHO },
  fora_cd: { texto: 'Fora do CD', cor: LARANJA },
  sem_codigo: { texto: 'Sem código', cor: colors.gray600 },
};

const qtd = (n: number | null) => (n == null ? '–' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '–');

async function mandarWhatsApp(texto: string) {
  const url = 'whatsapp://send?text=' + encodeURIComponent(texto);
  try {
    if (await Linking.canOpenURL(url)) { await Linking.openURL(url); return; }
  } catch {
    // cai para o compartilhar do celular
  }
  await Share.share({ message: texto });
}

export default function ItensFocoScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const por = usuarioAtual?.nome ?? '';
  const [aba, setAba] = useState<Aba>('conferencia');
  const [itens, setItens] = useState<ItemFoco[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [resp, setResp] = useState<string | null>(null); // filtro por responsável
  const [filtro, setFiltro] = useState<Filtro>('pendentes');
  const [filtroCd, setFiltroCd] = useState<FiltroCd>('pedir');
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);
  const [rota, setRota] = useState<ItemRota[] | null>(null);
  const [disp, setDisp] = useState<ResultadoDisponibilidade | null>(null);
  const [carregandoCd, setCarregandoCd] = useState(false);
  const [pedidos, setPedidos] = useState<Record<string, SolicitacaoPedido>>({});
  const [historico, setHistorico] = useState<ConferenciaFoco[] | null>(null);
  const [erroHist, setErroHist] = useState<string | null>(null);
  const [abertoHist, setAbertoHist] = useState<string | null>(null);
  const [enviandoPedido, setEnviandoPedido] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const l = await listarItensFoco();
      setItens(l);
      setErro(null);
      const ids = l.map((i) => i.pedidoSolicitacaoId).filter(Boolean) as string[];
      if (ids.length) buscarSolicitacoes(ids).then((r) => setPedidos((p) => ({ ...p, ...r }))).catch(() => {});
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui abrir os itens foco.');
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { recarregar(); }, [recarregar]);

  const carregarHistorico = useCallback(async () => {
    try {
      const h = await listarConferenciasFoco();
      setHistorico(h);
      setErroHist(null);
      const ids = h.map((x) => x.pedidoSolicitacaoId).filter(Boolean) as string[];
      if (ids.length) buscarSolicitacoes(ids).then((r) => setPedidos((p) => ({ ...p, ...r }))).catch(() => {});
    } catch (e: any) {
      setErroHist(e?.message ?? 'Não consegui abrir o histórico.');
      setHistorico([]);
    }
  }, []);
  useEffect(() => { carregarHistorico(); }, [carregarHistorico]);

  // Último pedido (fila do Assistente ULVA) dos itens que estão na tela.
  const pedidoDe = (lista: ItemFoco[]): SolicitacaoPedido | null => {
    const comPedido = lista.filter((i) => i.pedidoSolicitacaoId).sort((a, b) => (b.pedidoEm ?? '').localeCompare(a.pedidoEm ?? ''));
    return comPedido.length ? pedidos[comPedido[0].pedidoSolicitacaoId!] ?? null : null;
  };
  const comRodape = (texto: string, lista: ItemFoco[]) => {
    const r = rodapePedido(pedidoDe(lista));
    return r ? `${texto}\n\n${r}` : texto;
  };

  const carregarCd = useCallback(async (lista: ItemFoco[]) => {
    setCarregandoCd(true);
    try {
      setDisp(await buscarDisponibilidade(lista.map((i) => i.codigo ?? '').filter(Boolean)));
    } catch (e: any) {
      Alert.alert('Não consegui consultar o CD', e?.message ?? '');
    } finally {
      setCarregandoCd(false);
    }
  }, []);
  // estoque loja/CD também aparece na conferência, então busca assim que a lista chega
  useEffect(() => { if (itens.length && !disp) carregarCd(itens); }, [itens, disp, carregarCd]);

  const responsaveis = useMemo(() => {
    const m = new Map<string, { nome: string; lista: string | null; total: number; feitos: number }>();
    itens.forEach((i) => {
      const r = m.get(i.responsavel) ?? { nome: i.responsavel, lista: i.lista, total: 0, feitos: 0 };
      r.total++;
      if (i.confStatus) r.feitos++;
      m.set(i.responsavel, r);
    });
    return [...m.values()];
  }, [itens]);

  const doResp = useMemo(() => itens.filter((i) => !resp || i.responsavel === resp), [itens, resp]);
  const feitos = doResp.filter((i) => i.confStatus).length;
  const casaBusca = (i: ItemFoco) => {
    const t = busca.trim().toLowerCase();
    return !t || i.produto.toLowerCase().includes(t) || (i.codigo ?? '').includes(t);
  };

  async function marcar(i: ItemFoco, status: StatusFoco | null) {
    const antes = i;
    setSalvando(i.id);
    setItens((l) => l.map((x) => (x.id === i.id ? { ...x, confStatus: status, confPor: status ? por : null } : x)));
    try {
      await marcarItemFoco(i.id, status, por);
    } catch (e: any) {
      setItens((l) => l.map((x) => (x.id === i.id ? antes : x)));
      Alert.alert('Não consegui salvar', e?.message ?? '');
    } finally {
      setSalvando(null);
    }
  }

  // Antes de zerar, guarda a conferência no Histórico (se mudou algo desde a
  // última vez que foi guardada no "Finalizar").
  function reiniciar() {
    Alert.alert('Reiniciar conferência', 'Todos os itens foco voltam para pendente (de todos os responsáveis). A conferência atual fica guardada no Histórico.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Reiniciar', style: 'destructive', onPress: async () => {
        try {
          const ultimaSalva = historico?.[0]?.criadoEm ?? '';
          const ultimaMarca = itens.reduce((m, i) => [i.confEm ?? '', i.pedidoEm ?? '', m].sort().pop()!, '');
          if (itens.some((i) => i.confStatus) && ultimaMarca > ultimaSalva) {
            await salvarConferenciaFoco(itens.filter((i) => i.confStatus || i.pedidoSolicitacaoId), null, por);
          }
          await reiniciarItensFoco();
          setPedidos({});
          await recarregar();
          carregarHistorico();
        } catch (e: any) { Alert.alert('Erro', e?.message ?? ''); }
      } },
    ]);
  }

  // Rota: pendentes do filtro atual, cada um pelo código (onde foi bipado na
  // Ruptura/Busca ou pelo sub-sortimento). Sem local, aparecem no fim para
  // marcar no mapa (segurando o dedo dá para corrigir depois).
  function abrirRota() {
    const pend = doResp.filter((i) => !i.confStatus);
    if (!pend.length) { Alert.alert('Tudo conferido', 'Não há itens pendentes.'); return; }
    const r: ItemRota[] = pend
      .filter((i) => i.codigo)
      .map((i) => ({ codigoInterno: i.codigo!, produto: i.produto, grupoId: null, chave: i.id, detalhe: resp ? undefined : i.responsavel }));
    const semCodigo = pend.filter((i) => !i.codigo);
    if (!r.length) { Alert.alert('Sem rota', 'Os itens pendentes estão sem código.'); return; }
    setRota(r);
    if (semCodigo.length) Alert.alert(`${semCodigo.length} item(ns) fora da rota`, `Sem código, não dá para achar no mapa:\n\n${semCodigo.map((i) => '• ' + i.produto).join('\n')}`);
  }

  // ------------------------------------------- relatórios WhatsApp ----
  function textoConferencia(): string {
    const agora = new Date();
    const hora = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const base = doResp;
    const ok = base.filter((i) => i.confStatus === 'ok').length;
    const rup = base.filter((i) => i.confStatus === 'ruptura');
    const pend = base.filter((i) => !i.confStatus);
    const linha = (i: ItemFoco) => {
      const d = disponibilidadeDe(i, disp);
      const cd = d && d.situacao !== 'sem_codigo' ? ` · CD: ${d.situacao === 'fora_cd' ? 'fora' : qtd(d.estoqueCd)}` : '';
      return `• ${i.produto}${i.codigo ? ` (${i.codigo})` : ''}${cd}`;
    };
    const porResp = (l: ItemFoco[]) => {
      const out: string[] = [];
      [...new Set(l.map((i) => i.responsavel))].forEach((r) => {
        if (!resp) out.push(`_${r}_`);
        out.push(...l.filter((i) => i.responsavel === r).map(linha));
      });
      return out;
    };
    const partes = [
      '*🎯 Conferência Itens Foco — Loja 0327*',
      resp ? `Responsável: ${resp}` : 'Todos os responsáveis',
      `Conferido em ${hora}${por ? ` por ${por}` : ''}`,
      '',
      `Itens: *${base.length}*`,
      `✅ OK: ${ok}`,
      `⚠️ Ruptura: ${rup.length}${base.length ? ` (${Math.round((rup.length / Math.max(1, ok + rup.length)) * 100)}% dos conferidos)` : ''}`,
      ...(pend.length ? [`⏳ Não conferidos: ${pend.length}`] : []),
    ];
    if (rup.length) partes.push('', `*⚠️ RUPTURAS (${rup.length})*`, ...porResp(rup));
    if (pend.length) partes.push('', `*⏳ NÃO CONFERIDOS (${pend.length})*`, ...porResp(pend));
    if (!rup.length && !pend.length) partes.push('', 'Tudo certo: todos os itens foco na loja. 👏');
    return comRodape(partes.join('\n'), base);
  }

  function textoCd(): string {
    const base = doResp;
    const grupo = (s: SituacaoCd) => base.filter((i) => disponibilidadeDe(i, disp)?.situacao === s);
    const pedir = base.filter((i) => { const d = disponibilidadeDe(i, disp); return d?.situacao === 'cd_tem' && (i.confStatus === 'ruptura' || (d.estoqueLoja ?? 0) <= 0); });
    const linha = (i: ItemFoco) => {
      const d = disponibilidadeDe(i, disp);
      return `• ${i.produto}${i.codigo ? ` (${i.codigo})` : ''} · loja ${qtd(d?.estoqueLoja ?? null)} · CD ${qtd(d?.estoqueCd ?? null)}${!resp ? ` · ${i.responsavel}` : ''}`;
    };
    const zerado = grupo('cd_zerado'), fora = grupo('fora_cd'), tem = grupo('cd_tem'), sem = grupo('sem_codigo');
    const partes = [
      '*📦 Itens Foco — disponibilidade no CD*',
      resp ? `Responsável: ${resp}` : 'Todos os responsáveis',
      `Formulário do CD de ${dataBr(disp?.cdAtualizadoEm ?? null)} · estoque loja de ${dataBr(disp?.lojaAtualizadaEm ?? null)}`,
      '',
      `Itens: *${base.length}*`,
      `🟢 CD tem: ${tem.length}`,
      `🔴 CD zerado: ${zerado.length}`,
      `🟠 Fora do formulário do CD: ${fora.length}`,
      ...(sem.length ? [`⚪ Sem código: ${sem.length}`] : []),
    ];
    if (pedir.length) partes.push('', `*🛒 PEDIR AO CD — loja sem / ruptura e CD tem (${pedir.length})*`, ...pedir.map(linha));
    if (zerado.length) partes.push('', `*🔴 CD ZERADO (${zerado.length})*`, ...zerado.map(linha));
    if (fora.length) partes.push('', `*🟠 FORA DO CD — entrega direta ou fora de linha (${fora.length})*`, ...fora.map(linha));
    return comRodape(partes.join('\n'), base);
  }

  // Finalizar: guarda no Histórico e abre o WhatsApp com o relatório.
  async function enviarEGuardar() {
    const texto = textoConferencia();
    try {
      await salvarConferenciaFoco(doResp, resp, por);
      carregarHistorico();
    } catch (e: any) {
      Alert.alert('Não guardei no Histórico', e?.message ?? '');
    }
    mandarWhatsApp(texto);
  }
  function finalizar() {
    const pend = doResp.filter((i) => !i.confStatus).length;
    if (!pend) { enviarEGuardar(); return; }
    Alert.alert('Enviar relatório', `Ainda faltam ${pend} item(ns). Eles vão no relatório como "não conferidos".`, [
      { text: 'Continuar conferindo', style: 'cancel' },
      { text: 'Enviar assim', onPress: () => enviarEGuardar() },
    ]);
  }

  // Pedido CD: o que está no filtro "Pedir ao CD" e ainda não foi para a fila
  // (ou cujo pedido deu erro/foi cancelado).
  const jaNoPedido = (i: ItemFoco) => {
    if (!i.pedidoSolicitacaoId) return false;
    const st = pedidos[i.pedidoSolicitacaoId]?.status;
    return st !== 'erro' && st !== 'cancelada';
  };
  function enviarPedido(lista: ItemFoco[]) {
    const vai = lista.filter((i) => i.codigo && !jaNoPedido(i));
    if (!vai.length) { Alert.alert('Nada para enviar', 'Esses itens já estão no pedido do Assistente ULVA.'); return; }
    Alert.alert(
      'Enviar ao Pedido CD',
      `${vai.length} item(ns) vão para a fila do Assistente ULVA, que digita no MG SECOS do Portal 360 (com o Chrome do notebook aberto). Você recebe o aviso quando terminar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: async () => {
          setEnviandoPedido(true);
          try {
            const r = await enviarFocoAoPedidoCD(vai, resp, por);
            await recarregar();
            Alert.alert('Na fila do Assistente ULVA', `${r.enviados} item(ns) enviados. O relatório vai mostrar o dia e a hora em que o pedido foi realizado.`);
          } catch (e: any) {
            Alert.alert('Não consegui enviar', e?.message ?? '');
          } finally {
            setEnviandoPedido(false);
          }
        } },
      ],
    );
  }

  // ---------------------------------------------------------- rota ----
  if (rota) {
    const porId = new Map(itens.map((x) => [x.id, x]));
    return (
      <RotaMapaScreen
        itens={rota}
        titulo={resp ? `Rota · ${resp}` : 'Rota dos itens foco'}
        onVoltar={() => setRota(null)}
        feito={(it) => !!porId.get(it.chave!)?.confStatus}
        acoes={(it) => {
          const i = porId.get(it.chave!);
          if (!i) return null;
          const st = i.confStatus ? STATUS[i.confStatus] : null;
          return st ? (
            <View style={[styles.linha, { paddingLeft: 30, paddingBottom: 6 }]}>
              <Text style={{ color: st.cor, fontWeight: '800' }}>{st.texto}</Text>
              <TouchableOpacity onPress={() => marcar(i, null)} disabled={!!salvando}><Text style={styles.link}>Refazer</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 6, paddingLeft: 30, paddingBottom: 8 }}>
              <TouchableOpacity style={styles.btnOk} onPress={() => marcar(i, 'ok')} disabled={!!salvando}><Text style={styles.btnOkTexto}>✓ OK</Text></TouchableOpacity>
              <TouchableOpacity style={styles.btnRup} onPress={() => marcar(i, 'ruptura')} disabled={!!salvando}><Text style={styles.btnRupTexto}>⚠ Ruptura</Text></TouchableOpacity>
            </View>
          );
        }}
      />
    );
  }

  const chip = (ativo: boolean, texto: string, onPress: () => void, cor?: string) => (
    <TouchableOpacity key={texto} style={[styles.chip, ativo && { backgroundColor: cor ?? colors.navy700, borderColor: cor ?? colors.navy700 }]} onPress={onPress}>
      <Text style={[styles.chipTexto, ativo && { color: colors.white }]}>{texto}</Text>
    </TouchableOpacity>
  );

  const linhaEstoque = (i: ItemFoco) => {
    const d = disponibilidadeDe(i, disp);
    if (!d) return carregandoCd ? 'consultando estoque…' : '';
    if (d.situacao === 'sem_codigo') return 'sem código na lista';
    const cd = d.situacao === 'fora_cd' ? 'fora do CD' : `CD ${qtd(d.estoqueCd)}${d.embalagem ? ` (${d.embalagem})` : ''}`;
    return `Loja ${qtd(d.estoqueLoja)} · ${cd}`;
  };

  // --------------------------------------------- lista da conferência ----
  const listaConf = doResp
    .filter((i) => (filtro === 'pendentes' ? !i.confStatus : filtro === 'feitos' ? !!i.confStatus : true))
    .filter(casaBusca);

  // ------------------------------------------------------- lista CD ----
  const situacaoDe = (i: ItemFoco) => disponibilidadeDe(i, disp)?.situacao ?? null;
  const ehPedir = (i: ItemFoco) => {
    const d = disponibilidadeDe(i, disp);
    return d?.situacao === 'cd_tem' && (i.confStatus === 'ruptura' || (d.estoqueLoja ?? 0) <= 0);
  };
  const contaCd = (f: FiltroCd) => doResp.filter((i) => (f === 'todos' ? true : f === 'pedir' ? ehPedir(i) : situacaoDe(i) === f)).length;
  const listaCd = doResp.filter((i) => (filtroCd === 'todos' ? true : filtroCd === 'pedir' ? ehPedir(i) : situacaoDe(i) === filtroCd)).filter(casaBusca);

  return (
    <View style={styles.flex}>
      <CabecalhoTela titulo="Itens Foco" subtitulo="Lista do supervisor · Loja 0327" icone="target" onVoltar={onVoltar} />

      {carregando ? (
        <View style={styles.centro}><ActivityIndicator color={colors.navy700} size="large" /></View>
      ) : erro ? (
        <View style={styles.centro}>
          <Text style={styles.vazio}>{erro}</Text>
          <TouchableOpacity onPress={() => { setCarregando(true); recarregar(); }}><Text style={[styles.link, { marginTop: spacing.md }]}>Tentar de novo</Text></TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.abas}>
            {([['conferencia', '✓ Conferência'], ['cd', '📦 CD'], ['historico', '📊 Histórico']] as const).map(([k, t]) => (
              <TouchableOpacity key={k} style={[styles.aba, aba === k && styles.abaAtiva]} onPress={() => { setAba(k); if (k === 'historico') carregarHistorico(); }}>
                <Text style={[styles.abaTexto, aba === k && { color: colors.white }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 6, paddingBottom: spacing.sm }}>
            {chip(!resp, `Todos (${itens.length})`, () => setResp(null))}
            {responsaveis.map((r) => chip(resp === r.nome, `${r.nome} ${r.feitos}/${r.total}`, () => setResp(r.nome)))}
          </ScrollView>
          {resp && <Text style={styles.subLista}>{responsaveis.find((r) => r.nome === resp)?.lista ?? ''}</Text>}

          {aba === 'conferencia' ? (
            <>
              <View style={styles.progressoBox}>
                <Text style={styles.progressoTexto}>{feitos} de {doResp.length} conferidos{resp ? ` · ${resp}` : ''}</Text>
                <View style={styles.barraFundo}><View style={[styles.barra, { width: `${doResp.length ? (feitos / doResp.length) * 100 : 0}%` }]} /></View>
                <View style={styles.linha}>
                  <TouchableOpacity onPress={abrirRota}><Text style={styles.link}>🗺 Rota no mapa</Text></TouchableOpacity>
                  {itens.some((i) => i.confStatus) && <TouchableOpacity onPress={reiniciar}><Text style={[styles.link, { color: colors.red500 }]}>Reiniciar</Text></TouchableOpacity>}
                </View>
                {feitos > 0 && (
                  <TouchableOpacity style={styles.btnEnviar} onPress={finalizar}>
                    <Feather name="send" size={16} color={colors.white} />
                    <Text style={styles.btnEnviarTexto}>{feitos === doResp.length ? 'Finalizar e enviar no WhatsApp' : 'Enviar relatório no WhatsApp'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView
                style={styles.flex}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={false} onRefresh={() => { recarregar(); setDisp(null); }} />}
              >
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                  {chip(filtro === 'pendentes', `Pendentes (${doResp.length - feitos})`, () => setFiltro('pendentes'))}
                  {chip(filtro === 'feitos', `Conferidos (${feitos})`, () => setFiltro('feitos'))}
                  {chip(filtro === 'todos', `Todos (${doResp.length})`, () => setFiltro('todos'))}
                </ScrollView>
                <View style={styles.busca}>
                  <Feather name="search" size={15} color={colors.gray400} />
                  <TextInput style={styles.buscaInput} value={busca} onChangeText={setBusca} placeholder="Buscar produto ou código" placeholderTextColor={colors.gray400} />
                </View>
                {listaConf.map((i) => {
                  const st = i.confStatus ? STATUS[i.confStatus] : null;
                  const ocupado = salvando === i.id;
                  return (
                    <View key={i.id} style={styles.card}>
                      <View style={styles.cardTopo}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.produto}>{i.produto}</Text>
                          <Text style={styles.meta}>{i.codigo ? `Cód. ${i.codigo}` : 'Sem código'}{!resp ? ` · ${i.responsavel}` : ''}{i.obs ? ` · ${i.obs}` : ''}</Text>
                          <Text style={styles.meta}>{linhaEstoque(i)}</Text>
                        </View>
                        {st && <View style={[styles.chipStatus, { backgroundColor: st.fundo }]}><Text style={[styles.chipStatusTexto, { color: st.cor }]}>{st.texto}</Text></View>}
                      </View>
                      {!st ? (
                        <View style={styles.acoes}>
                          <TouchableOpacity style={[styles.btnOk, ocupado && styles.desab]} onPress={() => marcar(i, 'ok')} disabled={!!salvando}><Text style={styles.btnOkTexto}>✓ OK</Text></TouchableOpacity>
                          <TouchableOpacity style={[styles.btnRup, ocupado && styles.desab]} onPress={() => marcar(i, 'ruptura')} disabled={!!salvando}><Text style={styles.btnRupTexto}>⚠ Ruptura</Text></TouchableOpacity>
                        </View>
                      ) : (
                        <View style={[styles.acoes, { justifyContent: 'space-between' }]}>
                          <Text style={styles.meta}>{i.confPor ?? ''}</Text>
                          <TouchableOpacity onPress={() => marcar(i, null)} disabled={!!salvando}><Text style={styles.link}>Refazer</Text></TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
                {!listaConf.length && <Text style={styles.vazio}>{filtro === 'pendentes' ? 'Tudo conferido! 🎉' : 'Nada com esse filtro.'}</Text>}
              </ScrollView>
            </>
          ) : aba === 'historico' ? (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
              refreshControl={<RefreshControl refreshing={false} onRefresh={carregarHistorico} />}
            >
              <Text style={styles.ajuda}>Cada "Finalizar e enviar" (e cada Reiniciar) fica guardado aqui, com a comparação com a conferência anterior do mesmo responsável.</Text>
              {historico === null && <ActivityIndicator color={AZUL} style={{ marginTop: spacing.lg }} />}
              {erroHist && <Text style={styles.vazio}>{erroHist}</Text>}
              {(historico ?? []).filter((h) => !resp || h.responsavel === resp).map((h) => {
                const anterior = (historico ?? []).find((x) => x.responsavel === h.responsavel && x.criadoEm < h.criadoEm);
                const conferidos = h.ok + h.ruptura;
                const pct = conferidos ? Math.round((h.ruptura / conferidos) * 100) : 0;
                const dif = anterior ? h.ruptura - anterior.ruptura : null;
                const p = h.pedidoSolicitacaoId ? pedidos[h.pedidoSolicitacaoId] : undefined;
                const aberto = abertoHist === h.id;
                const rupturas = h.itens.filter((x) => x.status === 'ruptura');
                const quando = new Date(h.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                return (
                  <TouchableOpacity key={h.id} style={styles.card} activeOpacity={0.8} onPress={() => setAbertoHist(aberto ? null : h.id)}>
                    <View style={styles.cardTopo}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.produto}>{h.responsavel ?? 'Todos os responsáveis'}</Text>
                        <Text style={styles.meta}>{quando}{h.por ? ` · ${h.por}` : ''}</Text>
                      </View>
                      <Text style={[styles.sit, { color: pct > 20 ? VERMELHO : pct > 0 ? LARANJA : VERDE, borderColor: pct > 20 ? VERMELHO : pct > 0 ? LARANJA : VERDE }]}>{pct}% ruptura</Text>
                    </View>
                    <View style={styles.numeros}>
                      <View style={styles.numero}><Text style={styles.numRotulo}>OK</Text><Text style={[styles.numValor, { color: VERDE }]}>{h.ok}</Text></View>
                      <View style={styles.numero}><Text style={styles.numRotulo}>Ruptura</Text><Text style={[styles.numValor, { color: VERMELHO }]}>{h.ruptura}</Text></View>
                      <View style={styles.numero}><Text style={styles.numRotulo}>Não conf.</Text><Text style={styles.numValor}>{h.pendentes}</Text></View>
                    </View>
                    {dif !== null && (
                      <Text style={[styles.meta, { marginTop: 6, fontWeight: '700', color: dif > 0 ? VERMELHO : dif < 0 ? VERDE : colors.gray600 }]}>
                        {dif > 0 ? `▲ ${dif} ruptura(s) a mais que a anterior` : dif < 0 ? `▼ ${-dif} ruptura(s) a menos que a anterior` : '= mesmas rupturas da anterior'}
                      </Text>
                    )}
                    {p && <Text style={[styles.meta, { color: AZUL, fontWeight: '700', marginTop: 4 }]}>{rodapePedido(p).split('\n')[0]}</Text>}
                    {aberto && (
                      <View style={{ marginTop: spacing.sm }}>
                        {rupturas.length ? rupturas.map((x, k) => (
                          <Text key={k} style={styles.meta}>• {x.produto}{x.codigo ? ` (${x.codigo})` : ''}{!h.responsavel ? ` · ${x.responsavel}` : ''}</Text>
                        )) : <Text style={styles.meta}>Nenhuma ruptura nessa conferência. 👏</Text>}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
              {historico && !erroHist && !(historico ?? []).filter((h) => !resp || h.responsavel === resp).length && (
                <Text style={styles.vazio}>Nenhuma conferência guardada ainda. Ela entra aqui quando você toca em "Finalizar e enviar".</Text>
              )}
            </ScrollView>
          ) : (
            <>
              <View style={styles.progressoBox}>
                <Text style={styles.progressoTexto}>
                  {carregandoCd ? 'Consultando estoque da loja e do CD…' : `Formulário do CD de ${dataBr(disp?.cdAtualizadoEm ?? null)} · estoque loja de ${dataBr(disp?.lojaAtualizadaEm ?? null)}`}
                </Text>
                <View style={styles.linha}>
                  <TouchableOpacity onPress={() => { carregarCd(itens); recarregar(); }} disabled={carregandoCd}><Text style={styles.link}>↻ Atualizar</Text></TouchableOpacity>
                </View>
                {disp && doResp.some((i) => ehPedir(i) && !jaNoPedido(i)) && (
                  <TouchableOpacity style={[styles.btnEnviar, { backgroundColor: AZUL }, enviandoPedido && styles.desab]} disabled={enviandoPedido} onPress={() => enviarPedido(doResp.filter(ehPedir))}>
                    <Feather name="shopping-cart" size={16} color={colors.white} />
                    <Text style={styles.btnEnviarTexto}>Enviar ao Pedido CD ({doResp.filter((i) => ehPedir(i) && !jaNoPedido(i)).length})</Text>
                  </TouchableOpacity>
                )}
                {(() => { const r = rodapePedido(pedidoDe(doResp)); return r ? <Text style={styles.pedidoInfo}>{r}</Text> : null; })()}
                {disp && (
                  <TouchableOpacity style={styles.btnEnviar} onPress={() => mandarWhatsApp(textoCd())}>
                    <Feather name="send" size={16} color={colors.white} />
                    <Text style={styles.btnEnviarTexto}>Enviar relatório do CD no WhatsApp</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                  {chip(filtroCd === 'pedir', `🛒 Pedir ao CD (${contaCd('pedir')})`, () => setFiltroCd('pedir'), AZUL)}
                  {chip(filtroCd === 'cd_tem', `CD tem (${contaCd('cd_tem')})`, () => setFiltroCd('cd_tem'), VERDE)}
                  {chip(filtroCd === 'cd_zerado', `CD zerado (${contaCd('cd_zerado')})`, () => setFiltroCd('cd_zerado'), VERMELHO)}
                  {chip(filtroCd === 'fora_cd', `Fora do CD (${contaCd('fora_cd')})`, () => setFiltroCd('fora_cd'), LARANJA)}
                  {contaCd('sem_codigo') > 0 && chip(filtroCd === 'sem_codigo', `Sem código (${contaCd('sem_codigo')})`, () => setFiltroCd('sem_codigo'))}
                  {chip(filtroCd === 'todos', `Todos (${doResp.length})`, () => setFiltroCd('todos'))}
                </ScrollView>
                <Text style={styles.ajuda}>
                  {filtroCd === 'pedir'
                    ? 'Loja zerada ou marcada como ruptura na conferência, e o CD tem: dá para pedir já.'
                    : filtroCd === 'fora_cd'
                      ? 'Não está no último formulário do CD: entrega direta do fornecedor ou fora de linha.'
                      : filtroCd === 'cd_zerado'
                        ? 'Está no formulário do CD, mas sem estoque lá.'
                        : ''}
                </Text>
                <View style={styles.busca}>
                  <Feather name="search" size={15} color={colors.gray400} />
                  <TextInput style={styles.buscaInput} value={busca} onChangeText={setBusca} placeholder="Buscar produto ou código" placeholderTextColor={colors.gray400} />
                </View>
                {carregandoCd && !disp ? <ActivityIndicator color={AZUL} style={{ marginTop: spacing.lg }} /> : null}
                {disp && listaCd.map((i) => {
                  const d = disponibilidadeDe(i, disp);
                  const s = d ? SIT_CD[d.situacao] : null;
                  return (
                    <View key={i.id} style={styles.card}>
                      <View style={styles.cardTopo}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.produto}>{i.produto}</Text>
                          <Text style={styles.meta}>{i.codigo ? `Cód. ${i.codigo}` : 'Sem código'}{!resp ? ` · ${i.responsavel}` : ''}{i.confStatus === 'ruptura' ? ' · ⚠ ruptura na conferência' : ''}</Text>
                          {i.pedidoSolicitacaoId && (() => {
                            const p = pedidos[i.pedidoSolicitacaoId!];
                            const t = !p ? '🛒 No pedido' : p.status === 'pronto' || p.status === 'parou' ? `🛒 Pedido feito ${p.concluidoEm ? new Date(p.concluidoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}` : p.status === 'erro' || p.status === 'cancelada' ? '⚠ Pedido não concluído' : '🛒 Na fila do Assistente ULVA';
                            return <Text style={[styles.meta, { color: AZUL, fontWeight: '700' }]}>{t}</Text>;
                          })()}
                        </View>
                        {s && <Text style={[styles.sit, { color: s.cor, borderColor: s.cor }]}>{s.texto}</Text>}
                      </View>
                      {d && d.situacao !== 'sem_codigo' && (
                        <View style={styles.numeros}>
                          <View style={styles.numero}><Text style={styles.numRotulo}>Loja</Text><Text style={[styles.numValor, (d.estoqueLoja ?? 0) <= 0 && { color: VERMELHO }]}>{qtd(d.estoqueLoja)}</Text></View>
                          <View style={styles.numero}><Text style={styles.numRotulo}>CD</Text><Text style={[styles.numValor, { color: s?.cor }]}>{d.situacao === 'fora_cd' ? '–' : qtd(d.estoqueCd)}</Text></View>
                          <View style={[styles.numero, { flex: 1.4 }]}><Text style={styles.numRotulo}>{d.situacao === 'cd_zerado' ? 'Zerado desde' : 'Embalagem'}</Text><Text style={styles.numValorP}>{d.situacao === 'cd_zerado' ? dataBr(d.zeradoDesde) : d.embalagem ?? '–'}</Text></View>
                        </View>
                      )}
                    </View>
                  );
                })}
                {disp && !listaCd.length && <Text style={styles.vazio}>Nada com esse filtro.</Text>}
              </ScrollView>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  vazio: { color: colors.gray600, textAlign: 'center', marginTop: spacing.lg },
  abas: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  aba: { flex: 1, paddingVertical: 9, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center' },
  abaAtiva: { backgroundColor: '#0E1B2C', borderColor: '#0E1B2C' },
  abaTexto: { fontSize: 13, fontWeight: '800', color: colors.navy900 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, marginRight: 6 },
  chipTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray900 },
  subLista: { fontSize: 12, color: colors.gray600, paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  progressoBox: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  progressoTexto: { fontSize: 13, fontWeight: '700', color: colors.navy900, marginBottom: 6 },
  barraFundo: { height: 6, backgroundColor: colors.gray100, borderRadius: 3, overflow: 'hidden' },
  barra: { height: 6, backgroundColor: VERDE },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  link: { color: AZUL, fontWeight: '800', fontSize: 13 },
  btnEnviar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: VERDE, borderRadius: radius.md, paddingVertical: 11, marginTop: spacing.sm },
  btnEnviarTexto: { color: colors.white, fontWeight: '800', fontSize: 14 },
  busca: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  buscaInput: { flex: 1, paddingVertical: 9, fontSize: 14, color: colors.gray900 },
  ajuda: { fontSize: 12, color: colors.gray600, marginBottom: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, padding: spacing.md, marginBottom: spacing.sm },
  cardTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  produto: { fontSize: 14, fontWeight: '700', color: colors.gray900 },
  meta: { fontSize: 12, color: colors.gray600, marginTop: 2 },
  chipStatus: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm },
  chipStatusTexto: { fontSize: 12, fontWeight: '800' },
  acoes: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.sm },
  btnOk: { flex: 1, backgroundColor: '#DFF3E9', borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  btnOkTexto: { color: colors.green500, fontWeight: '800', fontSize: 14 },
  btnRup: { flex: 1, backgroundColor: '#FBDEDC', borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  btnRupTexto: { color: colors.red500, fontWeight: '800', fontSize: 14 },
  desab: { opacity: 0.5 },
  sit: { fontSize: 11.5, fontWeight: '800', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3 },
  numeros: { flexDirection: 'row', gap: 6, marginTop: spacing.sm },
  numero: { flex: 1, backgroundColor: colors.gray50, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 8 },
  numRotulo: { fontSize: 10.5, color: colors.gray600, fontWeight: '700' },
  numValor: { fontSize: 16, fontWeight: '900', color: colors.navy900 },
  pedidoInfo: { fontSize: 12.5, color: AZUL, fontWeight: '700', marginTop: spacing.sm },
  numValorP: { fontSize: 12.5, fontWeight: '700', color: colors.navy900, marginTop: 2 },
});
