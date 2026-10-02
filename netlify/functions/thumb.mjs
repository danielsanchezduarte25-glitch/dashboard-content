// Thumbnails for Inspiración. Instagram's CDN links expire after a few days and block hotlinking,
// so each banger's thumbnail is copied once into Blobs and served from here.
// GET /api/thumb/:bangerId  → image (cached) | 404
import { getJSON, setJSON, getBlob, setBlob, setWorkspace, K } from './_lib/store.mjs';
import { getSession } from './_lib/auth.mjs';

const KEY = (id) => `media/thumb/${id}`;        // global key (ids are random UUIDs)
const META = (id) => `media/thumb/${id}/meta`;

// → { url: '/api/thumb/<id>' | null, error? }
export async function cacheThumb(id, srcUrl) {
  if (!srcUrl || !/^https?:/.test(srcUrl)) return { url: null, error: 'sin url' };
  try {
    const res = await fetch(srcUrl, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', accept: 'image/avif,image/webp,image/*,*/*;q=0.8', referer: 'https://www.instagram.com/' } });
    if (!res.ok) return { url: null, error: 'HTTP ' + res.status };
    const type = res.headers.get('content-type') || 'image/jpeg';
    if (!/^image\//.test(type)) return { url: null, error: 'tipo ' + type };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100 || buf.length > 4 * 1024 * 1024) return { url: null, error: 'tamaño ' + buf.length };
    await setBlob(KEY(id), buf); await setJSON(META(id), { type, size: buf.length, at: new Date().toISOString() });
    return { url: `/api/thumb/${id}` };
  } catch (e) { return { url: null, error: e.message }; }
}

export default async (req) => {
  const m = new URL(req.url).pathname.match(/\/api\/thumb\/([a-z0-9-]{8,40})$/);
  if (!m) return new Response('not found', { status: 404 });
  const id = m[1];
  const headers = (type) => ({ 'content-type': type, 'cache-control': 'public, max-age=86400' });
  let meta = await getJSON(META(id));
  let buf = meta ? await getBlob(KEY(id)) : null;
  if (!buf) {
    // Lazy path: find the banger in the caller's workspace and cache its original URL now.
    const s = getSession(req); if (!s) return new Response('unauthorized', { status: 401 });
    setWorkspace(s.ws || 'main');
    const items = (await getJSON(K.bangers, [])) || [];
    const b = items.find((x) => x.id === id);
    if (!b || !b.thumbnail_src) return new Response('not found', { status: 404 });
    if (!(await cacheThumb(id, b.thumbnail_src)).url) return new Response('not found', { status: 404 });
    meta = await getJSON(META(id)); buf = await getBlob(KEY(id));
    if (!buf) return new Response('not found', { status: 404 });
  }
  return new Response(buf, { status: 200, headers: headers(meta.type) });
};

export const config = { path: '/api/thumb/*' };
