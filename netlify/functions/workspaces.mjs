// Workspaces = clients. Each has its own password, Instagram connection, reels, sales, etc.
// GET  /api/workspaces                         → { current, role, list (owner only) }
// POST /api/workspaces { action:'create', name, handle, password }
// POST /api/workspaces { action:'update', id, name?, handle?, password? }
// POST /api/workspaces { action:'delete', id }
// POST /api/workspaces { action:'switch', id }  → new session cookie (owner only)
import { json, error, readJSON } from './_lib/http.mjs';
import { requireAuth, getSession, sessionCookie, hashPassword } from './_lib/auth.mjs';
import { getJSON, setJSON, setWorkspace, K } from './_lib/store.mjs';
import { DEFAULT_BRANDKIT } from './_lib/ai.mjs';

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

async function list() { setWorkspace('main'); return (await getJSON(K.workspaces, [])) || []; }
const pub = (w) => ({ id: w.id, name: w.name, handle: w.handle, color: w.color, created: w.created });

export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  const session = getSession(req);
  const cur = session.ws || 'main';
  const all = await list();
  const me = cur === 'main' ? { id: 'main', name: 'Mi cuenta', handle: '' } : pub(all.find((w) => w.id === cur) || { id: cur, name: cur });
  setWorkspace(cur);
  if (req.method === 'GET') return json({ current: me, role: session.role, list: session.role === 'owner' ? all.map(pub) : undefined });
  if (req.method !== 'POST') return error('Método no permitido', 405);
  if (session.role !== 'owner') return error('Solo el dueño del panel administra los workspaces.', 403);
  const body = await readJSON(req);
  if (body.action === 'switch') {
    const id = body.id === 'main' ? 'main' : all.find((w) => w.id === body.id)?.id;
    if (!id) return error('Workspace no encontrado', 404);
    return json({ ok: true, ws: id }, 200, { 'set-cookie': sessionCookie(req, { ws: id, role: 'owner' }) });
  }
  if (body.action === 'create') {
    const name = String(body.name || '').trim(); if (!name) return error('Ponele nombre al cliente');
    if (String(body.password || '').length < 6) return error('La contraseña del cliente necesita al menos 6 caracteres');
    let id = slug(name) || 'cliente'; let n = 2; while (all.some((w) => w.id === id) || id === 'main') id = `${slug(name)}-${n++}`;
    const w = { id, name, handle: String(body.handle || '').replace(/^@/, '').trim(), pass: hashPassword(body.password), color: body.color || null, created: new Date().toISOString() };
    all.push(w); setWorkspace('main'); await setJSON(K.workspaces, all);
    // Seed the client's brand kit so the AI talks about them, not about the owner.
    setWorkspace(id);
    await setJSON(K.brandkit, { ...DEFAULT_BRANDKIT, owner: name, handle: w.handle ? '@' + w.handle : '', positioning: '', audience: '', pillars: [] });
    setWorkspace('main');
    return json({ ok: true, workspace: pub(w), list: all.map(pub) });
  }
  if (body.action === 'update') {
    const w = all.find((x) => x.id === body.id); if (!w) return error('Workspace no encontrado', 404);
    if (body.name) w.name = String(body.name).trim();
    if (body.handle != null) w.handle = String(body.handle).replace(/^@/, '').trim();
    if (body.password) { if (String(body.password).length < 6) return error('Mínimo 6 caracteres'); w.pass = hashPassword(body.password); }
    setWorkspace('main'); await setJSON(K.workspaces, all);
    return json({ ok: true, workspace: pub(w), list: all.map(pub) });
  }
  if (body.action === 'delete') {
    const rest = all.filter((x) => x.id !== body.id);
    if (rest.length === all.length) return error('Workspace no encontrado', 404);
    setWorkspace('main'); await setJSON(K.workspaces, rest);
    // Data stays in storage under ws/<id>/ (recoverable); the login stops working immediately.
    return json({ ok: true, list: rest.map(pub) });
  }
  return error('Acción desconocida', 400);
};

export const config = { path: '/api/workspaces' };
