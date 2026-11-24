import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Modal, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import CabecalhoTela from '../components/CabecalhoTela';
import AreaTeclado from '../components/AreaTeclado';
import SeletorDataValidade from '../components/SeletorDataValidade';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing } from '../theme/colors';
import { ColaboradorLoja, buscarColaboradoresLoja } from '../data/colaboradoresLojaApi';
import { TipoEscala } from '../data/escalaApi';
import {
  ModuloEscala,
  VagaEscala,
  RegistroDia,
  Turno,
  FuncaoVaga,
  FeriadoEscala,
  SugestaoVaga,
  HORARIOS,
  MESES,
  LETRA_DIA,
  carregarModulo,
  buscarRegistros,
  gerarMes,
  conferirMes,
  sugerirVaga,
  ocuparVaga,
  liberarVaga,
  atualizarVaga,
  salvarFeriado,
  removerFeriado,
  diasDoMes,
  primeiroDoMes,
  somarDias,
  diaSemana,
  grupoFolgaDomingo,
  hoje,
  ddmm,
} from '../data/escala5x2Api';
import { nomeCurto } from '../lib/pdvDistribuicao';
import { compartilharPdf } from '../lib/compartilharPdf';

// Escala 5x2 por grupos (Frente de Caixa · Loja 327) — para a gerência.
// Mostra o mês em grade (como a planilha), o quadro de cada grupo com o
// "-1" quando falta gente, a conferência das regras, e deixa gerar o mês,
// imprimir para o quadro de avisos, colocar colaborador novo numa vaga
// (com o grupo sugerido) e cadastrar feriados. Regras em data/escala5x2Api.ts.

const MARINHO = '#0E1B2C';
const PERIGO = '#D23C33';
const OK = '#1E8E5A';
const FUNCOES: { k: FuncaoVaga; nome: string }[] = [
  { k: 'operadora', nome: 'Operadora' },
  { k: 'encarregada', nome: 'Encarregada' },
  { k: 'embaladora', nome: 'Embaladora' },
];
const SIGLA: Record<TipoEscala, string> = { folga: 'X', folga_feriado: 'F', ferias_licenca_inss: 'FÉR', falta: 'FA', atestado: 'AT' };
const DIAS_NOME = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex'];

function corEscura(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.round(c * 0.45));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export default function Escala5x2Screen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const autor = usuarioAtual?.nome ?? 'Gerência';
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [mod, setMod] = useState<ModuloEscala | null>(null);
  const [colabs, setColabs] = useState<ColaboradorLoja[]>([]);
  const [registros, setRegistros] = useState<RegistroDia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // vaga
  const [vagaAberta, setVagaAberta] = useState<VagaEscala | null>(null);
  const [vColab, setVColab] = useState<string | null>(null);
  const [vTurno, setVTurno] = useState<Turno>('T');
  const [vFuncao, setVFuncao] = useState<FuncaoVaga>('operadora');
  const [vDesde, setVDesde] = useState(hoje());
  const [busca, setBusca] = useState('');

  // novo colaborador
  const [novoAberto, setNovoAberto] = useState(false);
  const [nTurno, setNTurno] = useState<Turno>('T');
  const [nFuncao, setNFuncao] = useState<FuncaoVaga>('operadora');
  const [nColab, setNColab] = useState<string | null>(null);
  const [nDesde, setNDesde] = useState(hoje());

  // feriado
  const [ferAberto, setFerAberto] = useState(false);
  const [fData, setFData] = useState(hoje());
  const [fTipo, setFTipo] = useState<FeriadoEscala['tipo']>('fechada');
  const [fDesc, setFDesc] = useState('');

  const dias = useMemo(() => diasDoMes(ano, mes), [ano, mes]);
  const inicioMes = dias[0];
  const fimMes = dias[dias.length - 1];

  const carregar = useCallback(async () => {
    const [m, c] = await Promise.all([carregarModulo(), buscarColaboradoresLoja()]);
    setMod(m);
    setColabs(c.filter((x) => x.ativo));
    const ids = m.vagas.map((v) => v.colaboradorLojaId).filter(Boolean) as string[];
    setRegistros(await buscarRegistros(ids, somarDias(primeiroDoMes(ano, mes), -7), diasDoMes(ano, mes).slice(-1)[0]));
  }, [ano, mes]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    carregar()
      .then(() => vivo && setErro(null))
      .catch((e) => vivo && setErro(e?.message ?? 'Não consegui carregar a escala.'))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [carregar]);

  async function recarregar() {
    setAtualizando(true);
    try {
      await carregar();
      setErro(null);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui atualizar.');
    } finally {
      setAtualizando(false);
    }
  }

  function mudarMes(delta: number) {
    let m = mes + delta;
    let a = ano;
    if (m < 1) {
      m = 12;
      a -= 1;
    }
    if (m > 12) {
      m = 1;
      a += 1;
    }
    setMes(m);
    setAno(a);
  }

  const nomeDe = useMemo(() => new Map(colabs.map((c) => [String(c.id), c.nome])), [colabs]);
  const reg = useMemo(() => {
    const m = new Map<string, Map<string, TipoEscala>>();
    for (const r of registros) {
      if (!m.has(r.colaboradorLojaId)) m.set(r.colaboradorLojaId, new Map());
      m.get(r.colaboradorLojaId)!.set(r.data, r.tipo);
    }
    return m;
  }, [registros]);
  const gerado = !!mod?.mesesGerados.includes(inicioMes);
  const conferencia = useMemo(() => (mod ? conferirMes(mod, ano, mes, registros) : []), [mod, ano, mes, registros]);
  const problemas = conferencia.filter((c) => !c.ok);
  const fechados = useMemo(() => new Set((mod?.feriados ?? []).filter((f) => f.tipo === 'fechada').map((f) => f.data)), [mod]);

  // Encarregada de manhã e de tarde em todo dia aberto?
  const diasSemEncarregada = useMemo(() => {
    if (!mod) return [] as string[];
    const encs = mod.vagas.filter((v) => v.funcao === 'encarregada' && v.colaboradorLojaId);
    return dias.filter(
      (d) =>
        !fechados.has(d) &&
        (['M', 'T'] as Turno[]).some((t) => !encs.some((v) => v.turno === t && !reg.get(v.colaboradorLojaId as string)?.has(d)))
    );
  }, [mod, dias, reg, fechados]);

  const trabalhandoNoDia = (d: string, t: Turno) =>
    (mod?.vagas ?? []).filter((v) => v.colaboradorLojaId && v.turno === t && !reg.get(v.colaboradorLojaId)?.has(d) && !fechados.has(d)).length;

  const livres = useMemo(() => {
    const ocupados = new Set((mod?.vagas ?? []).map((v) => v.colaboradorLojaId).filter(Boolean) as string[]);
    const q = busca.trim().toLowerCase();
    return colabs
      .filter((c) => !ocupados.has(String(c.id)) && (!q || c.nome.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.setor === 'frente-caixa') - Number(a.setor === 'frente-caixa') || a.nome.localeCompare(b.nome));
  }, [colabs, mod, busca]);

  const sugestao: SugestaoVaga | null = useMemo(() => (mod ? sugerirVaga(mod, nTurno) : null), [mod, nTurno]);

  // ---------------------------------------------------------------
  async function gerar() {
    if (!mod) return;
    const fazer = async () => {
      setTrabalhando(true);
      try {
        const r = await gerarMes(mod, ano, mes, autor);
        await carregar();
        Alert.alert('Escala gerada', `${MESES[mes - 1]} de ${ano}: ${r.folgas} folgas gravadas. Faltas, atestados e férias foram mantidos.`);
      } catch (e: any) {
        Alert.alert('Não consegui gerar', e?.message ?? 'Tente de novo.');
      } finally {
        setTrabalhando(false);
      }
    };
    if (gerado) {
      Alert.alert('Gerar de novo?', 'As folgas deste mês serão refeitas pela regra dos grupos. Faltas, atestados e férias ficam como estão.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Gerar de novo', onPress: fazer },
      ]);
    } else fazer();
  }

  function abrirVaga(v: VagaEscala) {
    setVagaAberta(v);
    setVColab(v.colaboradorLojaId);
    setVTurno(v.turno);
    setVFuncao(v.funcao);
    setVDesde(hoje() > inicioMes ? hoje() : inicioMes);
    setBusca('');
  }

  async function salvarVaga() {
    if (!mod || !vagaAberta) return;
    setTrabalhando(true);
    try {
      const g = mod.grupos.find((x) => x.id === vagaAberta.grupoId)!;
      if (vColab && vColab !== vagaAberta.colaboradorLojaId) {
        if (vagaAberta.colaboradorLojaId) await liberarVaga(vagaAberta, vDesde);
        await ocuparVaga(mod, { vaga: vagaAberta, grupo: g, codigo: vagaAberta.codigo, turno: vTurno, funcao: vFuncao, colaboradorLojaId: vColab, desde: vDesde }, autor);
      } else {
        await atualizarVaga(vagaAberta.id, { turno: vTurno, funcao: vFuncao });
      }
      setVagaAberta(null);
      await carregar();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tente de novo.');
    } finally {
      setTrabalhando(false);
    }
  }

  function liberar() {
    if (!vagaAberta?.colaboradorLojaId) return;
    const v = vagaAberta;
    Alert.alert('Liberar a vaga?', `${nomeCurto(nomeDe.get(v.colaboradorLojaId as string) ?? '')} sai da vaga ${v.codigo} a partir de ${ddmm(vDesde)}. As folgas dela a partir desse dia são apagadas e o grupo passa a mostrar "-1".`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Liberar',
        style: 'destructive',
        onPress: async () => {
          setTrabalhando(true);
          try {
            await liberarVaga(v, vDesde);
            setVagaAberta(null);
            await carregar();
          } catch (e: any) {
            Alert.alert('Não consegui liberar', e?.message ?? 'Tente de novo.');
          } finally {
            setTrabalhando(false);
          }
        },
      },
    ]);
  }

  async function confirmarNovo() {
    if (!mod || !sugestao || !nColab) return;
    setTrabalhando(true);
    try {
      await ocuparVaga(
        mod,
        { vaga: sugestao.vaga, grupo: sugestao.grupo, codigo: sugestao.codigo, turno: nTurno, funcao: nFuncao, colaboradorLojaId: nColab, desde: nDesde },
        autor
      );
      setNovoAberto(false);
      setNColab(null);
      await carregar();
      Alert.alert('Pronto', `Entrou no grupo ${sugestao.grupo.letra}, vaga ${sugestao.codigo}, com as folgas do grupo a partir de ${ddmm(nDesde)}.`);
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tente de novo.');
    } finally {
      setTrabalhando(false);
    }
  }

  async function gravarFeriado() {
    setTrabalhando(true);
    try {
      await salvarFeriado({ data: fData, tipo: fTipo, descricao: fDesc.trim() || null });
      setFerAberto(false);
      setFDesc('');
      await carregar();
      if (gerado && fData >= inicioMes && fData <= fimMes)
        Alert.alert('Feriado salvo', 'Este mês já foi gerado. Toque em "Gerar de novo" para as folgas levarem o feriado em conta.');
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tente de novo.');
    } finally {
      setTrabalhando(false);
    }
  }

  async function apagarFeriado(d: string) {
    try {
      await removerFeriado(d);
      await carregar();
    } catch (e: any) {
      Alert.alert('Não consegui remover', e?.message ?? 'Tente de novo.');
    }
  }

  // ---------------------------------------------------------------
  // Impressão (quadro de avisos)
  // ---------------------------------------------------------------
  async function imprimir() {
    if (!mod) return;
    const cab = dias
      .map((d) => {
        const w = diaSemana(d);
        const fer = fechados.has(d);
        return `<th style="background:${fer ? '#BFBFBF' : w === 0 ? '#FFD54F' : '#FFFF99'}">${Number(d.slice(8))}<br><span style="color:#C00000">${fer ? 'FER' : LETRA_DIA[w]}</span></th>`;
      })
      .join('');
    const blocos = mod.grupos
      .map((g) => {
        const vagas = mod.vagas.filter((v) => v.grupoId === g.id);
        const domFolga = dias.filter((d) => diaSemana(d) === 0 && grupoFolgaDomingo(g, mod.config, d)).map(ddmm).join(', ');
        const ideal = g.idealTarde + g.idealManha;
        const n = vagas.filter((v) => v.colaboradorLojaId).length;
        const titulo = `GRUPO ${g.letra} · domingos de folga: ${domFolga || '—'} · 5x2: ${DIAS_NOME[g.dia1]} + ${DIAS_NOME[g.dia2]} (semana que trabalha domingo) | Dom + ${DIAS_NOME[g.dia2]} (semana que folga domingo) · quadro ${n}/${ideal}${n < ideal ? ` (${n - ideal})` : ''}`;
        const linhas = vagas
          .map((v) => {
            const id = v.colaboradorLojaId;
            const celulas = dias
              .map((d) => {
                const t = id ? reg.get(id)?.get(d) : undefined;
                const fer = fechados.has(d);
                const s = fer ? 'FER' : t ? SIGLA[t] : '';
                const bg = fer ? '#D9D9D9' : t === 'folga' ? g.corForte : t ? '#F4CCCC' : g.cor;
                return `<td style="background:${bg};font-weight:700">${s}</td>`;
              })
              .join('');
            return `<tr><td style="background:${g.cor};font-weight:700">${v.codigo}</td><td style="background:${g.cor}">${v.turno}</td><td style="background:${g.cor};text-align:left;font-weight:700">${id ? nomeDe.get(id) ?? v.nomePlanilha ?? '' : '(vaga aberta)'}</td>${celulas}<td style="background:${g.cor}">${v.turno === 'M' ? HORARIOS.manha : HORARIOS.tarde}</td><td style="background:${g.cor}">${v.funcao === 'operadora' ? '' : v.funcao}</td></tr>`;
          })
          .join('');
        return `<tr><td colspan="${dias.length + 5}" style="background:${corEscura(g.corForte)};color:#fff;text-align:left;font-weight:700">${titulo}</td></tr>${linhas}`;
      })
      .join('');
    const totais = (['M', 'T'] as Turno[])
      .map((t) => `<tr><td colspan="3" style="text-align:left;font-weight:700;background:#E2EFDA">Disponíveis ${t === 'M' ? 'MANHÃ' : 'TARDE'}</td>${dias.map((d) => `<td style="background:#E2EFDA;font-weight:700">${trabalhandoNoDia(d, t)}</td>`).join('')}<td colspan="2" style="background:#E2EFDA"></td></tr>`)
      .join('');
    const html = `<html><head><meta charset="utf-8"><style>
      body{font-family:Arial,Helvetica,sans-serif;margin:14px} h1{font-size:15px;margin:0 0 4px} p{font-size:10px;margin:0 0 8px;color:#444}
      table{border-collapse:collapse;width:100%;font-size:8px} td,th{border:1px solid #999;padding:2px;text-align:center}
      .ass{margin-top:22px;font-size:10px}
    </style></head><body>
      <h1>SUPERMERCADOS BH · LOJA 327 · ESCALA FRENTE DE CAIXA · ${MESES[mes - 1].toUpperCase()} ${ano}</h1>
      <p>X = folga · FER = feriado, loja fechada · FA = falta · AT = atestado · FÉR = férias/licença/INSS · cada cor é um grupo e o grupo folga junto.
      Seg–sáb: manhã ${HORARIOS.manha}, tarde ${HORARIOS.tarde} (1h20 de almoço). Domingo: manhã ${HORARIOS.domingoManha}, tarde ${HORARIOS.domingoTarde}.</p>
      <table><tr><th>VAGA</th><th>T</th><th style="width:150px">NOME</th>${cab}<th>HORÁRIO</th><th>FUNÇÃO</th></tr>${blocos}${totais}</table>
      <div class="ass">Gerente: _______________________________</div>
    </body></html>`;
    try {
      await compartilharPdf(html, `escala-frente-de-caixa-${MESES[mes - 1]}-${ano}`, 'Imprimir escala', { width: 842, height: 595 });
    } catch (e: any) {
      Alert.alert('Não consegui gerar o PDF', e?.message ?? 'Tente de novo.');
    }
  }

  // ---------------------------------------------------------------
  const cabecalho = (
    <CabecalhoTela titulo="Escala 5x2" subtitulo="Frente de Caixa · grupos de folga" icone="calendar" onVoltar={onVoltar}>
      <View style={styles.navMes}>
        <TouchableOpacity style={styles.navBtn} onPress={() => mudarMes(-1)} accessibilityLabel="Mês anterior">
          <Feather name="chevron-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.navTexto}>
          {MESES[mes - 1][0].toUpperCase() + MESES[mes - 1].slice(1)} de {ano}
        </Text>
        <TouchableOpacity style={styles.navBtn} onPress={() => mudarMes(1)} accessibilityLabel="Próximo mês">
          <Feather name="chevron-right" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </CabecalhoTela>
  );

  if (carregando || !mod) {
    return (
      <View style={styles.flex}>
        {cabecalho}
        {erro ? (
          <View style={{ padding: spacing.xl, gap: spacing.md }}>
            <Text style={{ color: PERIGO, fontSize: 15 }}>{erro}</Text>
            <TouchableOpacity style={styles.btnPri} onPress={recarregar}>
              <Text style={styles.btnPriTexto}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy700} size="large" />
        )}
      </View>
    );
  }

  const LARG_NOME = 150;
  const LARG_DIA = 30;
  // linha com os dias do mês (repetida no topo e em cada grupo)
  const linhaDias = (rotulo: string) => (
    <View style={styles.linhaGrade}>
      <Text style={[styles.celCab, { width: LARG_NOME, textAlign: 'left' }]}>{rotulo}</Text>
      {dias.map((d) => {
        const w = diaSemana(d);
        return (
          <View key={d} style={[styles.celDia, { width: LARG_DIA, backgroundColor: fechados.has(d) ? '#BFBFBF' : w === 0 ? '#FFD54F' : '#FFFF99' }]}>
            <Text style={styles.celDiaNum}>{Number(d.slice(8))}</Text>
            <Text style={styles.celDiaLetra}>{fechados.has(d) ? 'FER' : LETRA_DIA[w]}</Text>
          </View>
        );
      })}
    </View>
  );
  // quantas pessoas estão disponíveis em cada dia (sem folga, falta, atestado ou férias), de manhã e à tarde
  const linhasDisponiveis = (['M', 'T'] as Turno[]).map((tu) => (
    <View key={tu} style={styles.linhaGrade}>
      <Text style={[styles.celCab, { width: LARG_NOME, textAlign: 'left', backgroundColor: '#E2EFDA' }]}>Disponíveis {tu === 'M' ? 'manhã' : 'tarde'}</Text>
      {dias.map((d) => (
        <View key={d} style={[styles.cel, { width: LARG_DIA, backgroundColor: '#E2EFDA' }]}>
          <Text style={[styles.celTexto, { fontWeight: '800' }]}>{fechados.has(d) ? '' : trabalhandoNoDia(d, tu)}</Text>
        </View>
      ))}
    </View>
  ));
  const feriadosMes = mod.feriados.filter((f) => f.data >= inicioMes && f.data <= fimMes);

  return (
    <View style={styles.flex}>
      {cabecalho}
      <ScrollView contentContainerStyle={styles.conteudo} refreshControl={<RefreshControl refreshing={atualizando} onRefresh={recarregar} />}>
        <View style={[styles.card, gerado ? styles.cardOk : styles.cardAviso]}>
          <Text style={styles.cardTitulo}>{gerado ? 'Mês gerado' : 'Mês ainda não gerado'}</Text>
          <Text style={styles.cardTexto}>
            {gerado
              ? problemas.length
                ? `${problemas.length} pessoa(s) para revisar na conferência.`
                : 'Conferência: tudo OK (folgas por semana e no máximo 6 dias seguidos).'
              : 'Gere o mês para gravar as folgas de cada grupo. Faltas, atestados e férias não são apagados.'}
          </Text>
          {diasSemEncarregada.length ? (
            <Text style={[styles.cardTexto, { color: PERIGO }]}>Sem encarregada em algum turno: {diasSemEncarregada.map(ddmm).join(', ')}</Text>
          ) : null}
        </View>

        <View style={styles.linhaBotoes}>
          <TouchableOpacity style={[styles.btnPri, { flex: 1 }]} onPress={gerar} disabled={trabalhando}>
            <Feather name="refresh-cw" size={16} color={colors.white} />
            <Text style={styles.btnPriTexto}>{trabalhando ? 'Aguarde…' : gerado ? 'Gerar de novo' : 'Gerar escala do mês'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSec, { flex: 1 }]} onPress={imprimir}>
            <Feather name="printer" size={16} color={colors.navy700} />
            <Text style={styles.btnSecTexto}>Imprimir</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.btnSec} onPress={() => setNovoAberto(true)}>
          <Feather name="user-plus" size={16} color={colors.navy700} />
          <Text style={styles.btnSecTexto}>Colaborador novo</Text>
        </TouchableOpacity>

        {/* Grade do mês */}
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            {linhaDias('Vaga · nome')}
            {linhasDisponiveis}
            {mod.grupos.map((g) => {
              const vagas = mod.vagas.filter((v) => v.grupoId === g.id);
              const ideal = g.idealTarde + g.idealManha;
              const n = vagas.filter((v) => v.colaboradorLojaId).length;
              return (
                <View key={g.id}>
                  <View style={[styles.grupoCab, { backgroundColor: corEscura(g.corForte), width: LARG_NOME + LARG_DIA * dias.length }]}>
                    <Text style={styles.grupoCabTexto}>
                      Grupo {g.letra} · {DIAS_NOME[g.dia1]} + {DIAS_NOME[g.dia2]} | Dom + {DIAS_NOME[g.dia2]}
                    </Text>
                    <Text style={[styles.quadro, n < ideal && styles.quadroRuim]}>
                      Quadro {n}/{ideal}
                      {n < ideal ? ` (${n - ideal})` : ' OK'}
                    </Text>
                  </View>
                  {linhaDias(`Dias · grupo ${g.letra}`)}
                  {vagas.map((v) => {
                    const id = v.colaboradorLojaId;
                    return (
                      <TouchableOpacity key={v.id} style={styles.linhaGrade} onPress={() => abrirVaga(v)}>
                        <View style={[styles.celNome, { width: LARG_NOME, backgroundColor: g.cor }]}>
                          <Text style={styles.celNomeTexto} numberOfLines={1}>
                            {v.codigo} · {v.turno} · {id ? nomeCurto(nomeDe.get(id) ?? v.nomePlanilha ?? '?') : 'vaga aberta'}
                          </Text>
                          {v.funcao !== 'operadora' ? <Text style={styles.celFuncao}>{v.funcao}</Text> : null}
                        </View>
                        {dias.map((d) => {
                          const t = id ? reg.get(id)?.get(d) : undefined;
                          const fer = fechados.has(d);
                          return (
                            <View
                              key={d}
                              style={[styles.cel, { width: LARG_DIA, backgroundColor: fer ? '#D9D9D9' : t === 'folga' ? g.corForte : t === 'folga_feriado' ? '#ECE7FB' : t ? '#F4CCCC' : g.cor }]}
                            >
                              <Text style={[styles.celTexto, t === 'folga_feriado' && !fer && { color: '#5B3FC4' }, t && t !== 'folga' && t !== 'folga_feriado' && !fer && { color: PERIGO }]}>{fer ? '' : t ? SIGLA[t] : ''}</Text>
                            </View>
                          );
                        })}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
            {linhasDisponiveis}
          </View>
        </ScrollView>
        <Text style={styles.nota}>X = folga · F = folga de feriado · FER = feriado (loja fechada) · FA = falta · AT = atestado · FÉR = férias. Toque numa linha para trocar a pessoa da vaga.</Text>

        {/* Conferência */}
        <View style={styles.card}>
          <Text style={styles.secao}>Conferência</Text>
          {!conferencia.length ? (
            <Text style={styles.cardTexto}>Nenhuma vaga ocupada.</Text>
          ) : problemas.length ? (
            problemas.map((c) => (
              <Text key={c.vaga.id} style={[styles.cardTexto, { color: PERIGO }]}>
                {c.vaga.codigo} · {nomeCurto(nomeDe.get(c.vaga.colaboradorLojaId as string) ?? '')}:{' '}
                {c.maiorSequencia > 6 ? `${c.maiorSequencia} dias seguidos` : ''}
                {c.semanas
                  .filter((s) => s.completa && s.folgas < s.esperado)
                  .map((s) => ` semana de ${ddmm(s.segunda)} com ${s.folgas} folga(s)`)
                  .join(',')}
              </Text>
            ))
          ) : (
            <Text style={[styles.cardTexto, { color: OK }]}>Tudo OK: {conferencia.length} pessoas, folgas por semana certas e ninguém passa de 6 dias seguidos.</Text>
          )}
          <Text style={styles.nota}>6x1: pelo menos 1 folga na semana. 5x2: 2 folgas (feriado com loja fechada não conta como folga).</Text>
        </View>

        {/* Feriados */}
        <View style={styles.card}>
          <Text style={styles.secao}>Feriados e datas de pico do mês</Text>
          {feriadosMes.length ? (
            feriadosMes.map((f) => (
              <View key={f.data} style={styles.linhaItem}>
                <Text style={styles.cardTexto}>
                  {ddmm(f.data)} · {f.tipo === 'fechada' ? 'loja fechada' : f.tipo === 'aberta' ? 'feriado, loja aberta' : 'pico (evitar folga)'}
                  {f.descricao ? ` · ${f.descricao}` : ''}
                </Text>
                <TouchableOpacity onPress={() => apagarFeriado(f.data)} accessibilityLabel="Remover">
                  <Feather name="trash-2" size={18} color={colors.gray600} />
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={styles.cardTexto}>Nenhum neste mês.</Text>
          )}
          <TouchableOpacity
            style={[styles.btnSec, { marginTop: 8 }]}
            onPress={() => {
              setFData(inicioMes > hoje() ? inicioMes : hoje());
              setFerAberto(true);
            }}
          >
            <Feather name="plus" size={16} color={colors.navy700} />
            <Text style={styles.btnSecTexto}>Adicionar feriado ou data de pico</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.secao}>Horários</Text>
          <Text style={styles.cardTexto}>Seg–sáb: manhã {HORARIOS.manha} · tarde {HORARIOS.tarde} (8h40 + 1h20 de almoço)</Text>
          <Text style={styles.cardTexto}>Domingo: manhã {HORARIOS.domingoManha} · tarde {HORARIOS.domingoTarde} (6h + 15 min)</Text>
          <Text style={styles.nota}>A tarde entra 08:30 no domingo para ter 11h de descanso depois de sair 21:30 no sábado.</Text>
        </View>
      </ScrollView>

      {/* Vaga */}
      <Modal visible={!!vagaAberta} transparent animationType="slide" onRequestClose={() => setVagaAberta(null)}>
        <AreaTeclado>
          <View style={styles.modalFundo}>
            <View style={styles.modal}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitulo}>Vaga {vagaAberta?.codigo}</Text>
                <Text style={styles.cardTexto}>
                  {vagaAberta?.colaboradorLojaId ? `Hoje: ${nomeDe.get(vagaAberta.colaboradorLojaId) ?? vagaAberta.nomePlanilha ?? ''}` : `Vaga aberta${vagaAberta?.nomePlanilha ? ` (planilha: ${vagaAberta.nomePlanilha})` : ''}`}
                </Text>
                <Text style={styles.secao}>Turno</Text>
                <View style={styles.opcoes}>
                  {(['M', 'T'] as Turno[]).map((t) => (
                    <TouchableOpacity key={t} style={[styles.opcao, vTurno === t && styles.opcaoAtiva]} onPress={() => setVTurno(t)}>
                      <Text style={[styles.opcaoTexto, vTurno === t && { color: colors.white }]}>{t === 'M' ? 'Manhã' : 'Tarde'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.secao}>Função</Text>
                <View style={styles.opcoes}>
                  {FUNCOES.map((f) => (
                    <TouchableOpacity key={f.k} style={[styles.opcao, vFuncao === f.k && styles.opcaoAtiva]} onPress={() => setVFuncao(f.k)}>
                      <Text style={[styles.opcaoTexto, vFuncao === f.k && { color: colors.white }]}>{f.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.secao}>Colaborador da vaga</Text>
                <TextInput style={styles.input} value={busca} onChangeText={setBusca} placeholder="Buscar pelo nome" placeholderTextColor={colors.gray400} />
                <View style={[styles.opcoes, { marginTop: 8 }]}>
                  {vagaAberta?.colaboradorLojaId ? (
                    <TouchableOpacity style={[styles.opcao, vColab === vagaAberta.colaboradorLojaId && styles.opcaoAtiva]} onPress={() => setVColab(vagaAberta.colaboradorLojaId)}>
                      <Text style={[styles.opcaoTexto, vColab === vagaAberta.colaboradorLojaId && { color: colors.white }]}>
                        {nomeCurto(nomeDe.get(vagaAberta.colaboradorLojaId) ?? '')} (atual)
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {livres.slice(0, 30).map((c) => (
                    <TouchableOpacity key={c.id} style={[styles.opcao, vColab === String(c.id) && styles.opcaoAtiva]} onPress={() => setVColab(String(c.id))}>
                      <Text style={[styles.opcaoTexto, vColab === String(c.id) && { color: colors.white }]}>{nomeCurto(c.nome)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.secao}>A partir de</Text>
                <SeletorDataValidade valor={vDesde} onSelecionar={setVDesde} />
                <View style={styles.linhaBotoes}>
                  <TouchableOpacity style={styles.btnSec} onPress={() => setVagaAberta(null)}>
                    <Text style={styles.btnSecTexto}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnPri, { flex: 1 }]} onPress={salvarVaga} disabled={trabalhando}>
                    <Text style={styles.btnPriTexto}>{trabalhando ? 'Salvando…' : 'Salvar'}</Text>
                  </TouchableOpacity>
                </View>
                {vagaAberta?.colaboradorLojaId ? (
                  <TouchableOpacity style={[styles.btnSec, { marginTop: 10, borderColor: '#EFB4AE' }]} onPress={liberar}>
                    <Feather name="user-minus" size={16} color={PERIGO} />
                    <Text style={[styles.btnSecTexto, { color: PERIGO }]}>Liberar vaga (saída)</Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </AreaTeclado>
      </Modal>

      {/* Colaborador novo */}
      <Modal visible={novoAberto} transparent animationType="slide" onRequestClose={() => setNovoAberto(false)}>
        <AreaTeclado>
          <View style={styles.modalFundo}>
            <View style={styles.modal}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitulo}>Colaborador novo</Text>
                <Text style={styles.secao}>Turno</Text>
                <View style={styles.opcoes}>
                  {(['M', 'T'] as Turno[]).map((t) => (
                    <TouchableOpacity key={t} style={[styles.opcao, nTurno === t && styles.opcaoAtiva]} onPress={() => setNTurno(t)}>
                      <Text style={[styles.opcaoTexto, nTurno === t && { color: colors.white }]}>{t === 'M' ? 'Manhã' : 'Tarde'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {sugestao ? (
                  <View style={[styles.card, { backgroundColor: sugestao.grupo.cor, borderColor: sugestao.grupo.corForte, marginTop: 10 }]}>
                    <Text style={styles.cardTitulo}>Sugestão</Text>
                    <Text style={[styles.cardTexto, { fontWeight: '800' }]}>
                      Grupo {sugestao.grupo.letra}, vaga {sugestao.codigo}
                    </Text>
                    <Text style={styles.cardTexto}>
                      Folgas {DIAS_NOME[sugestao.grupo.dia1]} + {DIAS_NOME[sugestao.grupo.dia2]} | Dom + {DIAS_NOME[sugestao.grupo.dia2]}
                    </Text>
                    <Text style={styles.nota}>{sugestao.motivo}</Text>
                  </View>
                ) : null}
                <Text style={styles.secao}>Função</Text>
                <View style={styles.opcoes}>
                  {FUNCOES.map((f) => (
                    <TouchableOpacity key={f.k} style={[styles.opcao, nFuncao === f.k && styles.opcaoAtiva]} onPress={() => setNFuncao(f.k)}>
                      <Text style={[styles.opcaoTexto, nFuncao === f.k && { color: colors.white }]}>{f.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.secao}>Quem (cadastro de colaboradores)</Text>
                <TextInput style={styles.input} value={busca} onChangeText={setBusca} placeholder="Buscar pelo nome" placeholderTextColor={colors.gray400} />
                <View style={[styles.opcoes, { marginTop: 8 }]}>
                  {livres.slice(0, 30).map((c) => (
                    <TouchableOpacity key={c.id} style={[styles.opcao, nColab === String(c.id) && styles.opcaoAtiva]} onPress={() => setNColab(String(c.id))}>
                      <Text style={[styles.opcaoTexto, nColab === String(c.id) && { color: colors.white }]}>{nomeCurto(c.nome)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.nota}>Não achou? Cadastre a pessoa primeiro em Colaboradores (portal ou app).</Text>
                <Text style={styles.secao}>Começa em</Text>
                <SeletorDataValidade valor={nDesde} onSelecionar={setNDesde} />
                <View style={styles.linhaBotoes}>
                  <TouchableOpacity style={styles.btnSec} onPress={() => setNovoAberto(false)}>
                    <Text style={styles.btnSecTexto}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnPri, { flex: 1 }, !nColab && { opacity: 0.5 }]} onPress={confirmarNovo} disabled={!nColab || trabalhando}>
                    <Text style={styles.btnPriTexto}>{trabalhando ? 'Salvando…' : 'Colocar na vaga'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </AreaTeclado>
      </Modal>

      {/* Feriado */}
      <Modal visible={ferAberto} transparent animationType="slide" onRequestClose={() => setFerAberto(false)}>
        <AreaTeclado>
          <View style={styles.modalFundo}>
            <View style={styles.modal}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitulo}>Feriado ou data de pico</Text>
                <Text style={styles.secao}>Dia</Text>
                <SeletorDataValidade valor={fData} onSelecionar={setFData} />
                <Text style={styles.secao}>Tipo</Text>
                <View style={styles.opcoes}>
                  {(
                    [
                      ['fechada', 'Loja fechada'],
                      ['aberta', 'Feriado, loja aberta'],
                      ['pico', 'Pico (evitar folga)'],
                    ] as [FeriadoEscala['tipo'], string][]
                  ).map(([k, nome]) => (
                    <TouchableOpacity key={k} style={[styles.opcao, fTipo === k && styles.opcaoAtiva]} onPress={() => setFTipo(k)}>
                      <Text style={[styles.opcaoTexto, fTipo === k && { color: colors.white }]}>{nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.nota}>
                  Loja fechada: vira FER para todos e não conta como folga. Loja aberta: se cair na folga do grupo, a folga vale normalmente. Pico: a folga do grupo é
                  levada para outro dia da semana.
                </Text>
                <Text style={styles.secao}>Descrição</Text>
                <TextInput style={styles.input} value={fDesc} onChangeText={setFDesc} placeholder="Ex.: Carnaval" placeholderTextColor={colors.gray400} />
                <View style={styles.linhaBotoes}>
                  <TouchableOpacity style={styles.btnSec} onPress={() => setFerAberto(false)}>
                    <Text style={styles.btnSecTexto}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnPri, { flex: 1 }]} onPress={gravarFeriado} disabled={trabalhando}>
                    <Text style={styles.btnPriTexto}>Salvar</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </AreaTeclado>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F3F5F8' },
  conteudo: { padding: spacing.lg, paddingBottom: 48, gap: spacing.md },
  navMes: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  navBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  navTexto: { flex: 1, color: colors.white, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray100, padding: spacing.md, gap: 3 },
  cardOk: { backgroundColor: '#E8F4EE', borderColor: '#B9DFC9' },
  cardAviso: { backgroundColor: '#FFF7EA', borderColor: '#E9C88F' },
  cardTitulo: { fontSize: 12, fontWeight: '700', color: colors.gray600 },
  cardTexto: { fontSize: 15, color: MARINHO },
  secao: { fontWeight: '800', color: MARINHO, fontSize: 14, marginTop: spacing.sm, marginBottom: 4 },
  nota: { fontSize: 13, color: colors.gray600 },
  linhaBotoes: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btnPri: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: OK, borderRadius: radius.md, minHeight: 48, paddingHorizontal: spacing.lg },
  btnPriTexto: { color: colors.white, fontWeight: '700', fontSize: 15 },
  btnSec: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, minHeight: 48, paddingHorizontal: spacing.md },
  btnSecTexto: { color: colors.navy700, fontWeight: '700', fontSize: 14 },
  linhaGrade: { flexDirection: 'row' },
  celCab: { fontSize: 11, fontWeight: '800', color: MARINHO, padding: 4, borderWidth: 0.5, borderColor: '#B8BFCC', backgroundColor: '#FFFF99' },
  celDia: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#B8BFCC', paddingVertical: 2 },
  celDiaNum: { fontSize: 11, fontWeight: '800', color: MARINHO },
  celDiaLetra: { fontSize: 9, fontWeight: '800', color: '#C00000' },
  grupoCab: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  grupoCabTexto: { color: colors.white, fontWeight: '800', fontSize: 12 },
  quadro: { color: colors.white, fontWeight: '800', fontSize: 12 },
  quadroRuim: { backgroundColor: PERIGO, paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden' },
  celNome: { justifyContent: 'center', paddingHorizontal: 6, borderWidth: 0.5, borderColor: '#B8BFCC', minHeight: 30 },
  celNomeTexto: { fontSize: 11, fontWeight: '700', color: MARINHO },
  celFuncao: { fontSize: 9, color: colors.gray600, fontWeight: '700' },
  cel: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#B8BFCC', minHeight: 30 },
  celTexto: { fontSize: 10, fontWeight: '800', color: MARINHO },
  linhaItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: 8 },
  modalFundo: { flex: 1, backgroundColor: 'rgba(14,27,44,0.55)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, maxHeight: '90%' },
  modalTitulo: { fontSize: 20, fontWeight: '900', color: MARINHO, marginBottom: spacing.sm },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcao: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.full, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  opcaoAtiva: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  opcaoTexto: { fontSize: 14, color: MARINHO, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 46, fontSize: 16, color: MARINHO },
});
