import { json, error, streamJSON } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getToken, syncAll } from './_lib/instagram.mjs';
import { del, K } from './_lib/store.mjs';

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  if (req.method === 'DELETE') { // disconnect
    await del(K.igToken);
    return json({ ok: true });
  }
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const token = await getToken();
  if (!token) return error('Instagram no está conectado.', 409);
  const full = new URL(req.url).searchParams.get('full') === '1';
  return streamJSON(async () => {
    try {
      const r = await syncAll(token, { full });
      return { ok: true, count: r.count, synced_at: r.synced_at, profile: r.profile };
    } catch (e) {
      if (e.status === 400 || e.status === 401) { await del(K.igToken); throw Object.assign(new Error(`${e.message}. Volvé a conectar Instagram.`), { status: 401 }); }
      throw e;
    }
  });
};

export const config = { path: '/api/ig/sync' };
