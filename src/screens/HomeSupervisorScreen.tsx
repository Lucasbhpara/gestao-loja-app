import React, { useEffect, useState } from 'react';
import { Alert, BackHandler } from 'react-native';
import { useAuth } from '../context/AuthContext';
import InicioUlva2, { Grupo, GrupoId, TelaFerramenta } from './InicioUlva2';
import VisitaSupervisorScreen from './VisitaSupervisorScreen';
import ChecklistHubScreen from './ChecklistHubScreen';
import VisitaTecnicaScreen from './VisitaTecnicaScreen';
import VendasLojaScreen from './VendasLojaScreen';
import VendaDiaScreen from './VendaDiaScreen';
import ValidadeScreen from './ValidadeScreen';
import SobreScreen from './SobreScreen';
import BuscaProdutoScreen from './BuscaProdutoScreen';
import ContagemFocoScreen from './ContagemFocoScreen';
import { Validade, buscarTodasValidades } from '../data/validadeApi';
import { diasRestantes } from '../lib/validadeUtils';

// =============================================================================
// Início do SUPERVISOR — colaborador (não administrador) com a função
// "Supervisor" cadastrada no Portal (ver ehSupervisor em visitaSupervisorApi).
// Vê: Contagem nas lojas (itens foco), Visita Supervisor, checklist, visita
// técnica, vendas da loja / venda do dia e a busca de produto (código de barras).
// =============================================================================

const GRUPOS_SUPERVISOR: Grupo[] = [
  {
    id: 'rotina', nome: 'Rotina da Loja', desc: 'Visita do supervisor, contagem nas lojas e checklists',
    icone: 'check-circle', cor: '#2F7BFF', fundo: '#E3EDFF',
    ferramentas: [
      { nome: 'Contagem nas lojas', desc: 'Itens foco: manda o link, acompanha cada loja e compartilha as rupturas', icone: 'radio', tela: 'contagemFoco' },
      { nome: 'Visita Supervisor', desc: 'Orientações por setor, com fotos e PDF', icone: 'user-check', tela: 'visitaSupervisor' },
      { nome: 'Checklist', desc: 'Rotina do dia e avaliação de setor', icone: 'check-square', tela: 'checklist' },
      { nome: 'Visita Técnica', desc: 'Checklist do técnico veterinário', icone: 'shield', tela: 'visitaTecnica' },
    ],
  },
  {
    id: 'resultados', nome: 'Resultados', desc: 'Venda da loja e venda do dia',
    icone: 'activity', cor: '#178553', fundo: '#DFF3E8',
    ferramentas: [
      { nome: 'Vendas da Loja', desc: 'Venda por setor e por dia', icone: 'pie-chart', tela: 'vendasLoja' },
      { nome: 'Venda do dia', desc: 'Total, setores, top 10 e PDF', icone: 'calendar', tela: 'vendaDia' },
    ],
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
    case 'vendasLoja':
      return <VendasLojaScreen onVoltar={voltar} />;
    case 'vendaDia':
      return <VendaDiaScreen onVoltar={voltar} />;
    case 'validade':
      return <ValidadeScreen onVoltar={voltar} />;
    case 'buscaProduto':
      return <BuscaProdutoScreen onVoltar={voltar} podeMapear={false} />;
    case 'contagemFoco':
      return <ContagemFocoScreen onVoltar={voltar} />;
    case 'sobre':
      return <SobreScreen onVoltar={voltar} />;
  }

  return (
    <InicioUlva2
      nome={usuarioAtual.nome}
      usandoNuvem
      podeVerDono
      mostrarBuscaProduto
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
