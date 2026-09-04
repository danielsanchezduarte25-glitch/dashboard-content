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

// ---- Binary blobs (uploaded media for publishing) ---------------------------
const isLocal = () => process.env.NETLIFY_DEV || process.env.NODE_ENV === 'test';
export async function setBlob(key, buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  try { await store().set(key, new Blob([buf])); }
  catch (e) { if (isLocal()) return memSet(key, buf); throw e; }
}
export async function getBlob(key) { // → Buffer | null
  try {
    const ab = await store().get(key, { type: 'arrayBuffer' });
    return ab ? Buffer.from(ab) : null;
  } catch (e) {
    if (isLocal()) return memGet(key, null);
    throw e;
  }
}
export async function listKeys(prefix) {
  try { const { blobs } = await store().list({ prefix }); return blobs.map((b) => b.key); }
  catch (e) { if (isLocal()) return [...mem.keys()].filter((k) => k.startsWith(prefix)); throw e; }
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
  syncMeta: 'ig/syncmeta',      // { synced_at, public_counts, public_error, count }
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
  publishQueue: 'publish/queue', // [ { id, kind, media:[{id,type,name,size}], caption, scheduledAt, status, ... } ]
  publishLock: 'publish/lock',
  mediaMeta: (id) => `media/${id}/meta`,       // { name, type, size, parts, partSize, created }
  mediaPart: (id, n) => `media/${id}/part-${String(n).padStart(4, '0')}`,
};
