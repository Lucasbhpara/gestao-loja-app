import * as Print from 'expo-print';
import { rodandoNaWeb } from './plataforma';

// Gera um PDF a partir de um HTML e abre a tela nativa de compartilhar do
// celular (WhatsApp, e-mail, Drive, salvar no aparelho…). Usado pelos
// checklists (Checklist de Setor e Visita Técnica): logo que finaliza, e
// depois pela lista de checklists já finalizados.
//
// Na versão web não existe tela de compartilhar de arquivo — cai pro
// diálogo de impressão do navegador, onde dá pra "Salvar como PDF".
export async function compartilharPdf(html: string, nomeBase: string): Promise<void> {
  if (rodandoNaWeb) {
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });

  // printToFileAsync gera um nome aleatório (ex.: "4f1c…pdf"). Renomeia pra
  // algo que a pessoa reconheça no WhatsApp ("checklist-acougue-09-10-2026.pdf").
  // Mesmo import 'legacy' usado em baixarArquivo.ts / exportarPlanilha.ts.
  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');

  const nome = `${nomeArquivo(nomeBase)}.pdf`;
  const destino = `${FileSystem.cacheDirectory}${nome}`;
  let arquivo = uri;
  try {
    await FileSystem.deleteAsync(destino, { idempotent: true });
    await FileSystem.moveAsync({ from: uri, to: destino });
    arquivo = destino;
  } catch {
    // Se não der pra renomear, compartilha com o nome gerado mesmo.
  }

  if (!(await Sharing.isAvailableAsync())) {
    // Sem tela de compartilhar nesse aparelho — pelo menos abre a impressão.
    await Print.printAsync({ html });
    return;
  }
  await Sharing.shareAsync(arquivo, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Compartilhar checklist',
  });
}

function nomeArquivo(base: string): string {
  return (
    base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'checklist'
  );
}

export function dataParaNomeArquivo(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}
