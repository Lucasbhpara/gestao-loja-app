import { Correcao } from '../data/correcaoApi';
import { compartilharPdf, dataParaNomeArquivo } from './compartilharPdf';

// PDF da correção: para cada "Não", o ANTES (o que foi apontado, com fotos)
// e o DEPOIS (o que o encarregado fez, com fotos) lado a lado, mais a
// aprovação. Mesmo estilo dos outros PDFs (preto no branco).

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function dataHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function montarHtmlCorrecao(c: Correcao): string {
  const fotos = (us: string[]) => (us.length ? `<div class="fotos">${us.map((u) => `<img src="${u}" />`).join('')}</div>` : '');
  const itens = c.itens
    .map((i, n) => {
      const depoisTitulo = i.status === 'corrigido' ? 'Corrigido' : i.status === 'nao_possivel' ? 'Não foi possível' : 'Pendente';
      const selo = i.aprovacao === 'aprovado' ? '<span class="selo ok">Aprovado</span>' : i.aprovacao === 'devolvido' ? '<span class="selo dev">Devolvido</span>' : '';
      return `
      <div class="item">
        <div class="topo"><div class="perg">${n + 1}. ${esc(i.perguntaTexto)}${i.critico ? ' <span class="crit">CRÍTICO</span>' : ''}</div>${selo}</div>
        <div class="cols">
          <div class="col antes"><div class="rot">Antes — apontado</div>${i.observacaoOriginal ? `<div class="txt">${esc(i.observacaoOriginal)}</div>` : ''}${fotos(i.fotosAntes)}</div>
          <div class="col depois"><div class="rot">Depois — ${depoisTitulo}</div>${i.comentario ? `<div class="txt">${esc(i.comentario)}</div>` : ''}${fotos(i.fotosDepois)}${i.respondidoPor ? `<div class="meta">${esc(i.respondidoPor)} · ${dataHora(i.respondidoEm)}</div>` : ''}</div>
        </div>
        ${i.aprovacao === 'devolvido' && i.aprovacaoObs ? `<div class="obs">Devolvido: ${esc(i.aprovacaoObs)}</div>` : ''}
      </div>`;
    })
    .join('');
  const t = c.tarefa;
  return `<html><head><meta charset="utf-8" /><style>
    * { box-sizing: border-box; } body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1A2340; padding: 24px 28px; }
    h1 { font-size: 20px; margin: 0 0 4px; } .sub { font-size: 11.5px; color: #666; margin-bottom: 3px; }
    .item { border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; margin-top: 12px; page-break-inside: avoid; }
    .topo { display: flex; justify-content: space-between; gap: 10px; } .perg { font-size: 12.5px; font-weight: 700; flex: 1; }
    .crit { font-size: 9px; color: #C5392F; border: 1px solid #C5392F; border-radius: 4px; padding: 1px 4px; }
    .selo { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 20px; height: fit-content; } .ok { background: #DCF2E7; color: #2C8F5E; } .dev { background: #FBDEDC; color: #C5392F; }
    .cols { display: flex; gap: 10px; margin-top: 8px; } .col { flex: 1; border-radius: 6px; padding: 8px; } .antes { background: #FDF1F0; } .depois { background: #EEF8F2; }
    .rot { font-size: 9.5px; text-transform: uppercase; letter-spacing: .4px; color: #777; font-weight: 700; margin-bottom: 4px; }
    .txt { font-size: 11.5px; } .meta { font-size: 9.5px; color: #888; margin-top: 4px; } .obs { font-size: 11px; color: #C5392F; margin-top: 6px; }
    .fotos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; } .fotos img { width: 110px; height: 85px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; }
    .rodape { margin-top: 24px; font-size: 9.5px; color: #999; text-align: center; }
  </style></head><body>
    <h1>Correção — ${esc(t.titulo)}</h1>
    <div class="sub">Apontado por ${esc(c.feitoPor)} em ${dataHora(c.feitoEm)}</div>
    ${t.correcaoEnviadaPor ? `<div class="sub">Corrigido por ${esc(t.correcaoEnviadaPor)}</div>` : ''}
    ${t.correcaoAvaliadaPor ? `<div class="sub">Avaliado por ${esc(t.correcaoAvaliadaPor)} · ${t.correcaoStatus === 'aprovada' ? 'APROVADA' : 'em andamento'}</div>` : ''}
    ${itens}
    <div class="rodape">Gerado pelo app ULVA em ${dataHora(new Date().toISOString())} · by Lucas Alberto</div>
  </body></html>`;
}

export async function compartilharCorrecao(c: Correcao): Promise<void> {
  await compartilharPdf(montarHtmlCorrecao(c), `correcao-${c.tarefa.titulo}-${dataParaNomeArquivo(new Date().toISOString())}`);
}
