# Iris 🌈

**IA de atendimento e vendas para WhatsApp e Mercado Livre.**

Na mitologia grega, Íris é a mensageira dos deuses. Aqui ela recebe as mensagens dos seus clientes, escreve a resposta com o Claude e envia sozinha ou deixa para você aprovar.

## Como funciona

```
WhatsApp (Meta) ─┐                         ┌─► envia direto (modo auto + caso seguro)
                 ├─► webhook ─► fila ─► Claude ─┤
Mercado Livre  ──┘   (200 na hora)  (SQLite)   └─► painel /admin para você aprovar
```

- **Webhooks oficiais**: sem automação de navegador e sem risco de banimento do WhatsApp.
- **Responde 200 em milissegundos** (o ML exige até 500 ms). O Claude roda depois, pela fila.
- **Modo sugestão** (padrão): a Iris escreve e você aprova, edita ou descarta no painel.
- **Modo auto**: envia sozinha, mas manda para o painel quando:
  - o assunto é sensível (reembolso, cancelamento, troca, desconto, pagamento, defeito, atraso...);
  - a IA não tem certeza ou pediu um humano;
  - no ML, a resposta tem link, telefone ou e-mail (o ML proíbe).
- **Trava de custo**: limite diário de chamadas ao Claude (`MAX_CLAUDE_CALLS_PER_DAY`).
- **Sem dependências**: só Node.js 22.13+ (usa `node:sqlite` e `fetch` nativos).

## Rodando localmente

```bash
cp .env.example .env                       # preencha as chaves
cp data/negocio.exemplo.md data/negocio.md # escreva as informações da sua loja
npm start                                  # http://localhost:3000/admin  (usuário: admin)
npm test
```

Para testar os webhooks no seu PC, exponha a porta com um túnel HTTPS (ex.: `cloudflared tunnel --url http://localhost:3000`).

## Configurando o Mercado Livre

1. Crie um app em <https://developers.mercadolivre.com.br/devcenter>.
2. **Redirect URI**: `https://SEU_DOMINIO/auth/ml/callback`
3. **URL de notificações**: `https://SEU_DOMINIO/webhooks/mercadolivre`
4. Tópicos: **questions** e **messages**.
5. Coloque `ML_CLIENT_ID` e `ML_CLIENT_SECRET` no `.env` com `ML_ENABLED=true`.
6. Entre no painel e clique em **conectar conta** (ou acesse `/auth/ml`).

A API do Mercado Livre é gratuita.

## Configurando o WhatsApp (Cloud API)

1. Em <https://developers.facebook.com>, crie um app do tipo **Business** e adicione o produto **WhatsApp**.
2. Copie o **Phone number ID** e gere um **token permanente** (usuário do sistema no Business Manager).
3. Webhook: URL `https://SEU_DOMINIO/webhooks/whatsapp`. O token de verificação é o mesmo de `WA_VERIFY_TOKEN`. Assine o campo **messages**.
4. Preencha `WA_*` no `.env` (inclusive `WA_APP_SECRET`, que valida a assinatura) com `WA_ENABLED=true`.

> Respostas para quem te chamou nas últimas 24h são mensagens de serviço. Confira a tabela atual de preços da Meta.

## Rotas

| Rota | Para quê |
|---|---|
| `GET /health` | Verificação de que está no ar |
| `GET/POST /webhooks/whatsapp` | Webhook da Meta |
| `POST /webhooks/mercadolivre` | Notificações do ML |
| `GET /auth/ml` | Conectar sua conta do ML (protegida por senha) |
| `GET /admin` | Painel de aprovação (usuário `admin`, senha `ADMIN_PASSWORD`) |

## Custo estimado (10 clientes/dia + poucas vendas)

Cerca de 50 respostas/dia × ~3 mil tokens ≈ 4,5 milhões de tokens/mês:
- **Haiku 5.5** (padrão): menos de US$ 1/mês
- **Sonnet 5.5** (`CLAUDE_MODEL=claude-sonnet-5-5`): ~US$ 10/mês

## Hospedagem

Qualquer serviço que rode Node 22 com HTTPS e disco persistente para o `data/` (VPS, Railway, Render com disco, Fly.io).
Hospedagem compartilhada só de PHP não serve.

## Estrutura

```
src/
  server.js              rotas HTTP
  worker.js              processa a fila
  claude.js              prompt e chamada ao Claude
  policy.js              regras: enviar sozinho ou pedir aprovação
  sender.js              entrega no canal certo
  admin.js               painel
  db.js                  SQLite (fila, histórico, rascunhos, tokens)
  channels/whatsapp.js
  channels/mercadolivre.js
data/negocio.exemplo.md  base de conhecimento da loja
```

## Próximos passos

- [ ] Testar com a conta real do ML (o pós-venda usa a nova arquitetura de mensageria com "agente")
- [ ] Transcrever áudios do WhatsApp
- [ ] Aviso no seu celular quando houver resposta para aprovar
- [ ] Ligar o modo auto depois de 1 a 2 semanas aprovando respostas
