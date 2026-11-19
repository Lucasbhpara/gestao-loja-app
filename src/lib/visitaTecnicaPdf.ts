import { ContextoRelatorio, LinhaPlano, classificacao, contextoVisitaTecnica, htmlPlanoAcao, htmlResolucao, textoComparacao } from './contextoRelatorio';
import { PaginaUlva, documentoUlva, documentoUlvaPaginas, kpi, rotulo, PDF_VERDE, PDF_VERMELHO, corAproveitamento } from './layoutPdf';
import * as Print from 'expo-print';
import {
  VisitaPergunta,
  VisitaResposta,
  SETORES_VISITA,
  TEMAS_LIVRE,
  VisitaTecnica,
  faixaNotaLivre,
  ordenarApontamentos,
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

// Foto no PDF: quando o Supabase aceita, usa uma versão reduzida da foto
// (bem mais leve que a original da câmera, que tem vários MB) — é o que
// deixava o PDF demorando. Testa uma vez por abertura do app; se a redução
// não estiver disponível no projeto, segue com a foto original.
const MARCA_PUBLICA = '/storage/v1/object/public/';
let reducaoDisponivel: boolean | null = null;
function urlReduzida(url: string): string {
  return url.replace(MARCA_PUBLICA, '/storage/v1/render/image/public/') + (url.includes('?') ? '&' : '?') + 'width=480&quality=60&resize=contain';
}
async function testarReducao(exemplo: string | undefined): Promise<void> {
  if (reducaoDisponivel !== null || !exemplo || !exemplo.includes(MARCA_PUBLICA)) return;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(urlReduzida(exemplo), { signal: ctl.signal });
    clearTimeout(t);
    reducaoDisponivel = r.ok && (r.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    reducaoDisponivel = false;
  }
}
function fotoHtml(url: string): string {
  const src = reducaoDisponivel && url.includes(MARCA_PUBLICA) ? urlReduzida(url) : url;
  return `<img class="foto" src="${esc(src)}" />`;
}
function fotosHtml(urls: string[]): string {
  return urls.length ? `<div class="fotos">${urls.map(fotoHtml).join('')}</div>` : '';
}

// Status do item no plano de ação, para o selo ao lado do apontamento.
const SELO_PLANO: Record<LinhaPlano['status'], [string, string]> = {
  pendente: ['Corrigir', 'b-nao'],
  corrigido: ['Corrigido · aguardando', 'b-azul'],
  nao_possivel: ['Não foi possível', 'b-na'],
  aprovado: ['Concluído', 'b-sim'],
  devolvido: ['Devolvido', 'b-nao'],
};

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
  return documentoUlva({ ...montarPaginaVisita(dados), css: CSS_ASSIN + CSS_FOLHA });
}

// A folha de um setor (cabeçalho + corpo), usada no PDF de um setor e no PDF
// da visita completa (um setor por folha).
function cabecalhoDireita(visita: VisitaTecnica): string[] {
  return [`Loja ${esc(visita.unidade ?? '—')}`, `Téc. veterinário: ${esc(visita.veterinarioNome)}`, visita.finalizadaEm ? `Finalizada em ${dataHora(visita.finalizadaEm)}` : 'Em andamento'];
}

// Bloco "Acompanhado por": nome, função e assinatura do responsável da loja.
function acompanhanteHtml(visita: VisitaTecnica): string {
  const a = visita.acompanhante;
  if (!a) return '';
  if (a.ausente)
    return `<div class="assin"><div class="assin-tit">Acompanhado por</div><div class="assin-sem">Sem responsável da loja acompanhando a visita.</div></div>`;
  const svg = a.assinatura
    ? `<svg viewBox="0 0 ${a.assinatura.largura} ${a.assinatura.altura}" width="220" height="74" preserveAspectRatio="xMidYMid meet"><path d="${esc(a.assinatura.tracos)}" fill="none" stroke="#121B4A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : '';
  return `<div class="assin"><div class="assin-tit">Acompanhado por</div><div class="assin-linha">${svg}</div><div class="assin-nome">${esc(a.nome)}${a.funcao ? ` · ${esc(a.funcao)}` : ''}</div></div>`;
}
const CSS_ASSIN = `.assin{margin-top:16px;border:1px solid #E3E7EE;border-radius:10px;padding:10px 14px;page-break-inside:avoid;break-inside:avoid}.assin-tit{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#8A93A5;font-weight:700}.assin-linha{border-bottom:1px solid #8A93A5;min-height:60px;display:flex;align-items:flex-end;justify-content:center}.assin-nome{text-align:center;font-size:11.5px;font-weight:700;color:#0E1B2C;margin-top:4px}.assin-sem{font-size:11.5px;color:#5B6280;margin-top:4px}`;

// Folha para a loja resolver no papel: em cada não conformidade ainda sem
// resolução no sistema, um espaço para o encarregado escrever o que fez; no
// fim da folha, prazo e assinaturas do encarregado e de quem conferiu.
// Serve para as lojas que ainda não usam o ULVA.
const ESPACO_CORRECAO = `<div class="corr"><div class="corr-l"><b>O que foi feito:</b></div><div class="corr-l"></div><div class="corr-r"><span>Data: ____/____/______</span><span>Rubrica: ____________________</span></div></div>`;
function devolutivaHtml(qtd: number, visita?: VisitaTecnica): string {
  const campo = (titulo: string) =>
    `<div class="dev-c"><div class="dev-t">${titulo}</div><div class="dev-l">Nome:</div><div class="dev-l">Assinatura:</div><div class="dev-l">Data: ____/____/______</div></div>`;
  return `<div class="dev">
    <div class="assin-tit">Devolutiva da loja</div>
    <div class="dev-p">${qtd ? `${qtd} ${qtd === 1 ? 'item para corrigir' : 'itens para corrigir'}. ` : ''}Prazo para correção: ____/____/______ &nbsp;·&nbsp; Devolver esta folha assinada ao gerente.</div>
    ${qrLinkHtml(qtd, visita)}
    <div class="dev-g">${campo('Encarregado do setor — ciente e corrigido')}${campo('Gerente — conferido')}</div>
  </div>`;
}
// Link para a loja responder pelo celular (lojas sem o app: sem tarefa).
function qrLinkHtml(qtd: number, visita?: VisitaTecnica): string {
  if (!qtd || !visita || visita.tarefaId || !visita.tokenLoja) return '';
  const link = `https://ulva.com.br/vt/corrigir/?t=${visita.tokenLoja}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(link)}`;
  return `<div class="dev-qr"><img src="${qr}" width="84" height="84" /><div><b>Prefere responder pelo celular?</b><br/>Aponte a câmera para o código, diga o que foi feito em cada item e mande foto. Não precisa de app nem de senha.<br/><span style="color:#5B6280;word-break:break-all">${link}</span></div></div>`;
}
const CSS_FOLHA = `.dev-qr{display:flex;gap:12px;align-items:center;font-size:10.5px;line-height:1.45;color:#0E1B2C;border:1px dashed #B9C0CE;border-radius:8px;padding:8px 10px;margin-bottom:8px}.dev-qr img{flex:none}.corr{margin-top:8px;border:1px dashed #B9C0CE;border-radius:8px;padding:6px 10px;page-break-inside:avoid;break-inside:avoid}.corr-l{border-bottom:1px solid #C9CFDB;min-height:20px;font-size:10.5px;color:#3B4A6B;padding-top:4px}.corr-r{display:flex;justify-content:space-between;font-size:10.5px;color:#3B4A6B;margin-top:8px}.dev{margin-top:16px;border:1.5px solid #0E1B2C;border-radius:10px;padding:10px 14px;page-break-inside:avoid;break-inside:avoid}.dev-p{font-size:11px;color:#0E1B2C;margin:4px 0 8px}.dev-g{display:flex;gap:14px}.dev-c{flex:1}.dev-t{font-size:10.5px;font-weight:800;color:#0E1B2C;margin-bottom:2px}.dev-l{border-bottom:1px solid #8A93A5;min-height:24px;font-size:10px;color:#5B6280;padding-top:8px}`;


function localHtml(visita: VisitaTecnica): string {
  return visita.localizacaoLat != null && visita.localizacaoLng != null
    ? `<div class="info">📍 ${
        visita.localizacaoEndereco ? esc(visita.localizacaoEndereco) : `${visita.localizacaoLat.toFixed(5)}, ${visita.localizacaoLng.toFixed(5)}`
      } — <a href="https://www.google.com/maps?q=${visita.localizacaoLat},${visita.localizacaoLng}">ver no mapa</a></div>`
    : '';
}

// Folha do modelo livre: apontamentos por tema (texto + fotos), sem nota.
function montarPaginaLivre(dados: DadosVisita): PaginaUlva {
  const { visita, respostas, contexto } = dados;
  const apont = ordenarApontamentos(respostas.filter((r) => r.resposta === 'nao'));
  const planoPorResposta = new Map((contexto?.plano ?? []).filter((l) => l.respostaId).map((l) => [l.respostaId!, l]));
  const totalFotos = apont.reduce((s, r) => s + r.fotosUrls.length, 0);
  const temasCom = new Set(apont.map((r) => r.perguntaTexto));
  const nomesTemas = [...TEMAS_LIVRE.map((t) => t.nome), ...Array.from(temasCom).filter((t) => !TEMAS_LIVRE.some((x) => x.nome === t))];
  let n = 0;
  const secoes = nomesTemas
    .map((tema) => {
      const doTema = apont.filter((r) => r.perguntaTexto === tema);
      if (!doTema.length) {
        return `${rotulo(tema)}<div class="item"><div class="topo"><div class="texto" style="color:#8A93A5">Sem apontamentos</div><span class="badge b-sim">OK</span></div></div>`;
      }
      return (
        rotulo(tema, `${doTema.length} ${doTema.length === 1 ? 'apontamento' : 'apontamentos'}`) +
        doTema
          .map(
            (r) => {
              const l = planoPorResposta.get(r.id);
              const [selo, cls] = SELO_PLANO[l?.status ?? 'pendente'];
              const resolucao = l ? htmlResolucao(l) : '';
              return `<div class="item ${l?.status === 'aprovado' ? '' : 'ruim'}">
          <div class="topo"><div class="texto">${++n}. ${esc(r.justificativa || '(sem texto)')}</div><span class="badge ${cls}">${selo}</span></div>
          ${fotosHtml(r.fotosUrls)}
          ${resolucao || (l?.status === 'aprovado' ? '' : ESPACO_CORRECAO)}
        </div>`;
            },
          )
          .join('')
      );
    })
    .join('');
  const nota = visita.aproveitamento;
  const fx = nota != null ? faixaNotaLivre(nota) : null;
  const kpis =
    (fx
      ? kpi('Nota do veterinário', `${String(nota).replace('.', ',')}<span class="classif" style="color:${fx.cor};background:${fx.fundo}">${fx.texto}</span>`, fx.cor)
      : '') +
    kpi('Apontamentos', String(apont.length), apont.length ? PDF_VERMELHO : PDF_VERDE) +
    kpi('Temas com apontamento', `${temasCom.size} de ${TEMAS_LIVRE.length}`) +
    kpi('Fotos', String(totalFotos));
  return {
    tipo: 'Visita técnica',
    numero: contexto?.numero,
    titulo: nomeDoSetorVisita(visita.setor),
    direita: cabecalhoDireita(visita),
    corpo: `
      ${localHtml(visita)}
      <div class="kpis">${kpis}</div>
      ${secoes}
      ${visita.consideracoesFinais ? `${rotulo('Considerações finais')}<div class="caixa">${esc(visita.consideracoesFinais)}</div>` : ''}
      ${acompanhanteHtml(visita)}
      ${devolutivaHtml(apont.length, visita)}
      <div class="base" style="margin-top:14px">Base: Manual de Boas Práticas e POPs (rev. 12.26)</div>`,
  };
}

function montarPaginaVisita(dados: DadosVisita): PaginaUlva {
  if (dados.visita.modelo === 'livre') return montarPaginaLivre(dados);
  const { visita, perguntas, respostas, contexto } = dados;
  const porPergunta = new Map(respostas.filter((r) => r.perguntaId).map((r) => [r.perguntaId!, r]));
  const planoPorResposta = new Map((contexto?.plano ?? []).filter((l) => l.respostaId).map((l) => [l.respostaId!, l]));
  const pct = visita.aproveitamento ?? 0;

  let grupoAtual: string | null = null;
  const selo = (resp: string) =>
    resp === 'sim' ? '<span class="badge b-sim">Sim</span>' : resp === 'nao' ? '<span class="badge b-nao">Não</span>' : '<span class="badge b-na">N/A</span>';
  const itens = perguntas
    .map((p, i) => {
      const r = porPergunta.get(p.id);
      const lp = r ? planoPorResposta.get(r.id) : undefined;
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
          ${fotosHtml(r.fotosUrls)}
          ${lp && htmlResolucao(lp) ? htmlResolucao(lp) : r.resposta === 'nao' && lp?.status !== 'aprovado' ? ESPACO_CORRECAO : ''}
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
          ${fotosHtml(r.fotosUrls)}
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
      ${acompanhanteHtml(visita)}
      ${devolutivaHtml(nc, visita)}
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
  await testarReducao(respostas.find((r) => r.fotosUrls.length)?.fotosUrls[0]);
  const contexto = await contextoVisitaTecnica(
    { id: visita.id, setor: visita.setor, unidade: visita.unidade, finalizadaEm: visita.finalizadaEm, tarefaId: visita.tarefaId, modelo: visita.modelo },
    nomeDoSetorVisita(visita.setor),
    respostas.filter((r) => r.resposta === 'nao').map((r) => ({ texto: r.perguntaTexto, critico: !!r.critico, respostaId: r.id })),
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

  const comNota = visitas.filter((v) => v.aproveitamento != null);
  const media = comNota.length ? Math.round((comNota.reduce((s, v) => s + (v.aproveitamento ?? 0), 0) / comNota.length) * 10) / 10 : null;
  const totalNc = visitas.reduce((s, v) => s + (v.naoConformidades ?? 0), 0);
  const totalCrit = visitas.reduce((s, v) => s + (v.criticosNaoConformes ?? 0), 0);
  const linhas = dados
    .map((d, i) => {
      const v = d.visita;
      const pct = v.aproveitamento;
      const nc = v.naoConformidades ?? 0;
      const cr = v.criticosNaoConformes ?? 0;
      return `<tr><td class="pn">${i + 1}</td><td><b>${esc(nomeDoSetorVisita(v.setor))}</b>${d.contexto?.numero ? `<div class="base">Nº ${esc(d.contexto.numero)}</div>` : ''}</td>
        <td class="pc" style="color:${pct != null ? corAproveitamento(pct) : '#5B6280'};font-weight:700">${pct != null ? (v.modelo === 'livre' ? `${String(pct).replace('.', ',')} · ${faixaNotaLivre(pct).texto}` : `${pct}%`) : 'Sem nota'}</td>
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
        (media != null
          ? kpi('Média dos setores', `${media}%<span class="classif" style="color:${classificacao(media).cor};background:${classificacao(media).fundo}">${classificacao(media).texto}</span>`, corAproveitamento(media))
          : '') +
        kpi(media != null ? 'Não conformidades' : 'Apontamentos', String(totalNc), totalNc > 0 ? PDF_VERMELHO : PDF_VERDE) +
        (comNota.length ? kpi('Críticos reprovados', String(totalCrit), totalCrit > 0 ? PDF_VERMELHO : PDF_VERDE) : '')
      }</div>
      ${rotulo('Setores', 'cada um numa folha, para entregar ao responsável')}
      <table class="plano"><thead><tr><th class="pn">#</th><th>Setor</th><th class="pc">Aproveitamento</th><th class="pc">NC / Apont.</th><th class="pc">Críticos</th><th>Entregar para</th></tr></thead><tbody>${linhas}</tbody></table>
      
      <div class="base" style="margin-top:14px">Base: Manual de Boas Práticas e POPs (rev. 12.26)</div>`,
  };
  const html = documentoUlvaPaginas([resumo, ...dados.map(montarPaginaVisita)], `Visita técnica — Loja ${unidade} — ${dia}`, CSS_ASSIN + CSS_FOLHA);
  await compartilharPdf(html, `visita-tecnica-completa-loja-${visitas[0].unidade ?? ''}-${dataParaNomeArquivo(visitas[0].finalizadaEm)}`, 'Compartilhar visita completa');
}
