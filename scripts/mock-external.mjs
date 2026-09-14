// Mocks for Instagram, Anthropic and Supadata — used by tests and `MOCK=1 node --import ./scripts/mock-external.mjs scripts/dev-server.mjs`
const realFetch = globalThis.fetch;
const media = Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, caption: `Reel ${i}\nsegunda línea`, media_type: 'VIDEO', media_product_type: 'REELS', permalink: `https://www.instagram.com/reel/x${i}/`, thumbnail_url: `https://cdn/x${i}.jpg`, timestamp: new Date(Date.now() - i * 5 * 86400000).toISOString(), like_count: 10 * (i + 1), comments_count: i }));
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const j = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.startsWith('https://api.instagram.com/oauth/access_token')) return j({ access_token: 'short', user_id: 123, permissions: 'x' });
  if (u.includes('graph.instagram.com/access_token')) return j({ access_token: 'long', token_type: 'bearer', expires_in: 5184000 });
  if (u.includes('/me?fields')) return j({ user_id: '123', username: 'soydanielsanchez_', name: 'Dani Sánchez', followers_count: 2480, media_count: 47 });
  if (u.includes('/me/media_publish')) return j({ id: 'pub1' });
  if (u.includes('/me/media') && init?.method === 'POST') { const p = new URLSearchParams(String(init.body)); globalThis.__containers = (globalThis.__containers || []).concat([Object.fromEntries(p)]); return j({ id: 'c' + globalThis.__containers.length }); }
  if (/\/c\d+\?fields=status_code/.test(u)) return j({ status_code: 'FINISHED' });
  if (/\/pub1\?fields=permalink/.test(u)) return j({ permalink: 'https://www.instagram.com/reel/NEW1/' });
  if (u.includes('/me/media')) return j({ data: media, paging: {} });
  if (/\/m\d+\/insights/.test(u)) { const i = +u.match(/\/m(\d+)\//)[1]; return j({ data: [{ name: 'views', values: [{ value: 1000 * (i + 1) }] }, { name: 'reach', values: [{ value: 800 * (i + 1) }] }, { name: 'saved', values: [{ value: 20 * (i + 1) }] }, { name: 'shares', values: [{ value: 5 }] }, { name: 'likes', values: [{ value: 10 * (i + 1) }] }, { name: 'comments', values: [{ value: i }] }] }); }
  if (u.startsWith('https://api.supadata.ai/v1/transcript')) return j({ content: 'Hola, este es el texto del reel. Comentá IA y te lo mando.', lang: 'es' });
  if (u.startsWith('https://api.supadata.ai/v1/metadata')) return j({ platform: 'instagram', type: 'video', id: 'z', url: new URL(u).searchParams.get('url'), title: 'Comentá PDF y te paso la guía', author: { username: 'agustinbadt' }, stats: { views: 348800, likes: 9000, comments: 1200 }, media: { thumbnailUrl: 'https://cdn/t.jpg', duration: 31 }, createdAt: '2026-07-08T10:00:00Z' });
  if (u.startsWith('https://api.anthropic.com')) { const body = JSON.parse(init.body); const last = body.messages.at(-1).content; if (/"hook":"el gancho literal/.test(last)) return j({ content: [{ type: 'text', text: JSON.stringify({ title: 'V', hook: 'h', script: 's', structure: 'e', behavior: 'b', retention: 'r', why: 'w', replicate: 'rep', template: '[tema]' }) }] }); if (/"headline":"una frase/.test(last)) return j({ content: [{ type: 'text', text: JSON.stringify({ headline: 'Mes sólido', summary: 'Resumen.', wins: ['w1'], learnings: ['l1'], improve: ['i1'], next: ['n1'], closing: 'Gracias.' }) }] }); if (/"patterns":\["patrón 1"/.test(last)) return j({ content: [{ type: 'text', text: JSON.stringify({ summary: 'Los 5 comparten hooks directos.', patterns: ['Hook en 2 s', 'CTA con palabra clave'] }) }] }); const isJSON = /Devolvé SOLO un JSON/.test(last); return j({ content: [{ type: 'text', text: isJSON ? '{"hook":"Buen hook","retention":"Ok","cta":"Comentá IA","improve":"Probá X","score":72,"keyword":"IA","title":"Reel test","why":"w","onscreen":"o","body":"b","publish":"p"}' : '## Idea\n- Punto uno\n> "Hook"' }] }); }
  throw new Error('unexpected fetch ' + u);
};

