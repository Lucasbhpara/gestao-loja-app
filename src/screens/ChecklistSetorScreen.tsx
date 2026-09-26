import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius, spacing } from '../theme/colors';
import { setores, SetorKey } from '../data/employees';
import {
  AvaliacaoPergunta,
  AvaliacaoResposta,
  AvaliacaoSetor,
  RespostaValor,
  SETORES_CHECKLIST,
  buscarAvaliacaoEmAndamento,
  buscarPerguntasAtivas,
  buscarRespostasDaAvaliacao,
  buscarUltimasAvaliacoesPorSetor,
  enviarFotoNaoConformidade,
  finalizarAvaliacao,
  iniciarAvaliacao,
  salvarResposta,
} from '../data/avaliacaoSetorApi';

// Checklist de Setor — avaliação diária de conformidade, só pra gerência
// (quem abre essa tela já é filtrado como admin/gerente lá na Home). Sem
// roteiro fixo: qualquer um dos 6 setores pode ser avaliado em qualquer dia,
// inclusive mais de uma vez. Ao finalizar, gera uma tarefa "muito importante"
// pro encarregado do setor — ver avaliacaoSetorApi.ts / tarefasApi.ts.

function nomeDoSetor(key: SetorKey): string {
  return setores.find((s) => s.key === key)?.nome ?? key;
}

function corDoAproveitamento(pct: number): { cor: string; fundo: string; texto: string } {
  if (pct >= 90) return { cor: '#2C8F5E', fundo: '#DCF2E7', texto: 'Excelente' };
  if (pct >= 75) return { cor: '#3E9B6E', fundo: '#E3F3EA', texto: 'Bom' };
  if (pct >= 60) return { cor: '#B4650E', fundo: '#FBEBD4', texto: 'Atenção' };
  return { cor: '#C5392F', fundo: '#FBDEDC', texto: 'Crítico' };
}

function formatarDataHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function ChecklistSetorScreen({ onVoltar, usuarioNome }: { onVoltar: () => void; usuarioNome: string }) {
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimas, setUltimas] = useState<Map<SetorKey, AvaliacaoSetor>>(new Map());

  const [setorAtivo, setSetorAtivo] = useState<SetorKey | null>(null);
  const [avaliacaoAtiva, setAvaliacaoAtiva] = useState<AvaliacaoSetor | null>(null);
  const [abrindo, setAbrindo] = useState<SetorKey | null>(null);

  async function carregar() {
    try {
      setErro(null);
      const mapa = await buscarUltimasAvaliacoesPorSetor();
      setUltimas(mapa);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui carregar o checklist.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function abrirSetor(setor: SetorKey) {
    setAbrindo(setor);
    try {
      let avaliacao = await buscarAvaliacaoEmAndamento(setor);
      if (!avaliacao) {
        avaliacao = await iniciarAvaliacao(setor, usuarioNome);
      }
      setAvaliacaoAtiva(avaliacao);
      setSetorAtivo(setor);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui iniciar o checklist desse setor.');
    } finally {
      setAbrindo(null);
    }
  }

  if (setorAtivo && avaliacaoAtiva) {
    return (
      <AvaliacaoForm
        setor={setorAtivo}
        avaliacao={avaliacaoAtiva}
        usuarioNome={usuarioNome}
        onVoltar={() => {
          setSetorAtivo(null);
          setAvaliacaoAtiva(null);
          carregar();
        }}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Checklist de Setor</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      >
        <Text style={styles.explicacao}>
          Avalie qualquer setor, em qualquer dia. Ao finalizar, as não conformidades encontradas viram
          automaticamente uma tarefa muito importante para o encarregado do setor resolver com foto.
        </Text>

        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : (
          SETORES_CHECKLIST.map((setor) => {
            const ultima = ultimas.get(setor);
            const banda = ultima?.aproveitamento != null ? corDoAproveitamento(ultima.aproveitamento) : null;
            return (
              <TouchableOpacity
                key={setor}
                style={styles.setorCard}
                onPress={() => abrirSetor(setor)}
                disabled={abrindo === setor}
              >
                <View style={styles.setorTopo}>
                  <Text style={styles.setorNome}>{nomeDoSetor(setor)}</Text>
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
                    Última avaliação: {formatarDataHora(ultima.finalizadaEm!)}
                    {ultima.naoConformidades ? ` · ${ultima.naoConformidades} não conformidade(s)` : ' · sem não conformidades'}
                  </Text>
                ) : (
                  <Text style={styles.setorMetaVazio}>Ainda não avaliado.</Text>
                )}
                <Text style={styles.setorAcao}>{abrindo === setor ? 'Abrindo…' : 'Iniciar checklist ›'}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// =============================================================================
// Formulário de preenchimento (20 perguntas) de uma avaliação em andamento.
// =============================================================================
function AvaliacaoForm({
  setor,
  avaliacao,
  usuarioNome,
  onVoltar,
}: {
  setor: SetorKey;
  avaliacao: AvaliacaoSetor;
  usuarioNome: string;
  onVoltar: () => void;
}) {
  const [perguntas, setPerguntas] = useState<AvaliacaoPergunta[]>([]);
  const [respostas, setRespostas] = useState<Map<string, AvaliacaoResposta>>(new Map());
  const [justificativas, setJustificativas] = useState<Map<string, string>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoPerguntaId, setSalvandoPerguntaId] = useState<string | null>(null);
  const [finalizando, setFinalizando] = useState(false);

  useEffect(() => {
    Promise.all([buscarPerguntasAtivas(), buscarRespostasDaAvaliacao(avaliacao.id)])
      .then(([listaPerguntas, listaRespostas]) => {
        setPerguntas(listaPerguntas);
        const mapa = new Map<string, AvaliacaoResposta>();
        const mapaJustificativas = new Map<string, string>();
        listaRespostas.forEach((r) => {
          if (r.perguntaId) {
            mapa.set(r.perguntaId, r);
            if (r.justificativa) mapaJustificativas.set(r.perguntaId, r.justificativa);
          }
        });
        setRespostas(mapa);
        setJustificativas(mapaJustificativas);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar as perguntas.'))
      .finally(() => setCarregando(false));
  }, [avaliacao.id]);

  async function responder(pergunta: AvaliacaoPergunta, valor: RespostaValor) {
    setSalvandoPerguntaId(pergunta.id);
    try {
      const justificativaAtual = valor === 'nao' ? justificativas.get(pergunta.id) ?? null : null;
      const nova = await salvarResposta({
        avaliacaoId: avaliacao.id,
        perguntaId: pergunta.id,
        perguntaTexto: pergunta.texto,
        resposta: valor,
        justificativa: justificativaAtual,
        fotoUrl: respostas.get(pergunta.id)?.fotoUrl ?? null,
      });
      setRespostas((prev) => new Map(prev).set(pergunta.id, nova));
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui salvar a resposta.');
    } finally {
      setSalvandoPerguntaId(null);
    }
  }

  async function salvarJustificativa(pergunta: AvaliacaoPergunta, texto: string) {
    setJustificativas((prev) => new Map(prev).set(pergunta.id, texto));
    const respostaAtual = respostas.get(pergunta.id);
    if (!respostaAtual || respostaAtual.resposta !== 'nao') return;
    try {
      const nova = await salvarResposta({
        avaliacaoId: avaliacao.id,
        perguntaId: pergunta.id,
        perguntaTexto: pergunta.texto,
        resposta: 'nao',
        justificativa: texto || null,
        fotoUrl: respostaAtual.fotoUrl,
      });
      setRespostas((prev) => new Map(prev).set(pergunta.id, nova));
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui salvar a justificativa.');
    }
  }

  function escolherFoto(pergunta: AvaliacaoPergunta) {
    Alert.alert('Foto da não conformidade', 'Como você quer anexar a foto?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Tirar foto agora', onPress: () => capturarFoto(pergunta, 'camera') },
      { text: 'Escolher da galeria', onPress: () => capturarFoto(pergunta, 'galeria') },
    ]);
  }

  async function capturarFoto(pergunta: AvaliacaoPergunta, origem: 'camera' | 'galeria') {
    let uri: string | null = null;
    if (origem === 'camera') {
      const permissao = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert('Sem permissão', 'Precisa liberar o acesso à câmera nas configurações do celular.');
        return;
      }
      const resultado = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      if (!resultado.canceled && resultado.assets?.[0]) uri = resultado.assets[0].uri;
    } else {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissao.granted) {
        Alert.alert('Sem permissão', 'Precisa liberar o acesso às fotos nas configurações do celular.');
        return;
      }
      const resultado = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!resultado.canceled && resultado.assets?.[0]) uri = resultado.assets[0].uri;
    }
    if (!uri) return;

    setSalvandoPerguntaId(pergunta.id);
    try {
      const fotoUrl = await enviarFotoNaoConformidade(uri);
      const nova = await salvarResposta({
        avaliacaoId: avaliacao.id,
        perguntaId: pergunta.id,
        perguntaTexto: pergunta.texto,
        resposta: 'nao',
        justificativa: justificativas.get(pergunta.id) ?? null,
        fotoUrl,
      });
      setRespostas((prev) => new Map(prev).set(pergunta.id, nova));
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui enviar a foto.');
    } finally {
      setSalvandoPerguntaId(null);
    }
  }

  const totalRespondidas = perguntas.filter((p) => respostas.has(p.id)).length;
  const naoSemJustificativa = perguntas.filter((p) => {
    const r = respostas.get(p.id);
    return r?.resposta === 'nao' && !(justificativas.get(p.id) ?? r.justificativa ?? '').trim();
  });
  const podeFinalizar = perguntas.length > 0 && totalRespondidas === perguntas.length && naoSemJustificativa.length === 0;

  async function finalizar() {
    if (!podeFinalizar) return;
    Alert.alert(
      'Finalizar checklist',
      `Finalizar a avaliação de ${nomeDoSetor(setor)}? Não conformidades encontradas vão virar uma tarefa importante para o encarregado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: async () => {
            setFinalizando(true);
            try {
              const resultado = await finalizarAvaliacao({
                avaliacaoId: avaliacao.id,
                setor,
                nomeSetor: nomeDoSetor(setor),
                gerenteNome: usuarioNome,
              });
              Alert.alert(
                'Checklist finalizado',
                `Aproveitamento: ${resultado.aproveitamento}%.\n` +
                  (resultado.naoConformidades
                    ? `${resultado.naoConformidades} não conformidade(s) — uma tarefa importante foi enviada ao encarregado do setor.`
                    : 'Nenhuma não conformidade encontrada. 🎉'),
                [{ text: 'OK', onPress: onVoltar }]
              );
            } catch (e: any) {
              setErro(e?.message ?? 'Não consegui finalizar o checklist.');
              setFinalizando(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>{nomeDoSetor(setor)}</Text>
        <View style={{ width: 50 }} />
      </View>

      {carregando ? (
        <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
      ) : (
        <>
          <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
            <Text style={styles.progresso}>{totalRespondidas} de {perguntas.length} respondidas</Text>

            {erro && (
              <View style={styles.erroBox}>
                <Text style={styles.erroTexto}>{erro}</Text>
              </View>
            )}

            {perguntas.map((pergunta, i) => {
              const resposta = respostas.get(pergunta.id);
              const ehNao = resposta?.resposta === 'nao';
              const semJustificativa = naoSemJustificativa.some((p) => p.id === pergunta.id);
              return (
                <View key={pergunta.id} style={styles.perguntaCard}>
                  <Text style={styles.perguntaTexto}>{i + 1}. {pergunta.texto}</Text>
                  <View style={styles.chipsWrap}>
                    {(['sim', 'nao', 'na'] as RespostaValor[]).map((valor) => (
                      <TouchableOpacity
                        key={valor}
                        style={[
                          styles.chipResposta,
                          resposta?.resposta === valor && (valor === 'nao' ? styles.chipRespostaNao : styles.chipRespostaAtiva),
                        ]}
                        onPress={() => responder(pergunta, valor)}
                        disabled={salvandoPerguntaId === pergunta.id}
                      >
                        <Text
                          style={[
                            styles.chipRespostaTexto,
                            resposta?.resposta === valor && styles.chipRespostaTextoAtivo,
                          ]}
                        >
                          {valor === 'sim' ? 'Sim' : valor === 'nao' ? 'Não' : 'N/A'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {ehNao && (
                    <View style={styles.naoConformidadeBox}>
                      <Text style={styles.formLabel}>Justificativa (obrigatória)</Text>
                      <TextInput
                        style={[styles.input, semJustificativa && styles.inputErro]}
                        placeholder="Descreva a não conformidade encontrada"
                        value={justificativas.get(pergunta.id) ?? ''}
                        onChangeText={(texto) => setJustificativas((prev) => new Map(prev).set(pergunta.id, texto))}
                        onBlur={() => salvarJustificativa(pergunta, justificativas.get(pergunta.id) ?? '')}
                        multiline
                      />
                      <TouchableOpacity style={styles.btnFoto} onPress={() => escolherFoto(pergunta)}>
                        <Text style={styles.btnFotoTexto}>
                          {resposta?.fotoUrl ? '📷 Foto anexada — trocar' : '📷 Anexar foto da não conformidade'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
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
              <Text style={styles.btnFinalizarTexto}>
                {finalizando ? 'Finalizando…' : podeFinalizar ? 'Finalizar checklist' : 'Responda todas as perguntas'}
              </Text>
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
  explicacao: { fontSize: 12.5, color: colors.gray600, lineHeight: 18, marginBottom: spacing.lg },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  setorCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  setorTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  setorNome: { fontSize: 15, fontWeight: '700', color: colors.gray900, flex: 1 },
  setorMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 8 },
  setorMetaVazio: { fontSize: 11.5, color: colors.gray400, marginTop: 8, fontStyle: 'italic' },
  setorAcao: { fontSize: 12.5, color: colors.navy700, fontWeight: '700', marginTop: spacing.md },
  chipBanda: { borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 10 },
  chipBandaTexto: { fontSize: 11, fontWeight: '700' },
  progresso: { fontSize: 12, fontWeight: '700', color: colors.navy700, marginBottom: spacing.lg },
  perguntaCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  perguntaTexto: { fontSize: 13.5, fontWeight: '600', color: colors.gray900, lineHeight: 19, marginBottom: spacing.md },
  chipsWrap: { flexDirection: 'row', gap: 8 },
  chipResposta: { flex: 1, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center' },
  chipRespostaAtiva: { backgroundColor: colors.green500, borderColor: colors.green500 },
  chipRespostaNao: { backgroundColor: colors.red500, borderColor: colors.red500 },
  chipRespostaTexto: { fontSize: 12.5, fontWeight: '700', color: colors.gray600 },
  chipRespostaTextoAtivo: { color: colors.white },
  naoConformidadeBox: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.gray100 },
  formLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginBottom: 6 },
  input: { backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900, minHeight: 54, textAlignVertical: 'top' },
  inputErro: { borderWidth: 1, borderColor: colors.red500 },
  btnFoto: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  btnFotoTexto: { fontSize: 12, fontWeight: '700', color: colors.navy700 },
  rodape: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray100, padding: spacing.lg },
  btnFinalizar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  btnFinalizarDesabilitado: { backgroundColor: colors.gray100 },
  btnFinalizarTexto: { color: colors.white, fontSize: 14, fontWeight: '700' },
});
