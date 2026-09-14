import { json, error, readJSON } from './_lib/http.mjs';
import { resolveLogin, sessionCookie, clearCookie } from './_lib/auth.mjs';

export default async (req) => {
  if (req.method === 'DELETE') return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
  if (req.method !== 'POST') return error('Método no permitido', 405);
  const { password } = await readJSON(req);
  const who = await resolveLogin(password || '');
  if (!who) {
    await new Promise((r) => setTimeout(r, 600)); // slow down brute force
    return error('Contraseña incorrecta', 401);
  }
  return json({ ok: true, ...who }, 200, { 'set-cookie': sessionCookie(req, who) });
};

export const config = { path: '/api/login' };
