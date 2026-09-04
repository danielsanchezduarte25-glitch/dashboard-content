// GET /api/jobs?id=  → { id, status: queued|running|done|error, result?, error? }
import { json, error } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, K } from './_lib/store.mjs';

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  const id = new URL(req.url).searchParams.get('id');
  if (!/^[0-9a-f-]{36}$/.test(id || '')) return error('id inválido', 400);
  const job = await getJSON(K.job(id));
  if (!job) return error('Tarea no encontrada', 404);
  // Stuck for >12 min → report as error so the client stops waiting.
  if ((job.status === 'queued' || job.status === 'running') && Date.now() - new Date(job.started || job.created).getTime() > 12 * 60000) return json({ ...job, status: 'error', error: 'La tarea tardó demasiado y se canceló.' });
  return json(job);
};

export const config = { path: '/api/jobs' };
