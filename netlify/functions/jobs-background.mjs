// Runs one job (up to 15 min). Kicked internally by runAsJob(); never called by the browser.
import { readJSON } from './_lib/http.mjs';
import { internalSecret, executeJob } from './_lib/jobs.mjs';
// Importing the owners registers their job handlers.
import './bangers.mjs';
import './analyze.mjs';
import './chat.mjs';
import './top5.mjs';
import './report.mjs';
import './insights.mjs';

export default async (req) => {
  if (req.headers.get('x-sync-secret') !== internalSecret()) return new Response('unauthorized', { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  const { kind, params, ws } = await readJSON(req);
  await executeJob(id, kind, params, ws || 'main');
  return new Response('ok', { status: 200 });
};

export const config = { path: '/api/jobs-background' };
