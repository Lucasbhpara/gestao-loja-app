import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, RefreshControl, Alert, Platform, BackHandler } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { colors, radius, spacing } from '../theme/colors';
import {
  RespostaVisita,
  SETORES_VISITA,
  SetorVisita,
  VisitaPergunta,
  VisitaResposta,
  VisitaTecnica,
  buscarPerguntasDoSetor,
  buscarRespostasDaVisita,
  buscarUltimasVisitasPorSetor,
  buscarVisitaEmAndamento,
  buscarVisitasFinalizadas,
  enviarFotoVisita,
  finalizarVisita,
  iniciarVisita,
  nomeDoSetorVisita,
  salvarLocalizacaoVisita,
  salvarRespostaVisita,
} from '../data/visitaTecnicaApi';
import { compartilharVisita } from '../lib/visitaTecnicaPdf';

// Visita Técnica — checklist do Técnico Veterinário (ver visitaTecnicaApi.ts).
// Usada de dois jeitos:
//   - pelo próprio veterinário: o login dele cai direto aqui (App.tsx), sem
//     Home — nesse caso vem `onSair` e o cabeçalho mostra "Sair";
//   - pelo administrador, como mais um tile da Home (vem `onVoltar`).

function faixa(pct: number): { cor: string; fundo: string; texto: string } {
  if (pct >= 90) return { cor: '#2C8F5E', fundo: '#DCF2E7', texto: 'Excelente' };
  if (pct >= 75) return { cor: '#3E9B6E', fundo: '#E3F3EA', texto: 'Bom' };
  if (pct >= 60) return { cor: '#B4650E', fundo: '#FBEBD4', texto: 'Atenção' };
  return { cor: '#C5392F', fundo: '#FBDEDC', texto: 'Crítico' };
}

function dataHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function VisitaTecnicaScreen({
  usuarioNome,
  usuarioMatricula,
  onVoltar,
  onSair,
}: {
  usuarioNome: string;
  usuarioMatricula?: string | null;
  onVoltar?: () => void;
  onSair?: () => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimas, setUltimas] = useState<Map<SetorVisita, VisitaTecnica>>(new Map());
  const [setorAtivo, setSetorAtivo] = useState<SetorVisita | null>(null);
  const [visitaAtiva, setVisitaAtiva] = useState<VisitaTecnica | null>(null);
  const [abrindo, setAbrindo] = useState<SetorVisita | null>(null);
  const [finalizadas, setFinalizadas] = useState<VisitaTecnica[]>([]);
  const [compartilhandoId, setCompartilhandoId] = useState<string | null>(null);

  async function carregar() {
    try {
      setErro(null);
      const [mapa, lista] = await Promise.all([buscarUltimasVisitasPorSetor(), buscarVisitasFinalizadas(30)]);
      setUltimas(mapa);
      setFinalizadas(lista);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui carregar as visitas.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  // Botão físico de voltar do Android: dentro de um setor, volta pra lista.
  // Na lista, quem decide é a tela de fora (Home do admin) — ou, no modo
  // veterinário, deixa o Android fechar o app normalmente.
  useEffect(() => {
    const aoVoltar = () => {
      if (setorAtivo) {
        setSetorAtivo(null);
        setVisitaAtiva(null);
        carregar();
        return true;
      }
      return false;
    };
    const assinatura = BackHandler.addEventListener('hardwareBackPress', aoVoltar);
    return () => assinatura.remove();
  }, [setorAtivo]);

  async function abrirSetor(setor: SetorVisita) {
    setAbrindo(setor);
    try {
      let visita = await buscarVisitaEmAndamento(setor);
      if (!visita) visita = await iniciarVisita(setor, usuarioNome, usuarioMatricula ?? null);
      setVisitaAtiva(visita);
      setSetorAtivo(setor);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui iniciar a visita desse setor.');
    } finally {
      setAbrindo(null);
    }
  }

  async function compartilhar(v: VisitaTecnica) {
    setCompartilhandoId(v.id);
    try {
      await compartilharVisita(v);
    } catch (e: any) {
      Alert.alert('Não consegui gerar o PDF', e?.message ?? 'Tente novamente.');
    } finally {
      setCompartilhandoId(null);
    }
  }

  function confirmarSair() {
    Alert.alert('Sair da conta?', 'Você vai precisar entrar de novo com nome e senha.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: onSair },
    ]);
  }

  if (setorAtivo && visitaAtiva) {
    return (
      <FormularioVisita
        setor={setorAtivo}
        visita={visitaAtiva}
        usuarioNome={usuarioNome}
        onVoltar={() => {
          setSetorAtivo(null);
          setVisitaAtiva(null);
          carregar();
        }}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        {onVoltar ? (
          <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.voltar}>‹ Voltar</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 50 }} />
        )}
        <Text style={styles.titulo}>Visita Técnica</Text>
        {onSair ? (
          <TouchableOpacity onPress={confirmarSair} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.voltar}>Sair</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
        {onSair && <Text style={styles.ola}>Olá, {usuarioNome.split(' ')[0]}!</Text>}
        <Text style={styles.explicacao}>
          Checklist do Técnico Veterinário, baseado no Manual de Boas Práticas e POPs. Escolha o
          setor, responda Sim (conforme), Não ou N/A. Itens marcados como CRÍTICO e com 📷 pedem
          atenção especial. Ao finalizar, cada "Não" vira tarefa para o encarregado do setor.
        </Text>

        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : (
          SETORES_VISITA.map(({ key, nome }) => {
            const ultima = ultimas.get(key);
            const banda = ultima?.aproveitamento != null ? faixa(ultima.aproveitamento) : null;
            return (
              <TouchableOpacity key={key} style={styles.setorCard} onPress={() => abrirSetor(key)} disabled={abrindo === key}>
                <View style={styles.setorTopo}>
                  <Text style={styles.setorNome}>{nome}</Text>
                  {banda && (
                    <View style={[styles.chipBanda, { backgroundColor: banda.fundo }]}>
                      <Text style={[styles.chipBandaTexto, { color: banda.cor }]}>
                        {ultima!.aproveitamento}% · {banda.texto}
                      </Text>
                    </View>
                  )}
                </View>
                {ultima ? (
                  <Text style={styles.setorMeta}>
                    Última visita: {dataHora(ultima.finalizadaEm!)} por {ultima.veterinarioNome}
                    {ultima.naoConformidades ? ` · ${ultima.naoConformidades} não conformidade(s)` : ' · sem não conformidades'}
                    {ultima.criticosNaoConformes ? ` · ${ultima.criticosNaoConformes} crítica(s)` : ''}
                  </Text>
                ) : (
                  <Text style={styles.setorMetaVazio}>Ainda não visitado.</Text>
                )}
                <Text style={styles.setorAcao}>{abrindo === key ? 'Abrindo…' : 'Iniciar / continuar visita ›'}</Text>
              </TouchableOpacity>
            );
          })
        )}

        {!carregando && finalizadas.length > 0 && (
          <>
            <Text style={styles.secaoTitulo}>Visitas finalizadas</Text>
            {finalizadas.map((v) => {
              const banda = faixa(v.aproveitamento ?? 0);
              return (
                <View key={v.id} style={styles.finalizadaCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.finalizadaNome}>{nomeDoSetorVisita(v.setor)}</Text>
                    <Text style={styles.finalizadaMeta}>
                      {v.finalizadaEm ? dataHora(v.finalizadaEm) : '—'} · {v.veterinarioNome}
                    </Text>
                    <Text style={[styles.finalizadaMeta, { color: banda.cor, fontWeight: '700' }]}>
                      {v.aproveitamento ?? 0}% · {v.naoConformidades ?? 0} não conformidade(s)
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.btnCompartilhar} onPress={() => compartilhar(v)} disabled={compartilhandoId === v.id}>
                    {compartilhandoId === v.id ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <Text style={styles.btnCompartilharTexto}>Compartilhar PDF</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// =============================================================================
// Preenchimento da visita de um setor.
// =============================================================================
function FormularioVisita({
  setor,
  visita,
  usuarioNome,
  onVoltar,
}: {
  setor: SetorVisita;
  visita: VisitaTecnica;
  usuarioNome: string;
  onVoltar: () => void;
}) {
  const [perguntas, setPerguntas] = useState<VisitaPergunta[]>([]);
  const [respostas, setRespostas] = useState<Map<string, VisitaResposta>>(new Map());
  const [justificativas, setJustificativas] = useState<Map<string, string>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);
  const [passos, setPassos] = useState<number | null>(null);

  // Pedômetro (mesmo padrão do Checklist de Setor).
  useEffect(() => {
    let inscricao: { remove: () => void } | null = null;
    (async () => {
      try {
        if (!(await Pedometer.isAvailableAsync())) return;
        if (Platform.OS === 'ios') {
          const permissao = await Pedometer.requestPermissionsAsync();
          if (!permissao.granted) return;
        }
        setPassos(0);
        inscricao = Pedometer.watchStepCount((r) => setPassos(r.steps));
      } catch {
        // sem sensor/permissão — segue sem contar passos
      }
    })();
    return () => inscricao?.remove();
  }, []);

  // Localização no início da visita (só se ainda não foi gravada).
  useEffect(() => {
    if (visita.localizacaoLat != null) return;
    (async () => {
      try {
        const permissao = await Location.requestForegroundPermissionsAsync();
        if (!permissao.granted) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        let endereco: string | null = null;
        try {
          const [r] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          if (r) endereco = [r.street, r.subregion || r.city, r.region].filter(Boolean).join(', ');
        } catch {
          // sem endereço legível
        }
        await salvarLocalizacaoVisita(visita.id, { lat: pos.coords.latitude, lng: pos.coords.longitude, endereco });
      } catch {
        // sem GPS/permissão — segue sem localização
      }
    })();
  }, [visita.id]);

  useEffect(() => {
    Promise.all([buscarPerguntasDoSetor(setor), buscarRespostasDaVisita(visita.id)])
      .then(([lista, resp]) => {
        setPerguntas(lista);
        const mapa = new Map<string, VisitaResposta>();
        const just = new Map<string, string>();
        resp.forEach((r) => {
          if (!r.perguntaId) return;
          mapa.set(r.perguntaId, r);
          if (r.justificativa) just.set(r.perguntaId, r.justificativa);
        });
        setRespostas(mapa);
        setJustificativas(just);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar as perguntas.'))
      .finally(() => setCarregando(false));
  }, [visita.id, setor]);

  async function gravar(p: VisitaPergunta, valor: RespostaVisita, fotoUrl: string | null, justificativa: string | null) {
    setSalvandoId(p.id);
    try {
      const nova = await salvarRespostaVisita({ visitaId: visita.id, pergunta: p, resposta: valor, justificativa, fotoUrl });
      setRespostas((prev) => new Map(prev).set(p.id, nova));
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui salvar a resposta.');
    } finally {
      setSalvandoId(null);
    }
  }

  function responder(p: VisitaPergunta, valor: RespostaVisita) {
    const atual = respostas.get(p.id);
    // N/A não guarda foto; Sim/Não mantêm a foto que já tiver sido tirada.
    const foto = valor === 'na' ? null : atual?.fotoUrl ?? null;
    const just = valor === 'nao' ? justificativas.get(p.id) ?? null : null;
    gravar(p, valor, foto, just);
  }

  function salvarJustificativa(p: VisitaPergunta) {
    const atual = respostas.get(p.id);
    if (!atual || atual.resposta !== 'nao') return;
    const texto = (justificativas.get(p.id) ?? '').trim();
    if ((atual.justificativa ?? '') === texto) return;
    gravar(p, 'nao', atual.fotoUrl, texto || null);
  }

  function escolherFoto(p: VisitaPergunta) {
    Alert.alert('Foto', 'Como você quer anexar a foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto agora', onPress: () => capturarFoto(p, 'camera') },
      { text: 'Escolher da galeria', onPress: () => capturarFoto(p, 'galeria') },
    ]);
  }

  async function capturarFoto(p: VisitaPergunta, origem: 'camera' | 'galeria') {
    const atual = respostas.get(p.id);
    if (!atual || atual.resposta === 'na') return;
    let uri: string | null = null;
    if (origem === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Sem permissão', 'Libere o acesso à câmera nas configurações do celular.');
      const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      if (!r.canceled && r.assets?.[0]) uri = r.assets[0].uri;
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return Alert.alert('Sem permissão', 'Libere o acesso às fotos nas configurações do celular.');
      const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!r.canceled && r.assets?.[0]) uri = r.assets[0].uri;
    }
    if (!uri) return;
    setSalvandoId(p.id);
    try {
      const fotoUrl = await enviarFotoVisita(uri);
      const just = atual.resposta === 'nao' ? justificativas.get(p.id) ?? atual.justificativa ?? null : null;
      const nova = await salvarRespostaVisita({ visitaId: visita.id, pergunta: p, resposta: atual.resposta, justificativa: just, fotoUrl });
      setRespostas((prev) => new Map(prev).set(p.id, nova));
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui enviar a foto.');
    } finally {
      setSalvandoId(null);
    }
  }

  // O que ainda impede de finalizar.
  const pendencias = useMemo(() => {
    let semResposta = 0;
    let semJustificativa = 0;
    let semFoto = 0;
    const idsComPendencia = new Set<string>();
    perguntas.forEach((p) => {
      const r = respostas.get(p.id);
      if (!r) {
        semResposta++;
        return;
      }
      if (r.resposta === 'nao' && !(justificativas.get(p.id) ?? r.justificativa ?? '').trim()) {
        semJustificativa++;
        idsComPendencia.add(p.id);
      }
      if (p.fotoObrigatoria && r.resposta !== 'na' && !r.fotoUrl) {
        semFoto++;
        idsComPendencia.add(p.id);
      }
    });
    return { semResposta, semJustificativa, semFoto, idsComPendencia };
  }, [perguntas, respostas, justificativas]);

  const totalRespondidas = perguntas.length - pendencias.semResposta;
  const podeFinalizar =
    perguntas.length > 0 && pendencias.semResposta === 0 && pendencias.semJustificativa === 0 && pendencias.semFoto === 0;

  function textoBotao(): string {
    if (finalizando) return 'Finalizando…';
    if (pendencias.semResposta) return `Faltam ${pendencias.semResposta} pergunta(s)`;
    if (pendencias.semJustificativa) return `Falta observação em ${pendencias.semJustificativa} "Não"`;
    if (pendencias.semFoto) return `Faltam ${pendencias.semFoto} foto(s) obrigatória(s)`;
    return 'Finalizar visita';
  }

  function finalizar() {
    if (!podeFinalizar) return;
    Alert.alert(
      'Finalizar visita',
      `Finalizar a visita de ${nomeDoSetorVisita(setor)}? As não conformidades vão virar tarefa para o ${
        setor === 'geral' ? 'gerente' : 'encarregado do setor'
      }.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: async () => {
            setFinalizando(true);
            try {
              const resultado = await finalizarVisita({
                visitaId: visita.id,
                setor,
                veterinarioNome: usuarioNome,
                passosContados: passos,
                ordemPerguntas: perguntas.map((p) => p.id),
              });
              const resumo =
                `Aproveitamento: ${resultado.aproveitamento}%.\n` +
                (resultado.naoConformidades
                  ? `${resultado.naoConformidades} não conformidade(s)` +
                    (resultado.criticosNaoConformes ? `, ${resultado.criticosNaoConformes} crítica(s)` : '') +
                    ' — tarefa enviada.'
                  : 'Nenhuma não conformidade encontrada. 🎉');
              // Já abre a tela de compartilhar com o PDF (WhatsApp etc.). A
              // visita já está salva — se o PDF falhar, dá pra compartilhar
              // depois pela lista "Visitas finalizadas".
              try {
                await compartilharVisita(resultado);
              } catch (e: any) {
                Alert.alert('Visita salva, mas o PDF falhou', `${e?.message ?? ''}\nCompartilhe depois em "Visitas finalizadas".`);
              }
              Alert.alert('Visita finalizada', resumo, [{ text: 'OK', onPress: onVoltar }]);
            } catch (e: any) {
              setErro(e?.message ?? 'Não consegui finalizar a visita.');
              setFinalizando(false);
            }
          },
        },
      ]
    );
  }

  let grupoAnterior: string | null = null;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>{nomeDoSetorVisita(setor)}</Text>
        <View style={{ width: 50 }} />
      </View>

      {carregando ? (
        <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
      ) : (
        <>
          <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
            <Text style={styles.progresso}>
              {totalRespondidas} de {perguntas.length} respondidas
              {passos !== null ? ` · 🚶 ${passos} passo(s)` : ''}
            </Text>

            {erro && (
              <View style={styles.erroBox}>
                <Text style={styles.erroTexto}>{erro}</Text>
              </View>
            )}

            {perguntas.map((p, i) => {
              const r = respostas.get(p.id);
              const mostrarGrupo = !!p.grupo && p.grupo !== grupoAnterior;
              grupoAnterior = p.grupo;
              const comPendencia = pendencias.idsComPendencia.has(p.id);
              const mostrarFoto = !!r && r.resposta !== 'na' && (p.fotoObrigatoria || r.resposta === 'nao');
              return (
                <View key={p.id}>
                  {mostrarGrupo && <Text style={styles.grupo}>{p.grupo}</Text>}
                  <View style={[styles.perguntaCard, comPendencia && styles.perguntaPendente]}>
                    <View style={styles.tagsLinha}>
                      {p.critico && <Text style={styles.tagCritico}>CRÍTICO</Text>}
                      {p.fotoObrigatoria && <Text style={styles.tagFoto}>📷 foto obrigatória</Text>}
                    </View>
                    <Text style={styles.perguntaTexto}>{i + 1}. {p.texto}</Text>
                    {p.comoVerificar ? <Text style={styles.dica}>🔎 {p.comoVerificar}</Text> : null}
                    {p.baseManual ? <Text style={styles.base}>Base: {p.baseManual}</Text> : null}

                    <View style={styles.chipsWrap}>
                      {(['sim', 'nao', 'na'] as RespostaVisita[]).map((valor) => (
                        <TouchableOpacity
                          key={valor}
                          style={[
                            styles.chip,
                            r?.resposta === valor && (valor === 'nao' ? styles.chipNao : valor === 'na' ? styles.chipNa : styles.chipSim),
                          ]}
                          onPress={() => responder(p, valor)}
                          disabled={salvandoId === p.id}
                        >
                          <Text style={[styles.chipTexto, r?.resposta === valor && styles.chipTextoAtivo]}>
                            {valor === 'sim' ? 'Sim' : valor === 'nao' ? 'Não' : 'N/A'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {r?.resposta === 'nao' && (
                      <View style={styles.caixaExtra}>
                        <Text style={styles.label}>Observação (obrigatória)</Text>
                        <TextInput
                          style={[styles.input, !(justificativas.get(p.id) ?? '').trim() && styles.inputErro]}
                          placeholder="Descreva o que foi encontrado"
                          value={justificativas.get(p.id) ?? ''}
                          onChangeText={(t) => setJustificativas((prev) => new Map(prev).set(p.id, t))}
                          onBlur={() => salvarJustificativa(p)}
                          multiline
                        />
                      </View>
                    )}

                    {mostrarFoto && (
                      <View style={r?.resposta === 'nao' ? undefined : styles.caixaExtra}>
                        {salvandoId === p.id ? (
                          <ActivityIndicator color={colors.navy700} style={{ alignSelf: 'flex-start', marginTop: spacing.sm }} />
                        ) : r?.fotoUrl ? (
                          <View style={styles.fotoLinha}>
                            <Image source={{ uri: r.fotoUrl }} style={styles.foto} />
                            <TouchableOpacity onPress={() => escolherFoto(p)}>
                              <Text style={styles.btnFotoTexto}>📷 Trocar foto</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity style={styles.btnFoto} onPress={() => escolherFoto(p)}>
                            <Text style={[styles.btnFotoTexto, p.fotoObrigatoria && { color: colors.red500 }]}>
                              📷 {p.fotoObrigatoria ? 'Anexar foto (obrigatória)' : 'Anexar foto (opcional)'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.rodape}>
            <TouchableOpacity
              style={[styles.btnFinalizar, (!podeFinalizar || finalizando) && styles.btnFinalizarDesabilitado]}
              onPress={finalizar}
              disabled={!podeFinalizar || finalizando}
            >
              <Text style={[styles.btnFinalizarTexto, !podeFinalizar && { color: colors.gray600 }]}>{textoBotao()}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  voltar: { color: colors.navy700, fontSize: 15, fontWeight: '600' },
  titulo: { fontSize: 16, fontWeight: '700', color: colors.navy900 },
  ola: { fontSize: 18, fontWeight: '700', color: colors.navy900, marginBottom: spacing.sm },
  explicacao: { fontSize: 12.5, color: colors.gray600, lineHeight: 18, marginBottom: spacing.lg },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  setorCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  setorTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  setorNome: { fontSize: 15, fontWeight: '700', color: colors.gray900, flex: 1 },
  setorMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 8, lineHeight: 16 },
  setorMetaVazio: { fontSize: 11.5, color: colors.gray400, marginTop: 8, fontStyle: 'italic' },
  setorAcao: { fontSize: 12.5, color: colors.navy700, fontWeight: '700', marginTop: spacing.md },
  chipBanda: { borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 10 },
  chipBandaTexto: { fontSize: 11, fontWeight: '700' },
  secaoTitulo: { fontSize: 13, fontWeight: '800', color: colors.navy900, marginTop: spacing.xl, marginBottom: spacing.md },
  finalizadaCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  finalizadaNome: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  finalizadaMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  btnCompartilhar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 12, minWidth: 128, alignItems: 'center' },
  btnCompartilharTexto: { color: colors.white, fontSize: 12, fontWeight: '700' },
  progresso: { fontSize: 12, fontWeight: '700', color: colors.navy700, marginBottom: spacing.md },
  grupo: { fontSize: 12, fontWeight: '800', color: colors.navy700, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.sm },
  perguntaCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: 'transparent' },
  perguntaPendente: { borderColor: colors.red500 },
  tagsLinha: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tagCritico: { fontSize: 9.5, fontWeight: '800', color: colors.red500, borderWidth: 1, borderColor: colors.red500, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 6 },
  tagFoto: { fontSize: 9.5, fontWeight: '700', color: colors.gray600, backgroundColor: colors.gray50, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginBottom: 6 },
  perguntaTexto: { fontSize: 13.5, fontWeight: '600', color: colors.gray900, lineHeight: 19 },
  dica: { fontSize: 11.5, color: colors.gray600, marginTop: 6, lineHeight: 16 },
  base: { fontSize: 10.5, color: colors.gray400, marginTop: 3 },
  chipsWrap: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  chip: { flex: 1, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center' },
  chipSim: { backgroundColor: colors.green500, borderColor: colors.green500 },
  chipNao: { backgroundColor: colors.red500, borderColor: colors.red500 },
  chipNa: { backgroundColor: colors.gray600, borderColor: colors.gray600 },
  chipTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  caixaExtra: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray100 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginBottom: 6 },
  input: { backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900, minHeight: 54, textAlignVertical: 'top' },
  inputErro: { borderWidth: 1, borderColor: colors.red500 },
  btnFoto: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  btnFotoTexto: { fontSize: 12, fontWeight: '700', color: colors.navy700 },
  fotoLinha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  foto: { width: 64, height: 64, borderRadius: radius.sm },
  rodape: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray100, padding: spacing.lg },
  btnFinalizar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  btnFinalizarDesabilitado: { backgroundColor: colors.gray100 },
  btnFinalizarTexto: { color: colors.white, fontSize: 14, fontWeight: '700' },
});
