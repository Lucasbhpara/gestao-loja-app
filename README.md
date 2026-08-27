# ULVA — Gestão de Loja (v1)

O app se chama **ULVA** (do nórdico antigo *Úlfa*, a versão feminina de "lobo" —
veja a aba "Sobre" dentro do app pro significado completo). O nome que aparece
embaixo do ícone no celular já foi trocado; o resto do projeto (pastas, nomes
de arquivo) continua "gestao-loja-app" por baixo dos panos, sem afetar nada
que você vê.

Este é o começo real do app: login funcional com os 15 colaboradores, troca de
senha obrigatória no primeiro acesso, recuperação de senha, e a Home dividida
por perfil (Colaborador x Administrador). Por padrão os dados ficam guardados
no próprio celular (não precisa de internet pra funcionar) — mas o app já sabe
usar o Supabase (banco de dados na nuvem) assim que ele for configurado, veja
"Conectar o Supabase" abaixo.

## Conectar o Supabase (compartilhar dados entre celulares)

Sem isso, cada celular guarda os colaboradores separadamente. Com isso
configurado, todos os celulares (e o portal web) passam a ler e escrever no
mesmo banco de dados, em tempo real.

1. Crie uma conta e um projeto em **supabase.com** (é grátis).
2. No SQL Editor do projeto, cole e rode o conteúdo de `supabase/schema.sql`
   (cria a tabela `colaboradores` já com os 15 colaboradores atuais),
   depois `supabase/schema_tarefas.sql` (tabela de Tarefas/Prioridades),
   `supabase/schema_perdas.sql` (tabela de Perdas & Quebras),
   `supabase/schema_validade.sql` (tabelas de Controle de Validade),
   `supabase/schema_notificacoes.sql` (notificação de vencimento),
   `supabase/schema_inventario.sql` (Contagem de Inventário),
   `supabase/schema_avisos.sql` (Mural de Avisos),
   `supabase/schema_avisos_fotos.sql` (fotos no Mural + visibilidade de quem
   visualizou), `supabase/schema_avisos_notificacoes.sql` (notificação no
   celular quando alguém publica um aviso novo), `supabase/schema_ocorrencias.sql`
   (aba Ocorrências), `supabase/schema_conferencias.sql` (aba Conferência do
   FLV) e `supabase/schema_pedidos.sql` (aba Pedidos do FLV) — um de cada
   vez, cada um com seu próprio "Run". Depois de rodar `schema_inventario.sql`,
   rode também `supabase/inventario_itens_import.sql` (uma vez só) pra
   carregar o catálogo de itens de FLV, Açougue, Padaria e Uso e Consumo.
   Depois disso, sempre que você mandar um novo relatório de perdas em PDF,
   você recebe um script de importação pronto (veja "Perdas & Quebras" mais
   abaixo) pra colar e rodar do mesmo jeito. O mesmo vale pra planilha de
   produtos do FLV pra aba Pedidos: assim que você mandar, eu devolvo o
   script de importação pra `pedidos_produtos`.
3. Em "Project Settings → API", copie o **Project URL** e a chave
   **anon public**.
4. Cole os dois valores em `src/config/supabaseConfig.ts`
   (`SUPABASE_URL` e `SUPABASE_ANON_KEY`).
5. Rode `npm install` de novo (pra baixar o `@supabase/supabase-js`) e gere
   um novo build.

A partir daí, a Home do Administrador mostra um selo "☁ Dados na nuvem"
confirmando que a conexão está ativa. Sem essas chaves preenchidas, o app
continua funcionando normalmente do jeito local de antes.

## Como testar HOJE, sem instalar nada no computador (mais rápido)

1. Acesse **https://snack.expo.dev** no navegador.
2. Clique em criar um novo Snack em branco.
3. Recrie a mesma estrutura de pastas deste projeto (App.tsx na raiz, e uma
   pasta `src` com `context`, `data`, `screens`, `theme` dentro) e cole o
   conteúdo de cada arquivo.
4. Baixe o app grátis **Expo Go** no seu Android (Play Store).
5. No Snack, escolha "Meu dispositivo" e escaneie o QR code com o Expo Go.
6. O app abre na hora no seu celular.

## Como gerar o APK de verdade, no seu computador

Pré-requisito: ter o [Node.js](https://nodejs.org) instalado (baixe a versão
"LTS" e instale, é só clicar em avançar).

1. Copie a pasta `gestao-loja-app` inteira para o seu computador.
2. Abra o "Prompt de Comando" (ou PowerShell) dentro dessa pasta.
3. Rode, um de cada vez:
   ```
   npm install
   npx expo install expo-camera expo-notifications expo-device expo-constants expo-file-system expo-sharing expo-image-picker @react-native-community/datetimepicker
   npx eas login
   ```
   (a segunda linha garante que os pacotes da câmera — tela de Validade — e
   de notificação — aviso de vencimento — ficam na versão certa pra esse
   projeto; a terceira vai pedir pra criar uma conta gratuita na Expo, é
   rápido)
4. Depois rode:
   ```
   npx eas build --platform android --profile preview
   ```
5. Aguarde a mensagem "Build finished" — ela vai te dar um link. Abra esse
   link no navegador do celular e baixe o `.apk` direto.

Isso é tudo — nenhum desses comandos exige conhecimento de programação, é
só copiar e colar cada linha e apertar Enter.

## O que já funciona

- Login com nome + matrícula (senha provisória).
- Tela obrigatória de criar senha própria no primeiro acesso.
- Tela de "Esqueci minha senha".
- Home do Colaborador (saudação, frase do dia, acesso rápido).
- Home do Administrador (lista de todos os setores e equipe).
- Tarefas/Prioridades: administrador cria e atribui por setor (ou pra todos),
  colaborador vê as do seu setor e marca como concluída.
- Perdas & Quebras: não é mais registro manual. Você manda o PDF do
  relatório de perdas no chat, ele processa e devolve um script SQL pronto
  pra colar no SQL Editor (rodar `supabase/schema_perdas.sql` uma vez
  antes, pra criar/atualizar a tabela). Depois de rodar o script, os
  produtos aparecem automaticamente em "Perdas do Setor" (colaborador,
  filtrado pelo setor dele, com % de perda) e em "Perdas geral"
  (administrador, com filtro por setor). Não precisa gerar um APK novo pra
  ver os dados atualizados — é só dado novo no banco.
- Controle de Validade: toque no botão "+" pra escanear o código de barras
  do produto com a câmera do celular. Se o código estiver na base
  (`produtos_catalogo` — veja abaixo), o nome já vem preenchido sozinho;
  senão, é só digitar na mão. Depois é só informar a data de validade. A
  lista mostra quantos dias faltam pra cada produto vencer (colorido:
  verde/laranja/vermelho), sempre com o mais próximo do vencimento primeiro.
  Só administrador e a colaboradora da função "A.P.P" conseguem remover um
  produto da lista; os demais colaboradores só veem os do próprio setor.
  Notificação automática: quando falta 3 dias (ou menos) pro vencimento, o
  celular de quem é do setor daquele produto (mais administradores e a
  função A.P.P) recebe um aviso push, mesmo com o app fechado. Isso roda
  sozinho, todo dia, direto no banco de dados — não depende de ninguém
  abrir o app (precisa rodar `supabase/schema_notificacoes.sql` uma vez, e
  cada colaborador precisa aceitar a permissão de notificação quando o app
  pedir, geralmente no primeiro login depois do próximo build).
- Inventário (só administrador por enquanto): a pessoa que vai contar digita
  o nome, escolhe qual inventário vai contar (FLV, Açougue, Padaria ou Uso
  e Consumo) e conta separando "Área de venda" de "Depósito" — buscando por
  código ou nome, ou escaneando o código de barras. Contar o mesmo item de
  novo na mesma área soma na quantidade já lançada, não sobrescreve. Se o
  produto não estiver no catálogo, dá pra cadastrar ali mesmo, na hora. Um
  botão "Comparar contagens" mostra lado a lado o que cada pessoa contou
  (útil pra dupla contagem, destaca divergência), e "Enviar contagem" gera
  uma planilha Excel (Código, Descrição, Depósito, Área de Venda, Total,
  Unidade) e abre a tela de compartilhar do celular (WhatsApp, e-mail,
  Drive…).
- Mural de Avisos: administrador, o setor CPD e a função "A.P.P" podem
  publicar um aviso (título, mensagem, foto opcional — tirada na hora ou
  escolhida da galeria — e a opção de marcar como "Urgente", que aparece
  destacado em vermelho), escolhendo se é pra todo mundo ou só pra um
  setor específico. Colaborador vê os avisos gerais e os do próprio setor,
  mais recente primeiro. O app registra sozinho quem abriu cada aviso, e
  só o administrador vê essa lista de "quem visualizou" (o colaborador não
  precisa fazer nada, é só entrar no Mural). Remover um aviso continua
  sendo só do administrador. Assim que alguém publica um aviso, todo mundo
  que pode ver aquele aviso recebe uma notificação no celular na hora,
  mesmo com o app fechado (um urgente aparece com "⚠ Aviso urgente" na
  notificação); quem publicou não recebe notificação do próprio aviso.
  Precisa rodar `supabase/schema_avisos_notificacoes.sql` uma vez, e cada
  colaborador precisa ter aceitado a permissão de notificação (a mesma
  usada pelo Controle de Validade).
- Ícone do app: agora é o lobo, em vez do ícone padrão do Android.
- Rodapé "Criado por Lucas Alberto" aparece bem discreto embaixo de toda
  tela do app.
- Aba "Sobre": explica pra quem é o app e por que ele foi criado — acessível
  pelo quadro "Ações rápidas", tanto na Home do Administrador quanto na do
  Colaborador.
- Home do Administrador: no lugar da lista completa de "Setores da
  unidade" (que ficou grande demais), agora mostra um resumo dos 5
  produtos mais perto de vencer, com um link "Ver todos" que leva pra tela
  de Validade completa.
- Controle de Validade: ao cadastrar a data manualmente, agora abre um
  calendário (em vez de digitar a data na mão), e ela sempre aparece no
  formato dia/mês/ano. Quando o produto já está cadastrado no catálogo
  (veio preenchido sozinho ao escanear), aparece um botão "✎ Editar
  produto" — usando ele, o nome/unidade que você corrigir passam a valer
  pra sempre nesse código de barras, não só pra esse lançamento.
- "Falar com a IA" (visível só no seu login): uma aba particular pra tirar
  dúvidas sobre o projeto direto pelo celular, usando a Claude API da
  Anthropic. Precisa configurar sua própria chave em
  `src/config/aiConfig.ts` (tem instruções detalhadas no topo do arquivo)
  — por segurança, essa chave não é preenchida automaticamente, você
  mesmo cola ela lá.
- Setor "Promotores": abre só o Controle de Validade (as outras abas do dia
  a dia — Tarefas, Perdas, Inventário etc. — ficam ocultas pra esse setor).
  Assim como administrador e a função "A.P.P", quem é do setor Promotores
  também consegue ver e adicionar validade de todos os setores, não só do
  próprio.
- Avisos urgentes e produtos perto de vencer aparecem direto na Home do
  colaborador (não precisa mais entrar no Mural ou na Validade pra ver),
  logo acima das prioridades do dia.
- Abrir uma ocorrência: qualquer colaborador consegue relatar um problema
  (texto + foto opcional) pela aba "Abrir ocorrência" na Home. Os
  administradores acompanham tudo na aba "Ocorrências" e marcam como
  resolvida quando o problema for tratado. Também dá pra acompanhar pelo
  Portal Admin.
- Conferência (só setor FLV por enquanto): quando eu subir uma nota fiscal
  em formato de conferência, ela aparece pro encarregado do FLV na aba
  "Conferência". Pra cada produto (código interno, nome, quantidade
  esperada) ele marca "OK" ou "Divergência" — nesse caso informa a
  quantidade real que chegou e pode anexar uma foto (falta, produto a
  mais, ou qualidade ruim). Depois de conferir tudo, ele envia pra nós.
  No Portal Admin dá pra abrir cada conferência, ver as divergências
  destacadas em vermelho, e usar "Imprimir / Salvar PDF" pra gerar um PDF
  direto do navegador.
- Pedidos (só setor FLV por enquanto): o encarregado do FLV vê o catálogo
  de produtos (com embalagem, palete, estoque no CD e giro semanal),
  pesquisa pelo nome ou código, preenche a quantidade desejada de cada um
  e manda tudo de uma vez com o botão "Enviar pedido". No Portal Admin dá
  pra ver todos os pedidos enviados, abrir os itens de cada um e exportar
  em planilha.

## Sobre a base de produtos com código de barras (produtos_catalogo)

Pra o app já preencher o nome do produto sozinho ao escanear, ele consulta a
tabela `produtos_catalogo` (código de barras → nome do produto). Ela começa
vazia — quando você me mandar a lista de produtos com os códigos de barras
(pode ser uma planilha ou lista simples: código + nome + unidade), eu gero
um script de importação pra você colar no SQL Editor, do mesmo jeito que
fizemos com os relatórios de Perdas. Sem essa base, o app funciona do mesmo
jeito, só que pede pra digitar o nome na mão a cada escaneamento.

## Portal Admin (versão web, no computador)

O arquivo `portal-admin.html`, na raiz desta pasta, é um painel completo pra
administrador usar no computador — visão geral, equipe, setores, mural de
avisos, perdas & quebras, validade, inventário, ocorrências, conferência
(FLV) e pedidos (FLV), tudo ligado ao mesmo banco de dados (Supabase) do
celular. Não precisa instalar nada.

**Como abrir:** dê dois cliques no arquivo `portal-admin.html` (ele abre no
seu navegador — Chrome, Edge, o que estiver configurado como padrão). Se não
abrir sozinho, clique com o botão direito nele → "Abrir com" → escolha o
Chrome ou o Edge.

**Como entrar:** use o nome e a matrícula de um administrador (os mesmos
dados que esse administrador usa pra entrar no app do celular).

**Por que é um arquivo separado, e não um link:** esse painel precisa buscar
os dados direto no banco de dados a cada vez que você abre uma tela (equipe,
avisos, validade etc.). Um link comum não consegue fazer isso com segurança
pelo navegador de dentro da conversa — por isso ele é entregue como um
arquivo, pra abrir direto no seu navegador de verdade, onde a conexão com o
banco funciona normalmente.

Sempre que eu atualizar esse painel, vou te mandar o arquivo `portal-admin.html`
de novo pra você substituir o antigo.

## O que ainda falta (próximas etapas)

- Foto nas Tarefas (o `expo-image-picker` já está no projeto, usado no
  Mural de Avisos — só falta reaproveitar na tela de Tarefas).
- Abrir o Inventário pra mais gente além dos administradores (hoje só
  administrador acessa; é só trocar um trecho pequeno de código quando
  quiser liberar).
- Catálogo de Pedidos do FLV: a tabela `pedidos_produtos` começa vazia —
  assim que você mandar a planilha (Material, Embalagem, Palete, Estoque
  CD, Giro semanal, Qtd. pendente entrega), eu devolvo o script de
  importação pra colar no SQL Editor, do mesmo jeito que já fizemos com
  Perdas e o catálogo do Inventário.
- Conferência: hoje quem cria uma conferência (nota fiscal → itens) sou eu,
  a partir do que você me manda no chat. Se um dia fizer sentido, dá pra
  abrir isso pra outros setores além do FLV.
