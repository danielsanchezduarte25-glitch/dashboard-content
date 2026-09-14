import { json, env } from './_lib/http.mjs';
import { getSession } from './_lib/auth.mjs';
import { getJSON, setWorkspace, getWorkspace, K } from './_lib/store.mjs';
import { DEFAULT_BRANDKIT } from './_lib/ai.mjs';

// Session + configuration status. Safe to call before login (returns authed:false).
export default async (req) => {
  const session = getSession(req);
  const cfg = {
    hasPassword: !!env('APP_PASSWORD'),
    hasAnthropic: /^sk-ant-/.test(env('ANTHROPIC_API_KEY', '')),
    hasSupadata: (env('SUPADATA_API_KEY', '') || '').length > 10,
    hasInstagramApp: !!env('IG_APP_ID') && !!env('IG_APP_SECRET'),
    hasApify: !!env('APIFY_TOKEN'),
    googleClientId: env('GOOGLE_CLIENT_ID', null),
    googleApiKey: env('GOOGLE_API_KEY', null),
  };
  if (!session) return json({ authed: false, config: { hasPassword: cfg.hasPassword } });
  const [token, profile, brandkit, goals] = await Promise.all([
    getJSON(K.igToken), getJSON(K.profile), getJSON(K.brandkit), getJSON(K.goals),
  ]);
  const ws = getWorkspace(); setWorkspace('main');
  const all = (await getJSON(K.workspaces, [])) || []; setWorkspace(ws);
  const wsInfo = ws === 'main' ? { id: 'main', name: 'Mi cuenta', handle: '' } : (({ id, name, handle, color }) => ({ id, name, handle, color }))(all.find((w) => w.id === ws) || { id: ws, name: ws });
  return json({
    authed: true,
    role: session.role || 'owner',
    workspace: wsInfo,
    workspaces: (session.role || 'owner') === 'owner' ? [{ id: 'main', name: 'Mi cuenta', handle: '' }, ...all.map(({ id, name, handle, color }) => ({ id, name, handle, color }))] : undefined,
    config: cfg,
    instagram: token ? { connected: true, user_id: token.user_id, obtained_at: token.obtained_at, expires_in: token.expires_in, permissions: token.permissions ? String(token.permissions).split(',') : null, canPublish: !token.permissions || String(token.permissions).includes('instagram_business_content_publish') } : { connected: false },
    profile: profile || null,
    brandkit: { ...DEFAULT_BRANDKIT, ...(brandkit || {}) },
    goals: goals || { followers: 30000, views: 1000000, reelsPerMonth: 16, savesPerReel: 250 },
  });
};

export const config = { path: '/api/me' };
