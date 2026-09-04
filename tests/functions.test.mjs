// End-to-end test of the functions with external APIs mocked (Instagram, Anthropic, Supadata).
// Run: npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.APP_PASSWORD = 'secret';
process.env.SESSION_SECRET = 's3cret';
process.env.IG_APP_ID = 'app'; process.env.IG_APP_SECRET = 'shh';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test'; process.env.SUPADATA_API_KEY = 'sd-test';
process.env.URL = 'https://dc.test';

await import('../scripts/mock-external.mjs');
const req = (path, { method = 'GET', body, cookie } = {}) => new Request('https://dc.test' + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const text = async (res) => JSON.parse((await res.text()).trim());
let cookie;

before(async () => {
  const login = (await import('../netlify/functions/login.mjs')).default;
  const res = await login(req('/api/login', { method: 'POST', body: { password: 'secret' } }));
  assert.equal(res.status, 200); cookie = res.headers.get('set-cookie').split(';')[0];
  const bad = await login(req('/api/login', { method: 'POST', body: { password: 'nope' } }));
  assert.equal(bad.status, 401);
});

test('auth guard', async () => {
  const me = (await import('../netlify/functions/me.mjs')).default;
  assert.equal((await text(await me(req('/api/me')))).authed, false);
  assert.equal((await text(await me(req('/api/me', { cookie })))).authed, true);
  const reels = (await import('../netlify/functions/reels.mjs')).default;
  assert.equal((await reels(req('/api/reels'))).status, 401);
});

test('instagram oauth + sync + reels', async () => {
  const auth = (await import('../netlify/functions/ig-auth.mjs')).default;
  const r = await auth(req('/api/ig/auth', { cookie }));
  assert.equal(r.status, 302); const loc = new URL(r.headers.get('location'));
  assert.ok(loc.href.startsWith('https://www.instagram.com/oauth/authorize'));
  assert.equal(loc.searchParams.get('redirect_uri'), 'https://dc.test/api/ig/callback');
  const cb = (await import('../netlify/functions/ig-callback.mjs')).default;
  const r2 = await cb(req(`/api/ig/callback?code=abc&state=${loc.searchParams.get('state')}`));
  assert.equal(r2.status, 302); assert.match(r2.headers.get('location'), /connected=1/);
  const reels = (await import('../netlify/functions/reels.mjs')).default;
  const d = await text(await reels(req('/api/reels', { cookie })));
  assert.equal(d.reels.length, 6); assert.equal(d.profile.username, 'soydanielsanchez_');
  assert.equal(d.reels[0].views, 1000); assert.equal(d.reels[0].saves, 20); assert.ok(d.kpis.reachTotal > 0); assert.equal(d.monthly.length, 9);
  const sync = (await import('../netlify/functions/ig-sync.mjs')).default;
  const s = await text(await sync(req('/api/ig/sync', { method: 'POST', cookie })));
  assert.equal(s.started, true); assert.equal(s.inline, true);
  const st = await text(await sync(req('/api/ig/sync', { cookie })));
  assert.equal(st.sync.count, 6); assert.ok(st.sync.synced_at); assert.ok(!st.sync.running);
});

test('analyze: transcript + claude', async () => {
  const an = (await import('../netlify/functions/analyze.mjs')).default;
  const d = await text(await an(req('/api/analyze', { method: 'POST', cookie, body: { id: 'm0' } })));
  assert.equal(d.analysis.hook, 'Buen hook'); assert.equal(d.transcript.source, 'supadata'); assert.equal(d.analysis.hadTranscript, true);
  const g = await text(await an(req('/api/analyze?id=m0', { cookie })));
  assert.equal(g.analysis.score, 72);
  const m = await text(await an(req('/api/analyze', { method: 'POST', cookie, body: { id: 'm1', transcript: 'texto manual', transcribeOnly: true } })));
  assert.equal(m.transcript.source, 'manual');
  const nf = await text(await an(req('/api/analyze', { method: 'POST', cookie, body: { id: 'nope' } })));
  assert.equal(nf.status, 404);
});

test('chat keeps conversations', async () => {
  const chat = (await import('../netlify/functions/chat.mjs')).default;
  const a = await text(await chat(req('/api/chat', { method: 'POST', cookie, body: { message: 'Dame ideas' } })));
  assert.equal(a.conversation.messages.length, 2); assert.match(a.conversation.messages[1].content, /Idea/);
  const b = await text(await chat(req('/api/chat', { method: 'POST', cookie, body: { convId: a.conversation.id, message: 'más' } })));
  assert.equal(b.conversation.messages.length, 4);
  const list = await text(await chat(req('/api/chat', { cookie })));
  assert.equal(list.conversations.length, 1);
});

test('bangers: refs, urls, adapt', async () => {
  const bg = (await import('../netlify/functions/bangers.mjs')).default;
  const r = await text(await bg(req('/api/bangers', { method: 'POST', cookie, body: { action: 'refs', refs: ['agustinbadt', 'https://www.instagram.com/matias.jorda/'] } })));
  assert.deepEqual(r.refs, ['@agustinbadt', '@matias.jorda']);
  const u = await text(await bg(req('/api/bangers', { method: 'POST', cookie, body: { action: 'urls', urls: ['https://www.instagram.com/reel/abc/'] } })));
  assert.equal(u.added.length, 1); assert.equal(u.bangers[0].account, '@agustinbadt'); assert.equal(u.bangers[0].views, 348800); assert.equal(u.bangers[0].score, null);
  const scan = await text(await bg(req('/api/bangers', { method: 'POST', cookie, body: { action: 'scan' } })));
  assert.ok(scan.scanlog.every((l) => l.ok === false)); // no APIFY_TOKEN → logged, not thrown
  const ad = await text(await bg(req('/api/bangers', { method: 'POST', cookie, body: { action: 'adapt', id: u.bangers[0].id } })));
  assert.equal(ad.adapted.hook, 'Buen hook');
  const del = await bg(req('/api/bangers?id=' + u.bangers[0].id, { method: 'DELETE', cookie }));
  assert.equal((await text(del)).bangers.length, 0);
});

test('data store whitelist + size', async () => {
  const data = (await import('../netlify/functions/data.mjs')).default;
  assert.equal((await data(req('/api/data?key=hack', { cookie }))).status, 400);
  await data(req('/api/data?key=goals', { method: 'PUT', cookie, body: { value: { followers: 1 } } }));
  assert.equal((await text(await data(req('/api/data?key=goals', { cookie })))).value.followers, 1);
});

test('publish: chunked upload, media serving, queue and publishing', async () => {
  const up = (await import('../netlify/functions/media-upload.mjs')).default;
  const serve = (await import('../netlify/functions/media-serve.mjs')).default;
  const pub = (await import('../netlify/functions/publish.mjs')).default;
  const bin = (path, body) => new Request('https://dc.test' + path, { method: 'POST', headers: { cookie, 'content-type': 'application/octet-stream' }, body });
  const a = Buffer.alloc(10, 1), b = Buffer.alloc(5, 2);
  let r = await text(await up(bin('/api/media/upload?id=m-test0001&part=0&parts=2&name=v.mp4&type=video/mp4&size=15', a)));
  assert.equal(r.complete, false);
  assert.equal((await serve(new Request('https://dc.test/media/m-test0001.mp4'))).status, 404);
  r = await text(await up(bin('/api/media/upload?id=m-test0001&part=1&parts=2&name=v.mp4&type=video/mp4&size=15', b)));
  assert.equal(r.complete, true);
  const full = await serve(new Request('https://dc.test/media/m-test0001.mp4'));
  assert.equal(full.status, 200); assert.equal(full.headers.get('content-length'), '15');
  assert.deepEqual([...Buffer.from(await full.arrayBuffer())], [...a, ...b]);
  const part = await serve(new Request('https://dc.test/media/m-test0001.mp4', { headers: { range: 'bytes=8-11' } }));
  assert.equal(part.status, 206); assert.deepEqual([...Buffer.from(await part.arrayBuffer())], [1, 1, 2, 2]);
  const bad = await up(bin('/api/media/upload?id=m-test0002&part=0&parts=1&name=x.png&type=image/png&size=3', b));
  assert.equal(bad.status, 415);
  // save as draft, then publish now (inline in tests)
  const item = { id: 'p-test0001', kind: 'reel', media: [{ id: 'm-test0001', type: 'video/mp4', name: 'v.mp4', size: 15 }], caption: 'Hola', shareToFeed: true };
  let s = await text(await pub(req('/api/publish', { method: 'POST', cookie, body: { action: 'save', item } })));
  assert.equal(s.queue[0].status, 'draft');
  s = await text(await pub(req('/api/publish', { method: 'POST', cookie, body: { action: 'now', id: 'p-test0001' } })));
  const done = s.queue.find((x) => x.id === 'p-test0001');
  assert.equal(done.status, 'published'); assert.equal(done.permalink, 'https://www.instagram.com/reel/NEW1/');
  const c = globalThis.__containers.at(-1);
  assert.equal(c.media_type, 'REELS'); assert.equal(c.video_url, 'https://dc.test/media/m-test0001.mp4'); assert.equal(c.caption, 'Hola');
  // delete removes media
  s = await text(await pub(req('/api/publish?id=p-test0001', { method: 'DELETE', cookie })));
  assert.equal(s.queue.length, 0);
  assert.equal((await serve(new Request('https://dc.test/media/m-test0001.mp4'))).status, 404);
});
