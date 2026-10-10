import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import CabecalhoTela from '../components/CabecalhoTela';
import {
  CATEGORIAS_USO_CONSUMO,
  UNIDADES_USO_CONSUMO,
  SETORES_RETIRADA,
  ItemUsoConsumo,
  RetiradaUsoConsumo,
  buscarItensUsoConsumo,
  buscarRetiradas,
  registrarRetirada,
  registrarContagem,
  excluirRetirada,
  salvarItem,
  situacaoSaldo,
  formatarQtd,
  formatarDataHora,
  nomeSetorPadrao,
} from '../data/usoConsumoApi';

// Uso e Consumo: qualquer colaborador registra a retirada de material
// (quem, setor, quantidade). Administrador também conta o estoque, cadastra
// itens e vê o consumo por setor. Ver usoConsumoApi.ts.

type Aba = 'retirar' | 'estoque' | 'consumo';

const numero = (t: string): number | null => {
  const v = Number(t.replace(/\./g, '').replace(',', '.'));
  return t.trim() === '' || !isFinite(v) ? null : v;
};
const reais = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COR_SITUACAO = {
  sem_contagem: { cor: colors.gray600, fundo: colors.gray100, texto: 'Sem contagem' },
  zerado: { cor: colors.red500, fundo: '#FBDEDC', texto: 'Zerado' },
  baixo: { cor: '#B4650E', fundo: '#FBEBD4', texto: 'Estoque baixo' },
  ok: { cor: colors.green500, fundo: '#DFF3E9', texto: 'OK' },
};

export default function UsoConsumoScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  const admin = !!usuarioAtual?.isAdmin;
  const [aba, setAba] = useState<Aba>('retirar');
  const [itens, setItens] = useState<ItemUsoConsumo[]>([]);
  const [retiradas, setRetiradas] = useState<RetiradaUsoConsumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);

  // Modais
  const [retirando, setRetirando] = useState<ItemUsoConsumo | null>(null);
  const [qtdRetirada, setQtdRetirada] = useState('1');
  const [setorRetirada, setSetorRetirada] = useState(nomeSetorPadrao(usuarioAtual?.setor));
  const [obsRetirada, setObsRetirada] = useState('');
  const [contando, setContando] = useState<ItemUsoConsumo | null>(null);
  const [qtdContada, setQtdContada] = useState('');
  const [editando, setEditando] = useState<Partial<ItemUsoConsumo> | null>(null);
  const [salvando, setSalvando] = useState(false);

  const meuSetor = nomeSetorPadrao(usuarioAtual?.setor);
  const desde30 = useMemo(() => new Date(Date.now() - 30 * 86400000).toISOString(), []);

  function carregar() {
    Promise.all([
      buscarItensUsoConsumo(),
      buscarRetiradas({ desde: desde30, setor: admin ? undefined : meuSetor, limite: 1000 }),
    ])
      .then(([i, r]) => {
        setItens(i);
        setRetiradas(r);
        setErro(null);
      })
      .catch((e) =>
        setErro(
          /uso_consumo/.test(e?.message ?? '')
            ? 'A base do Uso e Consumo ainda não foi criada no Supabase (schema_uso_consumo.sql).'
            : e?.message ?? 'Não consegui carregar.',
        ),
      )
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(carregar, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens.filter(
      (i) =>
        (!categoria || i.categoria === categoria) &&
        (!termo || i.nome.toLowerCase().includes(termo) || (i.codigo ?? '').includes(termo)),
    );
  }, [itens, busca, categoria]);

  const categoriasComItens = useMemo(
    () => CATEGORIAS_USO_CONSUMO.filter((c) => itens.some((i) => i.categoria === c)),
    [itens],
  );

  // ---- ações ----
  function abrirRetirada(i: ItemUsoConsumo) {
    setRetirando(i);
    setQtdRetirada('1');
    setSetorRetirada(meuSetor);
    setObsRetirada('');
  }

  async function confirmarRetirada() {
    if (!retirando || !usuarioAtual) return;
    const q = numero(qtdRetirada);
    if (!q || q <= 0) {
      Alert.alert('Quantidade', 'Informe quantos você está retirando.');
      return;
    }
    setSalvando(true);
    try {
      await registrarRetirada({
        itemId: retirando.id,
        quantidade: q,
        setor: setorRetirada,
        retiradoPor: usuarioAtual.nome,
        matricula: usuarioAtual.matricula ? String(usuarioAtual.matricula) : null,
        observacao: obsRetirada.trim() || null,
      });
      setRetirando(null);
      Alert.alert('Retirada registrada', `${formatarQtd(q)} ${retirando.unidade} de ${retirando.nome} para ${setorRetirada}.`);
      carregar();
    } catch (e: any) {
      Alert.alert('Não consegui registrar', e?.message ?? 'Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarContagem() {
    if (!contando || !usuarioAtual) return;
    const q = numero(qtdContada);
    if (q === null || q < 0) {
      Alert.alert('Quantidade', 'Informe a quantidade contada (pode ser 0).');
      return;
    }
    setSalvando(true);
    try {
      await registrarContagem(contando.id, q, usuarioAtual.nome);
      setContando(null);
      carregar();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarItem() {
    if (!editando || !usuarioAtual) return;
    if (!editando.nome?.trim()) {
      Alert.alert('Nome', 'Dê um nome para o item.');
      return;
    }
    setSalvando(true);
    try {
      const id = await salvarItem({
        id: editando.id,
        codigo: editando.codigo ?? null,
        nome: editando.nome,
        unidade: editando.unidade ?? 'UN',
        categoria: editando.categoria ?? 'Outros',
        custo: editando.custo ?? null,
        estoqueMinimo: editando.estoqueMinimo ?? null,
        ativo: editando.ativo,
        por: usuarioAtual.nome,
      });
      // Cadastro novo com quantidade já contada
      const inicial = (editando as any).contagemInicial as string | undefined;
      if (!editando.id && inicial && numero(inicial) !== null) await registrarContagem(id, numero(inicial)!, usuarioAtual.nome);
      setEditando(null);
      carregar();
    } catch (e: any) {
      Alert.alert('Não consegui salvar', /duplicate|unique/i.test(e?.message ?? '') ? 'Já existe um item com esse código.' : e?.message ?? 'Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  function apagarRetirada(r: RetiradaUsoConsumo) {
    Alert.alert('Excluir retirada?', `${formatarQtd(r.quantidade)} ${r.unidade} de ${r.itemNome} (${r.setor}).`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => excluirRetirada(r.id).then(carregar).catch((e) => Alert.alert('Erro', e?.message ?? '')),
      },
    ]);
  }

  // ---- resumos ----
  const porSetor = useMemo(() => {
    const m: Record<string, { qtd: number; valor: number; itens: Record<string, number> }> = {};
    retiradas.forEach((r) => {
      const s = (m[r.setor] = m[r.setor] || { qtd: 0, valor: 0, itens: {} });
      s.qtd += 1;
      s.valor += r.quantidade * (r.custo ?? 0);
      s.itens[r.itemNome] = (s.itens[r.itemNome] || 0) + r.quantidade;
    });
    return Object.entries(m).sort((a, b) => b[1].valor - a[1].valor || b[1].qtd - a[1].qtd);
  }, [retiradas]);
  const totalValor30 = porSetor.reduce((s, [, v]) => s + v.valor, 0);
  const qtdAlerta = itens.filter((i) => ['zerado', 'baixo'].includes(situacaoSaldo(i))).length;
  const qtdSemContagem = itens.filter((i) => i.saldo === null).length;

  const abas: { k: Aba; rotulo: string }[] = admin
    ? [
        { k: 'retirar', rotulo: 'Retirar' },
        { k: 'estoque', rotulo: 'Estoque' },
        { k: 'consumo', rotulo: 'Consumo' },
      ]
    : [
        { k: 'retirar', rotulo: 'Retirar' },
        { k: 'consumo', rotulo: 'Retiradas do setor' },
      ];

  const listaItens = (modo: 'retirar' | 'estoque') =>
    filtrados.map((i) => {
      const sit = COR_SITUACAO[situacaoSaldo(i)];
      return (
        <View key={i.id} style={styles.card}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardNome}>{i.nome}</Text>
              <Text style={styles.cardMeta}>
                {i.categoria} · {i.unidade}
                {i.codigo ? ` · cód. ${i.codigo}` : ''}
              </Text>
            </View>
            <View style={[styles.chip, { backgroundColor: sit.fundo }]}>
              <Text style={[styles.chipTexto, { color: sit.cor }]}>
                {i.saldo === null ? sit.texto : `${formatarQtd(i.saldo)} ${i.unidade}`}
              </Text>
            </View>
          </View>
          {modo === 'estoque' ? (
            <>
              <Text style={styles.cardInfo}>
                {i.contadoEm
                  ? `Última contagem: ${formatarQtd(i.ultimaContagem ?? 0)} em ${formatarDataHora(i.contadoEm)}${i.contadoPor ? ` (${i.contadoPor})` : ''}`
                  : 'Ainda não foi contado'}
                {'\n'}Retirado nos últimos 30 dias: {formatarQtd(i.retirado30d)} {i.unidade}
                {i.estoqueMinimo != null ? ` · mínimo ${formatarQtd(i.estoqueMinimo)}` : ''}
              </Text>
              <View style={styles.cardBotoes}>
                <TouchableOpacity
                  style={styles.btnPrimario}
                  onPress={() => {
                    setContando(i);
                    setQtdContada('');
                  }}
                >
                  <Feather name="hash" size={14} color={colors.white} />
                  <Text style={styles.btnPrimarioTexto}>Contar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSecundario} onPress={() => abrirRetirada(i)}>
                  <Text style={styles.btnSecundarioTexto}>Retirar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSecundario} onPress={() => setEditando({ ...i })}>
                  <Text style={styles.btnSecundarioTexto}>Editar</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity style={[styles.btnPrimario, { marginTop: spacing.md, alignSelf: 'stretch', justifyContent: 'center' }]} onPress={() => abrirRetirada(i)}>
              <Feather name="log-out" size={14} color={colors.white} />
              <Text style={styles.btnPrimarioTexto}>Registrar retirada</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    });

  return (
    <View style={styles.flex}>
      <CabecalhoTela
        titulo="Uso e Consumo"
        subtitulo={admin ? 'Retiradas por setor e contagem do estoque' : 'Registre o material que você retirar'}
        icone="box"
        onVoltar={onVoltar}
        acao={
          admin && aba === 'estoque' ? (
            <TouchableOpacity onPress={() => setEditando({ unidade: 'UN', categoria: 'Outros' })}>
              <Text style={styles.acaoTexto}>+ Item</Text>
            </TouchableOpacity>
          ) : null
        }
      >
        <View style={styles.abas}>
          {abas.map((a) => (
            <TouchableOpacity key={a.k} style={[styles.aba, aba === a.k && styles.abaAtiva]} onPress={() => setAba(a.k)}>
              <Text style={[styles.abaTexto, aba === a.k && styles.abaTextoAtiva]}>{a.rotulo}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {aba !== 'consumo' && (
          <View style={styles.buscaWrap}>
            <Feather name="search" size={15} color={colors.gray400} />
            <TextInput
              style={styles.buscaInput}
              placeholder="Buscar item ou código"
              placeholderTextColor={colors.gray400}
              value={busca}
              onChangeText={setBusca}
            />
            {busca ? (
              <TouchableOpacity onPress={() => setBusca('')}>
                <Feather name="x" size={15} color={colors.gray400} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </CabecalhoTela>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              carregar();
            }}
          />
        }
      >
        {erro ? (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        ) : null}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : aba === 'consumo' ? (
          <>
            <View style={styles.resumo}>
              <View style={styles.resumoBox}>
                <Text style={styles.resumoRotulo}>Retiradas (30 dias)</Text>
                <Text style={styles.resumoValor}>{retiradas.length}</Text>
              </View>
              <View style={styles.resumoBox}>
                <Text style={styles.resumoRotulo}>Valor estimado</Text>
                <Text style={styles.resumoValor}>{reais(totalValor30)}</Text>
              </View>
            </View>
            {admin && porSetor.length > 0 && (
              <>
                <Text style={styles.secaoTitulo}>Por setor</Text>
                {porSetor.map(([setor, v]) => (
                  <View key={setor} style={styles.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={styles.cardNome}>{setor}</Text>
                      <Text style={styles.cardNome}>{reais(v.valor)}</Text>
                    </View>
                    <Text style={styles.cardMeta}>
                      {v.qtd} retirada{v.qtd === 1 ? '' : 's'} ·{' '}
                      {Object.entries(v.itens)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([n, q]) => `${n.toLowerCase()} (${formatarQtd(q)})`)
                        .join(', ')}
                    </Text>
                  </View>
                ))}
              </>
            )}
            <Text style={styles.secaoTitulo}>{admin ? 'Últimas retiradas' : `Retiradas do setor ${meuSetor}`}</Text>
            {retiradas.length === 0 ? (
              <Text style={styles.vazio}>Nenhuma retirada nos últimos 30 dias.</Text>
            ) : (
              retiradas.slice(0, 200).map((r) => (
                <TouchableOpacity key={r.id} style={styles.linha} onLongPress={admin ? () => apagarRetirada(r) : undefined} activeOpacity={admin ? 0.6 : 1}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linhaNome}>{r.itemNome}</Text>
                    <Text style={styles.cardMeta}>
                      {formatarDataHora(r.criadoEm)} · {r.retiradoPor ?? '—'} · {r.setor}
                      {r.observacao ? ` · ${r.observacao}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.linhaQtd}>
                    {formatarQtd(r.quantidade)} {r.unidade}
                  </Text>
                </TouchableOpacity>
              ))
            )}
            {admin && retiradas.length > 0 ? <Text style={styles.dica}>Segure uma retirada para excluir (lançamento errado).</Text> : null}
          </>
        ) : (
          <>
            {aba === 'estoque' && (
              <View style={styles.resumo}>
                <View style={styles.resumoBox}>
                  <Text style={styles.resumoRotulo}>Itens</Text>
                  <Text style={styles.resumoValor}>{itens.length}</Text>
                </View>
                <View style={styles.resumoBox}>
                  <Text style={styles.resumoRotulo}>Zerado / baixo</Text>
                  <Text style={[styles.resumoValor, qtdAlerta > 0 && { color: colors.red500 }]}>{qtdAlerta}</Text>
                </View>
                <View style={styles.resumoBox}>
                  <Text style={styles.resumoRotulo}>Sem contagem</Text>
                  <Text style={styles.resumoValor}>{qtdSemContagem}</Text>
                </View>
              </View>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              {[null, ...categoriasComItens].map((c) => (
                <TouchableOpacity key={c ?? 'todas'} style={[styles.opcao, categoria === c && styles.opcaoAtiva, { marginRight: 6 }]} onPress={() => setCategoria(c)}>
                  <Text style={[styles.opcaoTexto, categoria === c && styles.opcaoTextoAtivo]}>{c ?? 'Todas'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {filtrados.length === 0 ? (
              <Text style={styles.vazio}>{itens.length === 0 ? 'Nenhum item cadastrado ainda.' : 'Nenhum item encontrado.'}</Text>
            ) : (
              listaItens(aba === 'estoque' ? 'estoque' : 'retirar')
            )}
          </>
        )}
      </ScrollView>

      {/* Retirada */}
      <Modal visible={!!retirando} transparent animationType="slide" onRequestClose={() => setRetirando(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalFundo}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setRetirando(null)} />
          <View style={styles.folha}>
            <View style={styles.folhaAlca} />
            {retirando ? (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 600 }}>
                <Text style={styles.folhaTitulo}>Registrar retirada</Text>
                <Text style={[styles.cardNome, { marginTop: 6 }]}>{retirando.nome}</Text>
                <Text style={styles.cardMeta}>
                  {retirando.saldo !== null ? `Saldo atual: ${formatarQtd(retirando.saldo)} ${retirando.unidade}` : 'Ainda sem contagem'}
                </Text>
                <Text style={styles.rotulo}>Quantidade ({retirando.unidade})</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setQtdRetirada(String(Math.max(1, (numero(qtdRetirada) ?? 1) - 1)))}>
                    <Feather name="minus" size={18} color={colors.navy700} />
                  </TouchableOpacity>
                  <TextInput style={styles.stepInput} keyboardType="decimal-pad" value={qtdRetirada} onChangeText={setQtdRetirada} />
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setQtdRetirada(String((numero(qtdRetirada) ?? 0) + 1))}>
                    <Feather name="plus" size={18} color={colors.navy700} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.rotulo}>Para qual setor?</Text>
                <View style={styles.opcoesWrap}>
                  {SETORES_RETIRADA.map((s) => (
                    <TouchableOpacity key={s} style={[styles.opcao, setorRetirada === s && styles.opcaoAtiva]} onPress={() => setSetorRetirada(s)}>
                      <Text style={[styles.opcaoTexto, setorRetirada === s && styles.opcaoTextoAtivo]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.rotulo}>Observação (opcional)</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  placeholder="Ex.: limpeza da câmara fria"
                  placeholderTextColor={colors.gray400}
                  value={obsRetirada}
                  onChangeText={setObsRetirada}
                  multiline
                />
                <Text style={styles.dica}>Registrado em nome de {usuarioAtual?.nome}.</Text>
                <TouchableOpacity style={[styles.btnGrande, salvando && { opacity: 0.6 }]} onPress={confirmarRetirada} disabled={salvando}>
                  <Text style={styles.btnGrandeTexto}>{salvando ? 'Salvando…' : 'Confirmar retirada'}</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Contagem */}
      <Modal visible={!!contando} transparent animationType="slide" onRequestClose={() => setContando(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalFundo}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setContando(null)} />
          <View style={styles.folha}>
            <View style={styles.folhaAlca} />
            {contando ? (
              <>
                <Text style={styles.folhaTitulo}>Contagem</Text>
                <Text style={[styles.cardNome, { marginTop: 6 }]}>{contando.nome}</Text>
                <Text style={styles.cardMeta}>
                  {contando.saldo !== null ? `O app espera ${formatarQtd(contando.saldo)} ${contando.unidade}` : 'Primeira contagem deste item'}
                </Text>
                <Text style={styles.rotulo}>Quantidade contada ({contando.unidade})</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder="Ex.: 12"
                  placeholderTextColor={colors.gray400}
                  value={qtdContada}
                  onChangeText={setQtdContada}
                  autoFocus
                />
                {contando.saldo !== null && numero(qtdContada) !== null ? (
                  <Text style={styles.dica}>
                    Diferença: {formatarQtd(numero(qtdContada)! - contando.saldo)} {contando.unidade}
                  </Text>
                ) : null}
                <Text style={styles.dica}>A contagem vira o novo saldo. As próximas retiradas são descontadas dela.</Text>
                <TouchableOpacity style={[styles.btnGrande, salvando && { opacity: 0.6 }]} onPress={confirmarContagem} disabled={salvando}>
                  <Text style={styles.btnGrandeTexto}>{salvando ? 'Salvando…' : 'Salvar contagem'}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Cadastro / edição de item */}
      <Modal visible={!!editando} transparent animationType="slide" onRequestClose={() => setEditando(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalFundo}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setEditando(null)} />
          <View style={styles.folha}>
            <View style={styles.folhaAlca} />
            {editando ? (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 620 }}>
                <Text style={styles.folhaTitulo}>{editando.id ? 'Editar item' : 'Novo item'}</Text>
                <Text style={styles.rotulo}>Nome</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex.: Detergente neutro 5L"
                  placeholderTextColor={colors.gray400}
                  value={editando.nome ?? ''}
                  onChangeText={(t) => setEditando({ ...editando, nome: t })}
                />
                <Text style={styles.rotulo}>Código interno (opcional)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  placeholderTextColor={colors.gray400}
                  value={editando.codigo ?? ''}
                  onChangeText={(t) => setEditando({ ...editando, codigo: t.trim() || null })}
                />
                <Text style={styles.rotulo}>Unidade</Text>
                <View style={styles.opcoesWrap}>
                  {UNIDADES_USO_CONSUMO.map((u) => (
                    <TouchableOpacity key={u} style={[styles.opcao, editando.unidade === u && styles.opcaoAtiva]} onPress={() => setEditando({ ...editando, unidade: u })}>
                      <Text style={[styles.opcaoTexto, editando.unidade === u && styles.opcaoTextoAtivo]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.rotulo}>Categoria</Text>
                <View style={styles.opcoesWrap}>
                  {CATEGORIAS_USO_CONSUMO.map((c) => (
                    <TouchableOpacity key={c} style={[styles.opcao, editando.categoria === c && styles.opcaoAtiva]} onPress={() => setEditando({ ...editando, categoria: c })}>
                      <Text style={[styles.opcaoTexto, editando.categoria === c && styles.opcaoTextoAtivo]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rotulo}>Estoque mínimo</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholder="opcional"
                      placeholderTextColor={colors.gray400}
                      value={editando.estoqueMinimo != null ? String(editando.estoqueMinimo).replace('.', ',') : ''}
                      onChangeText={(t) => setEditando({ ...editando, estoqueMinimo: numero(t) })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rotulo}>Custo unit. (R$)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholder="opcional"
                      placeholderTextColor={colors.gray400}
                      value={editando.custo != null ? String(editando.custo).replace('.', ',') : ''}
                      onChangeText={(t) => setEditando({ ...editando, custo: numero(t) })}
                    />
                  </View>
                </View>
                {!editando.id ? (
                  <>
                    <Text style={styles.rotulo}>Quantidade contada agora (opcional)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      placeholderTextColor={colors.gray400}
                      value={(editando as any).contagemInicial ?? ''}
                      onChangeText={(t) => setEditando({ ...editando, contagemInicial: t } as any)}
                    />
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.btnSecundario, { marginTop: spacing.lg, alignSelf: 'flex-start' }]}
                    onPress={() => setEditando({ ...editando, ativo: !(editando.ativo ?? true) })}
                  >
                    <Text style={[styles.btnSecundarioTexto, editando.ativo === false && { color: colors.red500 }]}>
                      {editando.ativo === false ? 'Item desativado (toque para reativar)' : 'Desativar item'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.btnGrande, salvando && { opacity: 0.6 }]} onPress={confirmarItem} disabled={salvando}>
                  <Text style={styles.btnGrandeTexto}>{salvando ? 'Salvando…' : 'Salvar'}</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.gray50 },
  acaoTexto: { color: colors.navy700, fontWeight: '800', fontSize: 13 },
  abas: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.full, padding: 3, marginTop: spacing.lg },
  aba: { flex: 1, paddingVertical: 8, borderRadius: radius.full, alignItems: 'center' },
  abaAtiva: { backgroundColor: colors.white },
  abaTexto: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 12.5 },
  abaTextoAtiva: { color: colors.navy700 },
  buscaWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: spacing.md, marginTop: spacing.md },
  buscaInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.gray900 },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12.5, lineHeight: 18 },
  resumo: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  resumoBox: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md },
  resumoRotulo: { fontSize: 10.5, fontWeight: '700', color: colors.gray400, textTransform: 'uppercase' },
  resumoValor: { fontSize: 18, fontWeight: '800', color: colors.navy900, marginTop: 4 },
  secaoTitulo: { fontSize: 15, fontWeight: '800', color: colors.gray900, marginTop: spacing.sm, marginBottom: spacing.md },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardNome: { fontSize: 13.5, fontWeight: '700', color: colors.gray900 },
  cardMeta: { fontSize: 11.5, color: colors.gray600, marginTop: 3, lineHeight: 16 },
  cardInfo: { fontSize: 11.5, color: colors.gray600, marginTop: spacing.sm, lineHeight: 17 },
  cardBotoes: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  chip: { borderRadius: radius.full, paddingVertical: 4, paddingHorizontal: 10 },
  chipTexto: { fontSize: 11, fontWeight: '800' },
  btnPrimario: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 14 },
  btnPrimarioTexto: { color: colors.white, fontWeight: '700', fontSize: 12.5 },
  btnSecundario: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 14 },
  btnSecundarioTexto: { color: colors.navy700, fontWeight: '700', fontSize: 12.5 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginBottom: 6 },
  linhaNome: { fontSize: 12.5, fontWeight: '700', color: colors.gray900 },
  linhaQtd: { fontSize: 13, fontWeight: '800', color: colors.navy700 },
  vazio: { color: colors.gray600, fontSize: 13, textAlign: 'center', marginTop: spacing.xl },
  dica: { fontSize: 11.5, color: colors.gray400, marginTop: spacing.sm },
  opcoesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  opcao: { borderWidth: 1, borderColor: colors.gray100, backgroundColor: colors.white, borderRadius: radius.full, paddingVertical: 7, paddingHorizontal: 12 },
  opcaoAtiva: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  opcaoTexto: { fontSize: 12, fontWeight: '600', color: colors.gray900 },
  opcaoTextoAtivo: { color: colors.white },
  modalFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  folha: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: 36 },
  folhaAlca: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.gray100, alignSelf: 'center', marginBottom: spacing.md },
  folhaTitulo: { fontSize: 18, fontWeight: '800', color: colors.navy900 },
  rotulo: { fontSize: 11.5, fontWeight: '800', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: spacing.lg, marginBottom: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.gray900, backgroundColor: colors.gray50 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: { width: 46, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  stepInput: { flex: 1, height: 46, borderWidth: 1, borderColor: colors.gray100, borderRadius: radius.md, textAlign: 'center', fontSize: 20, fontWeight: '800', color: colors.gray900, backgroundColor: colors.gray50 },
  btnGrande: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: spacing.xl },
  btnGrandeTexto: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
