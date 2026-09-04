// Instagram Content Publishing (Instagram API with Instagram Login).
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
import { env, siteUrl } from './http.mjs';
import { getJSON, setJSON, del, listKeys, K } from './store.mjs';
import { getToken } from './instagram.mjs';

const GRAPH = 'https://graph.instagram.com';
const VER = env('IG_GRAPH_VERSION', 'v21.0');

async function ig(path, { method = 'GET', params = {}, token }) {
  const q = new URLSearchParams({ ...params, access_token: token.access_token });
  const url = `${GRAPH}/${VER}/${path}${method === 'GET' ? `?${q}` : ''}`;
  const res = await fetch(url, method === 'GET' ? {} : { method, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: q });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    throw Object.assign(new Error(`Instagram: ${e.error_user_msg || e.message || res.status}`), { status: res.status, code: e.code, sub: e.error_subcode });
  }
  return data;
}

export const mediaUrl = (base, m) => `${base}/media/${m.id}${m.type?.startsWith('video') ? '.mp4' : '.jpg'}`;

// Waits until a container is FINISHED (video processing). ~5 s per poll, up to `maxMs`.
async function waitContainer(id, token, maxMs = 6 * 60 * 1000) {
  const t0 = Date.now();
  for (;;) {
    const r = await ig(id, { token, params: { fields: 'status_code,status' } });
    if (r.status_code === 'FINISHED') return r;
    if (r.status_code === 'ERROR' || r.status_code === 'EXPIRED') throw new Error(`Instagram no pudo procesar el archivo (${r.status || r.status_code}). Revisá formato: MP4/MOV H.264 + AAC, 9:16, máx. 15 min; imágenes JPEG.`);
    if (Date.now() - t0 > maxMs) throw new Error('Instagram tardó demasiado en procesar el archivo. Reintentá en unos minutos.');
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// Creates the container(s) for a queue item and publishes it. Returns { igId, permalink }.
export async function publishItem(item, base, token) {
  const media = item.media || [];
  if (!media.length) throw new Error('El post no tiene archivos.');
  const caption = item.caption || '';
  let creation;
  if (item.kind === 'carousel') {
    if (media.length < 2) throw new Error('Un carrusel necesita al menos 2 archivos.');
    const children = [];
    for (const m of media.slice(0, 10)) {
      const isVideo = m.type?.startsWith('video');
      const c = await ig('me/media', { method: 'POST', token, params: { is_carousel_item: 'true', ...(isVideo ? { media_type: 'VIDEO', video_url: mediaUrl(base, m) } : { image_url: mediaUrl(base, m) }) } });
      children.push(c.id);
    }
    for (const id of children) await waitContainer(id, token);
    creation = await ig('me/media', { method: 'POST', token, params: { media_type: 'CAROUSEL', children: children.join(','), caption } });
  } else if (item.kind === 'story') {
    const m = media[0]; const isVideo = m.type?.startsWith('video');
    creation = await ig('me/media', { method: 'POST', token, params: { media_type: 'STORIES', ...(isVideo ? { video_url: mediaUrl(base, m) } : { image_url: mediaUrl(base, m) }) } });
  } else if (item.kind === 'image') {
    creation = await ig('me/media', { method: 'POST', token, params: { image_url: mediaUrl(base, media[0]), caption } });
  } else { // reel
    const params = { media_type: 'REELS', video_url: mediaUrl(base, media[0]), caption, share_to_feed: item.shareToFeed === false ? 'false' : 'true' };
    if (item.thumbOffset != null) params.thumb_offset = String(Math.max(0, Math.round(item.thumbOffset)));
    const cover = media.find((m) => m.role === 'cover');
    if (cover) params.cover_url = mediaUrl(base, cover);
    creation = await ig('me/media', { method: 'POST', token, params });
  }
  await waitContainer(creation.id, token);
  const pub = await ig('me/media_publish', { method: 'POST', token, params: { creation_id: creation.id } });
  let permalink = null;
  try { permalink = (await ig(pub.id, { token, params: { fields: 'permalink' } })).permalink; } catch {}
  return { igId: pub.id, permalink };
}

export async function deleteMedia(id) {
  const keys = await listKeys(`media/${id}/`);
  await Promise.all(keys.map((k) => del(k)));
}

// Processes everything that is due. Runs inside the background function (up to 15 min).
export async function processQueue({ base, force = [] } = {}) {
  const token = await getToken();
  if (!token) return { error: 'Instagram no está conectado.' };
  const queue = (await getJSON(K.publishQueue, [])) || [];
  const now = Date.now();
  const due = queue.filter((i) => force.includes(i.id) || (i.status === 'scheduled' && i.scheduledAt && new Date(i.scheduledAt).getTime() <= now));
  const results = [];
  for (const item of due) {
    // Re-read the queue each time (other writes may have happened while publishing).
    const q = (await getJSON(K.publishQueue, [])) || [];
    const cur = q.find((x) => x.id === item.id); if (!cur || cur.status === 'published') continue;
    cur.status = 'publishing'; cur.startedAt = new Date().toISOString(); cur.error = null;
    await setJSON(K.publishQueue, q);
    try {
      const r = await publishItem(cur, base, token);
      const q2 = (await getJSON(K.publishQueue, [])) || [];
      const c2 = q2.find((x) => x.id === item.id);
      if (c2) { Object.assign(c2, { status: 'published', publishedAt: new Date().toISOString(), igId: r.igId, permalink: r.permalink, error: null }); await setJSON(K.publishQueue, q2); }
      results.push({ id: item.id, ok: true, permalink: r.permalink });
    } catch (e) {
      const q2 = (await getJSON(K.publishQueue, [])) || [];
      const c2 = q2.find((x) => x.id === item.id);
      if (c2) { Object.assign(c2, { status: 'error', error: e.message, failedAt: new Date().toISOString() }); await setJSON(K.publishQueue, q2); }
      results.push({ id: item.id, ok: false, error: e.message });
    }
  }
  return { processed: results };
}
