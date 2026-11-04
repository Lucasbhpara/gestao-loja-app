-- Pedido CD a partir das Tratativas de Ruptura.
--
-- No app (Tratativas › Abertas › Ruptura) o gerente marca os produtos e toca
-- em "Enviar ao Pedido CD". Isso grava uma solicitação aqui (status
-- 'pendente'). A extensão do Chrome "ULVA – Pedido CD" pega a solicitação
-- (pedido_cd_pegar), digita no formulário MG SECOS do Portal 360 e no fim
-- chama pedido_cd_concluir, que:
--   • marca as tratativas digitadas como "Pedido feito" (com histórico);
--   • grava em pedido_cd_envios → push no celular de quem enviou.
-- Precisa ter rodado antes: ruptura_tratativas.sql e pedido_cd_envios.sql.

create table if not exists pedido_cd_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  itens jsonb not null,                 -- [{tratativa_id, codigo, produto, grupo_nome}]
  grupos text,
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'pronto', 'parou', 'erro', 'cancelada')),
  criado_por text,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  resultado jsonb
);
create index if not exists pedido_cd_solic_status on pedido_cd_solicitacoes (status, criado_em);

alter table pedido_cd_solicitacoes enable row level security;
drop policy if exists pedido_cd_solicitacoes_tudo on pedido_cd_solicitacoes;
create policy pedido_cd_solicitacoes_tudo on pedido_cd_solicitacoes for all using (true) with check (true);
grant all on pedido_cd_solicitacoes to anon, authenticated;

-- Pega a solicitação pendente mais antiga e marca como "processando"
-- (se a que estava processando travou há mais de 15 min, pega ela de novo).
create or replace function pedido_cd_pegar()
returns setof pedido_cd_solicitacoes
language plpgsql
security definer
as $$
begin
  return query
  update pedido_cd_solicitacoes s
     set status = 'processando', iniciado_em = now()
   where s.id = (
     select id from pedido_cd_solicitacoes
      where status = 'pendente'
         or (status = 'processando' and iniciado_em < now() - interval '15 minutes')
      order by criado_em
      limit 1
      for update skip locked)
  returning s.*;
end;
$$;

-- Fecha a solicitação com o resultado da extensão.
-- p_resultado: { ok:[{codigo,qtd,giro}], ja:[{codigo,valor}], naoAchou:[...], fora:[...], parouEm, erro }
create or replace function pedido_cd_concluir(p_id uuid, p_status text, p_resultado jsonb, p_mensagem text)
returns void
language plpgsql
security definer
as $$
declare
  s pedido_cd_solicitacoes;
  item jsonb;
  cod text;
  qtd text;
  feitos text[];
  n_ok int := coalesce(jsonb_array_length(p_resultado->'ok'), 0);
  n_ja int := coalesce(jsonb_array_length(p_resultado->'ja'), 0);
  n_prob int := coalesce(jsonb_array_length(p_resultado->'naoAchou'), 0);
  caixas int := 0;
begin
  update pedido_cd_solicitacoes
     set status = p_status, concluido_em = now(), resultado = p_resultado
   where id = p_id
  returning * into s;
  if s.id is null then return; end if;

  select coalesce(array_agg(x->>'codigo'), '{}') into feitos
    from (select jsonb_array_elements(coalesce(p_resultado->'ok', '[]')) x
          union all select jsonb_array_elements(coalesce(p_resultado->'ja', '[]'))) t;
  select coalesce(sum((x->>'qtd')::int), 0) into caixas
    from jsonb_array_elements(coalesce(p_resultado->'ok', '[]')) x;

  -- Tratativas dos itens que ficaram no pedido → "Pedido feito"
  for item in select * from jsonb_array_elements(s.itens) loop
    cod := item->>'codigo';
    if cod = any(feitos) and item ? 'tratativa_id' then
      select coalesce(x->>'qtd', x->>'valor') into qtd
        from jsonb_array_elements(coalesce(p_resultado->'ok', '[]') || coalesce(p_resultado->'ja', '[]')) x
       where x->>'codigo' = cod limit 1;
      update ruptura_tratativas
         set acao = 'pedido_feito',
             atualizada_em = now(),
             historico = historico || jsonb_build_array(jsonb_build_object(
               'em', now(), 'por', coalesce(s.criado_por, 'Pedido CD'), 'acao', 'pedido_feito',
               'obs', 'Pedido CD automático (MG SECOS): ' || coalesce(qtd, '?') || ' cx'))
       where id = (item->>'tratativa_id')::uuid and status <> 'resolvida';
    end if;
  end loop;

  insert into pedido_cd_envios (grupo_nome, status, itens_digitados, itens_ja_estavam, itens_problema,
                                caixas_total, mensagem, detalhe, destinatario_nome)
  values (coalesce(s.grupos, 'Tratativas'), case when p_status in ('pronto','parou','erro') then p_status else 'erro' end,
          n_ok, n_ja, n_prob, caixas, p_mensagem, p_resultado || jsonb_build_object('solicitacao_id', s.id),
          s.criado_por);
end;
$$;

grant execute on function pedido_cd_pegar() to anon, authenticated;
grant execute on function pedido_cd_concluir(uuid, text, jsonb, text) to anon, authenticated;

-- Atualização: item que NÃO entrou no pedido (CD sem estoque, fora do mix,
-- não achou no portal) volta a ficar aberto (sai de "Na fila do Pedido CD").
-- Ver a versão completa da função aplicada no Supabase (migração
-- pedido_cd_concluir_libera_fora).
