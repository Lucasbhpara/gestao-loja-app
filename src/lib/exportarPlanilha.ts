import * as XLSX from 'xlsx';
import { rodandoNaWeb } from './plataforma';

// Gera uma planilha .xlsx a partir de uma lista de linhas (cada linha é um
// objeto onde as chaves viram o cabeçalho das colunas).
//
// No app instalado (Android/iOS), abre a tela nativa de compartilhar do
// celular (WhatsApp, Gmail, Drive, etc.). No navegador não existe essa tela
// nativa — o próprio navegador já baixa o arquivo direto (igual clicar num
// link de download), então usamos o caminho da própria biblioteca `xlsx`
// pra isso, que já sabe fazer isso em navegador.
export async function exportarContagemXlsx(nomeArquivo: string, linhas: Record<string, any>[]): Promise<void> {
  const planilha = XLSX.utils.json_to_sheet(linhas);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Contagem');

  if (rodandoNaWeb) {
    XLSX.writeFile(livro, nomeArquivo, { bookType: 'xlsx' });
    return;
  }

  // Só importa os módulos nativos quando realmente precisa deles — eles não
  // existem na versão web.
  const FileSystem = await import('expo-file-system');
  const Sharing = await import('expo-sharing');

  const base64 = XLSX.write(livro, { type: 'base64', bookType: 'xlsx' }) as string;
  const caminho = `${FileSystem.cacheDirectory}${nomeArquivo}`;
  await FileSystem.writeAsStringAsync(caminho, base64, { encoding: FileSystem.EncodingType.Base64 });

  const podeCompartilhar = await Sharing.isAvailableAsync();
  if (!podeCompartilhar) {
    throw new Error(`Não consegui abrir a tela de compartilhar nesse celular. A planilha ficou salva em: ${caminho}`);
  }
  await Sharing.shareAsync(caminho, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Enviar planilha de contagem',
    UTI: 'com.microsoft.excel.xlsx',
  });
}
