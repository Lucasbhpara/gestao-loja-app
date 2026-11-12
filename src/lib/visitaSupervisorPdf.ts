import { documentoUlva, kpi, rotulo, PDF_VERMELHO } from './layoutPdf';
import { VisitaSupervisor, ItemVisitaSup, SETORES_VISITA_SUP, listarItensSup } from '../data/visitaSupervisorApi';
import { compartilharPdf, dataParaNomeArquivo } from './compartilharPdf';

// PDF da Visita Supervisor — mesmo visual da Visita Técnica / Checklist:
// cabeçalho, resumo, e por setor (gaveta) cada orientação com as fotos e se
// virou tarefa para o encarregado.

const esc = (t: string) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataHora = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export function montarHtmlVisitaSup(visita: VisitaSupervisor, itens: ItemVisitaSup[]): string {
  const comTarefa = itens.filter((i) => i.virarTarefa).length;
  const setoresComItem = SETORES_VISITA_SUP.filter((s) => itens.some((i) => i.setor === s.key));
  const blocos = setoresComItem
    .map((s) => {
      const lista = itens.filter((i) => i.setor === s.key);
      return `${rotulo(s.nome, `${lista.length} ${lista.length === 1 ? 'orientação' : 'orientações'}`)}
      ${lista
        .map(
          (i, k) => `<div class="item ${i.prioridade === 'alta' ? 'ruim' : ''}">
          <div class="topo">
            <div class="texto" style="white-space:pre-wrap">${k + 1}. ${esc(i.descricao)}</div>
            ${i.virarTarefa ? '<span class="badge b-azul">Tarefa p/ encarregado</span>' : '<span class="badge b-na">Orientação</span>'}
          </div>
          ${
            i.prioridade === 'alta' || i.prazo
              ? `<div class="det">${i.prioridade === 'alta' ? `<b style="color:${PDF_VERMELHO}">Muito importante</b>` : ''}${i.prioridade === 'alta' && i.prazo ? ' · ' : ''}${i.prazo ? `Prazo: ${dataBr(i.prazo)}` : ''}</div>`
              : ''
          }
          ${i.fotos.length ? `<div class="fotos">${i.fotos.map((u) => `<img class="foto" src="${u}" />`).join('')}</div>` : ''}
        </div>`,
        )
        .join('')}`;
    })
    .join('');
  const semNada = SETORES_VISITA_SUP.filter((s) => !itens.some((i) => i.setor === s.key)).map((s) => s.nome);

  return documentoUlva({
    tipo: 'Visita do supervisor',
    titulo: 'Loja 327',
    direita: [`Supervisor: ${esc(visita.supervisorNome)}`, `Registrada por ${esc(visita.registradaPorNome)}`, visita.finalizadaEm ? `Finalizada em ${dataHora(visita.finalizadaEm)}` : `Iniciada em ${dataHora(visita.iniciadaEm)} · em andamento`],
    corpo: `
      <div class="kpis">${kpi('Orientações', String(itens.length))}${kpi('Viraram tarefa', String(comTarefa), '#1D4ED8')}${kpi('Setores com orientação', `${setoresComItem.length} / ${SETORES_VISITA_SUP.length}`)}</div>
      ${blocos || '<div class="vazio">Nenhuma orientação registrada nesta visita.</div>'}
      ${semNada.length && itens.length ? `<div class="vazio">Sem orientações: ${semNada.map(esc).join(', ')}.</div>` : ''}
      ${visita.observacoes ? `${rotulo('Observações gerais')}<div class="caixa">${esc(visita.observacoes)}</div>` : ''}`,
  });
}

export async function compartilharVisitaSup(visita: VisitaSupervisor, itens?: ItemVisitaSup[]): Promise<void> {
  const lista = itens ?? (await listarItensSup(visita.id));
  await compartilharPdf(montarHtmlVisitaSup(visita, lista), `visita-supervisor-${dataParaNomeArquivo(visita.iniciadaEm)}`, 'Compartilhar visita do supervisor');
}
