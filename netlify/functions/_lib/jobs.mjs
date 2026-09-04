// Long-running work as background jobs. Netlify kills a normal function at ~30 s, so anything
// that may take longer (Apify scans, transcription + Claude, chat) runs in jobs-background.mjs
// (up to 15 min). The client receives { __job: id } and polls GET /api/jobs?id= until done.
import { randomUUID, createHmac } from 'node:crypto';
import { env, siteUrl, json } from './http.mjs';
import { getJSON, setJSON, K } from './store.mjs';

export const internalSecret = () => createHmac('sha256', env('SESSION_SECRET') || env('APP_PASSWORD') || 'dev').update('internal-sync').digest('hex');
export const isLocal = () => !!(env('NETLIFY_DEV') || env('NODE_ENV') === 'test' || !env('URL'));

// Registry of job kinds → async (params) => result. Filled by the functions that own the work.
export const handlers = {};

export async function runAsJob(req, kind, params) {
  if (isLocal()) {
    try { return json(await handlers[kind](params)); }
    catch (e) { return json({ error: e.message, status: e.status || 500 }, e.status || 500); }
  }
  const id = randomUUID();
  await setJSON(K.job(id), { id, kind, status: 'queued', created: new Date().toISOString() });
  try {
    await fetch(`${siteUrl(req)}/api/jobs-background?id=${id}`, { method: 'POST', headers: { 'x-sync-secret': internalSecret(), 'content-type': 'application/json' }, body: JSON.stringify({ kind, params }) });
  } catch (e) {
    await setJSON(K.job(id), { id, kind, status: 'error', error: 'No se pudo iniciar la tarea: ' + e.message });
  }
  return json({ __job: id });
}

export async function executeJob(id, kind, params) {
  await setJSON(K.job(id), { id, kind, status: 'running', started: new Date().toISOString() });
  try {
    const fn = handlers[kind]; if (!fn) throw new Error('Tarea desconocida: ' + kind);
    const result = await fn(params);
    await setJSON(K.job(id), { id, kind, status: 'done', result, finished: new Date().toISOString() });
  } catch (e) {
    await setJSON(K.job(id), { id, kind, status: 'error', error: e.message, errorStatus: e.status || 500, finished: new Date().toISOString() });
  }
}
