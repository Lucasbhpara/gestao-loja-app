import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { setores, SetorKey } from '../data/employees';
import SeletorDataValidade from '../components/SeletorDataValidade';
import {
  Validade,
  buscarProdutoPorCodigoBarras,
  buscarTodasValidades,
  buscarValidadesDoSetor,
  adicionarValidade,
  atualizarValidade,
  removerValidade,
  atualizarProdutoCatalogo,
} from '../data/validadeApi';
import { diasRestantes, formatarData, statusPrazo } from '../lib/validadeUtils';
import { exportarContagemXlsx } from '../lib/exportarPlanilha';
import { camaraDisponivel } from '../lib/plataforma';

// "Todos" não é um setor de colaborador de verdade — é um marcador especial
// só pra deixar um produto visível em qualquer aba de setor de uma vez (ex.:
// um item de uso geral que não é só do Açougue ou só da Padaria).
const setoresComTodos: { key: SetorKey; nome: string }[] = [
  { key: 'todos', nome: 'Todos os setores' },
  ...setores,
];

// Mesmo formato usado em Tarefas: AAAA-MM-DD, com checagem de data real
// (não deixa passar "2026-02-31", por exemplo).
function dataValida(valor: string): boolean {
  const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [, ano, mes, dia] = m;
  const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
  return d.getFullYear() === Number(ano) && d.getMonth() === Number(mes) - 1 && d.getDate() === Number(dia);
}

export default function ValidadeScreen({ onVoltar }: { onVoltar: () => void }) {
  const { usuarioAtual } = useAuth();
  // Administrador, a função A.P.P e o setor Promotores enxergam e cadastram
  // validade de qualquer setor (Promotores circula pela loja toda).
  const podeGerenciarTudo =
    !!usuarioAtual && (usuarioAtual.isAdmin || usuarioAtual.funcao === 'A.P.P' || usuarioAtual.setor === 'promotores');

  const [validades, setValidades] = useState<Validade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [setorFiltro, setSetorFiltro] = useState<SetorKey | null>(null);

  const [modo, setModo] = useState<'lista' | 'scanner' | 'confirmar'>('lista');
  const [permissao, solicitarPermissao] = useCameraPermissions();
  const [scanBloqueado, setScanBloqueado] = useState(false);

  const [codigoBarras, setCodigoBarras] = useState<string | null>(null);
  const [produtoNaoEncontrado, setProdutoNaoEncontrado] = useState(false);
  const [produto, setProduto] = useState('');
  const [unidade, setUnidade] = useState('un');
  const [dataValidadeTexto, setDataValidadeTexto] = useState('');
  const [setorEscolhido, setSetorEscolhido] = useState<SetorKey | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCatalogo, setBuscandoCatalogo] = useState(false);
  const [editarCatalogo, setEditarCatalogo] = useState(false);
  // Quando não-nulo, "Salvar" corrige esse produto já cadastrado em vez de
  // lançar um novo.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  function carregar() {
    if (!usuarioAtual) return;
    const promessa = podeGerenciarTudo ? buscarTodasValidades() : buscarValidadesDoSetor(usuarioAtual.setor);
    promessa
      .then((lista) => {
        setValidades(lista);
        setErro(null);
      })
      .catch((e) => setErro(e?.message ?? 'Não consegui carregar a validade dos produtos.'))
      .finally(() => {
        setCarregando(false);
        setAtualizando(false);
      });
  }

  useEffect(() => {
    carregar();
  }, [usuarioAtual?.setor, podeGerenciarTudo]);

  const validadesFiltradas = useMemo(
    () =>
      setorFiltro ? validades.filter((v) => v.setor === setorFiltro || v.setor === 'todos') : validades,
    [validades, setorFiltro]
  );

  const setoresComProduto = useMemo(() => {
    const chaves = new Set(validades.map((v) => v.setor));
    return setoresComTodos.filter((s) => chaves.has(s.key));
  }, [validades]);

  function nomeSetor(key: SetorKey) {
    return setoresComTodos.find((s) => s.key === key)?.nome ?? key;
  }

  function abrirScanner() {
    setScanBloqueado(false);
    setEditandoId(null);
    setModo('scanner');
  }

  async function aoEscanear(resultado: BarcodeScanningResult) {
    if (scanBloqueado) return;
    setScanBloqueado(true);
    const codigo = resultado.data.trim();
    setCodigoBarras(codigo);
    setBuscandoCatalogo(true);
    try {
      const encontrado = await buscarProdutoPorCodigoBarras(codigo);
      if (encontrado) {
        setProduto(encontrado.produto);
        setUnidade(encontrado.unidade);
        setProdutoNaoEncontrado(false);
      } else {
        setProduto('');
        setUnidade('un');
        setProdutoNaoEncontrado(true);
      }
    } catch (e: any) {
      setProduto('');
      setUnidade('un');
      setProdutoNaoEncontrado(true);
    } finally {
      setBuscandoCatalogo(false);
      setDataValidadeTexto('');
      setSetorEscolhido(podeGerenciarTudo ? usuarioAtual!.setor : null);
      setEditarCatalogo(false);
      setModo('confirmar');
    }
  }

  function abrirEntradaManual() {
    setCodigoBarras(null);
    setProduto('');
    setUnidade('un');
    setProdutoNaoEncontrado(false);
    setDataValidadeTexto('');
    setSetorEscolhido(podeGerenciarTudo ? usuarioAtual!.setor : null);
    setEditarCatalogo(false);
    setEditandoId(null);
    setModo('confirmar');
  }

  // Reabre a tela de confirmação já preenchida com os dados de um produto
  // cadastrado, pra corrigir nome, unidade, setor ou validade sem precisar
  // remover e lançar de novo.
  function abrirEdicao(v: Validade) {
    setCodigoBarras(v.codigoBarras);
    setProduto(v.produto);
    setUnidade(v.unidade);
    setDataValidadeTexto(v.dataValidade);
    setSetorEscolhido(v.setor);
    setProdutoNaoEncontrado(false);
    setEditarCatalogo(false);
    setEditandoId(v.id);
    setModo('confirmar');
  }

  function cancelarConfirmacao() {
    setEditandoId(null);
    setModo('lista');
  }

  const setorFinal = podeGerenciarTudo ? setorEscolhido : usuarioAtual?.setor ?? null;
  const formValido = !!produto.trim() && dataValida(dataValidadeTexto) && !!setorFinal;

  async function salvar() {
    if (!formValido || !usuarioAtual || !setorFinal) return;
    setSalvando(true);
    try {
      if (codigoBarras && editarCatalogo) {
        await atualizarProdutoCatalogo({
          codigoBarras,
          produto: produto.trim(),
          unidade: unidade.trim() || 'un',
        });
      }
      if (editandoId) {
        const atualizada = await atualizarValidade({
          id: editandoId,
          produto: produto.trim(),
          unidade: unidade.trim() || 'un',
          setor: setorFinal,
          dataValidade: dataValidadeTexto.trim(),
        });
        setValidades((prev) =>
          prev
            .map((v) => (v.id === atualizada.id ? atualizada : v))
            .sort((a, b) => (a.dataValidade < b.dataValidade ? -1 : 1))
        );
      } else {
        const nova = await adicionarValidade({
          codigoBarras,
          produto: produto.trim(),
          unidade: unidade.trim() || 'un',
          setor: setorFinal,
          dataValidade: dataValidadeTexto.trim(),
          cadastradoPorNome: usuarioAtual.nome,
        });
        setValidades((prev) => [...prev, nova].sort((a, b) => (a.dataValidade < b.dataValidade ? -1 : 1)));
      }
      setEditandoId(null);
      setModo('lista');
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui salvar esse produto.');
      setModo('lista');
    } finally {
      setSalvando(false);
    }
  }

  // Manda a lista atual (respeitando o filtro de setor selecionado) pra uma
  // planilha Excel, pra imprimir ou compartilhar fora do app.
  async function exportarExcel() {
    if (exportando) return;
    setExportando(true);
    try {
      const linhas = validadesFiltradas.map((v) => ({
        Produto: v.produto,
        Setor: nomeSetor(v.setor),
        Validade: formatarData(v.dataValidade),
        Unidade: v.unidade,
      }));
      if (linhas.length === 0) {
        Alert.alert('Nada pra exportar', 'Não tem produto nessa lista ainda.');
        return;
      }
      await exportarContagemXlsx('validade.xlsx', linhas);
    } catch (e: any) {
      Alert.alert('Não consegui exportar', e?.message ?? 'Tenta de novo em instantes.');
    } finally {
      setExportando(false);
    }
  }

  function confirmarExclusao(v: Validade) {
    Alert.alert('Remover produto', `Remover "${v.produto}" do controle de validade?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await removerValidade(v.id);
            setValidades((prev) => prev.filter((p) => p.id !== v.id));
          } catch (e: any) {
            setErro(e?.message ?? 'Não consegui remover.');
          }
        },
      },
    ]);
  }

  if (!usuarioAtual) return null;

  // --- Tela do scanner --------------------------------------------------
  if (modo === 'scanner') {
    if (!permissao) {
      return (
        <View style={styles.flex}>
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        </View>
      );
    }
    if (!permissao.granted) {
      return (
        <View style={[styles.flex, styles.permissaoBox]}>
          <Text style={styles.permissaoTitulo}>Preciso da câmera pra escanear</Text>
          <Text style={styles.permissaoTexto}>
            {permissao.canAskAgain
              ? 'Permite o acesso à câmera pra ler o código de barras do produto.'
              : 'O acesso à câmera foi negado antes. Ative manualmente nas configurações do celular, em Apps → Gestão de Loja → Permissões.'}
          </Text>
          {permissao.canAskAgain && (
            <TouchableOpacity style={styles.btnPrimario} onPress={solicitarPermissao}>
              <Text style={styles.btnPrimarioTexto}>Permitir câmera</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.btnSecundario} onPress={() => setModo('lista')}>
            <Text style={styles.btnSecundarioTexto}>Voltar</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.flex}>
        <CameraView
          style={styles.flex}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
          onBarcodeScanned={scanBloqueado ? undefined : aoEscanear}
        />
        <View style={styles.scannerOverlayTopo}>
          <TouchableOpacity onPress={() => setModo('lista')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.scannerVoltar}>‹ Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.scannerTitulo}>Aponte pro código de barras</Text>
        </View>
        <View style={styles.scannerOverlayBase}>
          <TouchableOpacity style={styles.btnManual} onPress={abrirEntradaManual}>
            <Text style={styles.btnManualTexto}>Não consigo escanear — digitar manualmente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- Tela de confirmação -----------------------------------------------
  if (modo === 'confirmar') {
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={cancelarConfirmacao} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.voltar}>‹ Cancelar</Text>
          </TouchableOpacity>
          <Text style={styles.titulo}>{editandoId ? 'Editar produto' : 'Novo produto'}</Text>
          <View style={{ width: 70 }} />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          {buscandoCatalogo ? (
            <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xl }} />
          ) : (
            <View style={styles.formCard}>
              {codigoBarras && (
                <View style={styles.codigoLidoRow}>
                  <Text style={styles.codigoLido}>Código lido: {codigoBarras}</Text>
                  {!produtoNaoEncontrado && (
                    <TouchableOpacity onPress={() => setEditarCatalogo((v) => !v)}>
                      <Text style={styles.btnLapisTexto}>
                        {editarCatalogo ? '✕ Cancelar edição' : '✎ Editar produto'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {produtoNaoEncontrado && (
                <View style={styles.avisoBox}>
                  <Text style={styles.avisoTexto}>
                    Esse código não está na base de produtos ainda. Preenche o nome abaixo na mão — não tem
                    problema, ele fica salvo do mesmo jeito.
                  </Text>
                </View>
              )}
              {editarCatalogo && (
                <View style={styles.avisoBox}>
                  <Text style={styles.avisoTexto}>
                    Editando o cadastro desse produto: o nome e a unidade abaixo passam a valer pra sempre
                    nesse código de barras — todo mundo que escanear de novo já vê atualizado.
                  </Text>
                </View>
              )}

              <Text style={styles.formLabel}>Produto</Text>
              <TextInput
                style={styles.input}
                placeholder="Nome do produto"
                value={produto}
                onChangeText={setProduto}
              />

              <Text style={styles.formLabel}>Unidade</Text>
              <TextInput style={styles.input} placeholder="un, kg, cx…" value={unidade} onChangeText={setUnidade} />

              <Text style={styles.formLabel}>Data de validade</Text>
              <SeletorDataValidade valor={dataValidadeTexto} onSelecionar={setDataValidadeTexto} />

              {podeGerenciarTudo && (
                <>
                  <Text style={styles.formLabel}>Setor</Text>
                  <View style={styles.chipsWrap}>
                    {setoresComTodos.map((s) => (
                      <TouchableOpacity
                        key={s.key}
                        style={[styles.chip, setorEscolhido === s.key && styles.chipAtivo]}
                        onPress={() => setSetorEscolhido(s.key)}
                      >
                        <Text style={[styles.chipTexto, setorEscolhido === s.key && styles.chipTextoAtivo]}>
                          {s.nome}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[styles.btnSalvar, (!formValido || salvando) && styles.btnSalvarDesabilitado]}
                onPress={salvar}
                disabled={!formValido || salvando}
              >
                <Text style={styles.btnSalvarTexto}>
                  {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Salvar produto'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // --- Lista principal -----------------------------------------------------
  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Validade{!podeGerenciarTudo ? ` · ${nomeSetor(usuarioAtual.setor)}` : ''}</Text>
        {podeGerenciarTudo ? (
          <TouchableOpacity onPress={exportarExcel} disabled={exportando} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.exportarTexto}>{exportando ? 'Exportando…' : 'Exportar Excel'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 50 }} />
        )}
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
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
        {podeGerenciarTudo && setoresComProduto.length > 1 && (
          <View style={styles.chipsWrap}>
            <TouchableOpacity
              style={[styles.chip, setorFiltro === null && styles.chipAtivo]}
              onPress={() => setSetorFiltro(null)}
            >
              <Text style={[styles.chipTexto, setorFiltro === null && styles.chipTextoAtivo]}>Todos</Text>
            </TouchableOpacity>
            {setoresComProduto.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.chip, setorFiltro === s.key && styles.chipAtivo]}
                onPress={() => setSetorFiltro(s.key)}
              >
                <Text style={[styles.chipTexto, setorFiltro === s.key && styles.chipTextoAtivo]}>{s.nome}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {erro && (
          <View style={styles.erroBox}>
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : validadesFiltradas.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>
              Nenhum produto com validade cadastrado ainda. Toque no botão “+” aqui embaixo pra escanear o
              primeiro.
            </Text>
          </View>
        ) : (
          validadesFiltradas.map((v) => {
            const dias = diasRestantes(v.dataValidade);
            const status = statusPrazo(dias);
            return (
              <View key={v.id} style={styles.card}>
                <View style={styles.cardTopo}>
                  <Text style={styles.cardProduto}>{v.produto}</Text>
                  <View style={[styles.chipStatus, { backgroundColor: status.fundo }]}>
                    <Text style={[styles.chipStatusTexto, { color: status.cor }]}>{status.texto}</Text>
                  </View>
                </View>
                <Text style={styles.cardData}>
                  Vence em {formatarData(v.dataValidade)}
                  {podeGerenciarTudo ? ` · ${nomeSetor(v.setor)}` : ''}
                </Text>
                {podeGerenciarTudo && (
                  <View style={styles.cardAcoes}>
                    <TouchableOpacity onPress={() => abrirEdicao(v)} style={styles.btnEditar}>
                      <Text style={styles.btnEditarTexto}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmarExclusao(v)} style={styles.btnRemover}>
                      <Text style={styles.btnRemoverTexto}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={camaraDisponivel ? abrirScanner : abrirEntradaManual}>
        <Text style={styles.fabTexto}>+</Text>
      </TouchableOpacity>
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
  exportarTexto: { color: colors.navy700, fontSize: 12, fontWeight: '700' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100 },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 11.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  erroBox: { backgroundColor: '#FBDEDC', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 19 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  cardProduto: { fontSize: 14, fontWeight: '700', color: colors.gray900, flex: 1 },
  cardData: { fontSize: 12.5, color: colors.gray600, marginTop: 6, fontWeight: '600' },
  chipStatus: { borderRadius: radius.full, paddingVertical: 3, paddingHorizontal: 9 },
  chipStatusTexto: { fontSize: 10.5, fontWeight: '700' },
  cardAcoes: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  btnEditar: { alignSelf: 'flex-start' },
  btnEditarTexto: { fontSize: 11.5, color: colors.navy700, fontWeight: '600' },
  btnRemover: { alignSelf: 'flex-start' },
  btnRemoverTexto: { fontSize: 11.5, color: colors.red500, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.navy700,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabTexto: { color: colors.white, fontSize: 28, fontWeight: '600', marginTop: -2 },
  permissaoBox: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  permissaoTitulo: { fontSize: 17, fontWeight: '700', color: colors.navy900, textAlign: 'center' },
  permissaoTexto: { fontSize: 13, color: colors.gray600, textAlign: 'center', marginTop: spacing.md, lineHeight: 19 },
  btnPrimario: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.xxl, marginTop: spacing.xl },
  btnPrimarioTexto: { color: colors.white, fontSize: 13.5, fontWeight: '700' },
  btnSecundario: { paddingVertical: 12, paddingHorizontal: spacing.xxl, marginTop: spacing.sm },
  btnSecundarioTexto: { color: colors.navy700, fontSize: 13.5, fontWeight: '600' },
  scannerOverlayTopo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(18,27,74,0.55)',
  },
  scannerVoltar: { color: colors.white, fontSize: 15, fontWeight: '600' },
  scannerTitulo: { color: colors.white, fontSize: 14, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center' },
  scannerOverlayBase: { position: 'absolute', left: 0, right: 0, bottom: spacing.xxl, alignItems: 'center' },
  btnManual: { backgroundColor: 'rgba(18,27,74,0.75)', borderRadius: radius.full, paddingVertical: 12, paddingHorizontal: spacing.xl },
  btnManualTexto: { color: colors.white, fontSize: 12.5, fontWeight: '600' },
  formCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  codigoLidoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  codigoLido: { fontSize: 11.5, color: colors.gray400, fontWeight: '600' },
  btnLapisTexto: { fontSize: 11.5, color: colors.navy700, fontWeight: '700' },
  avisoBox: { backgroundColor: '#FBEBD4', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  avisoTexto: { color: '#7A4C0E', fontSize: 12, lineHeight: 17 },
  formLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, color: colors.gray600, marginTop: spacing.md, marginBottom: 6 },
  input: { backgroundColor: colors.gray50, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, color: colors.gray900, justifyContent: 'center', minHeight: 40 },
  inputTexto: { fontSize: 13, color: colors.gray900 },
  inputPlaceholder: { fontSize: 13, color: colors.gray400 },
  inputErro: { borderWidth: 1, borderColor: colors.red500 },
  btnFecharCalendario: { alignSelf: 'flex-end', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  btnFecharCalendarioTexto: { color: colors.navy700, fontSize: 13, fontWeight: '700' },
  campoErroTexto: { color: colors.red500, fontSize: 11, marginTop: 6 },
  btnSalvar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.lg },
  btnSalvarDesabilitado: { backgroundColor: colors.gray100 },
  btnSalvarTexto: { color: colors.white, fontSize: 13, fontWeight: '700' },
});
