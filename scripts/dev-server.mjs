// Minimal local server: static files from public/ + Netlify Functions v2 modules routed by their `config.path`.
// Usage: APP_PASSWORD=xxx node scripts/dev-server.mjs   (persistence is in-memory while it runs)
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.NETLIFY_DEV = '1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fnDir = path.join(root, 'netlify/functions');
const routes = [];
for (const f of await readdir(fnDir)) {
  if (!f.endsWith('.mjs')) continue;
  const mod = await import(pathToFileURL(path.join(fnDir, f)).href);
  const p = mod.config?.path; if (!p) continue;
  const re = new RegExp('^' + p.replace(/\*/g, '.*').replace(/:(\w+)/g, '[^/]+') + '$');
  routes.push({ re, handler: mod.default, name: f });
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const port = Number(process.env.PORT || 8888);
process.env.URL = process.env.URL || `http://localhost:${port}`;

http.createServer(async (req, res) => {
  const url = new URL(req.url, process.env.URL);
  const route = routes.find((r) => r.re.test(url.pathname));
  try {
    if (route) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(',') : v);
      const request = new Request(url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const out = await route.handler(request, {});
      res.statusCode = out.status;
      out.headers.forEach((v, k) => res.setHeader(k, v));
      if (out.body) { const reader = out.body.getReader(); for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); } }
      return res.end();
    }
    let file = path.join(root, 'public', decodeURIComponent(url.pathname));
    if (!existsSync(file) || file.endsWith('/')) file = path.join(root, 'public', 'index.html');
    res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch (e) { console.error(e); res.statusCode = 500; res.end(JSON.stringify({ error: e.message })); }
}).listen(port, () => console.log(`dev server → ${process.env.URL}  (${routes.length} functions)`));
