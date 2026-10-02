// Manual correction of a reel's views (for promoted reels: Instagram shows organic + paid views,
// and no API exposes the paid part) and manual "pautado" flag.
// POST /api/reels/override { id, views?: number|null, promoted?: true|false|null }  (null = automático)
import { json, error, readJSON } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, setJSON, K } from './_lib/store.mjs';
import { getViewsMode, applyViewsMode } from './_lib/instagram.mjs';

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const body = await readJSON(req);
  const reels = (await getJSON(K.reels, [])) || [];
  const r = reels.find((x) => x.id === body.id); if (!r) return error('Reel no encontrado', 404);
  if ('views' in body) {
    if (body.views == null || body.views === '') r.views_manual = null;
    else { const v = Number(body.views); if (!(v >= 0)) return error('Número inválido', 400); r.views_manual = v; }
  }
  if ('promoted' in body) r.promoted_manual = body.promoted == null ? null : !!body.promoted;
  applyViewsMode([r], await getViewsMode());
  await setJSON(K.reels, reels);
  return json({ ok: true, reel: r });
};

export const config = { path: '/api/reels/override' };
