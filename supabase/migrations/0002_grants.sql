-- =====================================================================
-- Iris — permissões das tabelas (GRANT)
-- Projetos novos do Supabase não liberam as tabelas criadas por SQL para
-- os papéis da API. O RLS (0001) continua decidindo QUAIS linhas cada um vê;
-- estes GRANTs só dizem QUAIS operações cada papel pode tentar.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Servidor (worker e rotas do painel com service_role): acesso total
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Visitantes do site: só a lista de planos
grant select on public.plans to anon, authenticated;

-- Usuários logados (o RLS limita à própria empresa)
grant select on public.organizations, public.memberships, public.platform_admins,
  public.integrations, public.webhook_deliveries, public.usage_monthly to authenticated;
grant update (name, ai_name, ai_tone, knowledge, mode_whatsapp, mode_ml, min_confidence, nfe_mode)
  on public.organizations to authenticated;
grant select, insert, update, delete on public.contacts, public.conversations, public.messages,
  public.drafts, public.products, public.orders, public.webhook_endpoints to authenticated;
grant select, insert on public.jobs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Funções usadas pelas regras de RLS
grant execute on function public.is_member(uuid), public.is_platform_admin() to anon, authenticated;
