/**
 * Optional LOCAL ONLY personal-listening adapter for yt-dlp.
 * Never enable this adapter on a public interface. It does not bypass DRM,
 * request cookies, geo restrictions, or authentication. Use it only for
 * material that you are permitted to play this way.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const fail = (res, status, message) => {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify({ error: message }));
};
const legalCdn = (value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'googlevideo.com' || url.hostname.endsWith('.googlevideo.com'))
    );
  } catch {
    return false;
  }
};
const approvedIds = (catalog) =>
  new Set(
    (catalog.stations || [])
      .flatMap((s) =>
        (s.tracks || [])
          .filter((track) => track.confidence === 'OFFICIAL')
          .flatMap((track) => [track.youtubeId, ...(track.youtubeAlternates || [])]),
      )
      .filter((id) => typeof id === 'string' && VIDEO_ID.test(id)),
  );

export function runYtDlp(
  bin,
  args,
  { spawnProcess = spawn, timeoutMs = 30000, maxBytes = 6000000 } = {},
) {
  return new Promise((accept, reject) => {
    let settled = false,
      output = '',
      errors = '';
    const proc = spawnProcess(bin, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const done = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else accept(value);
    };
    const timer = setTimeout(() => {
      proc.kill();
      done(new Error('yt-dlp timed out'));
    }, timeoutMs);
    proc.stdout?.on('data', (buffer) => {
      output += buffer.toString();
      if (output.length > maxBytes) {
        proc.kill();
        done(new Error('yt-dlp output limit exceeded'));
      }
    });
    proc.stderr?.on('data', (buffer) => {
      if (errors.length < 4000) errors += buffer.toString().slice(0, 4000 - errors.length);
    });
    proc.on('error', (err) => done(err));
    proc.on('close', (code) => {
      if (code === 0) done(null, output.trim());
      else done(new Error('yt-dlp failed (exit ' + code + '): ' + errors.slice(-400)));
    });
  });
}

export function createLocalYtDlp({
  catalog,
  env = process.env,
  root = process.cwd(),
  execute = runYtDlp,
  fetcher = fetch,
} = {}) {
  const enabled = env.ENABLE_LOCAL_YTDLP === '1';
  const portable = resolve(root, 'tools', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  const bin = env.YTDLP_BIN || (existsSync(portable) ? portable : 'yt-dlp');
  const ids = approvedIds(catalog);
  let lastProbe = 0,
    probeOk = false,
    probeMessage = 'Not checked';
  let running = 0;
  const mediaCache = new Map();
  const inflight = new Map();
  const resolveMedia = async (id) => {
    const cached = mediaCache.get(id);
    if (cached && Date.now() < cached.expires) return cached.info;
    if (inflight.has(id)) return inflight.get(id);
    const task = (async () => {
      const stdout = await execute(
        bin,
        [
          '--ignore-config',
          '--no-playlist',
          '--no-warnings',
          '--skip-download',
          '--js-runtimes',
          'node',
          '--format',
          'bestaudio[ext=m4a]/bestaudio[ext=mp4]',
          '--dump-single-json',
          'https://www.youtube.com/watch?v=' + id,
        ],
        { timeoutMs: 35000 },
      );
      const info = JSON.parse(stdout);
      if (!legalCdn(info.url) || info.is_live || !['m4a', 'mp4'].includes(info.ext)) {
        throw new Error('No compatible unprotected M4A stream provided by yt-dlp');
      }
      if (mediaCache.size > 25) mediaCache.delete(mediaCache.keys().next().value);
      mediaCache.set(id, { info, expires: Date.now() + 120000 });
      return info;
    })();
    inflight.set(id, task);
    try {
      return await task;
    } finally {
      inflight.delete(id);
    }
  };
  const probe = async () => {
    if (!enabled)
      return { enabled: false, available: false, message: 'Local yt-dlp mode is disabled.' };
    if (Date.now() - lastProbe > 30000) {
      lastProbe = Date.now();
      try {
        const version = await execute(bin, ['--version'], { timeoutMs: 7000, maxBytes: 1000 });
        probeOk = true;
        probeMessage = 'yt-dlp ' + version.slice(0, 80);
      } catch {
        probeOk = false;
        probeMessage = 'yt-dlp not found. Install it or place yt-dlp.exe in tools/.';
      }
    }
    return { enabled, available: probeOk, message: probeMessage };
  };
  const handler = async (req, res) => {
    if (!LOOPBACK.has(req.socket.remoteAddress)) return fail(res, 403, 'Local-only service');
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(String(req.headers.host || '').split(':')[0]) &&
      !String(req.headers.host || '').startsWith('[::1]:')
    ) {
      return fail(res, 403, 'Localhost only');
    }
    if (req.headers['sec-fetch-site'] === 'cross-site')
      return fail(res, 403, 'Cross-site requests are blocked');
    if (req.method !== 'GET') return fail(res, 405, 'GET only');
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/local-audio/status') {
      const status = await probe();
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end(JSON.stringify(status));
    }
    const match = /^\/api\/local-audio\/stream\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
    if (!match) return fail(res, 404, 'Not found');
    if (!(await probe()).available) return fail(res, 503, probeMessage);
    if (!ids.has(match[1])) return fail(res, 404, 'Video not in the verified catalog');
    if (running >= 3) return fail(res, 429, 'Too many active local requests');
    ++running;
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const info = await resolveMedia(match[1]);
      if (controller.signal.aborted) return;
      const headers = {};
      for (const key of ['User-Agent', 'Referer', 'Accept', 'Accept-Language']) {
        const supplied = info.http_headers?.[key];
        if (typeof supplied === 'string') headers[key] = supplied;
      }
      if (/^bytes=\d*-\d*$/.test(req.headers.range || '')) headers.Range = req.headers.range;
      const upstream = await fetcher(info.url, {
        signal: controller.signal,
        headers,
        redirect: 'follow',
      });
      if (!upstream.ok || !upstream.body) {
        if (upstream.status === 403 || upstream.status === 410) mediaCache.delete(match[1]);
        return fail(res, 502, 'Audio CDN returned HTTP ' + upstream.status);
      }
      const responseHeaders = {
        'Content-Type': 'audio/mp4',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      };
      for (const header of ['content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(header);
        if (value) responseHeaders[header] = value;
      }
      res.writeHead(upstream.status === 206 ? 206 : 200, responseHeaders);
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (error) {
      if (!controller.signal.aborted && !res.destroyed) {
        console.warn(
          'LEONIDA local audio:',
          String(error?.message || 'Unknown extraction error')
            .replace(/https?:\/\/\S+/g, '[URL]')
            .slice(0, 240),
        );
        // Do not expose potentially sensitive extractor output or CDN URLs.
        fail(
          res,
          502,
          'Could not resolve/play this video with yt-dlp. It may be restricted or yt-dlp may need an update.',
        );
      }
    } finally {
      controller.abort();
      --running;
    }
  };
  return { probe, handler };
}
