-- =====================================================================
-- ULVA · De olho na validade
-- Cliente encontrou produto vencido: a loja registra a ocorrência com os
-- dados do cupom fiscal (lidos do QR Code), o caixa que passou, os produtos
-- (vários por cupom: validade, lote, foto, retirada da área de venda e
-- blitz), "Por que aconteceu?" e as assinaturas de quem registrou, do gerente e do responsável
-- do setor. Depois de salva, não muda.
-- A cada ocorrência nova, os administradores recebem uma notificação.
-- (Copiado do Prevenção SBH e adaptado ao ULVA.)
-- =====================================================================

create table if not exists public.olho_validade (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  registrado_por_matricula text,
  registrado_por_nome text,

  -- cupom fiscal (NFC-e)
  cupom_chave text,
  cupom_url text,
  cupom_numero text,
  cupom_serie text,
  cupom_cnpj text,
  cupom_emissao timestamptz,
  cupom_total numeric(12,2),
  caixa_numero text,

  -- produtos vencidos do cupom:
  -- [{descricao, codigo, setor, valor_unitario, data_validade, lote,
  --   qtd_encontrada, valor_retirado, restante_retirado, estava_na_blitz, fotos[]}]
  itens jsonb not null default '[]',
  qtd_itens int not null default 0,
  valor_total numeric(12,2) not null default 0,
  setores text[] not null default '{}',

  -- "Por que aconteceu?"
  motivo text not null,

  assinaturas jsonb not null default '[]',  -- [{papel, nome, tracos, largura, altura, assinada_em}]

  constraint olho_validade_tem_item check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) >= 1),
  constraint olho_validade_tem_motivo check (length(btrim(motivo)) >= 3),
  constraint olho_validade_tem_assinaturas check (jsonb_array_length(assinaturas) >= 3)
);
create index if not exists olho_validade_criado_em on public.olho_validade (criado_em desc);

alter table public.olho_validade enable row level security;
drop policy if exists olho_validade_ler on public.olho_validade;
create policy olho_validade_ler on public.olho_validade for select using (true);
drop policy if exists olho_validade_inserir on public.olho_validade;
create policy olho_validade_inserir on public.olho_validade for insert with check (true);
grant select, insert on public.olho_validade to anon, authenticated;

-- Fotos (bucket público, igual aos outros do ULVA)
insert into storage.buckets (id, name, public)
values ('olho-validade-fotos', 'olho-validade-fotos', true)
on conflict (id) do nothing;
drop policy if exists olho_validade_fotos_ler on storage.objects;
create policy olho_validade_fotos_ler on storage.objects for select using (bucket_id = 'olho-validade-fotos');
drop policy if exists olho_validade_fotos_enviar on storage.objects;
create policy olho_validade_fotos_enviar on storage.objects for insert with check (bucket_id = 'olho-validade-fotos');

-- Notificação: cada ocorrência nova avisa os administradores no celular.
create or replace function public.notificar_olho_validade()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  mensagens jsonb;
  titulo text := '👁 De olho na validade';
  corpo text;
begin
  corpo := coalesce(new.registrado_por_nome, 'A loja') || ' registrou ' || new.qtd_itens ||
           case when new.qtd_itens = 1 then ' produto vencido' else ' produtos vencidos' end ||
           ' · R$ ' || replace(to_char(new.valor_total, 'FM999990.00'), '.', ',') ||
           case when cardinality(new.setores) > 0 then ' · ' || array_to_string(new.setores, ', ') else '' end ||
           case when new.caixa_numero is not null then ' · caixa ' || new.caixa_numero else '' end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'to', t.expo_push_token,
           'title', titulo,
           'body', corpo,
           'sound', 'default',
           'data', jsonb_build_object('tipo', 'olho_validade', 'id', new.id)
         )), '[]'::jsonb)
    into mensagens
    from (select distinct pt.expo_push_token
            from push_tokens pt
            join colaboradores c on c.id = pt.colaborador_id
           where c.is_admin = true) t;

  if jsonb_array_length(mensagens) > 0 then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := mensagens
    );
  end if;
  return new;
exception when others then
  -- a notificação nunca pode impedir o registro da ocorrência
  return new;
end;
$$;

drop trigger if exists olho_validade_notificar on public.olho_validade;
create trigger olho_validade_notificar
  after insert on public.olho_validade
  for each row execute function public.notificar_olho_validade();

select 'olho_validade pronta' as ok;
