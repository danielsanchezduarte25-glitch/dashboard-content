import { randomBytes } from 'node:crypto';
import { error, siteUrl, env } from './_lib/http.mjs';
import { requireAuth } from './_lib/auth.mjs';
import { setJSON, K } from './_lib/store.mjs';
import { authorizeUrl } from './_lib/instagram.mjs';

// Step 1 of the Instagram login: send the owner to Instagram's consent screen.
export default async (req) => {
  const unauth = requireAuth(req); if (unauth) return unauth;
  if (!env('IG_APP_ID') || !env('IG_APP_SECRET')) return error('Configurá IG_APP_ID e IG_APP_SECRET en Netlify (ver docs/SETUP.md).', 500);
  const state = randomBytes(16).toString('hex');
  await setJSON(K.oauthState, { state, created: Date.now() });
  const redirectUri = `${siteUrl(req)}/api/ig/callback`;
  return Response.redirect(authorizeUrl(redirectUri, state), 302);
};

export const config = { path: '/api/ig/auth' };
