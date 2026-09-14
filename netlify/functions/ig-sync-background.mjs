// Background sync (Netlify runs "*-background" functions for up to 15 minutes and answers 202
// immediately). Triggered by /api/ig/sync (button / auto-sync) and by scheduled-sync.mjs.
// Auth: the session cookie OR the internal secret header used by our own functions.
import { createHmac } from 'node:crypto';
import { env } from './_lib/http.mjs';
import { getSession } from './_lib/auth.mjs';
import { getToken, syncAll } from './_lib/instagram.mjs';
import { getJSON, setJSON, del, setWorkspace, K } from './_lib/store.mjs';

export const internalSecret = () => createHmac('sha256', env('SESSION_SECRET') || env('APP_PASSWORD') || 'dev').update('internal-sync').digest('hex');

export async function runSync({ full = false } = {}) {
  const token = await getToken();
  if (!token) { await setJSON(K.syncMeta, { ...((await getJSON(K.syncMeta)) || {}), running: false, error: 'Instagram no está conectado.' }); return; }
  const prev = (await getJSON(K.syncMeta)) || {};
  await setJSON(K.syncMeta, { ...prev, running: true, started_at: new Date().toISOString(), error: null });
  try {
    await syncAll(token, { full });
  } catch (e) {
    console.error('sync failed', e.message);
    if (e.status === 400 || e.status === 401) await del(K.igToken);
    await setJSON(K.syncMeta, { ...prev, running: false, error: e.message, failed_at: new Date().toISOString() });
  }
}

export default async (req) => {
  const u = new URL(req.url);
  const internal = req.headers.get('x-sync-secret') === internalSecret();
  const ok = getSession(req) || internal;
  if (!ok) return new Response('unauthorized', { status: 401 });
  if (internal && u.searchParams.get('ws')) setWorkspace(u.searchParams.get('ws'));
  const full = u.searchParams.get('full') === '1';
  await runSync({ full });
  return new Response('ok', { status: 200 });
};

export const config = { path: '/api/ig/sync-background' };
