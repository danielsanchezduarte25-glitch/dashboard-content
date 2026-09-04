// Instagram API with Instagram Login (Business/Creator accounts, no Facebook Page needed).
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
import { env, mapLimit } from './http.mjs';
import { getJSON, setJSON, K } from './store.mjs';

const GRAPH = 'https://graph.instagram.com';
const VER = env('IG_GRAPH_VERSION', 'v21.0');
export const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights', 'instagram_business_content_publish'];
export const PUBLISH_SCOPE = 'instagram_business_content_publish';

export function authorizeUrl(redirectUri, state) {
  const p = new URLSearchParams({
    client_id: env('IG_APP_ID', ''),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
    force_reauth: 'true',
  });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

async function igFetch(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error_message || data?.raw || `HTTP ${res.status}`;
    const err = new Error(`Instagram: ${msg}`); err.status = res.status; err.data = data; throw err;
  }
  return data;
}

export async function exchangeCode(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: env('IG_APP_ID', ''), client_secret: env('IG_APP_SECRET', ''),
    grant_type: 'authorization_code', redirect_uri: redirectUri, code,
  });
  const short = await igFetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body });
  // Response may be { access_token, user_id, permissions } or { data:[{...}] }
  const s = short.data?.[0] || short;
  const long = await igFetch(`${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(env('IG_APP_SECRET', ''))}&access_token=${encodeURIComponent(s.access_token)}`);
  const token = { access_token: long.access_token, user_id: String(s.user_id), expires_in: long.expires_in, obtained_at: Date.now(), permissions: s.permissions };
  await setJSON(K.igToken, token);
  return token;
}

export async function getToken() {
  const t = await getJSON(K.igToken);
  if (!t) return null;
  // Refresh long-lived tokens when older than 30 days (they last 60).
  const ageDays = (Date.now() - t.obtained_at) / 86400000;
  if (ageDays > 30) {
    try {
      const r = await igFetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(t.access_token)}`);
      const nt = { ...t, access_token: r.access_token, expires_in: r.expires_in, obtained_at: Date.now() };
      await setJSON(K.igToken, nt);
      return nt;
    } catch (e) { console.warn('refresh failed', e.message); }
  }
  return t;
}

export async function fetchProfile(token) {
  const fields = 'user_id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography';
  const me = await igFetch(`${GRAPH}/${VER}/me?fields=${fields}&access_token=${encodeURIComponent(token.access_token)}`);
  const profile = { ...me, synced_at: new Date().toISOString() };
  await setJSON(K.profile, profile);
  // Keep a daily follower history for the dashboard.
  const hist = (await getJSON(K.followerHistory, [])) || [];
  const today = new Date().toISOString().slice(0, 10);
  const idx = hist.findIndex((h) => h.date === today);
  if (idx >= 0) hist[idx].count = me.followers_count; else hist.push({ date: today, count: me.followers_count });
  await setJSON(K.followerHistory, hist.slice(-400));
  return profile;
}

export async function fetchAllMedia(token, max = 200) {
  const fields = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
  let url = `${GRAPH}/${VER}/me/media?fields=${fields}&limit=50&access_token=${encodeURIComponent(token.access_token)}`;
  const items = [];
  while (url && items.length < max) {
    const page = await igFetch(url);
    items.push(...(page.data || []));
    url = page.paging?.next || null;
  }
  return items;
}

// Reels metrics (2025+): views replaced plays. Some accounts lack 'shares' → N/A.
const REEL_METRICS = ['views', 'reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions'];

export async function fetchMediaInsights(token, media) {
  const isVideo = media.media_type === 'VIDEO' || media.media_product_type === 'REELS';
  const metrics = isVideo ? REEL_METRICS : ['views', 'reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions'];
  const tryMetrics = async (list) => {
    const r = await igFetch(`${GRAPH}/${VER}/${media.id}/insights?metric=${list.join(',')}&access_token=${encodeURIComponent(token.access_token)}`);
    const out = {};
    for (const m of r.data || []) out[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
    return out;
  };
  try { return await tryMetrics(metrics); }
  catch (e) {
    // Older media or unsupported metric → drop the offending metric and retry once.
    const unsupported = (e.data?.error?.message || '').match(/metric\[\d+\] must be one of|does not support the (\w+) metric|(\w+) metric/i);
    const fallback = metrics.filter((m) => m !== 'shares' && m !== 'views');
    try { return await tryMetrics(fallback); } catch { return {}; }
  }
}

// ---- Public counters (what Instagram shows in the grid) ---------------------
// Meta's insights API only returns ORGANIC numbers: a boosted/promoted reel shows e.g. 2,035
// views in the app but 622 in the API. The public grid counter includes paid views, so when
// APIFY_TOKEN is set we read it and use it as the headline "views" (organic kept in views_organic).
export async function fetchPublicCounts(username, limit = 80) {
  const token = env('APIFY_TOKEN');
  if (!token || !username) return null;
  const actor = env('APIFY_ACTOR', 'apify~instagram-reel-scraper');
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&timeout=100`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: [username], resultsLimit: limit }),
  });
  if (!res.ok) throw new Error(`Apify: HTTP ${res.status}`);
  const rows = await res.json();
  const byCode = new Map();
  for (const r of rows) {
    const code = r.shortCode || (r.url || '').match(/\/(?:reel|p)\/([^/?]+)/)?.[1];
    if (!code) continue;
    byCode.set(code, { views: r.videoPlayCount ?? r.videoViewCount ?? r.playCount ?? null, likes: r.likesCount ?? null, comments: r.commentsCount ?? null });
  }
  return byCode;
}

export const shortcode = (permalink) => (permalink || '').match(/\/(?:reel|p)\/([^/?]+)/)?.[1] || null;

export function normalizeReel(m, ins = {}) {
  return {
    id: m.id,
    caption: m.caption || '',
    title: (m.caption || 'Sin título').split('\n')[0].slice(0, 90) || 'Sin título',
    permalink: m.permalink,
    thumbnail_url: m.thumbnail_url || m.media_url || null,
    media_url: m.media_url || null,
    media_type: m.media_type,
    product_type: m.media_product_type,
    timestamp: m.timestamp,
    date: m.timestamp?.slice(0, 10),
    views: ins.views ?? null,
    views_organic: ins.views ?? null,
    likes: ins.likes ?? m.like_count ?? 0,
    comments: ins.comments ?? m.comments_count ?? 0,
    reach: ins.reach ?? null,
    saves: ins.saved ?? null,
    shares: ins.shares ?? null,
    total_interactions: ins.total_interactions ?? null,
  };
}

// Every sync refreshes the insights of ALL reels (numbers must match Instagram exactly, and
// old reels keep growing). `full` also walks further back in the media list.
export async function syncAll(token, { full = false } = {}) {
  const profile = await fetchProfile(token);
  const media = await fetchAllMedia(token, full ? 400 : 200);
  const reelsOnly = media.filter((m) => m.media_product_type === 'REELS' || m.media_type === 'VIDEO');
  const prev = (await getJSON(K.reels, [])) || [];
  const prevById = new Map(prev.map((r) => [r.id, r]));
  // Public counters in parallel with the insights calls (optional; needs APIFY_TOKEN).
  let pub = null, pubError = null;
  const pubP = fetchPublicCounts(profile.username, Math.max(60, reelsOnly.length + 10)).then((m) => { pub = m; }).catch((e) => { pubError = e.message; });
  const reels = await mapLimit(reelsOnly, 6, async (m) => {
    const old = prevById.get(m.id);
    const ins = await fetchMediaInsights(token, m);
    const r = normalizeReel(m, ins);
    if (r.views_organic == null && old) { r.views = old.views ?? null; r.views_organic = old.views_organic ?? null; r.reach = old.reach ?? null; r.saves = old.saves ?? null; r.shares = old.shares ?? null; }
    return old ? { ...old, ...r } : r;
  });
  await pubP;
  for (const r of reels) {
    const p = pub?.get(shortcode(r.permalink));
    if (p && p.views != null) {
      r.views_public = p.views;
      r.views = Math.max(p.views, r.views_organic || 0);
      if (p.likes != null) r.likes = Math.max(p.likes, r.likes || 0);
      if (p.comments != null) r.comments = Math.max(p.comments, r.comments || 0);
      // Public counter clearly above organic → the reel had paid distribution.
      r.promoted = r.views_organic != null && p.views > r.views_organic * 1.15 + 20;
    } else if (r.views_public != null) {
      r.views = Math.max(r.views_public, r.views_organic || 0);
    }
  }
  reels.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  await setJSON(K.reels, reels);
  const synced_at = new Date().toISOString();
  await setJSON(K.syncMeta, { synced_at, public_counts: !!pub, public_error: pubError, count: reels.length });
  return { profile, reels, count: reels.length, synced_at, publicCounts: !!pub, publicError: pubError };
}
