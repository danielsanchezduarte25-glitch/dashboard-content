import { json, error, readJSON } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, setJSON, K } from './_lib/store.mjs';

// Generic key/value for the client-side modules (stories, calendar, goals, brand kit).
// GET /api/data?key=events   PUT /api/data?key=events  { value }
const ALLOWED = { sequences: K.sequences, events: K.events, goals: K.goals, brandkit: K.brandkit };
const LIMIT = 900 * 1024; // keep each blob under ~1 MB

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  const key = new URL(req.url).searchParams.get('key');
  if (!ALLOWED[key]) return error('Clave no permitida', 400);
  if (req.method === 'GET') return json({ key, value: await getJSON(ALLOWED[key]) });
  if (req.method === 'PUT') {
    const { value } = await readJSON(req);
    if (JSON.stringify(value ?? null).length > LIMIT) return error('Demasiado grande: guardá imágenes como URL, no embebidas.', 413);
    await setJSON(ALLOWED[key], value);
    return json({ ok: true });
  }
  return error('Método no permitido', 405);
};

export const config = { path: '/api/data' };
