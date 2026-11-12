import { documentoUlva, kpi, rotulo, PDF_VERDE } from './layoutPdf';
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
  const fotos = (us: string[]) => (us.length ? `<div class="fotos">${us.map((u) => `<img class="fotop" src="${u}" />`).join('')}</div>` : '');
  const itens = c.itens
    .map((i, n) => {
      const depoisTitulo = i.status === 'corrigido' ? 'Corrigido' : i.status === 'nao_possivel' ? 'Não foi possível' : 'Pendente';
      const selo = i.aprovacao === 'aprovado' ? '<span class="badge b-sim">Aprovado</span>' : i.aprovacao === 'devolvido' ? '<span class="badge b-nao">Devolvido</span>' : '';
      return `
      <div class="item">
        <div class="topo"><div class="texto">${n + 1}. ${esc(i.perguntaTexto)}${i.critico ? ' <span class="critico">CRÍTICO</span>' : ''}</div>${selo}</div>
        <div class="cols">
          <div class="col antes"><div class="rot">Antes — apontado</div>${i.observacaoOriginal ? `<div class="txt">${esc(i.observacaoOriginal)}</div>` : ''}${fotos(i.fotosAntes)}</div>
          <div class="col depois"><div class="rot">Depois — ${depoisTitulo}</div>${i.comentario ? `<div class="txt">${esc(i.comentario)}</div>` : ''}${fotos(i.fotosDepois)}${i.respondidoPor ? `<div class="meta">${esc(i.respondidoPor)} · ${dataHora(i.respondidoEm)}</div>` : ''}</div>
        </div>
        ${i.aprovacao === 'devolvido' && i.aprovacaoObs ? `<div class="det" style="color:#B42318">Devolvido: ${esc(i.aprovacaoObs)}</div>` : ''}
      </div>`;
    })
    .join('');
  const t = c.tarefa;
  const aprovados = c.itens.filter((i) => i.aprovacao === 'aprovado').length;
  const corrigidos = c.itens.filter((i) => i.status === 'corrigido').length;
  const direita = [`Apontado por ${esc(c.feitoPor)}`, dataHora(c.feitoEm)];
  if (t.correcaoEnviadaPor) direita.push(`Corrigido por ${esc(t.correcaoEnviadaPor)}`);
  if (t.correcaoAvaliadaPor) direita.push(`Avaliado por ${esc(t.correcaoAvaliadaPor)} · ${t.correcaoStatus === 'aprovada' ? 'APROVADA' : 'em andamento'}`);
  return documentoUlva({
    tipo: 'Correção',
    titulo: t.titulo,
    direita,
    css: `.cols{display:flex;gap:10px;margin-top:8px}.col{flex:1;border-radius:6px;padding:8px 10px}.antes{background:#FEF4F3}.depois{background:#F0F9F3}
      .rot{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#6B7486;font-weight:700;margin-bottom:4px}.txt{font-size:11.5px;line-height:1.45}
      .meta{font-size:9.5px;color:#8A93A5;margin-top:4px}.fotop{width:112px;height:86px;object-fit:cover;border-radius:4px;border:1px solid #E3E7EE}`,
    corpo: `
      <div class="kpis">${kpi('Itens', String(c.itens.length))}${kpi('Corrigidos', String(corrigidos), PDF_VERDE)}${kpi('Aprovados', String(aprovados), aprovados === c.itens.length ? PDF_VERDE : undefined)}</div>
      ${rotulo('Antes e depois')}
      ${itens}`,
  });
}

export async function compartilharCorrecao(c: Correcao): Promise<void> {
  await compartilharPdf(montarHtmlCorrecao(c), `correcao-${c.tarefa.titulo}-${dataParaNomeArquivo(new Date().toISOString())}`);
}
