// Public URL for uploaded media (Instagram downloads the file from here when publishing).
// Ids are random (unguessable). Supports HEAD and Range (Meta's fetcher may use both).
import { getJSON, getBlob, K } from './_lib/store.mjs';

export default async (req) => {
  const m = new URL(req.url).pathname.match(/\/media\/([a-z0-9-]{8,40})(?:\.\w+)?$/);
  if (!m) return new Response('not found', { status: 404 });
  const meta = await getJSON(K.mediaMeta(m[1]));
  if (!meta || !meta.complete) return new Response('not found', { status: 404 });
  const size = meta.size; const partSize = meta.partSize; const parts = meta.parts;
  const base = { 'content-type': meta.type, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=3600', 'content-disposition': `inline; filename="${meta.name.replace(/[^\w.-]/g, '_')}"` };
  if (req.method === 'HEAD') return new Response(null, { status: 200, headers: { ...base, 'content-length': String(size) } });
  let start = 0, end = size - 1, status = 200;
  const range = req.headers.get('range');
  if (range) {
    const r = range.match(/bytes=(\d*)-(\d*)/);
    if (r) {
      if (r[1]) start = Number(r[1]); if (r[2]) end = Number(r[2]);
      if (!r[1] && r[2]) { start = Math.max(0, size - Number(r[2])); end = size - 1; }
      end = Math.min(end, size - 1);
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
      status = 206;
    }
  }
  const length = end - start + 1;
  const id = m[1];
  const firstPart = Math.floor(start / partSize), lastPart = Math.min(parts - 1, Math.floor(end / partSize));
  let p = firstPart;
  const stream = new ReadableStream({
    async pull(controller) {
      if (p > lastPart) return controller.close();
      const buf = await getBlob(K.mediaPart(id, p));
      if (!buf) { controller.error(new Error('missing part')); return; }
      const pStart = p * partSize;
      const s = Math.max(0, start - pStart), e = Math.min(buf.length, end - pStart + 1);
      controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset + s, e - s));
      p++;
    },
  });
  const headers = { ...base, 'content-length': String(length) };
  if (status === 206) headers['content-range'] = `bytes ${start}-${end}/${size}`;
  return new Response(stream, { status, headers });
};

export const config = { path: '/media/:file' };
