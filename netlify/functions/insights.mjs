// Insights + estrategia del mes: qué funcionó, por qué, ángulos ganadores, hooks, frases con mejor
// retención, recomendaciones y el plan del mes siguiente. Background job (transcripciones + Claude).
// GET  /api/insights?month=YYYY-MM → { stored|null, stats }
// POST /api/insights { month }     → (re)genera y guarda en analysis/insights/<month>
import { json, error, readJSON, median, engagementRate, mapLimit } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, setJSON, K } from './_lib/store.mjs';
import { claude, extractJSON, transcribeUrl, buildContext, systemPrompt } from './_lib/ai.mjs';
import { handlers, runAsJob } from './_lib/jobs.mjs';
import { agg } from './report.mjs';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const key = (month) => `analysis/insights/${month}`;
const ret = (r) => (r.avg_watch_time && r.duration ? Math.min(100, Math.round(r.avg_watch_time / r.duration * 100)) : null);
const score = (r, med) => {
  const x = med ? (r.views || 0) / med : 0; const er = engagementRate(r);
  const keep = r.views ? ((r.saves || 0) + (r.shares || 0)) / r.views * 100 : 0;
  return Math.log2(1 + x) * 60 + Math.min(er, 15) * 2.5 + Math.min(keep, 5) * 3 + (ret(r) || 0) * 0.3;
};

// Reels of the month; if there are too few, widen to the last 90 days so the analysis is still useful.
function pickPeriod(all, month) {
  const inMonth = all.filter((r) => (r.date || '').slice(0, 7) === month);
  if (inMonth.length >= 3) return { reels: inMonth, label: month, widened: false };
  const end = new Date(`${month}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 90);
  const wide = all.filter((r) => r.timestamp && new Date(r.timestamp) >= start && new Date(r.timestamp) < end);
  return { reels: wide.length >= 3 ? wide : all, label: wide.length >= 3 ? '90 días' : 'histórico', widened: true };
}

async function stats(month) {
  const all = (await getJSON(K.reels, [])) || [];
  const p = pickPeriod(all, month);
  const med = median(all.map((r) => r.views).filter(Boolean));
  const withRet = p.reels.filter((r) => ret(r) != null);
  return { ...agg(p.reels), period: p.label, widened: p.widened, median: med, withRetention: withRet.length, total: all.length,
    bestRetention: withRet.length ? withRet.sort((a, b) => ret(b) - ret(a)).slice(0, 3).map((r) => ({ id: r.id, title: r.title, retention: ret(r), views: r.views })) : [] };
}

async function generate({ month }) {
  const all = (await getJSON(K.reels, [])) || [];
  if (all.length < 3) throw Object.assign(new Error('Sincronizá al menos 3 reels para generar insights.'), { status: 400 });
  const { reels, label, widened } = pickPeriod(all, month);
  const med = median(all.map((r) => r.views).filter(Boolean));
  const ranked = [...reels].sort((a, b) => score(b, med) - score(a, med));
  const top = ranked.slice(0, 6), bottom = ranked.slice(-3).filter((r) => !top.includes(r));
  const byRet = reels.filter((r) => ret(r) != null).sort((a, b) => ret(b) - ret(a)).slice(0, 4);
  // Transcripts: cached first; Supadata for the missing ones (max 6 new to keep the job short).
  let budget = 6;
  const withT = async (r, allowNew) => {
    let t = await getJSON(K.transcript(r.id));
    if (!t?.text && allowNew && budget > 0) { budget--; try { const x = await transcribeUrl(r.permalink); t = { ...x, source: 'supadata', at: new Date().toISOString() }; await setJSON(K.transcript(r.id), t); } catch (e) { t = { text: '', error: e.message }; } }
    const a = await getJSON(K.analysis(r.id));
    return { r, text: t?.text || '', analysis: a };
  };
  const topT = await mapLimit(top, 2, (r) => withT(r, true));
  const retT = await mapLimit(byRet.filter((r) => !top.includes(r)), 2, (r) => withT(r, true));
  const botT = await mapLimit(bottom, 2, (r) => withT(r, false));
  const top5 = await getJSON(K.top5);
  const goals = (await getJSON(K.goals)) || {};
  const ctx = await buildContext();
  const m = (r) => `${r.views ?? 'n/d'} vistas (${med ? ((r.views || 0) / med).toFixed(1) : '?'}× mediana ${med}) · reach ${r.reach ?? 'n/d'} · guardados ${r.saves ?? 'n/d'} · compartidos ${r.shares ?? 'n/d'} · comentarios ${r.comments ?? 0} · ER ${engagementRate(r).toFixed(2)}%${r.duration ? ` · ${Math.round(r.duration)} s` : ''}${ret(r) != null ? ` · retención ${ret(r)}% (${r.avg_watch_time.toFixed(1)} s vistos)` : ''}${r.promoted ? ' · PAUTADO' : ' · orgánico'}`;
  const block = (list, chars) => list.map((it, i) => `${i + 1}. "${it.r.title}" (${it.r.date}) — ${m(it.r)}\n   CAPTION: ${(it.r.caption || '').slice(0, 220).replace(/\n/g, ' ')}\n   TRANSCRIPCIÓN: ${it.text ? it.text.slice(0, chars).replace(/\n/g, ' ') : '(no disponible)'}${it.analysis?.hook ? `\n   ANÁLISIS PREVIO DEL HOOK: ${String(it.analysis.hook).slice(0, 200)}` : ''}`).join('\n');
  const all_ = reels.map((r) => `- ${r.date} "${r.title}" ${m(r)}`).join('\n');
  const st = agg(reels);
  const facts = `PERÍODO ANALIZADO: ${label}${widened ? ' (el mes pedido tenía menos de 3 reels, se amplió el período)' : ''} · ${reels.length} reels · ${st.views} vistas · ER ${st.er}% · retención media ${st.retention != null ? st.retention + '%' : 'n/d'} · ${st.promoted} pautados
MEDIANA HISTÓRICA DE VISTAS: ${med} · total reels de la cuenta: ${all.length}

TOP DEL PERÍODO (ranking por vistas vs mediana, engagement, guardados/compartidos y retención):
${block(topT, 2200)}

${retT.length ? `MEJOR RETENCIÓN (no incluidos arriba):\n${block(retT, 1200)}\n` : ''}
${botT.length ? `LOS QUE MENOS FUNCIONARON:\n${block(botT, 500)}\n` : ''}
TODOS LOS REELS DEL PERÍODO:
${all_}
${top5?.patterns?.length ? `\nPATRONES HISTÓRICOS YA DETECTADOS (top 5 de todos los tiempos): ${top5.patterns.join(' | ')}` : ''}`;
  const sys = systemPrompt(ctx, 'Ahora sos el analista y estratega de contenido de esta cuenta: leés los datos y las transcripciones y explicás con evidencia qué funcionó y por qué. Concreto, sin relleno, citando títulos de reels y números reales. Cuando cites frases o hooks, usá las palabras literales de las transcripciones cuando existan. Respondés SOLO con JSON válido (sin markdown), con saltos de línea escapados como \\n.');
  let analysis = null;
  for (let attempt = 0; attempt < 2 && !analysis; attempt++) {
    try {
      const text = await claude({ system: sys, messages: [{ role: 'user', content: `${facts}\n\nDevolvé SOLO este JSON:\n{"headline":"una frase con la lectura principal del período","worked":[{"title":"título del reel","metric":"el dato que lo prueba (ej. 3.2× mediana, 41% retención)","reason":"por qué funcionó en 1-2 frases"}],"why":"explicación de 4-6 líneas del patrón de fondo: qué tienen en común los que funcionaron y qué les falta a los que no (emoción, utilidad, identidad, curiosidad, prueba social, formato)","angles":[{"angle":"nombre del ángulo ganador","evidence":"qué reels lo prueban y con qué números","howToUse":"cómo explotarlo en los próximos videos"}],"hooks":[{"hook":"hook literal (primeros 3 s) o reconstruido si no hay transcripción","reel":"título del reel","why":"por qué engancha","formula":"fórmula reutilizable con huecos entre corchetes"}],"phrases":[{"phrase":"frase literal que sostiene la atención o dispara guardados/compartidos","reel":"título del reel","why":"qué hace esa frase (recontextualiza, promete, crea tensión, da el dato…)"}],"recommendations":[{"title":"recomendación corta","detail":"qué hacer exactamente y por qué, con el dato que lo respalda"}],"stop":["cosa concreta que conviene dejar de hacer 1","2"]}\n\nReglas: 3-5 elementos en worked, 3-4 en angles, 4-6 en hooks, 4-6 en phrases, 4-6 en recommendations. Si no hay transcripciones, decilo en el campo y trabajá con captions y métricas.` }], max_tokens: 4000, temperature: 0.45 });
      const j = extractJSON(text); if (j?.worked) analysis = j;
    } catch (e) { if (attempt) throw e; }
  }
  if (!analysis) throw Object.assign(new Error('La IA no devolvió los insights; intentá de nuevo.'), { status: 502 });
  // Strategy for the NEXT month, built on the analysis.
  const nextM = (() => { const [y, mo] = month.split('-').map(Number); const d = new Date(Date.UTC(y, mo, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
  let strategy = null;
  for (let attempt = 0; attempt < 2 && !strategy; attempt++) {
    try {
      const text = await claude({ system: sys, messages: [{ role: 'user', content: `INSIGHTS DEL PERÍODO ${label}:\n${JSON.stringify(analysis).slice(0, 9000)}\n\nOBJETIVOS CONFIGURADOS: ${goals.reelsPerMonth ? goals.reelsPerMonth + ' reels/mes' : 'n/d'} · ${goals.views ? 'vistas objetivo ' + goals.views : ''} · ${goals.followers ? 'seguidores objetivo ' + goals.followers : ''} · ${goals.savesPerReel ? 'guardados/reel ' + goals.savesPerReel : ''}\nNÚMEROS DEL PERÍODO: ${reels.length} reels · ${st.views} vistas · ER ${st.er}% · retención ${st.retention ?? 'n/d'}% · mediana ${med}\n\nArmá la ESTRATEGIA DEL MES ${nextM} basada en estos insights. Devolvé SOLO este JSON:\n{"objective":"objetivo principal del mes en una frase, con número","thesis":"3-4 líneas: la apuesta estratégica del mes y por qué (basada en los datos)","pillars":[{"name":"pilar/tema","share":"% del contenido","why":"por qué este peso según los datos","angles":["ángulo 1","ángulo 2"]}],"cadence":"frecuencia y días recomendados, con el porqué","formats":[{"format":"formato (ej. lista, testimonio, tutorial 30 s)","when":"para qué tipo de tema","target":"métrica esperada"}],"weeks":[{"week":1,"focus":"foco de la semana","ideas":[{"title":"título de trabajo del reel","hook":"hook literal para grabar","angle":"ángulo ganador que usa","format":"formato","cta":"CTA con palabra clave"}]}],"hooksToRepeat":["fórmula de hook 1","2","3"],"avoid":["qué no hacer 1","2","3"],"kpis":[{"name":"métrica","target":"meta concreta","why":"por qué esa meta"}],"paid":"recomendación sobre pauta: qué reel/ángulo pautar y cuál no, según lo orgánico"}\n\nReglas: 4 semanas con 2-3 ideas cada una (cubrí el objetivo de reels/mes), 3-4 pilares que sumen 100%, hooks en el tono de la marca.` }], max_tokens: 4000, temperature: 0.5 });
      const j = extractJSON(text); if (j?.weeks) strategy = j;
    } catch (e) { if (attempt) throw e; }
  }
  const stored = { month, nextMonth: nextM, period: label, widened, generatedAt: new Date().toISOString(), stats: { ...st, median: med, count: reels.length, transcripts: [...topT, ...retT].filter((x) => x.text).length }, analysis, strategy,
    reels: [...topT, ...retT].map((it) => ({ id: it.r.id, title: it.r.title, permalink: it.r.permalink, thumbnail_url: it.r.thumbnail_url, views: it.r.views, retention: ret(it.r), x: med ? +((it.r.views || 0) / med).toFixed(1) : null, promoted: !!it.r.promoted })) };
  await setJSON(key(month), stored);
  return stored;
}
handlers.insights = (params) => generate(params);

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const month = url.searchParams.get('month');
    if (!MONTH_RE.test(month || '')) return error('Mes inválido (YYYY-MM)', 400);
    const [stored, s] = await Promise.all([getJSON(key(month)), stats(month)]);
    return json({ stored: stored || null, stats: s });
  }
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const { month } = await readJSON(req);
  if (!MONTH_RE.test(month || '')) return error('Mes inválido (YYYY-MM)', 400);
  return runAsJob(req, 'insights', { month });
};

export const config = { path: '/api/insights' };
