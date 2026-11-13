import { ContextoRelatorio, classificacao, contextoVisitaTecnica, htmlPlanoAcao, textoComparacao } from './contextoRelatorio';
import { PaginaUlva, documentoUlva, documentoUlvaPaginas, kpi, rotulo, PDF_VERDE, PDF_VERMELHO, corAproveitamento } from './layoutPdf';
import * as Print from 'expo-print';
import {
  VisitaPergunta,
  VisitaResposta,
  SETORES_VISITA,
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

type DadosVisita = {
  visita: VisitaTecnica;
  perguntas: VisitaPergunta[];
  respostas: VisitaResposta[];
  contexto?: ContextoRelatorio | null;
};

export function montarHtmlVisita(dados: DadosVisita): string {
  return documentoUlva(montarPaginaVisita(dados));
}

// A folha de um setor (cabeçalho + corpo), usada no PDF de um setor e no PDF
// da visita completa (um setor por folha).
function montarPaginaVisita(dados: DadosVisita): PaginaUlva {
  const { visita, perguntas, respostas, contexto } = dados;
  const porPergunta = new Map(respostas.filter((r) => r.perguntaId).map((r) => [r.perguntaId!, r]));
  const pct = visita.aproveitamento ?? 0;

  let grupoAtual: string | null = null;
  const selo = (resp: string) =>
    resp === 'sim' ? '<span class="badge b-sim">Sim</span>' : resp === 'nao' ? '<span class="badge b-nao">Não</span>' : '<span class="badge b-na">N/A</span>';
  const itens = perguntas
    .map((p, i) => {
      const r = porPergunta.get(p.id);
      // Sem resposta: "Não avaliada" (visita finalizada antes de terminar).
      // Pergunta desativada depois e sem resposta não entra.
      if (!r && !p.ativo) return '';
      let cabecalho = '';
      if (p.grupo && p.grupo !== grupoAtual) {
        grupoAtual = p.grupo;
        cabecalho = rotulo(p.grupo);
      }
      const crit = p.critico ? ' <span class="critico">CRÍTICO</span>' : '';
      if (!r) {
        return `${cabecalho}<div class="item apagado"><div class="topo"><div class="texto">${i + 1}. ${esc(p.texto)}${crit}</div><span class="badge b-na">Não avaliada</span></div></div>`;
      }
      return `${cabecalho}
        <div class="item ${r.resposta === 'nao' ? 'ruim' : ''}">
          <div class="topo"><div class="texto">${i + 1}. ${esc(p.texto)}${crit}</div>${selo(r.resposta)}</div>
          ${p.baseManual ? `<div class="base">Base: ${esc(p.baseManual)}</div>` : ''}
          ${r.justificativa ? `<div class="det"><b>Observação:</b> ${esc(r.justificativa)}</div>` : ''}
          ${r.fotosUrls.length ? `<div class="fotos">${r.fotosUrls.map((u) => `<img class="foto" src="${u}" />`).join('')}</div>` : ''}
        </div>`;
    })
    .join('');

  // Respostas cuja pergunta foi apagada depois da visita — entram no fim.
  const idsPerguntas = new Set(perguntas.map((p) => p.id));
  const orfas = respostas
    .filter((r) => !r.perguntaId || !idsPerguntas.has(r.perguntaId))
    .map(
      (r) => `<div class="item ${r.resposta === 'nao' ? 'ruim' : ''}">
          <div class="topo"><div class="texto">${esc(r.perguntaTexto)}${r.critico ? ' <span class="critico">CRÍTICO</span>' : ''}</div>${selo(r.resposta)}</div>
          ${r.justificativa ? `<div class="det"><b>Observação:</b> ${esc(r.justificativa)}</div>` : ''}
          ${r.fotosUrls.length ? `<div class="fotos">${r.fotosUrls.map((u) => `<img class="foto" src="${u}" />`).join('')}</div>` : ''}
        </div>`,
    )
    .join('');

  const local =
    visita.localizacaoLat != null && visita.localizacaoLng != null
      ? `<div class="info">📍 ${
          visita.localizacaoEndereco ? esc(visita.localizacaoEndereco) : `${visita.localizacaoLat.toFixed(5)}, ${visita.localizacaoLng.toFixed(5)}`
        } — <a href="https://www.google.com/maps?q=${visita.localizacaoLat},${visita.localizacaoLng}">ver no mapa</a></div>`
      : '';
  const nc = visita.naoConformidades ?? 0;
  const crit = visita.criticosNaoConformes ?? 0;
  const kpis =
    kpi('Aproveitamento', `${pct}%<span class="classif" style="color:${classificacao(pct).cor};background:${classificacao(pct).fundo}">${classificacao(pct).texto}</span>`, corAproveitamento(pct), textoComparacao(pct, contexto)) +
    kpi('Pontos', `${visita.pontosRealizados ?? 0} / ${visita.pontosPossiveis ?? 0}`) +
    kpi('Não conformidades', String(nc), nc > 0 ? PDF_VERMELHO : PDF_VERDE) +
    (visita.perguntasNaoAvaliadas ? kpi('Não avaliadas', String(visita.perguntasNaoAvaliadas), '#8A93A5') : '') +
    kpi('Críticos reprovados', String(crit), crit > 0 ? PDF_VERMELHO : PDF_VERDE);

  return {
    tipo: 'Visita técnica',
    numero: contexto?.numero,
    titulo: nomeDoSetorVisita(visita.setor),
    direita: [`Loja ${esc(visita.unidade ?? '—')}`, `Téc. veterinário: ${esc(visita.veterinarioNome)}`, visita.finalizadaEm ? `Finalizada em ${dataHora(visita.finalizadaEm)}` : 'Em andamento'],
    corpo: `
      ${local}
      <div class="kpis">${kpis}</div>
      ${itens}
      ${orfas ? `${rotulo('Outras perguntas')}${orfas}` : ''}
      ${htmlPlanoAcao(contexto)}
      ${visita.consideracoesFinais ? `${rotulo('Considerações finais')}<div class="caixa">${esc(visita.consideracoesFinais)}</div>` : ''}
      <div class="base" style="margin-top:14px">Base: Manual de Boas Práticas e POPs (rev. 12.26)</div>`,
  };
}

export async function imprimirVisita(html: string): Promise<void> {
  await Print.printAsync({ html });
}

async function carregarDadosVisita(visita: VisitaTecnica): Promise<DadosVisita> {
  const [perguntas, respostas] = await Promise.all([
    buscarPerguntasDoSetor(visita.setor, true),
    buscarRespostasDaVisita(visita.id),
  ]);
  const contexto = await contextoVisitaTecnica(
    { id: visita.id, setor: visita.setor, unidade: visita.unidade, finalizadaEm: visita.finalizadaEm, tarefaId: visita.tarefaId },
    nomeDoSetorVisita(visita.setor),
    respostas.filter((r) => r.resposta === 'nao').map((r) => ({ texto: r.perguntaTexto, critico: !!r.critico })),
  );
  return { visita, perguntas, respostas, contexto };
}

// Monta o PDF de uma visita já finalizada (buscando perguntas e respostas no
// banco) e abre a tela de compartilhar — usado logo ao finalizar e na lista
// de visitas finalizadas.
export async function compartilharVisita(visita: VisitaTecnica): Promise<void> {
  const html = montarHtmlVisita(await carregarDadosVisita(visita));
  await compartilharPdf(
    html,
    `visita-tecnica-loja-${visita.unidade ?? ''}-${nomeDoSetorVisita(visita.setor)}-${dataParaNomeArquivo(visita.finalizadaEm)}`
  );
}

// Visitas do mesmo dia na mesma loja, uma por setor (a mais recente), na
// ordem dos setores do app.
export function visitasDoDiaPorSetor(visitas: VisitaTecnica[]): VisitaTecnica[] {
  const porSetor = new Map<string, VisitaTecnica>();
  visitas.forEach((v) => {
    const atual = porSetor.get(v.setor);
    if (!atual || String(v.finalizadaEm ?? '') > String(atual.finalizadaEm ?? '')) porSetor.set(v.setor, v);
  });
  return SETORES_VISITA.map((s) => porSetor.get(s.key)).filter((v): v is VisitaTecnica => !!v);
}

// PDF da visita completa: uma folha de resumo e depois cada setor numa folha
// nova, pra imprimir e entregar cada uma ao encarregado do setor.
export async function compartilharVisitaCompleta(visitasDoDia: VisitaTecnica[]): Promise<void> {
  const visitas = visitasDoDiaPorSetor(visitasDoDia);
  if (!visitas.length) return;
  const dados = await Promise.all(visitas.map(carregarDadosVisita));
  const unidade = visitas[0].unidade ?? '—';
  const dia = visitas[0].finalizadaEm ? new Date(visitas[0].finalizadaEm).toLocaleDateString('pt-BR') : '—';
  const vets = Array.from(new Set(visitas.map((v) => v.veterinarioNome).filter(Boolean)));

  const media = Math.round((visitas.reduce((s, v) => s + (v.aproveitamento ?? 0), 0) / visitas.length) * 10) / 10;
  const totalNc = visitas.reduce((s, v) => s + (v.naoConformidades ?? 0), 0);
  const totalCrit = visitas.reduce((s, v) => s + (v.criticosNaoConformes ?? 0), 0);
  const linhas = dados
    .map((d, i) => {
      const v = d.visita;
      const pct = v.aproveitamento ?? 0;
      const nc = v.naoConformidades ?? 0;
      const cr = v.criticosNaoConformes ?? 0;
      return `<tr><td class="pn">${i + 1}</td><td><b>${esc(nomeDoSetorVisita(v.setor))}</b>${d.contexto?.numero ? `<div class="base">Nº ${esc(d.contexto.numero)}</div>` : ''}</td>
        <td class="pc" style="color:${corAproveitamento(pct)};font-weight:700">${pct}%</td>
        <td class="pc" style="color:${nc ? PDF_VERMELHO : PDF_VERDE};font-weight:700">${nc}</td>
        <td class="pc" style="color:${cr ? PDF_VERMELHO : PDF_VERDE};font-weight:700">${cr}</td>
        <td>${v.setor === 'geral' ? 'Gerência' : 'Encarregado · ' + esc(nomeDoSetorVisita(v.setor))}</td></tr>`;
    })
    .join('');
  const resumo: PaginaUlva = {
    tipo: 'Visita técnica · resumo',
    titulo: `Loja ${unidade}`,
    direita: [dia, `Téc. veterinário: ${esc(vets.join(', ') || '—')}`, `${visitas.length} setor(es) avaliado(s)`],
    corpo: `
      <div class="kpis">${
        kpi('Média dos setores', `${media}%<span class="classif" style="color:${classificacao(media).cor};background:${classificacao(media).fundo}">${classificacao(media).texto}</span>`, corAproveitamento(media)) +
        kpi('Não conformidades', String(totalNc), totalNc > 0 ? PDF_VERMELHO : PDF_VERDE) +
        kpi('Críticos reprovados', String(totalCrit), totalCrit > 0 ? PDF_VERMELHO : PDF_VERDE)
      }</div>
      ${rotulo('Setores', 'cada um numa folha, para entregar ao responsável')}
      <table class="plano"><thead><tr><th class="pn">#</th><th>Setor</th><th class="pc">Aproveitamento</th><th class="pc">NC</th><th class="pc">Críticos</th><th>Entregar para</th></tr></thead><tbody>${linhas}</tbody></table>
      <div class="base" style="margin-top:14px">Base: Manual de Boas Práticas e POPs (rev. 12.26)</div>`,
  };
  const html = documentoUlvaPaginas([resumo, ...dados.map(montarPaginaVisita)], `Visita técnica — Loja ${unidade} — ${dia}`);
  await compartilharPdf(html, `visita-tecnica-completa-loja-${visitas[0].unidade ?? ''}-${dataParaNomeArquivo(visitas[0].finalizadaEm)}`, 'Compartilhar visita completa');
}
