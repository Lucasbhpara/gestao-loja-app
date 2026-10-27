import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import AreaTeclado from '../components/AreaTeclado';

// Tela de entrada no visual do ULVA 2.0: fundo azul-marinho com o "U" da
// logo nova grande ao fundo. "Lembrar meu login" guarda nome e senha neste
// celular (AsyncStorage) e já preenche os campos na próxima vez — basta tocar
// em Entrar. Desmarcar apaga o que estava guardado.
//
// O "U" é desenhado com Views (sem biblioteca de SVG) para funcionar pela
// atualização OTA, sem precisar de versão nova na Play Store.

const NAVY = '#0E1B2C';
const NAVY_CARD = 'rgba(22, 38, 61, 0.78)'; // levemente transparente: o "U" do fundo aparece por trás
const NAVY_BORDA = '#26395A';
const AZUL = '#2F7BFF';
const CLARO = '#F4F5F7';
const CINZA = '#9AA8BF';

const CHAVE_LEMBRAR = 'login:lembrado';

interface Props {
  onIrParaRecuperarSenha: () => void;
}

// "U" com o ponto azul, no mesmo desenho do ícone (proporções do ícone 1024px).
function LogoU({ tamanho, opacidade = 1 }: { tamanho: number; opacidade?: number }) {
  const largura = tamanho * 0.56; // braços do U de ponta a ponta
  const espessura = tamanho * 0.115;
  const altura = tamanho * 0.62;
  const ponto = tamanho * 0.175;
  return (
    <View style={{ width: largura, height: altura, opacity: opacidade }}>
      {/* corpo do U */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: espessura / 2,
          bottom: 0,
          borderLeftWidth: espessura,
          borderRightWidth: espessura,
          borderBottomWidth: espessura,
          borderColor: CLARO,
          borderBottomLeftRadius: largura / 2,
          borderBottomRightRadius: largura / 2,
        }}
      />
      {/* pontas arredondadas dos braços */}
      <View style={{ position: 'absolute', left: 0, top: 0, width: espessura, height: espessura, borderRadius: espessura / 2, backgroundColor: CLARO }} />
      <View style={{ position: 'absolute', right: 0, top: 0, width: espessura, height: espessura, borderRadius: espessura / 2, backgroundColor: CLARO }} />
      {/* ponto azul */}
      <View
        style={{
          position: 'absolute',
          left: (largura - ponto) / 2,
          top: altura * 0.38,
          width: ponto,
          height: ponto,
          borderRadius: ponto / 2,
          backgroundColor: AZUL,
        }}
      />
    </View>
  );
}

export default function LoginScreen({ onIrParaRecuperarSenha }: Props) {
  const { login } = useAuth();
  const { width, height } = useWindowDimensions();
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Preenche com o login guardado neste celular
  useEffect(() => {
    AsyncStorage.getItem(CHAVE_LEMBRAR)
      .then((bruto) => {
        if (!bruto) return;
        const salvo = JSON.parse(bruto) as { nome?: string; senha?: string };
        if (salvo.nome) setNome(salvo.nome);
        if (salvo.senha) setSenha(salvo.senha);
        setLembrar(true);
      })
      .catch(() => {});
  }, []);

  async function handleEntrar() {
    if (!nome.trim() || !senha.trim()) {
      setErro('Preencha usuário e senha.');
      return;
    }
    setErro(null);
    setEnviando(true);
    const resultado = await login(nome, senha);
    setEnviando(false);
    if (!resultado.ok) {
      setErro(resultado.erro ?? 'Não foi possível entrar.');
      return;
    }
    try {
      if (lembrar) await AsyncStorage.setItem(CHAVE_LEMBRAR, JSON.stringify({ nome: nome.trim(), senha: senha.trim() }));
      else await AsyncStorage.removeItem(CHAVE_LEMBRAR);
    } catch {
      // sem armazenamento: só não lembra da próxima vez
    }
  }

  async function alternarLembrar() {
    const novo = !lembrar;
    setLembrar(novo);
    if (!novo) AsyncStorage.removeItem(CHAVE_LEMBRAR).catch(() => {});
  }

  // U inteiro ao fundo: ocupa ~85% da largura da tela (cabe também no tablet)
  const tamanhoFundo = Math.min(width * 1.45, height * 0.8);

  return (
    <View style={styles.flex}>
      {/* "U" grande ao fundo */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.fundo]}>
        <View style={{ marginTop: -height * 0.3 }}>
          <LogoU tamanho={tamanhoFundo} opacidade={0.09} />
        </View>
      </View>

      <AreaTeclado style={styles.flex}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.marca}>
            <View style={styles.iconeLogo}>
              <LogoU tamanho={62} />
            </View>
            <Text style={styles.titulo}>ULVA</Text>
            <Text style={styles.slogan}>A loja inteira na palma da mão.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>USUÁRIO</Text>
            <View style={styles.campo}>
              <Feather name="user" size={17} color={CINZA} />
              <TextInput
                style={styles.input}
                placeholder="Digite seu nome"
                placeholderTextColor="#6F7E97"
                autoCapitalize="words"
                autoComplete="username"
                textContentType="username"
                value={nome}
                onChangeText={setNome}
              />
            </View>

            <Text style={[styles.label, { marginTop: 16 }]}>SENHA</Text>
            <View style={styles.campo}>
              <Feather name="lock" size={17} color={CINZA} />
              <TextInput
                style={styles.input}
                placeholder="Sua matrícula (primeiro acesso)"
                placeholderTextColor="#6F7E97"
                secureTextEntry={!verSenha}
                autoComplete="password"
                textContentType="password"
                value={senha}
                onChangeText={setSenha}
                onSubmitEditing={handleEntrar}
                returnKeyType="go"
              />
              <TouchableOpacity onPress={() => setVerSenha((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name={verSenha ? 'eye-off' : 'eye'} size={17} color={CINZA} />
              </TouchableOpacity>
            </View>

            <View style={styles.linhaOpcoes}>
              <Pressable style={styles.lembrar} onPress={alternarLembrar} hitSlop={8}>
                <View style={[styles.caixa, lembrar && styles.caixaMarcada]}>{lembrar ? <Feather name="check" size={13} color={CLARO} /> : null}</View>
                <Text style={styles.lembrarTexto}>Lembrar meu login</Text>
              </Pressable>
              <TouchableOpacity onPress={onIrParaRecuperarSenha}>
                <Text style={styles.esqueci}>Esqueci minha senha</Text>
              </TouchableOpacity>
            </View>

            {erro ? <Text style={styles.erro}>{erro}</Text> : null}

            <TouchableOpacity style={[styles.botao, enviando && { opacity: 0.7 }]} onPress={handleEntrar} disabled={enviando} activeOpacity={0.85}>
              {enviando ? <ActivityIndicator color={CLARO} /> : <Text style={styles.botaoTexto}>Entrar</Text>}
            </TouchableOpacity>
          </View>

          <Text style={styles.assinatura}>Idealizado por Lucas Alberto</Text>
        </ScrollView>
      </AreaTeclado>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: NAVY },
  fundo: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingTop: 64, paddingBottom: 36 },
  marca: { alignItems: 'center', marginBottom: 28 },
  iconeLogo: {
    width: 96,
    height: 96,
    borderRadius: 26,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: NAVY_BORDA,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    marginBottom: 18,
  },
  titulo: { fontSize: 34, fontWeight: '800', color: CLARO, letterSpacing: 1 },
  slogan: { fontSize: 14, color: CINZA, marginTop: 6 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: NAVY_CARD,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: NAVY_BORDA,
  },
  label: { fontSize: 11, fontWeight: '800', color: CINZA, letterSpacing: 0.8, marginBottom: 8 },
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(14, 27, 44, 0.85)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: NAVY_BORDA,
    paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, color: CLARO },
  linhaOpcoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 10, flexWrap: 'wrap' },
  lembrar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  caixa: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#4A5E80', alignItems: 'center', justifyContent: 'center' },
  caixaMarcada: { backgroundColor: AZUL, borderColor: AZUL },
  lembrarTexto: { color: CLARO, fontSize: 13, fontWeight: '600' },
  esqueci: { color: AZUL, fontSize: 13, fontWeight: '700' },
  erro: { color: '#FF8A80', fontSize: 13, marginTop: 14 },
  botao: { backgroundColor: AZUL, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  botaoTexto: { color: CLARO, fontSize: 16, fontWeight: '800' },
  assinatura: { color: CINZA, fontSize: 12, fontWeight: '600', marginTop: 28 },
});
