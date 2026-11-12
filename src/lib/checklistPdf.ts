import { documentoUlva, kpi, rotulo, PDF_VERDE, PDF_VERMELHO, corAproveitamento } from './layoutPdf';
import * as Print from 'expo-print';
import { AvaliacaoPergunta, AvaliacaoResposta, AvaliacaoSetor, buscarRespostasOrdenadas } from '../data/avaliacaoSetorApi';
import { setores } from '../data/employees';
import { compartilharPdf, dataParaNomeArquivo } from './compartilharPdf';

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

function localizacaoHtml(avaliacao: AvaliacaoSetor): string {
  if (avaliacao.localizacaoLat == null || avaliacao.localizacaoLng == null) return '';
  const lat = avaliacao.localizacaoLat;
  const lng = avaliacao.localizacaoLng;
  const linkMaps = `https://www.google.com/maps?q=${lat},${lng}`;
  const textoLocal = avaliacao.localizacaoEndereco
    ? escapeHtml(avaliacao.localizacaoEndereco)
    : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return `<div class="info">📍 ${textoLocal} — <a href="${linkMaps}">ver no mapa</a></div>`;
}

const corFaixa = corAproveitamento;

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
          ? '<span class="badge b-sim">Sim</span>'
          : r.resposta === 'nao'
          ? '<span class="badge b-nao">Não</span>'
          : '<span class="badge b-na">N/A</span>';
      return `
        <div class="item ${r.resposta === 'nao' ? 'ruim' : ''}">
          <div class="topo"><div class="texto">${i + 1}. ${escapeHtml(r.perguntaTexto)}</div>${badge}</div>
          ${r.justificativa ? `<div class="det"><b>Justificativa:</b> ${escapeHtml(r.justificativa)}</div>` : ''}
          ${r.fotosUrls.length ? `<div class="fotos">${r.fotosUrls.map((u) => `<img class="foto" src="${u}" />`).join('')}</div>` : ''}
        </div>`;
    })
    .join('');

  const resolucaoHtml = resolucao
    ? `${rotulo('Resolução das não conformidades')}
      <div class="item" style="border-color:#A7D8B8">
        <div class="det" style="margin-top:0"><b>Resolvida por:</b> ${escapeHtml(resolucao.concluidaPorNome)} · ${formatarDataHoraPdf(resolucao.concluidaEm)}</div>
        ${resolucao.fotoUrl ? `<div class="fotos"><img class="foto" src="${resolucao.fotoUrl}" /></div>` : ''}
      </div>`
    : '';

  const nc = avaliacao.naoConformidades ?? 0;
  const kpis =
    kpi('Aproveitamento', `${pct}%`, cor) +
    kpi('Pontos', `${avaliacao.pontosRealizados ?? 0} / ${avaliacao.pontosPossiveis ?? 0}`) +
    kpi('Não conformidades', String(nc), nc > 0 ? PDF_VERMELHO : PDF_VERDE) +
    (avaliacao.perguntasNaoAvaliadas ? kpi('Não avaliadas', String(avaliacao.perguntasNaoAvaliadas), '#8A93A5') : '') +
    (avaliacao.passosContados !== null && avaliacao.passosContados !== undefined ? kpi('Passos dados', String(avaliacao.passosContados)) : '');

  return documentoUlva({
    tipo: 'Checklist de setor',
    titulo: nomeSetor,
    direita: ['Loja 327', `Avaliado por ${escapeHtml(avaliacao.gerenteNome)}`, avaliacao.finalizadaEm ? `Finalizado em ${formatarDataHoraPdf(avaliacao.finalizadaEm)}` : 'Em andamento'],
    corpo: `
      ${localizacaoHtml(avaliacao)}
      <div class="kpis">${kpis}</div>
      ${rotulo('Itens avaliados', `${respostas.length}`)}
      ${itensHtml}
      ${avaliacao.consideracoesFinais ? `${rotulo('Considerações finais')}<div class="caixa">${escapeHtml(avaliacao.consideracoesFinais)}</div>` : ''}
      ${resolucaoHtml}`,
  });
}

// Abre o diálogo nativo de impressão/"Salvar como PDF" com o HTML montado.
export async function imprimirChecklist(html: string): Promise<void> {
  await Print.printAsync({ html });
}

export function nomeDoSetorAvaliacao(setor: string): string {
  if (setor === 'area_externa') return 'Área Externa';
  return setores.find((s) => s.key === setor)?.nome ?? setor;
}

// Gera o PDF de um Checklist de Setor já finalizado e abre a tela de
// compartilhar (WhatsApp, e-mail…) — logo ao finalizar, na lista de
// checklists finalizados e depois que o encarregado resolve a tarefa.
export async function compartilharAvaliacao(avaliacao: AvaliacaoSetor, resolucao?: ResolucaoTarefa | null): Promise<void> {
  const respostas = await buscarRespostasOrdenadas(avaliacao.id);
  const nomeSetor = nomeDoSetorAvaliacao(avaliacao.setor);
  const html = montarHtmlChecklist({ avaliacao, nomeSetor, respostas, resolucao });
  await compartilharPdf(html, `checklist-${nomeSetor}-${dataParaNomeArquivo(avaliacao.finalizadaEm)}`);
}
