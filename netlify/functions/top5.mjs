// Top 5 videos: which reels work best and WHY — script, structure, behaviour, retention,
// why people like them and how to replicate them. Runs as a background job (transcripts + Claude).
// GET  /api/top5          → stored report
// POST /api/top5 {force?} → (re)generate
import { json, error, readJSON, median, engagementRate } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, setJSON, K } from './_lib/store.mjs';
import { claude, extractJSON, transcribeUrl, buildContext, systemPrompt } from './_lib/ai.mjs';
import { handlers, runAsJob } from './_lib/jobs.mjs';

// Score = views vs median (60%) + engagement (25%) + saves+shares per view (15%) → ranks "what works".
function rank(reels, med) {
  const score = (r) => {
    const x = med ? (r.views || 0) / med : 0;
    const er = engagementRate(r);
    const keep = r.views ? ((r.saves || 0) + (r.shares || 0)) / r.views * 100 : 0;
    return Math.log2(1 + x) * 60 + Math.min(er, 15) * 2.5 + Math.min(keep, 5) * 3;
  };
  return [...reels].filter((r) => r.views).map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s).slice(0, 5).map((x) => x.r);
}

async function generate({ force = false } = {}) {
  const reels = (await getJSON(K.reels, [])) || [];
  if (reels.length < 3) throw Object.assign(new Error('Sincronizá al menos 3 reels para analizar el top 5.'), { status: 400 });
  const med = median(reels.map((r) => r.views).filter(Boolean));
  const top = rank(reels, med);
  // Transcripts (cached; Supadata for the missing ones)
  const items = [];
  for (const r of top) {
    let t = await getJSON(K.transcript(r.id));
    if (!t?.text) {
      try { const x = await transcribeUrl(r.permalink); t = { ...x, source: 'supadata', at: new Date().toISOString() }; await setJSON(K.transcript(r.id), t); }
      catch (e) { t = { text: '', source: 'none', error: e.message }; }
    }
    items.push({ reel: r, transcript: t.text || '' });
  }
  const ctx = await buildContext();
  const fmtR = (r) => `views ${r.views ?? 'n/d'} (${med ? ((r.views || 0) / med).toFixed(1) : '?'}× la mediana ${med}) · reach ${r.reach ?? 'n/d'} · likes ${r.likes ?? 0} · comentarios ${r.comments ?? 0} · guardados ${r.saves ?? 'n/d'} · compartidos ${r.shares ?? 'n/d'} · ER ${engagementRate(r).toFixed(2)}%${r.duration ? ` · duración ${Math.round(r.duration)} s` : ''}${r.avg_watch_time ? ` · tiempo medio de visualización ${r.avg_watch_time.toFixed(1)} s${r.duration ? ` (${Math.min(100, Math.round(r.avg_watch_time / r.duration * 100))}% de retención)` : ''}` : ' · retención: no disponible en la API'}${r.promoted ? ' · PAUTADO (parte de las vistas es pagada)' : ' · 100% orgánico'}`;
  const block = items.map((it, i) => `### VIDEO ${i + 1} — "${it.reel.title}" (${it.reel.date})\nMÉTRICAS: ${fmtR(it.reel)}\nCAPTION: ${(it.reel.caption || '').slice(0, 400)}\nTRANSCRIPCIÓN: ${it.transcript ? it.transcript.slice(0, 2500) : '(sin transcripción disponible; analizá con caption y métricas)'}`).join('\n\n');
  const text = await claude({
    system: systemPrompt(ctx, 'Ahora sos analista de contenido: explicás con datos por qué ciertos videos funcionan y cómo replicarlos. Sé concreto, sin relleno.'),
    messages: [{ role: 'user', content: `Estos son los 5 reels que mejor funcionan de la cuenta (ordenados de mejor a peor por un score de vistas vs. mediana, engagement y guardados/compartidos).\n\n${block}\n\nDevolvé SOLO un JSON válido con esta forma exacta:\n{"summary":"3-4 líneas: qué tienen en común los 5 y la lección principal","patterns":["patrón 1","patrón 2","patrón 3","patrón 4"],"items":[{"index":1,"title":"título corto","hook":"el gancho literal de los primeros 3 s y por qué funciona","script":"guion resumido en 4-8 líneas, en el orden en que se dice","structure":"estructura por bloques con segundos aproximados, p. ej. 0-3 s gancho · 3-15 s contexto · 15-40 s valor · 40-45 s CTA","behavior":"lectura de las métricas: qué hizo la audiencia (vio, guardó, compartió, comentó) y qué significa","retention":"análisis de retención con el dato disponible (tiempo medio / duración) o, si no hay dato, la retención estimada por la estructura y qué la sostiene","why":"por qué a la gente le gusta más este video (emoción, utilidad, identidad, curiosidad, prueba social…)","replicate":"receta para replicarlo: fórmula del hook, formato, duración, ritmo, CTA — como instrucciones accionables","template":"plantilla de guion lista para grabar una nueva versión sobre otro tema, con los huecos entre corchetes"}]}` }],
    max_tokens: 4500, temperature: 0.5,
  });
  const data = extractJSON(text);
  if (!data?.items) throw Object.assign(new Error('La IA no devolvió un análisis válido; intentá de nuevo.'), { status: 502 });
  const report = { generatedAt: new Date().toISOString(), median: med, summary: data.summary, patterns: data.patterns || [], items: items.map((it, i) => ({ id: it.reel.id, title: it.reel.title, permalink: it.reel.permalink, thumbnail_url: it.reel.thumbnail_url, date: it.reel.date, views: it.reel.views, x: med ? +((it.reel.views || 0) / med).toFixed(1) : null, er: +engagementRate(it.reel).toFixed(2), saves: it.reel.saves, shares: it.reel.shares, comments: it.reel.comments, duration: it.reel.duration, avg_watch_time: it.reel.avg_watch_time, retention: it.reel.avg_watch_time && it.reel.duration ? Math.min(100, Math.round(it.reel.avg_watch_time / it.reel.duration * 100)) : null, promoted: !!it.reel.promoted, hasTranscript: !!it.transcript, ai: data.items.find((x) => x.index === i + 1) || data.items[i] || {} })) };
  await setJSON(K.top5, report);
  return report;
}
handlers.top5 = (params) => generate(params);

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  if (req.method === 'GET') return json({ report: await getJSON(K.top5) });
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const body = await readJSON(req);
  return runAsJob(req, 'top5', { force: !!body.force });
};

export const config = { path: '/api/top5' };
