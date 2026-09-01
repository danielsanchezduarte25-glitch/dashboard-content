import { randomUUID } from 'node:crypto';
import { json, error, readJSON, streamJSON } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { getJSON, setJSON, K } from './_lib/store.mjs';
import { claude, buildContext, systemPrompt } from './_lib/ai.mjs';

// GET  /api/chat                       -> conversations
// POST /api/chat { convId?, message }  -> assistant reply (stored)
// DELETE /api/chat?id=                 -> delete conversation
export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  const convs = (await getJSON(K.chats, [])) || [];
  if (req.method === 'GET') return json({ conversations: convs });
  if (req.method === 'DELETE') {
    const id = new URL(req.url).searchParams.get('id');
    await setJSON(K.chats, convs.filter((c) => c.id !== id));
    return json({ ok: true });
  }
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const { convId, message } = await readJSON(req);
  if (!message?.trim()) return error('Mensaje vacío');
  return streamJSON(() => runChat(convs, convId, message));
};

async function runChat(convs, convId, message) {
  let conv = convs.find((c) => c.id === convId);
  if (!conv) { conv = { id: randomUUID(), title: message.trim().slice(0, 40), messages: [], created: new Date().toISOString() }; convs.unshift(conv); }
  conv.messages.push({ role: 'user', content: message.trim(), ts: new Date().toISOString() });

  const ctx = await buildContext();
  // Attach recent analyses so the strategist "knows" the reels in depth.
  const recent = ctx.reels.slice(0, 6);
  const analyses = (await Promise.all(recent.map(async (r) => { const a = await getJSON(K.analysis(r.id)); return a ? `"${r.title}": mejora sugerida → ${a.improve}` : null; }))).filter(Boolean).join('\n');
  const system = systemPrompt(ctx, `\nANÁLISIS IA RECIENTES\n${analyses || '(ninguno todavía)'}\n\nFormato: respondé con markdown ligero (títulos ##, listas cortas, citas > para hooks). Cuando el usuario pida un guion final para grabar, escribilo en prosa natural sin listas.`);
  const history = conv.messages.slice(-16).map((m) => ({ role: m.role, content: m.content }));
  const reply = await claude({ system, messages: history, max_tokens: 1800, temperature: 0.7 });
  conv.messages.push({ role: 'assistant', content: reply, ts: new Date().toISOString() });
  conv.updated = new Date().toISOString();
  await setJSON(K.chats, convs.slice(0, 60));
  return { conversation: conv };
}

export const config = { path: '/api/chat' };
