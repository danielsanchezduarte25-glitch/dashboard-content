// Every 5 minutes: publish whatever is scheduled for now (kicks the background function).
import { env } from './_lib/http.mjs';
import { internalSecret } from './ig-sync-background.mjs';
import { getJSON, setWorkspace, K } from './_lib/store.mjs';

export default async () => {
  const base = (env('URL') || '').replace(/\/$/, '');
  if (!base) return new Response('no URL', { status: 200 });
  setWorkspace('main');
  const ids = ['main', ...((await getJSON(K.workspaces, [])) || []).map((w) => w.id)];
  let kicked = 0;
  for (const ws of ids) {
    setWorkspace(ws);
    const queue = (await getJSON(K.publishQueue, [])) || [];
    const due = queue.some((i) => i.status === 'scheduled' && i.scheduledAt && new Date(i.scheduledAt).getTime() <= Date.now());
    if (!due) continue;
    await fetch(`${base}/api/publish-background?ws=${ws}`, { method: 'POST', headers: { 'x-sync-secret': internalSecret() } });
    kicked++;
  }
  return new Response('kicked ' + kicked, { status: 200 });
};

export const config = { schedule: '*/5 * * * *' };
