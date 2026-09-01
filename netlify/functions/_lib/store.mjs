// Persistence on Netlify Blobs (no external database needed).
import { getStore } from '@netlify/blobs';

let _store;
function store() {
  if (!_store) _store = getStore({ name: 'dashboard-content', consistency: 'strong' });
  return _store;
}

export async function getJSON(key, fallback = null) {
  try {
    const v = await store().get(key, { type: 'json' });
    return v ?? fallback;
  } catch (e) {
    if (process.env.NETLIFY_DEV || process.env.NODE_ENV === 'test') return memGet(key, fallback);
    throw e;
  }
}

export async function setJSON(key, value) {
  try {
    await store().setJSON(key, value);
  } catch (e) {
    if (process.env.NETLIFY_DEV || process.env.NODE_ENV === 'test') return memSet(key, value);
    throw e;
  }
  return value;
}

export async function del(key) {
  try { await store().delete(key); } catch { mem.delete(key); }
}

// In-memory fallback for local runs without Blobs.
const mem = new Map();
const memGet = (k, f) => (mem.has(k) ? mem.get(k) : f);
const memSet = (k, v) => { mem.set(k, v); return v; };

// Keys used across functions (documented in one place)
export const K = {
  igToken: 'ig/token',          // { access_token, user_id, obtained_at, expires_in }
  profile: 'ig/profile',        // { username, name, followers_count, media_count, profile_picture_url, synced_at }
  reels: 'ig/reels',            // [ { id, caption, permalink, thumbnail_url, media_url, timestamp, views, likes, comments, reach, saves, shares } ]
  followerHistory: 'ig/followers', // [ { date, count } ]
  analysis: (id) => `analysis/${id}`,
  transcript: (id) => `transcript/${id}`,
  refs: 'bangers/refs',         // [ '@cuenta' ]
  bangers: 'bangers/items',     // [ {...} ]
  scanLog: 'bangers/scanlog',
  chats: 'chat/conversations',  // [ { id, title, messages:[{role,content,ts}] } ]
  sequences: 'stories/sequences',
  events: 'calendar/events',
  goals: 'settings/goals',
  brandkit: 'settings/brandkit',
  oauthState: 'ig/oauth-state',
};
