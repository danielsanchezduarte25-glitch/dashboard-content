// Publishing queue (like Metricool): drafts, scheduled posts, publish now, history.
// GET    /api/publish                       → { queue, canPublish, permissions }
// POST   /api/publish { action:'save', item } → upsert (status draft|scheduled)
// POST   /api/publish { action:'now', id }    → publish immediately (background)
// POST   /api/publish { action:'tick' }       → process due items (background)
// POST   /api/publish { action:'caption', brief, kind } → AI caption with the brand kit
// DELETE /api/publish?id=                     → remove item + its media
import { json, error, readJSON, siteUrl, env } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, setJSON, getWorkspace, K } from './_lib/store.mjs';
import { PUBLISH_SCOPE } from './_lib/instagram.mjs';
import { deleteMedia, processQueue } from './_lib/publish.mjs';
import { internalSecret } from './ig-sync-background.mjs';
import { claude, buildContext, systemPrompt } from './_lib/ai.mjs';

const KINDS = ['reel', 'image', 'carousel', 'story'];

async function state() {
  const [queue, token] = await Promise.all([getJSON(K.publishQueue, []), getJSON(K.igToken)]);
  const perms = token?.permissions ? String(token.permissions).split(',') : [];
  return { queue: (queue || []).sort((a, b) => (b.scheduledAt || b.createdAt || '').localeCompare(a.scheduledAt || a.createdAt || '')), connected: !!token, canPublish: !!token && (perms.includes(PUBLISH_SCOPE) || !token.permissions), permissions: perms };
}

async function kick(req, force) {
  const local = env('NETLIFY_DEV') || env('NODE_ENV') === 'test' || !env('URL');
  if (local) return processQueue({ base: siteUrl(req), force });
  await fetch(`${siteUrl(req)}/api/publish-background?ws=${getWorkspace()}${force?.length ? `&force=${force.join(',')}` : ''}`, { method: 'POST', headers: { 'x-sync-secret': internalSecret() } });
  return { kicked: true };
}

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  if (req.method === 'GET') return json(await state());
  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    const q = (await getJSON(K.publishQueue, [])) || [];
    const it = q.find((x) => x.id === id); if (!it) return error('No existe', 404);
    if (it.status === 'publishing') return error('Se está publicando ahora mismo; esperá a que termine.', 409);
    await setJSON(K.publishQueue, q.filter((x) => x.id !== id));
    for (const m of it.media || []) { try { await deleteMedia(m.id); } catch {} }
    return json(await state());
  }
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const body = await readJSON(req);
  if (body.action === 'save') {
    const it = body.item || {};
    if (!KINDS.includes(it.kind)) return error('Tipo inválido', 400);
    if (!/^[a-z0-9-]{6,40}$/.test(it.id || '')) return error('id inválido', 400);
    const media = (it.media || []).slice(0, 10).map((m) => ({ id: String(m.id), type: String(m.type || ''), name: String(m.name || '').slice(0, 120), size: Number(m.size) || 0, role: m.role === 'cover' ? 'cover' : undefined, w: m.w, h: m.h, duration: m.duration }));
    for (const m of media) { const meta = await getJSON(K.mediaMeta(m.id)); if (!meta?.complete) return error(`El archivo ${m.name} no terminó de subir.`, 400); }
    const q = (await getJSON(K.publishQueue, [])) || [];
    const prev = q.find((x) => x.id === it.id);
    if (prev && (prev.status === 'publishing' || prev.status === 'published')) return error('Ese post ya se publicó o se está publicando.', 409);
    const status = it.status === 'scheduled' ? 'scheduled' : 'draft';
    const item = { ...(prev || {}), id: it.id, kind: it.kind, media, caption: String(it.caption || '').slice(0, 2200), shareToFeed: it.shareToFeed !== false, thumbOffset: it.thumbOffset == null ? null : Number(it.thumbOffset), scheduledAt: it.scheduledAt ? new Date(it.scheduledAt).toISOString() : null, status, error: null, createdAt: prev?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (status === 'scheduled' && !item.scheduledAt) return error('Elegí fecha y hora para programar.', 400);
    if (prev) Object.assign(prev, item); else q.unshift(item);
    await setJSON(K.publishQueue, q);
    // If it is scheduled for a time already past → publish right away.
    let kicked = null;
    if (status === 'scheduled' && new Date(item.scheduledAt).getTime() <= Date.now() + 30000) kicked = await kick(req, [item.id]);
    return json({ ...(await state()), kicked });
  }
  if (body.action === 'now') {
    const q = (await getJSON(K.publishQueue, [])) || [];
    const it = q.find((x) => x.id === body.id); if (!it) return error('No existe', 404);
    if (it.status === 'published') return error('Ya está publicado.', 409);
    it.status = 'scheduled'; it.scheduledAt = new Date().toISOString(); it.error = null;
    await setJSON(K.publishQueue, q);
    const kicked = await kick(req, [it.id]);
    return json({ ...(await state()), kicked });
  }
  if (body.action === 'tick') {
    const q = (await getJSON(K.publishQueue, [])) || [];
    const due = q.filter((i) => i.status === 'scheduled' && i.scheduledAt && new Date(i.scheduledAt).getTime() <= Date.now());
    const kicked = due.length ? await kick(req, due.map((d) => d.id)) : null;
    return json({ ...(await state()), kicked });
  }
  if (body.action === 'caption') {
    const ctx = await buildContext();
    const kind = KINDS.includes(body.kind) ? body.kind : 'reel';
    const text = await claude({
      system: systemPrompt(ctx, 'Ahora escribís CAPTIONS de Instagram listos para publicar. Respondé SOLO con el caption (sin comillas ni explicaciones).'),
      messages: [{ role: 'user', content: `Escribí el caption para un ${kind === 'reel' ? 'reel' : kind === 'story' ? 'historia' : kind === 'carousel' ? 'carrusel' : 'post de imagen'} de Instagram.\nDe qué trata: ${body.brief || '(sin brief; usá los pilares de la marca)'}\nReglas: primera línea = gancho corto (máx. 8 palabras, sin emoji al inicio), 3–6 líneas cortas, un solo CTA con palabra clave, 3–5 hashtags relevantes al final, máximo 900 caracteres, en voseo.` }],
      max_tokens: 500, temperature: 0.8,
    });
    return json({ caption: text.trim() });
  }
  return error('Acción desconocida', 400);
};

export const config = { path: '/api/publish' };
