// Manual correction of a reel's views (for promoted reels: Instagram shows organic + paid views,
// and no API exposes the paid part). POST /api/reels/override { id, views|null }
import { json, error, readJSON } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, setJSON, K } from './_lib/store.mjs';

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const { id, views } = await readJSON(req);
  const reels = (await getJSON(K.reels, [])) || [];
  const r = reels.find((x) => x.id === id); if (!r) return error('Reel no encontrado', 404);
  if (views == null || views === '') { r.views_manual = null; r.views = Math.max(r.views_public || 0, r.views_organic || 0) || null; }
  else { const v = Number(views); if (!(v >= 0)) return error('Número inválido', 400); r.views_manual = v; r.views = v; }
  await setJSON(K.reels, reels);
  return json({ ok: true, reel: r });
};

export const config = { path: '/api/reels/override' };
