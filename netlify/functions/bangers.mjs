import { randomUUID } from 'node:crypto';
import { json, error, readJSON, env, median, mapLimit } from './_lib/http.mjs';
import { handlers, runAsJob } from './_lib/jobs.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, setJSON, K } from './_lib/store.mjs';
import { claude, mediaMetadata, transcribeUrl, buildContext, systemPrompt } from './_lib/ai.mjs';

/*
 Banger Hunter.
 GET  /api/bangers                          -> { refs, bangers, scanlog }
 POST /api/bangers { action:'refs', refs:[...] }
 POST /api/bangers { action:'scan' }        -> scan all refs (needs APIFY_TOKEN) — or
 POST /api/bangers { action:'urls', urls:[...] } -> add reels by URL (Supadata metadata; no Apify needed)
 POST /api/bangers { action:'investigate', account:'@x' } -> one-off scan, not stored as ref
 POST /api/bangers { action:'adapt', id }   -> Claude rewrites the banger for Dani's brand
 POST /api/bangers { action:'transcript', id }
 DELETE /api/bangers?id=
*/
const THRESHOLD = 80; // viral score ≥ 80 = banger

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  const state = async () => json({ refs: (await getJSON(K.refs, [])) || [], bangers: (await getJSON(K.bangers, [])) || [], scanlog: (await getJSON(K.scanLog, [])) || [], providers: { apify: !!env('APIFY_TOKEN'), supadata: !!env('SUPADATA_API_KEY') } });
  if (req.method === 'GET') return state();
  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    const items = (await getJSON(K.bangers, [])) || [];
    await setJSON(K.bangers, items.filter((b) => b.id !== id));
    return state();
  }
  const body = await readJSON(req);
  if (body.action === 'refs') return json(await handle(body));
  return runAsJob(req, 'bangers', body);
};
handlers.bangers = (body) => handle(body);

async function fullState() {
  return { refs: (await getJSON(K.refs, [])) || [], bangers: (await getJSON(K.bangers, [])) || [], scanlog: (await getJSON(K.scanLog, [])) || [], providers: { apify: !!env('APIFY_TOKEN'), supadata: !!env('SUPADATA_API_KEY') } };
}

async function handle(body) {
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  {
    switch (body.action) {
      case 'refs': {
        const refs = [...new Set((body.refs || []).map(norm).filter(Boolean))];
        await setJSON(K.refs, refs);
        return fullState();
      }
      case 'scan': {
        const refs = (await getJSON(K.refs, [])) || [];
        if (!refs.length) fail('Agregá al menos un referente.');
        const log = [];
        for (const acc of refs) {
          try { const r = await scanAccount(acc, true); log.push({ account: acc, ok: true, videos: r.videos, bangers: r.newBangers, at: new Date().toISOString() }); }
          catch (e) { log.push({ account: acc, ok: false, error: e.message, at: new Date().toISOString() }); }
        }
        await setJSON(K.scanLog, log);
        return fullState();
      }
      case 'investigate': {
        const r = await scanAccount(norm(body.account), false);
        return r;
      }
      case 'urls': {
        const urls = (body.urls || []).map((u) => String(u).trim()).filter((u) => /instagram\.com|tiktok\.com|youtube\.com|youtu\.be/.test(u));
        if (!urls.length) fail('Pegá al menos una URL de reel.');
        const metas = await mapLimit(urls, 3, async (u) => { try { return await mediaMetadata(u); } catch (e) { return { error: e.message, url: u }; } });
        const items = (await getJSON(K.bangers, [])) || [];
        const added = [];
        for (const m of metas) {
          if (m.error) continue;
          const acc = '@' + (m.author?.username || 'desconocido');
          const item = toItem(m, acc);
          // Score against the account's own median (from everything we know about it)
          // With fewer than 3 known videos of that account there is no reliable median → score pending.
          const known = items.filter((b) => b.account === acc).map((b) => b.views).filter(Boolean);
          const sample = [...known, item.views].filter(Boolean);
          if (sample.length >= 3) { const med = median(sample); item.x = +((item.views || 0) / med).toFixed(1); item.score = scoreFor(item, med); }
          else { item.x = null; item.score = null; }
          if (!items.some((b) => b.url === item.url)) { items.unshift(item); added.push(item); }
        }
        // Re-score every manually added video of the touched accounts with the updated median.
        for (const acc of new Set(added.map((a) => a.account))) {
          const mine = items.filter((b) => b.account === acc);
          const sample = mine.map((b) => b.views).filter(Boolean);
          if (sample.length >= 3) { const med = median(sample); for (const b of mine) { b.x = +((b.views || 0) / med).toFixed(1); b.score = scoreFor(b, med); } }
        }
        await setJSON(K.bangers, items.slice(0, 300));
        return { added, skipped: metas.filter((m) => m.error), ...(await fullState()) };
      }
      case 'transcript': {
        const items = (await getJSON(K.bangers, [])) || [];
        const b = items.find((x) => x.id === body.id); if (!b) fail('No encontrado', 404);
        if (!b.transcript) { const t = await transcribeUrl(b.url); b.transcript = t.text; await setJSON(K.bangers, items); }
        return { id: b.id, transcript: b.transcript };
      }
      case 'adapt': {
        const items = (await getJSON(K.bangers, [])) || [];
        const b = items.find((x) => x.id === body.id); if (!b) fail('No encontrado', 404);
        if (!b.transcript) { try { b.transcript = (await transcribeUrl(b.url)).text; } catch { /* optional */ } }
        const ctx = await buildContext();
        const prompt = `Adaptá este video viral de ${b.account} a la marca de ${ctx.brand.handle}. No copies: tomá la MECÁNICA que lo hizo funcionar y reescribila con la audiencia, el tono y los temas de la marca.

VIDEO ORIGINAL
- Hook/caption: ${b.hook}
- Rendimiento: ${b.views} vistas (${b.x}× la mediana de su cuenta), ${b.likes} likes, ${b.comments} comentarios, publicado ${b.date}
- Transcripción: ${b.transcript ? `"""${b.transcript}"""` : '(no disponible; trabajá con el hook)'}

Devolvé SOLO un JSON:
{"why": "por qué funcionó el original (2-3 frases)", "hook": "hook textual 0-3 s", "onscreen": "texto en pantalla del primer segundo (máx 6 palabras)", "body": "desarrollo 3-25 s en prosa, con un ejemplo real de la marca", "cta": "CTA con palabra clave corta sin tilde", "keyword": "PALABRA", "publish": "día/hora y duración sugerida", "title": "título interno de 3-6 palabras"}`;
        const text = await claude({ system: systemPrompt(ctx), messages: [{ role: 'user', content: prompt }], max_tokens: 1200, temperature: 0.7 });
        const m = text.match(/\{[\s\S]*\}/); let adapted; try { adapted = JSON.parse(m[0]); } catch { adapted = { body: text }; }
        b.adapted = { ...adapted, at: new Date().toISOString() };
        await setJSON(K.bangers, items);
        return { id: b.id, adapted: b.adapted };
      }
      default: fail('Acción desconocida');
    }
  }
}

const norm = (a) => { a = String(a || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, ''); return a ? (a.startsWith('@') ? a : '@' + a) : ''; };

function toItem(m, acc) {
  return {
    id: randomUUID(), account: acc, platform: m.platform || 'instagram', url: m.url,
    hook: (m.title || m.description || '').split('\n')[0].slice(0, 160) || '(sin caption)',
    caption: m.description || m.title || '', thumbnail: m.media?.thumbnailUrl || m.media?.url || null,
    views: m.stats?.views ?? null, likes: m.stats?.likes ?? 0, comments: m.stats?.comments ?? 0, shares: m.stats?.shares ?? null,
    date: (m.createdAt || '').slice(0, 10), duration: m.media?.duration ?? null, added: new Date().toISOString(),
  };
}

// Viral score 0-100: multiple of the account's median views (log scale) + comment ratio.
function scoreFor(item, med) {
  const x = med ? (item.views || 0) / med : 1;
  const base = Math.min(100, Math.round(50 + 25 * Math.log2(Math.max(x, 0.01))));
  const cr = item.views ? (item.comments || 0) / item.views : 0;
  return Math.max(0, Math.min(100, base + Math.round(Math.min(cr * 1000, 10))));
}

// ---- Provider: Apify (lists an account's recent reels). Optional. ----------
async function scanAccount(acc, persist) {
  const token = env('APIFY_TOKEN');
  if (!token) throw Object.assign(new Error('El escaneo automático de cuentas necesita APIFY_TOKEN (Apify → Instagram Reel Scraper). Sin eso, pegá las URLs de los reels con “Agregar por URL”.'), { status: 501 });
  const actor = env('APIFY_ACTOR', 'apify~instagram-reel-scraper');
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=110`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: [acc.replace('@', '')], resultsLimit: Number(env('SCAN_LIMIT', 30)) }),
  });
  if (!res.ok) throw Object.assign(new Error(`Apify: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`), { status: 502 });
  const rows = await res.json();
  const vids = rows.map((r) => ({
    id: randomUUID(), account: acc, platform: 'instagram', url: r.url || r.inputUrl,
    hook: (r.caption || '').split('\n')[0].slice(0, 160) || '(sin caption)', caption: r.caption || '',
    thumbnail: r.displayUrl || r.thumbnailUrl || null,
    views: r.videoPlayCount ?? r.videoViewCount ?? r.playCount ?? null, likes: r.likesCount ?? 0, comments: r.commentsCount ?? 0,
    shares: r.sharesCount ?? null, date: (r.timestamp || '').slice(0, 10), duration: r.videoDuration ?? null, added: new Date().toISOString(),
  })).filter((v) => v.url);
  const med = median(vids.map((v) => v.views).filter(Boolean));
  for (const v of vids) { v.x = med ? +((v.views || 0) / med).toFixed(1) : null; v.score = scoreFor(v, med); }
  const bangers = vids.filter((v) => v.score >= THRESHOLD).sort((a, b) => b.score - a.score);
  let newBangers = 0;
  if (persist) {
    const items = (await getJSON(K.bangers, [])) || [];
    for (const b of bangers) if (!items.some((x) => x.url === b.url)) { items.unshift(b); newBangers++; }
    await setJSON(K.bangers, items.slice(0, 300));
  }
  return { account: acc, videos: vids.length, median: med, bangers, newBangers, all: persist ? undefined : vids };
}

export const config = { path: '/api/bangers' };
