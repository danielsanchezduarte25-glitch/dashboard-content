// Scheduled sync: every 4 hours the dashboard refreshes profile and insights on its own; the public
// counters (Apify, paid) are refreshed at most once a day by syncAll('auto'). It only kicks the background function
// (scheduled functions must finish fast; the background one may run up to 15 min).
import { env } from './_lib/http.mjs';
import { internalSecret } from './ig-sync-background.mjs';
import { getJSON, setWorkspace, K } from './_lib/store.mjs';

export default async () => {
  const base = (env('URL') || '').replace(/\/$/, '');
  if (!base) return new Response('no URL', { status: 200 });
  setWorkspace('main');
  const ids = ['main', ...((await getJSON(K.workspaces, [])) || []).map((w) => w.id)];
  for (const ws of ids) {
    setWorkspace(ws);
    if (!(await getJSON(K.igToken))) continue;
    const res = await fetch(`${base}/api/ig/sync-background?ws=${ws}`, { method: 'POST', headers: { 'x-sync-secret': internalSecret() } });
    console.log('scheduled sync kicked:', ws, res.status);
  }
  return new Response('ok', { status: 200 });
};

export const config = { schedule: '0 */4 * * *' };
