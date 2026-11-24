// Inicia o servidor de webhooks e o processador da fila.
import { config } from './config.js';
import { createApp } from './server.js';
import { startLoop } from './queue.js';
import { handlers } from './handlers/index.js';

const missing = ['supabaseUrl', 'supabaseKey', 'encryptionKey'].filter((k) => !config[k]);
if (missing.length) {
  console.error(`Faltam variáveis de ambiente: ${missing.join(', ')} (veja .env.example)`);
  process.exit(1);
}

if (!config.anthropicKey) console.warn('[iris] sem ANTHROPIC_API_KEY: a IA fica desligada; as mensagens chegam no painel para resposta manual');
if (!config.meta.appSecret) console.warn('[iris] sem META_APP_SECRET: webhooks do WhatsApp serão recusados');

createApp().listen(config.port, () => console.log(`[iris] worker ouvindo na porta ${config.port}`));
startLoop(handlers, { concurrency: config.concurrency });

process.on('unhandledRejection', (e) => console.error('[iris] promessa rejeitada:', e));
