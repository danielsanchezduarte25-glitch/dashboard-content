// Chunked upload of media for publishing (Netlify functions accept ≤ 6 MB per request).
// POST /api/media/upload?id=<id>&part=<n>&parts=<total>&name=&type=&size=   body: raw bytes (≤ 4 MB)
// GET  /api/media/upload?id=<id>   → metadata      DELETE /api/media/upload?id=<id>
import { json, error } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, setJSON, setBlob, K } from './_lib/store.mjs';
import { deleteMedia } from './_lib/publish.mjs';

export const PART_SIZE = 4 * 1024 * 1024;
const MAX_SIZE = 300 * 1024 * 1024;
const ID_RE = /^[a-z0-9-]{8,40}$/;

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  const u = new URL(req.url); const id = u.searchParams.get('id');
  if (!ID_RE.test(id || '')) return error('id inválido', 400);
  if (req.method === 'GET') return json({ meta: await getJSON(K.mediaMeta(id)) });
  if (req.method === 'DELETE') { await deleteMedia(id); return json({ ok: true }); }
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const part = Number(u.searchParams.get('part')); const parts = Number(u.searchParams.get('parts'));
  const size = Number(u.searchParams.get('size')); const type = u.searchParams.get('type') || 'application/octet-stream'; const name = u.searchParams.get('name') || 'archivo';
  if (!(parts >= 1 && part >= 0 && part < parts)) return error('part/parts inválidos', 400);
  if (!(size > 0 && size <= MAX_SIZE)) return error('Archivo demasiado grande (máx. 300 MB)', 413);
  if (!/^(video\/(mp4|quicktime)|image\/jpeg)$/.test(type)) return error('Formato no permitido: usá MP4/MOV para video y JPEG para imágenes.', 415);
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > PART_SIZE + 1024) return error('Parte inválida', 400);
  await setBlob(K.mediaPart(id, part), buf);
  const meta = (await getJSON(K.mediaMeta(id))) || { id, name, type, size, parts, partSize: PART_SIZE, received: [], created: new Date().toISOString() };
  if (part === 0) meta.partSize = buf.length; // all parts but the last have this size
  if (!meta.received.includes(part)) meta.received.push(part);
  meta.complete = meta.received.length === parts;
  await setJSON(K.mediaMeta(id), meta);
  return json({ ok: true, received: meta.received.length, parts, complete: meta.complete });
};

export const config = { path: '/api/media/upload' };
