import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import LogoUlva from '../components/LogoUlva';
import { Feather } from '@expo/vector-icons';

// ULVA 2.0 — Início com as ferramentas agrupadas (Rotina, Comercial,
// Resultados, Estoque). Cada grupo abre uma página com as ferramentas dele.
// Pedidos fica de fora (desabilitado). As telas das ferramentas são as
// mesmas da versão antiga; só a organização do Início muda.

type Icone = React.ComponentProps<typeof Feather>['name'];

export type TelaFerramenta =
  | 'checklist' | 'visitaTecnica' | 'tarefas' | 'avisos' | 'ocorrencias'
  | 'ofertas' | 'precificacao' | 'pesquisaPreco' | 'mapaLoja' | 'pontasExtras'
  | 'perdas' | 'painelResultados' | 'vendasLoja' | 'vendas' | 'giro'
  | 'conferencias' | 'validade' | 'inventario' | 'estoqueLoja' | 'usoConsumo'
  | 'escalaFaltas' | 'chatIA' | 'sobre' | 'chegadas' | 'vendaDia' | 'olhoValidade' | 'resultadosInventario';

type Ferramenta = { nome: string; desc: string; icone: Icone; tela: TelaFerramenta; somenteDono?: boolean };
export type GrupoId = 'rotina' | 'comercial' | 'resultados' | 'estoque';
type Grupo = { id: GrupoId; nome: string; desc: string; icone: Icone; cor: string; fundo: string; ferramentas: Ferramenta[] };

export const GRUPOS_ULVA2: Grupo[] = [
  {
    id: 'rotina', nome: 'Rotina da Loja', desc: 'Checklists, visitas, tarefas e comunicação com a equipe',
    icone: 'check-circle', cor: '#2F7BFF', fundo: '#E3EDFF',
    ferramentas: [
      { nome: 'Checklist', desc: 'Rotina do dia e avaliação de setor', icone: 'check-square', tela: 'checklist' },
      { nome: 'Visita Técnica', desc: 'Checklist do técnico veterinário', icone: 'shield', tela: 'visitaTecnica' },
      { nome: 'Criar tarefa', desc: 'Tarefas para os encarregados', icone: 'edit-3', tela: 'tarefas' },
      { nome: 'Mural de Avisos', desc: 'Comunicados para a equipe', icone: 'bell', tela: 'avisos' },
      { nome: 'Ocorrências', desc: 'Registros do dia a dia da loja', icone: 'alert-triangle', tela: 'ocorrencias' },
    ],
  },
  {
    id: 'comercial', nome: 'Comercial', desc: 'Ofertas, preços e exposição dos produtos',
    icone: 'shopping-bag', cor: '#6A4BD6', fundo: '#ECE7FB',
    ferramentas: [
      { nome: 'Ofertas', desc: 'Criar, aprovar e mandar no WhatsApp', icone: 'tag', tela: 'ofertas' },
      { nome: 'Chegou hoje', desc: 'O que veio do CD e estava em falta', icone: 'truck', tela: 'chegadas' },
      { nome: 'Precificação', desc: 'Bipar produto e imprimir etiqueta', icone: 'dollar-sign', tela: 'precificacao' },
      { nome: 'Pesquisa de Preço', desc: 'Preços dos concorrentes', icone: 'search', tela: 'pesquisaPreco' },
      { nome: 'Mapa da Loja', desc: 'Planta da loja com fotos de cada trecho', icone: 'map', tela: 'mapaLoja' },
      { nome: 'Pontas e Pontos Extras', desc: 'O que está em cada ponta', icone: 'layers', tela: 'pontasExtras' },
    ],
  },
  {
    id: 'resultados', nome: 'Resultados', desc: 'Perdas, vendas e desempenho da loja',
    icone: 'activity', cor: '#178553', fundo: '#DFF3E8',
    ferramentas: [
      { nome: 'Perdas e Desperdício', desc: 'Quebra por setor e por produto', icone: 'trending-down', tela: 'perdas' },
      { nome: 'Painel Resultados', desc: 'Indicadores por setor', icone: 'bar-chart-2', tela: 'painelResultados' },
      { nome: 'Resultados de inventário', desc: 'Resultado final e compartilhar', icone: 'award', tela: 'resultadosInventario' },
      { nome: 'Vendas da Loja', desc: 'Venda por setor e por dia', icone: 'pie-chart', tela: 'vendasLoja', somenteDono: true },
      { nome: 'Venda do dia', desc: 'Total, setores, top 10 e PDF', icone: 'calendar', tela: 'vendaDia', somenteDono: true },
      { nome: 'Vendas', desc: 'Venda por categoria', icone: 'trending-up', tela: 'vendas' },
      { nome: 'Giro de Produtos', desc: 'Produtos parados e sem venda', icone: 'refresh-cw', tela: 'giro', somenteDono: true },
    ],
  },
  {
    id: 'estoque', nome: 'Estoque', desc: 'Conferência, validade, inventário e consumo',
    icone: 'package', cor: '#0B7F8E', fundo: '#DDF2F4',
    ferramentas: [
      { nome: 'Conferência', desc: 'Recebimento de mercadoria', icone: 'clipboard', tela: 'conferencias' },
      { nome: 'Validade', desc: 'Produtos perto de vencer', icone: 'calendar', tela: 'validade' },
      { nome: 'De olho na validade', desc: 'Cliente achou produto vencido', icone: 'eye', tela: 'olhoValidade' },
      { nome: 'Inventário', desc: 'Contagem de estoque', icone: 'list', tela: 'inventario' },
      { nome: 'Estoque Loja', desc: 'Saldo e preço de cada produto', icone: 'archive', tela: 'estoqueLoja' },
      { nome: 'Uso e Consumo', desc: 'Retirada de material por setor', icone: 'box', tela: 'usoConsumo' },
    ],
  },
];

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function hojeTexto(): string {
  const d = new Date();
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

type Props = {
  nome: string;
  usandoNuvem: boolean;
  podeVerDono: boolean;
  podeUsarIA: boolean;
  qtdVencendo: number | null;
  qtdUrgentes: number;
  grupoAberto: GrupoId | null;
  onAbrirGrupo: (g: GrupoId | null) => void;
  onAbrir: (t: TelaFerramenta) => void;
  onSair: () => void;
  // Faixa de prévia (só para quem está testando)
  testando: boolean;
  liberado: boolean;
  onVersaoAntiga?: () => void;
  onAlternarLiberacao?: () => void;
};

export default function InicioUlva2(p: Props) {
  const filtrar = (fs: Ferramenta[]) => fs.filter((f) => !f.somenteDono || p.podeVerDono);
  const grupo = p.grupoAberto ? GRUPOS_ULVA2.find((g) => g.id === p.grupoAberto) : null;

  if (grupo) {
    const fs = filtrar(grupo.ferramentas);
    return (
      <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.grupoTopo}>
          <TouchableOpacity style={s.voltar} onPress={() => p.onAbrirGrupo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={20} color="#2F7BFF" />
            <Text style={s.voltarTxt}>Início</Text>
          </TouchableOpacity>
          <View style={s.grupoTituloLinha}>
            <View style={[s.grupoIconeGrande, { backgroundColor: grupo.fundo }]}>
              <Feather name={grupo.icone} size={28} color={grupo.cor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.grupoTitulo}>{grupo.nome}</Text>
              <Text style={s.grupoDesc}>{grupo.desc}</Text>
            </View>
          </View>
        </View>
        <View style={s.lista}>
          {fs.map((f) => (
            <TouchableOpacity key={f.tela} style={s.item} onPress={() => p.onAbrir(f.tela)} activeOpacity={0.75}>
              <View style={[s.itemIcone, { backgroundColor: grupo.fundo }]}>
                <Feather name={f.icone} size={21} color={grupo.cor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemNome}>{f.nome}</Text>
                <Text style={s.itemDesc}>{f.desc}</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#8A93A3" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  const primeiroNome = (p.nome || '').trim().split(/\s+/)[0] || p.nome;

  return (
    <ScrollView style={s.flex} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.topo}>
        <View style={s.topoLinha}>
          <View style={s.marca}>
            <LogoUlva tamanho={34} />
            <Text style={s.marcaTxt}>ULVA</Text>
          </View>
          <TouchableOpacity onPress={p.onSair} style={s.conta} accessibilityLabel="Conta">
            <Text style={s.contaTxt}>{(primeiroNome[0] || '?').toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.ola}>Olá, {primeiroNome}</Text>
        <Text style={s.data}>{hojeTexto()} · Loja 327</Text>
        <View style={s.selos}>
          <Text style={s.seloAdmin}>Administrador</Text>
          <Text style={[s.seloDados, !p.usandoNuvem && s.seloLocal]}>{p.usandoNuvem ? 'Dados na nuvem' : 'Dados só neste celular'}</Text>
        </View>
      </View>

      <View style={s.corpo}>
        {p.testando && (
          <View style={s.previa}>
            <Text style={s.previaTitulo}>{p.liberado ? '✅ ULVA 2.0 liberado para todos' : '👀 Prévia do ULVA 2.0, só você está vendo'}</Text>
            <View style={s.previaBotoes}>
              {!!p.onVersaoAntiga && (
                <TouchableOpacity style={s.previaBtn} onPress={p.onVersaoAntiga}>
                  <Text style={s.previaBtnTxt}>Ver versão antiga</Text>
                </TouchableOpacity>
              )}
              {!!p.onAlternarLiberacao && (
                <TouchableOpacity style={[s.previaBtn, !p.liberado && s.previaBtnForte]} onPress={p.onAlternarLiberacao}>
                  <Text style={[s.previaBtnTxt, !p.liberado && s.previaBtnTxtForte]}>{p.liberado ? 'Esconder de novo' : 'Liberar para todos'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <TouchableOpacity style={s.vencendo} onPress={() => p.onAbrir('validade')} activeOpacity={0.8}>
          <View style={s.vencendoIcone}>
            <Feather name="calendar" size={20} color="#C5392F" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.vencendoTitulo}>Produtos vencendo</Text>
            <Text style={s.vencendoDesc}>
              {p.qtdVencendo == null
                ? 'Carregando…'
                : p.qtdVencendo === 0
                  ? 'Nenhum produto cadastrado perto de vencer'
                  : `${p.qtdVencendo} cadastrado${p.qtdVencendo === 1 ? '' : 's'}${p.qtdUrgentes > 0 ? ` · ${p.qtdUrgentes} vence${p.qtdUrgentes === 1 ? '' : 'm'} em menos de 5 dias` : ''}`}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color="#8A93A3" />
        </TouchableOpacity>

        <Text style={s.secao}>Ferramentas</Text>

        {GRUPOS_ULVA2.map((g) => {
          const fs = filtrar(g.ferramentas);
          return (
            <TouchableOpacity key={g.id} style={s.grupo} onPress={() => p.onAbrirGrupo(g.id)} activeOpacity={0.8}>
              <View style={s.grupoLinha}>
                <View style={[s.grupoIcone, { backgroundColor: g.fundo }]}>
                  <Feather name={g.icone} size={24} color={g.cor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.grupoNome}>{g.nome}</Text>
                  <Text style={s.grupoQtd}>{fs.length} ferramentas</Text>
                </View>
                <Feather name="chevron-right" size={20} color="#8A93A3" />
              </View>
              <View style={s.chips}>
                {fs.map((f) => (
                  <Text key={f.tela} style={s.chip}>{f.nome}</Text>
                ))}
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={s.atalhos}>
          <TouchableOpacity style={s.atalho} onPress={() => p.onAbrir('escalaFaltas')}>
            <Feather name="users" size={18} color="#2F7BFF" />
            <Text style={s.atalhoTxt}>Colaboradores</Text>
          </TouchableOpacity>
          {p.podeUsarIA && (
            <TouchableOpacity style={s.atalho} onPress={() => p.onAbrir('chatIA')}>
              <Feather name="message-square" size={18} color="#2F7BFF" />
              <Text style={s.atalhoTxt}>Falar com a IA</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={s.sobre} onPress={() => p.onAbrir('sobre')}>
          <Text style={s.sobreTxt}>Sobre o ULVA</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F3F5F9' },
  topo: { backgroundColor: '#0E1B2C', paddingTop: 52, paddingBottom: 60, paddingHorizontal: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  topoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  marca: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  marcaIcone: { width: 30, height: 30, borderRadius: 8 },
  marcaTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 20, letterSpacing: 0.5 },
  conta: { width: 44, height: 44, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  contaTxt: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  ola: { color: '#FFFFFF', fontWeight: '800', fontSize: 28 },
  data: { color: '#B9C3D3', fontSize: 13.5, marginTop: 6 },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  seloAdmin: { fontSize: 11.5, fontWeight: '700', color: '#0E1B2C', backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' },
  seloDados: { fontSize: 11.5, fontWeight: '700', color: '#BFF0D6', backgroundColor: 'rgba(31,157,99,0.25)', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' },
  seloLocal: { color: '#FBE3BF', backgroundColor: 'rgba(230,150,40,0.25)' },
  corpo: { paddingHorizontal: 16, marginTop: -40, gap: 14 },
  previa: { backgroundColor: '#FFF7E0', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#F2D98A', gap: 10 },
  previaTitulo: { fontWeight: '700', fontSize: 13.5, color: '#5A4300' },
  previaBotoes: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  previaBtn: { borderRadius: 10, borderWidth: 1, borderColor: '#E3C66A', backgroundColor: '#FFFFFF', paddingVertical: 8, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center' },
  previaBtnForte: { backgroundColor: '#0E1B2C', borderColor: '#0E1B2C' },
  previaBtnTxt: { fontWeight: '700', fontSize: 13, color: '#5A4300' },
  previaBtnTxtForte: { color: '#FFFFFF' },
  vencendo: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 3, shadowColor: '#0E1B2C', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  vencendoIcone: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FDE8E6', alignItems: 'center', justifyContent: 'center' },
  vencendoTitulo: { fontWeight: '700', fontSize: 14.5, color: '#0E1B2C' },
  vencendoDesc: { fontSize: 12.5, color: '#5B6577', marginTop: 2 },
  secao: { fontWeight: '800', fontSize: 19, color: '#0E1B2C', marginTop: 8, marginLeft: 4 },
  grupo: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, gap: 12, elevation: 1, shadowColor: '#0E1B2C', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  grupoLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grupoIcone: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  grupoNome: { fontWeight: '800', fontSize: 18, color: '#0E1B2C' },
  grupoQtd: { fontSize: 12.5, color: '#5B6577', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { fontSize: 12, fontWeight: '600', color: '#2A3446', backgroundColor: '#F3F5F9', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10, overflow: 'hidden' },
  atalhos: { flexDirection: 'row', gap: 10, marginTop: 4 },
  atalho: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  atalhoTxt: { fontWeight: '700', fontSize: 13.5, color: '#0E1B2C' },
  sobre: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  sobreTxt: { fontSize: 12.5, fontWeight: '600', color: '#5B6577' },
  grupoTopo: { backgroundColor: '#FFFFFF', paddingTop: 52, paddingBottom: 22, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E4E8EF', gap: 16 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44, paddingRight: 12 },
  voltarTxt: { fontWeight: '700', fontSize: 14, color: '#2F7BFF' },
  grupoTituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  grupoIconeGrande: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  grupoTitulo: { fontWeight: '800', fontSize: 26, color: '#0E1B2C' },
  grupoDesc: { fontSize: 13.5, color: '#5B6577', marginTop: 4 },
  lista: { padding: 16, gap: 10 },
  item: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44, elevation: 1, shadowColor: '#0E1B2C', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  itemIcone: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  itemNome: { fontWeight: '700', fontSize: 15.5, color: '#0E1B2C' },
  itemDesc: { fontSize: 12.5, color: '#5B6577', marginTop: 2 },
});
