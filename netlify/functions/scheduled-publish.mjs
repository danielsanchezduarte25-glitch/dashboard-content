// Every 5 minutes: publish whatever is scheduled for now (kicks the background function).
import { env } from './_lib/http.mjs';
import { internalSecret } from './ig-sync-background.mjs';
import { getJSON, K } from './_lib/store.mjs';

export default async () => {
  const base = (env('URL') || '').replace(/\/$/, '');
  if (!base) return new Response('no URL', { status: 200 });
  const queue = (await getJSON(K.publishQueue, [])) || [];
  const due = queue.some((i) => i.status === 'scheduled' && i.scheduledAt && new Date(i.scheduledAt).getTime() <= Date.now());
  if (!due) return new Response('nothing due', { status: 200 });
  const res = await fetch(`${base}/api/publish-background`, { method: 'POST', headers: { 'x-sync-secret': internalSecret() } });
  return new Response('kicked ' + res.status, { status: 200 });
};

export const config = { schedule: '*/5 * * * *' };
