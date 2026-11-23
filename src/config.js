// Configuração lida das variáveis de ambiente (.env).
const env = process.env;

const bool = (v, def = false) => (v === undefined || v === '' ? def : ['1', 'true', 'sim', 'yes'].includes(String(v).toLowerCase()));
const num = (v, def) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? def : Number(v));
const mode = (v) => (v === 'auto' ? 'auto' : 'suggest');

export const config = {
  port: num(env.PORT, 3000),
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  adminPassword: env.ADMIN_PASSWORD || '',
  dbPath: env.DB_PATH || './data/iris.db',
  knowledgeFile: env.KNOWLEDGE_FILE || './data/negocio.md',

  claude: {
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.CLAUDE_MODEL || 'claude-haiku-5-5',
    maxCallsPerDay: num(env.MAX_CLAUDE_CALLS_PER_DAY, 300),
  },

  minConfidence: num(env.MIN_CONFIDENCE, 0.75),

  whatsapp: {
    enabled: bool(env.WA_ENABLED),
    mode: mode(env.WA_MODE),
    phoneNumberId: env.WA_PHONE_NUMBER_ID || '',
    accessToken: env.WA_ACCESS_TOKEN || '',
    verifyToken: env.WA_VERIFY_TOKEN || '',
    appSecret: env.WA_APP_SECRET || '',
    graphVersion: env.WA_GRAPH_VERSION || 'v21.0',
  },

  mercadolivre: {
    enabled: bool(env.ML_ENABLED),
    mode: mode(env.ML_MODE),
    clientId: env.ML_CLIENT_ID || '',
    clientSecret: env.ML_CLIENT_SECRET || '',
    sellerId: env.ML_SELLER_ID || '',
  },
};
