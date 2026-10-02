
import * as Print from 'expo-print';
import { AvaliacaoPergunta, AvaliacaoResposta, AvaliacaoSetor } from '../data/avaliacaoSetorApi';

// Gera e imprime/exporta em PDF um Checklist de Setor já respondido — usado
// em dois momentos (ver ChecklistSetorScreen.tsx e HomeColaboradorScreen.tsx):
// (1) assim que o gerente finaliza a avaliação, (2) assim que o encarregado
// resolve as não conformidades (anexa a foto de resolução). Monta um HTML
// simples (preto no branco, sem fundo escuro, pra gastar pouca tinta) e
// chama Print.printAsync, que abre o diálogo nativo de impressão/"Salvar
// como PDF" do Android — o jeito mais direto de "imprimir com facilidade".

function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatarDataHoraPdf(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function corFaixa(pct: number): string {
  if (pct >= 90) return '#2C8F5E';
  if (pct >= 75) return '#3E9B6E';
  if (pct >= 60) return '#B4650E';
  return '#C5392F';
}

export interface ResolucaoTarefa {
  concluidaPorNome: string;
  concluidaEm: string;
  fotoUrl: string | null;
}

export function montarHtmlChecklist(dados: {
  avaliacao: AvaliacaoSetor;
  nomeSetor: string;
  respostas: AvaliacaoResposta[];
  resolucao?: ResolucaoTarefa | null;
}): string {
  const { avaliacao, nomeSetor, respostas, resolucao } = dados;
  const pct = avaliacao.aproveitamento ?? 0;
  const cor = corFaixa(pct);

  const itensHtml = respostas
    .map((r, i) => {
      const badge =
        r.resposta === 'sim'
          ? '<span class="badge badge-sim">Sim</span>'
          : r.resposta === 'nao'
          ? '<span class="badge badge-nao">Não</span>'
          : '<span class="badge badge-na">N/A</span>';
      const destaque = r.resposta === 'nao';
      return `
        <div class="item ${destaque ? 'item-nao' : ''}">
          <div class="item-topo">
            <div class="item-texto">${i + 1}. ${escapeHtml(r.perguntaTexto)}</div>
            ${badge}
          </div>
          ${r.justificativa ? `<div class="item-justificativa"><b>Justificativa:</b> ${escapeHtml(r.justificativa)}</div>` : ''}
          ${r.fotoUrl ? `<img class="item-foto" src="${r.fotoUrl}" />` : ''}
        </div>`;
    })
    .join('');

  const resolucaoHtml = resolucao
    ? `
      <h2 class="secao-titulo">Resolução das não conformidades</h2>
      <div class="item" style="border-color:#2C8F5E;">
        <div><b>Resolvida por:</b> ${escapeHtml(resolucao.concluidaPorNome)}</div>
        <div style="margin-top:4px;"><b>Em:</b> ${formatarDataHoraPdf(resolucao.concluidaEm)}</div>
        ${resolucao.fotoUrl ? `<img class="item-foto" src="${resolucao.fotoUrl}" />` : ''}
      </div>`
    : '';

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1A2340; padding: 24px 28px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .subtitulo { font-size: 12px; color: #666; margin-bottom: 18px; }
        .resumo { display: flex; gap: 10px; margin-bottom: 22px; flex-wrap: wrap; }
        .resumo-box { flex: 1; min-width: 110px; border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; }
        .resumo-rotulo { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.4px; }
        .resumo-valor { font-size: 18px; font-weight: 700; margin-top: 2px; }
        .secao-titulo { font-size: 15px; margin: 24px 0 12px; }
        .item { border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; page-break-inside: avoid; }
        .item-nao { border-color: #E86A5F; }
        .item-topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
        .item-texto { font-size: 12.5px; font-weight: 600; flex: 1; }
        .badge { font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
        .badge-sim { background: #DCF2E7; color: #2C8F5E; }
        .badge-nao { background: #FBDEDC; color: #C5392F; }
        .badge-na { background: #eee; color: #777; }
        .item-justificativa { font-size: 11.5px; color: #555; margin-top: 6px; }
        .item-foto { max-width: 220px; max-height: 180px; border-radius: 6px; margin-top: 8px; display: block; border: 1px solid #ddd; }
        .rodape { margin-top: 28px; font-size: 9.5px; color: #999; text-align: center; }
      </style>
    </head>
    <body>
      <h1>Checklist de Setor — ${escapeHtml(nomeSetor)}</h1>
      <div class="subtitulo">ULVA · Avaliado por ${escapeHtml(avaliacao.gerenteNome)} · finalizado em ${avaliacao.finalizadaEm ? formatarDataHoraPdf(avaliacao.finalizadaEm) : '—'}</div>

      <div class="resumo">
        <div class="resumo-box">
          <div class="resumo-rotulo">Aproveitamento</div>
          <div class="resumo-valor" style="color:${cor};">${pct}%</div>
        </div>
        <div class="resumo-box">
          <div class="resumo-rotulo">Pontos</div>
          <div class="resumo-valor">${avaliacao.pontosRealizados ?? 0} / ${avaliacao.pontosPossiveis ?? 0}</div>
        </div>
        <div class="resumo-box">
          <div class="resumo-rotulo">Não conformidades</div>
          <div class="resumo-valor" style="color:${(avaliacao.naoConformidades ?? 0) > 0 ? '#C5392F' : '#2C8F5E'};">${avaliacao.naoConformidades ?? 0}</div>
        </div>
      </div>

      ${itensHtml}
      ${resolucaoHtml}

      <div class="rodape">Gerado pelo app ULVA em ${formatarDataHoraPdf(new Date().toISOString())}</div>
    </body>
  </html>`;
}

// Abre o diálogo nativo de impressão/"Salvar como PDF" com o HTML montado.
export async function imprimirChecklist(html: string): Promise<void> {
  await Print.printAsync({ html });
}
