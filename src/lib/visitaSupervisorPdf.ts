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
      return `<h3 class="grupo">${esc(s.nome)} <span class="qtd">${lista.length} ${lista.length === 1 ? 'orientação' : 'orientações'}</span></h3>
      ${lista
        .map(
          (i, k) => `<div class="item ${i.prioridade === 'alta' ? 'alta' : ''}">
          <div class="topo">
            <div class="texto">${k + 1}. ${esc(i.descricao)}</div>
            ${i.virarTarefa ? `<span class="badge tarefa">Tarefa p/ encarregado</span>` : `<span class="badge info">Orientação</span>`}
          </div>
          ${
            i.prioridade === 'alta' || i.prazo
              ? `<div class="meta">${i.prioridade === 'alta' ? '<b style="color:#C5392F">Muito importante</b>' : ''}${i.prioridade === 'alta' && i.prazo ? ' · ' : ''}${
                  i.prazo ? `Prazo: ${dataBr(i.prazo)}` : ''
                }</div>`
              : ''
          }
          ${i.fotos.length ? `<div class="fotos">${i.fotos.map((u) => `<img class="foto" src="${u}" />`).join('')}</div>` : ''}
        </div>`,
        )
        .join('')}`;
    })
    .join('');
  const semNada = SETORES_VISITA_SUP.filter((s) => !itens.some((i) => i.setor === s.key)).map((s) => s.nome);

  return `<html><head><meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1A2340; padding: 24px 28px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .sub { font-size: 11.5px; color: #666; margin-bottom: 4px; }
    .resumo { display: flex; gap: 10px; margin: 16px 0 18px; flex-wrap: wrap; }
    .box { flex: 1; min-width: 110px; border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; }
    .rot { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.4px; }
    .val { font-size: 18px; font-weight: 700; margin-top: 2px; }
    .grupo { font-size: 13px; margin: 18px 0 8px; color: #1B2A6B; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .qtd { font-size: 10.5px; color: #888; font-weight: 400; }
    .item { border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
    .alta { border-color: #E86A5F; }
    .topo { display: flex; justify-content: space-between; gap: 10px; }
    .texto { font-size: 12.5px; font-weight: 600; flex: 1; white-space: pre-wrap; }
    .badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 20px; white-space: nowrap; height: fit-content; }
    .tarefa { background: #E3EDFF; color: #1B4FD1; } .info { background: #eee; color: #666; }
    .meta { font-size: 11px; color: #555; margin-top: 6px; }
    .fotos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .foto { width: 200px; height: 150px; object-fit: cover; border-radius: 6px; display: block; border: 1px solid #ddd; }
    .obs { border: 1px solid #1B2A6B; border-radius: 8px; padding: 12px 14px; margin-top: 18px; font-size: 12.5px; white-space: pre-wrap; page-break-inside: avoid; }
    .nada { font-size: 11px; color: #888; margin-top: 12px; }
    .rodape { margin-top: 28px; font-size: 9.5px; color: #999; text-align: center; }
  </style></head><body>
    <h1>Visita do Supervisor — Loja 327</h1>
    <div class="sub">Supervisor: <b>${esc(visita.supervisorNome)}</b> · registrada por ${esc(visita.registradaPorNome)} · ${dataHora(visita.iniciadaEm)}${
      visita.finalizadaEm ? ` · finalizada ${dataHora(visita.finalizadaEm)}` : ' · em andamento'
    }</div>
    <div class="resumo">
      <div class="box"><div class="rot">Orientações</div><div class="val">${itens.length}</div></div>
      <div class="box"><div class="rot">Viraram tarefa</div><div class="val" style="color:#1B4FD1">${comTarefa}</div></div>
      <div class="box"><div class="rot">Setores com orientação</div><div class="val">${setoresComItem.length} / ${SETORES_VISITA_SUP.length}</div></div>
    </div>
    ${blocos || '<div class="nada">Nenhuma orientação registrada nesta visita.</div>'}
    ${semNada.length && itens.length ? `<div class="nada">Sem orientações: ${semNada.map(esc).join(', ')}.</div>` : ''}
    ${visita.observacoes ? `<h3 class="grupo">Observações gerais</h3><div class="obs">${esc(visita.observacoes)}</div>` : ''}
    <div class="rodape">Gerado pelo app ULVA em ${dataHora(new Date().toISOString())} · by Lucas Alberto</div>
  </body></html>`;
}

export async function compartilharVisitaSup(visita: VisitaSupervisor, itens?: ItemVisitaSup[]): Promise<void> {
  const lista = itens ?? (await listarItensSup(visita.id));
  await compartilharPdf(montarHtmlVisitaSup(visita, lista), `visita-supervisor-${dataParaNomeArquivo(visita.iniciadaEm)}`, 'Compartilhar visita do supervisor');
}
