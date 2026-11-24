// Google Sheets/Drive do cliente. Escopo usado: drive.file (a Iris só enxerga
// as planilhas que ela mesma criou; não lê o resto do Drive da pessoa).
import { config } from '../config.js';
import { getSecret, setSecret, markIntegrationError } from '../tenants.js';
import { permanent } from '../queue.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

async function accessToken(integration) {
  const s = await getSecret(integration.id);
  if (s.access_token && Date.now() < s.expires_at) return s.access_token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refresh_token, client_id: config.google.clientId, client_secret: config.google.clientSecret }),
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok) {
    await markIntegrationError(integration.id, 'Reconecte o Google Drive');
    throw permanent(`Google recusou o token (${t.error || res.status})`);
  }
  await setSecret(integration.id, { ...s, access_token: t.access_token, expires_at: Date.now() + (t.expires_in - 120) * 1000 });
  return t.access_token;
}

export function sheets(integration) {
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${await accessToken(integration)}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(`Google ${res.status}: ${data?.error?.message || 'erro'}`);
      e.permanent = [400, 403, 404].includes(res.status);
      throw e;
    }
    return data;
  }
  const DRIVE = 'https://www.googleapis.com/drive/v3/files';
  return {
    // ---------- Drive ----------
    createFolder: (name, parentId) =>
      api('POST', `${DRIVE}?fields=id,webViewLink`, { name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }),
    moveTo: (fileId, folderId) => api('PATCH', `${DRIVE}/${fileId}?addParents=${folderId}&removeParents=root&fields=id`, {}),
    findChild: async (parentId, name) => {
      const q = encodeURIComponent(`'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`);
      return (await api('GET', `${DRIVE}?q=${q}&fields=files(id)`)).files?.[0] || null;
    },
    /** Envia um arquivo (ex.: XML da NF-e) para uma pasta. */
    async upload(folderId, name, mimeType, content) {
      const boundary = `iris${Date.now()}`;
      const body =
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId] })}\r\n` +
        `--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n${content}\r\n--${boundary}--`;
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: { authorization: `Bearer ${await accessToken(integration)}`, 'content-type': `multipart/related; boundary=${boundary}` },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Google Drive ${res.status}: ${data?.error?.message || 'erro'}`);
      return data;
    },
    // ---------- Planilhas ----------
    create: (body) => api('POST', SHEETS, body),
    get: (id) => api('GET', `${SHEETS}/${id}?fields=sheets.properties`),
    batchUpdate: (id, requests) => api('POST', `${SHEETS}/${id}:batchUpdate`, { requests }),
    setValues: (id, data) => api('POST', `${SHEETS}/${id}/values:batchUpdate`, { valueInputOption: 'USER_ENTERED', data }),
    append: (id, range, values) =>
      api('POST', `${SHEETS}/${id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values }),
  };
}
