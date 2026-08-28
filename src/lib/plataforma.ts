import { Platform } from 'react-native';

// A leitura de código de barras em tempo real (câmera aberta o tempo todo)
// funciona de forma instável em navegador — principalmente no Safari do
// iPhone. Por enquanto, na versão web, a gente esconde o botão "Escanear" e
// deixa só a busca por digitação (que já existe em toda tela que tem
// scanner). No app instalado (Android/iOS nativo) continua tudo normal.
export const camaraDisponivel = Platform.OS !== 'web';

// A versão web roda em qualquer navegador (computador ou celular), então
// esse texto ajuda a diferenciar quando faz sentido (ex: "toque" vs "clique").
export const rodandoNaWeb = Platform.OS === 'web';
