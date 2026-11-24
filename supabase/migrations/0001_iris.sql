-- =====================================================================
-- Iris — banco multi-cliente (Supabase / Postgres)
-- Cada cliente pagante é uma "organization". Tudo tem org_id e RLS.
-- O worker usa a service_role (ignora RLS). O painel usa o usuário logado.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Planos ----------
create table public.plans (
  id text primary key,                         -- gratis | starter | pro
  name text not null,
  price_cents int not null default 0,          -- mensal, em centavos (BRL)
  ai_replies_month int not null,               -- respostas da IA por mês
  products_max int not null,
  users_max int not null,
  channels text[] not null,                    -- {whatsapp,mercadolivre}
  ai_model text not null default 'claude-haiku-5-5',
  features text[] not null default '{}',       -- {crm,sheets,api,webhooks,nfe,nfse}
  active boolean not null default true,
  sort int not null default 0
);

insert into public.plans (id, name, price_cents, ai_replies_month, products_max, users_max, channels, ai_model, features, sort) values
  ('gratis',  'Teste grátis', 0,     100,  50,    1, '{whatsapp,mercadolivre}', 'claude-haiku-5-5',  '{crm,sheets}', 0),
  ('starter', 'Starter',      9700,  1500, 1000,  2, '{whatsapp,mercadolivre}', 'claude-haiku-5-5',  '{crm,sheets}', 1),
  ('pro',     'Pro',          19700, 6000, 20000, 5, '{whatsapp,mercadolivre}', 'claude-haiku-5-5' , '{crm,sheets,api,webhooks,nfe,nfse}', 2);

-- ---------- Organizações e membros ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_id text not null default 'gratis' references public.plans(id),
  status text not null default 'trial' check (status in ('trial','active','past_due','canceled','blocked')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  -- Assinatura (Mercado Pago)
  mp_preapproval_id text,
  -- Configurações da IA
  ai_name text not null default 'Iris',
  ai_tone text not null default 'cordial, direto e curto',
  knowledge text not null default '',          -- informações do negócio
  mode_whatsapp text not null default 'suggest' check (mode_whatsapp in ('suggest','auto','off')),
  mode_ml text not null default 'suggest' check (mode_ml in ('suggest','auto','off')),
  min_confidence numeric not null default 0.75,
  -- Nota fiscal
  nfe_mode text not null default 'off' check (nfe_mode in ('off','manual','auto')),
  -- API pública (chave guardada só como hash)
  api_key_prefix text,
  api_key_hash text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','agent')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Donos da plataforma (você). Inserir manualmente o seu user_id.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- Integrações ----------
-- Dados públicos da integração (visíveis no painel)
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('whatsapp','mercadolivre','google','nfse')),
  status text not null default 'connected' check (status in ('connected','error','disconnected')),
  external_id text,            -- phone_number_id (WA) | user_id do vendedor (ML) | e-mail (Google) | CNPJ (NFS-e)
  display_name text,           -- número formatado, apelido do vendedor...
  meta jsonb not null default '{}',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider)
);
create unique index integrations_provider_external on public.integrations(provider, external_id) where external_id is not null;

-- Segredos criptografados (AES-256-GCM no app). SEM políticas RLS para usuários:
-- só a service_role (worker e rotas de servidor) lê ou grava.
create table public.integration_secrets (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);

-- ---------- CRM ----------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','mercadolivre','manual','api')),
  external_id text,            -- telefone (WA) ou id do comprador (ML)
  name text,
  phone text,
  email text,
  stage text not null default 'lead' check (stage in ('lead','negociacao','cliente','pos_venda','perdido')),
  tags text[] not null default '{}',
  notes text not null default '',
  value_cents bigint not null default 0,       -- total já comprado
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, channel, external_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel text not null,
  external_ref text not null,  -- telefone (WA) | question_id / pack_id (ML)
  kind text not null default 'chat' check (kind in ('chat','question','post_sale')),
  status text not null default 'open' check (status in ('open','closed')),
  ai_paused boolean not null default false,    -- humano assumiu: IA não responde
  meta jsonb not null default '{}',            -- ex.: { toUserId } no pós-venda do ML
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id, channel, external_ref)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  author text not null check (author in ('customer','ai','human','system')),
  text text not null,
  external_id text,
  created_at timestamptz not null default now(),
  unique (org_id, external_id)
);
create index messages_conv on public.messages(conversation_id, created_at);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  target jsonb not null,
  customer_text text not null,
  reply text not null default '',
  reason text,
  status text not null default 'pending' check (status in ('pending','queued','sent','discarded','error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index drafts_pending on public.drafts(org_id, status, created_at desc);

-- ---------- Produtos (CSV, manual, ML, API) ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source text not null check (source in ('csv','manual','mercadolivre','api')),
  external_id text not null,   -- SKU ou id do anúncio
  sku text,
  name text not null,
  description text not null default '',
  price_cents bigint,
  stock numeric,
  unit text,
  ncm text,
  attributes jsonb not null default '{}',
  ml_item_id text,             -- vínculo com anúncio do ML
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('portuguese', coalesce(name,'') || ' ' || coalesce(sku,'') || ' ' || coalesce(description,''))
  ) stored,
  unique (org_id, source, external_id)
);
create index products_search on public.products using gin(search);

-- Busca de produtos para a IA (usada pelo worker)
create or replace function public.search_products(p_org uuid, p_query text, p_limit int default 6)
returns setof public.products language sql stable as $$
  select * from public.products
  where org_id = p_org and active
    and (search @@ websearch_to_tsquery('portuguese', p_query) or name ilike '%' || p_query || '%')
  order by ts_rank(search, websearch_to_tsquery('portuguese', p_query)) desc
  limit p_limit;
$$;

-- ---------- Vendas e notas fiscais ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source text not null check (source in ('mercadolivre','whatsapp','api','manual')),
  external_id text not null,   -- id do pedido no ML ou na sua loja
  pack_id text,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null,        -- paid | shipped | delivered | cancelled ...
  shipping_status text,
  logistic_type text,          -- fulfillment | drop_off | cross_docking | self_service ...
  total_cents bigint not null default 0,
  items jsonb not null default '[]',
  buyer jsonb not null default '{}',
  -- NF-e pelo Faturador do Mercado Livre
  nfe_invoice_id text,         -- id da nota no Faturador
  nfe_status text not null default 'none' check (nfe_status in ('none','processing','authorized','error','not_allowed')),
  nfe_key text,
  nfe_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, source, external_id)
);

-- ---------- Fila de trabalhos ----------
create table public.jobs (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  dedupe_key text unique,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts int not null default 0,
  last_error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_ready on public.jobs(status, run_after);

-- Pega o próximo job de forma atômica (vários workers podem rodar juntos)
create or replace function public.claim_job()
returns setof public.jobs language plpgsql as $$
begin
  return query
  update public.jobs j set status = 'processing', attempts = j.attempts + 1, updated_at = now()
  where j.id = (
    select id from public.jobs
    where status = 'pending' and run_after <= now()
    order by id
    for update skip locked
    limit 1
  )
  returning j.*;
end $$;

-- ---------- Webhooks de saída (para o sistema do cliente) ----------
create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  url text not null check (url like 'https://%'),
  secret text not null default encode(gen_random_bytes(24), 'hex'),
  events text[] not null default '{message.received,order.created,draft.created,contact.created}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.webhook_deliveries (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  endpoint_id uuid references public.webhook_endpoints(id) on delete cascade,
  event text not null,
  status_code int,
  error text,
  created_at timestamptz not null default now()
);

-- ---------- Uso mensal (cobrança e limites) ----------
create table public.usage_monthly (
  org_id uuid not null references public.organizations(id) on delete cascade,
  month date not null,
  ai_replies int not null default 0,
  messages_in int not null default 0,
  messages_out int not null default 0,
  primary key (org_id, month)
);

create or replace function public.bump_usage(p_org uuid, p_field text, p_n int default 1)
returns int language plpgsql as $$
declare v int;
begin
  insert into public.usage_monthly(org_id, month) values (p_org, date_trunc('month', now())::date)
  on conflict do nothing;
  execute format('update public.usage_monthly set %I = %I + $1 where org_id = $2 and month = date_trunc(''month'', now())::date returning %I', p_field, p_field, p_field)
  using p_n, p_org into v;
  return v;
end $$;
revoke execute on function public.bump_usage(uuid, text, int) from anon, authenticated;
revoke execute on function public.claim_job() from anon, authenticated;

-- =====================================================================
-- Segurança (RLS)
-- =====================================================================
create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

alter table public.plans enable row level security;
create policy plans_read on public.plans for select using (true);

alter table public.organizations enable row level security;
create policy org_read on public.organizations for select using (is_member(id) or is_platform_admin());
-- O usuário edita só as configurações da IA; plano/status mudam pelo servidor (service_role).
create policy org_update on public.organizations for update using (is_member(id)) with check (is_member(id));
revoke update on public.organizations from authenticated;
grant update (name, ai_name, ai_tone, knowledge, mode_whatsapp, mode_ml, min_confidence, nfe_mode) on public.organizations to authenticated;

alter table public.memberships enable row level security;
create policy mem_read on public.memberships for select using (user_id = auth.uid() or is_member(org_id));

alter table public.platform_admins enable row level security;
create policy pa_read on public.platform_admins for select using (user_id = auth.uid());

alter table public.integration_secrets enable row level security; -- nenhuma policy = ninguém além da service_role

-- Tabelas do cliente: leitura/escrita para membros
do $$
declare t text;
begin
  foreach t in array array['contacts','conversations','messages','drafts','products','orders','webhook_endpoints'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (is_member(org_id)) with check (is_member(org_id))', t || '_member', t);
  end loop;
  -- Somente leitura no painel (uso conta para o limite do plano!)
  foreach t in array array['webhook_deliveries','usage_monthly'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (is_member(org_id))', t || '_read', t);
  end loop;
end $$;

-- Integrações: o painel só LÊ. Criar/alterar (external_id define para onde vão as
-- mensagens!) é feito apenas pelo servidor com service_role, depois do OAuth.
alter table public.integrations enable row level security;
create policy integrations_read on public.integrations for select using (is_member(org_id));

alter table public.jobs enable row level security;
-- O painel pode criar só estes tipos de job, na própria organização.
-- (Eventos de canal como wa.message/ml.notification só entram pelo worker.)
create policy jobs_insert on public.jobs for insert with check (
  org_id is not null and is_member(org_id)
  and kind in ('outbound.send','nfe.process','google.setup','google.export')
  and dedupe_key is null
);
create policy jobs_read on public.jobs for select using (org_id is not null and is_member(org_id));

-- =====================================================================
-- Cadastro: ao criar conta, cria a organização e o vínculo de dono
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  insert into organizations(name) values (coalesce(new.raw_user_meta_data->>'company', split_part(new.email, '@', 1)))
  returning id into v_org;
  insert into memberships(org_id, user_id, role) values (v_org, new.id, 'owner');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Realtime para o painel atualizar sozinho
alter publication supabase_realtime add table public.drafts, public.messages, public.orders;
