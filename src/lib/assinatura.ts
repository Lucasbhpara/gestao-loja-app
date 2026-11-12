// Assinatura que vai no rodapé de todos os arquivos (PDFs) do ULVA.
export const ASSINATURA_ULVA = 'ULVA · Unified Live View App · by Lucas Alberto';

// Põe a assinatura no fim do documento, se ainda não estiver lá.
export function comAssinatura(html: string): string {
  if (html.includes('Unified Live View App')) return html;
  const div = `<div style="margin-top:14px;padding-top:6px;border-top:1px solid #E3E7EE;font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#8A93A5;text-align:center">${ASSINATURA_ULVA}</div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${div}</body>`) : html + div;
}
