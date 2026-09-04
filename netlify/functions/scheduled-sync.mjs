// Scheduled sync: every day at 06:00 Costa Rica (12:00 UTC) the dashboard refreshes profile,
// insights and the public counters on its own. It only kicks the background function
// (scheduled functions must finish fast; the background one may run up to 15 min).
import { env } from './_lib/http.mjs';
import { internalSecret } from './ig-sync-background.mjs';

export default async () => {
  const base = (env('URL') || '').replace(/\/$/, '');
  if (!base) return new Response('no URL', { status: 200 });
  const res = await fetch(`${base}/api/ig/sync-background`, { method: 'POST', headers: { 'x-sync-secret': internalSecret() } });
  console.log('scheduled sync kicked:', res.status);
  return new Response('ok', { status: 200 });
};

export const config = { schedule: '0 12 * * *' };
