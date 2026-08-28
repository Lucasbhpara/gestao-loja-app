import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { colors, radius, spacing } from '../theme/colors';
import {
  Sortimento,
  SORTIMENTOS_INVENTARIO,
  ItemCatalogoInventario,
  ContagemInventario,
  buscarItensCatalogo,
  buscarItemPorCodigoBarras,
  cadastrarItemCatalogo,
  buscarContagemDaPessoa,
  lancarContagem,
  buscarPessoasQueContaram,
  buscarPessoasRecentes,
  buscarComparacao,
} from '../data/inventarioApi';
import { exportarContagemXlsx } from '../lib/exportarPlanilha';
import { camaraDisponivel } from '../lib/plataforma';

type Area = 'venda' | 'deposito';
type Modo = 'pessoa' | 'sortimento' | 'contagem' | 'scanner' | 'comparar';

function formatarQuantidade(q: number): string {
  if (Number.isInteger(q)) return String(q);
  return String(Math.round(q * 1000) / 1000);
}

function nomeDoSortimento(s: Sortimento | null): string {
  return SORTIMENTOS_INVENTARIO.find((x) => x.key === s)?.nome ?? '';
}

export default function InventarioScreen({ onVoltar }: { onVoltar: () => void }) {
  const [modo, setModo] = useState<Modo>('pessoa');
  const [erro, setErro] = useState<string | null>(null);

  // --- pessoa -------------------------------------------------------------
  const [nomeInput, setNomeInput] = useState('');
  const [pessoaNome, setPessoaNome] = useState('');
  const [pessoasRecentes, setPessoasRecentes] = useState<string[]>([]);

  useEffect(() => {
    buscarPessoasRecentes()
      .then(setPessoasRecentes)
      .catch(() => {});
  }, []);

  function confirmarPessoa() {
    const nome = nomeInput.trim();
    if (!nome) return;
    setPessoaNome(nome);
    setModo('sortimento');
  }

  // --- sortimento / contagem -----------------------------------------------
  const [sortimento, setSortimento] = useState<Sortimento | null>(null);
  const [area, setArea] = useState<Area>('venda');
  const [itensVenda, setItensVenda] = useState<ContagemInventario[]>([]);
  const [itensDeposito, setItensDeposito] = useState<ContagemInventario[]>([]);
  const [carregandoContagem, setCarregandoContagem] = useState(false);
  const [pessoasQueContaram, setPessoasQueContaram] = useState<string[]>([]);

  async function escolherSortimento(s: Sortimento) {
    setSortimento(s);
    setArea('venda');
    setErro(null);
    setCarregandoContagem(true);
    setModo('contagem');
    try {
      const [{ venda, deposito }, pessoas] = await Promise.all([
        buscarContagemDaPessoa(s, pessoaNome),
        buscarPessoasQueContaram(s),
      ]);
      setItensVenda(venda);
      setItensDeposito(deposito);
      setPessoasQueContaram(pessoas);
    } catch (e: any) {
      setErro(e?.message ?? 'Não consegui carregar a contagem desse inventário.');
    } finally {
      setCarregandoContagem(false);
    }
  }

  // --- busca ----------------------------------------------------------------
  const [termoBusca, setTermoBusca] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState<ItemCatalogoInventario[]>([]);
  const [buscando, setBuscando] = useState(false);
  const buscaInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!sortimento) return;
    const termo = termoBusca.trim();
    if (!termo) {
      setResultadosBusca([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const timer = setTimeout(() => {
      buscarItensCatalogo(sortimento, termo)
        .then(setResultadosBusca)
        .catch(() => setResultadosBusca([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [termoBusca, sortimento]);

  // --- item ativo (aguardando quantidade) ------------------------------------
  const [itemAtivo, setItemAtivo] = useState<ItemCatalogoInventario | null>(null);
  const [quantidadeTexto, setQuantidadeTexto] = useState('');
  const [salvandoQuantidade, setSalvandoQuantidade] = useState(false);
  const quantidadeInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (itemAtivo) {
      requestAnimationFrame(() => quantidadeInputRef.current?.focus());
    }
  }, [itemAtivo]);

  function selecionarItem(item: ItemCatalogoInventario) {
    setItemAtivo(item);
    setQuantidadeTexto('');
    setTermoBusca('');
    setResultadosBusca([]);
  }

  async function confirmarQuantidade() {
    if (!itemAtivo || !sortimento) return;
    const normalizado = quantidadeTexto.trim().replace(',', '.');
    const valor = Number(normalizado);
    if (!normalizado || Number.isNaN(valor) || valor <= 0) {
      Alert.alert('Quantidade inválida', 'Digite um número maior que zero.');
      return;
    }
    setSalvandoQuantidade(true);
    try {
      const listaAtual = area === 'venda' ? itensVenda : itensDeposito;
      const existente = listaAtual.find((c) => c.itemId === itemAtivo.id);
      const atualizado = await lancarContagem({
        sortimento,
        pessoaNome,
        area,
        item: itemAtivo,
        quantidadeAtual: existente?.quantidade ?? 0,
        quantidadeSomar: valor,
      });
      const atualizarLista = (prev: ContagemInventario[]) =>
        [...prev.filter((c) => c.itemId !== itemAtivo.id), atualizado].sort((a, b) => a.produto.localeCompare(b.produto));
      if (area === 'venda') setItensVenda(atualizarLista);
      else setItensDeposito(atualizarLista);

      setItemAtivo(null);
      setQuantidadeTexto('');
      requestAnimationFrame(() => buscaInputRef.current?.focus());
    } catch (e: any) {
      Alert.alert('Não consegui salvar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setSalvandoQuantidade(false);
    }
  }

  // --- cadastro de item novo -------------------------------------------------
  const [modalCadastro, setModalCadastro] = useState<{ codigoBarras: string | null } | null>(null);
  const [novoCodigoInterno, setNovoCodigoInterno] = useState('');
  const [novoProduto, setNovoProduto] = useState('');
  const [novaUnidade, setNovaUnidade] = useState('UN');
  const [salvandoNovoItem, setSalvandoNovoItem] = useState(false);

  function abrirCadastroManual() {
    setModalCadastro({ codigoBarras: null });
    setNovoCodigoInterno('');
    setNovoProduto(termoBusca.trim());
    setNovaUnidade('UN');
  }

  async function salvarNovoItem() {
    if (!sortimento || !novoProduto.trim()) return;
    setSalvandoNovoItem(true);
    try {
      const novoItem = await cadastrarItemCatalogo({
        sortimento,
        codigoInterno: novoCodigoInterno.trim() || null,
        codigoBarras: modalCadastro?.codigoBarras ?? null,
        produto: novoProduto.trim(),
        unidade: novaUnidade.trim() || 'UN',
      });
      setModalCadastro(null);
      setItemAtivo(novoItem);
      setQuantidadeTexto('');
    } catch (e: any) {
      Alert.alert('Não consegui cadastrar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setSalvandoNovoItem(false);
    }
  }

  // --- scanner ---------------------------------------------------------------
  const [permissao, solicitarPermissao] = useCameraPermissions();
  const [scanBloqueado, setScanBloqueado] = useState(false);

  function abrirScanner() {
    setScanBloqueado(false);
    setModo('scanner');
  }

  async function aoEscanear(resultado: BarcodeScanningResult) {
    if (scanBloqueado || !sortimento) return;
    setScanBloqueado(true);
    const codigo = resultado.data.trim();
    try {
      const encontrado = await buscarItemPorCodigoBarras(sortimento, codigo);
      setModo('contagem');
      if (encontrado) {
        setItemAtivo(encontrado);
        setQuantidadeTexto('');
      } else {
        setModalCadastro({ codigoBarras: codigo });
        setNovoCodigoInterno('');
        setNovoProduto('');
        setNovaUnidade('UN');
      }
    } catch (e: any) {
      setModo('contagem');
      Alert.alert('Não consegui buscar', e?.message ?? 'Tenta de novo em alguns instantes.');
    }
  }

  // --- comparar --------------------------------------------------------------
  const [comparacao, setComparacao] = useState<{
    pessoas: string[];
    itens: { item: ItemCatalogoInventario; totaisPorPessoa: Record<string, number> }[];
  } | null>(null);
  const [carregandoComparacao, setCarregandoComparacao] = useState(false);

  async function abrirComparar() {
    if (!sortimento) return;
    setModo('comparar');
    setCarregandoComparacao(true);
    try {
      const resultado = await buscarComparacao(sortimento);
      setComparacao(resultado);
    } catch (e: any) {
      Alert.alert('Não consegui carregar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setCarregandoComparacao(false);
    }
  }

  // --- exportar ----------------------------------------------------------------
  const [exportando, setExportando] = useState(false);

  async function exportar() {
    if (!sortimento) return;
    setExportando(true);
    try {
      const porItem = new Map<
        string,
        { codigo: string; produto: string; unidade: string; deposito: number; venda: number }
      >();
      for (const c of itensDeposito) {
        porItem.set(c.itemId, {
          codigo: c.codigoInterno || c.codigoBarras || '',
          produto: c.produto,
          unidade: c.unidade,
          deposito: c.quantidade,
          venda: 0,
        });
      }
      for (const c of itensVenda) {
        const existente = porItem.get(c.itemId);
        if (existente) existente.venda = c.quantidade;
        else
          porItem.set(c.itemId, {
            codigo: c.codigoInterno || c.codigoBarras || '',
            produto: c.produto,
            unidade: c.unidade,
            deposito: 0,
            venda: c.quantidade,
          });
      }
      if (porItem.size === 0) {
        Alert.alert('Nada pra exportar', 'Você ainda não contou nenhum item nesse inventário.');
        return;
      }
      const linhas = Array.from(porItem.values())
        .sort((a, b) => a.produto.localeCompare(b.produto))
        .map((i) => ({
          Código: i.codigo,
          Descrição: i.produto,
          Depósito: i.deposito,
          'Área de Venda': i.venda,
          Total: i.deposito + i.venda,
          Unidade: i.unidade,
        }));
      const dataHoje = new Date().toISOString().slice(0, 10);
      const nomeArquivo = `contagem_${sortimento}_${pessoaNome.replace(/\s+/g, '_')}_${dataHoje}.xlsx`;
      await exportarContagemXlsx(nomeArquivo, linhas);
    } catch (e: any) {
      Alert.alert('Não consegui exportar', e?.message ?? 'Tenta de novo em alguns instantes.');
    } finally {
      setExportando(false);
    }
  }

  // =========================================================================
  // Telas
  // =========================================================================

  if (modo === 'pessoa') {
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onVoltar} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.voltar}>‹ Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.titulo}>Inventário</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.xxxl }}>
          <Text style={styles.perguntaTitulo}>Quem está fazendo a contagem?</Text>
          <TextInput
            style={styles.input}
            placeholder="Digite seu nome"
            value={nomeInput}
            onChangeText={setNomeInput}
            onSubmitEditing={confirmarPessoa}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.btnSalvar, !nomeInput.trim() && styles.btnSalvarDesabilitado]}
            onPress={confirmarPessoa}
            disabled={!nomeInput.trim()}
          >
            <Text style={styles.btnSalvarTexto}>Entrar</Text>
          </TouchableOpacity>

          {pessoasRecentes.length > 0 && (
            <>
              <Text style={styles.formLabel}>Ou toque em um nome já usado</Text>
              <View style={styles.chipsWrap}>
                {pessoasRecentes.map((nome) => (
                  <TouchableOpacity
                    key={nome}
                    style={styles.chip}
                    onPress={() => {
                      setNomeInput(nome);
                      setPessoaNome(nome);
                      setModo('sortimento');
                    }}
                  >
                    <Text style={styles.chipTexto}>{nome}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  if (modo === 'sortimento') {
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setModo('pessoa')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.voltar}>‹ Trocar pessoa</Text>
          </TouchableOpacity>
          <Text style={styles.titulo}>Inventário</Text>
          <View style={{ width: 100 }} />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }}>
          <Text style={styles.saudacao}>Olá, {pessoaNome}</Text>
          <Text style={styles.perguntaTitulo}>Qual inventário você vai contar?</Text>
          {SORTIMENTOS_INVENTARIO.map((s) => (
            <TouchableOpacity key={s.key} style={styles.sortimentoCard} onPress={() => escolherSortimento(s.key)}>
              <View style={styles.sortimentoIcone}>
                <Text style={styles.sortimentoIconeTexto}>{s.nome.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sortimentoNome}>{s.nome}</Text>
                <Text style={styles.sortimentoDescricao}>{s.descricao}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

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
          <TouchableOpacity style={styles.btnSecundario} onPress={() => setModo('contagem')}>
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
          <TouchableOpacity onPress={() => setModo('contagem')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.scannerVoltar}>‹ Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.scannerTitulo}>Aponte pro código de barras</Text>
        </View>
      </View>
    );
  }

  if (modo === 'comparar') {
    return (
      <View style={styles.flex}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setModo('contagem')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.voltar}>‹ Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.titulo}>Comparar contagens</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          {carregandoComparacao ? (
            <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
          ) : !comparacao || comparacao.itens.length === 0 ? (
            <View style={styles.vazio}>
              <Text style={styles.vazioTexto}>Ainda não tem itens contados pra comparar.</Text>
            </View>
          ) : (
            comparacao.itens.map((entrada) => {
              const valores = comparacao.pessoas.map((p) => entrada.totaisPorPessoa[p] ?? 0);
              const tolerancia = entrada.item.unidade.toUpperCase() === 'KG' ? 0.05 : 0;
              const divergente = valores.length > 1 && Math.max(...valores) - Math.min(...valores) > tolerancia;
              return (
                <View key={entrada.item.id} style={[styles.compararCard, divergente && styles.compararCardDivergente]}>
                  <Text style={styles.compararProduto}>{entrada.item.produto}</Text>
                  {comparacao.pessoas.map((p) => (
                    <View key={p} style={styles.compararLinha}>
                      <Text style={styles.compararPessoa}>{p}</Text>
                      <Text style={styles.compararValor}>
                        {formatarQuantidade(entrada.totaisPorPessoa[p] ?? 0)} {entrada.item.unidade}
                      </Text>
                    </View>
                  ))}
                  {divergente && <Text style={styles.compararAviso}>Diferença entre as contagens</Text>}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  // --- modo 'contagem' (tela principal) ---------------------------------------
  if (!sortimento) return null;
  const listaAtual = area === 'venda' ? itensVenda : itensDeposito;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setModo('sortimento')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.voltar}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>
          {nomeDoSortimento(sortimento)} · {pessoaNome}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.buscaContainer}>
        <TextInput
          ref={buscaInputRef}
          style={styles.buscaInput}
          placeholder="Buscar por código ou nome…"
          value={termoBusca}
          onChangeText={setTermoBusca}
        />
        {camaraDisponivel && (
          <TouchableOpacity style={styles.btnScan} onPress={abrirScanner}>
            <Text style={styles.btnScanTexto}>Escanear</Text>
          </TouchableOpacity>
        )}
      </View>

      {resultadosBusca.length > 0 && (
        <View style={styles.resultadosBox}>
          {resultadosBusca.map((r) => (
            <TouchableOpacity key={r.id} onPress={() => selecionarItem(r)} style={styles.resultadoLinha}>
              <Text style={styles.resultadoProduto} numberOfLines={1}>
                {r.produto}
              </Text>
              <Text style={styles.resultadoCodigo}>{r.codigoInterno || r.codigoBarras || ''}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!buscando && termoBusca.trim().length > 0 && resultadosBusca.length === 0 && (
        <View style={styles.semResultado}>
          <Text style={styles.semResultadoTexto}>Não achei "{termoBusca.trim()}" no catálogo.</Text>
          <TouchableOpacity onPress={abrirCadastroManual}>
            <Text style={styles.btnCadastrarNovoTexto}>+ Cadastrar item novo</Text>
          </TouchableOpacity>
        </View>
      )}

      {itemAtivo && (
        <View style={styles.itemAtivoBox}>
          <Text style={styles.itemAtivoProduto}>{itemAtivo.produto}</Text>
          <Text style={styles.itemAtivoCodigo}>
            {itemAtivo.codigoInterno || itemAtivo.codigoBarras || 'sem código'} · {itemAtivo.unidade}
          </Text>
          <View style={styles.itemAtivoLinha}>
            <TextInput
              ref={quantidadeInputRef}
              style={styles.itemAtivoInput}
              placeholder="Quantidade"
              value={quantidadeTexto}
              onChangeText={setQuantidadeTexto}
              keyboardType="decimal-pad"
              onSubmitEditing={confirmarQuantidade}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.btnConfirmarQtd} onPress={confirmarQuantidade} disabled={salvandoQuantidade}>
              <Text style={styles.btnConfirmarQtdTexto}>{salvandoQuantidade ? '…' : 'Adicionar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnCancelarQtd}
              onPress={() => {
                setItemAtivo(null);
                setQuantidadeTexto('');
              }}
            >
              <Text style={styles.btnCancelarQtdTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.tabsRow}>
        <TouchableOpacity style={[styles.tab, area === 'venda' && styles.tabAtiva]} onPress={() => setArea('venda')}>
          <Text style={[styles.tabTexto, area === 'venda' && styles.tabTextoAtivo]}>Área de venda</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, area === 'deposito' && styles.tabAtiva]} onPress={() => setArea('deposito')}>
          <Text style={[styles.tabTexto, area === 'deposito' && styles.tabTextoAtivo]}>Depósito</Text>
        </TouchableOpacity>
      </View>

      {erro && (
        <View style={styles.erroBox}>
          <Text style={styles.erroTexto}>{erro}</Text>
        </View>
      )}

      <ScrollView style={styles.flex} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        {carregandoContagem ? (
          <ActivityIndicator color={colors.navy700} style={{ marginTop: spacing.xxl }} />
        ) : listaAtual.length === 0 ? (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>
              Nenhum item contado ainda em {area === 'venda' ? 'Área de venda' : 'Depósito'}. Busca ou escaneia o
              primeiro item aí em cima.
            </Text>
          </View>
        ) : (
          listaAtual.map((c) => (
            <View key={c.id} style={styles.itemCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemCardProduto}>{c.produto}</Text>
                <Text style={styles.itemCardCodigo}>{c.codigoInterno || c.codigoBarras || 'sem código'}</Text>
              </View>
              <Text style={styles.itemCardQtd}>
                {formatarQuantidade(c.quantidade)} {c.unidade}
              </Text>
              <TouchableOpacity
                style={styles.btnMais}
                onPress={() => {
                  setItemAtivo({
                    id: c.itemId,
                    sortimento: c.sortimento,
                    codigoInterno: c.codigoInterno,
                    codigoBarras: c.codigoBarras,
                    produto: c.produto,
                    unidade: c.unidade,
                  });
                  setQuantidadeTexto('');
                }}
              >
                <Text style={styles.btnMaisTexto}>+</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.rodape}>
        {pessoasQueContaram.length > 1 && (
          <TouchableOpacity style={styles.btnRodapeSecundario} onPress={abrirComparar}>
            <Text style={styles.btnRodapeSecundarioTexto}>Comparar contagens</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.btnRodapePrimario} onPress={exportar} disabled={exportando}>
          <Text style={styles.btnRodapePrimarioTexto}>{exportando ? 'Gerando planilha…' : 'Enviar contagem'}</Text>
        </TouchableOpacity>
      </View>

      {modalCadastro && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <Text style={styles.overlayTitulo}>Cadastrar item novo</Text>
            {modalCadastro.codigoBarras && (
              <Text style={styles.codigoLido}>Código de barras lido: {modalCadastro.codigoBarras}</Text>
            )}
            <Text style={styles.formLabel}>Código interno (opcional)</Text>
            <TextInput
              style={styles.input}
              value={novoCodigoInterno}
              onChangeText={setNovoCodigoInterno}
              placeholder="Ex: 1042"
            />
            <Text style={styles.formLabel}>Produto</Text>
            <TextInput style={styles.input} value={novoProduto} onChangeText={setNovoProduto} placeholder="Nome do produto" />
            <Text style={styles.formLabel}>Unidade</Text>
            <TextInput style={styles.input} value={novaUnidade} onChangeText={setNovaUnidade} placeholder="UN, KG, CX…" />
            <View style={styles.overlayBotoes}>
              <TouchableOpacity style={styles.btnSecundario} onPress={() => setModalCadastro(null)}>
                <Text style={styles.btnSecundarioTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimario, !novoProduto.trim() && styles.btnSalvarDesabilitado]}
                onPress={salvarNovoItem}
                disabled={!novoProduto.trim() || salvandoNovoItem}
              >
                <Text style={styles.btnPrimarioTexto}>{salvandoNovoItem ? 'Salvando…' : 'Salvar e contar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
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
  titulo: { fontSize: 15, fontWeight: '700', color: colors.navy900 },
  saudacao: { fontSize: 14, fontWeight: '600', color: colors.gray600, marginBottom: 4 },
  perguntaTitulo: { fontSize: 19, fontWeight: '700', color: colors.navy900, marginBottom: spacing.lg },
  input: {
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.gray900,
    marginBottom: spacing.md,
  },
  formLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.gray600,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  btnSalvar: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  btnSalvarDesabilitado: { backgroundColor: colors.gray100 },
  btnSalvarTexto: { color: colors.white, fontSize: 13, fontWeight: '700' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.xl },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  chipAtivo: { backgroundColor: colors.navy700, borderColor: colors.navy700 },
  chipTexto: { fontSize: 12.5, fontWeight: '600', color: colors.gray600 },
  chipTextoAtivo: { color: colors.white },
  sortimentoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gray100,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sortimentoIcone: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: colors.navy700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortimentoIconeTexto: { color: colors.white, fontSize: 16, fontWeight: '700' },
  sortimentoNome: { fontSize: 14.5, fontWeight: '700', color: colors.gray900 },
  sortimentoDescricao: { fontSize: 11.5, color: colors.gray600, marginTop: 2 },
  buscaContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.white,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  buscaInput: {
    flex: 1,
    backgroundColor: colors.gray50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.gray900,
  },
  btnScan: { backgroundColor: colors.navy700, borderRadius: radius.md, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  btnScanTexto: { color: colors.white, fontSize: 12, fontWeight: '700' },
  resultadosBox: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray100, maxHeight: 220 },
  resultadoLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
  },
  resultadoProduto: { fontSize: 12.5, fontWeight: '600', color: colors.gray900, flex: 1, marginRight: spacing.sm },
  resultadoCodigo: { fontSize: 11, color: colors.gray400, fontWeight: '600' },
  semResultado: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  semResultadoTexto: { fontSize: 12, color: colors.gray600, marginBottom: 6 },
  btnCadastrarNovoTexto: { fontSize: 12.5, color: colors.navy700, fontWeight: '700' },
  itemAtivoBox: { backgroundColor: '#DFF3E9', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  itemAtivoProduto: { fontSize: 14, fontWeight: '700', color: colors.navy900 },
  itemAtivoCodigo: { fontSize: 11.5, color: colors.gray600, marginTop: 2, marginBottom: spacing.md, fontWeight: '600' },
  itemAtivoLinha: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  itemAtivoInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
    color: colors.gray900,
  },
  btnConfirmarQtd: { backgroundColor: colors.green500, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  btnConfirmarQtdTexto: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  btnCancelarQtd: { paddingHorizontal: spacing.md, paddingVertical: 10 },
  btnCancelarQtdTexto: { color: colors.gray600, fontSize: 12, fontWeight: '600' },
  tabsRow: { flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabAtiva: { borderBottomColor: colors.navy700 },
  tabTexto: { fontSize: 12.5, fontWeight: '600', color: colors.gray400 },
  tabTextoAtivo: { color: colors.navy700 },
  erroBox: { backgroundColor: '#FBDEDC', margin: spacing.lg, marginBottom: 0, borderRadius: radius.md, padding: spacing.md },
  erroTexto: { color: colors.red500, fontSize: 12, lineHeight: 17 },
  vazio: { paddingTop: spacing.xxl, alignItems: 'center' },
  vazioTexto: { color: colors.gray600, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl, lineHeight: 19 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemCardProduto: { fontSize: 13, fontWeight: '600', color: colors.gray900 },
  itemCardCodigo: { fontSize: 10.5, color: colors.gray400, marginTop: 2, fontWeight: '600' },
  itemCardQtd: { fontSize: 13, fontWeight: '700', color: colors.navy700 },
  btnMais: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.gray50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnMaisTexto: { fontSize: 16, fontWeight: '700', color: colors.navy700, marginTop: -1 },
  rodape: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    padding: spacing.lg,
  },
  btnRodapeSecundario: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.navy700,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnRodapeSecundarioTexto: { color: colors.navy700, fontSize: 12.5, fontWeight: '700' },
  btnRodapePrimario: { flex: 1, backgroundColor: colors.navy700, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  btnRodapePrimarioTexto: { color: colors.white, fontSize: 12.5, fontWeight: '700' },
  compararCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  compararCardDivergente: { borderWidth: 1, borderColor: colors.red500 },
  compararProduto: { fontSize: 13.5, fontWeight: '700', color: colors.gray900, marginBottom: spacing.sm },
  compararLinha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  compararPessoa: { fontSize: 12, color: colors.gray600 },
  compararValor: { fontSize: 12, fontWeight: '700', color: colors.gray900 },
  compararAviso: { fontSize: 11, color: colors.red500, fontWeight: '700', marginTop: spacing.sm },
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
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(18,27,74,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  overlayCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, width: '100%' },
  overlayTitulo: { fontSize: 15, fontWeight: '700', color: colors.navy900, marginBottom: spacing.sm },
  codigoLido: { fontSize: 11.5, color: colors.gray400, fontWeight: '600', marginBottom: spacing.sm },
  overlayBotoes: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.lg },
});
