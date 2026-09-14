// Monthly client report: data + AI narrative, rendered by the browser as a printable page (PDF).
// GET  /api/report?month=YYYY-MM  → { data, narrative|null }
// POST /api/report { month }      → generates the narrative with Claude (background job) and stores it
import { json, error, readJSON, median, engagementRate } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, setJSON, K } from './_lib/store.mjs';
import { claude, extractJSON, buildContext, systemPrompt } from './_lib/ai.mjs';
import { handlers, runAsJob } from './_lib/jobs.mjs';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const prevMonth = (ym) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const sum = (a, k) => a.reduce((s, r) => s + (r[k] || 0), 0);
const avg = (a, k) => { const v = a.map((r) => r[k]).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

export function agg(list) {
  const views = sum(list, 'views'), reach = sum(list, 'reach'), saves = sum(list, 'saves'), shares = sum(list, 'shares'), likes = sum(list, 'likes'), comments = sum(list, 'comments');
  const er = list.length ? list.reduce((s, r) => s + engagementRate(r), 0) / list.length : 0;
  const ret = list.filter((r) => r.avg_watch_time && r.duration); const retention = ret.length ? Math.round(ret.reduce((s, r) => s + Math.min(100, r.avg_watch_time / r.duration * 100), 0) / ret.length) : null;
  return { count: list.length, views, reach, saves, shares, likes, comments, er: +er.toFixed(2), retention, promoted: list.filter((r) => r.promoted).length, avgWatch: avg(list, 'avg_watch_time') };
}

export async function buildReportData(month) {
  const [reels, profile, followers, top5, sales, products, ads, brandkit] = await Promise.all([
    getJSON(K.reels, []), getJSON(K.profile), getJSON(K.followerHistory, []), getJSON(K.top5), getJSON('sales/items', []), getJSON('sales/products', []), getJSON('sales/ads', []), getJSON(K.brandkit),
  ]);
  const all = reels || []; const pm = prevMonth(month);
  const inM = (m) => all.filter((r) => (r.date || '').slice(0, 7) === m);
  const cur = inM(month), prev = inM(pm);
  const med = median(all.map((r) => r.views).filter(Boolean));
  const withX = (r) => ({ id: r.id, title: r.title, date: r.date, permalink: r.permalink, thumbnail_url: r.thumbnail_url, views: r.views, reach: r.reach, likes: r.likes, comments: r.comments, saves: r.saves, shares: r.shares, er: +engagementRate(r).toFixed(2), x: med ? +((r.views || 0) / med).toFixed(1) : null, retention: r.avg_watch_time && r.duration ? Math.min(100, Math.round(r.avg_watch_time / r.duration * 100)) : null, promoted: !!r.promoted, hour: r.timestamp ? ((new Date(r.timestamp).getUTCHours() - 6 + 24) % 24) : null });
  const curRows = cur.map(withX).sort((a, b) => (b.views || 0) - (a.views || 0));
  // followers at start/end of month from the daily history
  const fh = (followers || []).filter((h) => h.date <= `${month}-31`).sort((a, b) => a.date.localeCompare(b.date));
  const fEnd = fh.length ? fh[fh.length - 1].count : profile?.followers_count ?? null;
  const fStartRec = fh.filter((h) => h.date < `${month}-01`).pop(); const fStart = fStartRec ? fStartRec.count : (fh.find((h) => h.date >= `${month}-01`)?.count ?? null);
  // by weekday / hour
  const byDow = {}; for (const r of cur) { const d = new Date(r.timestamp || r.date).getUTCDay(); byDow[d] = byDow[d] || { n: 0, views: 0 }; byDow[d].n++; byDow[d].views += r.views || 0; }
  const bestDow = Object.entries(byDow).sort((a, b) => b[1].views / b[1].n - a[1].views / a[1].n)[0];
  const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  // sales in month
  const sm = (sales || []).filter((s) => (s.date || '').slice(0, 7) === month);
  const salesAgg = sm.length ? { count: sm.length, revenue: sum(sm, 'total'), units: sum(sm, 'qty'), byAd: sum(sm.filter((s) => s.source === 'ad'), 'total'), organic: sum(sm.filter((s) => s.source === 'organic'), 'total'), other: sum(sm.filter((s) => s.source !== 'ad' && s.source !== 'organic'), 'total'), topProducts: Object.values(sm.reduce((o, s) => { o[s.productId] = o[s.productId] || { name: s.productName, qty: 0, revenue: 0 }; o[s.productId].qty += s.qty; o[s.productId].revenue += s.total; return o; }, {})).sort((a, b) => b.revenue - a.revenue).slice(0, 5), topAds: Object.values(sm.filter((s) => s.source === 'ad').reduce((o, s) => { o[s.adId] = o[s.adId] || { name: (ads || []).find((a) => a.id === s.adId)?.name || (s.adId?.startsWith('reel-') ? all.find((r) => 'reel-' + r.id === s.adId)?.title : null) || 'Anuncio', n: 0, revenue: 0 }; o[s.adId].n++; o[s.adId].revenue += s.total; return o; }, {})).sort((a, b) => b.revenue - a.revenue).slice(0, 5) } : null;
  return {
    month, prevMonth: pm, generatedAt: new Date().toISOString(),
    account: { name: brandkit?.owner || profile?.name || '', handle: profile?.username ? '@' + profile.username : brandkit?.handle || '', picture: profile?.profile_picture_url || null, followers: fEnd, followersStart: fStart, followersDelta: fEnd != null && fStart != null ? fEnd - fStart : null, totalReels: all.length, median: med },
    current: agg(cur), previous: agg(prev),
    reels: curRows,
    top: curRows.slice(0, 5),
    allTimeTop: [...all].map(withX).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 3),
    bestDow: bestDow ? { day: DOW[+bestDow[0]], avgViews: Math.round(bestDow[1].views / bestDow[1].n) } : null,
    top5: top5 ? { generatedAt: top5.generatedAt, summary: top5.summary, patterns: top5.patterns, items: top5.items.map((i) => ({ title: i.title, views: i.views, x: i.x, why: i.ai?.why, replicate: i.ai?.replicate, hook: i.ai?.hook })) } : null,
    sales: salesAgg,
  };
}

async function narrative({ month }) {
  const data = await buildReportData(month);
  const ctx = await buildContext();
  const pct = (a, b) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}%` : 'n/a (sin mes anterior)');
  const c = data.current, p = data.previous;
  const facts = `PERÍODO: ${month} (comparado con ${data.prevMonth})
CUENTA: ${data.account.name} ${data.account.handle} · seguidores al cierre ${data.account.followers ?? 'n/d'} (${data.account.followersDelta != null ? (data.account.followersDelta >= 0 ? '+' : '') + data.account.followersDelta + ' en el mes' : 'sin histórico previo'})
REELS DEL MES: ${c.count} (mes anterior ${p.count}) · ${c.promoted} pautados
VISTAS: ${c.views} (${pct(c.views, p.views)}) · ALCANCE: ${c.reach} (${pct(c.reach, p.reach)}) · GUARDADOS: ${c.saves} (${pct(c.saves, p.saves)}) · COMPARTIDOS: ${c.shares} (${pct(c.shares, p.shares)}) · LIKES ${c.likes} · COMENTARIOS ${c.comments}
ENGAGEMENT: ${c.er}% (anterior ${p.er}%) · RETENCIÓN MEDIA: ${c.retention != null ? c.retention + '%' : 'n/d'} (anterior ${p.retention != null ? p.retention + '%' : 'n/d'})
MEDIANA HISTÓRICA DE VISTAS: ${data.account.median} · MEJOR DÍA: ${data.bestDow ? data.bestDow.day + ' (' + data.bestDow.avgViews + ' vistas promedio)' : 'n/d'}
TOP REELS DEL MES:\n${data.top.map((r, i) => `${i + 1}. "${r.title}" — ${r.views} vistas (${r.x}× mediana), ER ${r.er}%, guardados ${r.saves ?? 'n/d'}, compartidos ${r.shares ?? 'n/d'}${r.retention != null ? ', retención ' + r.retention + '%' : ''}${r.promoted ? ' [pautado]' : ''}`).join('\n') || '(sin reels este mes)'}
PEORES DEL MES: ${data.reels.slice(-3).reverse().map((r) => `"${r.title}" ${r.views} vistas (${r.x}×)`).join(' · ') || 'n/d'}
${data.top5 ? `PATRONES DETECTADOS (análisis top 5 histórico): ${(data.top5.patterns || []).join(' | ')}` : ''}
${data.sales ? `VENTAS DEL MES: ${data.sales.count} ventas · ingresos ${data.sales.revenue} · por anuncios ${data.sales.byAd} · orgánico ${data.sales.organic} · top productos ${data.sales.topProducts.map((t) => t.name + ' (' + t.qty + ')').join(', ')}` : 'VENTAS: no registradas en el dashboard'}`;
  const text = await claude({
    system: systemPrompt(ctx, 'Ahora redactás el REPORTE MENSUAL que el community manager le entrega al cliente. Tono profesional, claro y positivo pero honesto; sin humo; hablá del cliente en tercera persona ("la cuenta", "el contenido") y en español neutro (evitá el voseo en este documento). Respondé SOLO con JSON válido.'),
    messages: [{ role: 'user', content: `Con estos datos escribí el reporte:\n${facts}\n\nDevolvé SOLO este JSON:\n{"headline":"una frase de titular con el resultado del mes","summary":"resumen ejecutivo de 4-6 líneas con los números clave y su lectura","wins":["logro 1 con dato","logro 2 con dato","logro 3 con dato"],"learnings":["aprendizaje 1: qué funcionó y por qué","aprendizaje 2","aprendizaje 3"],"improve":["oportunidad de mejora 1 concreta","oportunidad 2","oportunidad 3"],"next":["acción para el próximo mes 1","acción 2","acción 3","acción 4"],"closing":"cierre de 2 líneas para el cliente"}` }],
    max_tokens: 1800, temperature: 0.5,
  });
  const n = extractJSON(text);
  if (!n?.summary) throw Object.assign(new Error('La IA no devolvió el reporte; intentá de nuevo.'), { status: 502 });
  const stored = { month, generatedAt: new Date().toISOString(), narrative: n };
  await setJSON(`reports/${month}`, stored);
  return { data, narrative: n };
}
handlers.report = narrative;

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const month = url.searchParams.get('month');
    if (!MONTH_RE.test(month || '')) return error('Mes inválido (YYYY-MM)', 400);
    const [data, stored] = await Promise.all([buildReportData(month), getJSON(`reports/${month}`)]);
    return json({ data, narrative: stored?.narrative || null, narrativeAt: stored?.generatedAt || null });
  }
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const { month } = await readJSON(req);
  if (!MONTH_RE.test(month || '')) return error('Mes inválido (YYYY-MM)', 400);
  return runAsJob(req, 'report', { month });
};

export const config = { path: '/api/report' };
