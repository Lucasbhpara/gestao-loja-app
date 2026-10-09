import * as Print from 'expo-print';
import {
  VisitaPergunta,
  VisitaResposta,
  VisitaTecnica,
  buscarPerguntasDoSetor,
  buscarRespostasDaVisita,
  nomeDoSetorVisita,
} from '../data/visitaTecnicaApi';
import { compartilharPdf, dataParaNomeArquivo } from './compartilharPdf';

// PDF da Visita Técnica — mesmo estilo do PDF do Checklist de Setor
// (checklistPdf.ts): preto no branco, pra imprimir gastando pouca tinta,
// aberto pelo diálogo nativo de impressão/"Salvar como PDF".

function esc(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dataHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function corFaixa(pct: number): string {
  if (pct >= 90) return '#2C8F5E';
  if (pct >= 75) return '#3E9B6E';
  if (pct >= 60) return '#B4650E';
  return '#C5392F';
}

export function montarHtmlVisita(dados: {
  visita: VisitaTecnica;
  perguntas: VisitaPergunta[];
  respostas: VisitaResposta[];
}): string {
  const { visita, perguntas, respostas } = dados;
  const porPergunta = new Map(respostas.filter((r) => r.perguntaId).map((r) => [r.perguntaId!, r]));
  const pct = visita.aproveitamento ?? 0;

  let grupoAtual: string | null = null;
  const itens = perguntas
    .map((p, i) => {
      const r = porPergunta.get(p.id);
      // Sem resposta: "Não avaliada" (visita finalizada antes de terminar).
      // Pergunta desativada depois e sem resposta não entra.
      if (!r && !p.ativo) return '';
      let cabecalho = '';
      if (p.grupo && p.grupo !== grupoAtual) {
        grupoAtual = p.grupo;
        cabecalho = `<h3 class="grupo">${esc(p.grupo)}</h3>`;
      }
      if (!r) {
        return `${cabecalho}
        <div class="item item-na">
          <div class="topo">
            <div class="texto">${i + 1}. ${esc(p.texto)}${p.critico ? ' <span class="critico">CRÍTICO</span>' : ''}</div>
            <span class="badge na">Não avaliada</span>
          </div>
        </div>`;
      }
      const badge =
        r.resposta === 'sim'
          ? '<span class="badge sim">Sim</span>'
          : r.resposta === 'nao'
          ? '<span class="badge nao">Não</span>'
          : '<span class="badge na">N/A</span>';
      return `${cabecalho}
        <div class="item ${r.resposta === 'nao' ? 'item-nao' : ''}">
          <div class="topo">
            <div class="texto">${i + 1}. ${esc(p.texto)}${p.critico ? ' <span class="critico">CRÍTICO</span>' : ''}</div>
            ${badge}
          </div>
          ${p.baseManual ? `<div class="base">Base: ${esc(p.baseManual)}</div>` : ''}
          ${r.justificativa ? `<div class="just"><b>Observação:</b> ${esc(r.justificativa)}</div>` : ''}
          ${r.fotoUrl ? `<img class="foto" src="${r.fotoUrl}" />` : ''}
        </div>`;
    })
    .join('');

  // Respostas cuja pergunta foi apagada depois da visita (pergunta_id nulo
  // ou sem pergunta correspondente) — entram no fim, pra não sumir nada.
  const idsPerguntas = new Set(perguntas.map((p) => p.id));
  const orfas = respostas
    .filter((r) => !r.perguntaId || !idsPerguntas.has(r.perguntaId))
    .map(
      (r) => `
        <div class="item ${r.resposta === 'nao' ? 'item-nao' : ''}">
          <div class="topo">
            <div class="texto">${esc(r.perguntaTexto)}${r.critico ? ' <span class="critico">CRÍTICO</span>' : ''}</div>
            <span class="badge ${r.resposta === 'sim' ? 'sim' : r.resposta === 'nao' ? 'nao' : 'na'}">${
        r.resposta === 'sim' ? 'Sim' : r.resposta === 'nao' ? 'Não' : 'N/A'
      }</span>
          </div>
          ${r.justificativa ? `<div class="just"><b>Observação:</b> ${esc(r.justificativa)}</div>` : ''}
          ${r.fotoUrl ? `<img class="foto" src="${r.fotoUrl}" />` : ''}
        </div>`
    )
    .join('');

  const local =
    visita.localizacaoLat != null && visita.localizacaoLng != null
      ? `<div class="sub">📍 ${
          visita.localizacaoEndereco ? esc(visita.localizacaoEndereco) : `${visita.localizacaoLat.toFixed(5)}, ${visita.localizacaoLng.toFixed(5)}`
        } — <a href="https://www.google.com/maps?q=${visita.localizacaoLat},${visita.localizacaoLng}">ver no mapa</a></div>`
      : '';

  return `
  <html><head><meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1A2340; padding: 24px 28px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .sub { font-size: 11.5px; color: #666; margin-bottom: 4px; }
    .sub a { color: #1A2340; }
    .resumo { display: flex; gap: 10px; margin: 16px 0 18px; flex-wrap: wrap; }
    .box { flex: 1; min-width: 110px; border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; }
    .rot { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.4px; }
    .val { font-size: 18px; font-weight: 700; margin-top: 2px; }
    .grupo { font-size: 13px; margin: 18px 0 8px; color: #1B2A6B; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .item { border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
    .item-nao { border-color: #E86A5F; }
    .item-na { border-style: dashed; color: #888; }
    .consideracoes { border: 1px solid #1B2A6B; border-radius: 8px; padding: 12px 14px; margin-top: 18px; font-size: 12.5px; white-space: pre-wrap; page-break-inside: avoid; }
    .topo { display: flex; justify-content: space-between; gap: 10px; }
    .texto { font-size: 12.5px; font-weight: 600; flex: 1; }
    .critico { font-size: 9px; font-weight: 700; color: #C5392F; border: 1px solid #C5392F; border-radius: 4px; padding: 1px 4px; margin-left: 4px; }
    .badge { font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 20px; white-space: nowrap; height: fit-content; }
    .sim { background: #DCF2E7; color: #2C8F5E; } .nao { background: #FBDEDC; color: #C5392F; } .na { background: #eee; color: #777; }
    .base { font-size: 10px; color: #999; margin-top: 4px; }
    .just { font-size: 11.5px; color: #555; margin-top: 6px; }
    .foto { max-width: 220px; max-height: 180px; border-radius: 6px; margin-top: 8px; display: block; border: 1px solid #ddd; }
    .rodape { margin-top: 28px; font-size: 9.5px; color: #999; text-align: center; }
  </style></head>
  <body>
    <h1>Visita Técnica — ${esc(nomeDoSetorVisita(visita.setor))}</h1>
    <div class="sub">ULVA · Loja ${esc(visita.unidade ?? '—')} · Técnico Veterinário: ${esc(visita.veterinarioNome)} · finalizada em ${visita.finalizadaEm ? dataHora(visita.finalizadaEm) : '—'}</div>
    ${local}
    <div class="resumo">
      <div class="box"><div class="rot">Aproveitamento</div><div class="val" style="color:${corFaixa(pct)};">${pct}%</div></div>
      <div class="box"><div class="rot">Pontos</div><div class="val">${visita.pontosRealizados ?? 0} / ${visita.pontosPossiveis ?? 0}</div></div>
      <div class="box"><div class="rot">Não conformidades</div><div class="val" style="color:${(visita.naoConformidades ?? 0) > 0 ? '#C5392F' : '#2C8F5E'};">${visita.naoConformidades ?? 0}</div></div>
      ${visita.perguntasNaoAvaliadas ? `<div class="box"><div class="rot">Não avaliadas</div><div class="val" style="color:#888;">${visita.perguntasNaoAvaliadas}</div></div>` : ''}
      <div class="box"><div class="rot">Críticos reprovados</div><div class="val" style="color:${(visita.criticosNaoConformes ?? 0) > 0 ? '#C5392F' : '#2C8F5E'};">${visita.criticosNaoConformes ?? 0}</div></div>
    </div>
    ${itens}
    ${orfas ? `<h3 class="grupo">Outras perguntas</h3>${orfas}` : ''}
    ${visita.consideracoesFinais ? `<h3 class="grupo">Considerações finais</h3><div class="consideracoes">${esc(visita.consideracoesFinais)}</div>` : ''}
    <div class="rodape">Base: Manual de Boas Práticas e POPs (rev. 12.26) · Gerado pelo app ULVA em ${dataHora(new Date().toISOString())} · by Lucas Alberto</div>
  </body></html>`;
}

export async function imprimirVisita(html: string): Promise<void> {
  await Print.printAsync({ html });
}

// Monta o PDF de uma visita já finalizada (buscando perguntas e respostas no
// banco) e abre a tela de compartilhar — usado logo ao finalizar e na lista
// de visitas finalizadas.
export async function compartilharVisita(visita: VisitaTecnica): Promise<void> {
  const [perguntas, respostas] = await Promise.all([
    buscarPerguntasDoSetor(visita.setor, true),
    buscarRespostasDaVisita(visita.id),
  ]);
  const html = montarHtmlVisita({ visita, perguntas, respostas });
  await compartilharPdf(
    html,
    `visita-tecnica-loja-${visita.unidade ?? ''}-${nomeDoSetorVisita(visita.setor)}-${dataParaNomeArquivo(visita.finalizadaEm)}`
  );
}
