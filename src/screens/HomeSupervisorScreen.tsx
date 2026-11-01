import React, { useEffect, useState } from 'react';
import { Alert, BackHandler } from 'react-native';
import { useAuth } from '../context/AuthContext';
import InicioUlva2, { Grupo, GrupoId, TelaFerramenta } from './InicioUlva2';
import VisitaSupervisorScreen from './VisitaSupervisorScreen';
import ChecklistHubScreen from './ChecklistHubScreen';
import VisitaTecnicaScreen from './VisitaTecnicaScreen';
import PerdasAdminScreen from './PerdasAdminScreen';
import VendasLojaScreen from './VendasLojaScreen';
import VendaDiaScreen from './VendaDiaScreen';
import RelatorioMensalScreen from './RelatorioMensalScreen';
import VendasScreen from './VendasScreen';
import GiroProdutosScreen from './GiroProdutosScreen';
import EstoqueLojaScreen from './EstoqueLojaScreen';
import ValidadeScreen from './ValidadeScreen';
import SobreScreen from './SobreScreen';
import { Validade, buscarTodasValidades } from '../data/validadeApi';
import { diasRestantes } from '../lib/validadeUtils';

// =============================================================================
// Início do SUPERVISOR — colaborador (não administrador) com a função
// "Supervisor" cadastrada no Portal (ver ehSupervisor em visitaSupervisorApi).
// Vê: Visita Supervisor, todas as vendas, estoque, quebras, checklist,
// visita técnica e giro de produtos.
// =============================================================================

const GRUPOS_SUPERVISOR: Grupo[] = [
  {
    id: 'rotina', nome: 'Rotina da Loja', desc: 'Visita do supervisor, checklists e visita técnica',
    icone: 'check-circle', cor: '#2F7BFF', fundo: '#E3EDFF',
    ferramentas: [
      { nome: 'Visita Supervisor', desc: 'Orientações por setor, com fotos e PDF', icone: 'user-check', tela: 'visitaSupervisor' },
      { nome: 'Checklist', desc: 'Rotina do dia e avaliação de setor', icone: 'check-square', tela: 'checklist' },
      { nome: 'Visita Técnica', desc: 'Checklist do técnico veterinário', icone: 'shield', tela: 'visitaTecnica' },
    ],
  },
  {
    id: 'resultados', nome: 'Resultados', desc: 'Vendas, quebras e giro de produtos',
    icone: 'activity', cor: '#178553', fundo: '#DFF3E8',
    ferramentas: [
      { nome: 'Vendas da Loja', desc: 'Venda por setor e por dia', icone: 'pie-chart', tela: 'vendasLoja' },
      { nome: 'Venda do dia', desc: 'Total, setores, top 10 e PDF', icone: 'calendar', tela: 'vendaDia' },
      { nome: 'Relatório mensal', desc: 'Meta, caixas, horários, quebras, turnover e PDF', icone: 'file-text', tela: 'relatorioMensal' },
      { nome: 'Vendas', desc: 'Venda por categoria', icone: 'trending-up', tela: 'vendas' },
      { nome: 'Perdas e Desperdício', desc: 'Quebra por setor e por produto', icone: 'trending-down', tela: 'perdas' },
      { nome: 'Giro de Produtos', desc: 'Produtos parados e sem venda', icone: 'refresh-cw', tela: 'giro' },
    ],
  },
  {
    id: 'estoque', nome: 'Estoque', desc: 'Saldo e preço de cada produto',
    icone: 'package', cor: '#0B7F8E', fundo: '#DDF2F4',
    ferramentas: [{ nome: 'Estoque Loja', desc: 'Saldo e preço de cada produto', icone: 'archive', tela: 'estoqueLoja' }],
  },
];

export default function HomeSupervisorScreen() {
  const { usuarioAtual, logout } = useAuth();
  const [tela, setTela] = useState<TelaFerramenta | 'home'>('home');
  const [grupoAberto, setGrupoAberto] = useState<GrupoId | null>(null);
  const [validades, setValidades] = useState<Validade[] | null>(null);

  useEffect(() => {
    buscarTodasValidades()
      .then(setValidades)
      .catch(() => setValidades([]));
  }, []);

  useEffect(() => {
    const aoVoltar = () => {
      if (tela !== 'home') {
        setTela('home');
        return true;
      }
      if (grupoAberto) {
        setGrupoAberto(null);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', aoVoltar);
    return () => sub.remove();
  }, [tela, grupoAberto]);

  if (!usuarioAtual) return null;
  const voltar = () => setTela('home');

  switch (tela) {
    case 'visitaSupervisor':
      return <VisitaSupervisorScreen usuarioNome={usuarioAtual.nome} usuarioMatricula={usuarioAtual.matricula ?? null} ehOSupervisor onVoltar={voltar} />;
    case 'checklist':
      return <ChecklistHubScreen onVoltar={voltar} />;
    case 'visitaTecnica':
      return <VisitaTecnicaScreen usuarioNome={usuarioAtual.nome} usuarioMatricula={usuarioAtual.matricula ?? null} onVoltar={voltar} />;
    case 'perdas':
      return <PerdasAdminScreen onVoltar={voltar} />;
    case 'vendasLoja':
      return <VendasLojaScreen onVoltar={voltar} />;
    case 'vendaDia':
      return <VendaDiaScreen onVoltar={voltar} />;
    case 'relatorioMensal':
      return <RelatorioMensalScreen onVoltar={voltar} />;
    case 'vendas':
      return <VendasScreen onVoltar={voltar} />;
    case 'giro':
      return <GiroProdutosScreen onVoltar={voltar} />;
    case 'estoqueLoja':
      return <EstoqueLojaScreen onVoltar={voltar} />;
    case 'validade':
      return <ValidadeScreen onVoltar={voltar} />;
    case 'sobre':
      return <SobreScreen onVoltar={voltar} />;
  }

  return (
    <InicioUlva2
      nome={usuarioAtual.nome}
      usandoNuvem
      podeVerDono
      podeUsarIA={false}
      qtdVencendo={validades ? validades.length : null}
      qtdUrgentes={validades ? validades.filter((v) => diasRestantes(v.dataValidade) < 5).length : 0}
      grupoAberto={grupoAberto}
      onAbrirGrupo={setGrupoAberto}
      onAbrir={(t) => setTela(t)}
      onSair={() =>
        Alert.alert('Sair da conta?', 'Você vai precisar entrar de novo com nome e senha.', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sair', style: 'destructive', onPress: logout },
        ])
      }
      testando={false}
      liberado
      grupos={GRUPOS_SUPERVISOR}
      selo="Supervisor"
      mostrarSeloDados={false}
      mostrarColaboradores={false}
    />
  );
}
