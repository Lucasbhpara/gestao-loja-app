import { rodandoNaWeb } from './plataforma';

// Baixa um arquivo público (ex.: a foto de um aviso) a partir da URL.
//
// No navegador, baixa direto — igual clicar num link de download (não abre
// o arquivo numa aba nova, força o download mesmo). No app instalado
// (Android/iOS), baixa pro celular e abre a tela nativa de compartilhar,
// onde dá pra salvar nas Fotos, mandar por WhatsApp, etc. — não existe uma
// pasta "Downloads" única e confiável em todo celular, então deixar a
// pessoa escolher onde salvar pela tela de compartilhar é o jeito que
// funciona em qualquer aparelho.
export async function baixarArquivo(url: string, nomeArquivo: string): Promise<void> {
  if (rodandoNaWeb) {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error('Não consegui baixar o arquivo.');
    const blob = await resposta.blob();
    const urlObjeto = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = urlObjeto;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(urlObjeto);
    return;
  }

  // Só importa os módulos nativos quando realmente precisa deles — eles não
  // existem na versão web.
  const FileSystem = await import('expo-file-system');
  const Sharing = await import('expo-sharing');

  const caminho = `${FileSystem.cacheDirectory}${nomeArquivo}`;
  const resultado = await FileSystem.downloadAsync(url, caminho);

  const podeCompartilhar = await Sharing.isAvailableAsync();
  if (!podeCompartilhar) {
    throw new Error(`Não consegui abrir a tela de compartilhar nesse celular. O arquivo ficou salvo em: ${resultado.uri}`);
  }
  await Sharing.shareAsync(resultado.uri, { dialogTitle: 'Salvar ou enviar arquivo' });
}

// Deduz uma extensão de arquivo a partir da URL (fallback: .jpg, já que hoje
// só existe foto nos avisos).
export function extensaoDaUrl(url: string): string {
  const semQuery = url.split('?')[0];
  const match = semQuery.match(/\.([a-zA-Z0-9]{2,5})$/);
  return match ? match[1].toLowerCase() : 'jpg';
}

// Monta um nome de arquivo amigável a partir do título do aviso, pra quem
// baixar já reconhecer do que se trata (em vez de um nome tipo
// "1787862797212_483920.jpg").
export function nomeArquivoAmigavel(titulo: string, url: string): string {
  const base = titulo
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'aviso';
  return `${base}.${extensaoDaUrl(url)}`;
}
