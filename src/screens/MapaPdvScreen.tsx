import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Switch,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import CabecalhoTela from '../components/CabecalhoTela';
import AreaTeclado from '../components/AreaTeclado';
import GeradorImagemPdv from '../components/GeradorImagemPdv';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing } from '../theme/colors';
import { buscarColaboradoresLoja } from '../data/colaboradoresLojaApi';
import { registrarFaltaOuAtestado, removerRegistroEscala } from '../data/escalaApi';
import {
  ModuloEscala,
  RegistroDia,
  PdvCadastro,
  ChamadoPdv,
  DistribuicaoPdv,
  Turno,
  HORARIOS,
  carregarModuloCaixaComEncarregadas,
  buscarRegistros,
  carregarPdvs,
  chamadoAbertoNoDia,
  abrirChamado,
  atualizarChamado,
  resolverChamado,
  buscarDistribuicao,
  salvarDistribuicao,
  limparDistribuicao,
  buscarTurnosDoDia,
  definirTurnoDoDia,
  hoje,
  somarDias,
  diaSemana,
  paraData,
  ddmm,
} from '../data/escala5x2Api';
import {
  PessoaDia,
  Lanes,
  nomeCurto,
  rotuloPdv,
  ordemDoDia,
  distribuicaoDoDia,
  almocoDoDia,
  horariosDoDia,
  assentosNoHorario,
  empacotandoNoDia,
  trocarNoPdv,
} from '../lib/pdvDistribuicao';
import { DadosImagemPdv, gerarImagemNaWeb, compartilharImagem } from '../lib/imagemPdv';
import { rodandoNaWeb } from '../lib/plataforma';

// Mapa dos PDVs (Frente de Caixa · Loja 327) — quem fica em cada um dos 12
// caixas no dia, a partir da Escala 5x2 por grupos. Regras em
// lib/pdvDistribuicao.ts. Usado pela frente de caixa e pela gerência.

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const AZUL = '#2F7BFF';
const MARINHO = '#0E1B2C';
const SOL = '#FFF4D6';
const LUA = '#E6EEFC';
const PERIGO = '#D23C33';
const OPCOES_DIAS = [1, 2, 3, 5, 7, 15];

export default function MapaPdvScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const autor = usuarioAtual?.nome ?? 'Frente de caixa';

  const [data, setData] = useState(hoje());
  const [mod, setMod] = useState<ModuloEscala | null>(null);
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());
  const [pdvs, setPdvs] = useState<PdvCadastro[]>([]);
  const [chamados, setChamados] = useState<ChamadoPdv[]>([]);
  const [registros, setRegistros] = useState<RegistroDia[]>([]);
  const [turnos, setTurnos] = useState<Map<string, Turno>>(new Map());
  const [salva, setSalva] = useState<DistribuicaoPdv[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<'dia' | 'horario'>('dia');
  const [horarioIx, setHorarioIx] = useState(0);
  const [ajustesAbertos, setAjustesAbertos] = useState(false);

  // modal do PDV
  const [pdvAberto, setPdvAberto] = useState<number | null>(null);
  const [selM, setSelM] = useState<string | null>(null);
  const [selT, setSelT] = useState<string | null>(null);
  const [defeito, setDefeito] = useState(false);
  const [numChamado, setNumChamado] = useState('');
  const [problema, setProblema] = useState('');
  const [salvando, setSalvando] = useState(false);

  // modal de falta/atestado
  const [ausAberto, setAusAberto] = useState(false);
  const [ausPessoa, setAusPessoa] = useState<string | null>(null);
  const [ausTipo, setAusTipo] = useState<'falta' | 'atestado'>('falta');
  const [ausDias, setAusDias] = useState(1);
  const [ausObs, setAusObs] = useState('');

  // imagem
  const [dadosImagem, setDadosImagem] = useState<DadosImagemPdv | null>(null);

  const carregarBase = useCallback(async () => {
    const [m, cols, p] = await Promise.all([carregarModuloCaixaComEncarregadas(), buscarColaboradoresLoja(), carregarPdvs()]);
    setMod(m);
    setNomes(new Map(cols.map((c) => [String(c.id), c.nome])));
    setPdvs(p.pdvs);
    setChamados(p.chamados);
    return m;
  }, []);

  const carregarDia = useCallback(async (m: ModuloEscala, d: string) => {
    const ids = m.vagas.map((v) => v.colaboradorLojaId).filter(Boolean) as string[];
    const [r, t, s] = await Promise.all([buscarRegistros(ids, d, d), buscarTurnosDoDia(d), buscarDistribuicao(d)]);
    setRegistros(r);
    setTurnos(t);
    setSalva(s);
  }, []);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    carregarBase()
      .then((m) => (vivo ? carregarDia(m, data) : undefined))
      .then(() => vivo && setErro(null))
      .catch((e) => vivo && setErro(e?.message ?? 'Não consegui carregar o mapa.'))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!mod) return;
    carregarDia(mod, data).catch((e) => setErro(e?.message ?? 'Não consegui carregar o dia.'));
  }, [data]);

  async function recarregar() {
    setAtualizando(true);
    try {
      const m = await carregarBase();
      await carregarDia(m, data);
      setErro(null);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui atualizar.');
    } finally {
      setAtualizando(false);
    }
  }

  // ---------------------------------------------------------------
  // Montagem do dia
  // ---------------------------------------------------------------
  const fechado = useMemo(() => mod?.feriados.find((f) => f.data === data && f.tipo === 'fechada') ?? null, [mod, data]);
  const ausentes = useMemo(() => new Map(registros.map((r) => [r.colaboradorLojaId, r])), [registros]);
  const faltas = registros.filter((r) => r.tipo === 'falta' || r.tipo === 'atestado');
  const letraGrupo = useMemo(() => new Map((mod?.grupos ?? []).map((g) => [g.id, g.letra])), [mod]);

  const pessoas: PessoaDia[] = useMemo(() => {
    if (!mod) return [];
    return mod.vagas
      .filter((v) => v.colaboradorLojaId && v.conta && !ausentes.has(v.colaboradorLojaId))
      .map((v) => {
        const id = v.colaboradorLojaId as string;
        return {
          id,
          nome: nomes.get(id) ?? v.nomePlanilha ?? v.codigo,
          turno: turnos.get(id) ?? v.turno,
          turnoBase: v.turno,
          funcao: v.funcao,
          grupo: letraGrupo.get(v.grupoId) ?? '',
        };
      });
  }, [mod, ausentes, nomes, turnos, letraGrupo]);

  const quebrados = useMemo(() => new Set(pdvs.filter((p) => chamadoAbertoNoDia(chamados, p.numero, data)).map((p) => p.numero)), [pdvs, chamados, data]);
  const indiceDia = Math.round(paraData(data).getTime() / 86400000);
  const { lanes, manual } = useMemo(
    () => distribuicaoDoDia(salva, pessoas, pdvs, quebrados, indiceDia),
    [salva, pessoas, pdvs, quebrados, indiceDia]
  );
  const almoco = useMemo(() => almocoDoDia(pessoas, lanes, pdvs, quebrados, mod?.config.limiteAlmoco ?? 6), [pessoas, lanes, pdvs, quebrados, mod]);
  const domingo = diaSemana(data) === 0;
  const horarios = useMemo(() => horariosDoDia(domingo, almoco), [domingo, almoco]);
  const { obrigatorios } = useMemo(() => ordemDoDia(pdvs, quebrados), [pdvs, quebrados]);
  const empacotando = useMemo(() => empacotandoNoDia(pessoas, lanes), [pessoas, lanes]);
  const nm = (id: string | null) => (id ? nomeCurto(nomes.get(id) ?? pessoas.find((p) => p.id === id)?.nome ?? '?') : '');
  const enc = (t: Turno) => pessoas.filter((p) => p.funcao === 'encarregada' && p.turno === t).map((p) => nomeCurto(p.nome));
  const ops = (t: Turno) => pessoas.filter((p) => p.funcao === 'operadora' && p.turno === t);

  const hIx = Math.min(horarioIx, horarios.length - 1);
  const agora = useMemo(
    () => (aba === 'horario' && horarios[hIx] ? assentosNoHorario(pessoas, lanes, pdvs, quebrados, almoco, horarios[hIx]) : null),
    [aba, horarios, hIx, pessoas, lanes, pdvs, quebrados, almoco]
  );

  // ---------------------------------------------------------------
  // Ações
  // ---------------------------------------------------------------
  function abrirPdv(n: number) {
    setPdvAberto(n);
    setSelM(lanes[n]?.m ?? null);
    setSelT(lanes[n]?.t ?? null);
    const ch = chamadoAbertoNoDia(chamados, n, data);
    setDefeito(!!ch);
    setNumChamado(ch?.chamado ?? '');
    setProblema(ch?.problema ?? '');
  }

  async function salvarPdv() {
    if (pdvAberto == null) return;
    setSalvando(true);
    try {
      const ch = chamadoAbertoNoDia(chamados, pdvAberto, data);
      if (defeito) {
        if (ch) await atualizarChamado(ch.id, numChamado.trim(), problema.trim());
        else await abrirChamado(pdvAberto, numChamado.trim(), problema.trim(), data, autor);
        // A distribuição manual do dia (se tinha) já não vale com o caixa parado.
        await limparDistribuicao(data);
      } else if (ch) {
        await resolverChamado(ch.id, data);
        await limparDistribuicao(data);
      } else {
        let L: Lanes = trocarNoPdv(lanes, pdvAberto, 'm', selM);
        L = trocarNoPdv(L, pdvAberto, 't', selT);
        await salvarDistribuicao(
          data,
          Object.keys(L).map((p) => ({ pdv: Number(p), manha: L[Number(p)].m, tarde: L[Number(p)].t })),
          autor
        );
      }
      setPdvAberto(null);
      await recarregar();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarManha(p: PessoaDia) {
    try {
      await definirTurnoDoDia(data, p.id, p.turno === 'M' && p.turnoBase === 'T' ? null : 'M', autor);
      await limparDistribuicao(data);
      if (mod) await carregarDia(mod, data);
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tente de novo.');
    }
  }

  async function desfazerDia() {
    try {
      await limparDistribuicao(data);
      if (mod) await carregarDia(mod, data);
    } catch (e: any) {
      Alert.alert('Não consegui desfazer', e?.message ?? 'Tente de novo.');
    }
  }

  async function registrarAusencia() {
    if (!ausPessoa) return;
    setSalvando(true);
    try {
      const n = ausTipo === 'falta' ? 1 : ausDias;
      for (let i = 0; i < n; i++) {
        await registrarFaltaOuAtestado({
          colaboradorLojaId: ausPessoa,
          data: somarDias(data, i),
          tipo: ausTipo,
          observacao: [ausObs.trim(), n > 1 ? `Atestado de ${n} dias a partir de ${ddmm(data)}` : ''].filter(Boolean).join(' · ') || null,
          fotoUrl: null,
          registradoPorNome: autor,
        });
      }
      await limparDistribuicao(data);
      setAusAberto(false);
      setAusPessoa(null);
      setAusObs('');
      if (mod) await carregarDia(mod, data);
    } catch (e: any) {
      Alert.alert('Não consegui registrar', e?.message ?? 'Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  async function removerAusencia(r: RegistroDia) {
    try {
      await removerRegistroEscala(r.id);
      await limparDistribuicao(data);
      if (mod) await carregarDia(mod, data);
    } catch (e: any) {
      Alert.alert('Não consegui remover', e?.message ?? 'Tente de novo.');
    }
  }

  function gerarImagem() {
    const d = paraData(data);
    const dados: DadosImagemPdv = {
      titulo: `Caixas de ${DIAS[d.getDay()].toLowerCase()}, ${ddmm(data)}`,
      subtitulo: 'Loja 327 · frente de caixa',
      encManha: enc('M').join(', ') || '—',
      encTarde: enc('T').join(', ') || '—',
      rotuloManha: `MANHÃ ${domingo ? HORARIOS.domingoManha : HORARIOS.manha}`,
      rotuloTarde: `TARDE ${domingo ? HORARIOS.domingoTarde : HORARIOS.tarde}`,
      linhas: [...pdvs]
        .sort((a, b) => a.numero - b.numero)
        .map((p) => {
          const ch = chamadoAbertoNoDia(chamados, p.numero, data);
          return {
            n: p.numero,
            tag: p.tipo === 'preferencial' ? 'PREFERENCIAL' : p.tipo === '15volumes' ? 'ATÉ 15 VOL.' : '',
            obrigatorio: obrigatorios.includes(p.numero),
            manha: nm(lanes[p.numero]?.m ?? null),
            tarde: nm(lanes[p.numero]?.t ?? null),
            quebrado: ch ? `Em manutenção${ch.chamado ? ' · chamado ' + ch.chamado : ''}` : null,
          };
        }),
      empacotando: empacotando.map((p) => nomeCurto(p.nome)).join(', '),
      rodape: `PDV ${obrigatorios.join(' e ')} sempre abertos · ULVA · by Lucas Alberto`,
    };
    if (rodandoNaWeb) {
      compartilharImagem(gerarImagemNaWeb(dados), `pdvs-${data}`).catch((e) => Alert.alert('Não consegui gerar a imagem', e?.message ?? ''));
    } else {
      setDadosImagem(dados);
    }
  }

  // ---------------------------------------------------------------
  // Tela
  // ---------------------------------------------------------------
  const d = paraData(data);
  const tituloDia = `${DIAS[d.getDay()]}, ${ddmm(data)}${data === hoje() ? ' · hoje' : ''}`;

  const cabecalho = (
    <CabecalhoTela titulo="Mapa dos PDVs" subtitulo="Frente de caixa · Loja 327" icone="monitor" onVoltar={onVoltar}>
      <View style={styles.navDia}>
        <TouchableOpacity style={styles.navBtn} onPress={() => setData(somarDias(data, -1))} accessibilityLabel="Dia anterior">
          <Feather name="chevron-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setData(hoje())} style={{ flex: 1 }}>
          <Text style={styles.navTexto}>{tituloDia}</Text>
          {data !== hoje() ? <Text style={styles.navSub}>tocar para voltar para hoje</Text> : null}
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => setData(somarDias(data, 1))} accessibilityLabel="Próximo dia">
          <Feather name="chevron-right" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </CabecalhoTela>
  );

  if (carregando) {
    return (
      <View style={styles.flex}>
        {cabecalho}
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy700} size="large" />
      </View>
    );
  }

  if (erro || !mod) {
    return (
      <View style={styles.flex}>
        {cabecalho}
        <View style={styles.caixaErro}>
          <Text style={styles.erroTexto}>{erro ?? 'Não consegui carregar.'}</Text>
          <TouchableOpacity style={styles.btnPri} onPress={recarregar}>
            <Text style={styles.btnPriTexto}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const cartao = (n: number) => {
    const p = pdvs.find((x) => x.numero === n);
    const ch = chamadoAbertoNoDia(chamados, n, data);
    const obrig = obrigatorios.includes(n);
    if (ch) {
      return (
        <TouchableOpacity key={n} style={[styles.pdv, styles.pdvQuebrado]} onPress={() => abrirPdv(n)}>
          <View style={styles.pdvTopo}>
            <Text style={[styles.pdvNum, { color: PERIGO }]}>{n}</Text>
            <Text style={[styles.pdvTag, { color: PERIGO }]}>Em manutenção</Text>
          </View>
          <View style={{ padding: 10 }}>
            <Text style={styles.pdvNome}>{ch.chamado ? `Chamado ${ch.chamado}` : 'Sem nº de chamado'}</Text>
            <Text style={styles.pdvPapel}>
              desde {ddmm(ch.abertoEm)}
              {ch.problema ? ` · ${ch.problema}` : ''}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
    const topo = (
      <View style={styles.pdvTopo}>
        <Text style={[styles.pdvNum, obrig && { color: AZUL }]}>{n}</Text>
        <Text style={styles.pdvTag}>
          {rotuloPdv(p)}
          {obrig ? (rotuloPdv(p) ? '\n' : '') + 'sempre aberto' : ''}
        </Text>
      </View>
    );
    if (aba === 'horario' && agora) {
      const a = agora.assentos[n];
      return (
        <TouchableOpacity key={n} style={[styles.pdv, !a && styles.pdvFechado, obrig && styles.pdvObrig, obrig && !a && { borderColor: PERIGO }]} onPress={() => abrirPdv(n)}>
          {topo}
          <View style={{ padding: 10, paddingTop: 2 }}>
            {a ? (
              <>
                <Text style={styles.pdvNome}>{nm(a.id)}</Text>
                <Text style={styles.pdvPapel}>{a.papel}</Text>
              </>
            ) : (
              <Text style={styles.pdvVazio}>Fechado</Text>
            )}
          </View>
        </TouchableOpacity>
      );
    }
    const l = lanes[n] ?? { m: null, t: null };
    return (
      <TouchableOpacity key={n} style={[styles.pdv, !l.m && !l.t && styles.pdvFechado, obrig && styles.pdvObrig]} onPress={() => abrirPdv(n)}>
        {topo}
        <View style={[styles.turnoLinha, { backgroundColor: SOL }]}>
          <Text style={styles.turnoRotulo}>Manhã</Text>
          <Text style={l.m ? styles.turnoNome : styles.pdvVazio} numberOfLines={2}>
            {l.m ? nm(l.m) : '—'}
          </Text>
        </View>
        <View style={[styles.turnoLinha, { backgroundColor: LUA }]}>
          <Text style={styles.turnoRotulo}>Tarde</Text>
          <View style={{ flex: 1 }}>
            <Text style={l.t ? styles.turnoNome : styles.pdvVazio} numberOfLines={2}>
              {l.t ? nm(l.t) : '—'}
            </Text>
            {l.m && l.t ? <Text style={styles.pdvPapel}>cobre almoço e assume às 17:20</Text> : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const okObrig = agora ? obrigatorios.every((n) => agora.assentos[n]) : true;
  const abertosAgora = agora ? Object.values(agora.assentos).filter(Boolean).length : 0;
  const pessoasAusencia = mod.vagas.filter((v) => v.colaboradorLojaId && !faltas.some((f) => f.colaboradorLojaId === v.colaboradorLojaId));

  return (
    <View style={styles.flex}>
      {cabecalho}
      <ScrollView contentContainerStyle={styles.conteudo} refreshControl={<RefreshControl refreshing={atualizando} onRefresh={recarregar} />}>
        {fechado ? (
          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Feriado · {fechado.descricao ?? 'loja fechada'}</Text>
            <Text style={styles.cardTexto}>A loja não abre neste dia. Ninguém trabalha.</Text>
          </View>
        ) : (
          <>
            <View style={styles.resumo}>
              <View style={styles.card}>
                <Text style={styles.cardTitulo}>Encarregadas</Text>
                <Text style={styles.cardTexto}>Manhã: {enc('M').join(', ') || <Text style={{ color: PERIGO }}>nenhuma</Text>}</Text>
                <Text style={styles.cardTexto}>Tarde: {enc('T').join(', ') || <Text style={{ color: PERIGO }}>nenhuma</Text>}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitulo}>Operadoras nos caixas</Text>
                <Text style={styles.cardTexto}>
                  {ops('M').length} de manhã · {ops('T').length} de tarde
                </Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitulo}>Almoço</Text>
                {domingo ? (
                  <Text style={styles.cardTexto}>Domingo: 6h com intervalo de 15 min</Text>
                ) : (
                  <>
                    <Text style={styles.cardTexto}>Manhã 12:00 – 13:20</Text>
                    <Text style={styles.cardTexto}>Tarde {almoco.dividido ? 'dividido: 14:00 e 15:20' : '14:00 – 15:20, todas juntas'}</Text>
                  </>
                )}
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitulo}>Empacotando o dia todo</Text>
                <Text style={styles.cardTexto}>{empacotando.map((p) => nomeCurto(p.nome)).join(', ') || '—'}</Text>
              </View>
              {faltas.length ? (
                <View style={[styles.card, styles.cardAviso]}>
                  <Text style={styles.cardTitulo}>Faltas e atestados</Text>
                  {faltas.map((f) => (
                    <Text key={f.id} style={styles.cardTexto}>
                      {nm(f.colaboradorLojaId)} · {f.tipo === 'falta' ? 'Falta' : 'Atestado'}
                    </Text>
                  ))}
                </View>
              ) : null}
              {quebrados.size ? (
                <View style={[styles.card, styles.cardPerigo]}>
                  <Text style={styles.cardTitulo}>Caixas em manutenção</Text>
                  {[...quebrados]
                    .sort((a, b) => a - b)
                    .map((n) => {
                      const ch = chamadoAbertoNoDia(chamados, n, data);
                      return (
                        <Text key={n} style={styles.cardTexto}>
                          PDV {n}
                          {ch?.chamado ? ` · chamado ${ch.chamado}` : ''}
                        </Text>
                      );
                    })}
                </View>
              ) : null}
            </View>

            <TouchableOpacity style={styles.btnPri} onPress={gerarImagem}>
              <Feather name="image" size={16} color={colors.white} />
              <Text style={styles.btnPriTexto}>Gerar imagem para o WhatsApp</Text>
            </TouchableOpacity>

            <View style={styles.abas}>
              {(['dia', 'horario'] as const).map((a) => (
                <TouchableOpacity key={a} style={[styles.aba, aba === a && styles.abaAtiva]} onPress={() => setAba(a)}>
                  <Text style={[styles.abaTexto, aba === a && styles.abaTextoAtivo]}>{a === 'dia' ? 'Plano do dia' : 'Ver por horário'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {aba === 'horario' ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                  {horarios.map((h, i) => (
                    <TouchableOpacity key={h.a} style={[styles.chip, i === hIx && styles.chipAtivo]} onPress={() => setHorarioIx(i)}>
                      <Text style={[styles.chipTitulo, i === hIx && { color: colors.white }]}>
                        {h.a} – {h.b}
                      </Text>
                      <Text style={[styles.chipSub, i === hIx && { color: '#C9D4E2' }]}>{h.rotulo}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={[styles.selo, !okObrig && styles.seloRuim]}>
                  {okObrig ? `PDV ${obrigatorios.join(' e ')} abertos` : `Atenção: PDV ${obrigatorios.filter((n) => !agora?.assentos[n]).join(' e ')} fechado`} · {abertosAgora} abertos
                  {agora?.empacotando.length ? ` · ${agora.empacotando.length} empacotando` : ''}
                </Text>
              </>
            ) : manual ? (
              <Text style={styles.nota}>Este dia tem trocas feitas à mão. Para voltar à distribuição automática, use "Desfazer trocas" nos ajustes.</Text>
            ) : null}

            <View style={styles.grade}>{[...pdvs].sort((a, b) => a.numero - b.numero).map((p) => cartao(p.numero))}</View>
            <Text style={styles.nota}>
              Toque num caixa para trocar a operadora ou marcar defeito. PDV 1 e 12 ficam sempre abertos (com defeito, o 2 ou o 11 assume); os outros abrem intercalados.
            </Text>

            <TouchableOpacity style={styles.ajustesTopo} onPress={() => setAjustesAbertos(!ajustesAbertos)}>
              <Text style={styles.ajustesTitulo}>Ajustes do dia</Text>
              <Feather name={ajustesAbertos ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray600} />
            </TouchableOpacity>
            {ajustesAbertos ? (
              <View style={styles.card}>
                <Text style={styles.secao}>Faltas e atestados</Text>
                {faltas.map((f) => (
                  <View key={f.id} style={styles.linhaPessoa}>
                    <Text style={styles.cardTexto}>
                      {nm(f.colaboradorLojaId)} · {f.tipo === 'falta' ? 'Falta' : 'Atestado'}
                    </Text>
                    <TouchableOpacity style={styles.btnPeq} onPress={() => removerAusencia(f)}>
                      <Text style={styles.btnPeqTexto}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={[styles.btnSec, { marginTop: 6 }]} onPress={() => setAusAberto(true)}>
                  <Feather name="user-x" size={16} color={colors.navy700} />
                  <Text style={styles.btnSecTexto}>Registrar falta ou atestado</Text>
                </TouchableOpacity>

                <Text style={[styles.secao, { marginTop: spacing.lg }]}>Vir de manhã</Text>
                <Text style={styles.nota}>Coloca uma colaboradora da tarde no turno da manhã só neste dia.</Text>
                {pessoas
                  .filter((p) => p.turnoBase === 'T' && p.funcao !== 'embaladora')
                  .sort((a, b) => a.nome.localeCompare(b.nome))
                  .map((p) => (
                    <View key={p.id} style={styles.linhaPessoa}>
                      <Text style={styles.cardTexto}>
                        {nomeCurto(p.nome)}
                        {p.funcao === 'encarregada' ? ' · encarregada' : ''}
                      </Text>
                      <TouchableOpacity style={[styles.btnPeq, p.turno === 'M' && styles.btnPeqAtivo]} onPress={() => alternarManha(p)}>
                        <Text style={[styles.btnPeqTexto, p.turno === 'M' && { color: colors.white }]}>{p.turno === 'M' ? 'Vem de manhã ✓' : 'Vir de manhã'}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                <Text style={[styles.secao, { marginTop: spacing.lg }]}>Trocas do dia</Text>
                <TouchableOpacity style={styles.btnSec} onPress={desfazerDia} disabled={!manual}>
                  <Feather name="rotate-ccw" size={16} color={manual ? colors.navy700 : colors.gray400} />
                  <Text style={[styles.btnSecTexto, !manual && { color: colors.gray400 }]}>Desfazer trocas e voltar à distribuição automática</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* PDV: trocar operadora / defeito */}
      <Modal visible={pdvAberto != null} transparent animationType="slide" onRequestClose={() => setPdvAberto(null)}>
        <AreaTeclado>
          <View style={styles.modalFundo}>
            <View style={styles.modal}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitulo}>
                  PDV {pdvAberto}
                  {pdvAberto != null && rotuloPdv(pdvs.find((p) => p.numero === pdvAberto)) ? ` · ${rotuloPdv(pdvs.find((p) => p.numero === pdvAberto))}` : ''}
                </Text>
                {!defeito ? (
                  <>
                    <Text style={styles.secao}>Manhã · {domingo ? HORARIOS.domingoManha : HORARIOS.manha}</Text>
                    <View style={styles.opcoes}>
                      {[null, ...ops('M').map((p) => p.id)].map((id) => (
                        <TouchableOpacity key={id ?? 'nada'} style={[styles.opcao, selM === id && styles.opcaoAtiva]} onPress={() => setSelM(id)}>
                          <Text style={[styles.opcaoTexto, selM === id && { color: colors.white }]}>{id ? nm(id) : '(ninguém)'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.secao}>Tarde · {domingo ? HORARIOS.domingoTarde : HORARIOS.tarde}</Text>
                    <View style={styles.opcoes}>
                      {[null, ...ops('T').map((p) => p.id)].map((id) => (
                        <TouchableOpacity key={id ?? 'nada'} style={[styles.opcao, selT === id && styles.opcaoAtiva]} onPress={() => setSelT(id)}>
                          <Text style={[styles.opcaoTexto, selT === id && { color: colors.white }]}>{id ? nm(id) : '(ninguém)'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.nota}>Se a pessoa escolhida já estiver em outro caixa, as duas trocam de lugar.</Text>
                  </>
                ) : null}
                <View style={styles.defeito}>
                  <View style={styles.linhaPessoa}>
                    <Text style={styles.secao}>PDV com defeito</Text>
                    <Switch value={defeito} onValueChange={setDefeito} />
                  </View>
                  {defeito ? (
                    <>
                      <Text style={styles.rotulo}>Número do chamado</Text>
                      <TextInput style={styles.input} value={numChamado} onChangeText={setNumChamado} placeholder="Ex.: 458712" placeholderTextColor={colors.gray400} />
                      <Text style={styles.rotulo}>O que aconteceu</Text>
                      <TextInput style={styles.input} value={problema} onChangeText={setProblema} placeholder="Ex.: impressora não imprime" placeholderTextColor={colors.gray400} />
                      <Text style={styles.nota}>O caixa fica fora da escala a partir deste dia até você desligar esta opção, quando o técnico resolver.</Text>
                    </>
                  ) : null}
                </View>
                <View style={styles.linhaBotoes}>
                  <TouchableOpacity style={styles.btnSec} onPress={() => setPdvAberto(null)}>
                    <Text style={styles.btnSecTexto}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnPri, { flex: 1 }]} onPress={salvarPdv} disabled={salvando}>
                    <Text style={styles.btnPriTexto}>{salvando ? 'Salvando…' : 'Salvar'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </AreaTeclado>
      </Modal>

      {/* Falta / atestado */}
      <Modal visible={ausAberto} transparent animationType="slide" onRequestClose={() => setAusAberto(false)}>
        <AreaTeclado>
          <View style={styles.modalFundo}>
            <View style={styles.modal}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitulo}>Falta ou atestado · {ddmm(data)}</Text>
                <Text style={styles.secao}>Quem</Text>
                <View style={styles.opcoes}>
                  {pessoasAusencia
                    .map((v) => v.colaboradorLojaId as string)
                    .sort((a, b) => nm(a).localeCompare(nm(b)))
                    .map((id) => (
                      <TouchableOpacity key={id} style={[styles.opcao, ausPessoa === id && styles.opcaoAtiva]} onPress={() => setAusPessoa(id)}>
                        <Text style={[styles.opcaoTexto, ausPessoa === id && { color: colors.white }]}>{nm(id)}</Text>
                      </TouchableOpacity>
                    ))}
                </View>
                <Text style={styles.secao}>Tipo</Text>
                <View style={styles.opcoes}>
                  {(['falta', 'atestado'] as const).map((t) => (
                    <TouchableOpacity key={t} style={[styles.opcao, ausTipo === t && styles.opcaoAtiva]} onPress={() => setAusTipo(t)}>
                      <Text style={[styles.opcaoTexto, ausTipo === t && { color: colors.white }]}>{t === 'falta' ? 'Falta' : 'Atestado'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {ausTipo === 'atestado' ? (
                  <>
                    <Text style={styles.secao}>Quantos dias (a partir de {ddmm(data)})</Text>
                    <View style={styles.opcoes}>
                      {OPCOES_DIAS.map((n) => (
                        <TouchableOpacity key={n} style={[styles.opcao, ausDias === n && styles.opcaoAtiva]} onPress={() => setAusDias(n)}>
                          <Text style={[styles.opcaoTexto, ausDias === n && { color: colors.white }]}>
                            {n} {n === 1 ? 'dia' : 'dias'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : null}
                <Text style={styles.rotulo}>Observação (opcional)</Text>
                <TextInput style={styles.input} value={ausObs} onChangeText={setAusObs} placeholder="Ex.: avisou por telefone" placeholderTextColor={colors.gray400} />
                <Text style={styles.nota}>
                  A pessoa sai da escala do dia e os caixas são redistribuídos. Faltas e atestados nunca aparecem na imagem do WhatsApp.
                </Text>
                <View style={styles.linhaBotoes}>
                  <TouchableOpacity style={styles.btnSec} onPress={() => setAusAberto(false)}>
                    <Text style={styles.btnSecTexto}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnPri, { flex: 1 }, !ausPessoa && { opacity: 0.5 }]} onPress={registrarAusencia} disabled={!ausPessoa || salvando}>
                    <Text style={styles.btnPriTexto}>{salvando ? 'Salvando…' : 'Registrar'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </AreaTeclado>
      </Modal>

      {dadosImagem ? (
        <GeradorImagemPdv
          dados={dadosImagem}
          onPronto={(url) => {
            setDadosImagem(null);
            compartilharImagem(url, `pdvs-${data}`).catch((e) => Alert.alert('Não consegui compartilhar', e?.message ?? ''));
          }}
          onErro={(m) => {
            setDadosImagem(null);
            Alert.alert('Não consegui gerar a imagem', m);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F3F5F8' },
  conteudo: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  navDia: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  navBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  navTexto: { color: colors.white, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  navSub: { color: '#C9D4E2', fontSize: 12, textAlign: 'center' },
  caixaErro: { padding: spacing.xl, gap: spacing.md },
  erroTexto: { color: PERIGO, fontSize: 15 },
  resumo: { gap: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray100, padding: spacing.md, gap: 2 },
  cardAviso: { backgroundColor: '#FFF7EA', borderColor: '#E9C88F' },
  cardPerigo: { backgroundColor: '#FDF0EF', borderColor: '#EFB4AE' },
  cardTitulo: { fontSize: 12, fontWeight: '700', color: colors.gray600, marginBottom: 2 },
  cardTexto: { fontSize: 15, color: MARINHO, flexShrink: 1 },
  btnPri: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E8E5A', borderRadius: radius.md, minHeight: 48, paddingHorizontal: spacing.lg },
  btnPriTexto: { color: colors.white, fontWeight: '700', fontSize: 15 },
  btnSec: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, minHeight: 46, paddingHorizontal: spacing.md },
  btnSecTexto: { color: colors.navy700, fontWeight: '700', fontSize: 14, flexShrink: 1 },
  abas: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.gray100, marginTop: spacing.sm },
  aba: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  abaAtiva: { borderBottomColor: AZUL },
  abaTexto: { fontWeight: '700', color: colors.gray600, fontSize: 15 },
  abaTextoAtivo: { color: MARINHO },
  chip: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  chipAtivo: { backgroundColor: '#16273D', borderColor: '#16273D' },
  chipTitulo: { fontWeight: '800', color: MARINHO, fontSize: 14 },
  chipSub: { color: colors.gray600, fontSize: 12 },
  selo: { alignSelf: 'flex-start', backgroundColor: '#E8F4EE', color: '#1E8E5A', fontWeight: '700', fontSize: 13, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, overflow: 'hidden' },
  seloRuim: { backgroundColor: '#FBE4E2', color: PERIGO },
  nota: { fontSize: 13, color: colors.gray600 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pdv: { width: '48%', flexGrow: 1, minWidth: 150, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray100, overflow: 'hidden' },
  pdvObrig: { borderWidth: 2, borderColor: AZUL },
  pdvFechado: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  pdvQuebrado: { borderWidth: 2, borderStyle: 'dashed', borderColor: PERIGO, backgroundColor: '#FDF0EF' },
  pdvTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 10, paddingBottom: 6 },
  pdvNum: { fontSize: 26, fontWeight: '900', color: MARINHO },
  pdvTag: { fontSize: 11, fontWeight: '700', color: AZUL, textAlign: 'right', flexShrink: 1, marginLeft: 6 },
  pdvNome: { fontSize: 15, fontWeight: '700', color: MARINHO },
  pdvPapel: { fontSize: 12, color: colors.gray600 },
  pdvVazio: { fontSize: 14, color: colors.gray400, flex: 1 },
  turnoLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7 },
  turnoRotulo: { width: 46, fontSize: 11, fontWeight: '700', color: colors.gray600 },
  turnoNome: { fontSize: 15, fontWeight: '700', color: MARINHO, flex: 1 },
  ajustesTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray100, padding: spacing.md, minHeight: 50 },
  ajustesTitulo: { fontWeight: '800', color: MARINHO, fontSize: 15 },
  secao: { fontWeight: '800', color: MARINHO, fontSize: 14, marginTop: spacing.sm, marginBottom: 4 },
  linhaPessoa: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 4 },
  btnPeq: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.sm, paddingHorizontal: 10, minHeight: 36, justifyContent: 'center' },
  btnPeqAtivo: { backgroundColor: AZUL, borderColor: AZUL },
  btnPeqTexto: { fontSize: 13, fontWeight: '700', color: colors.navy700 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(14,27,44,0.55)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, maxHeight: '88%' },
  modalTitulo: { fontSize: 20, fontWeight: '900', color: MARINHO, marginBottom: spacing.sm },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcao: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.full, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  opcaoAtiva: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  opcaoTexto: { fontSize: 14, color: MARINHO, fontWeight: '600' },
  defeito: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  rotulo: { fontSize: 13, fontWeight: '700', color: colors.gray600, marginTop: spacing.sm, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 46, fontSize: 16, color: MARINHO },
  linhaBotoes: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
});
