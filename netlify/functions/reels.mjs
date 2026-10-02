import { json, median, engagementRate } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, K } from './_lib/store.mjs';
import { getViewsMode } from './_lib/instagram.mjs';

// Everything the Dashboard and Instagram views need in one call.
export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  const [reels, profile, followers, goals, syncMeta, acc] = await Promise.all([
    getJSON(K.reels, []), getJSON(K.profile), getJSON(K.followerHistory, []), getJSON(K.goals), getJSON(K.syncMeta), getJSON(K.accountInsights),
  ]);
  const list = reels || [];
  const med = median(list.map((r) => r.views).filter(Boolean));
  // Which reels already have AI analysis / transcript
  const analyzed = new Set();
  await Promise.all(list.slice(0, 60).map(async (r) => { if (await getJSON(K.analysis(r.id))) analyzed.add(r.id); }));

  const now = new Date();
  const ym = (d) => d.slice(0, 7);
  const thisMonth = ym(now.toISOString());
  const lastMonth = ym(new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString());
  const sum = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
  const inMonth = (m) => list.filter((r) => ym(r.date || '') === m);
  const cur = inMonth(thisMonth), prev = inMonth(lastMonth);
  const pctChange = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);

  // Monthly reach for the last 9 months (sum of reel reach by publish month)
  const monthly = [];
  for (let i = 8; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const key = ym(d.toISOString());
    const rs = inMonth(key);
    monthly.push({ month: key, reach: sum(rs, 'reach'), views: sum(rs, 'views'), reels: rs.length });
  }

  // Rolling 30-day windows (same as Instagram's "Tu panel: últimos 30 días"). Account-level insights
  // from the API are exact; when missing we approximate from the reels published in the window.
  const ms30 = 30 * 86400000; const t30 = Date.now() - ms30, t60 = Date.now() - 2 * ms30;
  const inWin = (a, b) => list.filter((r) => { const t = new Date(r.timestamp || r.date).getTime(); return t >= a && t < b; });
  const w30 = inWin(t30, Infinity), w60 = inWin(t60, t30);
  const A = acc?.cur || null, P = acc?.prev || null;
  const pick = (k, fallbackKey) => ({ v: A?.[k] ?? sum(w30, fallbackKey), p: P?.[k] ?? sum(w60, fallbackKey), exact: A?.[k] != null });
  const V = pick('views', 'views'), R = pick('reach', 'reach'), S = pick('saves', 'saves'), SH = pick('shares', 'shares'), I = pick('total_interactions', null);
  const kpis = {
    followers: profile?.followers_count ?? null,
    followersDelta: followers?.length > 1 ? followers[followers.length - 1].count - followers[Math.max(0, followers.length - 31)].count : null,
    window: 30, accountInsights: !!A, insightsAt: acc?.fetched_at || null,
    views30: V.v, viewsDelta: pctChange(V.v, V.p),
    reach30: R.v, reachDelta: pctChange(R.v, R.p),
    interactions30: A ? I.v : null, interactionsDelta: A ? pctChange(I.v, I.p) : null,
    accountsEngaged30: A?.accounts_engaged ?? null, profileViews30: A?.profile_views ?? null, follows30: A?.follows_and_unfollows ?? null,
    saves30: S.v, savesDelta: pctChange(S.v, S.p),
    shares30: SH.v, sharesDelta: pctChange(SH.v, SH.p),
    // all-time totals (goals card, reports)
    reachTotal: sum(list, 'reach'), savesTotal: sum(list, 'saves'), viewsTotal: sum(list, 'views'), sharesTotal: sum(list, 'shares'),
    er: list.length ? list.reduce((a, r) => a + engagementRate(r), 0) / list.length : 0,
    reelsPublished: list.length, reelsThisMonth: cur.length, reelsDelta: pctChange(cur.length, prev.length),
    medianViews: med,
    avgSaves: list.length ? Math.round(sum(list, 'saves') / list.length) : 0,
    bestHour: bestHour(list),
  };
  return json({
    profile, goals: goals || { followers: 30000, views: 1000000, reelsPerMonth: 16, savesPerReel: 250 },
    viewsMode: await getViewsMode(), kpis, monthly, median: med, sync: syncMeta || (profile?.synced_at ? { synced_at: profile.synced_at } : null),
    reels: list.map((r) => ({ ...r, er: engagementRate(r), x: med ? (r.views || 0) / med : null, retention: r.avg_watch_time && r.duration ? Math.min(100, Math.round(r.avg_watch_time / r.duration * 100)) : null, analyzed: analyzed.has(r.id) })),
  });
};

function bestHour(list) {
  const byHour = {};
  for (const r of list) {
    if (!r.timestamp || !r.reach) continue;
    const h = new Date(r.timestamp).getUTCHours() - 6; // America/Costa_Rica
    const hh = ((h % 24) + 24) % 24;
    byHour[hh] = byHour[hh] || { n: 0, reach: 0 };
    byHour[hh].n++; byHour[hh].reach += r.reach;
  }
  const best = Object.entries(byHour).sort((a, b) => b[1].reach / b[1].n - a[1].reach / a[1].n)[0];
  return best ? `${String(best[0]).padStart(2, '0')}:00` : null;
}

export const config = { path: '/api/reels' };
