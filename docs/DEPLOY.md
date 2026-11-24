# Colocando a Iris no ar (começando grátis)

## 1. Supabase (banco + login)
1. Crie um projeto em supabase.com (plano Free, região São Paulo).
2. Em **SQL Editor**, cole e rode `supabase/migrations/0001_iris.sql`, depois `0002_grants.sql` e `0003_nfe_ml_nfse.sql`.
3. **Authentication → Providers**: deixe E-mail ligado. Para "Continuar com Google", ligue o Google também.
4. **Authentication → URL Configuration**: Site URL = URL do painel; adicione `https://SEU_PAINEL/auth/callback`.
5. Crie sua conta pelo painel e, no SQL Editor, torne-se admin da plataforma:
   ```sql
   insert into platform_admins(user_id) select id from auth.users where email = 'seu@email.com';
   ```
6. Guarde: Project URL, anon key e service_role key.

## 2. Chave de criptografia (a mesma no painel e no worker)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 3. Worker (Oracle Cloud Always Free)
1. Crie uma VM **Ampere A1** (Ubuntu) no Always Free e libere a porta 443.
2. Aponte um subdomínio (ex.: `api.iris.seudominio.com.br`) para o IP da VM.
3. Na VM:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs caddy git
   git clone https://github.com/brunolealx/iris-ia && cd iris-ia/apps/worker
   cp .env.example .env && nano .env      # preencha
   npm test
   ```
4. HTTPS automático com Caddy (`/etc/caddy/Caddyfile`):
   ```
   api.iris.seudominio.com.br {
     reverse_proxy localhost:8080
   }
   ```
5. Serviço que reinicia sozinho (`/etc/systemd/system/iris-worker.service`):
   ```ini
   [Service]
   WorkingDirectory=/home/ubuntu/iris-ia/apps/worker
   ExecStart=/usr/bin/node --env-file=.env src/index.js
   Restart=always
   User=ubuntu
   [Install]
   WantedBy=multi-user.target
   ```
   `sudo systemctl enable --now iris-worker caddy`

## 4. Painel (Vercel)
1. Importe o repositório na Vercel com **Root Directory** = `apps/web`.
2. Preencha as variáveis de `apps/web/.env.example`.

## 5. Meta (WhatsApp Cloud API + Cadastro Incorporado)
1. developers.facebook.com → crie um app **Business** → adicione **WhatsApp**.
2. Webhook: `https://api.../webhooks/whatsapp`, token = `WA_VERIFY_TOKEN`, assine **messages**.
3. **Facebook Login for Business** → crie uma configuração do Cadastro Incorporado (WhatsApp) → copie o **config_id**.
4. Para atender outras empresas, você precisa ser **Tech Provider** e passar pela verificação do negócio e do app. A Meta guia esse processo no painel.

## 6. Mercado Livre
developers.mercadolivre.com.br → Criar aplicação:
- Redirect URI: `https://SEU_PAINEL/api/ml/callback`
- Notificações: `https://api.../webhooks/mercadolivre`
- Tópicos: orders_v2, questions, messages, items, shipments, claims (post_purchase)

## 7. Google (Drive + Planilhas)
console.cloud.google.com → novo projeto → ative **Google Drive API** e **Google Sheets API** → Tela de consentimento (Externo) com o escopo `drive.file` → Credenciais OAuth (Aplicativo Web):
- Redirect: `https://SEU_PAINEL/api/google/callback`
- Em produção, publique o app. O escopo `drive.file` não é restrito, então a verificação é simples.

## 8. Mercado Pago
mercadopago.com.br/developers → Suas integrações → crie a aplicação:
- Copie o **Access Token** de produção.
- Webhooks: URL `https://api.../webhooks/mercadopago`, evento **Planos e assinaturas** e copie a **assinatura secreta** (`MP_WEBHOOK_SECRET`).

## 9. Claude
console.anthropic.com → API Keys → `ANTHROPIC_API_KEY` no worker. Defina um limite de gasto mensal no console.

## Checklist antes de vender
- [ ] Testar com uma conta de teste do ML (usuários de teste da API)
- [ ] Testar o WhatsApp com o número de teste da Meta
- [ ] Ativar o Faturador na conta do ML, preencher NCM/origem nos anúncios e emitir uma NF-e no modo manual
- [ ] NFS-e: emitir uma nota em produção restrita, conferir no Portal NFS-e e só então trocar para produção
- [ ] Servidor do worker com `openssl` instalado (converte o certificado .pfx)
- [ ] Termos de uso e política de privacidade (LGPD) no site
- [ ] Backup: o Supabase Free não tem backup automático, então exporte o banco toda semana
