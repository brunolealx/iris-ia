# iris-ia-mcp

Servidor MCP da **Iris**: deixa o Claude (Claude Code, Claude Desktop) e outros agentes de IA (n8n, Cursor) usarem a sua conta Iris em linguagem natural.

> "Quais clientes estão em negociação?" · "Lê a conversa da Jéssica e responde que o pedido saiu hoje" · "Aprova as sugestões pendentes da IA" · "Quanto vendi nos últimos 30 dias?"

## 1. Pegue sua chave

Painel da Iris → **Integrações → API e webhooks → Gerar chave** (plano Pro). Ela aparece uma única vez e tem o formato `iris_xxxxxxxx_...`.

## 2. Instale

**Claude Code**

```bash
claude mcp add iris \
  -e IRIS_API_TOKEN=iris_seu_token \
  -- npx -y iris-ia-mcp
```

**Claude Desktop / Cursor** (`claude_desktop_config.json` ou equivalente)

```json
{
  "mcpServers": {
    "iris": {
      "command": "npx",
      "args": ["-y", "iris-ia-mcp"],
      "env": { "IRIS_API_TOKEN": "iris_seu_token" }
    }
  }
}
```

**n8n**: adicione um node *MCP Client* como ferramenta do *AI Agent*, com transporte `stdio`, comando `npx`, argumentos `-y iris-ia-mcp` e a variável `IRIS_API_TOKEN`.

| Variável | Argumento | Obrigatória | Padrão |
|---|---|---|---|
| `IRIS_API_TOKEN` | `--token` | sim | |
| `IRIS_API_URL` | `--base-url` | não | `https://iris-worker-3fsa.onrender.com` |

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `iris_resumo` | Conversas abertas, esperando humano, sugestões pendentes, funil e vendas de 30 dias |
| `iris_contatos_listar` | Contatos por etapa do funil ou busca por nome/telefone/e-mail |
| `iris_contato_ver` | Detalhes de um contato |
| `iris_contato_salvar` | Cria ou atualiza contato pelo telefone/e-mail |
| `iris_contato_atualizar` | Move no funil, etiquetas, anotações, nome |
| `iris_conversas_listar` | Conversas do WhatsApp e Mercado Livre com o contato |
| `iris_conversa_mensagens` | Histórico da conversa |
| `iris_conversa_responder` | Responde na conversa como atendente ✉️ |
| `iris_conversa_atualizar` | Pausa/devolve a IA, fecha/reabre a conversa |
| `iris_whatsapp_enviar` | Envia WhatsApp para um número ✉️ |
| `iris_sugestoes_listar` | Respostas da IA esperando aprovação |
| `iris_sugestao_aprovar` | Envia a sugestão (pode editar o texto) ✉️ |
| `iris_sugestao_descartar` | Descarta a sugestão |
| `iris_produtos_buscar` | Busca no catálogo |
| `iris_produtos_salvar` | Cria/atualiza produtos pelo SKU |
| `iris_vendas_listar` | Vendas recentes com status da nota |
| `iris_venda_registrar` | Registra venda de fora da Iris |

✉️ = manda mensagem de verdade ao cliente. O agente é instruído a confirmar o texto com você antes.

## Segurança

- A chave dá acesso só à sua conta. Gere uma nova no painel se ela vazar (a antiga para de funcionar).
- Limite de 120 chamadas por minuto por conta.
- Sem dependências: o pacote é um único arquivo `index.js` que só fala com a API da Iris.
