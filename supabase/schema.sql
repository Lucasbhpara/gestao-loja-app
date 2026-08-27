-- Schema inicial do Supabase para o app Gestão de Loja.
--
-- Como rodar: no painel do Supabase, vá em "SQL Editor" (menu lateral),
-- clique em "New query", cole todo este arquivo e clique em "Run".
--
-- Isso cria a tabela "colaboradores" (substituindo o AsyncStorage local) e
-- já popula ela com os 15 colaboradores que hoje estão em
-- src/data/employees.ts, pra não perder ninguém na migração.

create table if not exists colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  matricula text not null unique,
  funcao text not null,
  setor text not null,
  is_admin boolean not null default false,
  senha_atual text not null,
  senha_definida boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Por enquanto, sem Supabase Auth "de verdade" (o login continua sendo
-- nome + matrícula, do jeito que já funciona no app) — então liberamos
-- leitura e escrita pra quem tiver a chave "anon" do projeto, que é a
-- mesma chave que vai dentro do app. Isso é aceitável numa fase de teste
-- interna, mas não é o ideal para produção; dá pra reforçar isso depois
-- com regras mais específicas (RLS por linha) quando o app crescer.
alter table colaboradores enable row level security;

create policy "Permitir leitura para todos"
  on colaboradores for select
  using (true);

create policy "Permitir escrita para todos"
  on colaboradores for all
  using (true)
  with check (true);

-- Dados iniciais — só insere se a tabela ainda estiver vazia, pra poder
-- rodar esse arquivo mais de uma vez sem duplicar ninguém.
insert into colaboradores (nome, matricula, funcao, setor, is_admin, senha_atual, senha_definida)
select * from (values
  ('Dayse', '9728572', 'Frente de Caixa', 'frente-caixa', false, '9728572', false),
  ('Marcela', '9728646', 'Frente de Caixa', 'frente-caixa', false, '9728646', false),
  ('Rosilene', '9728648', 'Aux. Administrativo', 'cpd', false, '9728648', false),
  ('Luziana', '9728649', 'Frente de Caixa', 'frente-caixa', false, '9728649', false),
  ('Arthur', '9728651', 'Aux. Administrativo', 'cpd', false, '9728651', false),
  ('Marcela S.', '9734844', 'Aux. Administrativo', 'cpd', false, '9734844', false),
  ('Carlos', '9728565', 'Enc. Loja', 'mercearia', false, '9728565', false),
  ('Alisson', '9728566', 'Enc. Loja', 'deposito', false, '9728566', false),
  ('Geraldo', '9728511', 'Enc. Açougue', 'acougue', false, '9728511', false),
  ('Reni', '9727940', 'Enc. Frios', 'frios', false, '9727940', false),
  ('Claudiane', '9729163', 'A.P.P', 'prevencao', false, '9729163', false),
  ('Taynara', '9728792', 'Padeira', 'padaria', false, '9728792', false),
  ('Rodrigo da Cunha', '9728010', 'Gerente/ADM', 'gerencia', true, '9728010', false),
  ('Lucas Alberto', '7990353', 'Gerente/Criador', 'gerencia', true, '7990353', false),
  ('Matheus', '9728714', 'Enc. FLV', 'flv', false, '9728714', false)
) as novos(nome, matricula, funcao, setor, is_admin, senha_atual, senha_definida)
where not exists (select 1 from colaboradores);
