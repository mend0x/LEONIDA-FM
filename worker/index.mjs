import { createApi } from '../server/api.mjs';
import { createD1Store } from '../server/store.mjs';
import catalog from '../data/catalog.json' with { type: 'json' };
import programs from '../data/programs.json' with { type: 'json' };
import assets from 'leonida:assets';
let instance, previousBindings;
function assetResponse(request, env) {
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const pathname = new URL(request.url).pathname;
  const isRoute =
    /^\/(?:$|(?:radio|stations)(?:\/[a-z0-9-]+)?\/?$|(?:music|drive|status|settings|admin|about)\/?$)/.test(
      pathname,
    );
  const asset = assets[isRoute ? '/index.html' : pathname];
  if (!asset || !Array.isArray(asset))
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const [encoded, type, size, tag] = asset;
  const streams = (env.STREAM_HOSTS || '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => /^[a-z0-9.-]+\.[a-z]+$/.test(v))
    .map((h) => 'https://' + h)
    .join(' ');
  const security =
    "default-src 'self'; script-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.rockstargames.com https://media-rockstargames-com.akamaized.net; font-src 'self'; media-src 'self' blob: " +
    streams +
    "; connect-src 'self' " +
    streams +
    "; frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://*.chatgpt.site";
  const headers = new Headers({
    'Content-Type': type,
    'Content-Length': String(size),
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': security,
    'Permissions-Policy': 'geolocation=(),camera=(),microphone=()',
    ETag: tag,
    'Cache-Control': pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : isRoute || pathname.endsWith('.js') || pathname.endsWith('.html')
        ? 'no-cache'
        : 'public, max-age=3600, must-revalidate',
  });
  if (request.headers.get('if-none-match') === tag && !request.headers.has('range')) {
    headers.delete('Content-Length');
    return new Response(null, { status: 304, headers });
  }
  let start = 0,
    end = size - 1,
    status = 200;
  const range = request.headers.get('range');
  if (range && (!request.headers.has('if-range') || request.headers.get('if-range') === tag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const valid = match && (match[1] || match[2]);
    if (valid) {
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    }
    if (!valid || !Number.isSafeInteger(start) || start > end || start >= size) {
      headers.set('Content-Range', 'bytes */' + size);
      headers.set('Content-Length', '0');
      return new Response(null, { status: 416, headers });
    }
    status = 206;
    headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
    headers.set('Content-Length', String(end - start + 1));
  }
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  // Decode only four-character blocks covering the requested byte range.
  const block = Math.floor(start / 3),
    last = Math.ceil((end + 1) / 3);
  const raw = atob(encoded.slice(block * 4, last * 4)),
    body = new Uint8Array(end - start + 1),
    offset = start - block * 3;
  for (let i = 0; i < body.length; i++) body[i] = raw.charCodeAt(offset + i);
  return new Response(body, { status, headers });
}
export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return assetResponse(request, env);
    if (!instance || previousBindings !== env) {
      previousBindings = env;
      instance = createApi({
        catalog,
        programs,
        store: env.DB ? createD1Store(env.DB) : undefined,
        adminToken: env.ADMIN_TOKEN,
        streamHosts: env.STREAM_HOSTS,
        streamBase: env.STREAM_BASE,
        streamRightsReference: env.STREAM_RIGHTS_REFERENCE,
        broadcastStatusUrl: env.BROADCAST_STATUS_URL,
      });
    }
    return instance(request, { clientKey: request.headers.get('cf-connecting-ip') || 'edge' });
  },
};
