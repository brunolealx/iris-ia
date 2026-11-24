-- =====================================================================
-- Iris — 0003: tira a Omie, NF-e pelo Faturador do Mercado Livre e NFS-e Nacional
-- Pode rodar mais de uma vez (idempotente). Rode no SQL Editor do Supabase.
-- =====================================================================

-- ---------- Planos: sem Omie; Pro ganha NFS-e ----------
update public.plans set features = array_remove(features, 'omie');
update public.plans set features = array_append(features, 'nfse') where id = 'pro' and not ('nfse' = any(features));

-- ---------- Modo da NF-e: off | manual | auto ----------
alter table public.organizations drop constraint if exists organizations_nfe_mode_check;
update public.organizations set nfe_mode = 'manual' where nfe_mode = 'order_only';
alter table public.organizations add constraint organizations_nfe_mode_check check (nfe_mode in ('off','manual','auto'));

-- ---------- Integrações: sai Omie, entra NFS-e ----------
delete from public.integrations where provider = 'omie'; -- apaga também o segredo (cascade)
alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in ('whatsapp','mercadolivre','google','nfse'));

-- ---------- Produtos importados da Omie viram "manual" ----------
alter table public.products drop constraint if exists products_source_check;
update public.products p set source = 'manual'
  where source = 'omie' and not exists (select 1 from public.products q where q.org_id = p.org_id and q.source = 'manual' and q.external_id = p.external_id);
delete from public.products where source = 'omie';
alter table public.products add constraint products_source_check check (source in ('csv','manual','mercadolivre','api'));

-- ---------- Vendas: NF-e do Faturador do ML ----------
alter table public.orders add column if not exists nfe_invoice_id text;
alter table public.orders drop constraint if exists orders_nfe_status_check;
update public.orders set nfe_status = case
  when nfe_status in ('invoiced','attached') then 'authorized'
  when nfe_status = 'order_created' then 'none'
  else nfe_status end;
alter table public.orders add constraint orders_nfe_status_check check (nfe_status in ('none','processing','authorized','error','not_allowed'));
alter table public.orders drop column if exists omie_order_id;
create index if not exists orders_nfe_invoice on public.orders(org_id, nfe_invoice_id) where nfe_invoice_id is not null;

-- ---------- NFS-e Nacional (notas de serviço) ----------
create table if not exists public.service_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','processing','authorized','rejected','error','canceled')),
  serie text,
  number bigint,               -- número da DPS (sequencial por série)
  dps_id text,                 -- "DPS" + município + inscrição + série + número (45)
  chave text,                  -- chave de acesso da NFS-e (50)
  nfse_number text,
  competencia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  amount_cents bigint not null check (amount_cents > 0),
  description text not null,
  iss_retido boolean not null default false,
  taker jsonb not null default '{}',   -- tomador: doc, name, email, cep, cMun, street, number, district
  service jsonb not null default '{}', -- cTribNac / cNBS / cLocPrestacao se diferentes do padrão
  xml text,
  error text,
  cancel_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, serie, number)
);
create index if not exists service_invoices_org on public.service_invoices(org_id, created_at desc);

-- O painel só LÊ; criar/emitir/cancelar passa pelo servidor (número e status são controlados lá)
alter table public.service_invoices enable row level security;
drop policy if exists service_invoices_read on public.service_invoices;
create policy service_invoices_read on public.service_invoices for select using (is_member(org_id));
grant select on public.service_invoices to authenticated;
grant all on public.service_invoices to service_role;

-- ---------- Fila: tipos de job que o painel pode criar ----------
drop policy if exists jobs_insert on public.jobs;
create policy jobs_insert on public.jobs for insert with check (
  org_id is not null and is_member(org_id)
  and kind in ('outbound.send','nfe.process','google.setup','google.export')
  and dedupe_key is null
);
