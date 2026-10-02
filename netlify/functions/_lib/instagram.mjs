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

// Account-level insights for the same windows Instagram shows in "Tu panel" (last 30 days vs the
// 30 before). These are the numbers that match the app's professional dashboard exactly.
const ACC_METRICS = ['views', 'reach', 'total_interactions', 'accounts_engaged', 'likes', 'comments', 'shares', 'saves', 'profile_views', 'follows_and_unfollows'];
export async function fetchAccountInsights(token) {
  const day = 86400000; const now = Math.floor(Date.now() / 1000);
  const win = async (since, until) => {
    const attempts = [ACC_METRICS, ACC_METRICS.filter((m) => !['profile_views', 'follows_and_unfollows'].includes(m)), ['reach', 'total_interactions', 'likes', 'comments', 'shares', 'saves']];
    for (const list of attempts) {
      try {
        const r = await igFetch(`${GRAPH}/${VER}/me/insights?metric=${list.join(',')}&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${encodeURIComponent(token.access_token)}`);
        const out = { since: new Date(since * 1000).toISOString().slice(0, 10), until: new Date(until * 1000).toISOString().slice(0, 10) };
        for (const m of r.data || []) out[m.name] = m.total_value?.value ?? (m.values || []).reduce((a, v) => a + (Number(v.value) || 0), 0);
        return out;
      } catch (e) { if (list === attempts.at(-1)) throw e; }
    }
  };
  // Instagram's "últimos 30 días" = today (partial) + the 30 previous full days, in the account's local
  // time (Costa Rica, UTC-6). Align the window to local midnight so the totals match the app.
  const tz = 6 * 3600; const localMidnight = (t) => Math.floor((t - tz) / 86400) * 86400 + tz;
  const start = localMidnight(now) - 30 * 86400;
  const cur = await win(start, now);
  let prev = null; try { prev = await win(start - 30 * 86400, start); } catch { /* optional */ }
  const data = { fetched_at: new Date().toISOString(), cur, prev };
  await setJSON(K.accountInsights, data);
  return data;
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
const BASE_METRICS = ['views', 'reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions'];
// Watch-time metrics (retention) exist only for reels; not every account/reel supports them.
const WATCH_METRICS = ['ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'];

export async function fetchMediaInsights(token, media) {
  const isReel = media.media_product_type === 'REELS';
  const tryMetrics = async (list) => {
    const r = await igFetch(`${GRAPH}/${VER}/${media.id}/insights?metric=${list.join(',')}&access_token=${encodeURIComponent(token.access_token)}`);
    const out = {};
    for (const m of r.data || []) out[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
    return out;
  };
  // Try from richest to poorest metric set; Meta rejects the whole call if one metric is unsupported.
  const attempts = isReel ? [[...BASE_METRICS, ...WATCH_METRICS], BASE_METRICS, BASE_METRICS.filter((m) => m !== 'shares' && m !== 'views')] : [BASE_METRICS, BASE_METRICS.filter((m) => m !== 'shares' && m !== 'views')];
  for (const list of attempts) { try { return await tryMetrics(list); } catch { /* next */ } }
  return {};
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
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 200);
    const hint = res.status === 403 || /limit|exceed|credit|insufficient/i.test(body) ? ' — créditos de Apify agotados o token sin permisos (console.apify.com → Billing)' : res.status === 401 ? ' — APIFY_TOKEN inválido' : '';
    throw new Error(`Apify: HTTP ${res.status}${hint}`);
  }
  const rows = await res.json();
  const byCode = new Map();
  for (const r of rows) {
    const code = r.shortCode || (r.url || '').match(/\/(?:reel|p)\/([^/?]+)/)?.[1];
    if (!code) continue;
    byCode.set(code, { views: r.videoPlayCount ?? r.videoViewCount ?? r.playCount ?? null, likes: r.likesCount ?? null, comments: r.commentsCount ?? null, duration: r.videoDuration ?? null });
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
    // Retention (Meta reports milliseconds): average seconds watched per view + total watch time.
    avg_watch_time: ins.ig_reels_avg_watch_time != null ? Math.round(ins.ig_reels_avg_watch_time) / 1000 : null,
    total_watch_time: ins.ig_reels_video_view_total_time ?? null,
  };
}

// Every sync refreshes the insights of ALL reels (numbers must match Instagram exactly, and
// old reels keep growing). `full` also walks further back in the media list.
// publicCounts: 'force' (manual sync button) always reads the public counters; 'auto' (autosync,
// scheduled) reads them at most once every 20 h to save Apify credits; false skips them.
// Only the newest PUBLIC_LIMIT reels are read (older ones keep their last public count).
const PUBLIC_LIMIT = Number(env('APIFY_PUBLIC_LIMIT', 40));

// Views mode: 'organic' → only Meta's official numbers (views = organic, promoted flagged by hand);
// 'public' → Instagram's public counter via Apify (includes paid views, promoted auto-detected).
export async function getViewsMode() {
  const m = await getJSON(K.metrics);
  if (m?.viewsMode === 'organic' || m?.viewsMode === 'public') return m.viewsMode;
  return env('APIFY_TOKEN') ? 'public' : 'organic';
}
// Recompute the headline fields of every reel for the given mode (used on sync and when switching).
export function applyViewsMode(reels, mode) {
  for (const r of reels) {
    if (r.promoted_auto == null && r.promoted != null && r.promoted_manual == null) r.promoted_auto = !!r.promoted; // migrate old flag
    if (mode === 'organic') r.views = r.views_manual ?? r.views_organic ?? null;
    else { r.views = Math.max(r.views_public || 0, r.views_organic || 0) || null; if (r.views_manual != null) r.views = Math.max(r.views_manual, r.views || 0); }
    r.promoted = r.promoted_manual != null ? !!r.promoted_manual : !!r.promoted_auto;
  }
  return reels;
}

export async function syncAll(token, { full = false, publicCounts = 'auto' } = {}) {
  const mode = await getViewsMode();
  const profile = await fetchProfile(token);
  try { await fetchAccountInsights(token); } catch (e) { console.warn('account insights failed', e.message); }
  const media = await fetchAllMedia(token, full ? 400 : 200);
  const reelsOnly = media.filter((m) => m.media_product_type === 'REELS' || m.media_type === 'VIDEO');
  const prev = (await getJSON(K.reels, [])) || [];
  const prevById = new Map(prev.map((r) => [r.id, r]));
  const prevMeta = (await getJSON(K.syncMeta)) || {};
  const pubAge = prevMeta.public_at ? Date.now() - new Date(prevMeta.public_at).getTime() : Infinity;
  const wantPub = mode === 'public' && (publicCounts === 'force' || (publicCounts === 'auto' && pubAge > 20 * 3600 * 1000));
  // Public counters in parallel with the insights calls (optional; needs APIFY_TOKEN).
  let pub = null, pubError = null;
  const pubP = wantPub ? fetchPublicCounts(profile.username, Math.min(PUBLIC_LIMIT, reelsOnly.length + 5)).then((m) => { pub = m; }).catch((e) => { pubError = e.message; }) : Promise.resolve();
  const reels = await mapLimit(reelsOnly, 6, async (m) => {
    const old = prevById.get(m.id);
    const ins = await fetchMediaInsights(token, m);
    const r = normalizeReel(m, ins);
    if (r.views_organic == null && old) { r.views = old.views ?? null; r.views_organic = old.views_organic ?? null; r.reach = old.reach ?? null; r.saves = old.saves ?? null; r.shares = old.shares ?? null; r.avg_watch_time = old.avg_watch_time ?? null; r.total_watch_time = old.total_watch_time ?? null; }
    return old ? { ...old, ...r } : r;
  });
  await pubP;
  for (const r of reels) {
    const p = pub?.get(shortcode(r.permalink));
    if (p && p.duration) r.duration = p.duration;
    if (p && p.views != null) {
      r.views_public = p.views;
      r.views = Math.max(p.views, r.views_organic || 0);
      if (p.likes != null) r.likes = Math.max(p.likes, r.likes || 0);
      if (p.comments != null) r.comments = Math.max(p.comments, r.comments || 0);
      // Public counter clearly above organic → the reel had paid distribution.
      r.promoted_auto = r.views_organic != null && p.views > r.views_organic * 1.15 + 20;
    }
  }
  applyViewsMode(reels, mode);
  reels.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  await setJSON(K.reels, reels);
  const synced_at = new Date().toISOString();
  const hasPublic = reels.some((r) => r.views_public != null);
  const meta = { synced_at, count: reels.length, mode, public_counts: mode === 'public' && hasPublic, public_fresh: !!pub, public_at: pub ? synced_at : prevMeta.public_at || null, public_error: mode === 'public' ? (pubError || (wantPub ? null : prevMeta.public_error || null)) : null, public_skipped: !wantPub };
  await setJSON(K.syncMeta, meta);
  return { profile, reels, count: reels.length, synced_at, publicCounts: hasPublic, publicError: pubError };
}
