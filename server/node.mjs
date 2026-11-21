import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { realpath, stat, lstat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApi } from './api.mjs';
import { createNodeStore } from './node-store.mjs';
import { createLocalYtDlp } from './local-ytdlp.mjs';
import { createFreeRadio } from './free-radio.mjs';
import { createSongLibrary, isAudioFilename } from './song-library.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const readProjectJson = (name) =>
  JSON.parse(readFileSync(new URL('../data/' + name, import.meta.url), 'utf8'));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.opus': 'audio/ogg',
};

export function createLocalApi(options = {}) {
  const env = options.env ?? process.env;
  const store =
    options.store ??
    createNodeStore(
      options.databasePath ?? env.DATABASE_PATH ?? resolve(projectRoot, '.local/leonida.sqlite'),
    );
  const api = createApi({
    catalog: options.catalog ?? readProjectJson('catalog.json'),
    programs: options.programs ?? readProjectJson('programs.json'),
    store,
    adminToken: env.ADMIN_TOKEN,
    streamHosts: env.STREAM_HOSTS,
    streamBase: env.STREAM_BASE,
    streamRightsReference: env.STREAM_RIGHTS_REFERENCE,
    broadcastStatusUrl: env.BROADCAST_STATUS_URL,
    onError: (error) =>
      console.error(
        'LEONIDA API request failed:',
        error instanceof Error ? error.name : 'unknown error',
      ),
    ...options,
  });
  api.close = () => store.close?.();
  return api;
}

function securityHeaders(env) {
  const hosts = (env.STREAM_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter((host) => /^[a-z0-9.-]+\.[a-z]+$/.test(host));
  const extra = hosts.map((host) => 'https://' + host).join(' ');
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.rockstargames.com https://media-rockstargames-com.akamaized.net; font-src 'self'; media-src 'self' blob: https: " +
      extra +
      "; connect-src 'self' " +
      extra +
      "; frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
  };
}
function finish(res, status, text, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(text);
}
function inDirectory(base, path) {
  const suffix = relative(base, path);
  return (
    suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith('..' + sep))
  );
}
function rangeFor(input, size) {
  const result = /^bytes=(\d*)-(\d*)$/.exec(input);
  if (!result || (!result[1] && !result[2]) || size < 1) return null;
  const a = result[1] ? Number(result[1]) : null,
    b = result[2] ? Number(result[2]) : null;
  if ((a !== null && !Number.isSafeInteger(a)) || (b !== null && !Number.isSafeInteger(b)))
    return null;
  const start = a ?? Math.max(0, size - b),
    end = a === null ? size - 1 : Math.min(b ?? size - 1, size - 1);
  return start <= end && start >= 0 && start < size ? { start, end } : null;
}
async function serveAsset(req, res, url, directory) {
  if (!['GET', 'HEAD'].includes(req.method))
    return finish(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return finish(res, 400, 'Invalid path');
  }
  if (
    pathname.includes('\\') ||
    Array.from(pathname).some((character) => character.charCodeAt(0) < 32) ||
    pathname.split('/').some((part) => part.startsWith('.')) ||
    /^\/(server|api|stream|node_modules)(\/|$)/.test(pathname)
  )
    return finish(res, 404, 'Not found');
  const base = await realpath(directory).catch(() => null);
  if (!base) return finish(res, 503, 'Build the web application with npm run build.');
  let filename = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!inDirectory(base, filename)) return finish(res, 404, 'Not found');
  let info = await stat(filename).catch(() => null);
  if (
    !info?.isFile() &&
    !extname(pathname) &&
    !/^\/(audio|art|assets|fonts)(\/|$)/.test(pathname)
  ) {
    filename = resolve(base, 'index.html');
    info = await stat(filename).catch(() => null);
  }
  if (!info?.isFile()) return finish(res, 404, 'Not found');
  filename = await realpath(filename);
  if (!inDirectory(base, filename)) return finish(res, 404, 'Not found');
  const suffix = extname(filename).toLowerCase();
  const etag = '"' + info.size.toString(16) + '-' + Math.floor(info.mtimeMs).toString(16) + '"';
  const cache =
    pathname.startsWith('/assets/') && /-[a-zA-Z0-9_-]{8,}\./.test(filename)
      ? 'public, max-age=31536000, immutable'
      : ['.html', '.js', '.webmanifest'].includes(suffix)
        ? 'no-cache'
        : 'public, max-age=3600, must-revalidate';
  const headers = {
    'Content-Type': types[suffix] ?? 'application/octet-stream',
    'Cache-Control': cache,
    ETag: etag,
    'Accept-Ranges': 'bytes',
  };
  if (req.headers['if-none-match'] === etag && !req.headers.range) {
    res.writeHead(304, headers);
    return res.end();
  }
  const range =
    req.headers.range && (!req.headers['if-range'] || req.headers['if-range'] === etag)
      ? req.headers.range
      : null;
  const bounds = range ? rangeFor(range, info.size) : null;
  if (range && !bounds)
    return finish(res, 416, 'Requested range not satisfiable', {
      'Content-Range': 'bytes */' + info.size,
    });
  if (bounds)
    headers['Content-Range'] = 'bytes ' + bounds.start + '-' + bounds.end + '/' + info.size;
  headers['Content-Length'] = bounds ? bounds.end - bounds.start + 1 : info.size;
  res.writeHead(bounds ? 206 : 200, headers);
  if (req.method === 'HEAD') return res.end();
  await pipeline(createReadStream(filename, bounds ?? {}), res);
}
export function createNodeHandler(options = {}) {
  const env = options.env ?? process.env;
  const api = options.api ?? createLocalApi(options);
  const freeRadio = options.freeRadio ?? createFreeRadio();
  const songLibrary =
    options.songLibrary ??
    createSongLibrary({
      catalog: options.catalog ?? readProjectJson('catalog.json'),
      root: options.songLibraryRoot ?? resolve(projectRoot, 'canciones'),
    });
  const localAudio = createLocalYtDlp({
    catalog: options.catalog ?? readProjectJson('catalog.json'),
    env,
  });
  const base = resolve(options.distDir ?? env.DIST_DIR ?? resolve(projectRoot, 'dist'));
  const staticRoot = existsSync(resolve(base, 'client/index.html'))
    ? resolve(base, 'client')
    : base;
  const headers = securityHeaders(env);
  const canonicalOrigin = env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).origin : null;
  async function handler(req, res, next) {
    try {
      if (next && !/^\/api(?:[/?]|$)/.test(req.url)) return next();
      const origin =
        canonicalOrigin ?? (req.socket.encrypted ? 'https://' : 'http://') + req.headers.host;
      // Treat the request target as a path, never as an authority override.
      if (!req.url.startsWith('/') || req.url.startsWith('//'))
        return finish(res, 400, 'Invalid request target');
      const url = new URL(req.url, origin);
      // Locally stored music is NEVER a proxy for external URLs. Serve only catalog
      // stations, regular audio files, and only to listeners on this PC.
      const songIndex = /^\/api\/song-library\/([a-z0-9-]+)$/.exec(url.pathname);
      const songFile = /^\/canciones\/([a-z0-9-]+)\/([^/]+)$/.exec(url.pathname);
      if (songIndex || songFile) {
        for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
        const peer = req.socket.remoteAddress || '';
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer))
          return finish(res, 403, 'Local music is available only from this computer');
        if (songIndex) {
          if (req.method !== 'GET' && req.method !== 'HEAD')
            return finish(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
          const data = await songLibrary.list(songIndex[1]);
          if (!data) return finish(res, 404, 'Unknown station');
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
        }
        const slug = songFile[1];
        let filename;
        try {
          filename = decodeURIComponent(songFile[2]);
        } catch {
          return finish(res, 400, 'Malformed filename');
        }
        if (!songLibrary.hasStation(slug) || !isAudioFilename(filename))
          return finish(res, 404, 'Audio not found');
        // Reject symlinked media even when the target stays inside this library.
        const localInfo = await lstat(resolve(songLibrary.root, slug, filename)).catch(() => null);
        if (!localInfo?.isFile()) return finish(res, 404, 'Audio not found');
        // Reuse the hardened static asset handler with byte ranges and traversal checks.
        const assetUrl = new URL(
          `http://localhost/${encodeURIComponent(slug)}/${encodeURIComponent(filename)}`,
        );
        return await serveAsset(req, res, assetUrl, songLibrary.root);
      }
      if (url.pathname.startsWith('/api/local-audio/')) return await localAudio.handler(req, res);
      const freeRadioMatch = /^\/api\/free-radio\/stations\/([a-z0-9-]+)$/.exec(url.pathname);
      if (freeRadioMatch) {
        for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
        return await freeRadio.handler(req, res, freeRadioMatch[1]);
      }
      for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
      if (url.pathname !== '/api' && !url.pathname.startsWith('/api/'))
        return await serveAsset(req, res, url, staticRoot);
      const controller = new AbortController();
      res.once('close', () => {
        if (!res.writableEnded) controller.abort();
      });
      const init = { method: req.method, headers: req.headers, signal: controller.signal };
      if (!['GET', 'HEAD'].includes(req.method))
        Object.assign(init, { body: Readable.toWeb(req), duplex: 'half' });
      const forwarded = req.headers['x-real-ip'];
      const peer =
        env.TRUST_PROXY === '1' && typeof forwarded === 'string' && isIP(forwarded)
          ? forwarded
          : req.socket.remoteAddress;
      const result = await api(new Request(url, init), { clientKey: peer });
      res.writeHead(result.status, Object.fromEntries(result.headers));
      if (result.body) await pipeline(Readable.fromWeb(result.body), res);
      else res.end();
    } catch (error) {
      if (
        res.destroyed ||
        error?.name === 'AbortError' ||
        error?.code === 'ERR_STREAM_PREMATURE_CLOSE'
      )
        return;
      if (!res.headersSent) finish(res, 500, 'Internal server error');
      else res.destroy();
    }
  }
  handler.api = api;
  handler.close = () => api.close?.();
  return handler;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  const handler = createNodeHandler();
  await handler.api.ready();
  const server = createServer(handler);
  // Continues polling when no listener is visiting the station.
  const monitorTimer = process.env.BROADCAST_STATUS_URL
    ? setInterval(() => {
        void handler.api.refresh().catch(() => {});
      }, 15000)
    : null;
  monitorTimer?.unref();
  server.on('close', () => {
    clearInterval(monitorTimer);
    handler.close();
  });
  process.on('SIGTERM', () => server.close());
  process.on('SIGINT', () => server.close());
  server.listen(port, host, () =>
    console.log('LEONIDA FM listening on http://' + host + ':' + server.address().port),
  );
}
