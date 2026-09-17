// Anthropic Messages API (plain fetch, no SDK) + Supadata transcription.
import { env, engagementRate, median } from './http.mjs';
import { getJSON, K } from './store.mjs';

const MODEL = () => env('ANTHROPIC_MODEL', 'claude-sonnet-4-5');

export async function claude({ system, messages, max_tokens = 1800, temperature = 0.6 }) {
  const key = env('ANTHROPIC_API_KEY');
  if (!key || !/^sk-ant-/.test(key)) throw Object.assign(new Error('Falta una ANTHROPIC_API_KEY válida en Netlify (empieza con sk-ant-).'), { status: 500 });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL(), system, messages, max_tokens, temperature }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(`Anthropic: ${data?.error?.message || res.status}`), { status: 502 });
  return data.content?.map((c) => c.text || '').join('') || '';
}

export function extractJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return repairJSON(text);
  try { return JSON.parse(m[0]); } catch { return repairJSON(text); }
}
// Best-effort repair for model output: raw control chars inside strings, trailing commas,
// and responses cut by max_tokens (closes open strings/arrays/objects).
export function repairJSON(text) {
  const start = text.indexOf('{'); if (start < 0) return null;
  let s = text.slice(start).replace(/```/g, '');
  let out = '', inStr = false, esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch < ' ') { out += ' '; continue; }
      out += ch; continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  if (inStr) out += '"';
  // Cut a dangling `"key":` or `,` at the end, then close what is open.
  out = out.replace(/,\s*$/, '').replace(/"[^"]*"\s*:\s*$/, '').replace(/,\s*$/, '');
  const stack = []; inStr = false; esc = false;
  for (const ch of out) {
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']'); else if (ch === '}' || ch === ']') stack.pop();
  }
  out += stack.reverse().join('');
  out = out.replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(out); } catch { return null; }
}

// ---- Supadata transcription -------------------------------------------------
export async function transcribeUrl(url, lang = 'es') {
  const key = env('SUPADATA_API_KEY');
  if (!key) throw Object.assign(new Error('Falta SUPADATA_API_KEY en Netlify.'), { status: 500 });
  const headers = { 'x-api-key': key };
  const q = new URLSearchParams({ url, text: 'true', lang, mode: 'auto' });
  let res = await fetch(`https://api.supadata.ai/v1/transcript?${q}`, { headers });
  let data = await res.json().catch(() => ({}));
  if (res.status === 202 && data.jobId) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await fetch(`https://api.supadata.ai/v1/transcript/${data.jobId}`, { headers });
      data = await res.json().catch(() => ({}));
      if (data.status === 'completed' || data.content) break;
      if (data.status === 'failed') throw Object.assign(new Error('Supadata: la transcripción falló'), { status: 502 });
    }
  }
  if (!res.ok && res.status !== 202) throw Object.assign(new Error(`Supadata: ${data?.message || data?.error || res.status}`), { status: 502 });
  const content = data.content ?? data.result?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => c.text).join(' ') : '';
  return { text: text.trim(), lang: data.lang || lang };
}

export async function mediaMetadata(url) {
  const key = env('SUPADATA_API_KEY');
  if (!key) throw Object.assign(new Error('Falta SUPADATA_API_KEY en Netlify.'), { status: 500 });
  const res = await fetch(`https://api.supadata.ai/v1/metadata?url=${encodeURIComponent(url)}`, { headers: { 'x-api-key': key } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`Supadata metadata: ${data?.message || res.status}`), { status: 502 });
  // Supadata does not echo the URL back: keep the one we asked for (needed later to transcribe/open).
  return { ...data, url: data.url || url };
}

// ---- Context builders -------------------------------------------------------
export const DEFAULT_BRANDKIT = {
  owner: 'Dani Sánchez', handle: '@soydanielsanchez_',
  positioning: 'Filmmaker y estratega de contenido. Ayudo a dueños de pymes y creadores en Latinoamérica a crecer con contenido y automatizaciones con IA.',
  audience: 'Dueños de pymes, emprendedores y creadores de contenido en Latinoamérica (Costa Rica, México, Argentina, Colombia).',
  tone: 'Directo, cercano, en voseo neutro; sin humo ni promesas exageradas; ejemplos concretos y números reales.',
  pillars: ['Estrategia de contenido y reels', 'Automatización e IA para negocios', 'Producción audiovisual práctica', 'Detrás de escena / sistemas propios'],
  ctaStyle: 'Un solo CTA por video, palabra clave corta y sin tilde ("Comentá X y te lo mando").',
  avoid: ['listas con markdown en guiones', 'anglicismos innecesarios', 'prometer resultados garantizados'],
};

export async function buildContext() {
  const brand = { ...DEFAULT_BRANDKIT, ...((await getJSON(K.brandkit)) || {}) };
  const profile = await getJSON(K.profile);
  const reels = (await getJSON(K.reels, [])) || [];
  const med = median(reels.map((r) => r.views).filter(Boolean));
  const top = [...reels].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 8);
  const summary = reels.slice(0, 25).map((r) => `- ${r.date} | "${r.title}" | views ${r.views ?? 'n/d'} | reach ${r.reach ?? 'n/d'} | saves ${r.saves ?? 'n/d'} | shares ${r.shares ?? 'n/d'} | ER ${engagementRate(r).toFixed(2)}% | x${med ? ((r.views || 0) / med).toFixed(1) : '?'} mediana`).join('\n');
  return { brand, profile, reels, med, top, summary };
}

export function systemPrompt(ctx, extra = '') {
  const b = ctx.brand;
  return `Sos el estratega de contenido personal de ${b.owner} (${b.handle}) en Instagram. Respondés SIEMPRE en español rioplatense/latino con voseo, directo y concreto.

KIT DE MARCA
- Posicionamiento: ${b.positioning}
- Audiencia: ${b.audience}
- Tono: ${b.tone}
- Pilares: ${b.pillars.join('; ')}
- Estilo de CTA: ${b.ctaStyle}
- Evitar: ${b.avoid.join('; ')}

NÚMEROS ACTUALES
- Seguidores: ${ctx.profile?.followers_count ?? 'n/d'} · Reels sincronizados: ${ctx.reels.length} · Mediana de vistas: ${ctx.med || 'n/d'}
- Últimos reels (fecha | título | métricas):
${ctx.summary || '(sin reels sincronizados todavía)'}

Cuando propongas guiones: hook (0-3 s), desarrollo, CTA con palabra clave. Usá los datos reales de arriba para justificar recomendaciones (qué hooks y formatos rindieron mejor). ${extra}`;
}
