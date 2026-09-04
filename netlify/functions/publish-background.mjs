// Publishes due posts (runs up to 15 min). Kicked by /api/publish and scheduled-publish.mjs.
import { env, siteUrl } from './_lib/http.mjs';
import { getSession } from './_lib/auth.mjs';
import { internalSecret } from './ig-sync-background.mjs';
import { processQueue } from './_lib/publish.mjs';

export default async (req) => {
  const ok = getSession(req) || req.headers.get('x-sync-secret') === internalSecret();
  if (!ok) return new Response('unauthorized', { status: 401 });
  const force = (new URL(req.url).searchParams.get('force') || '').split(',').filter(Boolean);
  const r = await processQueue({ base: siteUrl(req), force });
  console.log('publish queue processed', JSON.stringify(r));
  return new Response('ok', { status: 200 });
};

export const config = { path: '/api/publish-background' };
