import { siteUrl } from './_lib/http.mjs';
import { getJSON, del, getWorkspace, K } from './_lib/store.mjs';
import { exchangeCode } from './_lib/instagram.mjs';
import { getSession } from './_lib/auth.mjs';
import { internalSecret, runSync } from './ig-sync-background.mjs';
import { isLocal } from './_lib/jobs.mjs';

// Step 2: Instagram redirects here with ?code=...&state=...
export default async (req) => {
  const url = new URL(req.url);
  const base = siteUrl(req);
  getSession(req); // scopes storage to the workspace that started the login
  const fail = (msg) => Response.redirect(`${base}/?ig_error=${encodeURIComponent(msg)}`, 302);
  const err = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (err) return fail(err);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const saved = await getJSON(K.oauthState);
  if (!code || !saved || saved.state !== state || Date.now() - saved.created > 15 * 60 * 1000) return fail('Estado de OAuth inválido o vencido. Volvé a intentar.');
  await del(K.oauthState);
  try {
    await exchangeCode(code.replace(/#_$/, ''), `${base}/api/ig/callback`);
    // First sync in the background so the dashboard fills in while the user lands.
    if (isLocal()) await runSync({});
    else try { await fetch(`${base}/api/ig/sync-background?ws=${getWorkspace()}`, { method: 'POST', headers: { 'x-sync-secret': internalSecret() } }); } catch (e) { console.warn('initial sync kick failed', e.message); }
    return Response.redirect(`${base}/?connected=1`, 302);
  } catch (e) {
    return fail(e.message);
  }
};

export const config = { path: '/api/ig/callback' };
