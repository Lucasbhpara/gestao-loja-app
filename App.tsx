import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import IntroScreen from './src/screens/IntroScreen';
import LoginScreen from './src/screens/LoginScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import CreatePasswordScreen from './src/screens/CreatePasswordScreen';
import HomeColaboradorScreen from './src/screens/HomeColaboradorScreen';
import HomeAdminScreen from './src/screens/HomeAdminScreen';
import JornalOfertasFlutuante from './src/components/JornalOfertasFlutuante';
import Rodape from './src/components/Rodape';
import { colors } from './src/theme/colors';

type TelaPublica = 'login' | 'recuperarSenha';

function AppInterno() {
  const { carregando, usuarioAtual } = useAuth();
  const [telaPublica, setTelaPublica] = useState<TelaPublica>('login');

  // O vídeo de abertura toca depois do login (não na hora de abrir o app):
  // a pessoa entra com matrícula/senha e, em vez de cair direto na Home
  // com as funções, vê o vídeo primeiro. Continua tocando uma vez só por
  // sessão — se ela sair da conta, volta a tocar no próximo login.
  const [mostrarIntro, setMostrarIntro] = useState(true);
  useEffect(() => {
    if (!usuarioAtual) setMostrarIntro(true);
  }, [usuarioAtual]);

  // Seta/gesto nativo de voltar do Android: na tela de "Esqueci a senha",
  // volta pro Login em vez de sair do app (o resto das telas internas já
  // trata isso sozinho, dentro de cada Home).
  useEffect(() => {
    const aoVoltar = () => {
      if (!usuarioAtual && telaPublica === 'recuperarSenha') {
        setTelaPublica('login');
        return true;
      }
      return false;
    };
    const assinatura = BackHandler.addEventListener('hardwareBackPress', aoVoltar);
    return () => assinatura.remove();
  }, [usuarioAtual, telaPublica]);

  const logadoEValidado = !!usuarioAtual && usuarioAtual.senhaDefinida;
  const tocandoIntro = logadoEValidado && mostrarIntro;

  let conteudo: React.ReactNode;

  if (carregando) {
    conteudo = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator color={colors.navy700} size="large" />
      </View>
    );
  } else if (!usuarioAtual) {
    // Não logado: alterna entre Login e Recuperar Senha. O vídeo ainda não
    // aparece aqui — só depois que a pessoa realmente entrar.
    conteudo = (
      <>
        {telaPublica === 'recuperarSenha' ? (
          <ForgotPasswordScreen onVoltarParaLogin={() => setTelaPublica('login')} />
        ) : (
          <LoginScreen onIrParaRecuperarSenha={() => setTelaPublica('recuperarSenha')} />
        )}
        <Rodape />
      </>
    );
  } else if (!usuarioAtual.senhaDefinida) {
    // Logado, mas ainda usando a matrícula como senha provisória: obriga a
    // trocar antes de liberar o resto do app (e antes do vídeo também).
    conteudo = (
      <>
        <CreatePasswordScreen />
        <Rodape />
      </>
    );
  } else if (tocandoIntro) {
    conteudo = <IntroScreen onFim={() => setMostrarIntro(false)} />;
  } else {
    // Logado, com senha própria definida e vídeo já visto nessa sessão:
    // cada perfil vê sua Home.
    conteudo = (
      <>
        {usuarioAtual.isAdmin ? <HomeAdminScreen /> : <HomeColaboradorScreen />}
        <JornalOfertasFlutuante />
        <Rodape />
      </>
    );
  }

  return (
    <>
      <StatusBar style={tocandoIntro ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>{conteudo}</View>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInterno />
    </AuthProvider>
  );
}
