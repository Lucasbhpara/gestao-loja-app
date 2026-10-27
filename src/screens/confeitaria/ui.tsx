import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Alert,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AreaTeclado from '../../components/AreaTeclado';

// Visual da Confeitaria: creme + rosa, cantos bem arredondados.
export const C = {
  fundo: '#FFF7F3',
  card: '#FFFFFF',
  rosa: '#D9668A',
  rosaEsc: '#A9445F',
  rosaClaro: '#FCE8EE',
  rosaBorda: '#F4D3DD',
  creme: '#FFF0E4',
  chocolate: '#5A3440',
  texto: '#4A3036',
  suave: '#9B8088',
  menta: '#4FA37A',
  mentaClaro: '#E2F3EA',
  ouro: '#D9A441',
  ouroClaro: '#FBF0DA',
  vermelho: '#C9483E',
  vermelhoClaro: '#FBE1DE',
  lilas: '#8E6BB8',
  lilasClaro: '#EFE7F7',
};

type Icone = React.ComponentProps<typeof Feather>['name'];

export function Topo({ titulo, sub, onVoltar, acao, icone = 'heart' }: { titulo: string; sub?: string; onVoltar?: () => void; acao?: React.ReactNode; icone?: Icone }) {
  return (
    <View style={s.topo}>
      <View style={s.topoLinha}>
        {onVoltar ? (
          <TouchableOpacity onPress={onVoltar} hitSlop={12} style={s.voltar}>
            <Feather name="chevron-left" size={20} color={C.rosaEsc} />
            <Text style={s.voltarTxt}>Voltar</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        {acao}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
        <View style={s.topoIcone}>
          <Feather name={icone} size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.topoTitulo}>{titulo}</Text>
          {sub ? <Text style={s.topoSub}>{sub}</Text> : null}
        </View>
      </View>
    </View>
  );
}

export function Cartao({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void }) {
  if (onPress)
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[s.cartao, style as any]}>
        {children}
      </TouchableOpacity>
    );
  return <View style={[s.cartao, style as any]}>{children}</View>;
}

export function Botao({
  texto,
  onPress,
  icone,
  tipo = 'cheio',
  desativado,
  style,
}: {
  texto: string;
  onPress: () => void;
  icone?: Icone;
  tipo?: 'cheio' | 'claro' | 'perigo';
  desativado?: boolean;
  style?: ViewStyle;
}) {
  const cor = tipo === 'cheio' ? '#fff' : tipo === 'perigo' ? C.vermelho : C.rosaEsc;
  return (
    <TouchableOpacity
      disabled={desativado}
      onPress={onPress}
      activeOpacity={0.85}
      style={[s.botao, tipo === 'claro' && s.botaoClaro, tipo === 'perigo' && s.botaoPerigo, desativado && { opacity: 0.5 }, style]}
    >
      {icone ? <Feather name={icone} size={17} color={cor} /> : null}
      <Text style={[s.botaoTxt, { color: cor }]}>{texto}</Text>
    </TouchableOpacity>
  );
}

export function Campo({ rotulo, dica, ...p }: TextInputProps & { rotulo: string; dica?: string }) {
  return (
    <View style={{ gap: 6, flex: (p as any).flex }}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <TextInput placeholderTextColor="#C4AEB5" {...p} style={[s.input, p.multiline && { minHeight: 70, textAlignVertical: 'top' }, p.style]} />
      {dica ? <Text style={s.dica}>{dica}</Text> : null}
    </View>
  );
}

export function Chips({ opcoes, valor, onMudar, permitirVazio }: { opcoes: string[]; valor: string | null; onMudar: (v: string | null) => void; permitirVazio?: boolean }) {
  return (
    <View style={s.chips}>
      {opcoes.map((o) => {
        const ativo = valor === o;
        return (
          <TouchableOpacity key={o} onPress={() => onMudar(ativo && permitirVazio ? null : o)} style={[s.chip, ativo && s.chipAtivo]}>
            <Text style={[s.chipTxt, ativo && s.chipTxtAtivo]}>{o}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Lista de nomes já usados (clientes, fornecedores) + digitar um novo
export function CampoComLista({ rotulo, valor, onMudar, lista, placeholder }: { rotulo: string; valor: string; onMudar: (v: string) => void; lista: string[]; placeholder?: string }) {
  const filtro = valor.trim().toLowerCase();
  const sugestoes = lista.filter((x) => !filtro || x.toLowerCase().includes(filtro)).filter((x) => x !== valor).slice(0, 8);
  return (
    <View style={{ gap: 6 }}>
      <Campo rotulo={rotulo} value={valor} onChangeText={onMudar} placeholder={placeholder} />
      {sugestoes.length ? <Chips opcoes={sugestoes} valor={null} onMudar={(v) => v && onMudar(v)} /> : null}
    </View>
  );
}

export function Folha({ visivel, titulo, onFechar, children, rodape }: { visivel: boolean; titulo: string; onFechar: () => void; children: React.ReactNode; rodape?: React.ReactNode }) {
  const topo = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 50;
  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar}>
      <AreaTeclado style={{ flex: 1, backgroundColor: C.fundo }}>
        <View style={[s.folhaTopo, { paddingTop: topo }]}>
          <Text style={s.folhaTitulo} numberOfLines={1}>
            {titulo}
          </Text>
          <Pressable onPress={onFechar} hitSlop={12} style={s.fechar}>
            <Feather name="x" size={20} color={C.rosaEsc} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {rodape ? <View style={s.folhaRodape}>{rodape}</View> : null}
      </AreaTeclado>
    </Modal>
  );
}

export function Vazio({ icone = 'coffee', texto }: { icone?: Icone; texto: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 30, gap: 10 }}>
      <Feather name={icone} size={30} color={C.rosaBorda} />
      <Text style={{ color: C.suave, textAlign: 'center', fontSize: 14 }}>{texto}</Text>
    </View>
  );
}

export function confirmar(titulo: string, msg: string, onSim: () => void, textoSim = 'Excluir') {
  Alert.alert(titulo, msg, [
    { text: 'Cancelar', style: 'cancel' },
    { text: textoSim, style: 'destructive', onPress: onSim },
  ]);
}

export async function pegarFoto(origem: 'camera' | 'galeria', base64 = false): Promise<{ uri: string; base64?: string | null } | null> {
  try {
    const perm = origem === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão', origem === 'camera' ? 'Libere a câmera para tirar a foto.' : 'Libere o acesso às fotos.');
      return null;
    }
    const op = { quality: 0.6, base64, allowsEditing: true, aspect: [4, 3] as [number, number] };
    const r = origem === 'camera' ? await ImagePicker.launchCameraAsync(op) : await ImagePicker.launchImageLibraryAsync({ ...op, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    return !r.canceled && r.assets?.[0]?.uri ? { uri: r.assets[0].uri, base64: r.assets[0].base64 } : null;
  } catch (e) {
    Alert.alert('Foto', (e as Error).message);
    return null;
  }
}

export function escolherOrigemFoto(onEscolher: (o: 'camera' | 'galeria') => void) {
  Alert.alert('Foto', 'De onde vem a foto?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Galeria', onPress: () => onEscolher('galeria') },
    { text: 'Tirar foto', onPress: () => onEscolher('camera') },
  ]);
}

export const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: C.fundo },
  topo: { backgroundColor: C.rosaClaro, paddingTop: 50, paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  topoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 30 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  voltarTxt: { color: C.rosaEsc, fontWeight: '700', fontSize: 15 },
  topoIcone: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.rosa, alignItems: 'center', justifyContent: 'center' },
  topoTitulo: { fontSize: 24, fontWeight: '800', color: C.chocolate },
  topoSub: { fontSize: 13, color: C.suave, marginTop: 2 },
  cartao: { backgroundColor: C.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.rosaBorda, gap: 8 },
  botao: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.rosa, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16, minHeight: 48 },
  botaoClaro: { backgroundColor: C.rosaClaro },
  botaoPerigo: { backgroundColor: C.vermelhoClaro },
  botaoTxt: { fontWeight: '800', fontSize: 15 },
  rotulo: { fontSize: 12, fontWeight: '800', color: C.rosaEsc, letterSpacing: 0.4, textTransform: 'uppercase' },
  dica: { fontSize: 12, color: C.suave },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.rosaBorda, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: C.texto },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: C.rosaBorda, backgroundColor: '#fff', paddingVertical: 7, paddingHorizontal: 13 },
  chipAtivo: { backgroundColor: C.rosa, borderColor: C.rosa },
  chipTxt: { fontSize: 13, fontWeight: '700', color: C.rosaEsc },
  chipTxtAtivo: { color: '#fff' },
  folhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: C.rosaClaro },
  folhaTitulo: { flex: 1, fontSize: 20, fontWeight: '800', color: C.chocolate },
  fechar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  folhaRodape: { padding: 16, paddingBottom: 26, borderTopWidth: 1, borderTopColor: C.rosaBorda, backgroundColor: '#fff', gap: 10 },
  titulo: { fontSize: 16, fontWeight: '800', color: C.chocolate },
  sub: { fontSize: 13, color: C.suave },
  valor: { fontSize: 20, fontWeight: '800', color: C.chocolate },
  secao: { fontSize: 17, fontWeight: '800', color: C.chocolate, marginTop: 6 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, fontSize: 12, fontWeight: '800', overflow: 'hidden' },
  busca: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.rosaBorda, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.texto, marginTop: 12 },
  fab: { position: 'absolute', right: 18, bottom: 28, backgroundColor: C.rosa, borderRadius: 30, paddingHorizontal: 20, height: 56, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 4, shadowColor: C.rosaEsc, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  fabTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
