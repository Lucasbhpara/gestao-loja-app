// HTML/CSS/JS do painel de inventário FLV, gerado a partir do relatório
// "Resultado de Inventário FLV" da Loja 327 (período 27/07 a 23/08/2026).
// Fica embutido no app como string pra funcionar offline dentro da WebView —
// sem depender de internet nem de hospedar o arquivo em lugar nenhum.
//
// Pra atualizar com um novo inventário: gere um novo HTML autocontido (mesmo
// formato) e substitua o conteúdo entre os acentos graves abaixo.

export const PAINEL_INVENTARIO_FLV_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Painel Resultados</title>

<style>
  :root {
    color-scheme: light;
    --bg: #F4F5F9;
    --surface: #FFFFFF;
    --surface-2: #F8F9FC;
    --border: #E7E9F2;
    --text-primary: #1B1E2E;
    --text-secondary: #5B6280;
    --text-muted: #9AA1B8;
    --navy-900: #121B4A;
    --navy-700: #1B2A6B;
    --navy-500: #2C3F8C;
    --green: #2FA36B;
    --green-bg: #DFF3E9;
    --red: #E14337;
    --red-bg: #FBDEDC;
    --amber: #B4650E;
    --amber-bg: #FBEBD4;
    --cat-1: #2C3F8C;
    --cat-2: #6B4FA0;
    --cat-3: #1D8A8A;
    --cat-4: #4C6EF5;
    --cat-5: #9C6ADE;
    --cat-6: #3F6B52;
    --cat-more: #9AA1B8;
    --shadow: 0 1px 2px rgba(18,27,74,.06), 0 8px 24px rgba(18,27,74,.06);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --bg: #0E1330;
      --surface: #161B41;
      --surface-2: #1B2150;
      --border: #2A3066;
      --text-primary: #F1F2F8;
      --text-secondary: #B3B9DE;
      --text-muted: #7C82AC;
      --navy-900: #0B1030;
      --navy-700: #3450B4;
      --navy-500: #5A78D6;
      --green: #45D497;
      --green-bg: #123A2C;
      --red: #FF6E62;
      --red-bg: #3D1815;
      --amber: #F2AC55;
      --amber-bg: #3D2A10;
      --cat-1: #5A78D6;
      --cat-2: #B398E8;
      --cat-3: #4FC7C7;
      --cat-4: #8FA6FF;
      --cat-5: #C9A6F5;
      --cat-6: #7FB89A;
      --cat-more: #7C82AC;
      --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0E1330;
    --surface: #161B41;
    --surface-2: #1B2150;
    --border: #2A3066;
    --text-primary: #F1F2F8;
    --text-secondary: #B3B9DE;
    --text-muted: #7C82AC;
    --navy-900: #0B1030;
    --navy-700: #3450B4;
    --navy-500: #5A78D6;
    --green: #45D497;
    --green-bg: #123A2C;
    --red: #FF6E62;
    --red-bg: #3D1815;
    --amber: #F2AC55;
    --amber-bg: #3D2A10;
    --cat-1: #5A78D6;
    --cat-2: #B398E8;
    --cat-3: #4FC7C7;
    --cat-4: #8FA6FF;
    --cat-5: #C9A6F5;
    --cat-6: #7FB89A;
    --cat-more: #7C82AC;
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text-primary);
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 20px 20px 60px; }

  /* ---------- header ---------- */
  .topo {
    display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
    flex-wrap: wrap; margin-bottom: 20px;
  }
  .topo h1 { font-size: 21px; font-weight: 800; margin: 0 0 4px; letter-spacing: -0.2px; }
  .topo .sub { font-size: 13px; color: var(--text-secondary); }
  .topo .badge-periodo {
    background: var(--navy-900); color: #fff; border-radius: 10px; padding: 10px 14px;
    font-size: 12.5px; line-height: 1.5; text-align: right; white-space: nowrap;
  }
  .topo .badge-periodo b { font-size: 13.5px; }

  /* ---------- kpi cards ---------- */
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
  @media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
  .kpi {
    background: var(--surface); border-radius: 14px; padding: 16px 16px 14px;
    box-shadow: var(--shadow); border: 1px solid var(--border);
  }
  .kpi .rotulo { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--text-muted); }
  .kpi .valor { font-size: 22px; font-weight: 800; margin-top: 6px; letter-spacing: -.3px; font-variant-numeric: tabular-nums; }
  .kpi .meta-linha { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11.5px; color: var(--text-secondary); }
  .pill-delta { border-radius: 999px; padding: 2px 8px; font-weight: 700; font-size: 11px; }
  .pill-delta.ruim { background: var(--red-bg); color: var(--red); }
  .pill-delta.bom { background: var(--green-bg); color: var(--green); }

  /* ---------- alertas ---------- */
  .painel {
    background: var(--surface); border-radius: 14px; padding: 18px 20px; margin-bottom: 18px;
    box-shadow: var(--shadow); border: 1px solid var(--border);
  }
  .painel h2 { font-size: 15px; margin: 0 0 4px; font-weight: 800; }
  .painel .painel-sub { font-size: 12.5px; color: var(--text-secondary); margin-bottom: 14px; }
  .alertas { display: flex; flex-direction: column; gap: 10px; }
  .alerta {
    display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 10px;
    background: var(--surface-2); border: 1px solid var(--border);
  }
  .alerta .sev {
    flex: 0 0 auto; width: 26px; height: 26px; border-radius: 8px; display: flex;
    align-items: center; justify-content: center; font-size: 13px; font-weight: 800; color: #fff;
  }
  .alerta .sev.critico { background: var(--red); }
  .alerta .sev.atencao { background: var(--amber); }
  .alerta .sev.info { background: var(--navy-500); }
  .alerta .corpo { flex: 1; }
  .alerta .titulo-alerta { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
  .alerta .texto-alerta { font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; }
  .alerta .texto-alerta b { color: var(--text-primary); }

  /* ---------- gráficos ---------- */
  .graficos { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; margin-bottom: 18px; }
  @media (max-width: 900px) { .graficos { grid-template-columns: 1fr; } }
  .grafico-card { background: var(--surface); border-radius: 14px; padding: 16px 18px 10px; box-shadow: var(--shadow); border: 1px solid var(--border); }
  .grafico-card h3 { font-size: 13px; font-weight: 800; margin: 0 0 2px; }
  .grafico-card .grafico-sub { font-size: 11.5px; color: var(--text-secondary); margin-bottom: 8px; }
  .legenda-chart { display: flex; flex-wrap: wrap; gap: 10px 16px; margin: 6px 0 4px; font-size: 11px; color: var(--text-secondary); }
  .legenda-chart .item { display: flex; align-items: center; gap: 5px; }
  .legenda-chart .dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
  .barra-linha { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
  .barra-linha .nome-produto { flex: 0 0 150px; font-size: 11.5px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .barra-linha .trilha { flex: 1; height: 16px; background: var(--surface-2); border-radius: 5px; overflow: hidden; display: flex; }
  .barra-linha .seg { height: 100%; }
  .barra-linha .valor-barra { flex: 0 0 74px; text-align: right; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text-secondary); }

  /* ---------- filtros ---------- */
  .filtros {
    display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px;
  }
  .filtros select, .filtros input[type="search"] {
    background: var(--surface); border: 1px solid var(--border); border-radius: 9px;
    padding: 8px 12px; font-size: 12.5px; color: var(--text-primary); font-family: inherit;
  }
  .filtros input[type="search"] { min-width: 220px; }
  .filtros .chip-toggle {
    display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary);
    background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 7px 12px;
    cursor: pointer; user-select: none;
  }
  .filtros .chip-toggle input { accent-color: var(--navy-700); }
  .filtros .contagem { font-size: 12px; color: var(--text-muted); margin-left: auto; }

  /* ---------- tabela ---------- */
  .tabela-wrap { background: var(--surface); border-radius: 14px; box-shadow: var(--shadow); border: 1px solid var(--border); overflow: hidden; margin-bottom: 20px; }
  .tabela-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 780px; }
  thead th {
    text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .3px;
    color: var(--text-muted); font-weight: 700; padding: 10px 12px; border-bottom: 1px solid var(--border);
    cursor: pointer; white-space: nowrap; position: sticky; top: 0; background: var(--surface);
  }
  thead th:hover { color: var(--navy-700); }
  thead th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
  thead th .seta { opacity: .5; font-size: 9px; margin-left: 3px; }
  tbody td { padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--surface-2); }
  .nome-prod { font-weight: 700; color: var(--text-primary); }
  .cod-prod { font-size: 10.5px; color: var(--text-muted); }
  .classe-tag { font-size: 10.5px; color: var(--text-secondary); }
  .badge {
    display: inline-flex; align-items: center; gap: 4px; border-radius: 999px; padding: 3px 9px;
    font-size: 10.5px; font-weight: 700; white-space: nowrap;
  }
  .badge.investigar { background: var(--red-bg); color: var(--red); }
  .badge.sobra { background: var(--amber-bg); color: var(--amber); }
  .badge.quebra { background: var(--surface-2); color: var(--text-secondary); border: 1px solid var(--border); }
  .valor-neg { color: var(--green); }
  .vazio-tabela { padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px; }

  footer { text-align: center; font-size: 11px; color: var(--text-muted); padding: 10px 0 0; }
</style>
</head>
<body>
<div class="wrap">

  <div class="topo">
    <div>
      <h1>Painel Resultados &middot; Inventário FLV</h1>
      <div class="sub">Loja 327 &middot; Itatiaiucu &middot; Supervisor Reinaldo S.</div>
    </div>
    <div class="badge-periodo">
      Período do inventário<br />
      <b id="periodo-texto">—</b>
    </div>
  </div>

  <div class="kpis" id="kpis"></div>

  <div class="painel">
    <h2>Plano de ação &amp; alertas</h2>
    <div class="painel-sub">Gerado automaticamente a partir dos 104 produtos com divergência neste inventário — prioridade do que olhar primeiro.</div>
    <div class="alertas" id="alertas"></div>
  </div>

  <div class="graficos">
    <div class="grafico-card">
      <h3>Top 10 produtos por perda total</h3>
      <div class="grafico-sub">Perda identificada (quebra lançada) vs. não identificada (contagem sem explicação)</div>
      <div class="legenda-chart">
        <span class="item"><span class="dot" style="background:var(--navy-700)"></span>Identificada</span>
        <span class="item"><span class="dot" style="background:var(--red)"></span>Não identificada</span>
      </div>
      <div id="chart-top10"></div>
    </div>
    <div class="grafico-card">
      <h3>Perda total por categoria</h3>
      <div class="grafico-sub">Soma de perda ($) por classe de produto</div>
      <div id="chart-classe" style="margin-top:14px;"></div>
    </div>
  </div>

  <div class="filtros">
    <select id="f-classe"></select>
    <select id="f-resultado">
      <option value="todos">Todos os resultados</option>
      <option value="QUEBRA">Só quebra</option>
      <option value="SOBRA">Só sobra</option>
    </select>
    <input type="search" id="f-busca" placeholder="Buscar produto ou código…" />
    <label class="chip-toggle">
      <input type="checkbox" id="f-prioridade" />
      Só prioridade (investigar)
    </label>
    <span class="contagem" id="contagem-resultado"></span>
  </div>

  <div class="tabela-wrap">
    <div class="tabela-scroll">
      <table>
        <thead>
          <tr>
            <th data-campo="produto">Produto <span class="seta"></span></th>
            <th data-campo="classe">Categoria <span class="seta"></span></th>
            <th data-campo="estoqueFinal" class="num">Estoque final <span class="seta"></span></th>
            <th data-campo="perdaIdentificadaValor" class="num">Perda identif. <span class="seta"></span></th>
            <th data-campo="perdaNaoIdentificadaValor" class="num">Perda não identif. <span class="seta"></span></th>
            <th data-campo="perdaTotalValor" class="num">Perda total <span class="seta"></span></th>
            <th data-campo="pctPerda" class="num">% perda <span class="seta"></span></th>
            <th data-campo="resultado">Situação <span class="seta"></span></th>
          </tr>
        </thead>
        <tbody id="corpo-tabela"></tbody>
      </table>
    </div>
  </div>

  <footer>Painel gerado a partir do relatório "Resultado de Inventário FLV" — dados oficiais de totais e metas conforme o próprio relatório.</footer>
</div>

<script>
const DADOS = {"meta": {"loja": "327", "nomeLoja": "ITATIAIUCU", "supervisor": "REINALDO S.", "periodoInicio": "2026-07-27", "periodoFim": "2026-08-23"}, "totais": {"estoqueInicial": 7072.0, "entradas": 56871.0, "vendas": 53962.09, "saidas": 110.0, "consumoInterno": 0.0, "consumoProducao": 44.43, "quebraIdentificadaQuant": 3770.5, "saldo": 6130.33, "estoqueFinal": 4843.0, "perdaNaoIdentificadaQuant": 1287.33, "perdaNaoIdentificadaValor": 6088.09, "perdaIdentificadaValor": 16863.25, "perdaTotalQuant": 5057.83, "perdaTotalValor": 22951.34, "vendaValor": 375451.62, "pctPerda": 6.1}, "indicadores": [{"nome": "Perda Identificada", "meta": 4.7, "realizado": 4.5}, {"nome": "Perda Não Identificada", "meta": 1.3, "realizado": 1.6}, {"nome": "Perda Total", "meta": 6.0, "realizado": 6.1}], "produtos": [{"codigo": "6724", "produto": "BATATA INGLESA KG", "classe": "BATATA", "estoqueInicial": 568.0, "entradas": 6750.0, "vendas": 5774.48, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 611.05, "saldo": 932.47, "estoqueFinal": 338.0, "perdaNaoIdentificadaQuant": 594.47, "perdaNaoIdentificadaValor": 1498.73, "perdaIdentificadaQuant2": 611.05, "perdaIdentificadaValor": 1540.53, "perdaTotalQuant": 1205.52, "perdaTotalValor": 3039.26, "vendaValor": 19257.81, "pctPerda": 15.8, "resultado": "QUEBRA"}, {"codigo": "182167", "produto": "OVOS BCOS.MANTIQUEIRA GDE.C/30 BJ", "classe": "OVOS GALINHA BCOS", "estoqueInicial": 10.0, "entradas": 2640.0, "vendas": 1959.0, "saidas": 108.0, "consumoInterno": 0.0, "consumoProducao": 33.0, "quebraIdentificadaQuant": 0.0, "saldo": 550.0, "estoqueFinal": 390.0, "perdaNaoIdentificadaQuant": 160.0, "perdaNaoIdentificadaValor": 2497.44, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 160.0, "perdaTotalValor": 2497.44, "vendaValor": 36130.82, "pctPerda": 6.9, "resultado": "QUEBRA"}, {"codigo": "188450", "produto": "MANDIOCA EMBALADA DESC.1KG PT", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 25.0, "entradas": 195.0, "vendas": 0.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 1.0, "saldo": 219.0, "estoqueFinal": 3.0, "perdaNaoIdentificadaQuant": 216.0, "perdaNaoIdentificadaValor": 1799.28, "perdaIdentificadaQuant2": 1.0, "perdaIdentificadaValor": 8.33, "perdaTotalQuant": 217.0, "perdaTotalValor": 1807.61, "vendaValor": 0.0, "pctPerda": 0.0, "resultado": "QUEBRA"}, {"codigo": "6424", "produto": "TOMATE LONGA VIDA KG", "classe": "TOMATE", "estoqueInicial": 262.0, "entradas": 1700.0, "vendas": 1606.27, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 363.44, "saldo": -7.71, "estoqueFinal": 9.0, "perdaNaoIdentificadaQuant": -16.71, "perdaNaoIdentificadaValor": -72.36, "perdaIdentificadaQuant2": 363.44, "perdaIdentificadaValor": 1573.78, "perdaTotalQuant": 346.73, "perdaTotalValor": 1501.43, "vendaValor": 9406.98, "pctPerda": 16.0, "resultado": "QUEBRA"}, {"codigo": "203", "produto": "MEXERICA PONKAN KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 243.0, "entradas": 2224.0, "vendas": 1982.32, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 354.77, "saldo": 129.91, "estoqueFinal": 130.0, "perdaNaoIdentificadaQuant": -0.09, "perdaNaoIdentificadaValor": -0.33, "perdaIdentificadaQuant2": 354.77, "perdaIdentificadaValor": 1361.25, "perdaTotalQuant": 354.68, "perdaTotalValor": 1360.92, "vendaValor": 9333.57, "pctPerda": 14.6, "resultado": "QUEBRA"}, {"codigo": "191", "produto": "MACA NACIONAL GALA KG", "classe": "MACA", "estoqueInicial": 464.0, "entradas": 1818.0, "vendas": 1820.65, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 130.5, "saldo": 330.86, "estoqueFinal": 183.0, "perdaNaoIdentificadaQuant": 147.86, "perdaNaoIdentificadaValor": 682.96, "perdaIdentificadaQuant2": 130.5, "perdaIdentificadaValor": 602.8, "perdaTotalQuant": 278.36, "perdaTotalValor": 1285.76, "vendaValor": 11924.13, "pctPerda": 10.8, "resultado": "QUEBRA"}, {"codigo": "3074", "produto": "MORANGO 250G BJ", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 19.0, "entradas": 380.0, "vendas": 201.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 104.0, "saldo": 94.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 94.0, "perdaNaoIdentificadaValor": 589.72, "perdaIdentificadaQuant2": 104.0, "perdaIdentificadaValor": 652.46, "perdaTotalQuant": 198.0, "perdaTotalValor": 1242.18, "vendaValor": 1987.98, "pctPerda": 62.5, "resultado": "QUEBRA"}, {"codigo": "136", "produto": "LARANJA BAHIA KG", "classe": "LARANJA", "estoqueInicial": 34.0, "entradas": 1422.0, "vendas": 968.91, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 66.6, "saldo": 420.5, "estoqueFinal": 115.0, "perdaNaoIdentificadaQuant": 305.5, "perdaNaoIdentificadaValor": 934.81, "perdaIdentificadaQuant2": 66.6, "perdaIdentificadaValor": 203.8, "perdaTotalQuant": 372.1, "perdaTotalValor": 1138.61, "vendaValor": 3856.38, "pctPerda": 29.5, "resultado": "QUEBRA"}, {"codigo": "7131", "produto": "TOMATE ITALIANO ANDREA KG", "classe": "TOMATE", "estoqueInicial": 142.0, "entradas": 2420.0, "vendas": 2308.19, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 171.05, "saldo": 82.77, "estoqueFinal": 41.0, "perdaNaoIdentificadaQuant": 41.77, "perdaNaoIdentificadaValor": 191.23, "perdaIdentificadaQuant2": 171.05, "perdaIdentificadaValor": 783.18, "perdaTotalQuant": 212.82, "perdaTotalValor": 974.41, "vendaValor": 14652.75, "pctPerda": 6.6, "resultado": "QUEBRA"}, {"codigo": "88994", "produto": "PIMENTAO AMARELO/VERMELHO KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 43.0, "entradas": 220.0, "vendas": 176.58, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.35, "quebraIdentificadaQuant": 60.4, "saldo": 25.68, "estoqueFinal": 35.0, "perdaNaoIdentificadaQuant": -9.32, "perdaNaoIdentificadaValor": -173.63, "perdaIdentificadaQuant2": 60.4, "perdaIdentificadaValor": 1124.66, "perdaTotalQuant": 51.08, "perdaTotalValor": 951.02, "vendaValor": 4691.71, "pctPerda": 20.3, "resultado": "QUEBRA"}, {"codigo": "193", "produto": "MAMAO FORMOSO KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 92.0, "entradas": 590.0, "vendas": 498.93, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 124.53, "saldo": 58.54, "estoqueFinal": 55.0, "perdaNaoIdentificadaQuant": 3.54, "perdaNaoIdentificadaValor": 23.74, "perdaIdentificadaQuant2": 124.53, "perdaIdentificadaValor": 834.65, "perdaTotalQuant": 128.07, "perdaTotalValor": 858.39, "vendaValor": 5110.97, "pctPerda": 16.8, "resultado": "QUEBRA"}, {"codigo": "246", "produto": "PERA KG", "classe": "PERA", "estoqueInicial": 152.0, "entradas": 324.0, "vendas": 371.96, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 54.3, "saldo": 49.75, "estoqueFinal": 6.0, "perdaNaoIdentificadaQuant": 43.75, "perdaNaoIdentificadaValor": 329.64, "perdaIdentificadaQuant2": 54.3, "perdaIdentificadaValor": 409.17, "perdaTotalQuant": 98.05, "perdaTotalValor": 738.81, "vendaValor": 3853.1, "pctPerda": 19.2, "resultado": "QUEBRA"}, {"codigo": "198", "produto": "MARACUJA AZEDO KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 55.0, "entradas": 804.0, "vendas": 693.66, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 30.35, "saldo": 134.99, "estoqueFinal": 91.0, "perdaNaoIdentificadaQuant": 43.99, "perdaNaoIdentificadaValor": 371.85, "perdaIdentificadaQuant2": 30.35, "perdaIdentificadaValor": 256.55, "perdaTotalQuant": 74.34, "perdaTotalValor": 628.41, "vendaValor": 8446.79, "pctPerda": 7.4, "resultado": "QUEBRA"}, {"codigo": "125", "produto": "JILO KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 25.0, "entradas": 280.0, "vendas": 223.99, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 89.25, "saldo": -8.24, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -8.24, "perdaNaoIdentificadaValor": -58.8, "perdaIdentificadaQuant2": 89.25, "perdaIdentificadaValor": 637.25, "perdaTotalQuant": 81.02, "perdaTotalValor": 578.45, "vendaValor": 2058.03, "pctPerda": 28.1, "resultado": "QUEBRA"}, {"codigo": "6723", "produto": "BATATA DOCE ROXA KG", "classe": "BATATA", "estoqueInicial": 166.0, "entradas": 620.0, "vendas": 589.71, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 35.95, "saldo": 160.35, "estoqueFinal": 38.0, "perdaNaoIdentificadaQuant": 122.35, "perdaNaoIdentificadaValor": 397.62, "perdaIdentificadaQuant2": 35.95, "perdaIdentificadaValor": 116.84, "perdaTotalQuant": 158.3, "perdaTotalValor": 514.46, "vendaValor": 2468.05, "pctPerda": 20.8, "resultado": "QUEBRA"}, {"codigo": "181313", "produto": "OVOS CODORNA MANTIQUEIRA C/30 BJ", "classe": "OVOS CODORNA", "estoqueInicial": 54.0, "entradas": 80.0, "vendas": 60.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 62.0, "saldo": 12.0, "estoqueFinal": 12.0, "perdaNaoIdentificadaQuant": 0.0, "perdaNaoIdentificadaValor": 0.0, "perdaIdentificadaQuant2": 62.0, "perdaIdentificadaValor": 465.0, "perdaTotalQuant": 62.0, "perdaTotalValor": 465.0, "vendaValor": 598.8, "pctPerda": 77.7, "resultado": "QUEBRA"}, {"codigo": "69920", "produto": "UVA THOMPSON 500G BJ", "classe": "UVA", "estoqueInicial": 135.0, "entradas": 350.0, "vendas": 382.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 54.0, "saldo": 49.0, "estoqueFinal": 43.0, "perdaNaoIdentificadaQuant": 6.0, "perdaNaoIdentificadaValor": 44.82, "perdaIdentificadaQuant2": 54.0, "perdaIdentificadaValor": 403.42, "perdaTotalQuant": 60.0, "perdaTotalValor": 448.25, "vendaValor": 4184.36, "pctPerda": 10.7, "resultado": "QUEBRA"}, {"codigo": "3044", "produto": "ABACAXI UN", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 105.0, "entradas": 1020.0, "vendas": 971.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 12.0, "saldo": 142.0, "estoqueFinal": 82.0, "perdaNaoIdentificadaQuant": 60.0, "perdaNaoIdentificadaValor": 346.56, "perdaIdentificadaQuant2": 12.0, "perdaIdentificadaValor": 69.31, "perdaTotalQuant": 72.0, "perdaTotalValor": 415.87, "vendaValor": 7203.58, "pctPerda": 5.8, "resultado": "QUEBRA"}, {"codigo": "6741", "produto": "CEBOLA AMARELA KG", "classe": "CEBOLA", "estoqueInicial": 83.0, "entradas": 3200.0, "vendas": 2898.1, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 52.9, "saldo": 332.0, "estoqueFinal": 289.0, "perdaNaoIdentificadaQuant": 43.0, "perdaNaoIdentificadaValor": 182.75, "perdaIdentificadaQuant2": 52.9, "perdaIdentificadaValor": 224.83, "perdaTotalQuant": 95.9, "perdaTotalValor": 407.58, "vendaValor": 16878.58, "pctPerda": 2.4, "resultado": "QUEBRA"}, {"codigo": "3052", "produto": "COCO VERDE UN", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 43.0, "entradas": 340.0, "vendas": 238.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 13.0, "saldo": 132.0, "estoqueFinal": 3.0, "perdaNaoIdentificadaQuant": 129.0, "perdaNaoIdentificadaValor": 321.96, "perdaIdentificadaQuant2": 13.0, "perdaIdentificadaValor": 32.45, "perdaTotalQuant": 142.0, "perdaTotalValor": 354.4, "vendaValor": 947.24, "pctPerda": 37.4, "resultado": "QUEBRA"}, {"codigo": "253", "produto": "PIMENTAO VERDE KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 31.0, "entradas": 490.0, "vendas": 456.95, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.08, "quebraIdentificadaQuant": 55.58, "saldo": 8.4, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 8.4, "perdaNaoIdentificadaValor": 46.37, "perdaIdentificadaQuant2": 55.58, "perdaIdentificadaValor": 306.99, "perdaTotalQuant": 63.98, "perdaTotalValor": 353.36, "vendaValor": 3283.88, "pctPerda": 10.8, "resultado": "QUEBRA"}, {"codigo": "6733", "produto": "CARA/INHAME KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 152.0, "entradas": 680.0, "vendas": 687.52, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 21.05, "saldo": 123.43, "estoqueFinal": 66.0, "perdaNaoIdentificadaQuant": 57.43, "perdaNaoIdentificadaValor": 223.77, "perdaIdentificadaQuant2": 21.05, "perdaIdentificadaValor": 82.02, "perdaTotalQuant": 78.48, "perdaTotalValor": 305.79, "vendaValor": 3560.02, "pctPerda": 8.6, "resultado": "QUEBRA"}, {"codigo": "7887", "produto": "BATATA BOLINHA KG", "classe": "BATATA", "estoqueInicial": 219.0, "entradas": 1075.0, "vendas": 1083.73, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 148.47, "saldo": 61.8, "estoqueFinal": 43.0, "perdaNaoIdentificadaQuant": 18.8, "perdaNaoIdentificadaValor": 32.7, "perdaIdentificadaQuant2": 148.47, "perdaIdentificadaValor": 258.23, "perdaTotalQuant": 167.27, "perdaTotalValor": 290.93, "vendaValor": 2161.47, "pctPerda": 13.5, "resultado": "QUEBRA"}, {"codigo": "18474", "produto": "MORANGO ESPECIAL 250G BJ", "classe": "HORTIFRUTI FRUTAS", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 0.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 19.0, "saldo": 0.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 0.0, "perdaNaoIdentificadaValor": 0.0, "perdaIdentificadaQuant2": 19.0, "perdaIdentificadaValor": 285.0, "perdaTotalQuant": 19.0, "perdaTotalValor": 285.0, "vendaValor": 436.62, "pctPerda": 65.3, "resultado": "QUEBRA"}, {"codigo": "181298", "produto": "OVOS CAIPIRA MANTIQUEIRA HAPPY EGGS C/10", "classe": "OVOS GALINHA VERM", "estoqueInicial": 4.0, "entradas": 120.0, "vendas": 75.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 1.0, "quebraIdentificadaQuant": 0.0, "saldo": 48.0, "estoqueFinal": 19.0, "perdaNaoIdentificadaQuant": 29.0, "perdaNaoIdentificadaValor": 242.05, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 29.0, "perdaTotalValor": 242.05, "vendaValor": 823.5, "pctPerda": 29.4, "resultado": "QUEBRA"}, {"codigo": "194", "produto": "MAMAO HAVAI KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 47.0, "entradas": 420.0, "vendas": 410.16, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 39.85, "saldo": 16.99, "estoqueFinal": 14.0, "perdaNaoIdentificadaQuant": 2.99, "perdaNaoIdentificadaValor": 15.53, "perdaIdentificadaQuant2": 39.85, "perdaIdentificadaValor": 206.97, "perdaTotalQuant": 42.84, "perdaTotalValor": 222.5, "vendaValor": 2831.54, "pctPerda": 7.9, "resultado": "QUEBRA"}, {"codigo": "6778", "produto": "ABOBORA ITALIANA KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 61.0, "entradas": 527.0, "vendas": 475.72, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 45.87, "saldo": 66.41, "estoqueFinal": 26.0, "perdaNaoIdentificadaQuant": 40.41, "perdaNaoIdentificadaValor": 103.35, "perdaIdentificadaQuant2": 45.87, "perdaIdentificadaValor": 117.32, "perdaTotalQuant": 86.28, "perdaTotalValor": 220.67, "vendaValor": 1643.93, "pctPerda": 13.4, "resultado": "QUEBRA"}, {"codigo": "6769", "produto": "ABACATE KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 103.0, "entradas": 500.0, "vendas": 464.34, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 61.15, "saldo": 77.51, "estoqueFinal": 61.0, "perdaNaoIdentificadaQuant": 16.51, "perdaNaoIdentificadaValor": 42.73, "perdaIdentificadaQuant2": 61.15, "perdaIdentificadaValor": 158.25, "perdaTotalQuant": 77.66, "perdaTotalValor": 200.97, "vendaValor": 1799.53, "pctPerda": 11.2, "resultado": "QUEBRA"}, {"codigo": "188", "produto": "MACA ARGENTINA/CHILENA KG", "classe": "MACA", "estoqueInicial": 44.0, "entradas": 95.0, "vendas": 37.57, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 3.13, "saldo": 98.31, "estoqueFinal": 81.0, "perdaNaoIdentificadaQuant": 17.31, "perdaNaoIdentificadaValor": 168.55, "perdaIdentificadaQuant2": 3.13, "perdaIdentificadaValor": 30.49, "perdaTotalQuant": 20.44, "perdaTotalValor": 199.04, "vendaValor": 525.19, "pctPerda": 37.9, "resultado": "QUEBRA"}, {"codigo": "72937", "produto": "UVA RUBI 500G BJ", "classe": "UVA", "estoqueInicial": 0.0, "entradas": 220.0, "vendas": 166.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 1.0, "saldo": 53.0, "estoqueFinal": 16.0, "perdaNaoIdentificadaQuant": 37.0, "perdaNaoIdentificadaValor": 192.4, "perdaIdentificadaQuant2": 1.0, "perdaIdentificadaValor": 5.2, "perdaTotalQuant": 38.0, "perdaTotalValor": 197.6, "vendaValor": 1324.68, "pctPerda": 14.9, "resultado": "QUEBRA"}, {"codigo": "201", "produto": "MELANCIA KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 70.0, "entradas": 990.0, "vendas": 973.08, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 79.21, "saldo": 7.71, "estoqueFinal": 8.0, "perdaNaoIdentificadaQuant": -0.29, "perdaNaoIdentificadaValor": -0.72, "perdaIdentificadaQuant2": 79.21, "perdaIdentificadaValor": 196.48, "perdaTotalQuant": 78.92, "perdaTotalValor": 195.76, "vendaValor": 3212.57, "pctPerda": 6.1, "resultado": "QUEBRA"}, {"codigo": "249180", "produto": "RAPADURA H&M C/MAMAO COCO 500G PT", "classe": "RAPADURA CEASA", "estoqueInicial": 31.0, "entradas": 0.0, "vendas": 1.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 30.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 30.0, "perdaNaoIdentificadaValor": 192.6, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 30.0, "perdaTotalValor": 192.6, "vendaValor": 7.98, "pctPerda": 2413.5, "resultado": "QUEBRA"}, {"codigo": "118313", "produto": "KIWI 600G BJ", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 0.0, "entradas": 20.0, "vendas": 0.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 20.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 20.0, "perdaNaoIdentificadaValor": 184.49, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 20.0, "perdaTotalValor": 184.49, "vendaValor": 0.0, "pctPerda": 0.0, "resultado": "QUEBRA"}, {"codigo": "335", "produto": "REPOLHO VERDE KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 71.0, "entradas": 560.0, "vendas": 500.5, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 5.04, "saldo": 125.46, "estoqueFinal": 63.0, "perdaNaoIdentificadaQuant": 62.46, "perdaNaoIdentificadaValor": 169.6, "perdaIdentificadaQuant2": 5.04, "perdaIdentificadaValor": 13.68, "perdaTotalQuant": 67.5, "perdaTotalValor": 183.29, "vendaValor": 1770.38, "pctPerda": 10.4, "resultado": "QUEBRA"}, {"codigo": "6817", "produto": "AMEIXA IMPORTADA KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 5.0, "entradas": 117.0, "vendas": 103.39, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 2.03, "saldo": 16.58, "estoqueFinal": 7.0, "perdaNaoIdentificadaQuant": 9.58, "perdaNaoIdentificadaValor": 146.22, "perdaIdentificadaQuant2": 2.03, "perdaIdentificadaValor": 30.98, "perdaTotalQuant": 11.61, "perdaTotalValor": 177.21, "vendaValor": 2446.18, "pctPerda": 7.2, "resultado": "QUEBRA"}, {"codigo": "3252", "produto": "UVA ITALIA 500G BJ", "classe": "UVA", "estoqueInicial": 37.0, "entradas": 80.0, "vendas": 87.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 24.0, "saldo": 6.0, "estoqueFinal": 3.0, "perdaNaoIdentificadaQuant": 3.0, "perdaNaoIdentificadaValor": 19.2, "perdaIdentificadaQuant2": 24.0, "perdaIdentificadaValor": 153.6, "perdaTotalQuant": 27.0, "perdaTotalValor": 172.8, "vendaValor": 887.26, "pctPerda": 19.5, "resultado": "QUEBRA"}, {"codigo": "3781", "produto": "BATATA DOCE BRANCA KG", "classe": "BATATA", "estoqueInicial": 132.0, "entradas": 580.0, "vendas": 520.47, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 60.6, "saldo": 130.93, "estoqueFinal": 144.0, "perdaNaoIdentificadaQuant": -13.07, "perdaNaoIdentificadaValor": -46.8, "perdaIdentificadaQuant2": 60.6, "perdaIdentificadaValor": 217.01, "perdaTotalQuant": 47.53, "perdaTotalValor": 170.21, "vendaValor": 2306.84, "pctPerda": 7.4, "resultado": "QUEBRA"}, {"codigo": "244", "produto": "PEPINO KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 125.0, "entradas": 380.0, "vendas": 431.47, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 42.35, "saldo": 31.19, "estoqueFinal": 14.0, "perdaNaoIdentificadaQuant": 17.19, "perdaNaoIdentificadaValor": 47.1, "perdaIdentificadaQuant2": 42.35, "perdaIdentificadaValor": 116.06, "perdaTotalQuant": 59.54, "perdaTotalValor": 163.16, "vendaValor": 1746.71, "pctPerda": 9.3, "resultado": "QUEBRA"}, {"codigo": "4643", "produto": "ALHO GRANEL KG", "classe": "ALHO", "estoqueInicial": 252.0, "entradas": 850.0, "vendas": 984.1, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 2.45, "saldo": 115.45, "estoqueFinal": 107.0, "perdaNaoIdentificadaQuant": 8.45, "perdaNaoIdentificadaValor": 112.13, "perdaIdentificadaQuant2": 2.45, "perdaIdentificadaValor": 32.51, "perdaTotalQuant": 10.9, "perdaTotalValor": 144.64, "vendaValor": 17013.19, "pctPerda": 0.9, "resultado": "QUEBRA"}, {"codigo": "6749", "produto": "CHUCHU KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 175.0, "entradas": 420.0, "vendas": 468.35, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 69.2, "saldo": 57.46, "estoqueFinal": 42.0, "perdaNaoIdentificadaQuant": 15.46, "perdaNaoIdentificadaValor": 26.03, "perdaIdentificadaQuant2": 69.2, "perdaIdentificadaValor": 116.57, "perdaTotalQuant": 84.66, "perdaTotalValor": 142.6, "vendaValor": 1093.91, "pctPerda": 13.0, "resultado": "QUEBRA"}, {"codigo": "6745", "produto": "CENOURA VERMELHA KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 147.0, "entradas": 1880.0, "vendas": 1912.42, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 91.2, "saldo": 23.38, "estoqueFinal": 79.0, "perdaNaoIdentificadaQuant": -55.62, "perdaNaoIdentificadaValor": -222.52, "perdaIdentificadaQuant2": 91.2, "perdaIdentificadaValor": 364.85, "perdaTotalQuant": 35.58, "perdaTotalValor": 142.33, "vendaValor": 10074.79, "pctPerda": 1.4, "resultado": "QUEBRA"}, {"codigo": "137", "produto": "LARANJA PERA RIO KG", "classe": "LARANJA", "estoqueInicial": 581.0, "entradas": 4900.0, "vendas": 4844.44, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 122.92, "saldo": 513.64, "estoqueFinal": 574.0, "perdaNaoIdentificadaQuant": -60.36, "perdaNaoIdentificadaValor": -135.81, "perdaIdentificadaQuant2": 122.92, "perdaIdentificadaValor": 276.57, "perdaTotalQuant": 62.56, "perdaTotalValor": 140.76, "vendaValor": 15231.77, "pctPerda": 0.9, "resultado": "QUEBRA"}, {"codigo": "6719", "produto": "BANANA CATURRA KG", "classe": "BANANA", "estoqueInicial": 151.0, "entradas": 1365.0, "vendas": 1470.27, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 39.8, "saldo": 5.93, "estoqueFinal": 9.0, "perdaNaoIdentificadaQuant": -3.07, "perdaNaoIdentificadaValor": -11.08, "perdaIdentificadaQuant2": 39.8, "perdaIdentificadaValor": 143.82, "perdaTotalQuant": 36.73, "perdaTotalValor": 132.75, "vendaValor": 7406.73, "pctPerda": 1.8, "resultado": "QUEBRA"}, {"codigo": "378", "produto": "COUVE FLOR UN", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 17.0, "entradas": 66.0, "vendas": 63.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 1.0, "saldo": 19.0, "estoqueFinal": 6.0, "perdaNaoIdentificadaQuant": 13.0, "perdaNaoIdentificadaValor": 106.92, "perdaIdentificadaQuant2": 1.0, "perdaIdentificadaValor": 8.22, "perdaTotalQuant": 14.0, "perdaTotalValor": 115.14, "vendaValor": 635.74, "pctPerda": 18.1, "resultado": "QUEBRA"}, {"codigo": "6750", "produto": "COCO SECO KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 110.0, "entradas": 342.0, "vendas": 271.29, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 12.5, "saldo": 168.21, "estoqueFinal": 152.0, "perdaNaoIdentificadaQuant": 16.21, "perdaNaoIdentificadaValor": 63.34, "perdaIdentificadaQuant2": 12.5, "perdaIdentificadaValor": 48.85, "perdaTotalQuant": 28.71, "perdaTotalValor": 112.19, "vendaValor": 1622.43, "pctPerda": 6.9, "resultado": "QUEBRA"}, {"codigo": "18468", "produto": "VAGEM 300G BJ", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 40.0, "entradas": 100.0, "vendas": 102.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 38.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 38.0, "perdaNaoIdentificadaValor": 108.96, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 38.0, "perdaTotalValor": 108.96, "vendaValor": 437.96, "pctPerda": 24.9, "resultado": "QUEBRA"}, {"codigo": "193764", "produto": "TOMATE MUNDO LEVE SALADETE 400G", "classe": "HORTIFRUTI LEGUMES/FOLHAGEM", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 0.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 12.0, "saldo": 0.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 0.0, "perdaNaoIdentificadaValor": 0.0, "perdaIdentificadaQuant2": 12.0, "perdaIdentificadaValor": 105.48, "perdaTotalQuant": 12.0, "perdaTotalValor": 105.48, "vendaValor": 615.44, "pctPerda": 17.1, "resultado": "QUEBRA"}, {"codigo": "3317", "produto": "GOIABA VERMELHA KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 7.0, "entradas": 176.0, "vendas": 161.31, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 1.75, "saldo": 19.94, "estoqueFinal": 7.0, "perdaNaoIdentificadaQuant": 12.94, "perdaNaoIdentificadaValor": 90.72, "perdaIdentificadaQuant2": 1.75, "perdaIdentificadaValor": 12.27, "perdaTotalQuant": 14.69, "perdaTotalValor": 102.99, "vendaValor": 1643.31, "pctPerda": 6.3, "resultado": "QUEBRA"}, {"codigo": "235", "produto": "NECTARINA IMPORTADA KG", "classe": "HORTIFRUTI FRUTAS", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 0.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 5.35, "saldo": 0.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 0.0, "perdaNaoIdentificadaValor": 0.0, "perdaIdentificadaQuant2": 5.35, "perdaIdentificadaValor": 97.08, "perdaTotalQuant": 5.35, "perdaTotalValor": 97.08, "vendaValor": 537.54, "pctPerda": 18.1, "resultado": "QUEBRA"}, {"codigo": "197", "produto": "MANGA TOMY KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 60.0, "entradas": 460.0, "vendas": 445.74, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 9.4, "saldo": 64.87, "estoqueFinal": 59.0, "perdaNaoIdentificadaQuant": 5.86, "perdaNaoIdentificadaValor": 33.72, "perdaIdentificadaQuant2": 9.4, "perdaIdentificadaValor": 54.05, "perdaTotalQuant": 15.27, "perdaTotalValor": 87.77, "vendaValor": 4002.8, "pctPerda": 2.2, "resultado": "QUEBRA"}, {"codigo": "262257", "produto": "ALHO DESC.MUNDO LEVE 250G BJ", "classe": "HORTIFRUTI LEGUMES/FOLHAGEM", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 0.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 9.0, "saldo": 0.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 0.0, "perdaNaoIdentificadaValor": 0.0, "perdaIdentificadaQuant2": 9.0, "perdaIdentificadaValor": 86.22, "perdaTotalQuant": 9.0, "perdaTotalValor": 86.22, "vendaValor": 754.74, "pctPerda": 11.4, "resultado": "QUEBRA"}, {"codigo": "288143", "produto": "OVOS VERM.MANTIQUEIRA H.EGGS GDE.C/30 BJ", "classe": "OVOS GALINHA VERM", "estoqueInicial": 0.0, "entradas": 84.0, "vendas": 80.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 4.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 4.0, "perdaNaoIdentificadaValor": 80.0, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 4.0, "perdaTotalValor": 80.0, "vendaValor": 1998.4, "pctPerda": 4.0, "resultado": "QUEBRA"}, {"codigo": "163777", "produto": "MILHO SWEET TREBESCHI 450G PT", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 18.0, "entradas": 0.0, "vendas": 9.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 9.0, "saldo": 0.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 0.0, "perdaNaoIdentificadaValor": 0.0, "perdaIdentificadaQuant2": 9.0, "perdaIdentificadaValor": 79.2, "perdaTotalQuant": 9.0, "perdaTotalValor": 79.2, "vendaValor": 89.82, "pctPerda": 88.2, "resultado": "QUEBRA"}, {"codigo": "235927", "produto": "PEPINO JAPONES KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 0.0, "entradas": 36.0, "vendas": 14.86, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 14.55, "saldo": 6.59, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 6.59, "perdaNaoIdentificadaValor": 21.94, "perdaIdentificadaQuant2": 14.55, "perdaIdentificadaValor": 48.45, "perdaTotalQuant": 21.14, "perdaTotalValor": 70.4, "vendaValor": 60.68, "pctPerda": 116.0, "resultado": "QUEBRA"}, {"codigo": "63960", "produto": "UVA CRIMSON 500G BJ", "classe": "UVA", "estoqueInicial": 15.0, "entradas": 180.0, "vendas": 184.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 11.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 11.0, "perdaNaoIdentificadaValor": 62.03, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 11.0, "perdaTotalValor": 62.03, "vendaValor": 1618.51, "pctPerda": 3.8, "resultado": "QUEBRA"}, {"codigo": "336", "produto": "REPOLHO ROXO KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 7.0, "entradas": 48.0, "vendas": 40.48, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.62, "saldo": 13.9, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 13.9, "perdaNaoIdentificadaValor": 57.61, "perdaIdentificadaQuant2": 0.62, "perdaIdentificadaValor": 2.57, "perdaTotalQuant": 14.52, "perdaTotalValor": 60.18, "vendaValor": 232.29, "pctPerda": 25.9, "resultado": "QUEBRA"}, {"codigo": "236384", "produto": "OVOS CAIPIRA MANTIQUEIRA C/20 BJ", "classe": "OVOS GALINHA VERM", "estoqueInicial": 0.0, "entradas": 36.0, "vendas": 33.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 2.0, "saldo": 1.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 1.0, "perdaNaoIdentificadaValor": 16.0, "perdaIdentificadaQuant2": 2.0, "perdaIdentificadaValor": 32.0, "perdaTotalQuant": 3.0, "perdaTotalValor": 48.0, "vendaValor": 692.34, "pctPerda": 6.9, "resultado": "QUEBRA"}, {"codigo": "10124", "produto": "QUIABO 300G BJ", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 2.0, "entradas": 300.0, "vendas": 290.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 12.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 12.0, "perdaNaoIdentificadaValor": 47.88, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 12.0, "perdaTotalValor": 47.88, "vendaValor": 1730.2, "pctPerda": 2.8, "resultado": "QUEBRA"}, {"codigo": "79656", "produto": "UVA RED GLOBE 500G BJ", "classe": "UVA", "estoqueInicial": 0.0, "entradas": 140.0, "vendas": 117.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 23.0, "estoqueFinal": 18.0, "perdaNaoIdentificadaQuant": 5.0, "perdaNaoIdentificadaValor": 45.13, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 5.0, "perdaTotalValor": 45.13, "vendaValor": 1635.66, "pctPerda": 2.8, "resultado": "QUEBRA"}, {"codigo": "6732", "produto": "CAQUI 500G BJ", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 0.0, "entradas": 130.0, "vendas": 101.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 5.0, "saldo": 24.0, "estoqueFinal": 24.0, "perdaNaoIdentificadaQuant": 0.0, "perdaNaoIdentificadaValor": 0.0, "perdaIdentificadaQuant2": 5.0, "perdaIdentificadaValor": 43.05, "perdaTotalQuant": 5.0, "perdaTotalValor": 43.05, "vendaValor": 1291.98, "pctPerda": 3.3, "resultado": "QUEBRA"}, {"codigo": "184418", "produto": "OVOS VERM.MANTIQUEIRA ORG.C/10 BJ", "classe": "OVOS GALINHA VERM", "estoqueInicial": 21.0, "entradas": 48.0, "vendas": 26.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 9.0, "quebraIdentificadaQuant": 34.0, "saldo": 0.0, "estoqueFinal": 31.0, "perdaNaoIdentificadaQuant": -31.0, "perdaNaoIdentificadaValor": -403.0, "perdaIdentificadaQuant2": 34.0, "perdaIdentificadaValor": 442.0, "perdaTotalQuant": 3.0, "perdaTotalValor": 39.0, "vendaValor": 441.48, "pctPerda": 8.8, "resultado": "QUEBRA"}, {"codigo": "134495", "produto": "PIMENTA BIQUINHO 200G BJ", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 2.0, "entradas": 20.0, "vendas": 17.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 1.0, "saldo": 4.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 4.0, "perdaNaoIdentificadaValor": 30.0, "perdaIdentificadaQuant2": 1.0, "perdaIdentificadaValor": 7.5, "perdaTotalQuant": 5.0, "perdaTotalValor": 37.5, "vendaValor": 169.66, "pctPerda": 22.1, "resultado": "QUEBRA"}, {"codigo": "334519", "produto": "RAPADURA H&M C/MAMAO 500G PT", "classe": "RAPADURA CEASA", "estoqueInicial": 11.0, "entradas": 0.0, "vendas": 2.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 9.0, "estoqueFinal": 3.0, "perdaNaoIdentificadaQuant": 6.0, "perdaNaoIdentificadaValor": 37.14, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 6.0, "perdaTotalValor": 37.14, "vendaValor": 15.96, "pctPerda": 232.7, "resultado": "QUEBRA"}, {"codigo": "184410", "produto": "OVOS CAIPIRA MANTIQUEIRA GDE.C/10 BJ", "classe": "OVOS GALINHA VERM", "estoqueInicial": 0.0, "entradas": 72.0, "vendas": 68.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 2.0, "saldo": 2.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 2.0, "perdaNaoIdentificadaValor": 17.5, "perdaIdentificadaQuant2": 2.0, "perdaIdentificadaValor": 17.5, "perdaTotalQuant": 4.0, "perdaTotalValor": 35.0, "vendaValor": 763.69, "pctPerda": 4.6, "resultado": "QUEBRA"}, {"codigo": "344146", "produto": "OVOS VERM.MANTIQUEIRA EXTRA C/10 BJ", "classe": "OVOS", "estoqueInicial": 0.0, "entradas": 48.0, "vendas": 44.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 4.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 4.0, "perdaNaoIdentificadaValor": 28.0, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 4.0, "perdaTotalValor": 28.0, "vendaValor": 386.76, "pctPerda": 7.2, "resultado": "QUEBRA"}, {"codigo": "235900", "produto": "MELANCIA AMARELA KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 3.0, "entradas": 12.0, "vendas": 7.89, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 1.1, "saldo": 6.02, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 6.02, "perdaNaoIdentificadaValor": 22.86, "perdaIdentificadaQuant2": 1.1, "perdaIdentificadaValor": 4.18, "perdaTotalQuant": 7.12, "perdaTotalValor": 27.04, "vendaValor": 47.16, "pctPerda": 57.3, "resultado": "QUEBRA"}, {"codigo": "181310", "produto": "OVOS BCOS.MANTIQUEIRA JUMBO C/10 BJ", "classe": "OVOS GALINHA BCOS", "estoqueInicial": 0.0, "entradas": 120.0, "vendas": 97.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 2.0, "saldo": 21.0, "estoqueFinal": 19.0, "perdaNaoIdentificadaQuant": 2.0, "perdaNaoIdentificadaValor": 13.0, "perdaIdentificadaQuant2": 2.0, "perdaIdentificadaValor": 13.0, "perdaTotalQuant": 4.0, "perdaTotalValor": 26.0, "vendaValor": 871.06, "pctPerda": 3.0, "resultado": "QUEBRA"}, {"codigo": "182166", "produto": "OVOS BCOS.MANTIQUEIRA EXTRA C/20 BJ", "classe": "OVOS GALINHA BCOS", "estoqueInicial": 0.0, "entradas": 144.0, "vendas": 143.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 1.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 1.0, "perdaNaoIdentificadaValor": 11.09, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 1.0, "perdaTotalValor": 11.09, "vendaValor": 1999.14, "pctPerda": 0.6, "resultado": "QUEBRA"}, {"codigo": "6425", "produto": "PEPINO CAIPIRA KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 5.0, "entradas": 0.0, "vendas": 2.39, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 5.3, "saldo": -2.69, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -2.69, "perdaNaoIdentificadaValor": -6.73, "perdaIdentificadaQuant2": 5.3, "perdaIdentificadaValor": 13.25, "perdaTotalQuant": 2.61, "perdaTotalValor": 6.53, "vendaValor": 7.82, "pctPerda": 83.4, "resultado": "QUEBRA"}, {"codigo": "344144", "produto": "OVOS BCOS.MANTIQUEIRA EXTRA C/10 BJ", "classe": "OVOS", "estoqueInicial": 0.0, "entradas": 120.0, "vendas": 114.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 1.0, "quebraIdentificadaQuant": 0.0, "saldo": 5.0, "estoqueFinal": 4.0, "perdaNaoIdentificadaQuant": 1.0, "perdaNaoIdentificadaValor": 6.5, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 1.0, "perdaTotalValor": 6.5, "vendaValor": 1023.72, "pctPerda": 0.6, "resultado": "QUEBRA"}, {"codigo": "6725", "produto": "BERINJELA KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 8.0, "entradas": 60.0, "vendas": 52.68, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 7.45, "saldo": 7.87, "estoqueFinal": 14.0, "perdaNaoIdentificadaQuant": -6.13, "perdaNaoIdentificadaValor": -29.86, "perdaIdentificadaQuant2": 7.45, "perdaIdentificadaValor": 36.3, "perdaTotalQuant": 1.32, "perdaTotalValor": 6.43, "vendaValor": 326.56, "pctPerda": 2.0, "resultado": "QUEBRA"}, {"codigo": "249184", "produto": "RAPADURA H&M C/AMENDOIM MOIDO 500G PT", "classe": "RAPADURA CEASA", "estoqueInicial": 59.0, "entradas": 0.0, "vendas": 24.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 35.0, "estoqueFinal": 34.0, "perdaNaoIdentificadaQuant": 1.0, "perdaNaoIdentificadaValor": 6.19, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": 1.0, "perdaTotalValor": 6.19, "vendaValor": 191.52, "pctPerda": 3.2, "resultado": "QUEBRA"}, {"codigo": "299342", "produto": "TAMARA C/CAROCO 200G BJ", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 71.0, "entradas": 0.0, "vendas": 70.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 1.0, "saldo": 0.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": 0.0, "perdaNaoIdentificadaValor": 0.0, "perdaIdentificadaQuant2": 1.0, "perdaIdentificadaValor": 3.2, "perdaTotalQuant": 1.0, "perdaTotalValor": 3.2, "vendaValor": 303.73, "pctPerda": 1.1, "resultado": "QUEBRA"}, {"codigo": "6785", "produto": "ABOBORA MORANGA JAPONESA KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 275.0, "entradas": 1100.0, "vendas": 1102.41, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 10.06, "saldo": 262.53, "estoqueFinal": 271.0, "perdaNaoIdentificadaQuant": -8.47, "perdaNaoIdentificadaValor": -13.81, "perdaIdentificadaQuant2": 10.06, "perdaIdentificadaValor": 16.4, "perdaTotalQuant": 1.59, "perdaTotalValor": 2.6, "vendaValor": 2188.46, "pctPerda": 0.1, "resultado": "QUEBRA"}, {"codigo": "184290", "produto": "AMENDOIM PEROLA TORRADO C/CASCA 200G PT", "classe": "DIV HORTIGRANJ", "estoqueInicial": 14.0, "entradas": 200.0, "vendas": 139.0, "saidas": 2.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 73.0, "estoqueFinal": 75.0, "perdaNaoIdentificadaQuant": -2.0, "perdaNaoIdentificadaValor": -5.67, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -2.0, "perdaTotalValor": -5.67, "vendaValor": 577.22, "pctPerda": -1.0, "resultado": "SOBRA"}, {"codigo": "499", "produto": "PEPINO JAPONES 500G BJ", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 2.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": -2.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -2.0, "perdaNaoIdentificadaValor": -10.0, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -2.0, "perdaTotalValor": -10.0, "vendaValor": 14.96, "pctPerda": -66.8, "resultado": "SOBRA"}, {"codigo": "196", "produto": "MANDIOCA KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 0.0, "entradas": 30.0, "vendas": 33.18, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 27.45, "saldo": -30.63, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -30.63, "perdaNaoIdentificadaValor": -110.25, "perdaIdentificadaQuant2": 27.45, "perdaIdentificadaValor": 98.82, "perdaTotalQuant": -3.18, "perdaTotalValor": -11.43, "vendaValor": 148.45, "pctPerda": -7.7, "resultado": "SOBRA"}, {"codigo": "103880", "produto": "MELAO REY KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 1.47, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": -1.47, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -1.47, "perdaNaoIdentificadaValor": -11.76, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -1.47, "perdaTotalValor": -11.76, "vendaValor": 19.08, "pctPerda": -61.6, "resultado": "SOBRA"}, {"codigo": "6814", "produto": "BANANA DA TERRA KG", "classe": "BANANA", "estoqueInicial": 0.0, "entradas": 15.0, "vendas": 16.96, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.85, "saldo": -2.81, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -2.81, "perdaNaoIdentificadaValor": -20.7, "perdaIdentificadaQuant2": 0.85, "perdaIdentificadaValor": 6.26, "perdaTotalQuant": -1.96, "perdaTotalValor": -14.44, "vendaValor": 169.26, "pctPerda": -8.5, "resultado": "SOBRA"}, {"codigo": "334529", "produto": "RAPADURA H&M C/COCO 500G PT", "classe": "RAPADURA CEASA", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 3.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": -3.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -3.0, "perdaNaoIdentificadaValor": -19.26, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -3.0, "perdaTotalValor": -19.26, "vendaValor": 23.94, "pctPerda": -80.5, "resultado": "SOBRA"}, {"codigo": "115", "produto": "GENGIBRE KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 42.0, "entradas": 72.0, "vendas": 43.05, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.15, "saldo": 70.8, "estoqueFinal": 73.0, "perdaNaoIdentificadaQuant": -2.2, "perdaNaoIdentificadaValor": -22.0, "perdaIdentificadaQuant2": 0.15, "perdaIdentificadaValor": 1.5, "perdaTotalQuant": -2.05, "perdaTotalValor": -20.5, "vendaValor": 625.17, "pctPerda": -3.3, "resultado": "SOBRA"}, {"codigo": "6726", "produto": "BETERRABA KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 97.0, "entradas": 760.0, "vendas": 797.62, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 15.02, "saldo": 44.37, "estoqueFinal": 71.0, "perdaNaoIdentificadaQuant": -26.64, "perdaNaoIdentificadaValor": -70.6, "perdaIdentificadaQuant2": 15.02, "perdaIdentificadaValor": 39.81, "perdaTotalQuant": -11.62, "perdaTotalValor": -30.79, "vendaValor": 2829.58, "pctPerda": -1.1, "resultado": "SOBRA"}, {"codigo": "1376", "produto": "MELAO ESPANHOL KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 4.37, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": -4.37, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -4.37, "perdaNaoIdentificadaValor": -32.0, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -4.37, "perdaTotalValor": -32.0, "vendaValor": 47.93, "pctPerda": -66.8, "resultado": "SOBRA"}, {"codigo": "88986", "produto": "ABOBORA MORANGA VERM.KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 46.6, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": -46.6, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -46.6, "perdaNaoIdentificadaValor": -40.29, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -46.6, "perdaTotalValor": -40.29, "vendaValor": 63.74, "pctPerda": -63.2, "resultado": "SOBRA"}, {"codigo": "525", "produto": "PESSEGO IMPORTADO KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 0.0, "entradas": 54.0, "vendas": 51.26, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 1.9, "saldo": 0.84, "estoqueFinal": 5.0, "perdaNaoIdentificadaQuant": -4.16, "perdaNaoIdentificadaValor": -77.56, "perdaIdentificadaQuant2": 1.9, "perdaIdentificadaValor": 35.42, "perdaTotalQuant": -2.26, "perdaTotalValor": -42.13, "vendaValor": 1462.95, "pctPerda": -2.9, "resultado": "SOBRA"}, {"codigo": "6743", "produto": "CEBOLA ROXA KG", "classe": "CEBOLA", "estoqueInicial": 90.0, "entradas": 360.0, "vendas": 392.57, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 4.33, "saldo": 53.1, "estoqueFinal": 66.0, "perdaNaoIdentificadaQuant": -12.9, "perdaNaoIdentificadaValor": -70.95, "perdaIdentificadaQuant2": 4.33, "perdaIdentificadaValor": 23.82, "perdaTotalQuant": -8.57, "perdaTotalValor": -47.13, "vendaValor": 3132.66, "pctPerda": -1.5, "resultado": "SOBRA"}, {"codigo": "148334", "produto": "UVA VITORIA 500G BJ", "classe": "UVA", "estoqueInicial": 103.0, "entradas": 1550.0, "vendas": 1626.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 3.0, "saldo": 24.0, "estoqueFinal": 42.0, "perdaNaoIdentificadaQuant": -18.0, "perdaNaoIdentificadaValor": -76.86, "perdaIdentificadaQuant2": 3.0, "perdaIdentificadaValor": 12.81, "perdaTotalQuant": -15.0, "perdaTotalValor": -64.05, "vendaValor": 8709.48, "pctPerda": -0.7, "resultado": "SOBRA"}, {"codigo": "89750", "produto": "LIMAO SICILIANO KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 16.0, "entradas": 0.0, "vendas": 20.18, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 4.0, "saldo": -8.18, "estoqueFinal": 4.0, "perdaNaoIdentificadaQuant": -12.18, "perdaNaoIdentificadaValor": -121.75, "perdaIdentificadaQuant2": 4.0, "perdaIdentificadaValor": 40.0, "perdaTotalQuant": -8.18, "perdaTotalValor": -81.75, "vendaValor": 302.24, "pctPerda": -27.0, "resultado": "SOBRA"}, {"codigo": "11517", "produto": "BUCHA VEGETAL DO CARMO C/3 PT", "classe": "DIV HORTIGRANJ", "estoqueInicial": 0.0, "entradas": 20.0, "vendas": 7.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 13.0, "estoqueFinal": 20.0, "perdaNaoIdentificadaQuant": -7.0, "perdaNaoIdentificadaValor": -84.0, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -7.0, "perdaTotalValor": -84.0, "vendaValor": 118.86, "pctPerda": -70.7, "resultado": "SOBRA"}, {"codigo": "181230", "produto": "MELANCIA PINGO DOCE KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 36.0, "entradas": 332.0, "vendas": 366.28, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 4.5, "saldo": -2.78, "estoqueFinal": 23.0, "perdaNaoIdentificadaQuant": -25.78, "perdaNaoIdentificadaValor": -112.67, "perdaIdentificadaQuant2": 4.5, "perdaIdentificadaValor": 19.66, "perdaTotalQuant": -21.28, "perdaTotalValor": -93.01, "vendaValor": 2420.51, "pctPerda": -3.8, "resultado": "SOBRA"}, {"codigo": "80909", "produto": "MELANCIA BABY KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 3.0, "entradas": 0.0, "vendas": 17.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 2.25, "saldo": -16.25, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -16.25, "perdaNaoIdentificadaValor": -121.85, "perdaIdentificadaQuant2": 2.25, "perdaIdentificadaValor": 16.88, "perdaTotalQuant": -14.0, "perdaTotalValor": -104.97, "vendaValor": 186.62, "pctPerda": -56.2, "resultado": "SOBRA"}, {"codigo": "334516", "produto": "RAPADURA H&M PURA 500G PT", "classe": "RAPADURA CEASA", "estoqueInicial": 6.0, "entradas": 0.0, "vendas": 6.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": 0.0, "estoqueFinal": 26.0, "perdaNaoIdentificadaQuant": -26.0, "perdaNaoIdentificadaValor": -146.38, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -26.0, "perdaTotalValor": -146.38, "vendaValor": 47.88, "pctPerda": -305.7, "resultado": "SOBRA"}, {"codigo": "1804", "produto": "PERA PORTUGUESA KG", "classe": "PERA", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 10.53, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": -10.53, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -10.53, "perdaNaoIdentificadaValor": -147.42, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -10.53, "perdaTotalValor": -147.42, "vendaValor": 228.43, "pctPerda": -64.5, "resultado": "SOBRA"}, {"codigo": "6721", "produto": "BANANA PRATA KG", "classe": "BANANA", "estoqueInicial": 101.0, "entradas": 1740.0, "vendas": 1859.01, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 65.68, "saldo": -83.69, "estoqueFinal": 15.0, "perdaNaoIdentificadaQuant": -98.69, "perdaNaoIdentificadaValor": -444.77, "perdaIdentificadaQuant2": 65.68, "perdaIdentificadaValor": 296.0, "perdaTotalQuant": -33.01, "perdaTotalValor": -148.77, "vendaValor": 11732.46, "pctPerda": -1.3, "resultado": "SOBRA"}, {"codigo": "127", "produto": "KIWI IMPORTADO KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 3.0, "entradas": 50.0, "vendas": 51.63, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.55, "saldo": 0.83, "estoqueFinal": 10.0, "perdaNaoIdentificadaQuant": -9.18, "perdaNaoIdentificadaValor": -178.29, "perdaIdentificadaQuant2": 0.55, "perdaIdentificadaValor": 10.69, "perdaTotalQuant": -8.63, "perdaTotalValor": -167.61, "vendaValor": 1496.05, "pctPerda": -11.2, "resultado": "SOBRA"}, {"codigo": "876", "produto": "MANGA PALMER KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 68.0, "entradas": 500.0, "vendas": 570.94, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 11.35, "saldo": -14.28, "estoqueFinal": 36.0, "perdaNaoIdentificadaQuant": -50.28, "perdaNaoIdentificadaValor": -226.28, "perdaIdentificadaQuant2": 11.35, "perdaIdentificadaValor": 51.08, "perdaTotalQuant": -38.93, "perdaTotalValor": -175.21, "vendaValor": 3414.11, "pctPerda": -5.1, "resultado": "SOBRA"}, {"codigo": "6782", "produto": "ABOBORA MENINA KG", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 40.34, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": -40.34, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -40.34, "perdaNaoIdentificadaValor": -179.09, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -40.34, "perdaTotalValor": -179.09, "vendaValor": 241.22, "pctPerda": -74.2, "resultado": "SOBRA"}, {"codigo": "202", "produto": "MELAO AMARELO KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 42.0, "entradas": 408.0, "vendas": 469.14, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 4.95, "saldo": -24.09, "estoqueFinal": 29.0, "perdaNaoIdentificadaQuant": -53.09, "perdaNaoIdentificadaValor": -211.71, "perdaIdentificadaQuant2": 4.95, "perdaIdentificadaValor": 19.74, "perdaTotalQuant": -48.14, "perdaTotalValor": -191.97, "vendaValor": 2563.88, "pctPerda": -7.5, "resultado": "SOBRA"}, {"codigo": "327100", "produto": "DOCE MAMAO/RAPADURA SAO DIMAS 400G PT", "classe": "DIV HORTIGRANJ", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 13.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": -13.0, "estoqueFinal": 17.0, "perdaNaoIdentificadaQuant": -30.0, "perdaNaoIdentificadaValor": -195.0, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -30.0, "perdaTotalValor": -195.0, "vendaValor": 103.87, "pctPerda": -187.7, "resultado": "SOBRA"}, {"codigo": "59536", "produto": "LARANJA BAHIA IMPORTADA KG", "classe": "LARANJA", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 63.07, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": -63.07, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -63.07, "perdaNaoIdentificadaValor": -223.21, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -63.07, "perdaTotalValor": -223.21, "vendaValor": 340.44, "pctPerda": -65.6, "resultado": "SOBRA"}, {"codigo": "139", "produto": "LIMAO KG", "classe": "FRUTAS FRESCAS DIV", "estoqueInicial": 167.0, "entradas": 1180.0, "vendas": 1051.92, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 23.05, "saldo": 272.03, "estoqueFinal": 339.0, "perdaNaoIdentificadaQuant": -66.97, "perdaNaoIdentificadaValor": -370.42, "perdaIdentificadaQuant2": 23.05, "perdaIdentificadaValor": 127.49, "perdaTotalQuant": -43.92, "perdaTotalValor": -242.93, "vendaValor": 8929.96, "pctPerda": -2.7, "resultado": "SOBRA"}, {"codigo": "190", "produto": "MACA NACIONAL FUJI KG", "classe": "MACA", "estoqueInicial": 176.0, "entradas": 1512.0, "vendas": 1669.19, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 101.15, "saldo": -82.34, "estoqueFinal": 80.0, "perdaNaoIdentificadaQuant": -162.34, "perdaNaoIdentificadaValor": -767.51, "perdaIdentificadaQuant2": 101.15, "perdaIdentificadaValor": 478.22, "perdaTotalQuant": -61.19, "perdaTotalValor": -289.29, "vendaValor": 10775.75, "pctPerda": -2.7, "resultado": "SOBRA"}, {"codigo": "138", "produto": "LARANJA SERRA D'AGUA KG", "classe": "LARANJA", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 91.62, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": -91.62, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -91.62, "perdaNaoIdentificadaValor": -480.09, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -91.62, "perdaTotalValor": -480.09, "vendaValor": 547.87, "pctPerda": -87.6, "resultado": "SOBRA"}, {"codigo": "17328", "produto": "MANDIOCA EMBALADA 1KG PT", "classe": "TUBERC/LEGUMES DIV", "estoqueInicial": 0.0, "entradas": 0.0, "vendas": 149.0, "saidas": 0.0, "consumoInterno": 0.0, "consumoProducao": 0.0, "quebraIdentificadaQuant": 0.0, "saldo": -149.0, "estoqueFinal": 0.0, "perdaNaoIdentificadaQuant": -149.0, "perdaNaoIdentificadaValor": -1241.17, "perdaIdentificadaQuant2": 0.0, "perdaIdentificadaValor": 0.0, "perdaTotalQuant": -149.0, "perdaTotalValor": -1241.17, "vendaValor": 1535.02, "pctPerda": -80.9, "resultado": "SOBRA"}]};

function fmtMoeda(v) {
  const neg = v < 0;
  const s = 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return neg ? '-' + s : s;
}
function fmtNum(v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'; }
function fmtData(iso) { const [a,m,d] = iso.split('-'); return d + '/' + m + '/' + a; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

document.getElementById('periodo-texto').textContent =
  fmtData(DADOS.meta.periodoInicio) + ' a ' + fmtData(DADOS.meta.periodoFim);

// ---------------- KPIs ----------------
function renderKpis() {
  const t = DADOS.totais;
  const ind = {};
  DADOS.indicadores.forEach((i) => ind[i.nome] = i);

  function deltaPill(nome, valor) {
    const meta = ind[nome].meta;
    const acimaEhRuim = true; // perda: acima da meta é ruim
    const ruim = valor > meta;
    const diffPP = (valor - meta).toFixed(1).replace('.', ',');
    return '<span class="pill-delta ' + (ruim ? 'ruim' : 'bom') + '">' +
      (valor >= meta ? '+' : '') + diffPP + ' p.p. vs meta</span>';
  }

  const cards = [
    {
      rotulo: 'Perda total',
      valor: fmtMoeda(t.perdaTotalValor),
      linha: fmtPct(t.pctPerda) + ' da venda ' + deltaPill('Perda Total', t.pctPerda),
    },
    {
      rotulo: 'Perda identificada (quebra)',
      valor: fmtMoeda(t.perdaIdentificadaValor),
      linha: fmtPct(ind['Perda Identificada'].realizado) + ' da venda ' + deltaPill('Perda Identificada', ind['Perda Identificada'].realizado),
    },
    {
      rotulo: 'Perda não identificada',
      valor: fmtMoeda(t.perdaNaoIdentificadaValor),
      linha: fmtPct(ind['Perda Não Identificada'].realizado) + ' da venda ' + deltaPill('Perda Não Identificada', ind['Perda Não Identificada'].realizado),
    },
    {
      rotulo: 'Venda do período',
      valor: fmtMoeda(t.vendaValor),
      linha: DADOS.produtos.length + ' produtos com divergência',
    },
  ];

  document.getElementById('kpis').innerHTML = cards.map((c) =>
    '<div class="kpi"><div class="rotulo">' + c.rotulo + '</div><div class="valor">' + c.valor + '</div>' +
    '<div class="meta-linha">' + c.linha + '</div></div>'
  ).join('');
}
renderKpis();

// ---------------- Alertas (plano de ação) ----------------
function renderAlertas() {
  const produtos = DADOS.produtos;
  const indAlerta = {};
  DADOS.indicadores.forEach((i) => indAlerta[i.nome] = i);
  const naoIdPositivos = produtos.filter((p) => p.perdaNaoIdentificadaValor > 0)
    .sort((a, b) => b.perdaNaoIdentificadaValor - a.perdaNaoIdentificadaValor);
  const totalNaoId = naoIdPositivos.reduce((s, p) => s + p.perdaNaoIdentificadaValor, 0);
  const top10NaoId = naoIdPositivos.slice(0, 10);
  const pctTop10 = totalNaoId > 0 ? (100 * top10NaoId.reduce((s, p) => s + p.perdaNaoIdentificadaValor, 0) / totalNaoId) : 0;

  const sobras = produtos.filter((p) => p.resultado === 'SOBRA').sort((a, b) => a.perdaTotalValor - b.perdaTotalValor);
  const totalSobra = sobras.reduce((s, p) => s + p.perdaTotalValor, 0);

  const piorNaoId = naoIdPositivos[0];

  const alertas = [
    {
      sev: 'critico',
      titulo: 'Perda não identificada acima da meta',
      texto: 'A perda não identificada ficou em <b>' + fmtPct(indAlerta['Perda Não Identificada'].realizado) + '</b> da venda, contra uma meta de <b>' + fmtPct(indAlerta['Perda Não Identificada'].meta) + '</b> — ' +
        fmtMoeda(totalNaoId) + ' em produtos que sumiram do estoque sem nenhuma quebra registrada. ' +
        '<b>' + top10NaoId.length + ' produtos</b> concentram ' + pctTop10.toFixed(0) + '% desse valor — comece a investigação por eles: ' +
        top10NaoId.slice(0, 5).map((p) => esc(p.produto)).join(', ') + '.',
    },
    {
      sev: 'critico',
      titulo: 'Maior caso: ' + esc(piorNaoId.produto),
      texto: piorNaoId.produto + ' teve ' + fmtMoeda(piorNaoId.perdaNaoIdentificadaValor) + ' de perda <b>100% não identificada</b> — ' +
        'nenhuma quebra foi lançada no sistema pra esse item, mas a contagem física mostra a falta. Confirmar se o descarte está sendo registrado ou se é erro de contagem.',
    },
    {
      sev: 'atencao',
      titulo: 'Possível troca de código: produtos "Mandioca Embalada"',
      texto: 'Um código de mandioca embalada aparece com <b>R$ 1.807,61</b> de perda (quase toda não identificada), enquanto outro código muito parecido ("Mandioca Embalada 1kg PT") aparece com <b>-R$ 1.241,17</b> de sobra. ' +
        'Esse padrão — perda grande num código e sobra grande num código parecido — é típico de leitura do código errado no caixa ou na etiqueta. Vale conferir se são o mesmo produto físico sendo lançado em dois cadastros diferentes.',
    },
    {
      sev: 'atencao',
      titulo: sobras.length + ' produtos com sobra (estoque físico maior que o esperado)',
      texto: 'Sobra soma ' + fmtMoeda(Math.abs(totalSobra)) + ' — também é sinal de erro operacional (contagem, entrada não lançada ou troca de código), não só perda merece atenção. ' +
        'Maiores sobras: ' + sobras.slice(0, 4).map((p) => esc(p.produto) + ' (' + fmtMoeda(p.perdaTotalValor) + ')').join(', ') + '.',
    },
    {
      sev: 'info',
      titulo: 'Frutas frescas e tubérculos/legumes concentram os problemas',
      texto: 'Essas duas categorias somam <b>54 dos 104</b> produtos com divergência e cerca de <b>39%</b> da perda total em valor — reforçar o manuseio e o registro de quebra nessas duas frentes tende a trazer o maior retorno.',
    },
    {
      sev: 'info',
      titulo: 'Itens de baixo giro com % de perda extremo',
      texto: 'Produtos como Rapadura H&amp;M, Milho Sweet Trebeschi e Pepino Japonês perderam mais do que venderam no período (% de perda acima de 100%) — normalmente é sinal de item parado no mix, não de um problema de processo. Vale avaliar se compensa manter esses itens ativos.',
    },
  ];

  document.getElementById('alertas').innerHTML = alertas.map((a) =>
    '<div class="alerta"><div class="sev ' + a.sev + '">' + (a.sev === 'critico' ? '!' : a.sev === 'atencao' ? '△' : 'i') + '</div>' +
    '<div class="corpo"><div class="titulo-alerta">' + a.titulo + '</div><div class="texto-alerta">' + a.texto + '</div></div></div>'
  ).join('');
}
renderAlertas();

// ---------------- Gráfico: top 10 produtos (barra empilhada) ----------------
function renderChartTop10() {
  const top = DADOS.produtos
    .filter((p) => p.resultado === 'QUEBRA')
    .sort((a, b) => b.perdaTotalValor - a.perdaTotalValor)
    .slice(0, 10);
  const max = Math.max(...top.map((p) => p.perdaTotalValor));

  const html = top.map((p) => {
    const idPct = 100 * Math.max(p.perdaIdentificadaValor, 0) / max;
    const naoIdPct = 100 * Math.max(p.perdaNaoIdentificadaValor, 0) / max;
    return '<div class="barra-linha">' +
      '<div class="nome-produto" title="' + esc(p.produto) + '">' + esc(p.produto) + '</div>' +
      '<div class="trilha"><div class="seg" style="width:' + idPct + '%;background:var(--navy-700);"></div>' +
      '<div class="seg" style="width:' + naoIdPct + '%;background:var(--red);"></div></div>' +
      '<div class="valor-barra">' + fmtMoeda(p.perdaTotalValor) + '</div>' +
      '</div>';
  }).join('');
  document.getElementById('chart-top10').innerHTML = html;
}
renderChartTop10();

// ---------------- Gráfico: perda por classe ----------------
function renderChartClasse() {
  const porClasse = {};
  DADOS.produtos.forEach((p) => {
    const k = p.classe || '(sem categoria)';
    porClasse[k] = (porClasse[k] || 0) + p.perdaTotalValor;
  });
  const linhas = Object.entries(porClasse).sort((a, b) => b[1] - a[1]);
  const top = linhas.slice(0, 8);
  const outros = linhas.slice(8).reduce((s, l) => s + l[1], 0);
  if (linhas.length > 8) top.push(['Outras categorias', outros]);

  const cores = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--navy-900)', 'var(--text-muted)', 'var(--cat-more)'];
  const max = Math.max(...top.map((l) => Math.abs(l[1])));

  const html = top.map((l, i) => {
    const pct = 100 * Math.abs(l[1]) / max;
    return '<div class="barra-linha">' +
      '<div class="nome-produto" title="' + esc(l[0]) + '">' + esc(l[0]) + '</div>' +
      '<div class="trilha"><div class="seg" style="width:' + pct + '%;background:' + cores[i % cores.length] + ';"></div></div>' +
      '<div class="valor-barra">' + fmtMoeda(l[1]) + '</div>' +
      '</div>';
  }).join('');
  document.getElementById('chart-classe').innerHTML = html;
}
renderChartClasse();

// ---------------- Tabela + filtros ----------------
let ordenacao = { campo: 'perdaTotalValor', dir: -1 };
let filtroClasse = '';
let filtroResultado = 'todos';
let busca = '';
let somentePrioridade = false;

function ehPrioridade(p) {
  return p.perdaNaoIdentificadaValor > p.perdaIdentificadaValor && p.perdaNaoIdentificadaValor > 0;
}

function popularFiltroClasse() {
  const classes = Array.from(new Set(DADOS.produtos.map((p) => p.classe).filter(Boolean))).sort();
  const sel = document.getElementById('f-classe');
  sel.innerHTML = '<option value="">Todas as categorias</option>' +
    classes.map((c) => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');
}
popularFiltroClasse();

function linhasFiltradas() {
  let linhas = DADOS.produtos.slice();
  if (filtroClasse) linhas = linhas.filter((p) => p.classe === filtroClasse);
  if (filtroResultado !== 'todos') linhas = linhas.filter((p) => p.resultado === filtroResultado);
  if (somentePrioridade) linhas = linhas.filter(ehPrioridade);
  if (busca.trim()) {
    const termo = busca.trim().toLowerCase();
    linhas = linhas.filter((p) => p.produto.toLowerCase().includes(termo) || p.codigo.includes(termo));
  }
  linhas.sort((a, b) => {
    const va = a[ordenacao.campo], vb = b[ordenacao.campo];
    if (typeof va === 'string') return ordenacao.dir * va.localeCompare(vb);
    return ordenacao.dir * (va - vb);
  });
  return linhas;
}

function badgeSituacao(p) {
  if (ehPrioridade(p)) return '<span class="badge investigar">Investigar</span>';
  if (p.resultado === 'SOBRA') return '<span class="badge sobra">Sobra</span>';
  return '<span class="badge quebra">Quebra</span>';
}

function renderTabela() {
  const linhas = linhasFiltradas();
  document.getElementById('contagem-resultado').textContent = linhas.length + ' de ' + DADOS.produtos.length + ' produtos';

  if (linhas.length === 0) {
    document.getElementById('corpo-tabela').innerHTML = '<tr><td colspan="8"><div class="vazio-tabela">Nenhum produto encontrado com esses filtros.</div></td></tr>';
    return;
  }

  document.getElementById('corpo-tabela').innerHTML = linhas.map((p) => {
    return '<tr>' +
      '<td><div class="nome-prod">' + esc(p.produto) + '</div><div class="cod-prod">Cód. ' + esc(p.codigo) + '</div></td>' +
      '<td class="classe-tag">' + esc(p.classe || '—') + '</td>' +
      '<td class="num">' + fmtNum(p.estoqueFinal ?? 0) + '</td>' +
      '<td class="num">' + fmtMoeda(p.perdaIdentificadaValor) + '</td>' +
      '<td class="num">' + fmtMoeda(p.perdaNaoIdentificadaValor) + '</td>' +
      '<td class="num">' + fmtMoeda(p.perdaTotalValor) + '</td>' +
      '<td class="num' + (p.pctPerda < 0 ? ' valor-neg' : '') + '">' + fmtPct(p.pctPerda) + '</td>' +
      '<td>' + badgeSituacao(p) + '</td>' +
      '</tr>';
  }).join('');
}
renderTabela();

document.getElementById('f-classe').addEventListener('change', (e) => { filtroClasse = e.target.value; renderTabela(); });
document.getElementById('f-resultado').addEventListener('change', (e) => { filtroResultado = e.target.value; renderTabela(); });
document.getElementById('f-prioridade').addEventListener('change', (e) => { somentePrioridade = e.target.checked; renderTabela(); });
document.getElementById('f-busca').addEventListener('input', (e) => { busca = e.target.value; renderTabela(); });

document.querySelectorAll('thead th[data-campo]').forEach((th) => {
  th.addEventListener('click', () => {
    const campo = th.getAttribute('data-campo');
    if (ordenacao.campo === campo) ordenacao.dir *= -1;
    else ordenacao = { campo, dir: campo === 'produto' || campo === 'classe' || campo === 'resultado' ? 1 : -1 };
    document.querySelectorAll('thead th .seta').forEach((s) => s.textContent = '');
    th.querySelector('.seta').textContent = ordenacao.dir === 1 ? '▲' : '▼';
    renderTabela();
  });
});
</script>
</body>
</html>
`;
