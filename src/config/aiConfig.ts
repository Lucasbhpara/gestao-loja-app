// Chave da API da Anthropic (Claude), usada só pela aba "Falar com a IA".
//
// COMO OBTER A SUA CHAVE:
// 1. Acesse https://console.anthropic.com e crie uma conta (se ainda não tiver).
// 2. No menu, vá em "API Keys" e clique em "Create Key".
// 3. Copie a chave (começa com "sk-ant-...") e cole abaixo, entre as aspas.
// 4. É pré-pago/pay-as-you-go: você adiciona um crédito pequeno na conta e só
//    paga pelo que usar — pra uso pessoal como esse, o gasto tende a ser
//    centavos por mês.
//
// ATENÇÃO — SEGURANÇA: essa chave fica gravada dentro do próprio app. Quem
// tivesse o arquivo .apk poderia, com esforço técnico, extrair essa chave e
// gastar seu crédito. Como essa aba só aparece no SEU login e você não vai
// distribuir esse .apk publicamente, isso é aceitável por enquanto — mas não
// suba esse arquivo pra um repositório público no GitHub, e não mande o .apk
// pra estranhos.
export const ANTHROPIC_API_KEY = ''; // <- cole sua chave aqui, entre as aspas

// Se um dia essa versão do modelo parar de funcionar (a Anthropic muda os
// nomes de tempos em tempos), é só trocar por outra listada em
// https://docs.claude.com/en/docs/about-claude/models
export const ANTHROPIC_MODEL = 'claude-sonnet-4-5';
