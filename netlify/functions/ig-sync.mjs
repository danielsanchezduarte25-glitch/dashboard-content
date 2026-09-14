import { json, error, siteUrl, env } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getToken } from './_lib/instagram.mjs';
import { del, getJSON, setJSON, getWorkspace, K } from './_lib/store.mjs';
import { internalSecret, runSync } from './ig-sync-background.mjs';

// POST  /api/ig/sync[?full=1]  → starts a background sync and returns { started:true, since }.
//                                The client polls GET /api/ig/sync until sync.synced_at changes.
// GET   /api/ig/sync           → current sync state.
// DELETE /api/ig/sync          → disconnect Instagram.
export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  if (req.method === 'DELETE') { await del(K.igToken); return json({ ok: true }); }
  if (req.method === 'GET') return json({ sync: (await getJSON(K.syncMeta)) || null });
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const token = await getToken();
  if (!token) return error('Instagram no está conectado.', 409);
  const full = new URL(req.url).searchParams.get('full') === '1';
  const meta = (await getJSON(K.syncMeta)) || {};
  // Already running (started < 3 min ago)? Just report it.
  if (meta.running && meta.started_at && Date.now() - new Date(meta.started_at).getTime() < 180000) return json({ started: true, since: meta.synced_at || null, already: true });
  await setJSON(K.syncMeta, { ...meta, running: true, started_at: new Date().toISOString(), error: null });
  const local = env('NETLIFY_DEV') || env('NODE_ENV') === 'test' || !env('URL');
  if (local) { await runSync({ full }); return json({ started: true, since: meta.synced_at || null, inline: true }); }
  // Fire the background function without waiting for it (Netlify answers 202 right away).
  try {
    await fetch(`${siteUrl(req)}/api/ig/sync-background?ws=${getWorkspace()}${full ? '&full=1' : ''}`, { method: 'POST', headers: { 'x-sync-secret': internalSecret() } });
  } catch (e) {
    await setJSON(K.syncMeta, { ...meta, running: false, error: 'No se pudo iniciar la sincronización: ' + e.message });
    return error('No se pudo iniciar la sincronización: ' + e.message, 502);
  }
  return json({ started: true, since: meta.synced_at || null });
};

export const config = { path: '/api/ig/sync' };
