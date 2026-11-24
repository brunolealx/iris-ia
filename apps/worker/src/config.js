const e = process.env;

export const config = {
  port: Number(e.PORT || 8080),
  publicUrl: (e.PUBLIC_URL || '').replace(/\/$/, ''),
  supabaseUrl: (e.SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseKey: e.SUPABASE_SERVICE_ROLE_KEY || '',
  encryptionKey: e.ENCRYPTION_KEY || '',
  anthropicKey: e.ANTHROPIC_API_KEY || '',
  meta: {
    appSecret: e.META_APP_SECRET || '',
    verifyToken: e.WA_VERIFY_TOKEN || '',
    graphVersion: e.WA_GRAPH_VERSION || 'v21.0',
  },
  ml: { clientId: e.ML_CLIENT_ID || '', clientSecret: e.ML_CLIENT_SECRET || '' },
  google: { clientId: e.GOOGLE_CLIENT_ID || '', clientSecret: e.GOOGLE_CLIENT_SECRET || '' },
  mp: { accessToken: e.MP_ACCESS_TOKEN || '', webhookSecret: e.MP_WEBHOOK_SECRET || '' },
  concurrency: Number(e.CONCURRENCY || 3),
};
