import { json, error, readJSON, engagementRate, streamJSON } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, setJSON, K } from './_lib/store.mjs';
import { claude, extractJSON, transcribeUrl, buildContext, systemPrompt } from './_lib/ai.mjs';

// GET  /api/analyze?id=<mediaId>            -> stored analysis + transcript
// POST /api/analyze { id, force?, transcribe? , transcript? } -> (re)generate
export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const id = url.searchParams.get('id');
    if (!id) return error('Falta id');
    const [analysis, transcript] = await Promise.all([getJSON(K.analysis(id)), getJSON(K.transcript(id))]);
    return json({ analysis, transcript });
  }
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const body = await readJSON(req);
  return streamJSON(() => runAnalyze(body));
};

async function runAnalyze(body) {
  const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
  const reels = (await getJSON(K.reels, [])) || [];
  const reel = reels.find((r) => r.id === body.id);
  if (!reel) fail('Reel no encontrado. Sincronizá primero.', 404);

  // 1. Transcript: manual > cached > Supadata
  let transcript = await getJSON(K.transcript(reel.id));
  if (body.transcript) {
    transcript = { text: String(body.transcript).trim(), source: 'manual', at: new Date().toISOString() };
    await setJSON(K.transcript(reel.id), transcript);
  } else if (!transcript || body.transcribe) {
    try {
      const t = await transcribeUrl(reel.permalink);
      transcript = { ...t, source: 'supadata', at: new Date().toISOString() };
      await setJSON(K.transcript(reel.id), transcript);
    } catch (e) {
      if (body.transcribe) fail(e.message, e.status || 502);
      transcript = transcript || { text: '', source: 'none', error: e.message };
    }
  }
  if (body.transcribeOnly) return { transcript };

  const existing = await getJSON(K.analysis(reel.id));
  if (existing && !body.force) return { analysis: existing, transcript };

  // 2. Analysis with Claude
  const ctx = await buildContext();
  const x = ctx.med ? ((reel.views || 0) / ctx.med).toFixed(2) : 'n/d';
  const user = `Analizá este reel de ${ctx.brand.handle}. Devolvé SOLO un JSON con esta forma exacta:
{"hook": "...", "retention": "...", "cta": "...", "improve": "...", "score": 0-100, "keyword": "palabra clave sugerida para el CTA", "title": "título corto de 3-6 palabras para el reel"}

Cada campo (hook, retention, cta, improve) es un párrafo de 2-4 frases, concreto, citando el texto real del video y los números. "improve" propone un hook alternativo textual y un cambio de estructura o CTA. Sin markdown.

DATOS DEL REEL
- Fecha: ${reel.date}
- Caption: ${reel.caption || '(sin caption)'}
- Views: ${reel.views ?? 'n/d'} (${x}× la mediana de la cuenta, mediana = ${ctx.med || 'n/d'})
- Reach: ${reel.reach ?? 'n/d'} · Likes: ${reel.likes} · Comentarios: ${reel.comments} · Guardados: ${reel.saves ?? 'n/d'} · Compartidos: ${reel.shares ?? 'N/A'}
- ER: ${engagementRate(reel).toFixed(2)}%
- Transcripción: ${transcript?.text ? `"""${transcript.text}"""` : '(no disponible: analizá con el caption y las métricas, y decilo en el hook)'}`;
  const text = await claude({ system: systemPrompt(ctx, 'Sos analista de reels: evaluás hook, retención y CTA con criterio de creador profesional.'), messages: [{ role: 'user', content: user }], max_tokens: 1400, temperature: 0.4 });
  const parsed = extractJSON(text) || { hook: text, retention: '', cta: '', improve: '' };
  const analysis = { ...parsed, at: new Date().toISOString(), model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5', hadTranscript: !!transcript?.text };
  await setJSON(K.analysis(reel.id), analysis);
  return { analysis, transcript };
}

export const config = { path: '/api/analyze' };
