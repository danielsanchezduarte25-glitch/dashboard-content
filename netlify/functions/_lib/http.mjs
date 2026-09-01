// Small helpers shared by every function.
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const error = (message, status = 400, extra = {}) => json({ error: message, ...extra }, status);

export async function readJSON(req) {
  try { return await req.json(); } catch { return {}; }
}

export function env(name, fallback) {
  const v = process.env[name] ?? (typeof Netlify !== 'undefined' ? Netlify.env.get(name) : undefined);
  return v === undefined || v === '' ? fallback : v;
}

export function siteUrl(req) {
  // Prefer the configured URL (needed for the Instagram redirect URI to match exactly).
  return (env('URL') || env('DEPLOY_PRIME_URL') || new URL(req.url).origin).replace(/\/$/, '');
}

export const fmtDate = (d) => new Date(d).toISOString().slice(0, 10);

export const median = (arr) => {
  const s = arr.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Engagement rate = (likes + comments + saves + shares) / views
export const engagementRate = (r) => {
  const v = r.views || 0;
  if (!v) return 0;
  return ((r.likes || 0) + (r.comments || 0) + (r.saves || 0) + (r.shares || 0)) / v * 100;
};

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

// Long-running work: stream whitespace keep-alives so the platform does not cut the
// request at the 10 s time-to-first-byte limit, then write the final JSON body.
// Client side: `JSON.parse((await res.text()).trim())`.
export function streamJSON(work, { every = 1500 } = {}) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const tick = setInterval(() => { try { controller.enqueue(enc.encode(' ')); } catch {} }, every);
      try {
        const data = await work();
        controller.enqueue(enc.encode(JSON.stringify(data)));
      } catch (e) {
        controller.enqueue(enc.encode(JSON.stringify({ error: e.message || String(e), status: e.status || 500 })));
      } finally { clearInterval(tick); controller.close(); }
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-streamed': '1' } });
}
