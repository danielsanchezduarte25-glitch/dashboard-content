// Single-user auth: a password from env, an HMAC-signed HttpOnly cookie as the session.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env, error } from './http.mjs';

const COOKIE = 'dc_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  return env('SESSION_SECRET') || env('APP_PASSWORD') || 'dev-secret-change-me';
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

export function passwordMatches(candidate) {
  const expected = env('APP_PASSWORD');
  if (!expected) return false;
  const a = Buffer.from(String(candidate)), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionCookie(req) {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  const token = sign({ u: 'owner', exp: Math.floor(Date.now() / 1000) + MAX_AGE });
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getSession(req) {
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? verify(m[1]) : null;
}

// Returns a Response (401) when not authenticated, otherwise null.
export function requireAuth(req) {
  if (!env('APP_PASSWORD')) return error('APP_PASSWORD no está configurada en Netlify.', 500);
  return getSession(req) ? null : error('No autenticado', 401);
}
