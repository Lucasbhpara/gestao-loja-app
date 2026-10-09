import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import SeletorDataValidade from './SeletorDataValidade';
import {
  CORES_SITUACAO,
  DOCUMENTOS_VALIDADE,
  ValidadeDocumento,
  buscarValidades,
  salvarValidade,
  situacaoDoc,
  textoSituacao,
} from '../data/documentosValidadeApi';

// Validade dos documentos da unidade.
//  - modo "editar": gaveta dentro do formulário de Geral e Documentos, com
//    o calendário pra escolher a data de cada documento.
//  - modo "resumo": cartão no painel da unidade, mostrando só o que precisa
//    de atenção (vencido, vencendo em até 60 dias ou sem data).
export default function ValidadeDocumentosCard({
  unidade,
  usuarioNome,
  modo,
}: {
  unidade: string;
  usuarioNome: string;
  modo: 'editar' | 'resumo';
}) {
  const [validades, setValidades] = useState<Map<string, ValidadeDocumento>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [offline, setOffline] = useState(false);
  const [aberto, setAberto] = useState(modo === 'editar');

  const carregar = useCallback(async () => {
    const r = await buscarValidades(unidade);
    setValidades(r.lista);
    setOffline(r.offline);
    setCarregando(false);
  }, [unidade]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function escolher(documento: string, iso: string) {
    if (!iso) return;
    setValidades((prev) => {
      const n = new Map(prev);
      n.set(documento, { documento, dataValidade: iso, atualizadoPor: usuarioNome, atualizadoEm: null, pendente: true });
      return n;
    });
    await salvarValidade(unidade, documento, iso, usuarioNome);
    carregar();
  }

  const docs = DOCUMENTOS_VALIDADE.map((d) => ({ nome: d, v: validades.get(d), s: situacaoDoc(validades.get(d)) }));
  const contagem = {
    vencidos: docs.filter((d) => d.s === 'vencido').length,
    vencendo: docs.filter((d) => d.s === 'critico' || d.s === 'atencao').length,
    semData: docs.filter((d) => d.s === 'sem_data').length,
  };
  const comData = docs.length - contagem.semData;
  const pendentes = docs.filter((d) => d.v?.pendente).length;

  const subtitulo = carregando
    ? 'Carregando…'
    : [
        contagem.vencidos ? `${contagem.vencidos} vencido${contagem.vencidos > 1 ? 's' : ''}` : null,
        contagem.vencendo ? `${contagem.vencendo} vencendo` : null,
        contagem.semData ? `${contagem.semData} sem data` : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'Todos em dia';
  const corSub = contagem.vencidos ? colors.red500 : contagem.vencendo ? '#B4650E' : contagem.semData ? colors.gray600 : colors.green500;

  if (modo === 'resumo') {
    const atencao = docs.filter((d) => d.s !== 'ok');
    return (
      <View style={styles.cartao}>
        <TouchableOpacity style={styles.cabecalho} onPress={() => setAberto((v) => !v)} activeOpacity={0.8}>
          <View style={[styles.icone, { backgroundColor: contagem.vencidos ? '#FBE4E2' : contagem.vencendo ? '#FBEBD4' : '#E3E7F5' }]}>
            <Feather name="file-text" size={18} color={contagem.vencidos ? colors.red500 : contagem.vencendo ? '#B4650E' : colors.navy700} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>Documentos da loja {unidade}</Text>
            <Text style={[styles.sub, { color: corSub, fontWeight: '700' }]}>{subtitulo}</Text>
          </View>
          {carregando ? <ActivityIndicator color={colors.navy700} /> : <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray600} />}
        </TouchableOpacity>
        {aberto && !carregando && (
          <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
            {atencao.length === 0 ? (
              <Text style={styles.ajuda}>Todos os documentos com mais de 60 dias de validade. 👍</Text>
            ) : (
              atencao.map((d) => (
                <View key={d.nome} style={styles.linhaResumo}>
                  <Text style={styles.docNome} numberOfLines={1}>{d.nome}</Text>
                  <View style={[styles.selo, { backgroundColor: CORES_SITUACAO[d.s].fundo }]}>
                    <Text style={[styles.seloTexto, { color: CORES_SITUACAO[d.s].cor }]}>{textoSituacao(d.v)}</Text>
                  </View>
                </View>
              ))
            )}
            <Text style={[styles.ajuda, { marginTop: spacing.sm }]}>
              As datas são preenchidas em “Geral e Documentos”. Você recebe aviso com 60, 30 e 15 dias.
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.cartao}>
      <TouchableOpacity style={styles.cabecalho} onPress={() => setAberto((v) => !v)} activeOpacity={0.8}>
        <View style={[styles.icone, { backgroundColor: '#E3E7F5' }]}>
          <Feather name="calendar" size={18} color={colors.navy700} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Validade dos documentos</Text>
          <Text style={styles.sub}>
            {comData}/{docs.length} com data · <Text style={{ color: corSub, fontWeight: '700' }}>{subtitulo}</Text>
          </Text>
        </View>
        <Feather name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray600} />
      </TouchableOpacity>

      {aberto && (
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
          <View style={styles.aviso}>
            <Feather name="bell" size={14} color={colors.navy700} />
            <Text style={styles.avisoTexto}>
              Toque na data para abrir o calendário. Você recebe notificação quando faltar 60, 30 e 15 dias para vencer.
            </Text>
          </View>
          {carregando ? (
            <ActivityIndicator color={colors.navy700} style={{ marginVertical: spacing.lg }} />
          ) : (
            docs.map((d) => (
              <View key={d.nome} style={styles.docCard}>
                <View style={styles.docTopo}>
                  <Text style={styles.docNome}>{d.nome}</Text>
                  <View style={[styles.selo, { backgroundColor: CORES_SITUACAO[d.s].fundo }]}>
                    <Text style={[styles.seloTexto, { color: CORES_SITUACAO[d.s].cor }]}>{textoSituacao(d.v)}</Text>
                  </View>
                </View>
                <Text style={styles.rotulo}>Vencimento</Text>
                <SeletorDataValidade valor={d.v?.dataValidade ?? ''} onSelecionar={(iso) => escolher(d.nome, iso)} />
                {d.v ? (
                  <Text style={styles.meta}>
                    {d.v.pendente ? '☁ salvo no celular · sobe quando tiver internet' : d.v.atualizadoPor ? `Atualizado por ${d.v.atualizadoPor}` : ''}
                  </Text>
                ) : null}
              </View>
            ))
          )}
          {offline && !carregando ? (
            <Text style={[styles.ajuda, { marginTop: spacing.sm }]}>
              Sem conexão com o banco agora{pendentes ? ` · ${pendentes} data(s) esperando para subir` : ''}.
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: { backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.md, overflow: 'hidden' },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  icone: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 14.5, fontWeight: '700', color: colors.gray900 },
  sub: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  aviso: { flexDirection: 'row', gap: 8, backgroundColor: '#E3E7F5', borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md },
  avisoTexto: { flex: 1, fontSize: 11.5, color: colors.navy700, lineHeight: 16 },
  docCard: { borderTopWidth: 1, borderTopColor: colors.gray100, paddingTop: spacing.md, marginTop: spacing.sm },
  docTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  docNome: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  rotulo: { fontSize: 10.5, fontWeight: '700', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  selo: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  seloTexto: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 11, color: colors.gray400, marginTop: 4 },
  ajuda: { fontSize: 11.5, color: colors.gray600, lineHeight: 16 },
  linhaResumo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.gray100 },
});
